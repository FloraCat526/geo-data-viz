#!/usr/bin/env python3
"""Create an editable native Remotion + MapLibre project without reducing data to scene.json."""
import argparse
import datetime as dt
import hashlib
import json
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from build_errors import BuildError, diagnostic, read_object
from build_scene_video import run_project

ROOT = Path(__file__).resolve().parents[1]
ISO_TIME = re.compile(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$')
DEPTHS = {'Point': 0, 'MultiPoint': 1, 'LineString': 1, 'MultiLineString': 2,
          'Polygon': 2, 'MultiPolygon': 3}


def fail(code, message, suggestion):
    raise BuildError(code, message, suggestion)


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def geometry_points(geometry, latitude_limit=85):
    if not isinstance(geometry, dict) or geometry.get('type') not in DEPTHS:
        fail('GEOJSON_GEOMETRY', 'Unsupported or missing GeoJSON geometry.',
             'Use Point, MultiPoint, LineString, MultiLineString, Polygon or MultiPolygon.')
    def walk(value, depth):
        if not isinstance(value, list) or not value:
            fail('GEOJSON_COORDINATES', 'Geometry coordinates must be nonempty arrays.', 'Repair the source geometry.')
        if depth:
            for child in value:
                yield from walk(child, depth - 1)
        else:
            if len(value) not in (2, 3) or not all(finite(v) for v in value) or not (-180 <= value[0] <= 180 and -latitude_limit <= value[1] <= latitude_limit):
                fail('GEOJSON_COORDINATES', f'Expected finite WGS84 longitude/latitude within ±180° / ±{latitude_limit}°.',
                     'Confirm the source CRS; transform coordinates before using this MapLibre template.')
            yield value[:2]
    yield from walk(geometry.get('coordinates'), DEPTHS[geometry['type']])


def validate_data(data, crs=None, *, background=False):
    if data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list) or not data['features']:
        fail('GEOJSON_DATA', 'Expected a nonempty GeoJSON FeatureCollection.', 'Convert the supplied records to GeoJSON and retain their properties.')
    metadata = data.get('metadata') or {}
    if not isinstance(metadata, dict):
        fail('GEOJSON_METADATA', 'metadata must be an object.', 'Use metadata.dataCrs="wgs84" for verified WGS84 data.')
    declared = metadata.get('dataCrs')
    if declared not in (None, 'wgs84') or data.get('crs') is not None:
        fail('DATA_CRS', 'Conflicting or legacy CRS declaration.', 'Transform and explicitly declare verified WGS84 coordinates first.')
    if declared != 'wgs84' and crs != 'wgs84':
        fail('DATA_CRS', 'The input CRS is not explicitly confirmed.', 'Use metadata.dataCrs="wgs84" or --data-crs wgs84 after checking the source.')
    points = []
    for feature in data['features']:
        if not isinstance(feature, dict) or feature.get('type') != 'Feature' or not isinstance(feature.get('properties', {}), (dict, type(None))):
            fail('GEOJSON_FEATURE', 'Invalid GeoJSON feature or properties.', 'Preserve features as GeoJSON objects.')
        points.extend(geometry_points(feature.get('geometry'), latitude_limit=90 if background else 85))
    return points


def source_time(feature, field, time_format):
    value = (feature.get('properties') or {}).get(field)
    if time_format == 'number':
        if finite(value):
            return value
    elif isinstance(value, str) and ISO_TIME.fullmatch(value):
        try:
            return dt.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000
        except ValueError:
            pass
    fail('TIME_FIELD', f'Invalid source time in properties.{field}.',
         'Use finite numeric values with --time-format number, or ISO 8601 with an explicit Z/offset (up to millisecond precision).')


def fitted_camera(points, width, height):
    xs = [(p[0] + 180) / 360 for p in points]
    ys = [(1 - math.asinh(math.tan(math.radians(p[1]))) / math.pi) / 2 for p in points]
    dx, dy = max(xs) - min(xs), max(ys) - min(ys)
    zoom = max(0, min(10, math.log2(width * .62 / (512 * max(dx, 1e-6))),
                     math.log2(height * .62 / (512 * max(dy, 1e-6)))))
    return {'center': [(min(xs) + max(xs)) * 180 - 180,
                       math.degrees(math.atan(math.sinh(math.pi * (1 - min(ys) - max(ys)))))],
            'zoom': zoom, 'pitch': 0, 'bearing': 0}


def build(data_path, out_dir, *, mode='overview', data_crs=None, time_field=None,
          time_format='number', time_label='源数据刻度', value_field=None, value_label=None,
          title='地图叙事', attribution=None, background_path=None, background_attribution=None,
          duration=24, fps=30, width=1280, height=720):
    data_path, out_dir = Path(data_path), Path(out_dir)
    data = read_object(data_path, 'GeoJSON')
    points = validate_data(data, data_crs)
    if mode not in ('overview', 'track', 'events') or time_format not in ('number', 'iso8601'):
        fail('NARRATIVE_MODE', 'Unknown narrative mode or time format.', 'Choose overview, track or events with number or iso8601 time.')
    if not finite(duration) or not 1 <= duration <= 3600 or not isinstance(fps, int) or isinstance(fps, bool) or not 1 <= fps <= 120:
        fail('VIDEO_TIMING', 'Invalid duration or fps.', 'Use 1–3600 seconds and an integer fps from 1–120.')
    if any(not isinstance(n, int) or isinstance(n, bool) or not 100 <= n <= 7680 or n % 2 for n in (width, height)):
        fail('VIDEO_DIMENSIONS', 'H.264 dimensions must be even integers from 100–7680.', 'Use e.g. --width 1280 --height 720.')
    frames = max(2, math.ceil(duration * fps))
    source_domain = None
    if mode != 'overview':
        if not time_field or any(f['geometry']['type'] != 'Point' for f in data['features']):
            fail('TIME_SERIES', 'Track/events require Point features and --time-field.', 'Bind the actual observation/event time property; do not use row numbers as time.')
        ordered = sorted(data['features'], key=lambda f: source_time(f, time_field, time_format))
        source_domain = [source_time(ordered[0], time_field, time_format), source_time(ordered[-1], time_field, time_format)]
        if mode == 'track' and any(abs(b['geometry']['coordinates'][0] - a['geometry']['coordinates'][0]) > 180 for a, b in zip(ordered, ordered[1:])):
            fail('ANTIMERIDIAN_TRACK', 'Split the track at the antimeridian before using this starter.', 'Retain original points and author separate route segments in Composition.jsx.')
    if value_field and any((f.get('properties') or {}).get(value_field) is not None and
                           (isinstance((f.get('properties') or {})[value_field], (dict, list, bool)) or
                            isinstance((f.get('properties') or {})[value_field], (int, float)) and not finite((f.get('properties') or {})[value_field]))
                           for f in data['features']):
        fail('VALUE_FIELD', 'The selected display value must be text or a finite number.', 'Choose a source metric and provide its meaning/unit with --value-label.')
    if value_field and not value_label:
        fail('VALUE_LABEL', 'A metric needs a display label including its meaning/unit.', 'Supply --value-label for the explicitly selected metric.')
    if value_field and (mode == 'overview' or not any((f.get('properties') or {}).get(value_field) is not None for f in data['features'])):
        fail('VALUE_BINDING', 'A displayed observation metric requires time-series mode and an existing source field.',
             'Use track/events with the actual source property, or author an explicitly defined aggregate in Composition.jsx.')
    background = None
    if background_path:
        background = read_object(Path(background_path), 'Background GeoJSON')
        validate_data(background, data_crs, background=True)
        if not background_attribution:
            fail('BACKGROUND_ATTRIBUTION', 'Local background needs source attribution.', 'Supply --background-attribution from the actual source.')
    config = {'title': title, 'mode': mode, 'fps': fps, 'durationInFrames': frames, 'width': width, 'height': height,
              'timeField': time_field, 'timeFormat': time_format, 'timeLabel': time_label,
              'timeDomain': source_domain, 'valueField': value_field, 'valueLabel': value_label,
              'camera': fitted_camera(points, width, height), 'attribution': attribution or f'Source: {data_path.name}',
              'backgroundAttribution': background_attribution or '© OpenFreeMap © OpenMapTiles © OpenStreetMap contributors'}
    if out_dir.exists():
        fail('OUTPUT_EXISTS', 'The project directory already exists.', 'Choose a new directory; edit an existing Composition in place instead of regenerating over it.')
    out_dir.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.geo-remotion-', dir=out_dir.parent) as temporary:
        stage = Path(temporary) / 'project'
        # Copy a maintained template, never workspace dependencies or generated outputs.
        for relative in ('package.json', 'remotion.config.ts', 'tsconfig.json', 'gitignore.txt',
                         'src/index.jsx', 'src/Composition.jsx', 'src/MapStage.jsx', 'src/timing.mjs',
                         'scripts/record-render.mjs'):
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'assets/remotion' / relative, target)
        shutil.copyfile(ROOT / 'LICENSE', stage / 'LICENSE')
        (stage / 'gitignore.txt').rename(stage / '.gitignore')
        (stage / 'public').mkdir()
        for relative in ('components/scene-narrative.mjs', 'shared/basemap.mjs'):
            target = stage / 'src/runtime' / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / 'assets' / relative, target)
        for name, content in [('data.json', data), ('background.json', background), ('project-config.json', config)]:
            (stage / 'src' / name).write_text(json.dumps(content, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        manifest = {'schemaVersion': 1, 'engine': 'remotion', 'template': 'native', 'provider': 'maplibre',
                    'mode': mode, 'duration': frames / fps, 'fps': fps, 'width': width, 'height': height,
                    'features': len(data['features']), 'dataSha256': hashlib.sha256(data_path.read_bytes()).hexdigest(),
                    'sourceFile': data_path.name, 'timeDomain': source_domain, 'video': 'out/story.mp4',
                    'verification': 'pending-render', 'authoring': 'Editable baseline; adapt Composition.jsx to the requested story before final delivery.'}
        (stage / 'video-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
        stage.rename(out_dir)
    return {'project': str(out_dir.resolve()), **manifest,
            'commands': ['npm install', 'npm run browser', 'npm run studio', 'npm run still', 'npm run render']}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', type=Path)
    parser.add_argument('--out-dir', required=True, type=Path)
    parser.add_argument('--mode', choices=('overview', 'track', 'events'), default='overview')
    parser.add_argument('--data-crs', choices=('wgs84',))
    parser.add_argument('--time-field')
    parser.add_argument('--time-format', choices=('number', 'iso8601'), default='number')
    parser.add_argument('--time-label', default='源数据刻度')
    parser.add_argument('--value-field')
    parser.add_argument('--value-label')
    parser.add_argument('--title', default='地图叙事')
    parser.add_argument('--attribution')
    parser.add_argument('--background', type=Path)
    parser.add_argument('--background-attribution')
    parser.add_argument('--duration', type=float, default=24)
    parser.add_argument('--fps', type=int, default=30)
    parser.add_argument('--width', type=int, default=1280)
    parser.add_argument('--height', type=int, default=720)
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--render', action='store_true')
    parser.add_argument('--browser-executable', type=Path)
    args = parser.parse_args()
    try:
        result = build(args.data, args.out_dir, mode=args.mode, data_crs=args.data_crs, time_field=args.time_field,
                       time_format=args.time_format, time_label=args.time_label, value_field=args.value_field,
                       value_label=args.value_label, title=args.title, attribution=args.attribution,
                       background_path=args.background, background_attribution=args.background_attribution,
                       duration=args.duration, fps=args.fps, width=args.width, height=args.height)
        if args.install or args.render:
            video = run_project(args.out_dir, install=args.install, render=args.render, browser_executable=args.browser_executable)
            if video:
                result.update(video=video, verification='rendered-awaiting-visual-review')
    except (ValueError, TypeError, OSError, subprocess.CalledProcessError) as exc:
        parser.exit(2, diagnostic(exc))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
