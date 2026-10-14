// Gallery-only control: switch native raster imagery without replacing the map
// style, data layers, camera, or visualization component instances.
const SOURCE_ID='quake-satellite-source',LAYER_ID='quake-satellite-layer';
const imageryLabelPaint={'text-color':'#eef5fc','text-halo-color':'#172638','text-halo-width':1.2};

export function createBasemapController(map,imagery){
 const baseline=(map.getStyle().layers??[]).map(layer=>({
  id:layer.id,type:layer.type,visibility:map.getLayoutProperty(layer.id,'visibility')??'visible',
  labelPaint:layer.type==='symbol'?Object.fromEntries(Object.keys(imageryLabelPaint).map(key=>[key,map.getPaintProperty(layer.id,key)])):null
 }));
 let mode='dark',pending=null,destroyed=false;
 const restore=()=>{
  for(const layer of baseline)if(map.getLayer(layer.id)&&!['symbol','background'].includes(layer.type))
   map.setLayoutProperty(layer.id,'visibility',layer.visibility);
  for(const layer of baseline)if(layer.labelPaint&&map.getLayer(layer.id))
   for(const [key,value] of Object.entries(layer.labelPaint))map.setPaintProperty(layer.id,key,value??null);
 };
 const hideImagery=()=>{
  if(map.getLayer(LAYER_ID)){map.setPaintProperty(LAYER_ID,'raster-opacity',0);map.setLayoutProperty(LAYER_ID,'visibility','none');}
 };
 function cancel(){if(!pending)return;const request=pending;pending=null;request.cleanup();request.resolve(mode);}
 function setBasemap(next){
  if(destroyed)return Promise.reject(new Error('Map layer control was removed'));
  if(!['dark','imagery'].includes(next))return Promise.reject(new Error('Unknown map layer'));
  if(next==='imagery'&&pending)return pending.promise;
  if(next===mode&&!pending)return Promise.resolve(mode);
  cancel();
  if(next==='dark'){hideImagery();restore();mode='dark';return Promise.resolve(mode);}
  try{
   if(!map.getSource(SOURCE_ID))map.addSource(SOURCE_ID,{type:'raster',...imagery});
   if(!map.getLayer(LAYER_ID))map.addLayer({id:LAYER_ID,type:'raster',source:SOURCE_ID,
    paint:{'raster-opacity':0,'raster-fade-duration':0}},baseline.find(layer=>layer.type==='symbol')?.id);
   else{map.setLayoutProperty(LAYER_ID,'visibility','visible');map.setPaintProperty(LAYER_ID,'raster-opacity',0);}
  }catch(error){hideImagery();restore();return Promise.reject(error);}
  let resolve,reject;
  const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const finish=()=>{
   if(!pending||pending.promise!==promise||!map.isSourceLoaded(SOURCE_ID))return;
   const request=pending;pending=null;request.cleanup();
   for(const layer of baseline)if(map.getLayer(layer.id)&&!['symbol','background'].includes(layer.type))
    map.setLayoutProperty(layer.id,'visibility','none');
   for(const layer of baseline)if(layer.labelPaint&&map.getLayer(layer.id))
    for(const [key,value] of Object.entries(imageryLabelPaint))map.setPaintProperty(layer.id,key,value);
   map.setPaintProperty(LAYER_ID,'raster-opacity',1);mode='imagery';map.triggerRepaint();resolve(mode);
  };
  const fail=event=>{
   if(event?.sourceId&&event.sourceId!==SOURCE_ID)return;
   if(!pending||pending.promise!==promise)return;
   const request=pending;pending=null;request.cleanup();hideImagery();restore();
   reject(new Error('卫星图加载失败，已保留深色地图。'));
  };
  const removed=()=>fail();
  const timer=setTimeout(fail,20000);
  const cleanup=()=>{clearTimeout(timer);map.off('render',finish);map.off('error',fail);map.off('remove',removed);};
  pending={promise,resolve,cleanup};map.on('render',finish);map.on('error',fail);map.on('remove',removed);map.triggerRepaint();
  return promise;
 }
 return {setBasemap,get mode(){return mode;},destroy(){if(destroyed)return;destroyed=true;cancel();hideImagery();restore();}};
}

export function createBasemapPicker({imagery,onError=()=>{},onChange=()=>{}}){
 let controller,element;
 return {
  onAdd(map){
   controller=createBasemapController(map,imagery);
   element=document.createElement('div');element.className='maplibregl-ctrl basemap-picker';
   element.setAttribute('role','group');element.setAttribute('aria-label','地图图层');
   for(const [key,name,label,thumbnail] of [
    ['dark','地图','深色地图','quakes'],['imagery','卫星','卫星图','imagery']
   ]){
    const button=document.createElement('button');button.type='button';button.dataset.basemap=key;
    button.setAttribute('aria-label',label);button.setAttribute('aria-pressed',String(key==='dark'));
    const image=document.createElement('img');image.src=`../assets/thumbnails/${thumbnail}.jpg`;image.alt='';image.width=22;image.height=22;
    button.append(image,document.createTextNode(name));
    button.onclick=async()=>{
     button.disabled=true;button.setAttribute('aria-busy','true');
     try{await controller.setBasemap(key);for(const item of element.querySelectorAll('button'))item.setAttribute('aria-pressed',String(item.dataset.basemap===controller.mode));onChange(controller.mode);}
     catch(error){onError(error);}
     finally{button.disabled=false;button.removeAttribute('aria-busy');}
    };
    element.append(button);
   }
   return element;
  },
  onRemove(){controller?.destroy();element?.remove();}
 };
}
