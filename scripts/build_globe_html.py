#!/usr/bin/env python3
"""Generate one keyless Globe.GL HTML from analyzed WGS84 data."""
import argparse
import html
import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPONENT = ROOT / 'assets/components/globe-effects.mjs'
GLOBE_VERSION = '2.46.2'


def inline_json(value):
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).replace('<', r'\u003c').replace('\u2028', r'\u2028').replace('\u2029', r'\u2029')


def coordinate(value):
    return (isinstance(value, (list, tuple)) and len(value) >= 2
            and all(isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v) for v in value[:2])
            and abs(value[0]) <= 180 and abs(value[1]) <= 90)


def scalar(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def polygon_coordinates(geometry):
    polygons = [geometry['coordinates']] if geometry.get('type') == 'Polygon' else geometry['coordinates']
    return bool(polygons) and all(
        rings and all(len(ring) >= 4 and all(coordinate(point) for point in ring) and ring[0][:2] == ring[-1][:2] for ring in rings)
        for rings in polygons
    )


def prepare(data, effect, value_field=None, label_field=None):
    metadata = data.get('metadata', {}) if isinstance(data, dict) else {}
    if isinstance(metadata, dict) and metadata.get('dataCrs', 'wgs84') != 'wgs84':
        raise ValueError('globe input must be verified WGS84; reproject before generation')
    if effect == 'flight':
        rows = data if isinstance(data, list) else data.get('routes', [])
        if not isinstance(rows, list) or not rows:
            raise ValueError('flight needs an OD array or a routes array')
        origin = data.get('origin', {}).get('position') if isinstance(data, dict) else None
        result, ids = [], set()
        for index, row in enumerate(rows):
            src = row.get('source', origin)
            dst = row.get('target', row.get('airport', {}).get('position'))
            item_id = str(row.get('id', index))
            if not coordinate(src) or not coordinate(dst) or item_id in ids:
                raise ValueError(f'invalid or duplicate OD row {index + 1}')
            ids.add(item_id)
            result.append({'id': item_id, 'source': src[:2], 'target': dst[:2],
                           'label': row.get(label_field) if label_field else row.get('label', row.get('name', row.get('airport', {}).get('name', item_id))),
                           'category': row.get('category', row.get('region', 'Other'))})
        return result
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection' or not isinstance(data.get('features'), list):
        raise ValueError('choropleth and spikes require a GeoJSON FeatureCollection')
    result = []
    for index, feature in enumerate(data['features']):
        geometry, props = feature.get('geometry', {}), feature.get('properties', {})
        viz = props.get('__viz', {}) if isinstance(props.get('__viz', {}), dict) else {}
        fallback = 'population' if effect == 'choropleth' else 'mag'
        value = props.get(value_field) if value_field else viz.get('value', props.get('value', props.get(fallback)))
        label = props.get(label_field) if label_field else viz.get('label', props.get('name', props.get('place', props.get('ADMIN', f'Record {index + 1}'))))
        if effect == 'choropleth':
            if geometry.get('type') not in ('Polygon', 'MultiPolygon') or not geometry.get('coordinates') or not polygon_coordinates(geometry):
                raise ValueError(f'country row {index + 1} needs Polygon/MultiPolygon')
            if value is not None and (not scalar(value) or value < 0):
                raise ValueError(f'country row {index + 1} has invalid value')
        elif effect == 'spikes':
            if geometry.get('type') != 'Point' or not coordinate(geometry.get('coordinates')) or not scalar(value):
                raise ValueError(f'spike row {index + 1} needs valid Point and numeric value')
            geometry = {'type': 'Point', 'coordinates': geometry['coordinates'][:2]}
        result.append({'type': 'Feature', 'id': str(feature.get('id', index)), 'geometry': geometry,
                       'properties': {'__viz': {'label': str(label), 'value': value}}})
    if not result:
        raise ValueError('no usable features')
    return {'type': 'FeatureCollection', 'features': result}


def build(data_path, out_path, *, effect, title, description='', note='', credit='', source_url='',
          value_field=None, label_field=None, center=None, min_value=None, max_value=None,
          unit='', count_label=None, overwrite=False):
    data_path, out_path = Path(data_path), Path(out_path)
    if data_path.resolve() == out_path.resolve():
        raise ValueError('Output must not replace input data')
    if out_path.exists() and not overwrite:
        raise ValueError('output already exists; choose another path or --overwrite')
    if source_url and not source_url.startswith(('https://', 'http://')):
        raise ValueError('source URL must use https:// or http://')
    data = prepare(json.loads(data_path.read_text()), effect, value_field, label_field)
    if center is None:
        center = {'flight': [25, 103, 2.2], 'choropleth': [22, 15, 2.1], 'spikes': [15, 145, 2.2]}[effect]
    if len(center) != 3 or not coordinate([center[1], center[0]]) or not scalar(center[2]) or center[2] <= 0:
        raise ValueError('center must be latitude longitude positive-altitude')
    values = [f['properties']['__viz']['value'] for f in data['features']] if effect != 'flight' else []
    if effect == 'spikes':
        observed_min, observed_max = min(values), max(values)
        explicit_min, explicit_max = min_value is not None, max_value is not None
        min_value = observed_min if min_value is None else min_value
        max_value = observed_max if max_value is None else max_value
        if min_value == max_value and not (explicit_min and explicit_max):
            margin = max(1, abs(observed_min) * .1)
            if not explicit_min:
                min_value -= margin
            if not explicit_max:
                max_value += margin
        if not scalar(min_value) or not scalar(max_value) or min_value >= max_value:
            raise ValueError('spike metric range must increase')
    count = len(data if effect == 'flight' else data['features'])
    populated = sum(feature['properties']['__viz']['value'] is not None for feature in data['features']) if effect == 'choropleth' else count
    source = (f'<a href="{html.escape(source_url, quote=True)}" target="_blank" rel="noopener noreferrer">{html.escape(credit or "数据来源")}</a>'
              if source_url else html.escape(credit))
    config = {'effect': effect, 'center': center, 'minValue': min_value, 'maxValue': max_value, 'unit': unit}
    component = COMPONENT.read_text()
    page = '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__TITLE__</title>
<style>
:root{color-scheme:dark;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0b1020;color:#f3f7fc}#globe{position:fixed;inset:0;background:radial-gradient(ellipse at 58% 48%,#172741 0,#0b1020 62%)}.globe-container canvas{outline:none}.veil{pointer-events:none;position:fixed;inset:0;background:linear-gradient(90deg,rgba(7,13,26,.9),rgba(7,13,26,.38) 27%,transparent 58%)}.panel{position:fixed;left:clamp(18px,3.4vw,58px);top:clamp(18px,4vh,52px);width:min(345px,calc(100vw - 36px));padding:22px 23px;background:rgba(15,25,43,.7);border:1px solid rgba(151,193,230,.18);border-radius:21px;box-shadow:0 24px 70px rgba(0,0,0,.19);backdrop-filter:blur(18px)}.eyebrow{color:#77d7ef;letter-spacing:.18em;text-transform:uppercase;font-size:10px;font-weight:800}.panel h1{margin:13px 0 8px;font-size:clamp(23px,2vw,32px);line-height:1.15;letter-spacing:-.04em}.description{color:#a9bbce;font-size:13px;line-height:1.65;margin:0}.number{display:block;margin:25px 0 2px;font-size:36px;font-weight:750;letter-spacing:-.055em}.measure{color:#91a7bc;font-size:12px}.rule{height:1px;background:rgba(171,201,229,.15);margin:20px 0}.note{color:#b6c8d8;font-size:12px;line-height:1.55;margin:0}.actions{display:flex;gap:9px;margin-top:19px}.actions button{border:1px solid #2b4660;background:#1a3047;color:#d8edf8;border-radius:10px;padding:9px 13px;font:inherit;font-size:12px;cursor:pointer}.actions button:hover{background:#244463}.detail{margin-top:15px;min-height:30px;color:#e8d49a;font-size:12px;line-height:1.55}.credit{position:fixed;bottom:19px;left:clamp(18px,3.4vw,58px);font-size:11px;color:#8aa0b7;background:rgba(11,18,31,.7);padding:7px 11px;border-radius:8px}.credit a{color:#bdd9ea}.legend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:17px;color:#a9bbce;font-size:11px}.swatch{width:10px;height:10px;border-radius:50%;display:inline-block}.gradient{height:7px;width:100%;border-radius:9px;background:linear-gradient(90deg,#496b83,#f4be65,#e75d40)}#status{color:#83d7ef;font-size:11px;margin-top:12px}@media(max-width:700px){.panel{left:12px;top:auto;bottom:26px;width:calc(100vw - 24px);padding:12px 15px}.panel h1{font-size:20px;margin:7px 0 4px}.description{font-size:11px;line-height:1.4}.number{font-size:25px;margin-top:7px}.rule,.note{display:none}.legend{margin-top:8px}.actions{margin-top:8px}.actions button{padding:6px 9px}.detail{margin-top:8px;min-height:15px}#status{margin-top:4px}.veil{background:linear-gradient(0deg,rgba(7,13,26,.8),transparent 50%)}.credit{left:12px;bottom:5px;font-size:9px;padding:2px 5px}}
</style><style>
.credit{left:auto;right:18px;bottom:18px;z-index:5;padding:0;background:none}
.credit summary{display:grid;place-items:center;width:27px;height:27px;border:1px solid #ffffff55;border-radius:50%;background:#e9f3ffed;color:#172339;font-size:15px;font-weight:750;line-height:1;list-style:none;cursor:pointer;box-shadow:0 2px 10px #0005}
.credit summary::-webkit-details-marker{display:none}
.credit summary:focus-visible{outline:2px solid #83d7ef;outline-offset:3px}
.credit-body{position:absolute;right:0;bottom:37px;width:max-content;max-width:min(300px,calc(100vw - 36px));padding:10px 12px;border:1px solid #51657c;border-radius:9px;background:#142338f5;color:#d7e6f6;font-size:11px;line-height:1.5;box-shadow:0 8px 22px #0006;overflow-wrap:anywhere}
.credit-body a{color:#d7e6f6}
@media(max-width:700px){.panel{bottom:54px}.credit{left:auto;right:18px;bottom:15px;padding:0}.credit-body{right:38px;bottom:0}}
</style><script src="https://unpkg.com/globe.gl@__GLOBE_VERSION__/dist/globe.gl.min.js"></script></head><body><div id="globe" role="img" aria-label="交互式地球可视化"></div><div class="veil"></div>
<section class="panel"><div class="eyebrow">GEO DATA VIZ · GLOBE</div><h1>__TITLE__</h1><p class="description">__DESCRIPTION__</p><strong class="number">__COUNT__</strong><span class="measure">__COUNT_LABEL__</span><div class="legend" id="legend"></div><div class="rule"></div><p class="note">__NOTE__</p><div class="actions"><button id="reset" type="button">回到主视角</button><button id="motion" type="button">暂停旋转</button></div><div class="detail" id="detail">点击地球上的数据查看详情</div><div id="status" role="status">正在加载地球…</div></section><details class="credit"><summary aria-label="数据来源">!</summary><div class="credit-body">__CREDIT__</div></details>
<script id="globe-data" type="application/json">__DATA__</script><script id="globe-config" type="application/json">__CONFIG__</script><script type="module">
__COMPONENT__
const input=JSON.parse(document.getElementById('globe-data').textContent),config=JSON.parse(document.getElementById('globe-config').textContent);
const status=document.getElementById('status'),detail=document.getElementById('detail'),legend=document.getElementById('legend');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt=value=>Number(value).toLocaleString(undefined,{maximumFractionDigits:2});
const valueWithUnit=value=>`${fmt(value)}${config.unit?' '+config.unit:''}`;
const describe=row=>{if(config.effect==='flight')return `${row.label} · ${row.category}`;return `${row.label} · ${row.value===null?'无数据':valueWithUnit(row.value)}`};
try {
 const mobile=innerWidth<700;const globe=createGlobe(document.getElementById('globe'),{center:{lat:config.center[0],lng:config.center[1],altitude:config.center[2]+(mobile ? 0.55 : 0)},motion:!reduced});
 if(mobile)globe.globeOffset([0,-95]);
 let layer;
 const options={motion:!reduced,onPick:row=>{detail.textContent=describe(row)}};
 if(config.effect==='flight')layer=new GlobeFlightLayer(globe,options).setData(input);
 else if(config.effect==='choropleth')layer=new GlobeChoroplethLayer(globe,options).setData(input);
 else layer=new GlobeSpikeLayer(globe,{...options,minValue:config.minValue,maxValue:config.maxValue,unit:config.unit}).setData(input);
 if(config.effect==='flight')for(const [category,color] of layer.categoryColors){const swatch=document.createElement('span');swatch.className='swatch';swatch.style.background=color;const label=document.createElement('span');label.textContent=({Asia:'亚洲',Europe:'欧洲',Africa:'非洲',Oceania:'大洋洲',Americas:'美洲',Other:'其他'})[category]??category;legend.append(swatch,label)}
 else if(config.effect==='choropleth')legend.innerHTML='<span>较少</span><span class="gradient"></span><span>较多 · 灰色为缺失</span>';
 else {const low=document.createElement('span'),bar=document.createElement('span'),high=document.createElement('span');low.textContent=valueWithUnit(config.minValue);bar.className='gradient';bar.style.background='linear-gradient(90deg,#90ddf5,#ffad7b,#ff5d67)';high.textContent=valueWithUnit(config.maxValue);legend.append(low,bar,high)}
 document.getElementById('reset').addEventListener('click',()=>globe.pointOfView({lat:config.center[0],lng:config.center[1],altitude:config.center[2]+(innerWidth<700 ? 0.55 : 0)},700));
 const motion=document.getElementById('motion');if(reduced){motion.textContent='减少动态效果';motion.disabled=true;}
 motion.addEventListener('click',()=>{if(layer.paused){layer.play();motion.textContent='暂停旋转'}else{layer.pause();motion.textContent='继续旋转'}});
 const resize=new ResizeObserver(()=>globe.width(innerWidth).height(innerHeight));resize.observe(document.getElementById('globe'));
 document.addEventListener('visibilitychange',()=>{if(document.hidden){globe.pauseAnimation()}else{globe.resumeAnimation()}});
 globe.onGlobeReady(()=>{status.textContent='拖动旋转 · 滚轮缩放 · 点击查看'});
 window.addEventListener('beforeunload',()=>{resize.disconnect();layer.destroy();globe.pauseAnimation();globe.renderer().dispose()},{once:true});
} catch(error) {status.textContent=`地球加载失败：${error.message}`;console.error(error)}
</script></body></html>'''
    replacements = {'__TITLE__': html.escape(title), '__DESCRIPTION__': html.escape(description),
                    '__NOTE__': html.escape(note), '__COUNT__': f'{count:,}',
                    '__COUNT_LABEL__': html.escape(count_label or {'flight': '条连接', 'choropleth': f'个区域 · {populated} 个有数值', 'spikes': '个事件点'}[effect]),
                    '__CREDIT__': source, '__DATA__': inline_json(data), '__CONFIG__': inline_json(config),
                    '__COMPONENT__': component, '__GLOBE_VERSION__': GLOBE_VERSION}
    page = re.sub('|'.join(map(re.escape, replacements)), lambda match: replacements[match.group()], page)
    license_text = (ROOT / 'LICENSE').read_text()
    page = page.replace('<!doctype html>', f'<!doctype html><!--\n{license_text}\n-->', 1)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(page)
    return {'effect': effect, 'count': count, 'output': str(out_path), 'rendererOwner': 'third-party', 'library': f'globe.gl@{GLOBE_VERSION}'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data', type=Path)
    parser.add_argument('--effect', required=True, choices=('flight', 'choropleth', 'spikes'))
    parser.add_argument('--out', required=True, type=Path)
    parser.add_argument('--title', required=True)
    parser.add_argument('--description', default='')
    parser.add_argument('--note', default='')
    parser.add_argument('--credit', default='')
    parser.add_argument('--source-url', default='')
    parser.add_argument('--value-field')
    parser.add_argument('--label-field')
    parser.add_argument('--center', nargs=3, type=float, metavar=('LAT', 'LNG', 'ALT'))
    parser.add_argument('--min-value', type=float)
    parser.add_argument('--max-value', type=float)
    parser.add_argument('--unit', default='')
    parser.add_argument('--count-label')
    parser.add_argument('--overwrite', action='store_true')
    args = parser.parse_args()
    print(json.dumps(build(args.data, args.out, effect=args.effect, title=args.title, description=args.description,
                           note=args.note, credit=args.credit, source_url=args.source_url,
                           value_field=args.value_field, label_field=args.label_field, center=args.center,
                           min_value=args.min_value, max_value=args.max_value, unit=args.unit,
                           count_label=args.count_label, overwrite=args.overwrite), ensure_ascii=False))


if __name__ == '__main__':
    main()
