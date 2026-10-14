/** Geo Data Viz — MIT. Frame-addressable map scenes for HTML and Remotion. */
import {normalizeBasemap, applyBasemap} from '../shared/basemap.mjs';

const providers = new Set(['maplibre','mapbox','maptiler','cesium','static']);
const normalized = new WeakSet();
const ids = /^[A-Za-z][\w-]*$/;
const clamp = n => Math.max(0, Math.min(1, n));
const fc = features => ({type:'FeatureCollection',features});
const text = (v, key, max = 2000) => {
  if (v == null) return '';
  if (typeof v !== 'string' || v.length > max) throw new Error(`${key} must be text of at most ${max} characters`);
  return v;
};
const number = (v, key, min, max) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be finite between ${min} and ${max}`);
  return v;
};
const record = (v, key) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${key} must be an object`);
  return v;
};
export function sceneResourceUrl(value, key = 'resource') {
  if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0020\\]/.test(value)) throw new Error(`${key} must be an HTTP(S) URL or a relative asset path`);
  const scheme = /^([a-z][\w+.-]*):/i.exec(value);
  if ((scheme && !/^https?$/i.test(scheme[1])) || value.startsWith('//')) throw new Error(`${key} must use HTTP(S) or a relative asset path`);
  return value;
}
function coordinate(value, key, provider) {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`${key} must be WGS84 [longitude, latitude]`);
  return [number(value[0],key,-180,180),number(value[1],key,provider === 'cesium' ? -90 : -85,provider === 'cesium' ? 90 : 85)];
}
function camera(value, key, provider) {
  record(value,key);
  const pose = {center:coordinate(value.center,`${key}.center`,provider),zoom:number(value.zoom ?? 8,`${key}.zoom`,0,22),
    pitch:number(value.pitch ?? 0,`${key}.pitch`,0,85),bearing:number(value.bearing ?? 0,`${key}.bearing`,-360,360)};
  if (provider === 'cesium') pose.height = number(value.height ?? 20000,`${key}.height`,1,50000000);
  if (provider === 'static' && pose.pitch !== 0) throw new Error('Static map scenes support pan, zoom and bearing; pitch must be 0');
  return pose;
}
function keyedList(list, key, convert) {
  if (!Array.isArray(list)) throw new Error(`${key} must be an array`);
  const seen = new Set();
  return list.map((item,index) => {
    record(item,`${key}[${index}]`);
    if (!ids.test(item.id ?? '') || seen.has(item.id)) throw new Error(`${key} IDs must be unique and URL-safe`);
    seen.add(item.id);
    return convert(item,index);
  });
}

/** Routes are supplied geometry. No routing/geocoding service is called. */
export function normalizeScene(input,{provider:override} = {}) {
  if (normalized.has(input) && (!override || override === input.provider)) return input;
  record(input,'scene');
  const provider = override ?? input.provider ?? 'maplibre';
  if (!providers.has(provider)) throw new Error('Unknown scene provider');
  if (input.schemaVersion !== 1) throw new Error('scene.schemaVersion must be 1');
  if (input.metadata?.dataCrs !== 'wgs84') throw new Error('Scene requires verified WGS84 coordinates');
  const duration = number(input.duration ?? 20,'duration',.1,3600);
  const theme=input.theme ?? 'dark';
  if(!['dark','light'].includes(theme))throw new Error('Scene theme must be dark or light');
  const result = {schemaVersion:1,metadata:{...input.metadata,dataCrs:'wgs84'},provider,theme,attribution:text(input.attribution,'attribution',2000),title:text(input.title ?? '地图故事','title',160),duration,
    fps:number(input.fps ?? 30,'fps',1,120),width:number(input.width ?? 1920,'width',100,7680),height:number(input.height ?? 1080,'height',100,7680)};
  if (![result.fps,result.width,result.height].every(Number.isInteger)) throw new Error('fps, width and height must be integers');
  if(input.basemap != null){
    if(!['maplibre','mapbox','maptiler'].includes(provider))throw new Error('basemap is only available for GL scene providers');
    const missingStyle=provider==='maptiler'&&input.basemap.styleUrl==null;
    result.basemap=normalizeBasemap(missingStyle?{...input.basemap,styleUrl:'https://api.maptiler.com/maps/dataviz/style.json'}:input.basemap,{provider,theme});
    if(missingStyle)delete result.basemap.styleUrl;
  }
  result.locations = keyedList(input.locations ?? [],'locations',item => ({id:item.id,name:text(item.name ?? item.id,'location.name',120),
    coordinates:coordinate(item.coordinates,'location.coordinates',provider),description:text(item.description,'location.description'),
    ...(item.image ? {image:sceneResourceUrl(item.image,'location.image')} : {})}));
  result.routes = keyedList(input.routes ?? [],'routes',item => {
    if (!Array.isArray(item.coordinates) || item.coordinates.length < 2 || item.coordinates.length > 200000) throw new Error('Route requires 2 to 200000 supplied coordinates');
    const coordinates = item.coordinates.map(p => coordinate(p,'route.coordinates',provider));
    if (coordinates.some((p,i) => i && Math.abs(p[0] - coordinates[i-1][0]) > 180)) throw new Error('Split routes at the antimeridian before displaying');
    const kind = item.kind ?? 'provided';
    if (!['provided','schematic'].includes(kind)) throw new Error('Route kind must be provided or schematic');
    return {id:item.id,coordinates,kind};
  });
  const locations = new Map(result.locations.map(x => [x.id,x]));
  const routes = new Map(result.routes.map(x => [x.id,x]));
  result.chapters = keyedList(input.chapters,'chapters',(item,index) => {
    const start = number(item.start,'chapter.start',0,duration), end = number(item.end,'chapter.end',0,duration);
    if (end <= start || Math.abs(start - (index ? input.chapters[index-1].end : 0)) > 1e-6) throw new Error('Chapters must be ordered and cover the duration continuously');
    if (item.locationId != null && !locations.has(item.locationId)) throw new Error('Unknown chapter locationId');
    if (item.routeId != null && !routes.has(item.routeId)) throw new Error('Unknown chapter routeId');
    record(item.camera,'chapter.camera');
    if(item.camera.followRoute != null && typeof item.camera.followRoute !== 'boolean')throw new Error('camera.followRoute must be boolean');
    if(item.camera.followRoute && !item.routeId)throw new Error('camera.followRoute requires chapter.routeId');
    const from = camera(item.camera.from,'camera.from',provider), to = camera(item.camera.to ?? item.camera.from,'camera.to',provider);
    const progress = item.routeProgress ?? {from:0,to:1};
    record(progress,'routeProgress');
    return {id:item.id,start,end,title:text(item.title,'chapter.title',160),text:text(item.text,'chapter.text'),
      locationId:item.locationId ?? null,routeId:item.routeId ?? null,camera:{from,to,followRoute:item.camera.followRoute ?? false},
      routeProgress:{from:number(progress.from,'routeProgress.from',0,1),to:number(progress.to,'routeProgress.to',0,1)},
      ...(item.image ? {image:sceneResourceUrl(item.image,'chapter.image')} : {})};
  });
  if (!result.chapters.length || Math.abs(result.chapters.at(-1).end - duration) > 1e-6) throw new Error('Chapters must cover 0 through duration');
  if (!Array.isArray(input.audio ?? [])) throw new Error('audio must be an array');
  result.audio = (input.audio ?? []).map(item => {
    record(item,'audio');
    const start = number(item.start ?? 0,'audio.start',0,duration),end = number(item.end ?? duration,'audio.end',0,duration);
    if (end <= start) throw new Error('Audio end must be after start');
    return {src:sceneResourceUrl(item.src,'audio.src'),start,end,volume:number(item.volume ?? 1,'audio.volume',0,1)};
  });
  normalized.add(result);
  return result;
}

const mix = (a,b,p) => a + (b-a)*p;
const angleMix = (a,b,p) => a + ((((b-a)%360)+540)%360-180)*p;
/** Pure frame sampler: identical input and time always yield identical map state. */
export function sampleScene(input,timeSeconds) {
  const data = normalizeScene(input);
  if (typeof timeSeconds !== 'number' || !Number.isFinite(timeSeconds)) throw new Error('Scene time must be finite seconds');
  const time = Math.max(0,Math.min(data.duration,timeSeconds));
  const chapter = data.chapters.find(x => time >= x.start && time < x.end) ?? data.chapters.at(-1);
  const chapterProgress = clamp((time-chapter.start)/(chapter.end-chapter.start));
  // Smoothstep has zero velocity at chapter edges and remains fully frame-addressable.
  const eased = chapterProgress*chapterProgress*(3-2*chapterProgress),a=chapter.camera.from,b=chapter.camera.to;
  const pose = {center:[angleMix(a.center[0],b.center[0],eased),mix(a.center[1],b.center[1],eased)],
    zoom:mix(a.zoom,b.zoom,eased),pitch:mix(a.pitch,b.pitch,eased),bearing:angleMix(a.bearing,b.bearing,eased)};
  pose.center[0] = ((pose.center[0]+540)%360)-180;
  if (data.provider === 'cesium') pose.height = mix(a.height,b.height,eased);
  const route=data.routes.find(x => x.id === chapter.routeId) ?? null;
  const routeProgress=mix(chapter.routeProgress.from,chapter.routeProgress.to,chapterProgress);
  if(chapter.camera.followRoute && route)pose.center=[...partialRoute(route.coordinates,routeProgress).at(-1)];
  const routeStates = new Map();
  for (const c of data.chapters) {
    if (c.start > time) break;
    if (c.routeId) routeStates.set(c.routeId,mix(c.routeProgress.from,c.routeProgress.to,clamp((time-c.start)/(c.end-c.start))));
  }
  return {time,progress:time/data.duration,chapter,chapterProgress,location:data.locations.find(x => x.id === chapter.locationId) ?? null,
    route,camera:pose,routeProgress,
    routeStates:data.routes.map(route => ({route,progress:routeStates.get(route.id) ?? 0}))};
}

function partialRoute(coordinates,fraction) {
  if (fraction <= 0) return [coordinates[0],coordinates[0]];
  if (fraction >= 1) return coordinates.map(p => [...p]);
  const lengths = coordinates.slice(1).map((p,i) => Math.hypot((p[0]-coordinates[i][0])*Math.cos((p[1]+coordinates[i][1])*Math.PI/360),p[1]-coordinates[i][1]));
  let distance = lengths.reduce((sum,n) => sum+n,0)*fraction;
  const result = [coordinates[0]];
  for (let i=0;i<lengths.length;i++) {
    if (distance >= lengths[i]) {result.push(coordinates[i+1]);distance-=lengths[i];if(distance<=1e-12)return result;continue;}
    const p = lengths[i] ? distance/lengths[i] : 0;
    result.push([mix(coordinates[i][0],coordinates[i+1][0],p),mix(coordinates[i][1],coordinates[i+1][1],p)]);
    return result;
  }
  return result;
}
const pointFeature = (location) => ({type:'Feature',properties:{id:location.id,name:location.name},geometry:{type:'Point',coordinates:location.coordinates}});
const routeFeature = (route,progress=1) => ({type:'Feature',properties:{id:route.id,kind:route.kind},geometry:{type:'LineString',coordinates:partialRoute(route.coordinates,progress)}});

/** A frame must be drawn after its mutation, with sources/tiles ready.
 * idle is sufficient when emitted; render plus loaded checks also covers GL
 * engines whose own crossfade loop keeps emitting render without reaching idle.
 */
export function waitForSceneMapFrame(map,mutate=()=>{},timeout=30000,{stage='map frame',sources}={}) {
  return new Promise((resolve,reject) => {
    let timer,mutated=false,renderEvents=0,idleEvents=0,terrainSettled=false,terrainRefreshRender=-1;
    const invoke=(name,...args)=>{try{return typeof map[name]==='function'?map[name](...args):null;}catch{return false;}};
    const readiness=()=>{
      const sourceIds=[...new Set([...(sources ?? []),...Object.keys(invoke('getStyle')?.sources ?? {})])];
      return {stage,renderEvents,idleEvents,terrainSettled,styleLoaded:invoke('isStyleLoaded'),mapLoaded:invoke('loaded'),tilesLoaded:invoke('areTilesLoaded'),
        // MapLibre exposes loaded() before final symbol placement in its render
        // callback. If that internal flag is available, wait for placement too.
        placementReady:typeof map._placementDirty==='boolean'?!map._placementDirty:null,moving:invoke('isMoving'),zoom:invoke('getZoom'),
        sourceReady:Object.fromEntries(sourceIds.map(id=>[id,invoke('isSourceLoaded',id)]))};
    };
    const cleanup = () => {clearTimeout(timer);map.off('idle',idle);map.off('render',render);map.off('error',error);map.off('remove',removed);};
    const finish=()=>{cleanup();resolve();};
    const ready=(state,fromIdle)=>{
      if(state.styleLoaded===false||state.mapLoaded===false||state.tilesLoaded===false||state.placementReady===false||Object.values(state.sourceReady).some(value=>value===false))return false;
      // Unsupported loaded APIs may use the SDK's idle event, never the render
      // shortcut. Real GL SDKs supply all three readiness APIs.
      return fromIdle || state.styleLoaded===true&&state.mapLoaded===true&&state.tilesLoaded===true&&Object.values(state.sourceReady).every(value=>value===true);
    };
    const present=fromIdle=>{
      if(!mutated||!ready(readiness(),fromIdle))return;
      // A new DEM may adjust the camera elevation after the SDK has planned
      // raster coverage. Refresh that coverage once using the now-loaded native
      // elevation, then wait for its tiles/render too. Never change scene poses.
      const elevation=invoke('getCameraTargetElevation'),center=invoke('getCenter');
      if(!terrainSettled&&invoke('getTerrain')&&Number.isFinite(elevation)&&center&&
        ['jumpTo','getZoom','getPitch','getBearing'].every(name=>typeof map[name]==='function')){
        terrainSettled=true;terrainRefreshRender=renderEvents;
        try{map.jumpTo({center:[center.lng,center.lat],zoom:map.getZoom(),pitch:map.getPitch(),bearing:map.getBearing(),elevation});map.triggerRepaint();}
        catch(err){cleanup();reject(err);}
        return;
      }
      if(terrainSettled&&renderEvents<=terrainRefreshRender)return;
      finish();
    };
    const idle = () => {idleEvents++;present(true);};
    const render = () => {renderEvents++;present(false);};
    const error = e => {cleanup();reject(e.error ?? new Error('Map resource failed to load'));};
    const removed = () => {cleanup();reject(new Error('Map was removed during scene rendering'));};
    map.on('idle',idle);map.on('render',render);map.on('error',error);map.on('remove',removed);
    timer = setTimeout(() => {const state=readiness();cleanup();reject(new Error(`Map frame timed out while waiting for tiles, fonts or GeoJSON (${JSON.stringify(state)})`));},timeout);
    try {mutate();mutated=true;map.triggerRepaint();} catch (e) {cleanup();reject(e);}
  });
}

/** Keep the last complete terrain frame visible while the native SDK draws
 * incomplete tiles. Copy GPU output once per hold, not through a data URL.
 * Nested holds let a finite camera preflight use the same map and tile cache.
 */
export function createSceneFrameGuard(map) {
  const canvas=map.getCanvas?.(),host=map.getCanvasContainer?.();
  if(!canvas||!host||typeof document==='undefined')return null;
  const cover=document.createElement('canvas'),context=cover.getContext('2d');
  if(!context)return null;
  cover.setAttribute('aria-hidden','true');
  cover.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;display:none';
  host.append(cover);
  let depth=0,visible=false,destroyed=false;
  const show=()=>{
    if(visible)return;
    cover.width=canvas.width;cover.height=canvas.height;
    context.drawImage(canvas,0,0);
    cover.style.display='block';visible=true;host.dataset.sceneFrameHeld='true';
  };
  const hide=()=>{cover.style.display='none';visible=false;delete host.dataset.sceneFrameHeld;};
  return {
    hold(){
      if(destroyed)return ()=>{};
      if(!depth)show();depth++;
      let released=false;
      return (present=true)=>{
        if(released||destroyed)return;released=true;depth--;
        // A failed seek must not reveal an incomplete native map. The next
        // successful seek releases the retained frame, or destroy removes it.
        if(!depth&&present)hide();
      };
    },
    destroy(){if(destroyed)return;destroyed=true;depth=0;delete host.dataset.sceneFrameHeld;cover.remove();}
  };
}

const sdkLoads = new Map();
const sdkUrls = {
  maplibre:['https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.js','https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css','maplibregl'],
  mapbox:['https://api.mapbox.com/mapbox-gl-js/v3.32.0/mapbox-gl.js','https://api.mapbox.com/mapbox-gl-js/v3.32.0/mapbox-gl.css','mapboxgl'],
  maptiler:['https://cdn.maptiler.com/maptiler-sdk-js/v4.2.0/maptiler-sdk.umd.min.js','https://cdn.maptiler.com/maptiler-sdk-js/v4.2.0/maptiler-sdk.css','maptilersdk'],
  cesium:['https://cesium.com/downloads/cesiumjs/releases/1.145/Build/Cesium/Cesium.js','https://cesium.com/downloads/cesiumjs/releases/1.145/Build/Cesium/Widgets/widgets.css','Cesium']
};
async function loadSdk(provider,libraries) {
  const [url,css,key] = sdkUrls[provider];
  if (!document.querySelector(`link[data-geo-sdk="${provider}"]`)) {const link=document.createElement('link');link.rel='stylesheet';link.href=css;link.dataset.geoSdk=provider;document.head.append(link);}
  if (libraries[key] ?? globalThis[key]) return libraries[key] ?? globalThis[key];
  if (!sdkLoads.has(provider)) sdkLoads.set(provider,new Promise((resolve,reject) => {
    const script = document.createElement('script');script.src=url;script.async=true;
    script.onload=()=>globalThis[key] ? resolve(globalThis[key]) : reject(new Error(`${provider} SDK did not initialize`));
    script.onerror=()=>reject(new Error(`${provider} SDK could not load`));document.head.append(script);
  }).catch(error => {sdkLoads.delete(provider);throw error;}));
  return sdkLoads.get(provider);
}

const svgNS = 'http://www.w3.org/2000/svg';
function createStaticTarget(container,config) {
  const imageUrl = sceneResourceUrl(config.imageUrl,'static.imageUrl'),bounds = config.geoBounds;
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3] || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90) throw new Error('Static map requires geoBounds [west,south,east,north] without antimeridian crossing');
  const projection=config.projection ?? 'mercator';
  if(!['mercator','equirectangular'].includes(projection))throw new Error('Static projection must be mercator or equirectangular');
  if(projection==='mercator' && (bounds[1]<-85.051129||bounds[3]>85.051129))throw new Error('Mercator image bounds must lie within ±85.051129 degrees');
  const root = document.createElement('div');root.style.cssText='position:absolute;inset:0;overflow:hidden;background:#091322';
  const stage=document.createElement('div');stage.style.cssText='position:absolute;inset:0;transform-origin:50% 50%';
  const image=document.createElement('img');image.alt='';image.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:fill';
  const ready = new Promise((resolve,reject) => {image.onload=resolve;image.onerror=()=>reject(new Error('Static map image failed to load'));});image.src=imageUrl;
  const svg=document.createElementNS(svgNS,'svg');svg.setAttribute('viewBox','0 0 1000 1000');svg.setAttribute('preserveAspectRatio','none');svg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible';
  stage.append(image,svg);root.append(stage);container.append(root);
  if (config.attribution) {const note=document.createElement('div');note.textContent=config.attribution;note.style.cssText='position:absolute;bottom:4px;right:6px;color:#fff;background:#142034bb;padding:3px 6px;font:10px sans-serif;z-index:2';root.append(note);}
  return {__geoSceneTarget:true,provider:'static',container,config:{...config,projection,geoBounds:[...bounds]},root,stage,svg,ready,destroy(){root.remove();}};
}

/** Create only the selected SDK. Credentials are separate from narrative data. */
export async function createSceneTarget(container,{provider='maplibre',config={},basemap,theme='dark',interactive,initialCamera,libraries={}} = {}) {
  if (!providers.has(provider)) throw new Error('Unknown scene provider');
  if(interactive!=null&&typeof interactive!=='boolean')throw new Error('interactive must be boolean');
  if(config.interactive!=null&&typeof config.interactive!=='boolean')throw new Error('config.interactive must be boolean');
  if(config.timeout!=null&&(!Number.isFinite(config.timeout)||config.timeout<1000||config.timeout>300000))throw new Error('config.timeout must be milliseconds between 1000 and 300000');
  if(initialCamera!=null&&!['maplibre','mapbox','maptiler'].includes(provider))throw new Error('initialCamera is only used by GL scene targets');
  const firstCamera=initialCamera==null?{center:[0,0],zoom:2}:camera(initialCamera,'initialCamera',provider);
  const element = typeof container === 'string' ? document.getElementById(container) : container;
  if (!element) throw new Error('Scene container was not found');
  if (provider === 'static') {const target=createStaticTarget(element,config);await target.ready;return target;}
  if (provider === 'mapbox' && !config.token) throw new Error('Mapbox requires an authorized token');
  if (provider === 'maptiler' && !config.apiKey) throw new Error('MapTiler requires an authorized apiKey');
  const sdk = await loadSdk(provider,libraries);
  if (provider === 'cesium') {
    if (config.ionToken) sdk.Ion.defaultAccessToken=config.ionToken;
    const viewer=new sdk.Viewer(element,{baseLayer:false,terrainProvider:new sdk.EllipsoidTerrainProvider(),animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,sceneModePicker:false,navigationHelpButton:false,fullscreenButton:false,infoBox:false,selectionIndicator:false,shouldAnimate:false,requestRenderMode:true});
    viewer.scene.screenSpaceCameraController.enableInputs=interactive ?? config.interactive ?? true;
    try {
      if (config.imagery) viewer.imageryLayers.addImageryProvider(new sdk.UrlTemplateImageryProvider({url:sceneResourceUrl(config.imagery.url,'imagery.url'),credit:config.imagery.attribution ?? ''}));
      if (config.terrain?.world) {if(!config.ionToken)throw new Error('Cesium world terrain requires an authorized ionToken');viewer.terrainProvider=await sdk.createWorldTerrainAsync();}
      else if (config.terrain?.url) viewer.terrainProvider=await sdk.CesiumTerrainProvider.fromUrl(sceneResourceUrl(config.terrain.url,'terrain.url'),{credit:config.terrain.attribution ?? ''});
      const tilesets=[];
      if (config.tiles3d?.url) {const tileset=await sdk.Cesium3DTileset.fromUrl(sceneResourceUrl(config.tiles3d.url,'tiles3d.url'));viewer.scene.primitives.add(tileset);tilesets.push(tileset);}
      viewer.scene.globe.enableLighting=false;viewer.clock.shouldAnimate=false;
      return {__geoSceneTarget:true,provider,viewer,sdk,tilesets,container:element,config,ready:Promise.resolve(),destroy(){if(!viewer.isDestroyed())viewer.destroy();}};
    } catch(error) {viewer.destroy();throw error;}
  }
  const defaultStyle = provider === 'maptiler' ? `https://api.maptiler.com/maps/${theme==='light'?'dataviz':'dataviz-dark'}/style.json?key=${encodeURIComponent(config.apiKey)}` : undefined;
  const basemapInput = {...(basemap ?? config.basemap ?? {}),...(config.style ? {styleUrl:config.style} : {} )};
  if (provider === 'maptiler' && !basemapInput.styleUrl) basemapInput.styleUrl=defaultStyle;
  const normalizedBasemap=normalizeBasemap(basemapInput,{provider,theme});
  if (provider === 'maptiler') sdk.config.apiKey=config.apiKey;
  const map=new sdk.Map({container:element,style:normalizedBasemap.styleUrl,...firstCamera,interactive:interactive ?? config.interactive ?? true,fadeDuration:0,
    attributionControl:{compact:true},...(provider==='mapbox'?{accessToken:config.token,preserveDrawingBuffer:true}:{canvasContextAttributes:{preserveDrawingBuffer:true}})});
  const controller=applyBasemap(map,basemapInput,{provider,theme,id:'geo-scene-basemap',timeoutMs:config.timeout ?? 30000});
  try {await controller.ready;await waitForSceneMapFrame(map,()=>{},config.timeout ?? 30000,{stage:'initial basemap'});}
  catch(error) {controller.destroy();map.remove();throw error;}
  const frameGuard=normalizedBasemap.terrain&&(interactive ?? config.interactive ?? true)?createSceneFrameGuard(map):null;
  return {__geoSceneTarget:true,provider,map,sdk,container:element,basemapController:controller,frameGuard,config,ready:Promise.resolve(),destroy(){frameGuard?.destroy();controller.destroy();map.remove();}};
}

export class SceneNarrativeViz {
  constructor(target,{data,provider=target.provider ?? 'maplibre',theme='dark',id='geo-scene',onChange=()=>{}} = {}) {
    if (!ids.test(id) || typeof onChange !== 'function') throw new Error('Scene requires a URL-safe id and onChange function');
    if (!['light','dark'].includes(theme)) throw new Error('Theme must be light or dark');
    this.target=target.__geoSceneTarget ? target : {provider,map:target};this.provider=provider;
    if (this.target.provider !== provider) throw new Error('Scene target provider must match selected provider');
    this.data=normalizeScene(data,{provider});this.id=id;this.theme=theme;this.onChange=onChange;this.time=0;this.playing=false;this.destroyed=false;this.frame=null;this.queue=Promise.resolve();
    this.sources=[`${id}-locations`,`${id}-routes`,`${id}-progress`,`${id}-head`];
    this.layers=[`${id}-route-muted`,`${id}-route-glow`,`${id}-route`,`${id}-location-halo`,`${id}-location`,`${id}-selected`,`${id}-labels`,`${id}-head`,`${id}-route-schematic`];
    this.entities=[];
    this.rendered={data:null,progressKey:null,headKey:null,selected:null,cameraKey:null};
    if (['maplibre','mapbox','maptiler'].includes(provider)) this.initializeMap();
    this.ready=this.seek(0);
  }
  initializeMap() {
    const map=this.target.map;
    if (!map?.isStyleLoaded()) throw new Error('Create SceneNarrativeViz after map style load');
    if (this.sources.some(id=>map.getSource(id)) || this.layers.some(id=>map.getLayer(id))) throw new Error('Scene id already exists');
    this.sources.forEach((id,index)=>map.addSource(id,{type:'geojson',data:index===0?fc(this.data.locations.map(pointFeature)):index===1?fc(this.data.routes.map(r=>routeFeature(r))):fc([])}));
    this.rendered.data=this.data;
    const accent=this.theme==='dark'?'#62d6fa':'#277acb';
    map.addLayer({id:this.layers[0],type:'line',source:this.sources[1],paint:{'line-color':accent,'line-opacity':.18,'line-width':2},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[1],type:'line',source:this.sources[2],paint:{'line-color':accent,'line-opacity':.2,'line-width':10,'line-blur':5},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[2],type:'line',source:this.sources[2],filter:['==',['get','kind'],'provided'],paint:{'line-color':accent,'line-width':3},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[8],type:'line',source:this.sources[2],filter:['==',['get','kind'],'schematic'],paint:{'line-color':accent,'line-width':3,'line-dasharray':[1.5,1.5]},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[3],type:'circle',source:this.sources[0],paint:{'circle-color':accent,'circle-radius':12,'circle-opacity':.15}});
    map.addLayer({id:this.layers[4],type:'circle',source:this.sources[0],paint:{'circle-color':accent,'circle-radius':4,'circle-stroke-color':this.theme==='dark'?'#122232':'#fff','circle-stroke-width':1.5}});
    map.addLayer({id:this.layers[5],type:'circle',source:this.sources[0],filter:['==',['get','id'],''],paint:{'circle-color':accent,'circle-radius':8,'circle-stroke-color':'#fff','circle-stroke-width':2}});
    map.addLayer({id:this.layers[6],type:'symbol',source:this.sources[0],layout:{'text-field':['get','name'],'text-font':this.provider==='mapbox'?['Open Sans Regular','Arial Unicode MS Regular']:['Noto Sans Regular'],'text-size':11,'text-offset':[0,1.4],'text-anchor':'top'},paint:{'text-color':this.theme==='dark'?'#f3f8ff':'#233f53','text-halo-color':this.theme==='dark'?'#122232':'#fff','text-halo-width':1.5}});
    map.addLayer({id:this.layers[7],type:'circle',source:this.sources[3],paint:{'circle-color':'#fff','circle-radius':4,'circle-stroke-color':accent,'circle-stroke-width':2}});
    this.removeHandler=()=>this.destroy();map.on('remove',this.removeHandler);
  }
  seek(timeSeconds) {
    const data=this.data,state=sampleScene(data,timeSeconds);
    this.queue=this.queue.catch(()=>{}).then(async()=>{
      if (this.destroyed) throw new Error('Scene was destroyed');
      this.time=state.time;
      if (['maplibre','mapbox','maptiler'].includes(this.provider)) {
        const map=this.target.map;
        const release=this.target.frameGuard?.hold();
        try {await waitForSceneMapFrame(map,()=>{
          const dataChanged=this.rendered.data!==data;
          if(dataChanged){
            map.getSource(this.sources[0]).setData(fc(data.locations.map(pointFeature)));
            map.getSource(this.sources[1]).setData(fc(data.routes.map(r=>routeFeature(r))));
            this.rendered.data=data;
          }
          const visible=state.routeStates.filter(s=>s.progress>0),progressKey=JSON.stringify(visible.map(s=>[s.route.id,s.progress]));
          if(dataChanged||this.rendered.progressKey!==progressKey){
            map.getSource(this.sources[2]).setData(fc(visible.map(s=>routeFeature(s.route,s.progress))));
            this.rendered.progressKey=progressKey;
          }
          const head=state.route ? partialRoute(state.route.coordinates,state.routeProgress).at(-1) : null;
          const headKey=JSON.stringify(head);
          if(dataChanged||this.rendered.headKey!==headKey){
            map.getSource(this.sources[3]).setData(fc(head?[pointFeature({id:'head',name:'',coordinates:head})]:[]));
            this.rendered.headKey=headKey;
          }
          const selected=state.location?.id ?? '';
          if(this.rendered.selected!==selected){map.setFilter(this.layers[5],['==',['get','id'],selected]);this.rendered.selected=selected;}
          const cameraKey=JSON.stringify(state.camera);
          let sameCamera=this.rendered.cameraKey===cameraKey;
          // Respect a user's manual pan: a cached desired camera is only equal
          // if the SDK's current view also matches it.
          if(sameCamera&&['getCenter','getZoom','getPitch','getBearing'].every(name=>typeof map[name]==='function')){
            const center=map.getCenter(),close=(a,b)=>Math.abs(a-b)<1e-9,angleClose=(a,b)=>Math.abs((((a-b)%360)+540)%360-180)<1e-9;
            sameCamera=angleClose(center.lng,state.camera.center[0])&&close(center.lat,state.camera.center[1])&&close(map.getZoom(),state.camera.zoom)&&close(map.getPitch(),state.camera.pitch)&&angleClose(map.getBearing(),state.camera.bearing);
          }
          if(!sameCamera){map.jumpTo(state.camera);this.rendered.cameraKey=cameraKey;}
        },this.target.config?.timeout ?? 30000,{stage:`scene time ${state.time}`,sources:this.sources});
        release?.(true);}catch(error){release?.(false);throw error;}
      } else if(this.provider==='static') this.renderStatic(state,data);
      else await this.renderCesium(state,data);
      this.onChange({...state,playing:this.playing});return state;
    });
    return this.queue;
  }
  renderStatic(state,data=this.data) {
    const {svg,stage,config}=this.target,[west,south,east,north]=config.geoBounds;
    const latitude=config.projection==='equirectangular'?n=>n:n=>Math.log(Math.tan(Math.PI/4+n*Math.PI/360));
    const project=p=>[(p[0]-west)/(east-west)*1000,(latitude(north)-latitude(p[1]))/(latitude(north)-latitude(south))*1000];
    const accent=this.theme==='dark'?'#62d6fa':'#277acb';svg.replaceChildren();
    const make=(tag,attrs)=>{const el=document.createElementNS(svgNS,tag);Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));svg.append(el);return el;};
    for(const entry of state.routeStates) {
      make('polyline',{points:entry.route.coordinates.map(p=>project(p).join(',')).join(' '),fill:'none',stroke:accent,'stroke-width':2,opacity:.2,'vector-effect':'non-scaling-stroke'});
      if(entry.progress>0)make('polyline',{points:partialRoute(entry.route.coordinates,entry.progress).map(p=>project(p).join(',')).join(' '),fill:'none',stroke:accent,'stroke-width':3,'stroke-dasharray':entry.route.kind==='schematic'?'5 5':'none','vector-effect':'non-scaling-stroke'});
    }
    for(const place of data.locations){const [x,y]=project(place.coordinates);make('circle',{cx:x,cy:y,r:place.id===state.location?.id?7:4,fill:accent,stroke:'#fff','stroke-width':1});const label=make('text',{x,y:y+18,fill:'#fff','font-size':12,'font-family':'sans-serif','text-anchor':'middle',stroke:'#132438','stroke-width':2,'paint-order':'stroke'});label.textContent=place.name;}
    if(state.route){const [x,y]=project(partialRoute(state.route.coordinates,state.routeProgress).at(-1));make('circle',{cx:x,cy:y,r:5,fill:'#fff',stroke:accent,'stroke-width':2});}
    const [x,y]=project(state.camera.center),scale=2**(state.camera.zoom-(config.baseZoom ?? data.chapters[0].camera.from.zoom));
    // Translation is a percentage of the original map frame, then scaled and rotated.
    stage.style.transform=`rotate(${-state.camera.bearing}deg) scale(${scale}) translate(${50-x/10}%,${50-y/10}%)`;
  }
  async renderCesium(state,data=this.data) {
    const {viewer,sdk:C}=this.target;
    this.entities.forEach(entity=>viewer.entities.remove(entity));this.entities=[];
    const color=C.Color.fromCssColorString(this.theme==='dark'?'#62d6fa':'#277acb');
    for(const {route,progress} of state.routeStates) {
      this.entities.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray(route.coordinates.flat()),width:2,material:color.withAlpha(.18),clampToGround:true}}));
      if(progress>0)this.entities.push(viewer.entities.add({polyline:{positions:C.Cartesian3.fromDegreesArray(partialRoute(route.coordinates,progress).flat()),width:3,material:route.kind==='schematic'?new C.PolylineDashMaterialProperty({color}):color,clampToGround:true}}));
    }
    for(const place of data.locations)this.entities.push(viewer.entities.add({position:C.Cartesian3.fromDegrees(...place.coordinates),point:{pixelSize:place.id===state.location?.id?10:6,color,outlineColor:C.Color.WHITE,outlineWidth:1,heightReference:C.HeightReference.CLAMP_TO_GROUND},label:{text:place.name,font:'12px sans-serif',fillColor:C.Color.WHITE,outlineColor:C.Color.BLACK,outlineWidth:2,style:C.LabelStyle.FILL_AND_OUTLINE,pixelOffset:new C.Cartesian2(0,18),heightReference:C.HeightReference.CLAMP_TO_GROUND}}));
    if(state.route)this.entities.push(viewer.entities.add({position:C.Cartesian3.fromDegrees(...partialRoute(state.route.coordinates,state.routeProgress).at(-1)),point:{pixelSize:7,color:C.Color.WHITE,outlineColor:color,outlineWidth:2,heightReference:C.HeightReference.CLAMP_TO_GROUND}}));
    viewer.camera.setView({destination:C.Cartesian3.fromDegrees(...state.camera.center,state.camera.height),orientation:{heading:C.Math.toRadians(state.camera.bearing),pitch:C.Math.toRadians(state.camera.pitch-90),roll:0}});
    await new Promise((resolve,reject)=>{
      const started=Date.now();let timer,remove;
      const check=()=>{
        if(this.destroyed){clearTimeout(timer);remove?.();reject(new Error('Scene was destroyed'));return;}
        if(viewer.scene.globe.tilesLoaded && this.target.tilesets.every(t=>t.tilesLoaded)){clearTimeout(timer);remove?.();resolve();return;}
        if(Date.now()-started>(this.target.config.timeout ?? 30000)){clearTimeout(timer);remove?.();reject(new Error('Cesium frame timed out while loading terrain or imagery'));return;}
        clearTimeout(timer);timer=setTimeout(()=>viewer.scene.requestRender(),25);
      };
      remove=viewer.scene.postRender.addEventListener(check);viewer.scene.requestRender();
    });
  }
  play() {
    if(this.destroyed)throw new Error('Scene was destroyed');if(this.playing)return;
    if(this.time>=this.data.duration)this.time=0;
    this.playing=true;let previous=null;
    const step=async timestamp=>{
      if(!this.playing||this.destroyed)return;
      const next=this.time+(previous==null?0:Math.min(.25,(timestamp-previous)/1000));previous=timestamp;
      try{await this.seek(next);}catch(error){this.pause();this.onChange({error});return;}
      if(!this.playing||this.destroyed)return;
      if(this.time>=this.data.duration){this.pause();this.onChange({...sampleScene(this.data,this.time),playing:false});return;}
      this.frame=requestAnimationFrame(step);
    };
    this.frame=requestAnimationFrame(step);
  }
  pause(){this.playing=false;if(this.frame!=null)cancelAnimationFrame(this.frame);this.frame=null;}
  setData(data){const next=normalizeScene(data,{provider:this.provider});this.pause();this.data=next;return this.seek(0);}
  setTheme(theme){if(!['dark','light'].includes(theme))throw new Error('Theme must be dark or light');this.theme=theme;if(['maplibre','mapbox','maptiler'].includes(this.provider)){const map=this.target.map,accent=theme==='dark'?'#62d6fa':'#277acb';for(const layer of [...this.layers.slice(0,3),this.layers[8]])map.setPaintProperty(layer,'line-color',accent);for(const layer of this.layers.slice(3,6))map.setPaintProperty(layer,'circle-color',accent);map.setPaintProperty(this.layers[6],'text-color',theme==='dark'?'#f3f8ff':'#233f53');map.setPaintProperty(this.layers[6],'text-halo-color',theme==='dark'?'#122232':'#fff');map.setPaintProperty(this.layers[7],'circle-stroke-color',accent);}return this.seek(this.time);}
  inspect(){return {provider:this.provider,rendererOwner:this.provider==='static'?'svg-over-uploaded-image':'provider-native',chapters:this.data.chapters.length,locations:this.data.locations.length,routes:this.data.routes.length,duration:this.data.duration,time:this.time,playing:this.playing,frameAddressable:true,basemap:this.target.basemapController?.inspect?.() ?? null};}
  destroy(){if(this.destroyed)return;this.pause();this.destroyed=true;if(['maplibre','mapbox','maptiler'].includes(this.provider)){const map=this.target.map;map.off('remove',this.removeHandler);for(const layer of [...this.layers].reverse())if(map.getLayer(layer))map.removeLayer(layer);for(const source of this.sources)if(map.getSource(source))map.removeSource(source);}else if(this.provider==='cesium')this.entities.forEach(e=>this.target.viewer.entities.remove(e));else this.target.svg.replaceChildren();this.entities=[];}
}
