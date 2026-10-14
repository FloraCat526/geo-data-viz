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
export function applyBasemap(map,config,{provider='maplibre',theme='dark',id='geo-basemap',timeoutMs=20000}={}){
 const normalized=normalizeBasemap(config,{provider,theme});
 if(!map||typeof map.addSource!=='function'||typeof map.addLayer!=='function'||typeof map.on!=='function')basemapFail('a native GL map instance is required');
 if(typeof id!=='string'||!/^\w[\w-]*$/.test(id))basemapFail('id must contain only letters, digits, underscores, and hyphens');
 if(!Number.isFinite(timeoutMs)||timeoutMs<1000||timeoutMs>300000)basemapFail('timeoutMs must be between 1000 and 300000 milliseconds');
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
 owners.set(id,controller);for(const event of events)map.on(event,register);timer=setTimeout(()=>{error=Error('Basemap style did not become ready');finish(error);},timeoutMs);register();return controller;
}

// Constructors that require a loaded style can await TileJSON/source initialization.
// This is not a complete tilesLoaded/idle test for screenshots or video capture.
export function waitForBasemapStyle(map,{timeoutMs=20000}={}){
 if(map.isStyleLoaded())return Promise.resolve();
 return new Promise((resolve,reject)=>{let timer;const events=['idle','sourcedata','styledata'],cleanup=()=>{clearTimeout(timer);for(const event of events)map.off(event,check);},check=()=>{if(map.isStyleLoaded()){cleanup();resolve();}};timer=setTimeout(()=>{cleanup();reject(Error('Basemap resources did not become ready'));},timeoutMs);for(const event of events)map.on(event,check);check();});
}
