"""Validate supported color semantics before producing HTML."""
import math
import re
from build_errors import BuildError


def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def validate_color(spec, features):
    def fail():
        raise BuildError('COLOR_SCALE', 'Color mapping has an invalid mode, domain, breaks or palette.', 'Use constant color, categorical domain/colors, continuous numeric stops/colors, or ordered breaks with one extra color; colors are #RRGGBB.')
    by = spec.get('colorBy', 'value' if spec['effect'] in {'point-color', 'bubble', 'fill', 'extrusion'} else 'constant')
    if by not in {'constant', 'category', 'value'}:
        fail()
    if spec['effect'] == 'heatmap' and by != 'constant':
        fail()
    if spec['effect'] == 'point-color' and by != 'value':
        fail()
    for key in ('color', 'missingColor'):
        if key in spec and (not isinstance(spec[key], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', spec[key])):
            fail()
    values = [f['properties']['__viz']['value'] for f in features if finite(f['properties']['__viz']['value'])]
    if spec['effect'] == 'bubble' and any(v < 0 for v in values) and by != 'value':
        fail()
    scale = spec.get('colorScale', {})
    if not isinstance(scale, dict):
        fail()
    if by == 'constant':
        if 'colorScale' in spec:
            fail()
        return by
    mode = scale.get('type', 'categorical' if by == 'category' else 'continuous')
    domain, colors, breaks = scale.get('domain'), scale.get('colors'), scale.get('breaks')
    if by == 'category':
        categories = {f['properties']['__viz']['category'] for f in features if f['properties']['__viz']['category'] is not None}
        domain = sorted(categories) if domain is None else domain
        if mode != 'categorical' or not isinstance(domain, list) or not domain or any(not isinstance(v, str) for v in domain) or len(set(domain)) != len(domain) or not categories.issubset(domain):
            fail()
        count = len(domain)
        if colors is None and count > 12:
            fail()
    elif mode == 'continuous':
        if domain is not None and (not isinstance(domain, list) or len(domain) < 2 or any(not finite(v) for v in domain) or any(a >= b for a,b in zip(domain,domain[1:])) and not (len(domain)==2 and domain[0]==domain[1])):
            fail()
        count = len(domain) if domain is not None else (3 if values and min(values)<0<max(values) else 2)
        if colors is None and count not in (2,3):
            fail()
    elif mode == 'threshold':
        if not isinstance(breaks,list) or not breaks or any(not finite(v) for v in breaks) or any(a>=b for a,b in zip(breaks,breaks[1:])) or colors is None:
            fail()
        count = len(breaks)+1
    else:
        fail()
    if colors is not None and (not isinstance(colors,list) or len(colors)!=count or any(not isinstance(c,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',c) for c in colors)):
        fail()
    return by


POINT_KEYS = {'pointRadius','opacity','glow','glowRadius','glowIntensity','blendMode'}
EFFECT_KEYS = {'title','description','sourceLabel','effect','unit','weight','sizeMode','heightScale','colorBy','colorScale','color','missingColor','maxRadius','heatRadius','heatIntensity','bubbleEntrance','lineWidth'} | POINT_KEYS
SPEC_KEYS = EFFECT_KEYS | {'provider','theme','themeSwitcher','layout','aggregation','showRecords','detailFields','dataDescription','subtitle','recordLabel','metricLabel','alternatives','locale','basemap'}

def validate_spec_keys(spec):
    from difflib import get_close_matches
    def check(obj, allowed, path):
        if not isinstance(obj, dict):
            return
        unknown = set(obj) - allowed
        if unknown:
            key = sorted(unknown)[0]
            suggestion = get_close_matches(key, sorted(allowed), n=1)
            hint = f"Did you mean {suggestion[0]}?" if suggestion else 'Use documented visualSpec fields.'
            raise BuildError('UNKNOWN_SPEC_FIELD', f'Unknown field {path}.{key}.', hint)
    check(spec, SPEC_KEYS, 'spec')
    for i, alt in enumerate(spec.get('alternatives', []) if isinstance(spec.get('alternatives', []), list) else []):
        check(alt, EFFECT_KEYS, f'alternatives[{i}]')
    for obj in [spec, *(spec.get('alternatives', []) if isinstance(spec.get('alternatives', []), list) else [])]:
        if isinstance(obj, dict):
            if 'bubbleEntrance' in obj and not isinstance(obj['bubbleEntrance'], bool):
                raise BuildError('BUBBLE_ENTRANCE', 'bubbleEntrance must be boolean.', 'Use true or false.')
            check(obj.get('colorScale'), {'type','domain','colors','breaks'}, 'colorScale')


def validate_point_style(spec):
    present = POINT_KEYS.intersection(spec)
    if not present:
        return
    if spec.get('effect') not in {'points', 'point-color'}:
        raise BuildError('POINT_APPEARANCE', 'Point appearance options require a scatter-point effect.', 'Use points, category-points or point-color; other components do not accept these fields.')
    for key in ('pointRadius', 'glowRadius'):
        if key in spec and (not finite(spec[key]) or not 0 < spec[key] <= 100):
            raise BuildError('POINT_APPEARANCE', f'{key} must be a finite pixel value in (0, 100].', 'Use a positive number up to 100.')
    for key in ('opacity', 'glowIntensity'):
        if key in spec and (not finite(spec[key]) or not 0 <= spec[key] <= 1):
            raise BuildError('POINT_APPEARANCE', f'{key} must be a finite number in [0, 1].', 'Use a number between zero and one.')
    if 'glow' in spec and not isinstance(spec['glow'], bool):
        raise BuildError('POINT_APPEARANCE', 'glow must be boolean.', 'Use true or false.')
    if 'blendMode' in spec and spec['blendMode'] not in ('normal', 'additive'):
        raise BuildError('POINT_APPEARANCE', 'blendMode must be normal or additive.', 'Use normal for native circle rendering or additive for the declared deck.gl supplement.')
