"""Validate explicitly supplied imagery and DEM resources before HTML generation."""
import math
import re
from urllib.parse import urlsplit, parse_qs

from build_errors import BuildError


def _fail(message):
    raise BuildError('BASEMAP_CONFIG', message,
                     'Use vector, explicit HTTPS XYZ imagery with attribution, or an RGB DEM source for terrain. OpenFreeMap is a vector basemap.')


def _url(value, *, mapbox=False, tiles=False):
    if not isinstance(value, str) or not value.strip() or any(c.isspace() for c in value):
        _fail('Basemap resource URLs must be nonempty HTTPS URLs.')
    parsed = urlsplit(value)
    if mapbox and value.startswith('mapbox://'):
        if not re.fullmatch(r'mapbox://(?:styles/[\w.-]+/[\w.-]+|mapbox\.[\w.-]+)', value):
            _fail('Invalid Mapbox resource URL.')
    elif parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        _fail('Basemap URLs require HTTPS and must not contain credentials or fragments.')
    if tiles and any(marker not in value for marker in ('{z}', '{x}', '{y}')):
        _fail('Tile templates must contain {z}, {x}, and {y} in Web Mercator XYZ order.')
    return value


def _attribution(value):
    if not isinstance(value, str) or not value.strip() or len(value) > 2000:
        _fail('Imagery and terrain require their source attribution.')
    # MapLibre attribution permits HTML. Accept only text and HTTPS attribution links.
    pattern = r'<a href="([^"]+)"(?: target="_blank")?(?: rel="(?:noopener|noreferrer|noopener noreferrer)")?>([^<>]*)</a>'
    def link(match):
        _url(match.group(1))
        return match.group(2)
    text = re.sub(pattern, link, value)
    if '<' in text or '>' in text or re.search(r'&(?:lt|gt|#0*6[02]|#x0*3[ce]);', text, re.I):
        _fail('Attribution supports text and HTTPS links only.')
    return value


def _native_imagery_style(style, provider):
    if provider == 'mapbox' and style in ('mapbox://styles/mapbox/satellite-v9', 'mapbox://styles/mapbox/satellite-streets-v12'):
        return True
    parsed = urlsplit(style)
    return parsed.scheme == 'https' and parsed.hostname == 'api.maptiler.com' and parsed.path == '/maps/satellite/style.json' and bool(parse_qs(parsed.query).get('key', [''])[0])


def _source(source, *, terrain=False, provider='maplibre'):
    allowed = {'url', 'tiles', 'tileSize', 'attribution', 'minzoom', 'maxzoom'} | ({'encoding', 'exaggeration'} if terrain else set())
    if not isinstance(source, dict) or set(source) - allowed:
        _fail('Basemap source contains an unknown field or is not an object.')
    if ('url' in source) == ('tiles' in source):
        _fail('Provide exactly one source URL or tiles array.')
    result = dict(source)
    if 'url' in source:
        _url(source['url'], mapbox=provider == 'mapbox')
    else:
        if not isinstance(source['tiles'], list) or not 1 <= len(source['tiles']) <= 8:
            _fail('tiles must be an array of one to eight HTTPS XYZ templates.')
        for url in source['tiles']:
            _url(url, tiles=True)
        result['tiles'] = list(source['tiles'])
    size = source.get('tileSize', 256)
    if isinstance(size, bool) or size not in (256, 512, 514):
        _fail('tileSize must match the source: 256, 512, or 514 pixels.')
    result['tileSize'] = size
    result['attribution'] = _attribution(source.get('attribution'))
    for field in ('minzoom', 'maxzoom'):
        if field in source and (isinstance(source[field], bool) or not isinstance(source[field], int) or not 0 <= source[field] <= 24):
            _fail('Basemap source zoom levels must be integers from 0 to 24.')
    if source.get('minzoom', 0) > source.get('maxzoom', 24):
        _fail('Basemap minzoom must not exceed maxzoom.')
    if terrain:
        encoding = source.get('encoding', 'mapbox')
        if encoding not in ('mapbox', 'terrarium') or provider == 'mapbox' and encoding != 'mapbox':
            _fail('DEM encoding must be mapbox or terrarium; Mapbox requires its Terrain-DEM source.')
        if provider == 'mapbox' and source.get('url') != 'mapbox://mapbox.mapbox-terrain-dem-v1':
            _fail('Mapbox terrain uses the officially supported Mapbox Terrain-DEM tileset.')
        scale = source.get('exaggeration', 1.5)
        if isinstance(scale, bool) or not isinstance(scale, (int, float)) or not math.isfinite(scale) or not 0 < scale <= 10:
            _fail('Terrain exaggeration must be finite and greater than 0, up to 10.')
        result.update(encoding=encoding, exaggeration=scale)
    return result


def normalize_basemap(config=None, *, provider='maplibre', theme='dark'):
    """Return the complete browser-ready basemap configuration; never discover keys."""
    if provider not in ('maplibre', 'mapbox', 'maptiler') or theme not in ('dark', 'light'):
        _fail('Unsupported basemap provider or theme.')
    if config is None:
        config = {}
    if not isinstance(config, dict) or set(config) - {'type', 'styleUrl', 'imagery', 'terrain', 'showHillshade'}:
        _fail('basemap contains an unknown field or is not an object.')
    kind = config.get('type', 'vector')
    if kind not in ('vector', 'imagery', 'terrain'):
        _fail('basemap.type must be vector, imagery, or terrain.')
    if kind == 'vector' and any(key in config for key in ('imagery', 'terrain', 'showHillshade')):
        _fail('Vector basemaps do not accept imagery or terrain options.')
    if kind == 'imagery' and any(key in config for key in ('terrain', 'showHillshade')):
        _fail('Use type terrain to combine imagery and elevation.')
    if 'showHillshade' in config and not isinstance(config['showHillshade'], bool):
        _fail('showHillshade must be boolean.')
    style = config.get('styleUrl')
    if style is None:
        if provider == 'maptiler':
            _fail('MapTiler requires an explicit authorized styleUrl.')
        if provider == 'mapbox':
            name = 'satellite-streets-v12' if kind == 'imagery' else 'outdoors-v12' if kind == 'terrain' else f'{theme}-v11'
            style = f'mapbox://styles/mapbox/{name}'
        else:
            style = 'https://tiles.openfreemap.org/styles/' + ('positron' if theme == 'light' else 'dark')
    _url(style, mapbox=provider == 'mapbox')
    result = {'type': kind, 'styleUrl': style}
    if 'imagery' in config:
        result['imagery'] = _source(config['imagery'], provider=provider)
    elif kind == 'imagery' and not _native_imagery_style(style, provider):
        _fail('Imagery requires an explicit attributed tile source; a vector style is not satellite imagery.')
    if kind == 'terrain':
        dem = config.get('terrain')
        if dem is None and provider == 'mapbox':
            dem = {'url': 'mapbox://mapbox.mapbox-terrain-dem-v1', 'tileSize': 512, 'encoding': 'mapbox', 'attribution': '© Mapbox', 'exaggeration': 1.5}
        result['terrain'] = _source(dem, terrain=True, provider=provider)
        result['showHillshade'] = config.get('showHillshade', False)
    return result


def read_basemap_file(path):
    from build_errors import read_object
    from pathlib import Path
    return read_object(Path(path), 'Basemap') if path else None
