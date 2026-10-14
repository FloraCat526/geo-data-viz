#!/usr/bin/env python3
"""Generate an interactive narrative HTML from a validated scene plan."""
import argparse
import hashlib
import html
import json
import re
from pathlib import Path

from scene_plan import PROVIDERS, resolve_scene_config, validate_scene

ROOT = Path(__file__).resolve().parents[1]


def safe_json(value):
    return json.dumps(value, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')


def build(data_path, out, *, provider=None, config_path=None, token_env=None, media_root=None, theme=None, overwrite=False):
    source, target = Path(data_path), Path(out)
    if source.resolve() == target.resolve():
        raise ValueError('Output must not replace input data')
    if target.exists() and not overwrite:
        raise ValueError('Output exists; pass --overwrite')
    data = validate_scene(json.loads(source.read_text(encoding='utf-8')), provider)
    theme = theme or data['theme']
    if theme not in ('dark', 'light'):
        raise ValueError('Theme must be dark or light')
    selected = data['provider']
    config = resolve_scene_config(selected, config_path, token_env)
    copies = {}
    assets_name = f'{target.stem}-assets'
    media_directory = Path(media_root or source.parent).resolve()

    def asset(value):
        if re.match(r'^https?://', value, re.I):
            return value
        path = (media_directory / value).resolve()
        if media_directory not in path.parents or not path.is_file():
            raise ValueError('Local scene asset does not exist or is outside the media folder; use --media-root for an explicitly selected folder')
        content = path.read_bytes()
        name = f'{hashlib.sha256(content).hexdigest()[:12]}{path.suffix.lower()}'
        copies[name] = content
        return f'{assets_name}/{name}'

    for collection in ('locations', 'chapters'):
        for item in data[collection]:
            if item.get('image'):
                item['image'] = asset(item['image'])
    for item in data['audio']:
        item['src'] = asset(item['src'])
    if selected == 'static':
        config['imageUrl'] = asset(config['imageUrl'])
    component = (ROOT / 'assets/components/scene-narrative.mjs').read_text(encoding='utf-8')
    basemap = (ROOT / 'assets/shared/basemap.mjs').read_text(encoding='utf-8')
    if re.search(r'^import\s', basemap, re.M):
        raise ValueError('Basemap module has new dependencies; update the standalone scene bundler')
    component = re.sub(r"^import \{normalizeBasemap, applyBasemap\} from '../shared/basemap.mjs';\n", '', component, flags=re.M)
    # Separate inline modules with a data-URL import to avoid shared top-level identifier collisions.
    import base64
    basemap_url = 'data:text/javascript;base64,' + base64.b64encode(basemap.encode('utf-8')).decode('ascii')
    component = f'import {{normalizeBasemap,applyBasemap}} from "{basemap_url}";\n' + component
    component = component.replace('</script', '<\\/script')
    document = '''<!doctype html><!-- __LICENSE__ -->
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<style>
:root{color-scheme:dark;--fg:#f3f7ff;--muted:#acbdd2;--panel:#112034df;--border:#d2e4ff1b;--accent:#80b7ff;--shadow:#02091940;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}body.light{color-scheme:light;--fg:#183047;--muted:#6b8094;--panel:#fffffff0;--border:#244b7320;--accent:#407fce;--shadow:#263d5920}*{box-sizing:border-box}html,body{height:100%;width:100%;margin:0;overflow:hidden}#map{position:absolute;inset:0}.card{position:absolute;top:24px;left:24px;z-index:4;width:280px;max-width:calc(100vw - 48px);padding:19px 21px;border:1px solid var(--border);border-radius:20px;background:var(--panel);color:var(--fg);backdrop-filter:blur(20px);box-shadow:0 16px 40px var(--shadow)}h1{font-size:16px;line-height:1.35;font-weight:650;letter-spacing:-.03em;margin:0}.chapter{font-size:12px;color:var(--accent);margin:14px 0 7px}.text{font-size:12px;line-height:1.7;color:var(--muted);margin:0;white-space:pre-wrap;max-height:30vh;overflow:auto}.photo{display:block;width:100%;max-height:150px;object-fit:cover;border-radius:12px;margin-top:13px}.photo[hidden]{display:none}#credits{position:absolute;z-index:6;right:14px;bottom:42px;color:var(--fg);font-size:11px}#credits summary{list-style:none;width:24px;height:24px;border:1px solid var(--border);border-radius:50%;background:var(--panel);text-align:center;line-height:23px;cursor:pointer}#credits summary::-webkit-details-marker{display:none}#credits p{position:absolute;bottom:22px;right:0;width:min(320px,80vw);padding:14px;line-height:1.6;white-space:pre-wrap;border:1px solid var(--border);border-radius:12px;background:var(--panel);box-shadow:0 8px 28px var(--shadow)}#credits[hidden]{display:none}.timeline{position:absolute;z-index:5;left:50%;bottom:36px;transform:translateX(-50%);display:flex;align-items:center;gap:15px;width:min(620px,calc(100vw - 48px));padding:12px 16px;border:1px solid var(--border);border-radius:18px;background:var(--panel);color:var(--fg);box-shadow:0 10px 32px var(--shadow);backdrop-filter:blur(20px)}button{font:inherit;cursor:pointer;border:0;background:transparent;color:var(--accent)}#play{width:32px;height:32px;border-radius:50%;background:#7ba8f520;color:var(--fg);font-size:13px}#progress{flex:1;min-width:0;accent-color:var(--accent);height:4px}#time{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}#status{position:absolute;z-index:6;bottom:110px;left:24px;padding:8px 12px;color:var(--fg);background:var(--panel);border-radius:10px;font-size:12px}#status:empty{display:none}.maplibregl-ctrl-attrib,.mapboxgl-ctrl-attrib{font-size:10px}.cesium-viewer-bottom{bottom:0!important}button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:4px}@media(max-width:600px){.card{top:12px;left:12px;width:250px;padding:15px 17px}.text{max-height:19vh}.timeline{bottom:32px;width:calc(100vw - 24px);gap:10px;padding:10px 12px}.photo{max-height:100px}}
</style></head><body class="__THEME__"><div id="map"></div><aside class="card"><h1 id="title"></h1><p class="chapter" id="chapter"></p><p class="text" id="text"></p><img class="photo" id="photo" hidden alt=""></aside><div class="timeline"><button type="button" id="play" aria-label="播放">▶</button><input id="progress" type="range" min="0" max="1000" value="0" aria-label="故事进度"><span id="time"></span></div><p id="status" role="status">地图加载中…</p><details id="credits" hidden><summary aria-label="来源与署名">!</summary><p id="credits-text"></p></details>
<script id="scene-data" type="application/json">__DATA__</script><script id="scene-config" type="application/json">__CONFIG__</script><script type="module">
__COMPONENT__
const $=id=>document.getElementById(id),data=normalizeScene(JSON.parse($('scene-data').textContent)),config=JSON.parse($('scene-config').textContent),theme=__THEME_JSON__;
const tracks=data.audio.map(item=>({item,player:new Audio(item.src)}));let viz,lastImage;
$('title').textContent=data.title;
const sceneCredits=[data.attribution,typeof data.metadata.source==='string'?data.metadata.source:data.metadata.source?.url].filter(value=>typeof value==='string'&&value);if(sceneCredits.length){$('credits').hidden=false;$('credits-text').textContent=[...new Set(sceneCredits)].join('\\n');}
function render(state){if(state.error){$('status').textContent=state.error.message;return;}$('chapter').textContent=state.chapter.title||state.location?.name||'';$('text').textContent=state.chapter.text||state.location?.description||'';$('progress').value=String(Math.round(state.progress*1000));$('time').textContent=`${Math.floor(state.time)} / ${Math.ceil(data.duration)}s`;$('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'暂停':'播放');const image=state.chapter.image||state.location?.image||'';if(image!==lastImage){lastImage=image;$('photo').hidden=!image;if(image){$('photo').src=image;$('photo').alt=state.location?.name||state.chapter.title||'';}else $('photo').removeAttribute('src');}for(const {item,player} of tracks){const active=state.playing&&state.time>=item.start&&state.time<item.end;player.volume=item.volume;const position=Math.max(0,state.time-item.start);if(Math.abs(player.currentTime-position)>.3)player.currentTime=position;if(active&&player.paused)player.play().catch(()=>{});else if(!active&&!player.paused)player.pause();}}
try{const target=await createSceneTarget($('map'),{provider:data.provider,config,basemap:config.basemap??data.basemap,theme,...(['maplibre','mapbox','maptiler'].includes(data.provider)?{initialCamera:sampleScene(data,0).camera}:{})});viz=new SceneNarrativeViz(target,{data,provider:data.provider,theme,onChange:render});await viz.ready;window.sceneViz=viz;window.sceneTarget=target;document.body.dataset.sceneReady='true';$('status').textContent='';$('play').onclick=()=>{if(viz.playing){viz.pause();render({...sampleScene(data,viz.time),playing:false});}else viz.play();};$('progress').oninput=()=>{viz.pause();viz.seek(Number($('progress').value)/1000*data.duration).catch(error=>{$('status').textContent=error.message;});};document.addEventListener('visibilitychange',()=>{if(document.hidden){viz.pause();render({...sampleScene(data,viz.time),playing:false});}});window.addEventListener('pagehide',()=>{viz.destroy();tracks.forEach(({player})=>player.pause());target.destroy();},{once:true});}
catch(error){$('status').textContent='场景无法显示：'+error.message;document.body.dataset.sceneError=error.message;}
</script></body></html>'''
    replacements = {'__LICENSE__': (ROOT / 'LICENSE').read_text(encoding='utf-8'), '__TITLE__': html.escape(data['title']), '__DATA__': safe_json(data), '__CONFIG__': safe_json(config),
                    '__COMPONENT__': component, '__THEME__': theme, '__THEME_JSON__': json.dumps(theme)}
    document = re.sub('|'.join(map(re.escape, replacements)), lambda match: replacements[match.group()], document)
    target.parent.mkdir(parents=True, exist_ok=True)
    for name, content in copies.items():
        assets = target.parent / assets_name
        assets.mkdir(exist_ok=True)
        (assets / name).write_bytes(content)
    with target.open('w' if overwrite else 'x', encoding='utf-8') as handle:
        handle.write(document)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data')
    parser.add_argument('--out', required=True)
    parser.add_argument('--provider', choices=PROVIDERS)
    parser.add_argument('--config', dest='config_path')
    parser.add_argument('--token-env')
    parser.add_argument('--media-root', type=Path)
    parser.add_argument('--theme', choices=('dark', 'light'))
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    try:
        print(f'Generated {build(args.data, args.out, provider=args.provider, config_path=args.config_path, token_env=args.token_env, media_root=args.media_root, theme=args.theme, overwrite=args.overwrite)}')
    except (ValueError, TypeError, OSError, json.JSONDecodeError) as error:
        parser.exit(2, f'{error}\n')
