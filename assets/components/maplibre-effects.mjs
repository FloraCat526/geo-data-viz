/** Geo Data Viz — MIT. MapLibre-only effects; deck.gl is injected, never loaded implicitly. */
export const EFFECT_VERSIONS = Object.freeze({maplibre:'5.24.0',deck:'9.1.14'});
const fc=features=>({type:'FeatureCollection',features});
const point=(coordinates,properties)=>({type:'Feature',geometry:{type:'Point',coordinates},properties});
function coordinate(p){if(!Array.isArray(p)||p.length<2||!p.slice(0,2).every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>85)throw Error('Expected WGS84 [longitude, latitude], latitude within Mercator bounds');}
function rgb(c){if(!/^#[0-9a-f]{6}$/i.test(c))throw Error('Color must be #RRGGBB');return [1,3,5].map(i=>parseInt(c.slice(i,i+2),16));}
function filterPredicate(predicate){if(typeof predicate!=='function')throw Error('Filter must be a function');return predicate;}
function themeName(theme){if(!['dark','light'].includes(theme))throw Error('Unknown theme');return theme;}
function pointFeatures(data,label,extra=()=>({})){
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Expected Point FeatureCollection');
 return data.features.map((f,i)=>{if(f.geometry?.type!=='Point')throw Error(`${label} requires points`);coordinate(f.geometry.coordinates);return point([...f.geometry.coordinates],{...f.properties,__effectIndex:i,...extra(i)});});
}
// Geodesic ground path, unwrapped across the antimeridian; height is illustrative, in metres.
export function buildFlightPath(from,to,{segments=96,heightRatio=.12}={}){
 coordinate(from);coordinate(to);if(!Number.isInteger(segments)||segments<8||segments>512||!Number.isFinite(heightRatio)||heightRatio<0||heightRatio>1)throw Error('Invalid arc settings');
 const rad=Math.PI/180,vec=p=>[Math.cos(p[1]*rad)*Math.cos(p[0]*rad),Math.cos(p[1]*rad)*Math.sin(p[0]*rad),Math.sin(p[1]*rad)];
 const a=vec(from),b=vec(to),omega=Math.acos(Math.max(-1,Math.min(1,a.reduce((n,v,i)=>n+v*b[i],0))));
 if(Math.PI-omega<1e-5)throw Error('Antipodal route needs an explicit waypoint');
 let previous=from[0];const height=Math.min(1600000,omega*6371000*heightRatio);
 return Array.from({length:segments+1},(_,i)=>{const t=i/segments,s=omega<1e-8?1-t:Math.sin((1-t)*omega)/Math.sin(omega),u=omega<1e-8?t:Math.sin(t*omega)/Math.sin(omega),v=a.map((x,j)=>x*s+b[j]*u);let lng=Math.atan2(v[1],v[0])/rad;while(lng-previous>180)lng-=360;while(lng-previous< -180)lng+=360;previous=lng;const lat=Math.atan2(v[2],Math.hypot(v[0],v[1]))/rad;if(Math.abs(lat)>85)throw Error('Polar route requires a globe-aware renderer');return [lng,lat,i===0||i===segments?0:Math.sin(Math.PI*t)*height];});
}
export function normalizeFlights(rows,options={}){
 if(!Array.isArray(rows))throw Error('Flights must be an array');const ids=new Set();
 return rows.map((r,i)=>{if(r.id==null||ids.has(String(r.id)))throw Error('Routes require unique IDs');ids.add(String(r.id));const color=rgb(r.color??'#38bdf8');return {...r,id:String(r.id),color,path:buildFlightPath(r.source,r.target,options),offset:(i*.61803398875)%1};});
}
class EffectClock{
 constructor(draw){this.draw=draw;this.time=0;this.frame=null;this.last=null;this.destroyed=false;this.media=window.matchMedia('(prefers-reduced-motion: reduce)');this.paused=this.media.matches;this.visibility=()=>this.sync();this.motion=()=>{if(this.media.matches)this.pause();};document.addEventListener('visibilitychange',this.visibility);this.media.addEventListener('change',this.motion);}
 sync(){if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;this.last=null;if(this.destroyed||this.paused||document.hidden)return;const tick=now=>{if(this.destroyed||this.paused||document.hidden)return;this.time+=this.last===null?0:Math.min(100,now-this.last);this.last=now;this.draw(this.time);this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
 pause(){this.paused=true;this.sync();}play(){this.paused=false;this.sync();}
 destroy(){this.destroyed=true;this.sync();document.removeEventListener('visibilitychange',this.visibility);this.media.removeEventListener('change',this.motion);}
}
function check(map,provider,id){if(provider!=='maplibre')throw Error('Use the selected provider’s native or official visualization implementation');if(!map?.isStyleLoaded())throw Error('Create effects after MapLibre style load');if(!/^[a-zA-Z][\w-]*$/.test(id))throw Error('Invalid effect ID');}
function removeOwned(map,layers,sources){for(const id of [...layers].reverse())if(map.getLayer(id))map.removeLayer(id);for(const id of sources)if(map.getSource(id))map.removeSource(id);}
export class FlightLayer{
 constructor(map,{provider='maplibre',id='geo-flights',deck,data=[],duration=6500,trailLength=.2,heightRatio=.12,theme='dark',onPick=()=>{}}={}){
 check(map,provider,id);if(['MapboxOverlay','PathLayer','TripsLayer','ScatterplotLayer'].some(name=>typeof deck?.[name]!=='function'))throw Error('Load pinned deck.gl with MapboxOverlay, PathLayer, TripsLayer and ScatterplotLayer before FlightLayer');if(!Number.isFinite(duration)||duration<1000||!Number.isFinite(trailLength)||trailLength<=0||trailLength>1)throw Error('Invalid timing');
 this.map=map;this.id=id;this.deck=deck;this.duration=duration;this.trailLength=trailLength;this.heightRatio=heightRatio;this.theme=themeName(theme);this.onPick=onPick;this.predicate=()=>true;this.destroyed=false;this.hover=null;
 this.input=structuredClone(data);this.rows=normalizeFlights(this.input,{heightRatio});this.originalById=new Map(this.input.map(r=>[String(r.id),r]));this.overlay=new deck.MapboxOverlay({interleaved:false,layers:[]});
 try{map.addControl(this.overlay);this.overlayAdded=true;this.clock=new EffectClock(t=>this.draw(t));this.rebuild();this.clock.sync();this.remove=()=>this.destroy();map.on('remove',this.remove);}
 catch(error){this.clock?.destroy();if(this.remove)map.off('remove',this.remove);if(this.overlayAdded)map.removeControl(this.overlay);throw error;}
 }
 rebuild(){this.visible=this.rows.filter(r=>this.predicate(this.originalById.get(r.id)));this.trips=this.visible.flatMap(r=>[-1,0,1].map(c=>({...r,timestamps:r.path.map((_,i)=>(i/(r.path.length-1)+r.offset+c)*this.duration)})));this.draw(this.clock.time);return this.visible.length;}
 setData(data){if(this.destroyed)return;const input=structuredClone(data),rows=normalizeFlights(input,{heightRatio:this.heightRatio}),originalById=new Map(input.map(r=>[String(r.id),r]));rows.filter(r=>this.predicate(originalById.get(r.id)));this.input=input;this.rows=rows;this.originalById=originalById;return this.rebuild();}
 setFilter(predicate=()=>true){if(this.destroyed)return;filterPredicate(predicate);this.rows.filter(r=>predicate(this.originalById.get(r.id)));this.predicate=predicate;this.hover=null;return this.rebuild();}
 setTheme(theme){this.theme=themeName(theme);if(!this.destroyed)this.draw(this.clock.time);}
 draw(time){if(this.destroyed)return;const {PathLayer,TripsLayer,ScatterplotLayer}=this.deck,t=time%this.duration,dim=r=>this.hover&&r.id!==this.hover?.id? .12:1;
 const colors=(r,alpha)=>[...r.color.map(v=>this.theme==='light'?Math.round(v*.6):v),Math.round(alpha*dim(r))],onHover=info=>{const next=info.object??null;if(next?.id!==this.hover?.id){this.hover=next;this.draw(this.clock.time);}},onClick=info=>info.object&&this.onPick(this.originalById.get(info.object.id));
 const parameters={depthWriteEnabled:false,depthCompare:'always'};
 const common={parameters,billboard:true,data:this.visible,getPath:r=>r.path,widthUnits:'pixels',jointRounded:true,capRounded:true};
 const origins=[...new Map(this.visible.map(r=>[r.source.join(','),r.source])).values()];
 this.overlay.setProps({layers:[
 new PathLayer({...common,id:this.id+'-glow',getColor:r=>colors(r,25),getWidth:5,pickable:false,updateTriggers:{getColor:[this.hover?.id,this.theme]}}),
 new PathLayer({...common,id:this.id+'-paths',getColor:r=>colors(r,this.theme==='light'?110:85),getWidth:1.1,pickable:true,onHover,onClick,updateTriggers:{getColor:[this.hover?.id,this.theme]}}),
 new TripsLayer({parameters,billboard:true,id:this.id+'-trails',data:this.trips,getPath:r=>r.path,getTimestamps:r=>r.timestamps,getColor:r=>colors(r,255),getWidth:1.5,widthUnits:'pixels',currentTime:t,trailLength:this.duration*this.trailLength,fadeTrail:true,capRounded:true,jointRounded:true,pickable:false,updateTriggers:{getColor:[this.hover?.id,this.theme]}}),
 new ScatterplotLayer({parameters,id:this.id+'-ends',data:this.visible,getPosition:r=>r.target,getFillColor:r=>colors(r,this.hover?.id===r.id?230:130),radiusUnits:'pixels',getRadius:r=>this.hover?.id===r.id?4:3.2,stroked:false,pickable:true,onHover,onClick,updateTriggers:{getFillColor:[this.hover?.id,this.theme],getRadius:[this.hover?.id]}}),
 new ScatterplotLayer({parameters,id:this.id+'-origins',data:origins,getPosition:r=>r,getFillColor:this.theme==='light'?[30,64,175]:[240,249,255],radiusUnits:'pixels',getRadius:5,stroked:true,getLineColor:[56,189,248],lineWidthUnits:'pixels',getLineWidth:2})]});
 }
 pause(){this.clock.pause();}play(){if(!this.destroyed)this.clock.play();}
 inspect(){return {id:this.id,effect:'flight',provider:'maplibre',rendererOwner:'third-party',library:'deck.gl',version:EFFECT_VERSIONS.deck,types:['PathLayer','TripsLayer','ScatterplotLayer'],fallbackReason:'Elevated 3D arcs and fading trails beyond the bundled native 2D recipe',count:this.visible.length,paused:this.clock.paused,destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.clock.destroy();this.map.off('remove',this.remove);this.map.removeControl(this.overlay);}
}
export class PulsePointLayer{
 constructor(map,{provider='maplibre',id='geo-pulse',data=fc([]),color='#38bdf8',radius=4,theme='dark',onPick=()=>{}}={}){
 check(map,provider,id);if(!Number.isFinite(radius)||radius<=0||radius>100)throw Error('radius must be a finite pixel value in (0, 100]');if(!Array.isArray(color))rgb(color);else if(!color.length)throw Error('Color expression must not be empty');this.map=map;this.id=id;this.color=color;this.radius=radius;this.theme=themeName(theme);this.onPick=onPick;this.destroyed=false;this.predicate=()=>true;this.input=structuredClone(data);this.rows=pointFeatures(this.input,'PulsePointLayer',i=>({__pulseOffset:(i*.61803398875)%1}));this.layerIds=[id+'-halo',id+'-core'];if(map.getSource(id)||this.layerIds.some(x=>map.getLayer(x)))throw Error('Effect ID already exists');
 try{
 map.addSource(id,{type:'geojson',data:fc([])});map.addLayer({id:this.layerIds[0],type:'circle',source:id,paint:{'circle-color':color,'circle-radius':16,'circle-opacity':.12,'circle-stroke-color':color,'circle-stroke-width':1,'circle-stroke-opacity':.35}});map.addLayer({id:this.layerIds[1],type:'circle',source:id,paint:{'circle-color':color,'circle-radius':radius,'circle-stroke-width':1,'circle-stroke-color':theme==='light'?'#fff':'#132133'}});
 this.click=e=>{const hit=map.queryRenderedFeatures(e.point,{layers:[this.layerIds[1]]})[0];if(hit)this.onPick(this.input.features[Number(hit.properties.__effectIndex)]);};map.on('click',this.click);this.clock=new EffectClock(t=>this.draw(t));this.rebuild();this.clock.sync();this.remove=()=>this.destroy();map.on('remove',this.remove);
 }catch(error){this.clock?.destroy();if(this.click)map.off('click',this.click);if(this.remove)map.off('remove',this.remove);removeOwned(map,this.layerIds,[id]);throw error;}
 }
 rebuild(){this.visible=this.rows.filter(f=>this.predicate(this.input.features[f.properties.__effectIndex]));this.map.getSource(this.id).setData(fc(this.visible));this.draw(this.clock.time);return this.visible.length;}
 setData(data){if(this.destroyed)return;const input=structuredClone(data),rows=pointFeatures(input,'PulsePointLayer',i=>({__pulseOffset:(i*.61803398875)%1}));rows.filter(f=>this.predicate(input.features[f.properties.__effectIndex]));this.input=input;this.rows=rows;return this.rebuild();}
 setFilter(predicate=()=>true){if(this.destroyed)return;filterPredicate(predicate);this.rows.filter(f=>predicate(this.input.features[f.properties.__effectIndex]));this.predicate=predicate;return this.rebuild();}
 draw(time){if(this.destroyed)return;const t=['%', ['+',['get','__pulseOffset'],time/2400],1],id=this.layerIds[0];this.map.setPaintProperty(id,'circle-radius',['+',this.radius,['*',t,20]]);this.map.setPaintProperty(id,'circle-opacity',['*',['-',1,t],.2]);this.map.setPaintProperty(id,'circle-stroke-opacity',['*',['-',1,t],.5]);}
 setTheme(theme){this.theme=themeName(theme);if(!this.destroyed)this.map.setPaintProperty(this.layerIds[1],'circle-stroke-color',theme==='light'?'#fff':'#132133');}
 pause(){this.clock.pause();}play(){if(!this.destroyed)this.clock.play();}
 inspect(){return {id:this.id,effect:'pulse',provider:'maplibre',rendererOwner:'provider-native',types:['circle'],count:this.visible.length,paused:this.clock.paused,destroyed:this.destroyed};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.clock.destroy();this.map.off('remove',this.remove);this.map.off('click',this.click);removeOwned(this.map,this.layerIds,[this.id]);}
}

// Visual scan around known Point locations. The radius is a display parameter,
// not a measured radar coverage area unless the caller has evidence for it.
const RAD=Math.PI/180,EARTH_RADIUS=6371008.8;
function radarDestination(origin,bearing,distance){
 const latitude=origin[1]*RAD,longitude=origin[0]*RAD,delta=distance/EARTH_RADIUS;
 const nextLatitude=Math.asin(Math.sin(latitude)*Math.cos(delta)+Math.cos(latitude)*Math.sin(delta)*Math.cos(bearing));
 let nextLongitude=(longitude+Math.atan2(Math.sin(bearing)*Math.sin(delta)*Math.cos(latitude),Math.cos(delta)-Math.sin(latitude)*Math.sin(nextLatitude)))/RAD;
 while(nextLongitude-origin[0]>180)nextLongitude-=360;while(nextLongitude-origin[0]<-180)nextLongitude+=360;
 const next=[nextLongitude,nextLatitude/RAD];
 if(Math.abs(next[0])>180||Math.abs(next[1])>85)throw Error('Radar range crosses supported map bounds');
 return next;
}
function radarRing(origin,radius,kind){const coordinates=Array.from({length:65},(_,i)=>radarDestination(origin,i*Math.PI/32,radius));return {type:'Feature',properties:{kind},geometry:{type:'LineString',coordinates}};}
function radarSector(origin,radius,start,end,opacity){
 const coordinates=[origin,...Array.from({length:5},(_,i)=>radarDestination(origin,start+(end-start)*i/4,radius)),origin];
 return {type:'Feature',properties:{opacity},geometry:{type:'Polygon',coordinates:[coordinates]}};
}
export class RadarScanLayer{
 constructor(map,{provider='maplibre',id='geo-radar',data=fc([]),radiusMeters=18000,period=6000,sweepAngle=100,opacity=.58,color='#38bdf8',theme='dark',onPick=()=>{}}={}){
  check(map,provider,id);rgb(color);themeName(theme);
  if(!Number.isFinite(radiusMeters)||radiusMeters<100||radiusMeters>100000)throw Error('radiusMeters must be 100–100000 metres');
  if(!Number.isFinite(period)||period<2000||period>30000)throw Error('period must be 2000–30000 milliseconds');
  if(!Number.isFinite(sweepAngle)||sweepAngle<10||sweepAngle>180)throw Error('sweepAngle must be 10–180 degrees');
  if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('opacity must be 0–1');
  this.map=map;this.id=id;this.radiusMeters=radiusMeters;this.period=period;this.sweepAngle=sweepAngle;this.opacity=opacity;this.color=color;this.theme=theme;this.onPick=onPick;this.predicate=()=>true;this.destroyed=false;
  this.input=structuredClone(data);this.rows=pointFeatures(this.input,'RadarScanLayer');
  this.sources=[id+'-scan',id+'-static'];this.layerIds=[id+'-sector',id+'-rings',id+'-beam-glow',id+'-beam',id+'-halo',id+'-core'];
  if(this.sources.some(x=>map.getSource(x))||this.layerIds.some(x=>map.getLayer(x)))throw Error('Effect ID already exists');
  this.visible=this.rows;this.staticData=this.staticFeatures(this.visible);
  try{
   map.addSource(this.sources[0],{type:'geojson',data:fc([])});map.addSource(this.sources[1],{type:'geojson',data:this.staticData});
   // Contiguous translucent wedges form a broad fading face. Disable polygon
   // edge antialiasing so internal wedge boundaries do not become a spoke grid.
   map.addLayer({id:this.layerIds[0],type:'fill',source:this.sources[0],filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':color,'fill-opacity':['get','opacity'],'fill-antialias':false}});
   map.addLayer({id:this.layerIds[1],type:'line',source:this.sources[1],filter:['==',['geometry-type'],'LineString'],paint:{'line-color':color,'line-width':['case',['==',['get','kind'],'outer'],1.1,.6],'line-opacity':this.ringOpacity()}});
   map.addLayer({id:this.layerIds[2],type:'line',source:this.sources[0],filter:['==',['geometry-type'],'LineString'],paint:{'line-color':color,'line-width':4,'line-blur':3,'line-opacity':theme==='light'?.12:.28}});
   map.addLayer({id:this.layerIds[3],type:'line',source:this.sources[0],filter:['==',['geometry-type'],'LineString'],paint:{'line-color':color,'line-width':1.1,'line-opacity':.9}});
   map.addLayer({id:this.layerIds[4],type:'circle',source:this.sources[1],filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':7,'circle-color':color,'circle-opacity':theme==='light'?.1:.16}});
   map.addLayer({id:this.layerIds[5],type:'circle',source:this.sources[1],filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':3.5,'circle-color':color,'circle-stroke-width':.8,'circle-stroke-color':theme==='light'?'#fff':'#e0f2fe'}});
  }catch(error){removeOwned(map,this.layerIds,this.sources);throw error;}
  this.click=e=>{const hit=map.queryRenderedFeatures(e.point,{layers:[this.layerIds[5]]})[0];if(hit)this.onPick(this.input.features[Number(hit.properties.__effectIndex)]);};
  map.on('click',this.click);this.clock=new EffectClock(t=>this.draw(t));this.draw(0,true);this.clock.sync();this.remove=()=>this.destroy();map.on('remove',this.remove);
  this.viewport=()=>this.draw(this.clock.time,true);map.on('moveend',this.viewport);
 }
 staticFeatures(rows){return fc(rows.flatMap(f=>{const center=f.geometry.coordinates;return [radarRing(center,this.radiusMeters,'outer'),radarRing(center,this.radiusMeters*.5,'inner'),f];}));}
 ringOpacity(){return ['case',['==',['get','kind'],'outer'],this.theme==='light'?.36:.6,this.theme==='light'?.12:.16];}
 scanFeatures(time){
  const features=[],segments=40,width=this.sweepAngle*RAD,step=width/segments,alpha=this.opacity*(this.theme==='light'?.7:1),bounds=this.map.getBounds?.();
  for(const f of this.visible){
   const center=f.geometry.coordinates,index=f.properties.__effectIndex,angle=2*Math.PI*((time/this.period+index*.61803398875)%1);
   // Cull only animation geometry, never input records or static pick anchors.
   // A conservative geographic box also retains partially visible scan faces.
   if(bounds){
    const latRadius=this.radiusMeters/EARTH_RADIUS/RAD,lngRadius=latRadius/Math.cos((Math.abs(center[1])+latRadius)*RAD);
    const west=bounds.getWest(),east=bounds.getEast(),lng=center[0]+360*Math.round(((west+east)/2-center[0])/360);
    if(center[1]+latRadius<bounds.getSouth()||center[1]-latRadius>bounds.getNorth()||lng+lngRadius<west||lng-lngRadius>east)continue;
   }
   for(let segment=0;segment<segments;segment++){
    const start=angle-width+segment*step;
    features.push(radarSector(center,this.radiusMeters,start,start+step,alpha*Math.pow((segment+.5)/segments,1.35)));
   }
   features.push({type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[center,radarDestination(center,angle,this.radiusMeters)]}});
  }
  return fc(features);
 }
 draw(time,force=false){if(this.destroyed)return;if(!force&&this.lastDraw!==undefined&&time-this.lastDraw<33)return;this.lastDraw=time;this.map.getSource(this.sources[0]).setData(this.scanFeatures(time));}
 rebuild(){this.visible=this.rows.filter(f=>this.predicate(this.input.features[f.properties.__effectIndex]));const staticData=this.staticFeatures(this.visible),scanData=this.scanFeatures(this.clock.time);this.staticData=staticData;this.map.getSource(this.sources[1]).setData(staticData);this.map.getSource(this.sources[0]).setData(scanData);this.lastDraw=this.clock.time;return this.visible.length;}
 setData(data){if(this.destroyed)return;const input=structuredClone(data),rows=pointFeatures(input,'RadarScanLayer');const visible=rows.filter(f=>this.predicate(input.features[f.properties.__effectIndex]));this.staticFeatures(visible);this.input=input;this.rows=rows;return this.rebuild();}
 setFilter(predicate=()=>true){if(this.destroyed)return;filterPredicate(predicate);const visible=this.rows.filter(f=>predicate(this.input.features[f.properties.__effectIndex]));this.staticFeatures(visible);this.predicate=predicate;return this.rebuild();}
 setTheme(theme){themeName(theme);if(this.destroyed)return;this.theme=theme;this.map.setPaintProperty(this.layerIds[1],'line-opacity',this.ringOpacity());this.map.setPaintProperty(this.layerIds[2],'line-opacity',theme==='light'?.12:.28);this.map.setPaintProperty(this.layerIds[4],'circle-opacity',theme==='light'?.1:.16);this.map.setPaintProperty(this.layerIds[5],'circle-stroke-color',theme==='light'?'#fff':'#e0f2fe');this.draw(this.clock.time,true);}
 pause(){this.clock.pause();}play(){if(!this.destroyed)this.clock.play();}
 inspect(){return {id:this.id,effect:'radar',provider:'maplibre',rendererOwner:'provider-native',types:['fill','line','circle'],count:this.visible.length,paused:this.clock.paused,destroyed:this.destroyed,radiusMeters:this.radiusMeters,period:this.period,sweepAngle:this.sweepAngle,opacity:this.opacity};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.clock.destroy();this.map.off('remove',this.remove);this.map.off('click',this.click);this.map.off('moveend',this.viewport);removeOwned(this.map,this.layerIds,this.sources);}
}

// Regional hexagonal aggregation in a local metre-based projection. Never an administrative boundary.
export function aggregateHexagons(data,{cellSize=500,aggregation='count',valueField,origin}={}){
 if(data?.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Expected Point FeatureCollection');
 if(!Number.isFinite(cellSize)||cellSize<10||cellSize>50000)throw Error('cellSize must be a hexagon side length in metres from 10 to 50000');
 if(!['count','sum','mean'].includes(aggregation)||aggregation!=='count'&&!valueField)throw Error('Choose count, sum or mean; metrics require valueField');
 const rows=data.features;
 rows.forEach(f=>{if(f.geometry?.type!=='Point')throw Error('HexagonLayer requires points');coordinate(f.geometry.coordinates);});
 origin=origin??(rows.length?[rows.reduce((n,f)=>n+f.geometry.coordinates[0],0)/rows.length,rows.reduce((n,f)=>n+f.geometry.coordinates[1],0)/rows.length]:[0,0]);coordinate(origin);
 if(Math.abs(origin[1])>75)throw Error('Hexagons require a regional dataset below 75 degrees latitude');
 const rad=Math.PI/180,R=6371008.8,k=R*rad,cos=Math.cos(origin[1]*rad),bins=new Map();
 const inverse=(x,y)=>[origin[0]+x/(k*cos),origin[1]+y/k];
 for(const f of rows){
  const [lng,lat]=f.geometry.coordinates,x=(lng-origin[0])*k*cos,y=(lat-origin[1])*k;
  if(Math.abs(lng-origin[0])>180||Math.hypot(x,y)>500000)throw Error('Hexagons support regional data within 500 km of origin; split global or antimeridian data first');
  const q=(Math.sqrt(3)/3*x-y/3)/cellSize,r=2*y/(3*cellSize),z=-q-r;
  let a=Math.round(q),b=Math.round(r),c=Math.round(z);
  const da=Math.abs(a-q),db=Math.abs(b-r),dc=Math.abs(c-z);
  if(da>db&&da>dc)a=-b-c;else if(db>dc)b=-a-c;
  const id=`${a}:${b}`;
  if(!bins.has(id))bins.set(id,{id,q:a,r:b,count:0,validCount:0,missingCount:0,sum:0});
  const bin=bins.get(id),v=f.properties?.[valueField];bin.count++;
  if(aggregation!=='count'){
   if(v==null){bin.missingCount++;continue;}
   if(typeof v!=='number'||!Number.isFinite(v)||v<0)throw Error('Hexagon metrics must be finite nonnegative numbers or null');
   bin.sum+=v;bin.validCount++;if(!Number.isFinite(bin.sum))throw Error('Metric sum overflow');
  }
 }
 const features=[...bins.values()].map(b=>{
  const x=cellSize*Math.sqrt(3)*(b.q+b.r/2),y=cellSize*1.5*b.r;
  const ring=Array.from({length:6},(_,i)=>{const t=(i*60-30)*rad;return inverse(x+cellSize*Math.cos(t),y+cellSize*Math.sin(t));});ring.push([...ring[0]]);
  if(ring.some(p=>Math.abs(p[0])>180||Math.abs(p[1])>85))throw Error('Hexagon crosses supported map bounds');
  const value=aggregation==='count'?b.count:b.validCount?(aggregation==='sum'?b.sum:b.sum/b.validCount):null;
  return {type:'Feature',id:b.id,properties:{...b,value},geometry:{type:'Polygon',coordinates:[ring]}};
 });
 return {...fc(features),metadata:{origin:[...origin],cellSize,aggregation,valueField,projection:'local-equirectangular',inputCount:rows.length}};
}

export class HexagonLayer{
 constructor(map,{provider='maplibre',id='geo-hexagons',data=fc([]),cellSize=500,aggregation='count',valueField,mode='flat',heightScale=10,theme='dark',onPick=()=>{}}={}){
  check(map,provider,id);if(!['flat','3d'].includes(mode)||!['dark','light'].includes(theme)||!Number.isFinite(heightScale)||heightScale<=0)throw Error('Invalid hexagon mode, theme or heightScale');
  this.map=map;this.id=id;this.mode=mode;this.theme=theme;this.heightScale=heightScale;this.options={cellSize,aggregation,valueField};this.onPick=onPick;this.predicate=()=>true;this.destroyed=false;this.layerIds=[id+'-fill',id+'-edge',id+'-3d'];
  if(map.getSource(id)||this.layerIds.some(x=>map.getLayer(x)))throw Error('Effect ID already exists');
  this.data=structuredClone(data);const full=aggregateHexagons(this.data,this.options);this.origin=full.metadata.origin;this.setDomain(full);
  try{
  map.addSource(id,{type:'geojson',data:full});
  map.addLayer({id:this.layerIds[0],type:'fill',source:id,paint:{'fill-color':this.color(),'fill-opacity':.82}});
  map.addLayer({id:this.layerIds[1],type:'line',source:id,paint:{'line-color':theme==='light'?'#ffffff':'#142a40','line-width':.7}});
  map.addLayer({id:this.layerIds[2],type:'fill-extrusion',source:id,paint:{'fill-extrusion-color':this.color(),'fill-extrusion-height':['*',['coalesce',['get','value'],0],heightScale],'fill-extrusion-opacity':.88}});
  this.visible=full;this.setMode(mode);
  this.click=e=>{const hit=map.queryRenderedFeatures(e.point,{layers:[this.layerIds[this.mode==='3d'?2:0]]})[0];if(hit)this.onPick(hit);};
  this.remove=()=>this.destroy();map.on('click',this.click);map.on('remove',this.remove);
  }catch(error){if(this.click)map.off('click',this.click);if(this.remove)map.off('remove',this.remove);removeOwned(map,this.layerIds,[id]);throw error;}
 }
 setDomain(full){this.maximum=full.features.reduce((n,f)=>Math.max(n,f.properties.value??0),0);if(!Number.isFinite(this.maximum*this.heightScale))throw Error('Derived height overflow');}
 color(){return ['case',['==',['get','value'],null],this.theme==='light'?'#94a3b8':'#64748b',['interpolate',['linear'],['coalesce',['get','value'],0],0,this.theme==='light'?'#dbeafe':'#164e63',Math.max(this.maximum,1)*.35,'#22d3ee',Math.max(this.maximum,1)*.7,'#6366f1',Math.max(this.maximum,1),'#f472b6']];}
 rebuild(){const next=aggregateHexagons(fc(this.data.features.filter(this.predicate)),{...this.options,origin:this.origin});this.visible=next;this.map.getSource(this.id).setData(next);}
 setData(data){if(this.destroyed)return;const copy=structuredClone(data),full=aggregateHexagons(copy,this.options);copy.features.filter(this.predicate);this.setDomain(full);this.data=copy;this.origin=full.metadata.origin;this.rebuild();this.setTheme(this.theme);return this.visible.metadata.inputCount;}
 setFilter(predicate=()=>true){if(this.destroyed)return;filterPredicate(predicate);this.data.features.filter(predicate);this.predicate=predicate;this.rebuild();return this.visible.metadata.inputCount;}
 setCellSize(cellSize){if(this.destroyed)return;const options={...this.options,cellSize},full=aggregateHexagons(this.data,{...options,origin:this.origin});this.setDomain(full);this.options=options;this.rebuild();this.setTheme(this.theme);}
 setMode(mode){if(!['flat','3d'].includes(mode))throw Error('Choose flat or 3d');if(this.destroyed)return;this.mode=mode;this.layerIds.forEach((id,i)=>this.map.setLayoutProperty(id,'visibility',(mode==='3d'?i===2:i<2)?'visible':'none'));}
 setTheme(theme){themeName(theme);if(this.destroyed)return;this.theme=theme;this.map.setPaintProperty(this.layerIds[0],'fill-color',this.color());this.map.setPaintProperty(this.layerIds[2],'fill-extrusion-color',this.color());this.map.setPaintProperty(this.layerIds[1],'line-color',theme==='light'?'#ffffff':'#142a40');}
 inspect(){return {id:this.id,effect:'hexagon',provider:'maplibre',rendererOwner:'provider-native',types:['fill','line','fill-extrusion'],count:this.visible.metadata.inputCount,paused:null,destroyed:this.destroyed,mode:this.mode,cellSize:this.options.cellSize,aggregation:this.options.aggregation,heightScale:this.heightScale,maximum:this.maximum,cells:this.visible.features.length,inputCount:this.visible.metadata.inputCount};}
 destroy(){if(this.destroyed)return;this.destroyed=true;this.map.off('click',this.click);this.map.off('remove',this.remove);removeOwned(this.map,this.layerIds,[this.id]);}
}
