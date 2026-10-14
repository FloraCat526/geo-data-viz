const $=id=>document.getElementById(id), fmt=n=>n.toLocaleString('en-US');
const media=matchMedia('(prefers-reduced-motion: reduce)');
let map, all=[], filtered=[], selected=null, popup, ready=false, glow=true, paused=media.matches, timer=null, phase=0;
const maxPopulation=2318895;
const color=['step',['get','population'],'#78dfc5',50000,'#65b5ef',100000,'#b7a1fa',500000,'#ffc97b'];
const radius=['*',32,['sqrt',['/',['get','population'],maxPopulation]]];
function fit(){if(!ready||!filtered.length)return;const b=new mapboxgl.LngLatBounds();filtered.forEach(f=>b.extend(f.geometry.coordinates));map.fitBounds(b,{padding:innerWidth<760?55:85,maxZoom:9,duration:media.matches?0:950,retainPadding:false});}
function selectCity(id,fly=false){
 if(!ready){$('status').textContent='请先连接地图，再定位城镇。';return;}
 const f=filtered.find(f=>String(f.id)===String(id));if(!f)return;
 selected=String(f.id);map.setFilter('selected',['==',['get','viz_id'],selected]);popup?.remove();
 const el=document.createElement('div');
 for(const [cls,text] of [['popup-name',f.properties.name],['popup-region',f.properties.region],['popup-value',fmt(f.properties.population)],['popup-note','GeoNames 记录人口 · 人']]){const p=document.createElement('div');p.className=cls;p.textContent=text;el.append(p);}
 popup=new mapboxgl.Popup({offset:16,maxWidth:'290px'}).setLngLat(f.geometry.coordinates).setDOMContent(el).addTo(map);
 if(fly)map.flyTo({center:f.geometry.coordinates,zoom:Math.max(map.getZoom(),7.4),duration:media.matches?0:1100});
 document.querySelectorAll('.city').forEach(b=>b.classList.toggle('selected',b.dataset.id===selected));
}
function renderList(){
 $('cities').replaceChildren();$('list-caption').textContent=`前 ${Math.min(8,filtered.length)} / ${filtered.length}`;$('empty').hidden=filtered.length>0;
 for(const [i,f]of filtered.slice(0,8).entries()){
 const button=document.createElement('button');button.className='city';button.dataset.id=String(f.id);button.setAttribute('aria-label',`${f.properties.name}，${fmt(f.properties.population)} 人`);
 const rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');
 const label=document.createElement('span'),name=document.createElement('span'),region=document.createElement('span');name.className='city-name';name.textContent=f.properties.name;region.className='city-region';region.textContent=f.properties.region;label.append(name,region);
 const metric=document.createElement('span');metric.className='population';metric.textContent=fmt(f.properties.population);const bar=document.createElement('div');bar.className='microbar';bar.style.width=`${100*f.properties.population/maxPopulation}%`;metric.append(bar);button.append(rank,label,metric);button.addEventListener('click',()=>selectCity(f.id,true));$('cities').append(button);
 }
}
function applyFilter(){
 const region=$('region').value,q=$('search').value.trim().toLocaleLowerCase();filtered=all.filter(f=>(!region||f.properties.region===region)&&(!q||f.properties.name.toLocaleLowerCase().includes(q)));
 $('count').textContent=fmt(filtered.length);$('region-count').textContent=new Set(filtered.map(f=>f.properties.region)).size;$('view-title').textContent=region?region.toUpperCase():`ITALY / 20 REGIONS`;$('fit').disabled=!filtered.length;
 if(ready)map.getSource('cities').setData({type:'FeatureCollection',features:filtered});
 if(selected&&!filtered.some(f=>String(f.id)===selected)){popup?.remove();selected=null;if(ready)map.setFilter('selected',['==',['get','viz_id'],'']);}
 renderList();
}
function animate(){
 clearTimeout(timer);timer=null;
 if(!ready||paused||!glow||document.hidden)return;
 phase=(phase+.017)%1;
 map.setPaintProperty('pulse','circle-radius',['+',radius,3+14*phase]);map.setPaintProperty('pulse','circle-stroke-opacity',.5*(1-phase));
 timer=setTimeout(animate,50);
}
function syncMotion(){
 $('pause').textContent=paused?'▷ 继续光晕':'Ⅱ 暂停光晕';$('pause').setAttribute('aria-pressed',String(paused));$('pause').disabled=!glow;
 if(ready){map.setLayoutProperty('aura','visibility',glow?'visible':'none');map.setLayoutProperty('pulse','visibility',glow?'visible':'none');}
 animate();
}
function setMode(on){glow=on;$('glow').setAttribute('aria-pressed',String(on));$('precise').setAttribute('aria-pressed',String(!on));syncMotion();}
$('region').addEventListener('change',()=>{applyFilter();fit();});$('search').addEventListener('input',applyFilter);
$('clear').addEventListener('click',()=>{$('region').value='';$('search').value='';applyFilter();fit();});$('fit').addEventListener('click',fit);
$('glow').addEventListener('click',()=>setMode(true));$('precise').addEventListener('click',()=>setMode(false));$('pause').addEventListener('click',()=>{paused=!paused;syncMotion();});
$('about').addEventListener('click',()=>$('method').showModal());$('close-about').addEventListener('click',()=>$('method').close());
media.addEventListener('change',()=>{paused=media.matches;syncMotion();});document.addEventListener('visibilitychange',syncMotion);
window.addEventListener('pagehide',()=>{clearTimeout(timer);popup?.remove();map?.remove();$('mapbox-token').value='';});
$('map-access').addEventListener('submit',event=>{
 event.preventDefault();const token=$('mapbox-token').value.trim();
 if(!token.startsWith('pk.')){$('token-error').textContent='请填写 pk. 开头的浏览器 public Token。';return;}
 if(!window.mapboxgl){$('token-error').textContent='Mapbox SDK 加载失败，请检查网络后刷新。';return;}
 $('mapbox-token').value='';$('token-error').textContent='';
 try{startMap(token);$('map-access').hidden=true;}
 catch{$('token-error').textContent='地图未能初始化，请核对配置后重试。';}
});
try{
 const response=await fetch('cities.geojson');if(!response.ok)throw Error('城镇数据加载失败。');const data=await response.json();
 all=data.features.map(f=>({...f,properties:{...f.properties,viz_id:String(f.id)}})).sort((a,b)=>b.properties.population-a.properties.population);
 for(const region of [...new Set(all.map(f=>f.properties.region))].sort()){const opt=document.createElement('option');opt.value=region;opt.textContent=region;$('region').append(opt);}applyFilter();
 $('status').textContent='945 个城镇数据已就绪 · 连接地图后查看空间分布';
}catch(error){$('status').textContent=error.message;}
function startMap(token){
 if(!all.length)throw Error('Data is not ready');
 ready=false;popup?.remove();map?.remove();
 $('status').textContent='正在连接意大利地图…';
 map=new mapboxgl.Map({container:'map',accessToken:token,style:'mapbox://styles/mapbox/dark-v11',projection:'mercator',center:[12.8,41.7],zoom:4.7,pitch:0,bearing:0,minZoom:3,maxZoom:15,renderWorldCopies:false});
 map.addControl(new mapboxgl.NavigationControl({showCompass:false}),'top-right');
 map.on('error',e=>{if(e.error?.status===401||e.error?.status===403){$('status').textContent='地图凭证或权限验证失败，请核对 Token 和允许来源后重试。';$('map-access').hidden=false;}});
 const timeout=setTimeout(()=>{if(!ready)$('status').textContent='底图加载较慢，请检查 Mapbox 网络连接后刷新。';},20000);
 map.on('load',()=>{
 clearTimeout(timeout);
 // Change only documented paint properties on matching native layer types.
 for(const layer of map.getStyle().layers){if(layer.type==='background')map.setPaintProperty(layer.id,'background-color','#0d1720');if(layer.id==='water'&&layer.type==='fill')map.setPaintProperty(layer.id,'fill-color','#0e1c25');}
 map.addSource('cities',{type:'geojson',data:{type:'FeatureCollection',features:filtered},promoteId:'viz_id'});
 map.addLayer({id:'aura',type:'circle',source:'cities',paint:{'circle-radius':['+',['*',radius,1.5],2],'circle-color':color,'circle-opacity':.18,'circle-blur':1}});
 map.addLayer({id:'pulse',type:'circle',source:'cities',filter:['>=',['get','population'],500000],paint:{'circle-radius':['+',radius,6],'circle-color':color,'circle-opacity':0,'circle-stroke-width':1,'circle-stroke-color':color,'circle-stroke-opacity':.3}});
 map.addLayer({id:'bubbles',type:'circle',source:'cities',layout:{'circle-sort-key':['-',0,['get','population']]},paint:{'circle-radius':radius,'circle-color':color,'circle-opacity':.73,'circle-stroke-width':.8,'circle-stroke-color':color,'circle-stroke-opacity':.95}});
 map.addLayer({id:'selected',type:'circle',source:'cities',filter:['==',['get','viz_id'],''],paint:{'circle-radius':['+',radius,4],'circle-opacity':0,'circle-stroke-width':2,'circle-stroke-color':'#fff5dd'}});
 map.addLayer({id:'city-labels',type:'symbol',source:'cities',filter:['>=',['get','population'],350000],layout:{'text-field':['get','name'],'text-size':11,'text-font':['DIN Offc Pro Medium','Arial Unicode MS Regular'],'text-offset':[0,2.1],'text-anchor':'top'},paint:{'text-color':'#e5ded0','text-halo-color':'#10191d','text-halo-width':2}});
 map.on('click','bubbles',e=>{const f=e.features?.[0];if(f)selectCity(f.properties.viz_id);});map.on('mouseenter','bubbles',()=>{map.getCanvas().style.cursor='pointer';});map.on('mouseleave','bubbles',()=>{map.getCanvas().style.cursor='';});
 ready=true;$('status').textContent='';fit();syncMotion();
 });
}
