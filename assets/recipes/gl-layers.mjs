import {colorMapping} from '../shared/color-scale.mjs';
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
