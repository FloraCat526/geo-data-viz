// Composable Mapbox GL JS 3.x recipes. No SDK import or credentials.
export function prepareRecipe(data, spec, prefix = 'geo-viz') {
  const supported = {points:['Point'], bubble:['Point'], cluster:['Point'], heatmap:['Point'], line:['LineString','MultiLineString'], fill:['Polygon','MultiPolygon'], extrusion:['Polygon','MultiPolygon']};
  if (!supported[spec.effect]) throw Error('Unknown recipe effect');
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || !data.features.length) throw Error('No features to render');
  if (data.metadata?.dataCrs !== 'wgs84') throw Error('Recipe requires verified WGS84 data');
  const lookup = new Map();
  const features = data.features.map(f => {
    if (!supported[spec.effect].includes(f.geometry?.type)) throw Error('Geometry does not match recipe; explicitly transform or select a layer first');
    if (typeof f.id !== 'string' || lookup.has(f.id)) throw Error('Unique stable string IDs required');
    lookup.set(f.id, f);
    const v = f.properties?.__viz?.value;
    return {type:'Feature', id:f.id, geometry:structuredClone(f.geometry), properties:{viz_id:f.id, value:typeof v === 'number' && Number.isFinite(v) ? v : null}};
  });
  const values = features.map(f=>f.properties.value).filter(v=>v !== null);
  const metric = ['bubble','fill','extrusion'].includes(spec.effect) || (spec.effect === 'heatmap' && spec.weight === 'value');
  if (metric && !values.length) throw Error('No finite metric on rendered features');
  if (spec.effect === 'heatmap' && !['count','value'].includes(spec.weight)) throw Error('Heatmap requires explicit count or value weight');
  if (spec.effect === 'bubble' && values.some(v=>v<0) && spec.sizeMode !== 'absolute') throw Error('Signed bubbles require absolute size and sign color');
  if ((spec.effect === 'extrusion' || (spec.effect === 'heatmap' && spec.weight === 'value')) && values.some(v=>v<0)) throw Error('Negative height/heat contribution is not supported');
  if (spec.effect === 'extrusion' && (!(spec.heightScale > 0) || !Number.isFinite(spec.heightScale) || !spec.unit)) throw Error('Extrusion needs a positive heightScale (metres per metric unit) and unit');
  let lo = values.length ? values.reduce((a,b)=>Math.min(a,b)) : 0;
  let hi = values.length ? values.reduce((a,b)=>Math.max(a,b)) : 0;
  const maxAbs = Math.max(Math.abs(lo), Math.abs(hi));
  const color = v => v === null ? '#94a3b8' : lo < 0 ? (v < 0 ? '#f97386' : v > 0 ? '#22d3ee' : '#e2e8f0') : v <= (lo+hi)/2 ? '#22d3ee' : '#a78bfa';
  // Fixed full-data domain; filters and style changes do not renormalize it.
  for (const f of features) {
    const p=f.properties, v=p.value;
    p.color=color(v);
    p.radius=v === null || v === 0 ? 0 : 28*Math.sqrt(Math.abs(v)/maxAbs);
    p.height=v === null ? 0 : v*(spec.heightScale || 1);
    if (!Number.isFinite(p.height)) throw Error('Derived height must be finite');
  }
  const source={type:'geojson', data:{type:'FeatureCollection', features}, promoteId:'viz_id'};
  if (spec.effect === 'cluster') Object.assign(source,{cluster:true,clusterRadius:50,clusterMaxZoom:14});
  const layers=[];
  const layer=(suffix,type,paint,filter,layout)=>{const l={id:`${prefix}-${suffix}`,type,source:prefix,paint};if(filter)l.filter=filter;if(layout)l.layout=layout;layers.push(l);};
  const valid=['!=',['get','value'],null], absent=['==',['get','value'],null];
  const dot={'circle-radius':5,'circle-color':'#22d3ee','circle-stroke-width':1,'circle-stroke-color':'#e0f2fe'};
  if (spec.effect === 'points') layer('points','circle',dot);
  if (spec.effect === 'bubble') {
    const positive=['all',valid,['!=',['get','value'],0]];
    layer('glow','circle',{'circle-radius':['*',['get','radius'],1.35],'circle-color':['get','color'],'circle-opacity':0.18,'circle-blur':0.8},positive);
    layer('bubble','circle',{'circle-radius':['get','radius'],'circle-color':['get','color'],'circle-opacity':0.7,'circle-stroke-width':1,'circle-stroke-color':'#e0f2fe'},positive);
    layer('zero','circle',{'circle-radius':3,'circle-color':'#0b1220','circle-stroke-color':'#e2e8f0','circle-stroke-width':1},['==',['get','value'],0]);
    layer('missing','circle',{'circle-radius':4,'circle-color':'#94a3b8','circle-opacity':0.65},absent);
  }
  if (spec.effect === 'cluster') {
    layer('clusters','circle',{'circle-radius':20,'circle-color':'#818cf8','circle-stroke-color':'#c4b5fd','circle-stroke-width':2},['has','point_count']);
    layer('count','symbol',{'text-color':'#fff'},['has','point_count'],{'text-field':['get','point_count_abbreviated'],'text-size':12});
    layer('points','circle',dot,['!', ['has','point_count']]);
  }
  if (spec.effect === 'heatmap') {
    layer('heat','heatmap',{'heatmap-weight':spec.weight === 'count' ? 1 : ['get','value'],'heatmap-radius':26,'heatmap-intensity':1,'heatmap-opacity':0.8,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(15,23,42,0)',0.2,'#312e81',0.5,'#22d3ee',0.8,'#fbbf24',1,'#fb7185']},spec.weight === 'value' ? valid : undefined);
    // A subtle point layer enables exact-location picking; heat pixels are not measurements.
    layer('points','circle',{'circle-radius':3,'circle-color':'#e2e8f0','circle-opacity':0.35});
  }
  if (spec.effect === 'line') {
    layer('glow','line',{'line-width':10,'line-color':'#818cf8','line-opacity':0.22,'line-blur':4});
    layer('line','line',{'line-width':3,'line-color':'#67e8f9'},undefined,{'line-cap':'round','line-join':'round'});
  }
  if (spec.effect === 'fill' || spec.effect === 'extrusion') {
    if (spec.effect === 'fill') layer('fill','fill',{'fill-color':['get','color'],'fill-opacity':0.7});
    else {
      layer('extrusion','fill-extrusion',{'fill-extrusion-color':['get','color'],'fill-extrusion-height':['get','height'],'fill-extrusion-opacity':0.8},valid);
      layer('missing','fill',{'fill-color':'#94a3b8','fill-opacity':0.4},absent);
    }
    layer('outline','line',{'line-color':'#cbd5e1','line-width':0.7});
  }
  const legend={min:lo,max:hi,split:(lo+hi)/2,maxAbs,missing:features.length-values.length,zero:values.filter(v=>v===0).length,unit:spec.unit || '',sizeMode:spec.sizeMode || 'nonnegative',weight:spec.weight};
  return {source,layers,lookup,legend};
}

export function mountRecipe(map, data, spec, {prefix='geo-viz',onPick=()=>{},onError=()=>{}}={}) {
  const recipe=prepareRecipe(data,spec,prefix);
  let disposed=false, current=recipe.source.data, revision=0;
  const report=()=>onError(new Error('Map layer operation failed; check SDK compatibility and data.'));
  const install=()=>{
    if(disposed)return;
    try {
      if(!map.getSource(prefix))map.addSource(prefix,{...recipe.source,data:current});
      for(const l of recipe.layers)if(!map.getLayer(l.id))map.addLayer(l);
    }catch{report();}
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
        source.getClusterLeaves(id,limit,offset,(error,leaves)=>{
          if(!active())return resolve([]);
          if(error)return reject(Error('Cluster members unavailable'));
          resolve(leaves.map(f=>recipe.lookup.get(f.properties.viz_id)).filter(Boolean));
        });
      }), expand:()=>source.getClusterExpansionZoom(id,(error,zoom)=>{
        if(!active())return;
        if(error)return report();
        map.easeTo({center:cluster.geometry.coordinates,zoom});
      })});
    }else {
      const unique=[...new Set(hits.map(f=>f.properties?.viz_id))];
      const items=unique.map(id=>recipe.lookup.get(id)).filter(Boolean);
      if(items.length)onPick({items,count:items.length});
    }
  };
  map.on('style.load',install);map.on('click',click);
  if(map.isStyleLoaded())install();
  return {
    legend:recipe.legend,
    inspect(){
      const source=map.getSource(prefix);
      const layers=recipe.layers.map(l=>({id:l.id,expectedType:l.type,actualType:map.getLayer(l.id)?.type ?? null}));
      return {provider:'mapbox',rendererOwner:'provider-native',sourceId:prefix,sourceType:source?.type ?? null,layers,
        registered:!disposed && source?.type==='geojson' && layers.every(l=>l.actualType===l.expectedType && l.actualType!=='custom')};
    },
    setFilter(predicate){
      if(disposed)return;
      const next=recipe.source.data.features.filter(f=>predicate(recipe.lookup.get(f.properties.viz_id)));
      current={type:'FeatureCollection',features:next};revision++;
      map.getSource(prefix)?.setData(current);
      return next.length;
    },
    destroy(){
      if(disposed)return;disposed=true;revision++;
      map.off('style.load',install);map.off('click',click);
      for(const l of [...recipe.layers].reverse())if(map.getLayer(l.id))map.removeLayer(l.id);
      if(map.getSource(prefix))map.removeSource(prefix);
    }
  };
}
