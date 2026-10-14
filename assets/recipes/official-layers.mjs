import {colorMapping} from '../shared/color-scale.mjs';

// The caller supplies a loaded SDK/map and a verified coordinate contract.
// Only documented constant style properties are used; color groups share a layer.
export function mountOfficialRecipe({provider,map,SDK,data,spec,targetCrs,coordinateEvidence,transformPosition,onPick=()=>{}}) {
  const classes={amap:{points:'PointLayer','point-color':'PointLayer',line:'LineLayer',fill:'PolygonLayer',heatmap:'HeatMapLayer'},baidu:{points:'PointLayer','point-color':'PointLayer',line:'SimpleLineLayer',fill:'PolygonLayer',heatmap:'HeatmapLayer'}};
  const className=classes[provider]?.[spec.effect];
  if(!className)throw Error('This official-extension recipe supports points, point-color, line, fill and count heatmap only.');
  if(!SDK?.[className])throw Error('Required official extension class is unavailable; verify the loaded SDK version.');
  if(!['wgs84','gcj02','bd09'].includes(data.metadata?.dataCrs) || !['wgs84',provider==='amap'?'gcj02':'bd09'].includes(targetCrs) || !coordinateEvidence?.trim() || data.metadata?.status==='needs_crs')throw Error('Provide verified source/target CRS and coordinate evidence.');
  if(data.metadata.dataCrs!==targetCrs && typeof transformPosition!=='function')throw Error('A source-to-target coordinate conversion is required.');
  if(spec.effect==='heatmap' && spec.weight!=='count')throw Error('This baseline heatmap supports count only; bind weighted data using the selected SDK contract.');
  const expected=spec.effect==='line'?'LineString':spec.effect==='fill'?'Polygon':'Point';
  const lookup=new Map();
  const position=p=>{
    if(!Array.isArray(p) || p.length<2 || !p.every(v=>typeof v==='number' && Number.isFinite(v)))throw Error('Invalid coordinates');
    const converted=transformPosition?transformPosition([...p],data.metadata.dataCrs,targetCrs):[...p];
    if(!Array.isArray(converted) || converted.length<2 || !converted.every(v=>typeof v==='number' && Number.isFinite(v)) || Math.abs(converted[0])>180 || Math.abs(converted[1])>90)throw Error('Invalid converted coordinates');
    return converted;
  };
  const coordinates=(coords,depth)=>depth?coords.map(c=>coordinates(c,depth-1)):position(coords);
  const items=[];
  for(const f of data.features || []){
    if(typeof f.id!=='string' || lookup.has(f.id))throw Error('Unique stable IDs required');lookup.set(f.id,f);
    const type=f.geometry?.type;
    if(type!==expected && type!==`Multi${expected}`)throw Error('Geometry does not match the selected official layer');
    const parts=type===expected?[f.geometry.coordinates]:f.geometry.coordinates;
    for(const part of parts)items.push({geometry:{type:expected,coordinates:coordinates(part,expected==='Point'?0:expected==='LineString'?1:2)},properties:{viz_id:f.id,category:f.properties?.__viz?.category ?? null,value:f.properties?.__viz?.value ?? null,height:0}});
  }
  if(!items.length)throw Error('No features to render');
  const mapping=colorMapping(items,spec);
  if(mapping.legend.by==='value' && !spec.unit)throw Error('Numeric colors require a unit');
  const groups=new Map();
  for(const item of items){const color=spec.effect==='heatmap'?'density':mapping.get(item.properties);if(!groups.has(color))groups.set(color,[]);groups.get(color).push(item);}
  if(groups.size>64)throw Error('More than 64 color groups; use a threshold scale or implement documented per-feature styles.');
  let container,disposed=false;const mounted=[];
  const clean=()=>{container?.destroy();for(const item of mounted)item.source?.destroy();};
  const picked=feature=>{
    if(disposed)return;
    const id=feature?.properties?.viz_id;
    if(lookup.has(id))onPick({items:[lookup.get(id)],count:1});
  };
  const setData=(item,values)=>{
    if(provider==='baidu'){item.layer.setData(values);return;}
    const next=new SDK.GeoJSONSource({data:{type:'FeatureCollection',features:values.map(v=>({type:'Feature',...v}))}});
    try{item.layer.setSource(next);}catch{next.destroy();throw Error('Official layer source update failed');}
    const old=item.source;item.source=next;old?.destroy();
  };
  try{
    container=provider==='amap'?new SDK.Container({map}):new SDK.View({map});
    for(const [color,values] of groups){
      const options=provider==='amap'?{loca:container,opacity:0.85,acceptLight:false}:{enablePicked:['points','point-color','fill'].includes(spec.effect),onClick:e=>picked(e.dataItem)};
      const layer=new SDK[className](options),item={layer,values,source:null};mounted.push(item);
      if(provider==='baidu')container.addLayer(layer);
      setData(item,values);
      const style=provider==='amap'?(expected==='Point'?{radius:6,unit:'px',color,borderWidth:1,borderColor:'#e2e8f0'}:expected==='LineString'?{color,lineWidth:3,borderWidth:0}:{topColor:color,height:0}):(expected==='Point'?{color,size:6,unit:'px'}:expected==='LineString'?{color}:{fillColor:color,fillOpacity:0.7,lineColor:'#cbd5e1',lineWidth:1});
      if(spec.effect==='heatmap'){for(const key of Object.keys(style))delete style[key];Object.assign(style,provider==='amap'?{radius:26,value:1,unit:'px',height:0,min:0,max:items.length,gradient:{0:'#312e81',0.5:'#22d3ee',1:'#fb7185'}}:{size:26,unit:'px',height:0,min:0,max:items.length,gradient:{0:'#312e81',0.5:'#22d3ee',1:'#fb7185'}});}
      if(spec.effect==='heatmap')delete style.color;
      if(provider==='amap')layer.setStyle(style);else layer.setOptions(style);
    }
  }catch{disposed=true;clean();throw Error('Official layer creation failed; check SDK compatibility and coordinate contract.');}
  return {
    legend:mapping.legend,
    inspect:()=>({provider,rendererOwner:'provider-official-extension',className,layerCount:disposed?0:mounted.length,targetCrs,verification:'pending-browser'}),
    setFilter(predicate){if(disposed)return 0;const ids=new Set();for(const item of mounted){const values=item.values.filter(v=>predicate(lookup.get(v.properties.viz_id)));values.forEach(v=>ids.add(v.properties.viz_id));setData(item,values);}return ids.size;},
    // Bind to the map's container-relative pixel event; density pixels are not records.
    pick(pixel){if(disposed || spec.effect==='heatmap')return;for(const item of mounted){if(provider==='amap')picked(item.layer.queryFeature(pixel));else if(['points','point-color','fill'].includes(spec.effect))picked(item.layer.pick(...pixel)?.dataItem);}},
    destroy(){if(disposed)return;disposed=true;clean();}
  };
}
