import {createViz} from './visualizations.js';
import {createBasemapPicker} from './basemap-picker.js';
async function main(){
const $=id=>document.getElementById(id),cfg=JSON.parse($('config').textContent),fc=features=>({type:'FeatureCollection',features}),feature=(geometry,properties={})=>({type:'Feature',geometry,properties});
const data=await fetch(`../data/${cfg.id}.json`).then(r=>{if(!r.ok)throw Error('data');return r.json()});
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/dark',center:cfg.center,zoom:cfg.zoom,attributionControl:{compact:true}});
// Fit overview bounds before the first render; compact panels need extra bottom space.
if(cfg.bounds)map.fitBounds(cfg.bounds,{padding:{top:32,bottom:innerWidth>700?32:120,left:32,right:32},duration:0,maxZoom:cfg.zoom});
map.addControl(new maplibregl.NavigationControl());
const collapseAttribution=()=>{const attribution=map.getContainer().querySelector('details.maplibregl-ctrl-attrib');if(attribution){attribution.open=false;attribution.classList.remove('maplibregl-compact-show');}};collapseAttribution();map.on('load',()=>requestAnimationFrame(collapseAttribution));
let mode=cfg.modes[0],running=!matchMedia('(prefers-reduced-motion: reduce)').matches,ready=false,epoch='08',year='2015',accidents,basemapMode='dark';
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
$('collapse').onclick=()=>{document.body.classList.toggle('collapsed');$('collapse').textContent=document.body.classList.contains('collapsed')?'展开':'收起';};
if(self!==top){document.body.classList.add('collapsed');$('collapse').textContent='展开';}
function source(id,d){if(map.getSource(id))map.getSource(id).setData(d);else map.addSource(id,{type:'geojson',data:d});}
function layer(id,type,paint,layout){map.addLayer({id,type,source:'data',paint,...(layout?{layout}:{})});}
function clear(){for(const id of ['base','labels','moving','destinations','origin','flight-glow'])if(map.getLayer(id))map.removeLayer(id);}
function pointLayer(color='#67e8f9',radius=5){layer('base','circle',{'circle-radius':radius,'circle-color':color,'circle-stroke-width':1,'circle-stroke-color':'#e0f2fe'});}
const quakeColor=()=>basemapMode==='imagery'?'#facc15':['interpolate',['linear'],['get','magnitude'],3,'#22d3ee',5,'#fb7185',7,'#fbbf24'];
function syncQuakeBasemap(next){
 basemapMode=next;if(cfg.id!=='quakes')return;
 const color=quakeColor();
 // Update native paint in place so the breathing animation keeps its phase.
 for(const id of ['base','geo-pulse-core','geo-pulse-halo'])if(map.getLayer(id)){
  map.setPaintProperty(id,'circle-color-transition',{duration:0,delay:0});
  map.setPaintProperty(id,'circle-color',color);
 }
 if(map.getLayer('geo-pulse-halo')){
  map.setPaintProperty('geo-pulse-halo','circle-stroke-color-transition',{duration:0,delay:0});
  map.setPaintProperty('geo-pulse-halo','circle-stroke-color',color);
 }
 $('legend').textContent=next==='imagery'?'黄色标记地震位置。波纹仅为强调，不代表影响范围。':'颜色表示源震级；不同震级类型未统一。波纹仅为强调，不代表影响范围。';
}
function arc(a,b){return Array.from({length:65},(_,i)=>{const t=i/64;return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t+Math.sin(Math.PI*t)*Math.min(18,Math.abs(b[0]-a[0])*.2)];});}
const flightPalette={Asia:{label:'亚洲',color:'#38bdf8'},Europe:{label:'欧洲',color:'#c4a0ff'},Oceania:{label:'大洋洲',color:'#fbbf24'},Africa:{label:'非洲',color:'#fb7185'}};
let flightLines,flightRegion='all',flightEffect,pulseEffect;
const flightRows=cfg.id==='flights'?data.routes.map(r=>({id:r.id,source:data.origin.position,target:r.airport.position,color:flightPalette[r.region]?.color??'#94a3b8',region:r.region,name:r.airport.name,city:r.airport.city,country:r.airport.country,iata:r.airport.iata})):[];
if(cfg.id==='flights'){
 flightLines=fc(data.routes.map(r=>feature({type:'LineString',coordinates:arc(data.origin.position,r.airport.position)},{name:r.airport.name,city:r.airport.city,country:r.airport.country,iata:r.airport.iata,region:r.region,color:flightPalette[r.region]?.color??'#94a3b8'})));
 const legend=document.createElement('div');legend.className='flight-legend';legend.setAttribute('aria-label','目的地洲筛选');
 for(const [key,item] of [['all',{label:'全部目的地',color:'#e2e8f0'}],...Object.entries(flightPalette)]){
 const n=key==='all'?data.routes.length:data.routes.filter(r=>r.region===key).length;
 const button=document.createElement('button');button.dataset.region=key;button.setAttribute('aria-pressed',String(key==='all'));
 const dot=document.createElement('span');dot.className='legend-dot';dot.style.background=item.color;
 button.append(dot,document.createTextNode(`${item.label} · ${n}`));button.onclick=()=>{flightRegion=key;if(ready)render();};legend.append(button);
 }$('legend').before(legend);
}
if(cfg.id==='highways')accidents=await fetch('../data/accidents.json').then(r=>r.json());
function render(){clear();pulseEffect?.destroy();pulseEffect=null;let d=data;
 if(cfg.id==='flights'){
 if(!flightEffect)flightEffect=createViz(map,{effect:'flight',spec:{deck:window.deck},data:flightRows,onPick:({items:[p]})=>{$('detail').textContent=`${p.name} (${p.iata})\n${p.city} · ${p.country}\n目的地：${flightPalette[p.region]?.label??p.region}`;}});
 flightEffect.setFilter(r=>flightRegion==='all'||r.region===flightRegion);if(!running)flightEffect.pause();
 d=fc(flightLines.features.filter(f=>flightRegion==='all'||f.properties.region===flightRegion));
 document.querySelectorAll('[data-region]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.region===flightRegion)));
 }

 if(cfg.id==='quakes'){
 d=data;
 if(mode==='呼吸点'){pulseEffect=createViz(map,{effect:'pulse',data,spec:{color:quakeColor()},onPick:({items:[f]})=>{$('detail').textContent=Object.entries(f.properties).filter(([k])=>!k.startsWith('__')).map(([k,v])=>`${k}: ${v}`).join('\n');}});if(!running)pulseEffect.pause();}
 else {source('data',d);pointLayer(quakeColor(),5);}
 }
 if(cfg.id==='taxis'){d=fc(data.features.filter(f=>f.properties.snapshot===epoch));source('data',d);if(mode==='热力')layer('base','heatmap',{'heatmap-weight':1,'heatmap-radius':['interpolate',['linear'],['zoom'],9,12,13,22,16,32],'heatmap-intensity':0.16,'heatmap-opacity':.8});else pointLayer('#22d3ee',3);}
 if(cfg.id==='highways'){d=fc(data.features.map(f=>{const p=f.properties,a=accidents[year]?.[`${p.state}-${p.type}-${p.id}`];return feature(f.geometry,{name:p.name,state:p.state,year,fatalities:a?.fatalities??null,value:a&&p.length>0?a.fatalities/p.length*1000:null});}));source('data',d);layer('base','line',{'line-color':['case',['==',['get','value'],null],'#64748b',['interpolate',['linear'],['get','value'],0,'#22d3ee',50,'#fbbf24',200,'#fb7185']],'line-width':mode==='指标线宽'?['case',['==',['get','value'],null],.6,['interpolate',['linear'],['get','value'],0,1,200,5]]:1.5,'line-opacity':.8});}
 $('count').textContent=d.features.length.toLocaleString();$('detail').textContent='点击地图查看详情';document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
}
function syncPause(){for(const effect of [flightEffect,pulseEffect])if(effect)running?effect.play():effect.pause();$('pause').textContent=running?'暂停动画':'播放动画';}reduced.addEventListener('change',e=>{if(e.matches)running=false;syncPause();});
$('pause').onclick=()=>{running=!running;syncPause();};syncPause();$('pause').hidden=!['flights','quakes'].includes(cfg.id);
for(const m of cfg.modes.length>1?cfg.modes:[]){const b=document.createElement('button');b.textContent=m;b.dataset.mode=m;b.onclick=()=>{mode=m;if(ready)render();};$('modes').append(b);}
if(cfg.id==='taxis'||cfg.id==='highways'){const select=document.createElement('select');select.setAttribute('aria-label',cfg.id==='taxis'?'快照时段':'统计年份');const values=cfg.id==='taxis'?['08','14','20']:Object.keys(accidents).sort();for(const v of values){const o=document.createElement('option');o.value=v;o.textContent=cfg.id==='taxis'?v+':00 快照':v+' 年';select.append(o);}select.value=cfg.id==='taxis'?epoch:year;select.onchange=()=>{if(cfg.id==='taxis')epoch=select.value;else year=select.value;render();};$('modes').append(select);}
map.on('click',e=>{
 const ids=['destinations','origin','base','labels'].filter(id=>map.getLayer(id));
 const hit=map.queryRenderedFeatures(e.point,{layers:ids})[0];if(!hit)return;
 const p=hit.properties;
 $('detail').textContent=Object.entries(p).filter(([k])=>!['i','j'].includes(k)).map(([k,v])=>`${k}: ${v??'缺失'}`).join('\n');
 if(cfg.id==='flights')$('detail').textContent=`${p.name} (${p.iata})\n${[p.city,p.country].filter(Boolean).join(' · ')}${p.region?'\n目的地：'+(flightPalette[p.region]?.label??p.region):'\n出发机场'}`;
});
map.on('error',()=>{$('status').textContent='资源加载失败，请检查网络后刷新';});function initialize(){if(ready)return;ready=true;if(cfg.basemaps?.imagery)map.addControl(createBasemapPicker({imagery:cfg.basemaps.imagery,onError:error=>{$('status').textContent=error.message;},onChange:next=>{syncQuakeBasemap(next);$('status').textContent='';}}),'bottom-left');render();if(cfg.id==='flights'){const bounds=new maplibregl.LngLatBounds();flightLines.features.forEach(f=>f.geometry.coordinates.forEach(c=>bounds.extend(c)));map.setPitch(38);map.fitBounds(bounds,{padding:{top:70,bottom:100,left:innerWidth>700?350:35,right:130},duration:0,maxZoom:2.5});}$('status').textContent='';}map.on('load',initialize);if(map.loaded())initialize();window.addEventListener('pagehide',()=>{flightEffect?.destroy();pulseEffect?.destroy();map.remove();},{once:true});

}
main().catch(()=>{document.getElementById('status').textContent='数据或地图初始化失败，请检查网络后刷新。';});
