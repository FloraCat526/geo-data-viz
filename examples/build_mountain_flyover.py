"""Rebuild the public Alpine flyover from bundled CC0 landmark coordinates.

Generation is offline and uses Python's standard library. Viewing the result
loads SWISSIMAGE imagery and Mapterhorn terrain; no map Key is required.
"""
import json
from pathlib import Path
from shutil import copyfile
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from build_scene_html import build

IMAGERY = ('https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/'
           'default/current/3857/{z}/{x}/{y}.jpeg')


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def build_demo(out_dir=None):
    """Write a runnable example root, using only the bundled six-point snapshot."""
    out = Path(out_dir) if out_dir is not None else HERE
    data_path = HERE / 'data/mountain-landmarks.geojson'
    landmarks = json.loads(data_path.read_text(encoding='utf-8'))
    if out.resolve() != HERE.resolve():
        for resource in ('data/mountain-landmarks.geojson', 'mountain-playback.mjs',
                         'assets/mountain-poster.jpg', 'assets/thumbnails/mountain-flyover.jpg'):
            target = out / resource
            target.parent.mkdir(parents=True, exist_ok=True)
            copyfile(HERE / resource, target)
    poses = [
        {'center': [8.022, 46.610], 'zoom': 12.45, 'pitch': 58, 'bearing': 178},
        {'center': [8.002, 46.585], 'zoom': 12.80, 'pitch': 60, 'bearing': 160},
        {'center': [8.002, 46.568], 'zoom': 12.85, 'pitch': 60, 'bearing': 195},
        {'center': [7.985, 46.552], 'zoom': 13.05, 'pitch': 60, 'bearing': 215},
        {'center': [7.980, 46.540], 'zoom': 12.65, 'pitch': 58, 'bearing': 210},
    ]
    chapters = [
        ('valley', '山谷启程', '从格林德瓦向阿尔卑斯山脊推进。', 'grindelwald'),
        ('eiger-wall', '艾格峰北壁', '草坡逐渐退去，岩壁与雪线进入视野。', 'eiger'),
        ('high-saddle', '穿过高山山坳', '在僧侣峰与少女峰之间，俯瞰冰川源头。', 'jungfraujoch'),
        ('glacier', '冰川与群峰', '镜头缓缓展开，留下雪峰与冰川的全景。', 'jungfrau'),
    ]
    scene = {'schemaVersion': 1, 'provider': 'maplibre', 'theme': 'dark',
             'title': '阿尔卑斯 · 山地飞越', 'duration': 24, 'fps': 30, 'width': 1920, 'height': 1080,
             'metadata': {'dataCrs': 'wgs84', 'source': 'SWISSIMAGE / Mapterhorn / Wikidata CC0',
                 'retrievedDate': landmarks['metadata']['retrievedDate'],
                 'cameraSemantics': 'Editorial camera keyframes, not a recorded flight or hiking route',
                 'timing': '24 seconds of editorial narration, not travel time',
                 'imageryTime': 'current mosaic; acquisition dates vary by area'},
             'attribution': '影像 ©swisstopo；高程 © Mapterhorn（瑞士来源 swissALTI3D）；地点坐标 Wikidata CC0。'
                            '影像是 current 正射航片镶嵌，不是实时画面。镜头路径为演示编排，未提供或绘制真实飞行、徒步路线。'
                            '地形夸张 1.2 倍；不用于导航。',
             'basemap': {'type': 'terrain', 'terrain': {
                 'url': 'https://tiles.mapterhorn.com/tilejson.json', 'encoding': 'terrarium',
                 'tileSize': 512, 'exaggeration': 1.2,
                 'attribution': '<a href="https://mapterhorn.com/attribution/">© Mapterhorn</a>'},
                 'imagery': {'tiles': [IMAGERY], 'tileSize': 256, 'minzoom': 0, 'maxzoom': 20,
                     'attribution': '<a href="https://www.swisstopo.admin.ch/">©swisstopo</a>'},
                 'showHillshade': False},
             'locations': [{'id': f['id'], 'name': f['properties']['name'],
                            'coordinates': f['geometry']['coordinates']}
                           for f in landmarks['features']], 'routes': [], 'audio': [],
             'chapters': [{'id': identifier, 'start': i * 6, 'end': (i + 1) * 6,
                           'title': title, 'text': text, 'locationId': location,
                           'camera': {'from': poses[i], 'to': poses[i + 1], 'followRoute': False}}
                          for i, (identifier, title, text, location) in enumerate(chapters)]}
    scene_path = out / 'specs/mountain-flyover.scene.json'
    config_path = out / 'specs/mountain-flyover.runtime.json'
    write_json(scene_path, scene)
    write_json(config_path, {'timeout': 90000})
    html_path = build(scene_path, out / 'maps/mountain-flyover.html', config_path=config_path, overwrite=True)
    # The paused landing view is an overview. Only a user action activates the
    # original scene, through the public setData() API rather than internal state.
    overview = {**poses[0], 'zoom': 11.3}
    write_json(out / 'specs/mountain-flyover.preview.json', overview)
    intro = '''const mountainPreviewCamera=__OVERVIEW__;
const mountainPreviewData={...data,chapters:[{...data.chapters[0],start:0,end:data.duration,
 camera:{from:mountainPreviewCamera,to:mountainPreviewCamera,followRoute:false}}]};
'''.replace('__OVERVIEW__', json.dumps(overview))
    intro += (HERE / 'mountain-playback.mjs').read_text(encoding='utf-8') + '\n'
    document = html_path.read_text(encoding='utf-8')
    substitutions = {
        "$('title').textContent=data.title;": intro + "$('title').textContent=data.title;",
        'initialCamera:sampleScene(data,0).camera': 'initialCamera:mountainPreviewCamera',
        'new SceneNarrativeViz(target,{data,provider:data.provider,theme,onChange:render})':
            'new SceneNarrativeViz(target,{data:mountainPreviewData,provider:data.provider,theme,onChange:render})',
        'else viz.play();': 'else startMountainPlayback();',
        'style:normalizedBasemap.styleUrl,...firstCamera':
            'style:mountainLandscapeStyle,maxTileCacheSize:256,cancelPendingTileRequestsWhileZooming:false,pixelRatio:Math.min(window.devicePixelRatio||1,1.5),...firstCamera',
        "document.body.dataset.sceneReady='true';$('status').textContent='';":
            "document.body.dataset.sceneReady='true';document.body.dataset.mountainPhase='overview';document.getElementById('mountain-poster')?.remove();$('status').textContent='';",
        "$('progress').oninput=()=>{viz.pause();viz.seek(Number($('progress').value)/1000*data.duration).catch(error=>{$('status').textContent=error.message;});};":
            "$('progress').oninput=()=>seekMountain(Number($('progress').value)/1000*data.duration);",
    }
    for old, new in substitutions.items():
        if document.count(old) != 1:
            raise ValueError('Scene HTML bootstrap changed; review the mountain demo overview integration')
        document = document.replace(old, new, 1)
    # A lightweight landscape style avoids downloading hidden vector tiles and
    # sprites. A local real-scene poster covers incomplete initialization only.
    poster = '<img id="mountain-poster" src="../assets/mountain-poster.jpg" alt="" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none;z-index:2">'
    document = document.replace('<aside class="card">', poster + '<aside class="card">', 1)
    html_path.write_text(document, encoding='utf-8')

    href = 'maps/mountain-flyover.html'
    return {'html': str((out / href).resolve()), 'landmarks': len(scene['locations']),
            'chapters': len(scene['chapters']), 'duration': scene['duration'], 'businessRoutes': 0}


if __name__ == '__main__':
    print(json.dumps(build_demo(), ensure_ascii=False))
