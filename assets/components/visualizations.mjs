// Public flat-map visualization API. Class names describe data semantics, not
// Mapbox/MapLibre style-layer types or namespaced classes from other vendors.
// The renderer behind a component is an implementation detail; callers select
// by the question and verified fields.
import {mountRecipe} from '../recipes/gl-layers.mjs';
import {mountAdditivePoints} from './point-glow.mjs';
import {FlightLayer,PulsePointLayer,RadarScanLayer,HexagonLayer} from './maplibre-effects.mjs';

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
