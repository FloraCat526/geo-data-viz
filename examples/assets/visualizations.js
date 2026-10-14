// Native SDK basemaps. Imagery and elevation resources are explicit and attributed.
const basemapOwners = new WeakMap();
function basemapFail(message){throw new TypeError(`Basemap: ${message}`);}
function basemapUrl(value,{mapbox=false,tiles=false}={}){
 if(typeof value!=='string'||!value.trim()||/\s/.test(value))basemapFail('resource URL must be HTTPS');
 if(mapbox&&value.startsWith('mapbox:')){
  if(!/^mapbox:\/\/(?:styles\/[\w.-]+\/[\w.-]+|mapbox\.[\w.-]+)$/.test(value))basemapFail('invalid Mapbox resource URL');
 }else{let url;try{url=new URL(value);}catch{basemapFail('resource URL must be HTTPS');}if(url.protocol!=='https:'||!url.hostname||url.username||url.password||url.hash)basemapFail('resource URL must be HTTPS without credentials or fragments');}
 if(tiles&&!['{z}','{x}','{y}'].every(marker=>value.includes(marker)))basemapFail('tile template needs {z}, {x}, and {y} in Web Mercator XYZ order');
 return value;
}
function basemapAttribution(value){
 if(typeof value!=='string'||!value.trim()||value.length>2000)basemapFail('source attribution is required');
 const text=value.replace(/<a href="([^"]+)"(?: target="_blank")?(?: rel="(?:noopener|noreferrer|noopener noreferrer)")?>([^<>]*)<\/a>/g,(_,url,text)=>{basemapUrl(url);return text;});
 if(/[<>]/.test(text)||/&(?:lt|gt|#0*6[02]|#x0*3[ce]);/i.test(text))basemapFail('attribution supports text and HTTPS links only');
 return value;
}
function basemapNativeImageryStyle(style,provider){
 if(provider==='mapbox'&&['satellite-v9','satellite-streets-v12'].some(name=>style==='mapbox:'+'//styles/mapbox/'+name))return true;
 const url=new URL(style);return url.protocol==='https:'&&url.hostname==='api.maptiler.com'&&url.pathname==='/maps/satellite/style.json'&&!!url.searchParams.get('key');
}
function basemapSource(raw,{terrain=false,provider}={}){
 const keys=['url','tiles','tileSize','attribution','minzoom','maxzoom',...(terrain?['encoding','exaggeration']:[])];
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!keys.includes(key)))basemapFail('source has unknown fields');
 if(Object.hasOwn(raw,'url')===Object.hasOwn(raw,'tiles'))basemapFail('provide exactly one source URL or tiles array');
 const result={...raw};
 if(Object.hasOwn(raw,'url'))basemapUrl(raw.url,{mapbox:provider==='mapbox'});
 else{if(!Array.isArray(raw.tiles)||raw.tiles.length<1||raw.tiles.length>8)basemapFail('tiles must contain one to eight HTTPS XYZ templates');result.tiles=raw.tiles.map(url=>basemapUrl(url,{tiles:true}));}
 if(![256,512,514].includes(raw.tileSize??256))basemapFail('tileSize must match the source: 256, 512, or 514');
 result.tileSize=raw.tileSize??256;result.attribution=basemapAttribution(raw.attribution);
 for(const key of ['minzoom','maxzoom'])if(Object.hasOwn(raw,key)&&(!Number.isInteger(raw[key])||raw[key]<0||raw[key]>24))basemapFail('source zoom levels must be integers from 0 to 24');
 if((raw.minzoom??0)>(raw.maxzoom??24))basemapFail('minzoom must not exceed maxzoom');
 if(terrain){const encoding=raw.encoding??'mapbox',exaggeration=raw.exaggeration??1.5;if(!['mapbox','terrarium'].includes(encoding)||provider==='mapbox'&&encoding!=='mapbox')basemapFail('DEM encoding must be mapbox or terrarium');if(provider==='mapbox'&&raw.url!=='mapbox:'+'//mapbox.mapbox-terrain-dem-v1')basemapFail('Mapbox terrain requires the supported Terrain-DEM tileset');if(typeof exaggeration!=='number'||!Number.isFinite(exaggeration)||exaggeration<=0||exaggeration>10)basemapFail('terrain exaggeration must be greater than 0 and up to 10');Object.assign(result,{encoding,exaggeration});}
 return result;
}

export function normalizeBasemap(config,{provider='maplibre',theme='dark'}={}){
 if(!['maplibre','mapbox','maptiler'].includes(provider)||!['dark','light'].includes(theme))basemapFail('unsupported provider or theme');
 config=config??{};
 if(typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(key=>!['type','styleUrl','imagery','terrain','showHillshade'].includes(key)))basemapFail('configuration has unknown fields');
 const type=config.type??'vector';if(!['vector','imagery','terrain'].includes(type))basemapFail('type must be vector, imagery, or terrain');
 if(type==='vector'&&['imagery','terrain','showHillshade'].some(key=>Object.hasOwn(config,key)))basemapFail('vector does not accept imagery or terrain options');
 if(type==='imagery'&&['terrain','showHillshade'].some(key=>Object.hasOwn(config,key)))basemapFail('use type terrain to combine imagery and elevation');
 if(Object.hasOwn(config,'showHillshade')&&typeof config.showHillshade!=='boolean')basemapFail('showHillshade must be boolean');
 let styleUrl=config.styleUrl;
 if(styleUrl===undefined){if(provider==='maptiler')basemapFail('MapTiler requires an explicit authorized styleUrl');styleUrl=provider==='mapbox'?'mapbox:'+'//styles/mapbox/'+(type==='imagery'?'satellite-streets-v12':type==='terrain'?'outdoors-v12':`${theme}-v11`):'https://tiles.openfreemap.org/styles/'+(theme==='light'?'positron':'dark');}
 basemapUrl(styleUrl,{mapbox:provider==='mapbox'});const result={type,styleUrl};
 if(Object.hasOwn(config,'imagery'))result.imagery=basemapSource(config.imagery,{provider});
 else if(type==='imagery'&&!basemapNativeImageryStyle(styleUrl,provider))basemapFail('imagery requires an attributed tile source; vector styles are not satellite imagery');
 if(type==='terrain'){const source=config.terrain??(provider==='mapbox'?{url:'mapbox:'+'//mapbox.mapbox-terrain-dem-v1',tileSize:512,encoding:'mapbox',attribution:'© Mapbox',exaggeration:1.5}:null);result.terrain=basemapSource(source,{terrain:true,provider});result.showHillshade=config.showHillshade??false;}
 return result;
}

/** Register native imagery/DEM layers without replacing the map style or business data.
 * Initialize new Map({style: normalizeBasemap(...).styleUrl}) before applying.
 * ready resolves after registration, not tile loading; video capture must await map idle.
 */
export function applyBasemap(map,config,{provider='maplibre',theme='dark',id='geo-basemap'}={}){
 const normalized=normalizeBasemap(config,{provider,theme});
 if(!map||typeof map.addSource!=='function'||typeof map.addLayer!=='function'||typeof map.on!=='function')basemapFail('a native GL map instance is required');
 if(typeof id!=='string'||!/^\w[\w-]*$/.test(id))basemapFail('id must contain only letters, digits, underscores, and hyphens');
 let owners=basemapOwners.get(map);if(!owners){owners=new Map();basemapOwners.set(map,owners);}if(owners.has(id))basemapFail('id already belongs to another basemap controller');
 const ids={imagery:`${id}-imagery`,raster:`${id}-raster`,dem:`${id}-dem`,hillshadeSource:`${id}-hillshade-dem`,hillshade:`${id}-hillshade`};
 const sources=new Map(),layers=new Map();let disposed=false,registered=false,installing=false,error=null,timer,settled=false,resolveReady,rejectReady;
 const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 // Consumers may inspect asynchronous errors instead of awaiting ready; avoid an unhandled rejection.
 ready.catch(()=>{});
 const finish=err=>{if(settled)return;settled=true;clearTimeout(timer);err?rejectReady(err):resolveReady(controller);};
 const source=(key,spec)=>{const current=map.getSource(key);if(current){if(sources.get(key)!==current)basemapFail(`source id collision: ${key}`);return;}map.addSource(key,spec);sources.set(key,map.getSource(key));};
 const before=()=>{const style=map.getStyle();return style.layers?.find(layer=>layer.type==='symbol'||layer.type==='custom'||['geojson','canvas','video','image'].includes(style.sources?.[layer.source]?.type))?.id;};
 const ownsLayer=key=>{const current=map.getLayer(key),owned=layers.get(key);return !!current&&!!owned&&current.type===owned.type&&current.source===owned.source&&sources.get(owned.source)===map.getSource(owned.source);};
 const layer=(key,spec)=>{if(map.getLayer(key)){if(!ownsLayer(key))basemapFail(`layer id collision: ${key}`);return;}map.addLayer({id:key,...spec},before());layers.set(key,{type:spec.type,source:spec.source});};
 const demSpec=()=>{const {exaggeration,...definition}=normalized.terrain;return {type:'raster-dem',...definition};};
 const ownsResources=()=>[...sources].every(([key,owned])=>owned===map.getSource(key))&&[...layers.keys()].every(ownsLayer);
 const terrainReady=()=>!normalized.terrain||(map.getTerrain?.()?.source===ids.dem&&map.getTerrain?.()?.exaggeration===normalized.terrain.exaggeration);
 const events=['style.load','load','styledata','sourcedata','idle'];
 function register(){if(disposed||installing||!map.isStyleLoaded())return;if(registered&&ownsResources()&&terrainReady())return;installing=true;try{
  if(normalized.terrain){const projection=map.getProjection?.()?.type??'mercator';if(provider!=='mapbox'&&projection!=='mercator'||provider==='mapbox'&&!['mercator','globe'].includes(projection))basemapFail('terrain requires a supported geographic projection (MapLibre/MapTiler: mercator; Mapbox: mercator or globe)');}
  if(normalized.imagery){source(ids.imagery,{type:'raster',...normalized.imagery});layer(ids.raster,{type:'raster',source:ids.imagery,paint:{'raster-opacity':1,'raster-fade-duration':0}});}
  if(normalized.terrain){source(ids.dem,demSpec());map.setTerrain({source:ids.dem,exaggeration:normalized.terrain.exaggeration});if(normalized.showHillshade){source(ids.hillshadeSource,demSpec());layer(ids.hillshade,{type:'hillshade',source:ids.hillshadeSource,paint:{'hillshade-exaggeration':.4}});}}
  registered=true;error=null;finish();
 }catch(err){registered=false;error=err;finish(err);}finally{installing=false;}}
 const controller={config:normalized,ready,inspect(){return {type:normalized.type,styleUrl:normalized.styleUrl,registered:!disposed&&registered&&ownsResources()&&terrainReady(),imagery:normalized.type==='imagery'||!!normalized.imagery,terrain:!!normalized.terrain,showHillshade:normalized.showHillshade??false,error:error?.message??null};},destroy(){if(disposed)return;disposed=true;clearTimeout(timer);for(const event of events)map.off(event,register);if(!settled)finish(Error('Basemap disposed before its style became ready'));try{if(map.getTerrain?.()?.source===ids.dem&&sources.get(ids.dem)===map.getSource(ids.dem))map.setTerrain(null);for(const key of [...layers.keys()].reverse())if(ownsLayer(key))map.removeLayer(key);for(const [key,owned] of [...sources].reverse())if(map.getSource(key)===owned)map.removeSource(key);}finally{owners.delete(id);registered=false;}}};
 owners.set(id,controller);for(const event of events)map.on(event,register);timer=setTimeout(()=>{error=Error('Basemap style did not become ready');finish(error);},20000);register();return controller;
}

// Constructors that require a loaded style can await TileJSON/source initialization.
// This is not a complete tilesLoaded/idle test for screenshots or video capture.
export function waitForBasemapStyle(map,{timeoutMs=20000}={}){
 if(map.isStyleLoaded())return Promise.resolve();
 return new Promise((resolve,reject)=>{let timer;const events=['idle','sourcedata','styledata'],cleanup=()=>{clearTimeout(timer);for(const event of events)map.off(event,check);},check=()=>{if(map.isStyleLoaded()){cleanup();resolve();}};timer=setTimeout(()=>{cleanup();reject(Error('Basemap resources did not become ready'));},timeoutMs);for(const event of events)map.on(event,check);check();});
}

// Fixed, full-data color mapping shared by native/official-extension recipes.
const PALETTE=['#22d3ee','#a78bfa','#fbbf24','#fb7185','#34d399','#60a5fa','#f472b6','#a3e635','#fb923c','#2dd4bf','#c084fc','#facc15'];
const LIGHT_PALETTE=['#0369a1','#7c3aed','#b45309','#be123c','#047857','#1d4ed8','#be185d','#4d7c0f','#c2410c','#0f766e','#9333ea','#a16207'];
const hex=c=>typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c);
const finite=v=>typeof v==='number' && Number.isFinite(v);
export function colorMapping(features,spec) {
  const light=spec.theme==='light';
  const palette=light?LIGHT_PALETTE:PALETTE;
  const by=spec.colorBy || (['point-color','bubble','fill','extrusion'].includes(spec.effect)?'value':'constant');
  if(!['constant','value','category'].includes(by))throw Error('Unknown colorBy');
  if(spec.effect==='point-color' && by!=='value')throw Error('point-color requires value encoding');
  if(spec.effect==='heatmap' && by!=='constant')throw Error('Heatmap uses density colors, not colorBy');
  const scale=spec.colorScale || {}, missing=spec.missingColor || (light?'#64748b':'#94a3b8');
  if(!hex(missing))throw Error('missingColor must be #RRGGBB');
  const values=features.map(f=>f.properties.value).filter(finite);
  const categories=[...new Set(features.map(f=>f.properties.category).filter(v=>v!=null))].sort();
  if(by==='constant') {
    const color=spec.color || (light?'#0369a1':'#22d3ee');if(!hex(color))throw Error('color must be #RRGGBB');
    if(spec.colorScale)throw Error('Constant color does not use a colorScale');
    return {get:()=>color,legend:{type:'constant',entries:[{label:'位置 / 边界',color}]}};
  }
  let type=scale.type || (by==='category'?'categorical':'continuous');
  let domain=scale.domain, colors=scale.colors, breaks=scale.breaks;
  if(by==='category'){
    if(type!=='categorical')throw Error('Category colors require categorical scale');
    domain=domain || categories;colors=colors || palette.slice(0,domain.length);
    if(!Array.isArray(domain) || !domain.length || domain.some(v=>typeof v!=='string') || new Set(domain).size!==domain.length || categories.some(v=>!domain.includes(v)))throw Error('Category domain must include each nonmissing category exactly once');
  }else{
    if(!values.length)throw Error('Color mapping requires finite metric');
    if(!['continuous','threshold'].includes(type))throw Error('Value colors require continuous or threshold scale');
    const lo=values[0]; // avoid spread limits on large data
    const min=values.reduce((a,b)=>Math.min(a,b),lo),max=values.reduce((a,b)=>Math.max(a,b),lo);
    if(type==='continuous'){
      domain=domain || (min<0 && max>0?[-Math.max(-min,max),0,Math.max(-min,max)]:[min,max]);
      colors=colors || (domain.length===3?(light?['#be123c','#64748b','#0369a1']:['#fb7185','#e2e8f0','#22d3ee']):(light?['#0369a1','#7c3aed']:['#22d3ee','#a78bfa']));
      if(!Array.isArray(domain) || domain.length<2 || domain.some(v=>!finite(v)) || domain.some((v,i)=>i && v<=domain[i-1]) && !(domain.length===2 && domain[0]===domain[1]))throw Error('Continuous domain must be ascending finite stops');
    }else{
      if(!Array.isArray(breaks) || !breaks.length || breaks.some(v=>!finite(v)) || breaks.some((v,i)=>i && v<=breaks[i-1]))throw Error('Threshold breaks must be ascending finite numbers');
      domain=breaks;
    }
  }
  const count=type==='threshold'?breaks.length+1:domain.length;
  if(!Array.isArray(colors) || colors.length!==count || colors.some(c=>!hex(c)))throw Error('Provide one #RRGGBB color per domain stop/category or threshold interval');
  const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
  const interpolate=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
  const get=p=>{
    const value=p[by];if(value==null)return missing;
    if(type==='categorical')return colors[domain.indexOf(value)] ?? missing;
    if(type==='threshold')return colors[breaks.filter(b=>value>=b).length];
    if(domain[0]===domain.at(-1))return colors[0];
    if(value<=domain[0])return colors[0];if(value>=domain.at(-1))return colors.at(-1);
    const i=domain.findIndex(v=>v>=value);
    return interpolate(colors[i-1],colors[i],(value-domain[i-1])/(domain[i]-domain[i-1]));
  };
  const legendColors=type==='continuous' && domain[0]===domain.at(-1)?colors.slice(0,1):colors;
  const entries=legendColors.map((color,i)=>({color,label:type==='threshold'?(i===0?`< ${breaks[0]}`:i===breaks.length?`≥ ${breaks[i-1]}`:`${breaks[i-1]} ≤ x < ${breaks[i]}`):String(domain[i])}));
  return {get,legend:{type,by,domain,breaks,colors,missingColor:missing,entries,missing:features.filter(f=>f.properties[by]==null).length}};
}

export const HEAT_STOPS = Object.freeze([[0,'rgba(36,70,150,0)'],[0.12,'rgba(46,110,220,0.25)'],[0.32,'rgba(28,180,220,0.65)'],[0.55,'rgba(60,215,168,0.85)'],[0.70,'rgba(245,219,96,0.95)'],[0.84,'rgba(250,145,66,0.98)'],[0.94,'rgba(225,70,65,1)'],[1,'rgba(225,70,65,1)']].map(stop=>Object.freeze(stop)));
// Estimate overlap on a Mercator grid once from the full dataset. The resulting
// zoom curve stays fixed while filtering; this is relative density, not a count legend.
export function calibratedHeatIntensity(features, weight, radius) {
  const stops=[];
  for(const zoom of [0,4,8,10,12,14,16,20,24]) {
    const world=512*2**zoom, cells=Math.ceil(world/radius), grid=new Map();
    for(const f of features) {
      const mass=weight==='count'?1:f.properties.value;
      if(!(mass>0))continue;
      const [lng,lat]=f.geometry.coordinates, sin=Math.sin(Math.max(-85.051129,Math.min(85.051129,lat))*Math.PI/180);
      const x=Math.floor((((lng+180)/360%1)+1)%1*cells);
      const y=Math.floor((.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*world/radius);
      const key=x+','+y;grid.set(key,(grid.get(key)||0)+mass);
    }
    const densities=[];
    for(const [key,mass] of grid) {
      const [x,y]=key.split(',').map(Number);let sum=mass;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++) {
        if(!dx&&!dy)continue;
        sum+=(grid.get(((x+dx+cells)%cells)+','+(y+dy))||0)*Math.exp(-2*(dx*dx+dy*dy));
      }
      densities.push(sum);
    }
    densities.sort((a,b)=>a-b);
    const overlap=densities[Math.floor((densities.length-1)*.95)]||1;
    stops.push(zoom,2.2/overlap);
  }
  return ['interpolate',['linear'],['zoom'],...stops];
}
export function clusterCameraOptions(center,zoom){
  return {center,zoom,...(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches?{duration:0}:{})};
}
// Shared GeoJSON/style recipes. Rendering is performed by the selected SDK.
export function pointStyle(spec) {
  const keys=['pointRadius','opacity','glow','glowRadius','glowIntensity','blendMode'];
  if(!['points','point-color'].includes(spec.effect)){
    if(keys.some(key=>Object.hasOwn(spec,key)))throw Error('Point appearance options require a scatter-point effect');
    return null;
  }
  const settings={pointRadius:5,opacity:1,glow:false,glowRadius:6,glowIntensity:0.18,blendMode:'normal',...Object.fromEntries(keys.filter(key=>Object.hasOwn(spec,key)).map(key=>[key,spec[key]]))};
  for(const key of ['pointRadius','glowRadius'])if(!Number.isFinite(settings[key])||settings[key]<=0||settings[key]>100)throw Error(`${key} must be a finite pixel value in (0, 100]`);
  for(const key of ['opacity','glowIntensity'])if(!Number.isFinite(settings[key])||settings[key]<0||settings[key]>1)throw Error(`${key} must be a finite number in [0, 1]`);
  if(typeof settings.glow!=='boolean')throw Error('glow must be boolean');
  if(!['normal','additive'].includes(settings.blendMode))throw Error('blendMode must be normal or additive');
  return settings;
}

export function prepareRecipe(data, spec, prefix = 'geo-viz') {
  const appearance=pointStyle(spec);
  const maxRadius=spec.maxRadius ?? 28,heatRadius=spec.heatRadius ?? 22,lineWidth=spec.lineWidth ?? 3;
  for(const n of [maxRadius,heatRadius,lineWidth])if(typeof n!=='number' || !Number.isFinite(n) || n<=0 || n>100)throw Error('Visual sizes must be finite in (0, 100]');
  const light=spec.theme==='light',stroke=light?'#0f172a':'#e0f2fe',missing=spec.missingColor || (light?'#64748b':'#94a3b8');
  const supported = {points:['Point'], 'point-color':['Point'], bubble:['Point'], cluster:['Point'], heatmap:['Point'], line:['LineString','MultiLineString'], fill:['Polygon','MultiPolygon'], extrusion:['Polygon','MultiPolygon']};
  if (!supported[spec.effect]) throw Error('Unknown recipe effect');
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw Error('No features to render');
  if (data.metadata?.dataCrs !== 'wgs84') throw Error('Recipe requires verified WGS84 data');
  const lookup = new Map();
  const features = data.features.map(f => {
    if (!supported[spec.effect].includes(f.geometry?.type)) throw Error('Geometry does not match recipe; explicitly transform or select a layer first');
    if (typeof f.id !== 'string' || lookup.has(f.id)) throw Error('Unique stable string IDs required');
    lookup.set(f.id, f);
    const v = f.properties?.__viz?.value;
    return {type:'Feature', id:f.id, geometry:structuredClone(f.geometry), properties:{viz_id:f.id, category:f.properties?.__viz?.category ?? null, value:typeof v === 'number' && Number.isFinite(v) ? v : null}};
  });
  const values = features.map(f=>f.properties.value).filter(v=>v !== null);
  const colorBy=spec.colorBy || (['point-color','bubble','fill','extrusion'].includes(spec.effect)?'value':'constant');
  const metric = ['bubble','extrusion','point-color'].includes(spec.effect) || colorBy==='value' || (spec.effect === 'heatmap' && spec.weight === 'value');
  if (metric && !values.length) throw Error('No finite metric on rendered features');
  if (spec.effect === 'heatmap' && !['count','value'].includes(spec.weight)) throw Error('Heatmap requires explicit count or value weight');
  if (spec.effect === 'bubble' && values.some(v=>v<0) && spec.sizeMode !== 'absolute') throw Error('Signed bubbles require absolute size and sign color');
  if ((spec.effect === 'extrusion' || (spec.effect === 'heatmap' && spec.weight === 'value')) && values.some(v=>v<0)) throw Error('Negative height/heat contribution is not supported');
  if (spec.effect === 'extrusion' && (!(spec.heightScale > 0) || !Number.isFinite(spec.heightScale) || !spec.unit)) throw Error('Extrusion needs a positive heightScale (metres per metric unit) and unit');
  let lo = values.length ? values.reduce((a,b)=>Math.min(a,b)) : 0;
  let hi = values.length ? values.reduce((a,b)=>Math.max(a,b)) : 0;
  const maxAbs = Math.max(Math.abs(lo), Math.abs(hi));
  const mapping=colorMapping(features,spec);
  if(spec.effect==='bubble' && values.some(v=>v<0) && colorBy!=='value')throw Error('Signed bubbles require value color encoding');
  // Fixed full-data domain; filters and style changes do not renormalize it.
  for (const f of features) {
    const p=f.properties, v=p.value;
    p.color=mapping.get(p);
    p.radius=v === null || v === 0 ? 0 : maxRadius*Math.sqrt(Math.abs(v)/maxAbs);
    p.height=v === null ? 0 : v*(spec.heightScale || 1);
    if (!Number.isFinite(p.height)) throw Error('Derived height must be finite');
  }
  const source={type:'geojson', data:{type:'FeatureCollection', features}, promoteId:'viz_id'};
  if (spec.effect === 'cluster') Object.assign(source,{cluster:true,clusterRadius:50,clusterMaxZoom:14});
  const heatIntensity=spec.heatIntensity ?? (spec.effect==='heatmap'?calibratedHeatIntensity(features,spec.weight,heatRadius):.8);
  if(spec.heatIntensity!==undefined && (typeof heatIntensity!=='number'||!Number.isFinite(heatIntensity)||heatIntensity<=0||heatIntensity>10))throw Error('heatIntensity must be in (0, 10]');
  const layers=[];
  const layer=(suffix,type,paint,filter,layout)=>{const l={id:`${prefix}-${suffix}`,type,source:prefix,paint};if(filter)l.filter=filter;if(layout)l.layout=layout;layers.push(l);};
  const valid=['!=',['get','value'],null], absent=['==',['get','value'],null];
  const additive=appearance?.blendMode==='additive';
  const dot={'circle-radius':appearance?.pointRadius ?? 5,'circle-color':['get','color'],'circle-stroke-width':appearance?.glow||additive?0:1,'circle-stroke-color':stroke};
  if(appearance)dot['circle-opacity']=additive?0:appearance.opacity;
  if (['points','point-color'].includes(spec.effect)) {
    if(appearance.glow&&!additive)layer('point-glow','circle',{'circle-radius':appearance.pointRadius+appearance.glowRadius,'circle-color':['get','color'],'circle-opacity':appearance.opacity*appearance.glowIntensity,'circle-blur':1});
    // Additive rendering is owned by the public component's deck.gl supplement;
    // the transparent native circles retain source-backed picking and selection.
    layer('points','circle',dot);
  }
  if (spec.effect === 'bubble') {
    const positive=['all',valid,['!=',['get','value'],0]];
    layer('glow','circle',{'circle-radius':['*',['get','radius'],1.35],'circle-color':['get','color'],'circle-opacity':light?0.06:0.18,'circle-blur':0.8},positive);
    layer('bubble','circle',{'circle-radius':['get','radius'],'circle-color':['get','color'],'circle-opacity':light?0.82:0.7,'circle-stroke-width':1,'circle-stroke-color':stroke},positive,{'circle-sort-key':['-',['get','radius']]});
    // Tiny proportional circles retain their area; a separate cross marks their position.
    for(const [axis,icon] of [['h','—'],['v','│']])layer('tiny-'+axis,'symbol',{'text-color':stroke},['all',positive,['<',['get','radius'],2]],{'text-field':icon,'text-size':10,'text-allow-overlap':true,'text-ignore-placement':true});
    layer('zero','circle',{'circle-radius':3,'circle-color':light?'#ffffff':'#0b1220','circle-stroke-color':stroke,'circle-stroke-width':1},['==',['get','value'],0]);
    layer('missing','circle',{'circle-radius':4,'circle-color':missing,'circle-opacity':0.85,'circle-stroke-width':1,'circle-stroke-color':stroke},absent);
  }
  if (spec.effect === 'cluster') {
    layer('clusters','circle',{'circle-radius':20,'circle-color':light?'#6d28d9':'#818cf8','circle-stroke-color':light?'#4c1d95':'#c4b5fd','circle-stroke-width':2},['has','point_count']);
    layer('count','symbol',{'text-color':'#fff'},['has','point_count'],{'text-field':['get','point_count_abbreviated'],'text-size':12,'text-allow-overlap':true,'text-ignore-placement':true});
    layer('points','circle',dot,['!', ['has','point_count']]);
  }
  if (spec.effect === 'heatmap') {
    layer('heat','heatmap',{'heatmap-weight':spec.weight === 'count' ? 1 : ['get','value'],'heatmap-radius':heatRadius,'heatmap-intensity':heatIntensity,'heatmap-opacity':0.82,'heatmap-color':['interpolate',['linear'],['heatmap-density'],...HEAT_STOPS.flat()]},spec.weight === 'value' ? valid : undefined);
    // Transparent circles retain exact-location picking without puncturing the density surface.
    layer('points','circle',{'circle-radius':3,'circle-color':light?'#0f172a':'#e2e8f0','circle-opacity':0});
  }
  if (spec.effect === 'line') {
    layer('glow','line',{'line-width':lineWidth+7,'line-color':['get','color'],'line-opacity':light?0.08:0.22,'line-blur':4});
    layer('line','line',{'line-width':lineWidth,'line-color':['get','color']},undefined,{'line-cap':'round','line-join':'round'});
  }
  if (spec.effect === 'fill' || spec.effect === 'extrusion') {
    if (spec.effect === 'fill') layer('fill','fill',{'fill-color':['get','color'],'fill-opacity':0.7});
    else {
      layer('extrusion','fill-extrusion',{'fill-extrusion-color':['get','color'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':0.8},valid);
      layer('missing','fill',{'fill-color':missing,'fill-opacity':0.4},absent);
    }
    // Ground-level lines render above 3D columns in the layer stack; keep them in 2D only.
    if (spec.effect === 'fill') layer('outline','line',{'line-color':light?'#334155':'#cbd5e1','line-width':0.7});
  }
  if(data.features.every(f=>f.geometry.type==='Point'))layer('selected','circle',{'circle-radius':spec.effect==='bubble'?['max',9,['+',['get','radius'],4]]:9,'circle-opacity':0,'circle-stroke-width':2,'circle-stroke-color':light?'#0f172a':'#ffffff'},['==',['get','selected'],true]);
  const legend={heatStops:HEAT_STOPS,maxRadius,heatRadius,lineWidth,min:lo,max:hi,split:(lo+hi)/2,maxAbs,missing:features.length-values.length,zero:values.filter(v=>v===0).length,colorScale:mapping.legend,unit:spec.unit || '',sizeMode:spec.sizeMode || 'nonnegative',weight:spec.weight};
  return {source,layers,lookup,legend};
}

export function mountRecipe(map, data, spec, {prefix='geo-viz',onPick=()=>{},onError=()=>{},provider='mapbox',pointSupplement=false}={}) {
  if (!['mapbox','maplibre'].includes(provider)) throw Error('Unsupported GL provider');
  if(spec.blendMode==='additive'&&!pointSupplement)throw Error('Use PointViz/createViz for additive points; native circle layers alone cannot render additive blending');
  let recipe=prepareRecipe(data,spec,prefix);
  let disposed=false, installing=false, current=recipe.source.data, revision=0;
  let selected=new Set(),activeFilter=()=>true;
  const motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const animated=spec.effect==='bubble' && spec.bubbleEntrance===true;
  let animationFrame=null, entranceFinished=!animated || !!motion?.matches || !globalThis.requestAnimationFrame;
  function entrancePaint(layer,progress,scale=progress){
    if(layer.id.endsWith('-selected'))return {};
    const keys=layer.type==='circle'?['circle-opacity','circle-stroke-opacity']:layer.type==='symbol'?['text-opacity']:[];
    const paint=Object.fromEntries(keys.flatMap(key=>[[key,(layer.paint[key] ?? 1)*progress],[key+'-transition',{duration:0}]]));
    // The small-value cross is a position aid. Reveal it only after circles
    // reach their data-derived radii, so it cannot dominate the entrance.
    if(layer.id.endsWith('-tiny-h')||layer.id.endsWith('-tiny-v'))paint['text-opacity']=progress===1&&scale===1?1:0;
    if(layer.type==='circle'){
      const radius=layer.paint['circle-radius'];
      paint['circle-radius']=scale===1?radius:['*',radius,scale];
      paint['circle-radius-transition']={duration:0};
    }
    return paint;
  }
  function applyEntrance(progress,scale=progress){
    for(const layer of recipe.layers)if(map.getLayer(layer.id))
      for(const [key,value] of Object.entries(entrancePaint(layer,progress,scale)))map.setPaintProperty(layer.id,key,value);
  }
  function finishEntrance(){
    if(animationFrame!==null)globalThis.cancelAnimationFrame?.(animationFrame);
    animationFrame=null;entranceFinished=true;
    if(!disposed)applyEntrance(1);
  }
  function startEntrance(){
    if(disposed || entranceFinished)return;
    if(motion?.matches || globalThis.document?.hidden){finishEntrance();return;}
    let start;
    const tick=now=>{
      if(disposed)return;
      start ??= now;
      const elapsed=now-start,progress=Math.min(1,elapsed/2000);
      // ElasticOut: one entrance with overshoot, then the exact data-derived radius.
      const scale=progress===0?0:progress===1?1:Math.pow(2,-10*progress)*Math.sin((progress*10-.75)*(2*Math.PI/3))+1;
      applyEntrance(Math.min(1,elapsed/600),scale);
      if(progress<1)animationFrame=globalThis.requestAnimationFrame(tick);
      else finishEntrance();
    };
    animationFrame=globalThis.requestAnimationFrame(tick);
  }
  const motionChange=()=>{if(motion.matches)finishEntrance();};
  const visibilityChange=()=>{if(globalThis.document?.hidden)finishEntrance();};
  if(animated){motion?.addEventListener?.('change',motionChange);globalThis.document?.addEventListener('visibilitychange',visibilityChange);}

  let resolveReady;
  const ready=new Promise(resolve=>{resolveReady=resolve;});
  const events=['style.load','styledata','sourcedata','idle'];
  const report=()=>{resolveReady(false);onError(new Error('Map layer operation failed; check SDK compatibility and data.'));};
  const install=()=>{
    if(disposed || installing || !map.isStyleLoaded())return;
    installing=true;
    try {
      if(!map.getSource(prefix))map.addSource(prefix,{...recipe.source,data:current});
      for(const l of recipe.layers)if(!map.getLayer(l.id))map.addLayer(entranceFinished?l:{...l,paint:{...l.paint,...entrancePaint(l,0)}});
      if(map.isSourceLoaded?.(prefix)!==false)resolveReady(true);
    }catch{report();}finally{installing=false;}
  };
  const click=e=>{
    if(disposed)return;
    const ids=recipe.layers.filter(l=>l.type!=='heatmap' && map.getLayer(l.id)).map(l=>l.id);
    const hits=ids.length ? map.queryRenderedFeatures(e.point,{layers:ids}) : [];
    const cluster=hits.find(f=>f.properties?.cluster_id != null);
    if(cluster) {
      const source=map.getSource(prefix), rev=revision, id=cluster.properties.cluster_id;
      const active=()=>!disposed && revision===rev && map.getSource(prefix)===source;
      onPick({count:cluster.properties.point_count, loadLeaves:(offset=0,limit=50)=>new Promise((resolve,reject)=>{
        if(!active())return resolve([]);
        const complete=(error,leaves)=>{
          if(!active())return resolve([]);
          if(error)return reject(Error('Cluster members unavailable'));
          resolve(leaves.map(f=>recipe.lookup.get(f.properties.viz_id)).filter(Boolean));
        };
        if(provider==='maplibre')Promise.resolve().then(()=>source.getClusterLeaves(id,limit,offset)).then(leaves=>complete(null,leaves),()=>complete(new Error('Cluster members unavailable')));
        else source.getClusterLeaves(id,limit,offset,complete);
      }), expand:()=>{
        if(!active())return;
        const complete=(error,zoom)=>{
        if(!active())return;
        if(error)return report();
        map.easeTo(clusterCameraOptions(cluster.geometry.coordinates,zoom));
        };
        if(provider==='maplibre')Promise.resolve().then(()=>source.getClusterExpansionZoom(id)).then(zoom=>complete(null,zoom),()=>complete(new Error('Cluster expansion failed')));
        else source.getClusterExpansionZoom(id,complete);
      }});
    }else {
      const unique=[...new Set(hits.map(f=>f.properties?.viz_id))];
      const items=unique.map(id=>recipe.lookup.get(id)).filter(Boolean);
      if(items.length)onPick({items,count:items.length});
    }
  };
  for(const event of events)map.on(event,install);map.on('click',click);
  install();ready.then(ok=>{if(ok && !disposed)startEntrance();});
  return {
    ready,
    get legend(){return recipe.legend;},
    get renderedData(){return current;},
    setTheme(theme){
      if(disposed)return;
      if(!['dark','light'].includes(theme))throw Error('Unsupported theme');
      const keep=new Set(current.features.map(f=>f.properties.viz_id));
      const next=prepareRecipe(data,{...spec,theme},prefix);
      for(const f of next.source.data.features)f.properties.selected=selected.has(f.properties.viz_id);
      if(!entranceFinished)finishEntrance();
      recipe=next;spec={...spec,theme};current={...next.source.data,features:next.source.data.features.filter(f=>keep.has(f.properties.viz_id))};revision++;
      map.getSource(prefix)?.setData(current);
      for(const l of recipe.layers)if(map.getLayer(l.id))for(const [property,value] of Object.entries(l.paint))map.setPaintProperty(l.id,property,value);
    },
    setData(nextData){
      if(disposed)return;
      const next=prepareRecipe(nextData,spec,prefix);
      const visible=next.source.data.features.filter(f=>activeFilter(next.lookup.get(f.properties.viz_id)));
      for(const f of next.source.data.features)f.properties.selected=selected.has(f.properties.viz_id);
      if(!entranceFinished)finishEntrance();
      data=nextData;recipe=next;current={...next.source.data,features:visible};revision++;
      map.getSource(prefix)?.setData(current);
      for(const l of recipe.layers)if(map.getLayer(l.id))for(const [property,value] of Object.entries(l.paint))map.setPaintProperty(l.id,property,value);
      return visible.length;
    },
    inspect(){
      const source=map.getSource(prefix);
      const layers=recipe.layers.map(l=>({id:l.id,expectedType:l.type,actualType:map.getLayer(l.id)?.type ?? null}));
      return {id:prefix,effect:spec.effect,count:current.features.length,paused:null,destroyed:disposed,provider,selectedIds:[...selected],rendererOwner:'provider-native',sourceId:prefix,sourceType:source?.type ?? null,layers,
        registered:!disposed && source?.type==='geojson' && layers.every(l=>l.actualType===l.expectedType && l.actualType!=='custom')};
    },
    setSelected(ids=[]){
      if(disposed)return;selected=new Set(ids);
      for(const f of recipe.source.data.features)f.properties.selected=selected.has(f.properties.viz_id);
      map.getSource(prefix)?.setData(current);
    },
    setFilter(predicate=()=>true){
      if(disposed)return;
      if(typeof predicate!=='function')throw Error('Filter must be a function');
      const next=recipe.source.data.features.filter(f=>predicate(recipe.lookup.get(f.properties.viz_id)));
      activeFilter=predicate;
      current={type:'FeatureCollection',features:next};revision++;
      map.getSource(prefix)?.setData(current);
      return next.length;
    },
    destroy(){
      if(disposed)return;disposed=true;revision++;resolveReady(false);finishEntrance();
      if(animated){motion?.removeEventListener?.("change",motionChange);globalThis.document?.removeEventListener("visibilitychange",visibilityChange);}
      for(const event of events)map.off(event,install);map.off('click',click);
      for(const l of [...recipe.layers].reverse())if(map.getLayer(l.id))map.removeLayer(l.id);
      if(map.getSource(prefix))map.removeSource(prefix);
    }
  };
}


// A pending candidate never destroys the visible layer. Latest request wins.
export function createRecipeSwitcher(map, data, options={}) {
  let active=null, pending=null, sequence=0, disposed=false;
  return {
    get active(){return active;},
    async show(spec) {
      if(disposed)return null;
      const request=++sequence;
      pending?.destroy();pending=null;
      const candidate=mountRecipe(map,data,spec,{...options,onPick:result=>{if(active===candidate)options.onPick?.(result);},prefix:`${options.prefix || 'geo-viz'}-${request}`});
      pending=candidate;
      let timer;
      const ok=await Promise.race([candidate.ready,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),options.timeoutMs ?? 15000);})]);
      clearTimeout(timer);
      if(disposed || request!==sequence){candidate.destroy();return null;}
      pending=null;
      if(!ok){candidate.destroy();throw Error('New map layer did not become ready; previous layer retained.');}
      const previous=active;active=candidate;previous?.destroy();return active;
    },
    destroy(){disposed=true;sequence++;pending?.destroy();active?.destroy();pending=null;active=null;}
  };
}

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

// Optional additive supplement for the existing scatter-point components.
// Normal mode and its soft halo stay entirely in the selected map SDK.

export const POINT_DECK_VERSION='9.1.14';
const additiveParameters=Object.freeze({blend:true,
 blendColorOperation:'add',blendColorSrcFactor:'src-alpha',blendColorDstFactor:'one',
 blendAlphaOperation:'add',blendAlphaSrcFactor:'one',blendAlphaDstFactor:'one-minus-src-alpha',
 depthWriteEnabled:false,depthCompare:'always'});

function validatePointCoordinates(data){
 for(const feature of data?.features??[]){
  const [lng,lat]=feature.geometry?.coordinates??[];
  if(feature.geometry?.type!=='Point'||!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>85.051129)throw Error('Additive points require WGS84 Point coordinates within Mercator bounds');
 }
}

function pointBuffers(features){
 const positions=new Float64Array(features.length*3),colors=new Uint8Array(features.length*4);
 features.forEach((feature,i)=>{
  const [lng,lat]=feature.geometry.coordinates;
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>85.051129)throw Error('Additive points require WGS84 coordinates within Mercator bounds');
  positions.set([lng,lat,0],i*3);
  const color=feature.properties.color;
  colors.set([1,3,5].map(offset=>parseInt(color.slice(offset,offset+2),16)).concat(255),i*4);
 });
 return {length:features.length,attributes:{getPosition:{value:positions,size:3},getFillColor:{value:colors,size:4,normalized:true}}};
}

export function mountAdditivePoints(map,data,spec,options={}){
 const appearance=pointStyle(spec),deck=globalThis.deck;
 if(['MapboxOverlay','ScatterplotLayer'].some(name=>typeof deck?.[name]!=='function'))throw Error(`Additive points require deck.gl ${POINT_DECK_VERSION} with MapboxOverlay and ScatterplotLayer; load it before creating the component`);
 // Validate before owning SDK resources; a failed replacement preserves the old component.
 const {prefix='geo-viz',onError=()=>{}}=options;
 validatePointCoordinates(data);
 const native=mountRecipe(map,data,spec,{...options,pointSupplement:true});
 let overlay,added=false,loaded=false,destroyed=false,buffer,halo;
 let resolveReady;const ready=new Promise(resolve=>{resolveReady=resolve;});
 class SoftPointLayer extends deck.ScatterplotLayer{
  static layerName='GeoVizSoftPointLayer';
  getShaders(){const shaders=super.getShaders();return {...shaders,inject:{...shaders.inject,
   'fs:DECKGL_FILTER_COLOR':(shaders.inject?.['fs:DECKGL_FILTER_COLOR']??'')+'\ncolor.a *= exp(-4.5 * dot(geometry.uv, geometry.uv));'}};}
 }
 function layerIds(){return [...(halo?[prefix+'-additive-halo']:[]),prefix+'-additive-core'];}
 function redraw(){
  if(destroyed||!overlay)return;
  const style=pointStyle(spec);halo=style.glow;
  const common={data:buffer,parameters:additiveParameters,radiusUnits:'pixels',billboard:true,stroked:false,pickable:false,beforeId:prefix+'-selected'};
  overlay.setProps({layers:[...(halo?[new SoftPointLayer({...common,id:prefix+'-additive-halo',getRadius:style.pointRadius+style.glowRadius,opacity:style.opacity*style.glowIntensity})]:[]),
   new deck.ScatterplotLayer({...common,id:prefix+'-additive-core',getRadius:style.pointRadius,opacity:style.opacity})]});
 }
 function update(){buffer=pointBuffers(native.renderedData.features);redraw();}
 function destroy(){
  if(destroyed)return;destroyed=true;resolveReady(false);map.off('remove',destroy);
  // The deck layers reference a native beforeId, so remove them first.
  if(added){added=false;map.removeControl(overlay);}else overlay?.finalize?.();
  native.destroy();buffer=null;
 }
 function fail(){if(destroyed)return;destroy();onError(new Error('Additive point rendering failed; check deck.gl/WebGL compatibility.'));}
 try{
  update();
  overlay=new deck.MapboxOverlay({interleaved:true,layers:[],onLoad:()=>{
   if(destroyed)return;loaded=true;resolveReady(true);map.triggerRepaint?.();
  },onError:fail});
  redraw();map.on('remove',destroy);
  native.ready.then(ok=>{
   if(destroyed)return;
   if(!ok){destroy();return;}
   try{added=true;map.addControl(overlay);}catch{fail();}
  });
 }catch(error){destroy();throw error;}
 return {
  ready,get legend(){return native.legend;},
  setData(next){if(destroyed)return;validatePointCoordinates(next);const count=native.setData(next);update();return count;},
  setFilter(predicate){if(destroyed)return;const count=native.setFilter(predicate);update();return count;},
  setTheme(theme){if(destroyed)return;native.setTheme(theme);spec={...spec,theme};update();},
  setSelected(ids){if(!destroyed)native.setSelected(ids);},
  inspect(){const proof=native.inspect(),layers=layerIds().map(id=>({id,expectedType:'custom',actualType:map.getLayer(id)?.type??null}));
   return {...proof,rendererOwner:'hybrid',library:'deck.gl',version:POINT_DECK_VERSION,blendMode:'additive',glow:appearance.glow,
    fallbackReason:'Additive color blending is not exposed by the native circle style layer',destroyed,
    layers:[...proof.layers,...layers],registered:!destroyed&&loaded&&added&&proof.registered&&layers.every(layer=>layer.actualType==='custom')};
  },destroy
 };
}

// Public flat-map visualization API. Class names describe data semantics, not
// Mapbox/MapLibre style-layer types or namespaced classes from other vendors.
// The renderer behind a component is an implementation detail; callers select
// by the question and verified fields.

function optionsFor(effect,options){
 const {data,provider='maplibre',id=`geo-${effect}`,theme='dark',onPick=()=>{},onError=()=>{},spec={},...effectOptions}=options;
 if(data==null)throw Error(`${effect} requires data`);
 if(typeof onPick!=='function'||typeof onError!=='function')throw Error('Callbacks must be functions');
 if(!spec || typeof spec!=='object' || Array.isArray(spec))throw Error('spec must be an object');
 if(spec?.effect && spec.effect!==effect)throw Error('Viz effect conflicts with spec.effect');
 return {data,provider,id,theme,onPick,onError,spec,effectOptions};
}

class VisualComponent{
 get legend(){return this.layer.legend??null;}
 setData(data){return this.layer.setData(data);}
 setFilter(predicate){return this.layer.setFilter(predicate);}
 setTheme(theme){return this.layer.setTheme(theme);}
 inspect(){return {...this.layer.inspect(),effect:this.constructor.effect};}
 destroy(){return this.layer.destroy();}
}

class GLViz extends VisualComponent{
 constructor(map,options={}){
  super();const effect=new.target.effect,{data,provider,id,theme,onPick,onError,spec,effectOptions}=optionsFor(effect,options);
  if(!['maplibre','mapbox'].includes(provider))throw Error(`${effect} needs a verified implementation for ${provider}`);
  if(Object.keys(effectOptions).length)throw Error(`${effect} options must be placed in spec`);
  const layerEffect=new.target.layerEffect??effect;
  const layerSpec={...new.target.defaults,...spec,effect:layerEffect,theme};
  if(effect==='category-points'&&layerSpec.colorBy!=='category')throw Error('category-points requires categorical color');
  const mount=layerSpec.blendMode==='additive'?mountAdditivePoints:mountRecipe;
  this.layer=mount(map,data,layerSpec,{provider,prefix:id,onError,onPick:result=>{
   if(result.loadLeaves)onPick({effect,kind:'cluster',items:[],...result});
   else onPick({effect,kind:'features',...result});
  }});
  this.ready=this.layer.ready;
 }
 setSelected(ids){return this.layer.setSelected(ids);}
}

export class PointViz extends GLViz{static effect='points';}
export class CategoryPointsViz extends GLViz{static effect='category-points';static layerEffect='points';static defaults={colorBy:'category'};}
export class MetricPointsViz extends GLViz{static effect='point-color';}
export class BubbleViz extends GLViz{static effect='bubble';}
export class ClusterViz extends GLViz{static effect='cluster';}
export class HeatmapViz extends GLViz{static effect='heatmap';}
export class LineViz extends GLViz{static effect='line';}
export class ChoroplethViz extends GLViz{static effect='fill';}
export class ExtrusionViz extends GLViz{static effect='extrusion';}

const MAPLIBRE_SPEC_OPTIONS=Object.freeze({
 flight:['deck','duration','trailLength','heightRatio'],
 pulse:['color','radius'],radar:['radiusMeters','period','sweepAngle','opacity','color'],
 hexagon:['cellSize','aggregation','valueField','mode','heightScale']
});

class MapLibreViz extends VisualComponent{
 constructor(map,options={}){
  super();const effect=new.target.effect,{data,provider,id,theme,onPick,spec,effectOptions}=optionsFor(effect,options);
  if(provider!=='maplibre')throw Error(`${effect} needs a verified implementation for ${provider}`);
  if(Object.keys(effectOptions).length)throw Error(`${effect} options must be placed in spec`);
  const {effect:specifiedEffect,...settings}=spec;
  for(const key of Object.keys(settings)){
   if(['data','provider','id','theme','onPick','onError'].includes(key))throw Error(`${key} must be a component option, not a spec field`);
   if(!MAPLIBRE_SPEC_OPTIONS[effect].includes(key))throw Error(`Unknown ${effect} spec option: ${key}`);
  }
  const Type=new.target.layerType;
  this.layer=new Type(map,{...settings,provider,id,data,theme,onPick:item=>onPick({effect,kind:effect==='flight'?'record':effect==='hexagon'?'aggregate':'feature',items:[item],count:1})});
  this.ready=Promise.resolve(true);
 }
}

export class FlyLineViz extends MapLibreViz{static effect='flight';static layerType=FlightLayer;pause(){this.layer.pause();}play(){this.layer.play();}}
export class RippleViz extends MapLibreViz{static effect='pulse';static layerType=PulsePointLayer;pause(){this.layer.pause();}play(){this.layer.play();}}
export class RadarScanViz extends MapLibreViz{static effect='radar';static layerType=RadarScanLayer;pause(){this.layer.pause();}play(){this.layer.play();}}
export class HexagonViz extends MapLibreViz{static effect='hexagon';static layerType=HexagonLayer;setMode(mode){return this.layer.setMode(mode);}setCellSize(size){return this.layer.setCellSize(size);}}

export const VIZ_COMPONENTS=Object.freeze({
 points:PointViz,'category-points':CategoryPointsViz,'point-color':MetricPointsViz,bubble:BubbleViz,
 cluster:ClusterViz,heatmap:HeatmapViz,line:LineViz,
 fill:ChoroplethViz,extrusion:ExtrusionViz,flight:FlyLineViz,
 pulse:RippleViz,radar:RadarScanViz,hexagon:HexagonViz
});

export function createViz(map,{effect,...options}){
 const Component=Object.hasOwn(VIZ_COMPONENTS,effect)?VIZ_COMPONENTS[effect]:null;
 if(!Component)throw Error(`Unknown visualization: ${effect}`);
 return new Component(map,options);
}

// UI helper for switching between spec-based components on the same normalized data.
// Keep the previous map visible until the next component is ready.
export function createVizSwitcher(map,data,{provider='maplibre',prefix='geo-viz',onPick=()=>{},onError=()=>{},timeoutMs=15000}={}){
 let active=null,pending=null,sequence=0,destroyed=false;
 return {
  get active(){return active;},
  async show(spec){
   if(destroyed)return null;
   const request=++sequence;pending?.destroy();pending=null;
   const effect=spec.effect==='points'&&spec.colorBy==='category'?'category-points':spec.effect;
   const candidate=createViz(map,{effect,provider,data,id:`${prefix}-${request}`,theme:spec.theme,spec:{...spec,effect},onError,
    onPick:result=>{if(active===candidate)onPick(result);}});
   pending=candidate;
   let timer;
   const ok=await Promise.race([candidate.ready,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
   clearTimeout(timer);
   if(destroyed||request!==sequence){candidate.destroy();return null;}
   pending=null;
   if(!ok){candidate.destroy();throw Error('New map layer did not become ready; previous layer retained.');}
   const previous=active;active=candidate;previous?.destroy();return active;
  },
  destroy(){destroyed=true;sequence++;pending?.destroy();active?.destroy();pending=null;active=null;}
 };
}
