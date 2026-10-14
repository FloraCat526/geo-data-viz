#!/usr/bin/env python3
"""Build a standalone MapLibre travel itinerary from user-supplied itinerary JSON."""
import argparse
import html
import json
import math
import re
from pathlib import Path
from basemap_config import normalize_basemap, read_basemap_file

ROOT = Path(__file__).resolve().parents[1]


def validate(data):
    if not isinstance(data, dict) or not isinstance(data.get('days'), list) or not data['days']:
        raise ValueError('Input must be an itinerary object with nonempty days')
    metadata = data.get('metadata', {})
    if not isinstance(metadata, dict) or metadata.get('dataCrs', 'wgs84') != 'wgs84':
        raise ValueError('Itinerary data must be verified WGS84')
    def string(value, name, maximum, *, required=False):
        if value is None and not required:
            return
        if not isinstance(value, str) or len(value) > maximum or required and not value.strip():
            raise ValueError(f'{name} must be text of at most {maximum} characters')
    string(data.get('title'), 'title', 150)
    seen_days, seen_stops = set(), set()

    def coordinate(point):
        if not isinstance(point, list) or len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point):
            raise ValueError('Coordinates must be WGS84 [longitude, latitude]')
        if abs(point[0]) > 180 or abs(point[1]) > 85:
            raise ValueError('Coordinates exceed supported Mercator bounds')

    for day in data['days']:
        if not isinstance(day, dict) or not isinstance(day.get('stops'), list) or not day['stops']:
            raise ValueError('Each day needs a nonempty stops array')
        day_id = day.get('id')
        if not isinstance(day_id, str) or not re.fullmatch(r'[A-Za-z][\w-]*', day_id) or day_id in seen_days:
            raise ValueError('Day IDs must be unique and URL-safe')
        string(day_id, 'day.id', 80, required=True)
        seen_days.add(day_id)
        string(day.get('label'), 'day.label', 80)
        if 'color' in day and (not isinstance(day['color'], str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', day['color'])):
            raise ValueError('day.color must be #RRGGBB')
        if day.get('date') and (not isinstance(day['date'], str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day['date'])):
            raise ValueError('day.date must be YYYY-MM-DD')
        for stop in day['stops']:
            if not isinstance(stop, dict):
                raise ValueError('Each stop must be an object')
            stop_id = stop.get('id')
            if not isinstance(stop_id, str) or not re.fullmatch(r'[A-Za-z][\w-]*', stop_id) or stop_id in seen_stops:
                raise ValueError('Stop IDs must be unique and URL-safe')
            string(stop_id, 'stop.id', 80, required=True)
            seen_stops.add(stop_id)
            string(stop.get('name'), 'stop.name', 120, required=True)
            coordinate(stop.get('coordinates'))
            for field, maximum in (('time', 80), ('tag', 80), ('summary', 1000)):
                string(stop.get(field), f'stop.{field}', maximum)
            if stop.get('details') is not None:
                if not isinstance(stop['details'], list):
                    raise ValueError('stop.details must be an array')
                for detail in stop['details']:
                    if not isinstance(detail, dict):
                        raise ValueError('Each detail must have a label and text')
                    string(detail.get('label'), 'detail.label', 80, required=True)
                    string(detail.get('text'), 'detail.text', 500, required=True)
        route = day.get('route')
        if route is not None:
            if not isinstance(route, dict) or route.get('type') != 'LineString' or not isinstance(route.get('coordinates'), list) or len(route['coordinates']) < 2:
                raise ValueError('day.route must be a LineString with at least two vertices')
            previous = None
            for point in route['coordinates']:
                coordinate(point)
                if previous is not None and abs(point[0] - previous[0]) > 180:
                    raise ValueError('Split paths at the antimeridian before displaying')
                previous = point


def build(data_path, out, *, title=None, basemap=None, overwrite=False):
    source, target = Path(data_path), Path(out)
    if source.resolve() == target.resolve():
        raise ValueError('Output must not replace input data')
    if target.exists() and not overwrite:
        raise ValueError('Output exists; choose another path or pass --overwrite')
    data = json.loads(source.read_text(encoding='utf-8'))
    data = dict(data)
    if title is not None:
        data['title'] = title
    validate(data)
    basemap = normalize_basemap(basemap, theme='light')
    # The embedded module performs the complete schema validation before any layers are added.
    config = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026')
    component = (ROOT / 'assets/components/travel-itinerary.mjs').read_text(encoding='utf-8')
    component += '\n' + (ROOT / 'assets/shared/basemap.mjs').read_text(encoding='utf-8')
    license_text = (ROOT / 'LICENSE').read_text(encoding='utf-8')
    document = '''<!doctype html><!-- __LICENSE__ -->
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d1d1f}
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;overflow:hidden}
button{font:inherit;cursor:pointer}
#map{position:fixed;inset:0}
.panel{position:absolute;z-index:3;top:24px;right:24px;width:344px;max-height:calc(100vh - 48px);min-height:0;display:flex;flex-direction:column;padding:24px;border:1px solid #e9eaec;border-radius:22px;background:#fffffff7;box-shadow:0 18px 48px #2536481f;backdrop-filter:blur(20px)}
.panel-head{display:flex;flex-direction:column;gap:7px;margin-bottom:20px}
.panel h1{margin:0;font-size:25px;font-weight:750;line-height:1.2;letter-spacing:-.045em;overflow-wrap:anywhere}
.count{color:#86868b;font-size:12px;font-weight:600;letter-spacing:.01em}
.day-tabs{display:flex;gap:3px;overflow-x:auto;padding:3px;background:#f1f2f4;border-radius:11px;scrollbar-width:none}
.day-tabs::-webkit-scrollbar{display:none}
.day-tabs button{flex:1;white-space:nowrap;border:0;border-radius:8px;padding:9px 10px;background:transparent;color:#6e7178;font-size:12px;font-weight:650;transition:background .18s,color .18s}
.day-tabs button[aria-selected="true"]{background:#fff;color:#242a32;box-shadow:0 1px 5px #15253618}
.day-tabs button:focus-visible,.day-card:focus-visible,.stop:focus-visible{outline:2px solid #007aff;outline-offset:2px}
.list{flex:0 1 auto;min-height:0;overflow:auto;padding-top:9px;scrollbar-color:#d7d9dd transparent}
.day-card,.stop{width:100%;display:flex;align-items:center;gap:12px;padding:15px 2px;border:0;border-bottom:1px solid #eceef0;border-radius:0;background:transparent;text-align:left;margin:0}
.day-card:last-child,.stop:last-child{border-bottom:0}
.day-card:hover,.stop:hover{background:#f6f7f8}
.day-card .swatch{height:29px;width:4px;border-radius:4px;flex:0 0 4px}
.day-card strong,.stop strong{display:block;font-size:13px;font-weight:650;color:#23282f}
.day-card small,.stop small{display:block;margin-top:5px;color:#858992;font-size:11px;line-height:1.45}
.day-card .arrow{margin-left:auto;color:#a5a9af;font-size:21px;line-height:1}
.stop .num{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:var(--day-color);color:#fff;font-size:11px;font-weight:700}
.stop.active strong{color:var(--day-color)}
.stop .when{margin-left:auto;color:#969aa2;font-size:11px;white-space:nowrap}
.note{margin:13px 0 0;color:#999da5;font-size:10px;line-height:1.4}
.note:empty{display:none}
.status{position:absolute;z-index:4;left:24px;bottom:24px;max-width:340px;padding:10px 13px;border-radius:10px;background:#fffffff0;color:#596b79;font-size:11px;box-shadow:0 6px 20px #18344916}
.status:empty{display:none}
.maplibregl-ctrl-top-right{right:380px;top:24px}
.maplibregl-ctrl-bottom-right{right:8px;bottom:8px;z-index:5}
.map-loading .maplibregl-ctrl-attrib{visibility:hidden}
.popup{min-width:240px;max-width:310px;padding:18px 20px 19px;border-top:3px solid var(--stop-accent,#37699c);font-family:inherit}
.popup-top{display:flex;align-items:center;gap:7px;margin:0 22px 10px 0}
.popup .step{font-size:10px;font-weight:750;color:var(--stop-accent,#37699c)}
.popup .tag{display:inline-block;padding:4px 8px;border-radius:99px;background:color-mix(in srgb,var(--stop-accent,#37699c) 10%,white);color:var(--stop-accent,#37699c);font-size:10px;font-weight:650}
.popup h3{margin:0;font-size:18px;line-height:1.3;letter-spacing:-.025em;color:#1d1d1f}
.popup .time{display:block;margin-top:7px;color:#86868b;font-size:11px;font-weight:650}
.popup p{margin:11px 0 0;color:#59616c;font-size:12px;line-height:1.6}
.popup dl{margin:12px 0 0;display:grid;gap:8px}
.popup dl div{border-top:1px solid #eceef0;padding-top:8px}
.popup dt{font-size:10px;color:#8b8e94}
.popup dd{margin:3px 0 0;color:#444a53;font-size:11px;line-height:1.5}
.maplibregl-popup-content{padding:0;border-radius:16px;overflow:hidden;box-shadow:0 16px 42px #0e2a3b2b}
.maplibregl-popup-close-button{top:10px;right:11px;width:25px;height:25px;border-radius:50%;color:#81858c;font-size:18px}
.maplibregl-popup-close-button:hover{background:#f1f2f4;color:#323842}
@media(max-width:760px){
 .panel{top:auto;right:12px;bottom:48px;left:12px;width:auto;height:min(43vh,365px);max-height:none;padding:18px;border-radius:20px}
 .panel-head{gap:5px;margin-bottom:15px}
 .panel h1{font-size:21px}
 .list{padding-top:6px}
 .note{display:none}
 .status{left:12px;bottom:calc(min(43vh,365px) + 58px)}
 .maplibregl-ctrl-top-right{right:12px;top:16px}
}
</style></head><body class="map-loading"><div id="map"></div><section class="panel" aria-label="旅行行程"><div class="panel-head"><h1 id="title"></h1><span id="count" class="count"></span></div><div id="tabs" class="day-tabs" role="tablist" aria-label="选择日期"></div><div id="list" class="list"></div><p id="note" class="note"></p></section><p id="status" class="status" role="status">地图加载中…</p><script id="itinerary-data" type="application/json">__DATA__</script><script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script><script type="module">
__COMPONENT__
const basemapConfig=__BASEMAP__;
const raw=JSON.parse(document.getElementById('itinerary-data').textContent),$=id=>document.getElementById(id);
let map,journey,popup,basemapController;
function text(tag,value,cls){const el=document.createElement(tag);el.textContent=value;if(cls)el.className=cls;return el;}
function showPopup(stop){popup?.remove();const body=document.createElement('div');body.className='popup';const day=journey.data.days.find(item=>item.id===stop.dayId);body.style.setProperty('--stop-accent',day?.color??'#37699c');const top=document.createElement('div');top.className='popup-top';top.append(text('span',`${day?.label??'行程'} · 第 ${stop.order} 站`,'step'));if(stop.tag)top.append(text('span',stop.tag,'tag'));body.append(top,text('h3',stop.name));if(stop.time)body.append(text('span',stop.time,'time'));if(stop.summary)body.append(text('p',stop.summary));if(stop.details.length){const list=document.createElement('dl');for(const item of stop.details){const row=document.createElement('div');row.append(text('dt',item.label),text('dd',item.text));list.append(row);}body.append(list);}popup=new maplibregl.Popup({offset:22,maxWidth:'340px'}).setLngLat(stop.coordinates).setDOMContent(body).addTo(map);render();}
function render(){const data=journey.data,selected=data.days.find(day=>day.id===journey.dayId),days=data.days,stopCount=days.reduce((n,day)=>n+day.stops.length,0);$('title').textContent=data.title;$('count').textContent=selected?`${selected.date?selected.date+' · ':''}${selected.stops.length} 个地点`:`${days.length} 天 · ${stopCount} 个地点`;
 $('tabs').replaceChildren();for(const day of [null,...days]){const button=text('button',day?.label??'总览');button.type='button';button.role='tab';button.setAttribute('aria-selected',String(journey.dayId===(day?.id??null)));button.onclick=()=>{popup?.remove();journey.setDay(day?.id??null);render();};$('tabs').append(button);}
 $('list').replaceChildren();
 if(!selected){for(const day of days){const button=document.createElement('button');button.className='day-card';button.type='button';const swatch=text('span','', 'swatch');swatch.style.background=day.color;const body=document.createElement('span');body.append(text('strong',day.label+(day.date?' · '+day.date:'')),text('small',`${day.stops.length} 站 · ${day.stops[0].name} → ${day.stops.at(-1).name}`));button.append(swatch,body,text('span','›','arrow'));button.onclick=()=>{journey.setDay(day.id);render();};$('list').append(button);}}
 else for(const stop of selected.stops){const button=document.createElement('button');button.className='stop'+(journey.stopId===stop.id?' active':'');button.type='button';button.style.setProperty('--day-color',selected.color);button.append(text('span',String(stop.order),'num'));const body=document.createElement('span');body.append(text('strong',stop.name));if(stop.tag||stop.summary)body.append(text('small',stop.tag||stop.summary));button.append(body);if(stop.time)button.append(text('span',stop.time,'when'));button.onclick=()=>journey.selectStop(stop.id);$('list').append(button);}
 const schematic=(selected?[selected]:days).some(day=>day.routeKind==='schematic'&&day.stops.length>1);$('note').textContent=schematic?'虚线仅示顺序，非实际道路':'';$('status').textContent='';}
function fitPadding(){return innerWidth<=760?{top:70,right:100,bottom:Math.min(innerHeight*.43,365)+96,left:100}:{top:70,right:400,bottom:70,left:60};}
function onResize(){if(!journey)return;journey.padding=fitPadding();map.resize();journey.fit();}
try{
 const data=normalizeItinerary(raw);
 map=new maplibregl.Map({container:'map',style:basemapConfig.styleUrl,center:data.days[0].stops[0].coordinates,zoom:10,attributionControl:{compact:true}});
 map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
 // MapLibre's compact control starts expanded until the first map movement.
 const collapseAttribution=()=>{const attribution=map.getContainer().querySelector('details.maplibregl-ctrl-attrib');if(attribution){attribution.open=false;attribution.classList.remove('maplibregl-compact-show');}document.body.classList.remove('map-loading');};
 map.on('error',()=>{if(document.body.classList.contains('map-loading'))collapseAttribution();$('status').textContent='地图资源加载失败，请检查网络后刷新。';});
 map.on('load',async()=>{try{basemapController=applyBasemap(map,basemapConfig,{theme:'light'});await basemapController.ready;await waitForBasemapStyle(map);if(basemapConfig.type==='terrain')map.setPitch(50);journey=new TravelItineraryLayer(map,{data,padding:fitPadding(),onSelect:showPopup});if(innerWidth<=760)journey.setDay(data.days[0].id,{fit:false});journey.fit();render();collapseAttribution();}catch(error){$('status').textContent='行程无法显示：'+error.message;}});
 window.addEventListener('resize',onResize);
 window.addEventListener('pagehide',()=>{window.removeEventListener('resize',onResize);popup?.remove();journey?.destroy();basemapController?.destroy();map?.remove();},{once:true});
}catch(error){$('status').textContent='行程数据不完整：'+error.message;}
</script></body></html>'''
    replacements = {'__LICENSE__': license_text, '__TITLE__': html.escape(str(data.get('title') or '旅行规划')),
                    '__DATA__': config, '__COMPONENT__': component, '__BASEMAP__': json.dumps(basemap, ensure_ascii=False).replace('<', r'\u003c')}
    document = re.sub('|'.join(map(re.escape, replacements)), lambda match: replacements[match.group()], document)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('w' if overwrite else 'x', encoding='utf-8') as handle:
        handle.write(document)
    return target


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', help='Itinerary JSON created from the user-provided files')
    parser.add_argument('--out', required=True)
    parser.add_argument('--title')
    parser.add_argument('--basemap',type=Path,help='JSON basemap configuration with authorized imagery/DEM resources')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    try:
        result = build(args.data, args.out, title=args.title, basemap=read_basemap_file(args.basemap), overwrite=args.overwrite)
    except (ValueError, TypeError, OSError, json.JSONDecodeError) as error:
        parser.exit(2, f'{error}\n')
    print(f'Generated {result}; inspect route semantics and browser rendering before delivery.')
