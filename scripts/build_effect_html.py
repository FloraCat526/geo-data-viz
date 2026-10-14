#!/usr/bin/env python3
"""Export MapLibre effects with embedded component and data; no build step required."""
import argparse
import html
import json
import math
import re
from effect_input import prepare
from effect_locale import translate
from visual_bundle import bundle_visualizations
from build_errors import diagnostic
from basemap_config import normalize_basemap, read_basemap_file
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def build(data_path, out, *, effect, title='地图可视化', theme='dark', cell_size=500, aggregation='count', value_field=None, height_scale=10, radius_meters=18000, scan_period=6000, sweep_angle=100, opacity=.58, color='#38bdf8', detail_fields=(), locale='zh-CN', basemap=None, overwrite=False):
    if Path(data_path).resolve() == Path(out).resolve(): raise ValueError('Output must not replace input data')
    if Path(out).exists() and not overwrite: raise ValueError('Output already exists; choose another path or explicitly use overwrite')
    if locale not in ('zh-CN','en') or theme not in ('dark','light'): raise ValueError('Unsupported locale or theme')
    if effect not in ('flight', 'pulse', 'radar', 'hexagon'): raise ValueError('Unknown effect')
    if effect == 'hexagon':
        if aggregation not in ('count','sum','mean') or aggregation != 'count' and not value_field: raise ValueError('Metric aggregation requires value_field')
        if any(isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) for v in (cell_size,height_scale)): raise ValueError('Sizes must be finite numbers')
        if not 10 <= cell_size <= 50000 or not 0 < height_scale < float('inf'): raise ValueError('Invalid cell size or height scale')
    if effect == 'radar' and (not isinstance(radius_meters, (int,float)) or isinstance(radius_meters,bool) or not math.isfinite(radius_meters) or not 100 <= radius_meters <= 100000 or not isinstance(scan_period, (int,float)) or isinstance(scan_period,bool) or not math.isfinite(scan_period) or not 2000 <= scan_period <= 30000):
        raise ValueError('Radar radius must be 100–100000 metres and scan period 2000–30000 milliseconds')
    if effect == 'radar':
        if isinstance(sweep_angle,bool) or not isinstance(sweep_angle,(int,float)) or not math.isfinite(sweep_angle) or not 10 <= sweep_angle <= 180:
            raise ValueError('Radar sweepAngle must be 10–180 degrees')
        if isinstance(opacity,bool) or not isinstance(opacity,(int,float)) or not math.isfinite(opacity) or not 0 <= opacity <= 1:
            raise ValueError('Radar opacity must be 0–1')
        if not isinstance(color,str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',color):
            raise ValueError('Radar color must be #RRGGBB')
    basemap = normalize_basemap(basemap, theme=theme)
    data = json.loads(Path(data_path).read_text())
    if effect == 'flight' and not isinstance(data, list):
        raise ValueError('flight expects normalized OD rows; see references/maplibre-effects.md')
    if effect in ('pulse','radar','hexagon') and (not isinstance(data, dict) or data.get('type') != 'FeatureCollection'):
        raise ValueError('Expected GeoJSON FeatureCollection')
    data, bounds = prepare(data, effect, aggregation, value_field, detail_fields, radar_radius_meters=radius_meters)
    config = json.dumps({'basemap':basemap, 'bounds':bounds, 'locale':locale, 'effect': effect, 'title': title, 'theme': theme, 'data': data, 'cellSize':cell_size, 'aggregation':aggregation, 'valueField':value_field, 'heightScale':height_scale, 'radiusMeters':radius_meters, 'scanPeriod':scan_period, 'sweepAngle':sweep_angle, 'opacity':opacity, 'color':color}, ensure_ascii=False).replace('<', '\\u003c')
    module = bundle_visualizations(ROOT)
    license_text = (ROOT/'LICENSE').read_text()
    doc = '''<!doctype html><!-- __LICENSE__ --><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css">
<style>body{margin:0;font:14px system-ui;background:#101826;color:#e2e8f0}#map{position:fixed;inset:0}.maplibregl-ctrl-bottom-right{right:8px;bottom:8px;z-index:5}aside{position:absolute;left:20px;top:20px;width:250px;padding:20px;background:#111d2bed;border:1px solid #334155;border-radius:18px;max-height:75vh;overflow:auto}h1{font-size:22px;margin:0 0 12px}button,select{font:inherit;padding:8px 12px;border:1px solid #41536c;border-radius:9px;background:#1b3049;color:#e2e8f0;cursor:pointer}button:hover,select:hover{border-color:#22d3ee}label{display:block;margin-top:12px}body.light button,body.light select{background:#eff6ff;color:#172033}#detail{white-space:pre-wrap;line-height:1.8}small{display:block;line-height:1.7;margin:12px 0;color:#94a3b8}body.light aside{background:#ffffffed;color:#172033}body.light small{color:#475569}.swatch{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:8px}#legend div{margin:8px 0}@media(max-width:900px){aside{top:auto;bottom:36px;left:12px;right:12px;width:auto;padding:14px 18px;max-height:23vh}h1{font-size:18px;margin-bottom:8px}small{margin:7px 0}}</style>
<div id="map"></div><aside><h1>__TITLE__</h1><button id="pause">暂停动画</button><small id="note"></small><div id="legend"></div><p id="status" role="status">正在加载地图…</p><div id="detail"></div></aside>
<script id="config" type="application/json">__CONFIG__</script>
<script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>__DECK__
<script type="module">
__MODULE__
const cfg=JSON.parse(document.getElementById('config').textContent),$=id=>document.getElementById(id);document.body.className=cfg.theme;
let effect,map,basemapController;
try{
 map=new maplibregl.Map({container:'map',style:cfg.basemap.styleUrl,center:[0,20],zoom:1,attributionControl:{compact:true}});map.addControl(new maplibregl.NavigationControl());
 const collapseAttribution=()=>{const attribution=map.getContainer().querySelector('details.maplibregl-ctrl-attrib');if(attribution){attribution.open=false;attribution.classList.remove('maplibregl-compact-show');}};collapseAttribution();map.on('load',()=>requestAnimationFrame(collapseAttribution));
 map.on('error',()=>{$('status').textContent='地图资源加载失败，请检查网络后刷新。';});
 map.on('load',async()=>{try{
 basemapController=applyBasemap(map,cfg.basemap,{theme:cfg.theme});await basemapController.ready;await waitForBasemapStyle(map);if(cfg.basemap.type==='terrain')map.setPitch(50);
 const onPick=({items})=>{const obj=items[0];if(cfg.effect==='hexagon'){const p=obj.properties;$('detail').textContent=`位置数量：${p.count}\n聚合值：${p.value??'无指标数据'}`+(cfg.aggregation==='count'?'':`\n有效指标：${p.validCount} · 缺失：${p.missingCount}`);return;}$('detail').textContent=Object.entries(obj.properties??obj).filter(([k,v])=>!k.startsWith('__')&&!['path','timestamps','offset','color','source','target'].includes(k)&&typeof v!=='object').map(([k,v])=>`${k}: ${v}`).join('\\n');};
 const specific={flight:{deck:window.deck},pulse:{},radar:{radiusMeters:cfg.radiusMeters,period:cfg.scanPeriod,sweepAngle:cfg.sweepAngle,opacity:cfg.opacity,color:cfg.color},hexagon:{cellSize:cfg.cellSize,aggregation:cfg.aggregation,valueField:cfg.valueField,heightScale:cfg.heightScale}};
 effect=createViz(map,{effect:cfg.effect,provider:'maplibre',data:cfg.data,theme:cfg.theme,onPick,spec:specific[cfg.effect]});
 const points=(cfg.effect==='flight')?cfg.data.flatMap(r=>[r.source,r.target]):cfg.data.features.map(f=>f.geometry.coordinates);
 if(cfg.bounds){const b=cfg.bounds;map.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:{top:55,bottom:innerWidth>900?70:260,left:innerWidth>900?330:45,right:45},maxZoom:11,duration:0});}if(cfg.effect==='flight')map.setPitch(35);
 $('note').textContent={flight:'弧线高度与流光仅示意连接及方向，不代表实际航迹、飞行高度或频次。',pulse:'呼吸光晕用于强调位置，不代表影响范围或实时状态。',radar:'扫描半径是可视化参数，不代表实际雷达覆盖或实时回波。',hexagon:''}[cfg.effect];
 if((cfg.effect==='flight')){const groups=new Map();cfg.data.forEach(r=>groups.set(r.category??r.region??'连接',r.color??'#38bdf8'));for(const [name,color] of groups){const item=document.createElement('div'),dot=document.createElement('span');dot.className='swatch';dot.style.background=color;item.append(dot,document.createTextNode(name));$('legend').append(item);}}
 if(cfg.effect==='hexagon'){
 $('pause').remove();
 const mode=document.createElement('button');mode.textContent='切换 3D';mode.onclick=()=>{const next=effect.inspect().mode==='flat'?'3d':'flat';effect.setMode(next);map.easeTo({pitch:next==='3d'?50:0});mode.textContent=next==='3d'?'切换平面':'切换 3D';};$('note').before(mode);
 const label=document.createElement('label');label.textContent=' 蜂窝边长 ';const size=document.createElement('select');size.setAttribute('aria-label','蜂窝边长');
 [...new Set([250,500,1000,2000,cfg.cellSize])].sort((a,b)=>a-b).forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n+' m';o.selected=n===cfg.cellSize;size.append(o);});label.append(size);mode.after(label);
 const legend=()=>{const s=effect.inspect();$('note').textContent=`${s.cells} 个蜂窝 · ${s.inputCount} 个位置 · ${cfg.aggregation==='count'?'点数':cfg.aggregation==='sum'?'总和':'均值'}${cfg.valueField?'（'+cfg.valueField+'）':''}。3D 高度：每单位 ${cfg.heightScale} 米，非实际建筑高度。`;$('legend').textContent=`颜色：青 → 紫 → 粉 · 0–${Number(s.maximum.toFixed(2))}`;};size.onchange=()=>{effect.setCellSize(Number(size.value));legend();};legend();
 }else{
 const sync=()=>{$('pause').textContent=effect.inspect().paused?'播放动画':'暂停动画';};sync();$('pause').onclick=()=>{effect.inspect().paused?effect.play():effect.pause();sync();};}
 $('status').textContent=points.length?'':'没有可显示的数据';
 }catch(error){$('status').textContent='可视化初始化失败：'+error.message;}});
 window.addEventListener('pagehide',()=>{effect?.destroy();basemapController?.destroy();map.remove();},{once:true});
}catch(error){$('status').textContent='初始化失败：'+error.message;}
</script></html>'''
    doc = translate(doc, locale)
    replacements={'__LICENSE__':license_text,'__TITLE__':html.escape(title),'__CONFIG__':config,'__MODULE__':module,'__DECK__':'<script src="https://unpkg.com/deck.gl@9.1.14/dist.min.js"></script>' if effect == 'flight' else ''}
    # Substitute in one pass so user strings cannot be interpreted as template markers.
    doc=re.sub('|'.join(map(re.escape,replacements)),lambda m:replacements[m.group()],doc)
    Path(out).parent.mkdir(parents=True,exist_ok=True)
    with Path(out).open('w' if overwrite else 'x', encoding='utf-8') as handle:
        handle.write(doc)
    return Path(out)

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data');parser.add_argument('--effect',choices=['flight','pulse','radar','hexagon'],required=True)
    parser.add_argument('--out',required=True);parser.add_argument('--title',default='地图可视化');parser.add_argument('--theme',choices=['dark','light'],default='dark')
    parser.add_argument('--cell-size',type=float,default=500);parser.add_argument('--aggregation',choices=['count','sum','mean'],default='count');parser.add_argument('--value-field');parser.add_argument('--height-scale',type=float,default=10)
    parser.add_argument('--radius-meters',type=float,default=18000);parser.add_argument('--scan-period',type=float,default=6000)
    parser.add_argument('--sweep-angle',type=float,default=100);parser.add_argument('--opacity',type=float,default=.58);parser.add_argument('--color',default='#38bdf8')
    parser.add_argument('--basemap',type=Path,help='JSON basemap configuration with authorized imagery/DEM resources')
    parser.add_argument('--locale',choices=['zh-CN','en'],default='zh-CN');parser.add_argument('--detail-field',action='append',default=[]);parser.add_argument('--overwrite',action='store_true')
    args=parser.parse_args()
    try:
        build(args.data,args.out,effect=args.effect,title=args.title,theme=args.theme,cell_size=args.cell_size,aggregation=args.aggregation,value_field=args.value_field,height_scale=args.height_scale,radius_meters=args.radius_meters,scan_period=args.scan_period,sweep_angle=args.sweep_angle,opacity=args.opacity,color=args.color,detail_fields=args.detail_field,locale=args.locale,basemap=read_basemap_file(args.basemap),overwrite=args.overwrite)
    except (ValueError,TypeError,OSError) as exc:
        parser.exit(2,diagnostic(exc))
    print(f'Generated {args.out}; browser verification required. SDK and basemap require internet.')
