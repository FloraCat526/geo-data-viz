// Globe-specific, keyless visualization components. Globe.GL owns the renderer;
// these are not MapLibre or provider-native layers.
export const GLOBE_VERSION = '2.46.2';
export const GLOBE_TEXTURE = 'https://cdn.jsdelivr.net/npm/three-globe@2.45.2/example/img/earth-night.jpg';
export const GLOBE_POPULATION_COLORS = Object.freeze(['#345d79','#f1c871','#ee7255']);
export const GLOBE_SPIKE_COLORS = Object.freeze(['#90ddf5','#ffad7b','#ff5d67']);

const finite = value => typeof value === 'number' && Number.isFinite(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const hexToRgb = hex => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
const alpha = (hex,value) => `rgba(${hexToRgb(hex).join(',')},${value})`;
const mix = (from,to,t) => {
  const a=hexToRgb(from), b=hexToRgb(to), x=Math.max(0,Math.min(1,t));
  return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*x)).join(',')})`;
};
const coordinate = pair => Array.isArray(pair) && pair.length>=2 && finite(pair[0]) && finite(pair[1]) && Math.abs(pair[0])<=180 && Math.abs(pair[1])<=90;
const features = input => input?.type==='FeatureCollection' && Array.isArray(input.features) ? input.features : Array.isArray(input) ? input : [];
// An explicitly bound missing metric must not fall back to a different raw field.
function globeMetric(properties,fallback){
  if(properties?.__viz && Object.hasOwn(properties.__viz,'value'))return properties.__viz.value;
  if(properties && Object.hasOwn(properties,'value'))return properties.value;
  return properties?.[fallback];
}

export function normalizeGlobeFlights(input) {
  const rows=Array.isArray(input) ? input : input?.routes;
  if(!Array.isArray(rows)) throw Error('Flight globe requires an OD array');
  const ids=new Set();
  return rows.map((row,index)=>{
    const source=row.source ?? input?.origin?.position;
    const target=row.target ?? row.airport?.position;
    const id=String(row.id ?? index);
    if(!coordinate(source)||!coordinate(target)||ids.has(id)) throw Error(`Invalid or duplicate flight at row ${index+1}`);
    ids.add(id);
    return {id,source:[...source.slice(0,2)],target:[...target.slice(0,2)],label:String(row.label ?? row.name ?? row.airport?.name ?? id),category:String(row.category ?? row.region ?? 'Other')};
  });
}

export function normalizeGlobeCountries(input) {
  const rows=features(input);
  if(!rows.length) throw Error('Country globe requires polygon features');
  return rows.map((feature,index)=>{
    const geometry=feature.geometry, value=globeMetric(feature.properties,'population');
    if(!['Polygon','MultiPolygon'].includes(geometry?.type)||!Array.isArray(geometry.coordinates)||!geometry.coordinates.length) throw Error(`Invalid country polygon at row ${index+1}`);
    if(value!==null && value!==undefined && (!finite(value)||value<0)) throw Error(`Invalid country value at row ${index+1}`);
    return {id:String(feature.id ?? feature.properties?.iso3 ?? index),label:String(feature.properties?.__viz?.label ?? feature.properties?.name ?? feature.properties?.ADMIN ?? 'Region'),value:value ?? null,geometry};
  });
}

export function normalizeGlobeSpikes(input) {
  const rows=features(input);
  if(!rows.length) throw Error('Spike globe requires point features');
  return rows.map((feature,index)=>{
    const coordinates=feature.geometry?.coordinates, value=globeMetric(feature.properties,'mag');
    if(feature.geometry?.type!=='Point'||!coordinate(coordinates)||!finite(value)) throw Error(`Invalid spike at row ${index+1}`);
    return {id:String(feature.id ?? index),lng:coordinates[0],lat:coordinates[1],value,label:String(feature.properties?.__viz?.label ?? feature.properties?.place ?? feature.properties?.name ?? `Event ${index+1}`)};
  });
}

export function createGlobe(host,{GlobeCtor=globalThis.Globe,texture=GLOBE_TEXTURE,center={lat:16,lng:12,altitude:2.1},motion=true}={}) {
  if(!host || typeof GlobeCtor!=='function') throw Error('Globe.GL is unavailable');
  const globe=new GlobeCtor(host,{animateIn:motion,waitForGlobeReady:true,rendererConfig:{alpha:true,antialias:true}});
  globe.backgroundColor('rgba(0,0,0,0)').globeImageUrl(texture).showAtmosphere(true).atmosphereColor('#599dc5').atmosphereAltitude(.105);
  // A restrained specular edge preserves the night texture and the data colors.
  const material=globe.globeMaterial();
  material.shininess=6;material.specular?.set('#17374c');
  for(const light of globe.lights()){
    if(light.isAmbientLight)light.intensity*=1.1;
    else if(light.isDirectionalLight)light.intensity*=.9;
  }
  // Bound the drawing buffer on high-density screens without reducing data.
  globe.renderer().setPixelRatio(Math.min(globalThis.devicePixelRatio||1,1.75));
  globe.pointOfView(center,0);
  globe.controls().autoRotate=motion;
  globe.controls().autoRotateSpeed=.16;
  globe.controls().enableDamping=true;
  globe.controls().dampingFactor=.08;
  return globe;
}

class GlobeLayer {
  constructor(globe,{onPick=()=>{},motion=true}={}) {
    if(!globe) throw Error('A Globe.GL instance is required');
    this.globe=globe;this.onPick=onPick;this.motion=motion;this.paused=!motion;this.count=0;
  }
  pause(){this.paused=true;this.globe.controls().autoRotate=false;this.updateMotion?.();}
  play(){if(!this.motion)return;this.paused=false;this.globe.controls().autoRotate=true;this.updateMotion?.();}
  inspect(){return {rendererOwner:'third-party',provider:'globe.gl',version:GLOBE_VERSION,type:this.constructor.name,count:this.count,paused:this.paused};}
  destroy(){this.pause();this.globe.arcsData([]).pointsData([]).polygonsData([]);}
}

const ROUTE_COLORS={Asia:'#f8c96b',Europe:'#a898ff',Africa:'#62d9c1',Oceania:'#58c9f5',Americas:'#fa8caa',Other:'#b6c7d8'};
const EXTRA_ROUTE_COLORS=['#6ee7b7','#fda4af','#93c5fd','#fcd34d','#c4b5fd','#67e8f9','#fdba74','#a3e635','#f9a8d4','#86efac','#a5b4fc','#fbbf24'];
export class GlobeFlightLayer extends GlobeLayer {
  setData(input){
    const rows=normalizeGlobeFlights(input);this.rows=rows;this.count=rows.length;
    const categories=[...new Set(rows.map(row=>row.category))].sort((a,b)=>a.localeCompare(b));
    this.categoryColors=new Map(categories.map((category,index)=>[category,ROUTE_COLORS[category]??EXTRA_ROUTE_COLORS[index%EXTRA_ROUTE_COLORS.length]]));
    const origin=rows[0]?.source;
    const endpoints=new Map();
    for(const row of rows) endpoints.set(row.target.join(','),{lat:row.target[1],lng:row.target[0],label:row.label,category:row.category,row});
    if(origin) endpoints.set(origin.join(','),{lat:origin[1],lng:origin[0],label:'Origin',category:'Origin'});
    this.hoveredId=null;
    this.arcColor=d=>alpha(this.categoryColors.get(d.row.category)??ROUTE_COLORS.Other,
      this.hoveredId&&d.row.id!==this.hoveredId ? .1 : d.flow ? .98 : this.hoveredId ? .85 : .4);
    this.pointColor=d=>d.category==='Origin' ? '#fff4c2' : this.hoveredId===d.row?.id ? '#ffffff' : this.categoryColors.get(d.category)??ROUTE_COLORS.Other;
    const highlight=id=>{if(this.hoveredId===id)return;this.hoveredId=id;this.globe.arcColor(this.arcColor).pointColor(this.pointColor);};
    this.globe.arcStartLat(d=>d.row.source[1]).arcStartLng(d=>d.row.source[0]).arcEndLat(d=>d.row.target[1]).arcEndLng(d=>d.row.target[0])
      .arcColor(this.arcColor).arcCurveResolution(48).arcCircularResolution(6)
      .arcAltitudeAutoScale(.38).arcStroke(d=>d.flow ? .09 : .105).arcDashLength(d=>d.flow ? .17 : 1).arcDashGap(d=>d.flow ? .83 : 0).arcDashInitialGap(d=>d.flow?d.phase:0)
      .arcLabel(d=>escapeHtml(`${d.row.label} · ${d.row.category}`)).onArcClick(d=>this.onPick(d.row)).onArcHover(d=>highlight(d?.row?.id??null))
      .pointsData([...endpoints.values()]).pointLat(d=>d.lat).pointLng(d=>d.lng).pointAltitude(.002)
      .pointRadius(d=>d.category==='Origin' ? .42 : .25).pointResolution(10).pointColor(this.pointColor)
      .pointLabel(d=>escapeHtml(d.label)).onPointClick(d=>this.onPick(d.row??{label:d.label,category:d.category})).onPointHover(d=>highlight(d?.row?.id??null)).pointsTransitionDuration(this.motion?650:0)
      .arcsData(rows.flatMap((row,index)=>[{row,flow:false,phase:0},{row,flow:true,phase:(index*.61803398875)%1}]));
    this.updateMotion();return this;
  }
  updateMotion(){this.globe.arcDashAnimateTime(d=>d.flow&&!this.paused?3000:0);}
}

export class GlobeChoroplethLayer extends GlobeLayer {
  setData(input){
    const rows=normalizeGlobeCountries(input);this.count=rows.length;
    const values=rows.map(d=>d.value).filter(v=>finite(v)&&v>0);
    const lo=values.length?Math.log10(1+Math.min(...values)):0,hi=values.length?Math.log10(1+Math.max(...values)):1;
    this.valueRange={min:values.length?Math.min(...values):0,max:values.length?Math.max(...values):0};
    const ratio=d=>(Math.log10(1+Math.max(0,d.value))-lo)/(hi-lo||1);
    let hovered=null;
    this.globe.polygonGeoJsonGeometry(d=>d.geometry).polygonAltitude(.006).polygonStrokeColor('#17384e')
      .polygonCapColor(d=>{if(d.value===null)return '#26384f';const x=ratio(d);return x<.7?mix(GLOBE_POPULATION_COLORS[0],GLOBE_POPULATION_COLORS[1],x/.7):mix(GLOBE_POPULATION_COLORS[1],GLOBE_POPULATION_COLORS[2],(x-.7)/.3)})
      .polygonSideColor(d=>d.value===null ? '#1c293d' : mix('#25445c','#a6533c',ratio(d)))
      .polygonLabel(d=>escapeHtml(`${d.label}: ${d.value===null?'无数据':d.value.toLocaleString()}`))
      .onPolygonClick(d=>this.onPick(d)).onPolygonHover(d=>{if(hovered===d)return;hovered=d;this.globe.polygonStrokeColor(row=>row===hovered?'#eff8ff':'#17384e');})
      .polygonsTransitionDuration(this.motion?650:0).polygonsData(rows);
    return this;
  }
}

export class GlobeSpikeLayer extends GlobeLayer {
  constructor(globe,options={}){
    super(globe,options);this.bounds={min:options.minValue,max:options.maxValue};this.unit=String(options.unit??'');
    if((this.bounds.min!==undefined&&!finite(this.bounds.min))||(this.bounds.max!==undefined&&!finite(this.bounds.max))||(this.bounds.min!==undefined&&this.bounds.max!==undefined&&this.bounds.min>=this.bounds.max))throw Error('Spike metric range must increase');
  }
  setData(input){
    const rows=normalizeGlobeSpikes(input);this.count=rows.length;
    this.minValue=this.bounds.min??Math.min(...rows.map(d=>d.value));this.maxValue=this.bounds.max??Math.max(...rows.map(d=>d.value));
    if(this.maxValue<=this.minValue){const delta=Math.max(1,Math.abs(this.minValue)*.1);this.minValue-=delta;this.maxValue+=delta;}
    const span=this.maxValue-this.minValue,ratio=d=>Math.max(0,Math.min(1,(d.value-this.minValue)/span));
    let hovered=null;
    const color=d=>{if(d===hovered)return '#fff5df';const x=ratio(d);return x<.55?mix(GLOBE_SPIKE_COLORS[0],GLOBE_SPIKE_COLORS[1],x/.55):mix(GLOBE_SPIKE_COLORS[1],GLOBE_SPIKE_COLORS[2],(x-.55)/.45);};
    this.globe.pointLat(d=>d.lat).pointLng(d=>d.lng).pointAltitude(d=>.014+Math.pow(ratio(d),1.4)*.16)
      .pointRadius(d=>.17+.1*ratio(d)).pointResolution(8).pointColor(color)
      .pointLabel(d=>escapeHtml(`${d.label} · ${d.value.toLocaleString(undefined,{maximumFractionDigits:2})}${this.unit?` ${this.unit}`:''}`)).onPointClick(d=>this.onPick(d))
      .onPointHover(d=>{if(hovered===d)return;hovered=d;this.globe.pointColor(color);})
      .pointsTransitionDuration(this.motion?650:0).pointsData(rows);
    return this;
  }
}
