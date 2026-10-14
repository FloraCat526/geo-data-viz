#!/usr/bin/env python3
"""Build a standalone narrative map from verified WGS84 story events."""
import argparse
import html
import json
import math
import re
from datetime import date
from pathlib import Path
from basemap_config import normalize_basemap, read_basemap_file

ROOT = Path(__file__).resolve().parents[1]


def validate(data):
    if not isinstance(data, dict) or not isinstance(data.get('events'), list) or not data['events']:
        raise ValueError('Story requires a nonempty events array')
    if not isinstance(data.get('metadata'), dict) or data['metadata'].get('dataCrs') != 'wgs84':
        raise ValueError('Story requires verified WGS84 coordinates')
    if len(data['events']) > 1000:
        raise ValueError('Story supports at most 1000 events in one standalone HTML')

    def string(value, field, limit, required=False):
        if value is None and not required:
            return
        if not isinstance(value, str) or len(value) > limit or required and not value.strip():
            raise ValueError(f'{field} must be text of at most {limit} characters')

    def point(value):
        if not isinstance(value, list) or len(value) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in value):
            raise ValueError('Coordinates must be WGS84 [longitude, latitude]')
        if abs(value[0]) > 180 or abs(value[1]) > 85:
            raise ValueError('Coordinates exceed Mercator bounds')

    string(data.get('title'), 'title', 150)
    string(data.get('subtitle'), 'subtitle', 180)
    seen = set()
    previous = None
    last_date = None
    for index, event in enumerate(data['events']):
        if not isinstance(event, dict):
            raise ValueError('Each event must be an object')
        event_id = event.get('id')
        string(event_id, 'event.id', 80, True)
        if not re.fullmatch(r'[A-Za-z][\w-]*', event_id) or event_id in seen:
            raise ValueError('Event IDs must be unique and URL-safe')
        seen.add(event_id)
        string(event.get('title'), 'event.title', 120, True)
        point(event.get('coordinates'))
        for field, limit in (('chapter', 80), ('summary', 1000)):
            string(event.get(field), f'event.{field}', limit)
        stamp = event.get('date')
        if stamp:
            string(stamp, 'event.date', 32)
            try:
                if date.fromisoformat(stamp).isoformat() != stamp:
                    raise ValueError()
            except ValueError:
                raise ValueError('event.date must be a real YYYY-MM-DD date') from None
            if last_date and stamp < last_date:
                raise ValueError('Dates must follow event order')
            last_date = stamp
        details = event.get('details', [])
        if not isinstance(details, list):
            raise ValueError('event.details must be an array')
        for detail in details:
            if not isinstance(detail, dict):
                raise ValueError('Details must have label and text')
            string(detail.get('label'), 'detail.label', 80, True)
            string(detail.get('text'), 'detail.text', 500, True)
        route = event.get('routeFromPrevious')
        if index == 0 and route is not None:
            raise ValueError('First event cannot have routeFromPrevious')
        if route is not None:
            if not isinstance(route, dict) or route.get('type') != 'LineString' or not isinstance(route.get('coordinates'), list) or len(route['coordinates']) < 2:
                raise ValueError('routeFromPrevious must be a LineString')
            points = route['coordinates']
            for vertex in points:
                point(vertex)
            if any(abs(vertex[0] - points[j - 1][0]) > 180 for j, vertex in enumerate(points) if j):
                raise ValueError('Split antimeridian routes before displaying')
            if any(abs(a - b) >= 0.000001 for a, b in zip(points[0], previous['coordinates'])) or any(abs(a - b) >= 0.000001 for a, b in zip(points[-1], event['coordinates'])):
                raise ValueError('Route endpoints must match adjacent event coordinates')
        elif previous and abs(previous['coordinates'][0] - event['coordinates'][0]) > 180:
            raise ValueError('Split antimeridian schematic connections before displaying')
        previous = event


def build(data_path, out, *, basemap=None, overwrite=False):
    source, target = Path(data_path), Path(out)
    if source.resolve() == target.resolve():
        raise ValueError('Output must not replace input data')
    if target.exists() and not overwrite:
        raise ValueError('Output exists; pass --overwrite')
    data = json.loads(source.read_text(encoding='utf-8'))
    validate(data)
    basemap = normalize_basemap(basemap, theme='light')
    config = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    component = (ROOT / 'assets/components/story-timeline.mjs').read_text(encoding='utf-8')
    component += '\n' + (ROOT / 'assets/shared/basemap.mjs').read_text(encoding='utf-8')
    license_text = (ROOT / 'LICENSE').read_text(encoding='utf-8')
    document = '''<!doctype html><!-- __LICENSE__ -->
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1e2933}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}button,input{font:inherit}button{cursor:pointer}
#map{position:fixed;inset:0}.story{position:absolute;top:24px;left:24px;z-index:3;width:343px;max-width:calc(100vw - 48px);padding:25px 26px 24px;border:1px solid #e8ecef;border-radius:24px;background:#ffffffed;box-shadow:0 18px 55px #193e5a22;backdrop-filter:blur(22px)}
.eyebrow{margin:0 0 12px;color:#1978ab;font-size:11px;font-weight:750;letter-spacing:.13em}.story h1{margin:0;font-size:26px;line-height:1.18;letter-spacing:-.045em}.subtitle{margin:7px 0 21px;color:#82909b;font-size:12px;line-height:1.5}.divider{height:1px;background:#e8edf0;margin-bottom:19px}.chapter{display:flex;align-items:center;gap:8px;color:#1480b3;font-size:11px;font-weight:750}.chapter i{width:7px;height:7px;border-radius:50%;background:#2ea9cc;box-shadow:0 0 0 4px #2ea9cc23}.story h2{font-size:21px;line-height:1.3;letter-spacing:-.025em;margin:12px 0 8px}.date{color:#85949e;font-size:11px;font-weight:600}.summary{margin:15px 0 0;color:#526676;font-size:13px;line-height:1.72;max-height:22vh;overflow:auto}.details{display:grid;gap:10px;margin:17px 0 0;padding-top:14px;border-top:1px solid #edf0f2;max-height:19vh;overflow:auto}.details:empty{display:none}.details div{display:grid;gap:3px}.details dt{font-size:10px;color:#8c9aa4}.details dd{margin:0;color:#3f5565;font-size:12px;line-height:1.5}
.timeline{position:absolute;z-index:3;left:50%;bottom:24px;transform:translateX(-50%);width:min(860px,calc(100vw - 48px));padding:15px 20px 17px;border:1px solid #e6ebef;border-radius:21px;background:#fffffff0;box-shadow:0 15px 44px #17415c23;backdrop-filter:blur(22px)}.controls{display:flex;align-items:center;gap:15px}.icon{display:grid;place-items:center;width:40px;height:40px;flex:0 0 40px;border:0;border-radius:50%;background:#1378aa;color:#fff;font-size:14px}.icon:hover{background:#095e8a}.step{width:26px;height:30px;border:0;background:transparent;color:#667d8c;font-size:25px;line-height:1}.step:hover{color:#116f9c}.track{min-width:0;flex:1}.rail{width:100%;height:5px;margin:0;accent-color:#1676a8;cursor:pointer}.marks{display:flex;justify-content:space-between;gap:3px;margin-top:7px}.mark{max-width:22%;border:0;background:transparent;color:#93a1aa;text-align:center;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mark.active{color:#176d99;font-weight:750}.counter{min-width:45px;color:#748893;font-size:11px;text-align:right;font-variant-numeric:tabular-nums}.note{margin:10px 0 0;color:#8797a2;font-size:10px}.status{position:absolute;z-index:5;left:24px;bottom:150px;max-width:320px;padding:10px 14px;border-radius:10px;background:#fff;color:#5b6973;font-size:12px;box-shadow:0 8px 22px #123c5520}.status:empty{display:none}
.maplibregl-ctrl-top-right{top:24px;right:24px}.maplibregl-ctrl-bottom-right{right:8px;bottom:8px;z-index:5}.map-loading .maplibregl-ctrl-attrib{visibility:hidden}
button:focus-visible,input:focus-visible{outline:2px solid #0d83b8;outline-offset:3px}
@media(max-width:700px){.story{top:12px;left:12px;max-width:calc(100vw - 24px);width:min(330px,calc(100vw - 24px));max-height:min(32vh,275px);overflow:auto;padding:17px 19px}.story h1{font-size:21px}.subtitle{margin-bottom:12px}.divider{margin-bottom:11px}.story h2{font-size:18px;margin:8px 0 4px}.summary{margin-top:8px;max-height:none;font-size:12px}.details{max-height:none;margin-top:10px;padding-top:8px}.timeline{bottom:42px;width:calc(100vw - 24px);padding:11px 12px}.controls{gap:6px}.marks{display:none}.note{display:none}.status{left:12px;bottom:145px}.maplibregl-ctrl-top-right{top:12px;right:12px}}
</style></head><body class="map-loading"><div id="map"></div><section class="story" aria-label="故事章节"><p class="eyebrow">STORY MAP</p><h1 id="title"></h1><p id="subtitle" class="subtitle"></p><div class="divider"></div><span id="chapter" class="chapter"></span><h2 id="event-title"></h2><span id="date" class="date"></span><p id="summary" class="summary"></p><dl id="details" class="details"></dl></section>
<section class="timeline" aria-label="故事时间轴"><div class="controls"><button id="prev" class="step" type="button" aria-label="上一章">‹</button><button id="play" class="icon" type="button" aria-label="播放">▶</button><button id="next" class="step" type="button" aria-label="下一章">›</button><div class="track"><input id="range" class="rail" type="range" min="0" max="1000" value="0" aria-label="故事进度"><div id="marks" class="marks"></div></div><span id="counter" class="counter"></span></div><p id="note" class="note"></p></section>
<p id="status" class="status" role="status">地图加载中…</p><script id="story-data" type="application/json">__DATA__</script><script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script><script type="module">
__COMPONENT__
const basemapConfig=__BASEMAP__;
const $=id=>document.getElementById(id),raw=JSON.parse($('story-data').textContent);let map,story,basemapController,current=-1;
const mk=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
function render(state){if(!story)return;const events=story.data.events,index=state.eventIndex,event=events[index];if(current!==index){current=index;$('event-title').textContent=event.title;$('chapter').replaceChildren(mk('i',''),mk('span',event.chapter||`第 ${index+1} 章`));$('date').textContent=event.date||'';$('summary').textContent=event.summary||'';$('details').replaceChildren();for(const d of event.details){const row=mk('div','');row.append(mk('dt',d.label),mk('dd',d.text));$('details').append(row);}for(const [i,button] of [...$('marks').children].entries())button.classList.toggle('active',i===index);}$('range').value=String(Math.round(state.progress*1000));$('counter').textContent=`${index+1} / ${events.length}`;$('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'暂停':'播放');}
function padding(){return innerWidth<=700?{top:Math.min(innerHeight*.32,275)+25,right:35,bottom:155,left:35}:{top:70,right:70,bottom:165,left:390};}
function select(index){story.seekEvent(index,{select:true});}
function collapseAttribution(){const details=map.getContainer().querySelector('details.maplibregl-ctrl-attrib');if(details){details.open=false;details.classList.remove('maplibregl-compact-show');}document.body.classList.remove('map-loading');}
try{const data=normalizeStory(raw);$('title').textContent=data.title;$('subtitle').textContent=data.subtitle||'';if(!data.subtitle)$('subtitle').hidden=true;
  $('note').textContent=data.events.some(e=>e.routeKind==='schematic')?'虚线是章节间示意连接；动画不代表实际行进速度。':'轨迹动画按章节顺序展开，不代表实际行进速度。';
  map=new maplibregl.Map({container:'map',style:basemapConfig.styleUrl,center:data.events[0].coordinates,zoom:6,attributionControl:{compact:true}});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.on('error',()=>{$('status').textContent='地图资源加载失败，请检查网络。';collapseAttribution();});
  map.on('load',async()=>{try{basemapController=applyBasemap(map,basemapConfig,{theme:'light'});await basemapController.ready;await waitForBasemapStyle(map);if(basemapConfig.type==='terrain')map.setPitch(50);story=new StoryTimelineLayer(map,{data:raw,padding:padding(),onChange:render});$('marks').replaceChildren();data.events.forEach((event,i)=>{const b=mk('button',event.date||String(i+1));b.type='button';b.className='mark';b.title=event.title;b.setAttribute('aria-label',`第 ${i+1} 章：${event.title}`);b.onclick=()=>select(i);$('marks').append(b);});story.fit();story.setProgress(0);$('status').textContent='';collapseAttribution();}catch(error){$('status').textContent='故事无法显示：'+error.message;}});
  $('play').onclick=()=>{if(!story)return;if(story.playing){story.pause();return;}if(matchMedia('(prefers-reduced-motion: reduce)').matches){story.seekEvent(story.data.events.length-1);return;}story.play({duration:Math.max(9000,(story.data.events.length-1)*3000)});};
  $('prev').onclick=()=>{if(story)select(Math.max(0,Math.floor(story.progress*(story.data.events.length-1)+1e-9)-1));};
  $('next').onclick=()=>{if(story)select(Math.min(story.data.events.length-1,Math.floor(story.progress*(story.data.events.length-1)+1e-9)+1));};
  $('range').oninput=e=>{if(!story)return;story.pause();story.setProgress(Number(e.target.value)/1000);};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)story?.pause();});
  window.addEventListener('resize',()=>{if(story){story.padding=padding();map.resize();story.fit();}});
  window.addEventListener('pagehide',()=>{story?.destroy();basemapController?.destroy();map?.remove();},{once:true});
}catch(error){$('status').textContent='故事数据不完整：'+error.message;}
</script></body></html>'''
    replacements = {'__LICENSE__': license_text, '__TITLE__': html.escape(data.get('title') or '故事地图'), '__DATA__': config, '__COMPONENT__': component, '__BASEMAP__': json.dumps(basemap, ensure_ascii=False).replace('<', r'\u003c')}
    document = re.sub('|'.join(map(re.escape, replacements)), lambda match: replacements[match.group()], document)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('w' if overwrite else 'x', encoding='utf-8') as handle:
        handle.write(document)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data')
    parser.add_argument('--out', required=True)
    parser.add_argument('--basemap',type=Path,help='JSON basemap configuration with authorized imagery/DEM resources')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    try:
        print(f'Generated {build(args.data, args.out, basemap=read_basemap_file(args.basemap), overwrite=args.overwrite)}')
    except (ValueError, TypeError, OSError, json.JSONDecodeError) as error:
        parser.exit(2, f'{error}\n')
