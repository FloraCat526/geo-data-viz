#!/usr/bin/env python3
"""Build one selected flat-map visualization from a data file and visual spec."""
import argparse
import json
import tempfile
from pathlib import Path

from build_errors import BuildError, diagnostic, read_object
from build_map_html import build as build_gl
from build_effect_html import build as build_effect

VIZ_EFFECTS = ('points', 'category-points', 'point-color', 'bubble', 'cluster', 'heatmap',
               'line', 'fill', 'extrusion', 'flight', 'pulse', 'radar', 'hexagon')
SPECIAL_OPTIONS = {
    'flight': set(), 'pulse': set(),
    'radar': {'radiusMeters', 'period', 'sweepAngle', 'opacity', 'color'},
    'hexagon': {'cellSize', 'aggregation', 'valueField', 'heightScale'},
}
COMMON_OPTIONS = {'effect', 'provider', 'title', 'theme', 'locale', 'detailFields', 'basemap'}


def build(data_path, spec_path, out, *, provider=None, token_env=None, config_path=None):
    spec = read_object(Path(spec_path), 'Visualization spec')
    effect = spec.get('effect')
    if effect not in VIZ_EFFECTS:
        raise BuildError('UNKNOWN_VISUALIZATION', 'Choose a supported visualization effect.',
                         'Use one of: ' + ', '.join(VIZ_EFFECTS))
    if effect == 'category-points':
        if spec.get('colorBy', 'category') != 'category':
            raise BuildError('CATEGORY_COLOR_REQUIRED', 'Category points require categorical color.',
                             'Set colorBy to category or choose point-color for numeric color.')
        normalized = {**spec, 'effect': 'points', 'colorBy': 'category'}
        with tempfile.TemporaryDirectory() as temp:
            mapped = Path(temp) / 'category-spec.json'
            mapped.write_text(json.dumps(normalized, ensure_ascii=False), encoding='utf-8')
            result = build_gl(data_path, mapped, out, provider=provider,
                              token_env=token_env, config_path=config_path)
        result['effects'][0] = 'category-points'
        return result
    if effect not in SPECIAL_OPTIONS:
        return build_gl(data_path, spec_path, out, provider=provider,
                        token_env=token_env, config_path=config_path)

    if provider and spec.get('provider') and provider != spec['provider']:
        raise BuildError('PROVIDER_CONFLICT', 'CLI and spec request different providers.',
                         'Align the requested provider before generating.')
    unknown = set(spec) - COMMON_OPTIONS - SPECIAL_OPTIONS[effect]
    if unknown:
        raise BuildError('UNSUPPORTED_VISUAL_OPTIONS', 'The selected component does not use some spec options.',
                         'Check references/visualizations.md for the component input and options.')
    config = read_object(Path(config_path), 'Authorized config') if config_path else {}
    if not isinstance(config, dict):
        raise BuildError('INVALID_PROVIDER_CONFIG', 'Authorized config must be a JSON object.',
                         'Use a configuration object for the selected provider.')
    selected = provider or spec.get('provider') or config.get('provider') or (
        'mapbox' if token_env or config.get('mapboxToken') else 'maplibre')
    if selected != 'maplibre':
        raise BuildError('PROVIDER_COMPONENT_REQUIRED',
                         f'Keep the requested {selected} provider; this component needs its own verified implementation.',
                         'Use the selected provider capability reference; do not substitute a MapLibre component.')
    if token_env or config_path:
        raise BuildError('UNUSED_PROVIDER_CONFIG', 'This MapLibre component does not use a map Key.',
                         'Remove the unrelated credential source or select its intended provider explicitly.')
    path = build_effect(data_path, out, effect=effect, title=spec.get('title', '地图可视化'),
                        theme=spec.get('theme', 'dark'), locale=spec.get('locale', 'zh-CN'),
                        detail_fields=spec.get('detailFields', ()),
                        radius_meters=spec.get('radiusMeters', 18000), scan_period=spec.get('period', 6000),
                        sweep_angle=spec.get('sweepAngle', 100), opacity=spec.get('opacity', .58), color=spec.get('color', '#38bdf8'),
                        cell_size=spec.get('cellSize', 500), aggregation=spec.get('aggregation', 'count'),
                        value_field=spec.get('valueField'), height_scale=spec.get('heightScale', 10),
                        basemap=spec.get('basemap'))
    return {'html': str(path.resolve()), 'provider': 'maplibre', 'effects': [effect],
            'verification': 'pending-browser'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', type=Path)
    parser.add_argument('--spec', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--provider', choices=('maplibre', 'mapbox', 'google', 'baidu', 'amap', 'tencent'))
    parser.add_argument('--token-env')
    parser.add_argument('--config', type=Path)
    args = parser.parse_args()
    try:
        result = build(args.data, args.spec, args.out, provider=args.provider,
                       token_env=args.token_env, config_path=args.config)
    except (ValueError, TypeError, KeyError, OSError) as exc:
        parser.exit(2, diagnostic(exc))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
