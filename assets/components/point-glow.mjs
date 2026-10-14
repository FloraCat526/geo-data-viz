// Optional additive supplement for the existing scatter-point components.
// Normal mode and its soft halo stay entirely in the selected map SDK.
import {mountRecipe,pointStyle} from '../recipes/gl-layers.mjs';

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
