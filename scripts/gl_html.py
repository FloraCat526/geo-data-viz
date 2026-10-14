#!/usr/bin/env python3
"""Package profiled WGS84 data and an agent-authored visual spec into local HTML."""
import argparse
import html
import json
import math
import os
import re
from pathlib import Path
from visual_bundle import bundle_visualizations
from profile_geo import validate_geometry, spatial_summary
from build_errors import BuildError, read_object, diagnostic
from visual_spec import validate_color, validate_spec_keys, validate_point_style, EFFECT_KEYS
from ui_locale import localize_template
from html_template import TEMPLATE
from basemap_config import normalize_basemap

SDK_VERSION = '3.28.1'
MAPLIBRE_VERSION = '5.24.0'
RUNTIMES = {
    'mapbox': {'provider':'mapbox', 'label':'Mapbox', 'version':SDK_VERSION,
               'js':f'https://api.mapbox.com/mapbox-gl-js/v{SDK_VERSION}/mapbox-gl.js',
               'css':f'https://api.mapbox.com/mapbox-gl-js/v{SDK_VERSION}/mapbox-gl.css',
               'global':'mapboxgl', 'style':'mapbox://styles/mapbox/dark-v11', 'requiresKey':True,
               'basemap':'Mapbox', 'styles':{'dark':'mapbox://styles/mapbox/dark-v11','light':'mapbox://styles/mapbox/light-v11'}},
    'maplibre': {'provider':'maplibre', 'label':'MapLibre + OpenFreeMap', 'version':MAPLIBRE_VERSION,
                 'js':f'https://unpkg.com/maplibre-gl@{MAPLIBRE_VERSION}/dist/maplibre-gl.js',
                 'css':f'https://unpkg.com/maplibre-gl@{MAPLIBRE_VERSION}/dist/maplibre-gl.css',
                 'global':'maplibregl', 'style':'https://tiles.openfreemap.org/styles/dark',
                 'requiresKey':False, 'basemap':'OpenFreeMap', 'styles':{'dark':'https://tiles.openfreemap.org/styles/dark','light':'https://tiles.openfreemap.org/styles/positron'}}
}
EFFECTS = {'point-color': {'Point'}, 'points': {'Point'}, 'bubble': {'Point'}, 'cluster': {'Point'}, 'heatmap': {'Point'},
           'line': {'LineString', 'MultiLineString'}, 'fill': {'Polygon', 'MultiPolygon'},
           'extrusion': {'Polygon', 'MultiPolygon'}}


def inline_json(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False).replace('<', r'\u003c').replace('\u2028', r'\u2028').replace('\u2029', r'\u2029')


def build(data_path, spec_path, output, token_env=None, *, provider='mapbox', browser_token=None):
    if provider not in RUNTIMES:
        raise ValueError('This HTML packager supports Mapbox and MapLibre only; retain the requested provider and use its capability reference to generate native code.')
    runtime = dict(RUNTIMES[provider])
    if output.exists():
        raise BuildError('OUTPUT_EXISTS', 'Output already exists; choose a new path to preserve existing work.', 'Choose a new output filename.')
    data = read_object(data_path, 'Data')
    spec = read_object(spec_path, 'Spec')
    validate_spec_keys(spec)
    locale = spec.get('locale', 'zh-CN')
    if locale not in ('zh-CN', 'en'):
        raise BuildError('LOCALE_CONFIG', 'Unsupported locale.', 'Use zh-CN or en.')
    theme = spec.get('theme', 'dark')
    if theme not in ('dark', 'light') or not isinstance(spec.get('themeSwitcher', True), bool):
        raise BuildError('THEME_CONFIG', 'theme must be dark or light; themeSwitcher must be boolean.', 'Set theme to dark/light and optionally themeSwitcher to false for a fixed appearance.')
    basemap = normalize_basemap(spec.get('basemap'), provider=provider, theme=theme)
    runtime['styles'] = {t: normalize_basemap(spec.get('basemap'), provider=provider, theme=t)['styleUrl'] for t in ('dark','light')}
    runtime['style'] = basemap['styleUrl']
    if basemap['type'] != 'vector':
        runtime['basemap'] = 'Terrain' if basemap['type'] == 'terrain' else 'Satellite imagery'
    elif (spec.get('basemap') or {}).get('styleUrl'):
        runtime['basemap'] = 'Custom vector style'
    layout = spec.get('layout', 'explore')
    aggregation = spec.get('aggregation', 'none')
    if not isinstance(spec.get('showRecords', False), bool):
        raise BuildError('PRESENTATION_CONFIG', 'showRecords must be boolean.', 'Use false for dense grids or route networks.')
    detail_fields = spec.get('detailFields', [])
    if layout not in ('explore','presentation','report') or aggregation not in ('none','sum','mean'):
        raise BuildError('PRESENTATION_CONFIG', 'Invalid layout or aggregation.', 'Use explore/presentation/report; aggregation none/sum/mean must match metric semantics.')
    if not isinstance(detail_fields, list) or any(not isinstance(d,dict) or set(d)-{'field','label'} or not isinstance(d.get('field'),str) or not isinstance(d.get('label',d.get('field')),str) or d['field']=='__viz' for d in detail_fields):
        raise BuildError('DETAIL_FIELDS', 'detailFields must explicitly name display fields.', 'Use an array of {field, label}; only necessary scalar fields are embedded.')
    if len({d['field'] for d in detail_fields}) != len(detail_fields):
        raise BuildError('DETAIL_FIELDS', 'Duplicate detail fields.', 'Select each display field once.')
    if any(key in spec and not isinstance(spec[key],str) for key in ('dataDescription','subtitle','recordLabel','metricLabel')):
        raise BuildError('SPEC_TEXT', 'dataDescription and subtitle must be text.', 'Separate dataset context from effect-specific descriptions.')
    if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list) or not data['features']:
        raise BuildError('EMPTY_DATA', 'No features to render.', 'Profile the source and inspect invalidRows or the active filter.')
    metadata = data.get('metadata') or {}
    if not isinstance(metadata, dict) or not isinstance(metadata.get('source', {}), dict) or not isinstance(metadata.get('source', {}).get('crsResolution', {}), dict) or metadata.get('dataCrs') != 'wgs84' or metadata.get('status') == 'needs_crs' or metadata.get('source', {}).get('crsResolution', {}).get('action') == 'unresolved':
        raise BuildError('CRS_UNRESOLVED', 'Input must be profiled with verified WGS84 coordinates; transform other datums first.', 'Resolve source CRS conflicts; transform coordinates or document a verified declaration correction.')
    if not isinstance(spec.get('title'), str) or not isinstance(spec.get('description'), str):
        raise BuildError('SPEC_DESCRIPTION_REQUIRED', 'Spec requires title and description explaining the actual data and choice.', 'Add string title and description fields.')
    token = (browser_token if browser_token is not None else os.environ.get(token_env, '') if token_env else '') if runtime['requiresKey'] else ''
    if runtime['requiresKey'] and token_env and not token:
        raise BuildError('TOKEN_MISSING', 'The explicitly selected Token environment variable is empty.', 'Populate the explicitly authorized variable or use an authorized config file.')
    if token and (not isinstance(token, str) or not token.startswith('pk.')):
        raise BuildError('TOKEN_TYPE', 'Only a browser public Mapbox Token is accepted; never embed a secret token.', 'Use an authorized pk. browser token.')
    if provider == 'mapbox' and basemap['type'] != 'vector' and not token:
        raise BuildError('TOKEN_MISSING', 'Mapbox imagery and terrain require an explicitly authorized public browser Token.', 'Provide an authorized Mapbox credential source before generating this basemap.')
    # Explicitly project presentation fields; unrelated source properties stay local.
    clean, points, ids = [], [], set()
    for f in data['features']:
        if not isinstance(f, dict) or not isinstance(f.get('id'), str) or f['id'] in ids:
            raise BuildError('FEATURE_ID', 'Unique normalized feature IDs required.', 'Run profile_geo.py and preserve its normalized IDs.')
        ids.add(f['id'])
        try:
            coords, _ = validate_geometry(f.get('geometry'))
        except ValueError:
            raise BuildError('INVALID_GEOMETRY', 'A feature has invalid geometry.', 'Inspect profile invalidRows; fix coordinates or ring structure.') from None
        points.extend(coords)
        props = f.get('properties') or {}
        if not isinstance(props, dict) or not isinstance(props.get('__viz', {}), dict):
            raise BuildError('VIZ_FIELDS', 'Normalized properties.__viz must be an object.', 'Run profile_geo.py to bind display fields.')
        viz = props.get('__viz', {})
        if any(viz.get(k) is not None and not isinstance(viz[k], str) for k in ('label','category','time')):
            raise BuildError('VIZ_FIELDS', 'Display label/category/time must be strings or null.', 'Use normalized __viz fields from profile_geo.py.')
        value = viz.get('value')
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value)):
            raise BuildError('VIZ_VALUE', 'Normalized metric must be a finite number or null.', 'Normalize numeric strings explicitly; preserve zero and represent missing values as null.')
        details = []
        for d in detail_fields:
            value = props.get(d['field'])
            if value is not None and (not isinstance(value,(str,int,float,bool)) or isinstance(value,float) and not math.isfinite(value)):
                raise BuildError('DETAIL_FIELDS', 'Detail values must be finite scalars.', 'Select scalar fields; do not embed nested objects.')
            details.append({'label':d.get('label',d['field']),'value':value})
        clean.append({'type': 'Feature', 'id': f['id'], 'geometry': f['geometry'],
                      'properties': {'__viz': {k: viz.get(k) for k in ('value', 'label', 'category', 'time')}, 'details': details}})
    if any(not any(d['field'] in (f.get('properties') or {}) for f in data['features']) for d in detail_fields):
        raise BuildError('DETAIL_FIELDS', 'A selected detail field does not exist.', 'Use field names from the input profile.')
    if basemap['type'] != 'vector' and any(abs(point[1]) > 85.051129 for point in points):
        raise BuildError('BASEMAP_PROJECTION', 'XYZ imagery and DEM terrain require Mercator coordinates within ±85.051129°.', 'Use a supported globe/polar renderer for polar data or select a suitable geographic subset.')
    if not isinstance(spec.get('alternatives', []), list) or any(not isinstance(alt, dict) for alt in spec.get('alternatives', [])):
        raise BuildError('SPEC_ALTERNATIVES', 'Alternatives must be an array of objects.', 'Provide an effect and its explicit mapping in each alternative.')
    for config in [spec, *spec.get('alternatives', [])]:
        if 'heatIntensity' in config and (not isinstance(config['heatIntensity'], (int,float)) or isinstance(config['heatIntensity'],bool) or not 0 < config['heatIntensity'] <= 10):
            raise BuildError('HEAT_INTENSITY', 'heatIntensity must be in (0, 10].', 'Use a positive finite number up to 10.')
    allowed = sorted(EFFECT_KEYS)
    base = {k: spec[k] for k in allowed if k in spec}
    configs = [base]
    for alt in spec.get('alternatives', []):
        # Alternative mappings must be explicit; do not inherit heat or height semantics.
        configs.append({**{k: base[k] for k in ('title','sourceLabel','unit') if k in base},
                        **{k: alt[k] for k in allowed if k in alt}})
    values = [f['properties']['__viz']['value'] for f in clean]
    nums = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)]
    if aggregation!='none' and (not nums or not spec.get('unit')):
        raise BuildError('METRIC_REQUIRED', 'Aggregation requires finite metrics and unit.', 'Choose sum only for additive metrics, mean only for meaningful unweighted means.')
    for c in configs:
        validate_point_style(c)
        if c.get('blendMode') == 'additive' and any(abs(f['geometry']['coordinates'][1]) > 85.051129 for f in clean):
            raise BuildError('POINT_PROJECTION', 'Additive points require Mercator latitudes within ±85.051129°.', 'Use globe mode for polar data or choose normal circle rendering.')
        for key in ('maxRadius','heatRadius','lineWidth'):
            if key in c and (isinstance(c[key],bool) or not isinstance(c[key],(float,int)) or not math.isfinite(c[key]) or not 0<c[key]<=100):
                raise BuildError('VISUAL_SIZE', 'Visual sizes must be finite in (0, 100].', 'Provide positive pixel sizes up to 100; preserve numeric encoding.')
        if any(k in c and not isinstance(c[k], str) for k in ('title','description','sourceLabel','unit')):
            raise BuildError('SPEC_TEXT', 'Title, description, sourceLabel and unit must be strings.', 'Use human-readable text for these fields.')
        effect = c.get('effect')
        if not isinstance(effect, str) or effect not in EFFECTS or any(f['geometry']['type'] not in EFFECTS[effect] for f in clean):
            raise BuildError('GEOMETRY_EFFECT_MISMATCH', 'Effect and geometries do not match; transform or select the intended geometry layer first.', 'Select the intended geometry layer or change the effect.')
        color_by = validate_color(c, clean)
        metric = effect in {'bubble','extrusion','point-color'} or color_by == 'value' or (effect == 'heatmap' and c.get('weight') == 'value')
        if metric and (not nums or not c.get('unit')):
            raise BuildError('METRIC_REQUIRED', 'Metric effects require finite values and a unit (dimensionless metrics may say dimensionless).', 'Bind --value-field and unit; use points or fill with colorBy constant/category when no metric exists.')
        if effect == 'heatmap' and c.get('weight') not in {'count','value'}:
            raise BuildError('HEAT_WEIGHT_REQUIRED', 'Heatmap requires explicit count or value weight.', 'Set weight to count or value with appropriate semantics.')
        if effect == 'bubble' and any(v < 0 for v in nums) and c.get('sizeMode') != 'absolute':
            raise BuildError('SIGNED_SIZE', 'Signed bubbles require explicit absolute size with sign encoding.', 'Use sizeMode absolute with sign color or a diverging point-color map.')
        if (effect == 'extrusion' or (effect == 'heatmap' and c.get('weight') == 'value')) and any(v < 0 for v in nums):
            raise BuildError('NEGATIVE_WEIGHT', 'Negative height/heat contribution is unsupported.', 'Use a signed color map instead of negative height or density.')
        if effect == 'extrusion':
            scale = c.get('heightScale')
            if isinstance(scale, bool) or not isinstance(scale, (float,int)) or not math.isfinite(scale) or scale <= 0 or any(not math.isfinite(v*scale) for v in nums):
                raise BuildError('HEIGHT_SCALE', 'Extrusion needs finite positive metres-per-unit heightScale and finite heights.', 'Specify a finite positive heightScale and verify the derived heights.')
    if any(c.get('blendMode') == 'additive' for c in configs):
        runtime['supplements'] = ['https://unpkg.com/deck.gl@9.1.14/dist.min.js']
    payload = {'data': {'type':'FeatureCollection','metadata':{'dataCrs':'wgs84'},'features':clean},
               'ui':{'locale':locale,'showRecords':spec.get('showRecords',False),'layout':layout,'aggregation':aggregation,'dataDescription':spec.get('dataDescription',''),'subtitle':spec.get('subtitle',''),'recordLabel':spec.get('recordLabel',''),'metricLabel':spec.get('metricLabel','')},
               'appearance':{'theme':theme,'themeSwitcher':spec.get('themeSwitcher',True)}, 'basemap':basemap, 'configs':configs, 'view':spatial_summary(points), 'token':token, 'runtime':runtime}
    assets = Path(__file__).resolve().parents[1]/'assets'
    shared = assets/'shared'
    module = bundle_visualizations(assets.parent)
    module += '\n' + (shared/'view-model.mjs').read_text(encoding='utf-8')
    module += '\n' + (shared/'gl-theme.mjs').read_text(encoding='utf-8')
    if '</script' in module.lower():
        raise ValueError('Recipe cannot be safely embedded as an inline module.')
    substitutions = {'THEME':theme, 'LAYOUT':layout, 'TITLE': html.escape(base['title']), 'SDK_VERSION': SDK_VERSION, 'MODULE': module, 'PAYLOAD': inline_json(payload)}
    document = re.sub(r'__(TITLE|SDK_VERSION|MODULE|PAYLOAD|THEME|LAYOUT)__', lambda match: substitutions[match.group(1)], localize_template(TEMPLATE, locale))
    license_text = (Path(__file__).resolve().parents[1] / 'LICENSE').read_text(encoding='utf-8')
    notice = '<!--\nGeo Data Viz template and bundled code\n' + license_text + '\nThird-party SDKs, basemaps and input data retain their own terms.\n-->\n'
    document = document.replace('<!doctype html>', '<!doctype html>\n' + notice, 1)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8') as target:
        target.write(document)
    return {'html':str(output.resolve()), 'features':len(clean), 'effects':[c['effect'] for c in configs],
            'provider':provider, 'basemap':runtime['basemap'], 'basemapType':basemap['type'], 'sdkVersion':runtime['version'],
            'verification':'pending-browser' if token or not runtime['requiresKey'] else 'pending-key',
            'containsBrowserToken':bool(token), 'theme':theme, 'themeSwitcher':spec.get('themeSwitcher',True)}




def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('data',type=Path);p.add_argument('--spec',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    p.add_argument('--token-env',help='Explicitly authorized environment variable containing a public browser Token')
    args=p.parse_args()
    try:
        result=build(args.data,args.spec,args.out,token_env=args.token_env)
    except (ValueError,OSError,KeyError,TypeError) as exc:
        p.exit(2, diagnostic(exc))
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    main()
