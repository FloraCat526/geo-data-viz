import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecipe, mountRecipe} from '../assets/recipes/mapbox-layers.mjs';
const data=()=>({type:'FeatureCollection',metadata:{dataCrs:'wgs84'},features:[0,25,100,null].map((value,i)=>({type:'Feature',id:`p${i}`,geometry:{type:'Point',coordinates:[12+i,42]},properties:{__viz:{value}}}))});
function mockMap(){
 const sources=new Map(),layers=new Map(),events=new Map();
 return {sources,layers,events,on(e,fn){events.set(e,fn);},off(e){events.delete(e);},isStyleLoaded(){return true;},
 getSource(id){return sources.get(id);},addSource(id,s){sources.set(id,{...s,setData(d){this.data=d;}});},removeSource(id){sources.delete(id);},
 getLayer(id){return layers.get(id);},addLayer(l){layers.set(l.id,l);},removeLayer(id){layers.delete(id);},
 queryRenderedFeatures(){return [];}};
}
test('bubble areas preserve ratios and separate zero and missing values',()=>{
 const input=data(), original=structuredClone(input), r=prepareRecipe(input,{effect:'bubble',unit:'people'});
 const f=r.source.data.features;
 assert.equal(f[1].properties.radius**2/f[2].properties.radius**2,0.25);
 assert.equal(f[0].properties.value,0);assert.equal(f[3].properties.value,null);
 assert.equal(r.legend.zero,1);assert.equal(r.legend.missing,1);
 assert.deepEqual(input,original);
});
test('filters keep the full domain and survive style reload; destroy removes registrations',()=>{
 const map=mockMap(),r=mountRecipe(map,data(),{effect:'bubble',unit:'people'});
 assert.equal(r.inspect().registered,true);
 assert.equal(r.setFilter(f=>f.id==='p1'),1);
 assert.equal(r.legend.max,100);
 assert.equal(map.getSource('geo-viz').data.features[0].properties.radius,14);
 map.sources.clear();map.layers.clear();map.events.get('style.load')();
 assert.equal(map.getSource('geo-viz').data.features.length,1);
 r.destroy();assert.equal(map.sources.size,0);assert.equal(map.layers.size,0);assert.equal(map.events.size,0);
});
test('all seven effects register native layer types',()=>{
 for(const effect of ['points','bubble','cluster','heatmap','line','fill','extrusion']){
  const input=data();
  if(effect==='line')input.features.forEach(f=>f.geometry={type:'LineString',coordinates:[[12,42],[13,43]]});
  if(['fill','extrusion'].includes(effect))input.features.forEach(f=>f.geometry={type:'Polygon',coordinates:[[[12,42],[13,42],[13,43],[12,42]]]});
  const map=mockMap(),r=mountRecipe(map,input,{effect,unit:'people',heightScale:2,weight:'count'});
  assert.equal(r.inspect().registered,true,effect);r.destroy();
 }
});
test('pending cluster callbacks cannot select members after filtering',async()=>{
 const map=mockMap();let picked,callback;
 map.queryRenderedFeatures=()=>[{properties:{cluster_id:7,point_count:2},geometry:{coordinates:[12,42]}}];
 const r=mountRecipe(map,data(),{effect:'cluster'},{onPick:result=>picked=result});
 map.getSource('geo-viz').getClusterLeaves=(id,limit,offset,cb)=>callback=cb;
 map.events.get('click')({point:{x:1,y:1}});
 const pending=picked.loadLeaves();r.setFilter(()=>false);
 callback(null,[{properties:{viz_id:'p1'}}]);assert.deepEqual(await pending,[]);r.destroy();
});
