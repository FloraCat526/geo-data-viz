#!/usr/bin/env python3
"""Package profiled WGS84 data and an agent-authored visual spec into local HTML."""
import argparse
import html
import json
import math
import os
import re
from pathlib import Path
from profile_geo import validate_geometry, spatial_summary

SDK_VERSION = '3.28.1'
EFFECTS = {'points': {'Point'}, 'bubble': {'Point'}, 'cluster': {'Point'}, 'heatmap': {'Point'},
           'line': {'LineString', 'MultiLineString'}, 'fill': {'Polygon', 'MultiPolygon'},
           'extrusion': {'Polygon', 'MultiPolygon'}}


def inline_json(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False).replace('<', r'\u003c').replace('\u2028', r'\u2028').replace('\u2029', r'\u2029')


def build(data_path, spec_path, output, token_env=None):
    if output.exists():
        raise ValueError('Output already exists; choose a new path to preserve existing work.')
    data = json.loads(data_path.read_text(encoding='utf-8'))
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    if data.get('type') != 'FeatureCollection' or not data.get('features'):
        raise ValueError('No features to render.')
    if data.get('metadata', {}).get('dataCrs') != 'wgs84':
        raise ValueError('Input must be profiled with verified WGS84 coordinates; transform other datums first.')
    if not isinstance(spec.get('title'), str) or not isinstance(spec.get('description'), str):
        raise ValueError('Spec requires title and description explaining the actual data and choice.')
    token = os.environ.get(token_env, '') if token_env else ''
    if token_env and not token:
        raise ValueError('The explicitly selected Token environment variable is empty.')
    if token and not token.startswith('pk.'):
        raise ValueError('Only a browser public Mapbox Token is accepted; never embed a secret token.')
    # Explicitly project presentation fields; unrelated source properties stay local.
    clean, points, ids = [], [], set()
    for f in data['features']:
        if not isinstance(f.get('id'), str) or f['id'] in ids:
            raise ValueError('Unique normalized feature IDs required.')
        ids.add(f['id'])
        coords, _ = validate_geometry(f['geometry'])
        points.extend(coords)
        viz = f.get('properties', {}).get('__viz', {})
        clean.append({'type': 'Feature', 'id': f['id'], 'geometry': f['geometry'],
                      'properties': {'__viz': {k: viz.get(k) for k in ('value', 'label', 'category', 'time')}}})
    allowed = ('title', 'description', 'sourceLabel', 'effect', 'unit', 'weight', 'sizeMode', 'heightScale')
    base = {k: spec[k] for k in allowed if k in spec}
    configs = [base]
    for alt in spec.get('alternatives', []):
        # Alternative mappings must be explicit; do not inherit heat or height semantics.
        configs.append({**{k: base[k] for k in ('title','description','sourceLabel','unit') if k in base},
                        **{k: alt[k] for k in allowed if k in alt}})
    values = [f['properties']['__viz']['value'] for f in clean]
    nums = [v for v in values if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)]
    for c in configs:
        effect = c.get('effect')
        if effect not in EFFECTS or any(f['geometry']['type'] not in EFFECTS[effect] for f in clean):
            raise ValueError('Effect and geometries do not match; transform or select the intended geometry layer first.')
        metric = effect in {'bubble','fill','extrusion'} or (effect == 'heatmap' and c.get('weight') == 'value')
        if metric and (not nums or not c.get('unit')):
            raise ValueError('Metric effects require finite values and a unit (dimensionless metrics may say dimensionless).')
        if effect == 'heatmap' and c.get('weight') not in {'count','value'}:
            raise ValueError('Heatmap requires explicit count or value weight.')
        if effect == 'bubble' and any(v < 0 for v in nums) and c.get('sizeMode') != 'absolute':
            raise ValueError('Signed bubbles require explicit absolute size with sign encoding.')
        if (effect == 'extrusion' or (effect == 'heatmap' and c.get('weight') == 'value')) and any(v < 0 for v in nums):
            raise ValueError('Negative height/heat contribution is unsupported.')
        if effect == 'extrusion':
            scale = c.get('heightScale')
            if isinstance(scale, bool) or not isinstance(scale, (float,int)) or not math.isfinite(scale) or scale <= 0 or any(not math.isfinite(v*scale) for v in nums):
                raise ValueError('Extrusion needs finite positive metres-per-unit heightScale and finite heights.')
    payload = {'data': {'type':'FeatureCollection','metadata':{'dataCrs':'wgs84'},'features':clean},
               'configs':configs, 'view':spatial_summary(points), 'token':token}
    module = (Path(__file__).resolve().parents[1]/'assets/recipes/mapbox-layers.mjs').read_text(encoding='utf-8')
    if '</script' in module.lower():
        raise ValueError('Recipe cannot be safely embedded as an inline module.')
    substitutions = {'TITLE': html.escape(base['title']), 'SDK_VERSION': SDK_VERSION, 'MODULE': module, 'PAYLOAD': inline_json(payload)}
    document = re.sub(r'__(TITLE|SDK_VERSION|MODULE|PAYLOAD)__', lambda match: substitutions[match.group(1)], TEMPLATE)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open('x', encoding='utf-8') as target:
        target.write(document)
    return {'html':str(output.resolve()), 'features':len(clean), 'effects':[c['effect'] for c in configs],
            'sdkVersion':SDK_VERSION, 'verification':'pending-browser' if token else 'pending-key',
            'containsBrowserToken':bool(token)}


TEMPLATE = '''<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#07111f;color:#e2e8f0;font:15px/1.6 system-ui,sans-serif}#map{position:fixed;inset:0}
.panel{position:absolute;z-index:2;top:22px;left:22px;width:min(360px,calc(100% - 44px));background:#0b142beF;border:1px solid #334155;border-radius:18px;padding:20px;box-shadow:0 12px 45px #0006;max-height:calc(100vh - 110px);overflow:auto;backdrop-filter:blur(16px)}
h1{font-size:24px;margin:0 0 10px;line-height:1.25}p{margin:8px 0;color:#bdcce2}button,select{font:inherit;background:#172b48;color:#e2e8f0;border:1px solid #64748b;border-radius:7px;padding:5px 10px;margin:4px 5px 4px 0}button{cursor:pointer}#status{color:#67e8f9}#details{border-top:1px solid #334155;margin-top:12px;padding-top:8px;white-space:pre-wrap}small{color:#94a3b8}#legend{white-space:pre-wrap}button:focus-visible,select:focus-visible{outline:2px solid #67e8f9}
@media(max-width:600px){.panel{top:10px;left:10px;width:calc(100% - 20px);max-height:42vh;padding:14px}h1{font-size:20px}}
</style></head><body><main id="map" aria-label="交互地图"></main><section class="panel"><h1 id="title"></h1><p id="description"></p><div id="controls"></div><p id="status" role="status">正在准备地图…</p><p id="legend"></p><small id="source"></small><div id="details">点击地图查看详情。</div></section>
<script type="application/json" id="geo-data">__PAYLOAD__</script>
<script type="module">
__MODULE__
const payload=JSON.parse(document.getElementById('geo-data').textContent);
const el=id=>document.getElementById(id), status=el('status');
const setStatus=(text,state)=>{status.textContent=text;status.dataset.state=state;};
el('title').textContent=payload.configs[0].title;
el('description').textContent=payload.configs[0].description;
el('source').textContent=payload.configs[0].sourceLabel || '来源：用户提供的数据';
const labels={points:'位置点',bubble:'数量气泡',cluster:'点聚合',heatmap:'热力',line:'路线',fill:'区域设色',extrusion:'区域拉伸'};
let map,layer,pickVersion=0,currentConfig=payload.configs[0],selection='';
function detailText(items){return items.map(f=>{const v=f.properties.__viz;return `${v.label ?? f.id} · ${v.value ?? '缺失'} ${currentConfig.unit || ''}${v.category ? ' · '+v.category : ''}${v.time ? ' · '+v.time : ''}`;}).join('\\n');}
async function pick(result){
 const version=++pickVersion, target=el('details');target.replaceChildren();
 if(result.items){target.textContent=detailText(result.items);return;}
 const heading=document.createElement('div');heading.textContent=`聚合包含 ${result.count} 个位置记录`;target.append(heading);
 const zoom=document.createElement('button');zoom.textContent='展开地图';zoom.onclick=result.expand;target.append(zoom);
 const list=document.createElement('div'),more=document.createElement('button');let offset=0;
 more.textContent='查看成员';target.append(list,more);
 more.onclick=async()=>{more.disabled=true;try{const items=await result.loadLeaves(offset,50);if(version!==pickVersion)return;offset+=items.length;list.textContent += (list.textContent?'\\n':'')+detailText(items);more.textContent=`已显示 ${offset}/${result.count}，继续加载`;more.hidden=offset>=result.count || !items.length;}catch{if(version===pickVersion)list.textContent='成员加载失败，请重新点击。';}finally{more.disabled=false;}};
 await more.onclick();
}
function legend(){
 const l=layer.legend,c=currentConfig;
 let text='';
 if(c.effect==='bubble')text=`面积 ∝ ${c.sizeMode==='absolute'?'指标绝对值':'指标'}；最大 ${l.maxAbs} ${l.unit}（半径 28px）\\n零值：空心小点；缺失：灰点`;
 if(['fill','extrusion'].includes(c.effect) || c.effect==='bubble')text+=l.min<0?'\\n粉：负值；青：正值；浅灰：零值':`\\n青 ≤ ${l.split} ${l.unit}；紫 > ${l.split} ${l.unit}`;
 if(c.effect==='heatmap')text=c.weight==='count'?'点计数密度（每个位置记录权重 1）':'加权贡献密度，权重单位：'+l.unit;
 if(c.effect==='heatmap')text+='\\n冷 → 暖：相对密度由低到高；不是精确数值读数';
 if(c.effect==='cluster')text='圆内数字：位置记录数；点击查看成员与展开';
 if(c.effect==='points')text='等大点仅表示位置';
 if(c.effect==='line')text='按输入线几何绘制；不推断行驶方向或实时位置';
 if(c.effect==='extrusion')text+=`\\n高度：每 ${l.unit} 映射 ${c.heightScale} 米`;
 el('legend').textContent=text+(['bubble','fill','extrusion'].includes(c.effect) || (c.effect==='heatmap' && c.weight==='value') ? `\\n全量缺失指标：${l.missing}；零值：${l.zero}`:'');
}
function applyFilter(){const count=layer.setFilter(f=>!selection || f.properties.__viz.category===selection);pickVersion++;el('details').textContent=count?'点击地图查看详情。':'当前筛选无数据。';}
function show(c){pickVersion++;layer?.destroy();currentConfig=c;layer=mountRecipe(map,payload.data,c,{onPick:pick,onError:()=>setStatus('数据层未能加载，请核查 SDK 与输入配置。','error')});map.setPitch(c.effect==='extrusion'?45:0);applyFilter();legend();}
async function start(){
 if(!payload.token){setStatus('待接入：未提供 Mapbox 浏览器 Token。请通过已授权的环境变量重新生成 HTML。','pending-key');return;}
 try{
  setStatus('正在加载地图服务…','loading');
  const css=document.createElement('link');css.rel='stylesheet';css.href='https://api.mapbox.com/mapbox-gl-js/v__SDK_VERSION__/mapbox-gl.css';document.head.append(css);
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://api.mapbox.com/mapbox-gl-js/v__SDK_VERSION__/mapbox-gl.js';const timer=setTimeout(()=>reject(Error('SDK timeout')),20000);s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);reject(Error('SDK failed'));};document.head.append(s);});
  map=new mapboxgl.Map({container:'map',accessToken:payload.token,style:'mapbox://styles/mapbox/dark-v11',center:payload.view.center,zoom:5,attributionControl:true});
  map.addControl(new mapboxgl.NavigationControl(),'bottom-right');
  const timer=setTimeout(()=>setStatus('地图尚未就绪，请检查网络、Token 权限与来源限制。','pending-map'),30000);
  map.on('error',()=>{clearTimeout(timer);setStatus('地图请求失败，请检查网络、Token 权限与来源限制。','error');});
  map.on('load',()=>{
   try{
    show(currentConfig);
    const [w,s,e,n]=payload.view.wrappedBounds;map.fitBounds([[w,s],[e<w?e+360:e,n]],{padding:60,maxZoom:13,duration:0,retainPadding:false});
    const select=document.createElement('select');select.setAttribute('aria-label','可视化效果');
    payload.configs.forEach((c,i)=>{const option=document.createElement('option');option.value=i;option.textContent=labels[c.effect];select.append(option);});
    select.onchange=()=>{try{show(payload.configs[Number(select.value)]);}catch{setStatus('此效果的数据条件未满足。','error');}};
    if(payload.configs.length>1)el('controls').append(select);
    const categories=[...new Set(payload.data.features.map(f=>f.properties.__viz.category).filter(Boolean))];
    if(categories.length>1 && categories.length<=30){const filter=document.createElement('select');filter.setAttribute('aria-label','类别筛选');for(const category of ['',...categories]){const option=document.createElement('option');option.value=category;option.textContent=category || '全部类别';filter.append(option);}filter.onchange=()=>{selection=filter.value;applyFilter();};el('controls').append(filter);}
    map.once('idle',()=>{clearTimeout(timer);if(status.dataset.state!=='error'){if(layer.inspect().registered)setStatus('地图已绘制，请核对位置与图例。','rendered');else setStatus('原生数据层未完整注册，请检查图层加载。','error');}});
   }catch{clearTimeout(timer);setStatus('数据层配置未通过检查，请核对指标与几何类型。','error');}
  });
 }catch{setStatus('地图 SDK 未能加载，请检查网络和浏览器环境。','error');}
}
window.addEventListener('pagehide',()=>{pickVersion++;layer?.destroy();map?.remove();},{once:true});
start();
</script></body></html>
'''


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('data',type=Path);p.add_argument('--spec',required=True,type=Path)
    p.add_argument('--out',required=True,type=Path)
    p.add_argument('--token-env',help='Explicitly authorized environment variable containing a public browser Token')
    args=p.parse_args()
    try:
        result=build(args.data,args.spec,args.out,token_env=args.token_env)
    except (ValueError,OSError,KeyError,TypeError) as exc:
        p.exit(2, f'Cannot build HTML: {exc}\n')
    print(json.dumps(result,ensure_ascii=False))


if __name__=='__main__':
    main()
