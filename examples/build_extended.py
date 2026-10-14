"""Build additional public-data demos from shared components and page-specific layers."""
from pathlib import Path
import json,html
import tempfile
ROOT=Path(__file__).resolve().parent

CASES=[
('flights','新加坡历史航空飞线',['飞线'],[95,15],2, '125 条历史连接 · 2014 年航线数据','颜色区分目的地洲，线与终点同色；白点为樟宜机场。点击图例筛选、终点查看机场。流光表示方向；弧线高度为视觉示意，非实际航迹或飞行高度。','OpenFlights · ODbL 1.0 / DbCL 1.0'),
('quakes','意大利及周边地震事件',['呼吸点','位置点'],[13,41],5.5,'190 次地震 · 2025 年快照','颜色表示源震级；不同震级类型未统一。波纹仅为强调，不代表影响范围。','INGV / ISIDe · CC BY 4.0'),
('taxis','新加坡出租车快照',['热力','位置点'],[103.82,1.35],10,'早 / 中 / 晚 · 分别展示可用出租车','相对地点密度，不是出行需求。无车辆 ID，不连接轨迹、不跨时段合计车辆数。','LTA / data.gov.sg · Singapore Open Data Licence 1.0'),
('highways','美国公路历史事故',['风险色阶','指标线宽'],[-98,38],3,'20,592 个道路要素 · 1990—2015 分年数据','青→黄→粉：0 / 50 / 200 死亡人数每千英里；灰色为统计缺失，不作为零。不是当前道路风险预测。','NHTSA / vis.gl 示例数据 · MIT')]
def build_case(name):
 """Rebuild one flat-map example without rewriting other gallery pages."""
 case=next((case for case in CASES if case[0]==name),None)
 if case is None:raise ValueError(f'Unknown extended example: {name}')
 key,title,modes,center,zoom,summary,note,credit=case
 license=(ROOT.parent/'LICENSE').read_text()
 config={'id':key,'modes':modes,'center':center,'zoom':zoom}
 if key=='quakes':
  NASA_DATE = '2018-06-01'
  NASA_TILES = ('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/'
                'MODIS_Terra_CorrectedReflectance_TrueColor/default/' + NASA_DATE +
                '/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg')
  # Keep the Alps, Sicily and Malta visible at different gallery sizes.
  config['bounds']=[[6,33.5],[20,47.5]]
  config['basemaps']={'imagery':{
   'tiles':[NASA_TILES],'tileSize':256,'minzoom':1,'maxzoom':8,
   'attribution':'<a href="https://earthdata.nasa.gov/gibs">NASA GIBS / MODIS Terra · '+NASA_DATE+'</a>'}}
 doc='''<!doctype html><!--\nLICENSE\n--><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TITLE</title><link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css"><link rel="stylesheet" href="../assets/extended.css"><script src="https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js"></script>CHART</head><body><div id="map"></div><section class="panel"><button id="collapse">收起</button><h1>TITLE</h1><div class="body"><p>SUMMARY</p><div id="count"></div><div class="controls" id="modes"></div><button id="pause">暂停动画</button><div id="legend">NOTE</div><p id="status" role="status">正在加载地图…</p><div id="detail"></div><div class="foot">CREDIT<br><a href="../SOURCES.md">来源与口径</a> · <a href="../data/KEY.json" download>下载数据</a></div></div></section><script id="config" type="application/json">CONFIG</script><script type="module" src="../assets/extended.js"></script></body></html>'''
 for a,b in {'LICENSE':license,'TITLE':html.escape(title),'SUMMARY':html.escape(summary),'NOTE':html.escape(note),'CREDIT':html.escape(credit),'KEY':key,'CONFIG':json.dumps(config),'CHART':'<script src="https://unpkg.com/deck.gl@9.1.14/dist.min.js"></script>' if key=='flights' else ''}.items():doc=doc.replace(a,b)
 destination=ROOT/'maps'/f'{key}.html'
 destination.parent.mkdir(parents=True,exist_ok=True)
 destination.write_text(doc)
 return destination

def main():
 import sys
 sys.path.insert(0,str(ROOT.parent/'scripts'))
 from build_visual_html import build as build_visual
 from build_globe_html import build as build_globe
 from visual_bundle import bundle_visualizations
 def build_flat(data, destination, spec):
  with tempfile.TemporaryDirectory() as temp:
   root=Path(temp);spec_path=root/'spec.json';out=root/'map.html'
   spec_path.write_text(json.dumps(spec,ensure_ascii=False),encoding='utf-8')
   build_visual(data,spec_path,out)
   destination.write_bytes(out.read_bytes())
 taxis=json.loads((ROOT/'data/taxis.json').read_text())
 snapshot=[f for f in taxis['features'] if f['properties']['snapshot']=='20']
 point_data={'type':'FeatureCollection','metadata':{**taxis['metadata'],'source':{'url':taxis['metadata']['source']},'dataCrs':'wgs84'},'features':[
  {**f,'id':f"taxi-20-{f['properties']['recordIndex']}",'properties':{'__viz':{'label':'出租车位置','category':None,'value':None,'time':'2026-09-10T19:59:49+08:00'}}} for f in snapshot]}
 with tempfile.TemporaryDirectory() as temp:
  point_input=Path(temp)/'points.geojson';point_input.write_text(json.dumps(point_data),encoding='utf-8')
  base={'effect':'points','title':'新加坡 · 发光散点','description':'单个晚间快照的可用出租车位置；叠加亮度表示屏幕上点的重叠，不代表订单或需求。',
        'sourceLabel':'LTA / data.gov.sg · Singapore Open Data Licence 1.0','color':'#38bdf8','pointRadius':2,'opacity':.5}
  build_flat(point_input,ROOT/'maps/point-glow.html',{**base,'glow':True,'glowRadius':5,'glowIntensity':.18,'blendMode':'additive',
    'alternatives':[{**base,'title':'新加坡 · 柔光散点','glow':True,'glowRadius':5,'glowIntensity':.18},
                    {**base,'title':'新加坡 · 普通散点'}]})
 (ROOT/'assets/visualizations.js').write_text(bundle_visualizations(ROOT.parent),encoding='utf-8')
 for key,*_ in CASES:build_case(key)
 build_globe(ROOT/'data/flights.json',ROOT/'maps/globe-flights.html',effect='flight',overwrite=True,title='全球航空连接',description='从新加坡出发的历史航线，按目的地洲着色。',note='弧线表示机场连接关系，飞行高度与动效均为视觉示意。',credit='OpenFlights · 2014',source_url='https://openflights.org/data.php',center=[16,103,1.9],count_label='条历史连接')
 build_globe(ROOT/'data/globe-countries.geojson',ROOT/'maps/globe-countries.html',effect='choropleth',overwrite=True,title='全球人口分布',description='2024 年各国总人口，球面颜色按对数色阶呈现。',note='无数据地区显示为灰色；颜色表示人口总量，不代表人口密度。',credit='World Bank WDI · Natural Earth',source_url='https://data.worldbank.org/indicator/SP.POP.TOTL',center=[20,20,1.9],unit='人',count_label='个国家或地区 · 169 个有数据')
 build_globe(ROOT/'data/globe-quakes.geojson',ROOT/'maps/globe-earthquakes.html',effect='spikes',overwrite=True,title='全球地震事件',description='USGS 历史月度快照中震级 M 4.5 及以上的事件。',note='',credit='USGS Earthquake Catalog',source_url='https://earthquake.usgs.gov/earthquakes/feed/',center=[15,145,1.9],min_value=4.5,max_value=6.7,unit='M',count_label='次地震事件')
if __name__=='__main__':main()
