#!/usr/bin/env python3
"""Validate frame-addressable scene plans and resolve selected provider credentials."""
import argparse
import json
import math
import os
import re
from copy import deepcopy
from pathlib import Path
from basemap_config import normalize_basemap

PROVIDERS = ('maplibre', 'mapbox', 'maptiler', 'cesium', 'static')


def resource_url(value, field='resource'):
    if not isinstance(value, str) or not value or re.search(r'[\x00-\x20\\]', value):
        raise ValueError(f'{field} must be an HTTP(S) URL or a relative asset path')
    scheme = re.match(r'^([a-z][\w+.-]*):', value, re.I)
    if value.startswith('//') or scheme and scheme[1].lower() not in ('http', 'https'):
        raise ValueError(f'{field} must use HTTP(S) or a relative asset path')
    return value


def validate_scene(data, provider=None):
    """Return normalized JSON, without inventing routes or calling external services."""
    def obj(value, field):
        if not isinstance(value, dict):
            raise ValueError(f'{field} must be an object')
        return value

    def number(value, field, minimum, maximum):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(f'{field} must be finite between {minimum} and {maximum}')
        return value

    def string(value, field, limit=2000):
        if value is None:
            return ''
        if not isinstance(value, str) or len(value) > limit:
            raise ValueError(f'{field} must be text of at most {limit} characters')
        return value

    obj(data, 'scene')
    selected = provider or data.get('provider', 'maplibre')
    if selected not in PROVIDERS:
        raise ValueError('Unknown scene provider')
    if isinstance(data.get('schemaVersion'), bool) or data.get('schemaVersion') != 1:
        raise ValueError('scene.schemaVersion must be 1')
    if not isinstance(data.get('metadata'), dict) or data['metadata'].get('dataCrs') != 'wgs84':
        raise ValueError('Scene requires verified WGS84 coordinates')

    def point(value, field):
        if not isinstance(value, list) or len(value) != 2:
            raise ValueError(f'{field} must be WGS84 [longitude, latitude]')
        latitude = 90 if selected == 'cesium' else 85
        return [number(value[0], field, -180, 180), number(value[1], field, -latitude, latitude)]

    def pose(value, field):
        obj(value, field)
        result = {'center': point(value.get('center'), f'{field}.center'),
                  'zoom': number(value.get('zoom', 8), f'{field}.zoom', 0, 22),
                  'pitch': number(value.get('pitch', 0), f'{field}.pitch', 0, 85),
                  'bearing': number(value.get('bearing', 0), f'{field}.bearing', -360, 360)}
        if selected == 'cesium':
            result['height'] = number(value.get('height', 20000), f'{field}.height', 1, 50000000)
        if selected == 'static' and result['pitch'] != 0:
            raise ValueError('Static map scenes support pan, zoom and bearing; pitch must be 0')
        return result

    def keyed_list(value, field, limit):
        if not isinstance(value, list) or len(value) > limit:
            raise ValueError(f'{field} must be an array of at most {limit} records')
        seen = set()
        for item in value:
            obj(item, field)
            key = item.get('id')
            if not isinstance(key, str) or not re.fullmatch(r'[A-Za-z][\w-]*', key, re.ASCII) or key in seen:
                raise ValueError(f'{field} IDs must be unique and URL-safe')
            seen.add(key)
        return value

    theme = data.get('theme', 'dark')
    if theme not in ('dark', 'light'):
        raise ValueError('Scene theme must be dark or light')
    result = {'schemaVersion': 1, 'metadata': deepcopy(data['metadata']), 'provider': selected, 'theme': theme,
              'attribution': string(data.get('attribution'), 'attribution', 2000),
              'title': string(data.get('title', '地图故事'), 'title', 160),
              'duration': number(data.get('duration', 20), 'duration', .1, 3600),
              'fps': number(data.get('fps', 30), 'fps', 1, 120),
              'width': number(data.get('width', 1920), 'width', 100, 7680),
              'height': number(data.get('height', 1080), 'height', 100, 7680)}
    for field in ('fps', 'width', 'height'):
        if result[field] != int(result[field]):
            raise ValueError('fps, width and height must be integers')
        result[field] = int(result[field])
    if data.get('basemap') is not None:
        if selected not in ('maplibre', 'mapbox', 'maptiler'):
            raise ValueError('basemap is only available for GL scene providers')
        basemap = obj(data['basemap'], 'basemap')
        missing_style = selected == 'maptiler' and 'styleUrl' not in basemap
        result['basemap'] = normalize_basemap({**basemap, 'styleUrl': 'https://api.maptiler.com/maps/dataviz/style.json'} if missing_style else basemap, provider=selected, theme=theme)
        if missing_style:
            result['basemap'].pop('styleUrl')
    result['locations'] = []
    for item in keyed_list(data.get('locations', []), 'locations', 10000):
        location = {'id': item['id'], 'name': string(item.get('name', item['id']), 'location.name', 120),
                    'coordinates': point(item.get('coordinates'), 'location.coordinates'),
                    'description': string(item.get('description'), 'location.description')}
        if item.get('image'):
            location['image'] = resource_url(item['image'], 'location.image')
        result['locations'].append(location)
    result['routes'] = []
    for item in keyed_list(data.get('routes', []), 'routes', 1000):
        coordinates = item.get('coordinates')
        if not isinstance(coordinates, list) or not 2 <= len(coordinates) <= 200000:
            raise ValueError('Route requires 2 to 200000 supplied coordinates')
        coordinates = [point(vertex, 'route.coordinates') for vertex in coordinates]
        if any(abs(vertex[0] - coordinates[index - 1][0]) > 180 for index, vertex in enumerate(coordinates) if index):
            raise ValueError('Split routes at the antimeridian before displaying')
        kind = item.get('kind', 'provided')
        if kind not in ('provided', 'schematic'):
            raise ValueError('Route kind must be provided or schematic')
        result['routes'].append({'id': item['id'], 'coordinates': coordinates, 'kind': kind})
    locations = {item['id'] for item in result['locations']}
    routes = {item['id'] for item in result['routes']}
    result['chapters'] = []
    duration = result['duration']
    previous = 0
    for item in keyed_list(data.get('chapters'), 'chapters', 1000):
        start = number(item.get('start'), 'chapter.start', 0, duration)
        end = number(item.get('end'), 'chapter.end', 0, duration)
        if end <= start or abs(start - previous) > .000001:
            raise ValueError('Chapters must be ordered and cover the duration continuously')
        if item.get('locationId') is not None and item['locationId'] not in locations:
            raise ValueError('Unknown chapter locationId')
        if item.get('routeId') is not None and item['routeId'] not in routes:
            raise ValueError('Unknown chapter routeId')
        camera = obj(item.get('camera'), 'chapter.camera')
        follow = camera.get('followRoute', False)
        if not isinstance(follow, bool):
            raise ValueError('camera.followRoute must be boolean')
        if follow and not item.get('routeId'):
            raise ValueError('camera.followRoute requires chapter.routeId')
        from_pose = pose(camera.get('from'), 'camera.from')
        to_pose = pose(camera.get('to', camera.get('from')), 'camera.to')
        progress = obj(item.get('routeProgress', {'from': 0, 'to': 1}), 'routeProgress')
        chapter = {'id': item['id'], 'start': start, 'end': end,
                   'title': string(item.get('title'), 'chapter.title', 160),
                   'text': string(item.get('text'), 'chapter.text'),
                   'locationId': item.get('locationId'), 'routeId': item.get('routeId'),
                   'camera': {'from': from_pose, 'to': to_pose, 'followRoute': follow},
                   'routeProgress': {'from': number(progress.get('from'), 'routeProgress.from', 0, 1),
                                     'to': number(progress.get('to'), 'routeProgress.to', 0, 1)}}
        if item.get('image'):
            chapter['image'] = resource_url(item['image'], 'chapter.image')
        result['chapters'].append(chapter)
        previous = end
    if not result['chapters'] or abs(previous - duration) > .000001:
        raise ValueError('Chapters must cover 0 through duration')
    audio = data.get('audio', [])
    if not isinstance(audio, list):
        raise ValueError('audio must be an array')
    result['audio'] = []
    for item in audio:
        obj(item, 'audio')
        start = number(item.get('start', 0), 'audio.start', 0, duration)
        end = number(item.get('end', duration), 'audio.end', 0, duration)
        if end <= start:
            raise ValueError('Audio end must be after start')
        result['audio'].append({'src': resource_url(item.get('src'), 'audio.src'), 'start': start, 'end': end,
                                'volume': number(item.get('volume', 1), 'audio.volume', 0, 1)})
    return result


def resolve_scene_config(provider, config_path=None, token_env=None):
    """Read only selected provider settings; authorized public browser keys may be embedded."""
    if provider not in PROVIDERS:
        raise ValueError('Unknown scene provider')
    raw = json.loads(Path(config_path).read_text(encoding='utf-8')) if config_path else {}
    if not isinstance(raw, dict):
        raise ValueError('Config must be an object')
    # Supports a direct selected-provider config, or a multi-provider credentials file.
    if provider in raw:
        raw = raw[provider]
        if not isinstance(raw, dict):
            raise ValueError('Selected provider config must be an object')
    shared = ('basemap', 'style', 'interactive', 'timeout')
    fields = {'maplibre': shared, 'mapbox': (*shared, 'token'), 'maptiler': (*shared, 'apiKey'),
              'cesium': ('imagery', 'terrain', 'tiles3d', 'ionToken', 'timeout'),
              'static': ('imageUrl', 'geoBounds', 'attribution', 'baseZoom', 'projection')}
    config = {key: deepcopy(raw[key]) for key in fields[provider] if key in raw}
    token_field = {'mapbox': 'token', 'maptiler': 'apiKey', 'cesium': 'ionToken'}.get(provider)
    if token_env:
        if not token_field:
            raise ValueError(f'{provider} does not use a token environment variable')
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', token_env):
            raise ValueError('Invalid token environment variable name')
        value = os.environ.get(token_env)
        if not value:
            raise ValueError(f'Token environment variable {token_env} is empty')
        config[token_field] = value
    elif token_field and not config.get(token_field):
        names = {'mapbox': ('MAPBOX_ACCESS_TOKEN', 'MAPBOX_TOKEN'), 'maptiler': ('MAPTILER_API_KEY', 'MAPTILER_KEY'),
                 'cesium': ('CESIUM_ION_TOKEN',)}[provider]
        for name in names:
            if os.environ.get(name):
                config[token_field] = os.environ[name]
                break
    if provider in ('mapbox', 'maptiler') and not config.get(token_field):
        raise ValueError(f'{provider} requires an authorized {token_field} in config or environment')
    if token_field in config and (not isinstance(config[token_field], str) or not config[token_field].strip()):
        raise ValueError(f'{token_field} must be nonempty text')
    if provider == 'mapbox' and not config['token'].startswith('pk.'):
        raise ValueError('Only a public pk. Mapbox browser token may be embedded; secret tokens are not accepted')
    if 'timeout' in config and (isinstance(config['timeout'], bool) or not isinstance(config['timeout'], (int, float)) or not math.isfinite(config['timeout']) or not 1000 <= config['timeout'] <= 300000):
        raise ValueError('timeout must be finite milliseconds between 1000 and 300000')
    if 'interactive' in config and not isinstance(config['interactive'], bool):
        raise ValueError('interactive must be boolean')
    if config.get('style'):
        if provider == 'mapbox' and str(config['style']).startswith('mapbox://styles/'):
            pass
        else:
            resource_url(config['style'], 'style')
    if provider in ('maplibre','mapbox','maptiler') and ('basemap' in config or 'style' in config):
        background = config.get('basemap', {})
        if not isinstance(background, dict):
            raise ValueError('basemap must be an object')
        background = {**background}
        if config.get('style'):
            background['styleUrl'] = config['style']
        elif provider == 'maptiler' and not background.get('styleUrl'):
            background['styleUrl'] = 'https://api.maptiler.com/maps/dataviz/style.json'
        normalize_basemap(background, provider=provider)
    if provider == 'static':
        resource_url(config.get('imageUrl'), 'static.imageUrl')
        bounds = config.get('geoBounds')
        if not isinstance(bounds, list) or len(bounds) != 4 or any(isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x) for x in bounds) or not -180 <= bounds[0] < bounds[2] <= 180 or not -90 <= bounds[1] < bounds[3] <= 90:
            raise ValueError('Static map requires geoBounds [west,south,east,north] without antimeridian crossing')
        projection = config.get('projection', 'mercator')
        if projection not in ('mercator', 'equirectangular'):
            raise ValueError('Static projection must be mercator or equirectangular')
        if projection == 'mercator' and (bounds[1] < -85.051129 or bounds[3] > 85.051129):
            raise ValueError('Mercator image bounds must lie within ±85.051129 degrees')
        config['projection'] = projection
    if provider == 'cesium':
        for name in ('imagery', 'terrain', 'tiles3d'):
            item = config.get(name)
            if item is not None:
                if not isinstance(item, dict):
                    raise ValueError(f'{name} must be an object')
                if item.get('url'):
                    resource_url(item['url'], f'{name}.url')
                elif name != 'terrain' or not item.get('world'):
                    raise ValueError(f'{name} requires a URL')
        if config.get('terrain', {}).get('world') and not config.get('ionToken'):
            raise ValueError('Cesium world terrain requires an authorized ionToken')
    return config


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('scene')
    parser.add_argument('--provider', choices=PROVIDERS)
    args = parser.parse_args()
    try:
        scene = validate_scene(json.loads(Path(args.scene).read_text(encoding='utf-8')), args.provider)
        print(f"Validated {scene['provider']} scene: {len(scene['chapters'])} chapters, {scene['duration']} seconds")
    except (ValueError, TypeError, OSError, json.JSONDecodeError) as error:
        parser.exit(2, f'{error}\n')
