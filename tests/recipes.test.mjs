import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecipe,mountRecipe} from '../assets/recipes/mapbox-layers.mjs';
const fc=(values,geometry={type:'Point',coordinates:[103.8,1.3]})=>({type:'FeatureCollection',metadata:{dataCrs:'wgs84'},features:values.map((value,i)=>({type:'Feature',id:`entity-${i}`,geometry:structuredClone(geometry),properties:{__viz:{value,label:`Store ${i}`}}}))});
class MapStub {
 constructor(){this.sources=new Map();this.layers=new Map();this.events=new Map();this.hits=[];}
 on(name,cb){const callbacks=this.events.get(name)||new Set();callbacks.add(cb);this.events.set(name,callbacks);}
 off(name,cb){this.events.get(name)?.delete(cb);}
 emit(name,e){for(const cb of this.events.get(name)||[])cb(e);}
 isStyleLoaded(){return true;}
 getSource(id){return this.sources.get(id);}
 addSource(id,s){this.sources.set(id,{...s,setData(data){this.data=data;}});}
 getLayer(id){return this.layers.get(id);}
 addLayer(l){assert.ok(this.getSource(l.source));this.layers.set(l.id,l);}
 removeLayer(id){this.layers.delete(id);}
 removeSource(id){assert.ok(![...this.layers.values()].some(l=>l.source===id));this.sources.delete(id);}
 queryRenderedFeatures(){return this.hits;}
 easeTo(view){this.view=view;}
}
test('bubble area is proportional while null and zero retain separate encodings',()=>{
 const input=fc([0,25,100,null]),copy=structuredClone(input),r=prepareRecipe(input,{effect:'bubble'});
 const p=r.source.data.features.map(f=>f.properties);
 assert.equal(p[2].radius**2/p[1].radius**2,4);assert.equal(p[0].radius,0);assert.equal(p[3].value,null);
 assert.ok(r.layers.some(l=>l.id.endsWith('-zero')));assert.ok(r.layers.some(l=>l.id.endsWith('-missing')));
 assert.deepEqual(input,copy);assert.equal(r.source.promoteId,'viz_id');
});
test('rejects bad metrics, negative weights and unverified or mismatched geometry',()=>{
 assert.throws(()=>prepareRecipe(fc(['bad',null]),{effect:'bubble'}),/finite metric/);
 assert.throws(()=>prepareRecipe(fc([-10,20]),{effect:'bubble'}),/Signed/);
 assert.throws(()=>prepareRecipe(fc([-10,20]),{effect:'heatmap',weight:'value'}),/Negative/);
 assert.throws(()=>prepareRecipe(fc([1]),{effect:'heatmap'}),/explicit/);
 assert.throws(()=>prepareRecipe({...fc([1]),metadata:{dataCrs:'unknown'}},{effect:'points'}),/WGS84/);
 assert.throws(()=>prepareRecipe(fc([1],{type:'MultiPoint',coordinates:[[1,2],[2,3]]}),{effect:'points'}),/Geometry/);
 const signed=prepareRecipe(fc([-10,20]),{effect:'bubble',sizeMode:'absolute'}).source.data.features;
 assert.notEqual(signed[0].properties.color,signed[1].properties.color);
});
test('count heatmap ignores a signed business metric and explicit weights retain zero/null',()=>{
 const count=prepareRecipe(fc([-2,0,null]),{effect:'heatmap',weight:'count'});
 assert.equal(count.layers[0].paint['heatmap-weight'],1);
 const value=prepareRecipe(fc([2,0,null]),{effect:'heatmap',weight:'value'});
 assert.deepEqual(value.source.data.features.map(f=>f.properties.value),[2,0,null]);
 assert.ok(value.layers[0].filter);
});
test('polygon holes remain intact and extrusion has an explicit metric-to-metre scale',()=>{
 const g={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,2],[2,2],[2,1],[1,1]]]};
 const data=fc([10,null],g);
 const r=prepareRecipe(data,{effect:'extrusion',unit:'件',heightScale:3});
 assert.deepEqual(r.source.data.features[0].geometry,g);assert.equal(r.source.data.features[0].properties.height,30);
 assert.ok(r.layers.some(l=>l.type==='fill'));
 assert.throws(()=>prepareRecipe(data,{effect:'extrusion'}),/heightScale/);
});
test('filters and style reload preserve domains; picking deduplicates IDs; cleanup is complete',()=>{
 const map=new MapStub(),data=fc([10,100]),picked=[];
 const r=mountRecipe(map,data,{effect:'bubble'},{onPick:x=>picked.push(x)});
 assert.equal(r.setFilter(f=>f.id==='entity-0'),1);assert.equal(r.legend.max,100);
 const radius=map.getSource('geo-viz').data.features[0].properties.radius;
 map.sources.clear();map.layers.clear();map.emit('style.load');
 assert.equal(map.getSource('geo-viz').data.features.length,1);
 assert.equal(map.getSource('geo-viz').data.features[0].properties.radius,radius);
 map.hits=[{properties:{viz_id:'entity-0'}},{properties:{viz_id:'entity-0'}}];map.emit('click',{point:{x:1,y:1}});
 assert.equal(picked[0].items.length,1);assert.equal(picked[0].items[0],data.features[0]);
 r.destroy();r.destroy();assert.equal(map.layers.size,0);assert.equal(map.sources.size,0);
 assert.ok([...map.events.values()].every(s=>!s.size));
});
test('cluster leaves are accessible at identical locations and stale callbacks cannot move the map',async()=>{
 const map=new MapStub();let picked,resolveLeaves,resolveZoom;
 const r=mountRecipe(map,fc([1,2]),{effect:'cluster'},{onPick:x=>picked=x});
 const source=map.getSource('geo-viz');source.getClusterLeaves=(id,limit,offset,cb)=>{assert.equal(offset,0);resolveLeaves=cb;};source.getClusterExpansionZoom=(id,cb)=>{resolveZoom=cb;};
 map.hits=[{properties:{cluster_id:7,point_count:2},geometry:{coordinates:[103.8,1.3]}}];map.emit('click',{point:{}});
 const first=picked.loadLeaves();resolveLeaves(null,[{properties:{viz_id:'entity-1'}}]);assert.equal((await first)[0].id,'entity-1');
 const pending=picked.loadLeaves();picked.expand();r.destroy();resolveLeaves(null,[{properties:{viz_id:'entity-0'}}]);resolveZoom(null,20);
 assert.deepEqual(await pending,[]);assert.equal(map.view,undefined);
});

test('every recipe registers GeoJSON and the intended provider-native layers; missing/custom layers fail inspection',()=>{
 const expected={points:['circle'],bubble:['circle'],cluster:['circle','symbol'],heatmap:['heatmap','circle'],line:['line'],fill:['fill','line'],extrusion:['fill-extrusion','fill','line']};
 for(const [effect,types] of Object.entries(expected)){
  const geometry=['fill','extrusion'].includes(effect)?{type:'Polygon',coordinates:[[[1,2],[2,2],[2,3],[1,2]]]}:effect==='line'?{type:'LineString',coordinates:[[1,2],[2,3]]}:{type:'Point',coordinates:[1,2]};
  const map=new MapStub(),r=mountRecipe(map,fc([1,null],geometry),{effect,weight:'count',unit:'件',heightScale:2});
  const proof=r.inspect();assert.equal(proof.registered,true,effect);
  assert.deepEqual(new Set(proof.layers.map(l=>l.actualType)),new Set(types));
  const id=proof.layers[0].id;map.layers.get(id).type='custom';assert.equal(r.inspect().registered,false);
  map.layers.delete(id);assert.equal(r.inspect().registered,false);
  r.destroy();assert.equal(r.inspect().registered,false);
 }
});
