/** Geo Data Viz — MIT. Narrative timeline rendered with MapLibre native layers. */
const fc = features => ({type: 'FeatureCollection', features});
const idPattern = /^[A-Za-z][\w-]*$/;
const clamp = value => Math.max(0, Math.min(1, value));
const point = value => {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 85) {
    throw new Error('Coordinates must be WGS84 [longitude, latitude] within Mercator bounds');
  }
  return [...value];
};
const label = (value, field, max = 500, required = false) => {
  if (value == null && !required) return '';
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) throw new Error(`${field} must be text of at most ${max} characters`);
  return value.trim();
};
const line = coordinates => ({type: 'Feature', properties: {}, geometry: {type: 'LineString', coordinates}});

/** Event order is narrative order. Dates are labels, never used to infer location or speed. */
export function normalizeStory(input) {
  if (!input || !Array.isArray(input.events) || !input.events.length) throw new Error('Story requires at least one event');
  if (input.metadata?.dataCrs !== 'wgs84') throw new Error('Story requires verified WGS84 coordinates');
  const seen = new Set();
  const events = input.events.map((event, index) => {
    if (!event || typeof event !== 'object') throw new Error('Each event must be an object');
    const id = label(event.id, 'event.id', 80, true);
    if (!idPattern.test(id) || seen.has(id)) throw new Error('Event IDs must be unique and URL-safe');
    seen.add(id);
    const coordinates = point(event.coordinates);
    const title = label(event.title, 'event.title', 120, true);
    const date = label(event.date, 'event.date', 32);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0,10) !== date)) throw new Error('event.date must be a real YYYY-MM-DD date');
    const route = event.routeFromPrevious;
    if (index === 0 && route != null) throw new Error('First event cannot have routeFromPrevious');
    let routeCoordinates = null;
    if (route != null) {
      if (route.type !== 'LineString' || !Array.isArray(route.coordinates) || route.coordinates.length < 2) throw new Error('routeFromPrevious must be a LineString');
      routeCoordinates = route.coordinates.map(point);
      const previous = input.events[index - 1].coordinates;
      const close = (a, b) => Math.abs(a[0] - b[0]) < 0.000001 && Math.abs(a[1] - b[1]) < 0.000001;
      if (!close(routeCoordinates[0], previous) || !close(routeCoordinates.at(-1), coordinates)) throw new Error('Provided route endpoints must match adjacent event coordinates');
    }
    const details = event.details ?? [];
    if (!Array.isArray(details)) throw new Error('event.details must be an array');
    return {id, index, title, coordinates, date, chapter: label(event.chapter, 'event.chapter', 80),
      summary: label(event.summary, 'event.summary', 1000),
      details: details.map(item => ({label: label(item?.label, 'detail.label', 80, true), text: label(item?.text, 'detail.text', 500, true)})),
      route: routeCoordinates, routeKind: index === 0 ? null : routeCoordinates ? 'provided' : 'schematic'};
  });
  let lastDate = '';
  for (const event of events) {
    if (event.date && lastDate && event.date < lastDate) throw new Error('Event dates must follow narrative order');
    if (event.date) lastDate = event.date;
  }
  for (let i = 1; i < events.length; i++) {
    const a = events[i-1], b = events[i];
    const route = b.route ?? [a.coordinates, b.coordinates];
    if (route.some((p,j) => j && Math.abs(p[0] - route[j-1][0]) > 180)) throw new Error('Split routes at the antimeridian before displaying');
  }
  return {title: label(input.title ?? '故事地图', 'title', 150, true), subtitle: label(input.subtitle, 'subtitle', 180), events};
}

function partialRoute(coordinates, fraction) {
  if (fraction <= 0) return [coordinates[0], coordinates[0]];
  if (fraction >= 1) return coordinates;
  const lengths = coordinates.slice(1).map((point, i) => {
    const a = coordinates[i];
    const meanLatitude = (a[1] + point[1]) * Math.PI / 360;
    return Math.hypot((point[0] - a[0]) * Math.cos(meanLatitude), point[1] - a[1]);
  });
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (!total) return [coordinates[0], coordinates[0]];
  let remaining = total * fraction;
  const result = [coordinates[0]];
  for (let i=0; i<lengths.length; i++) {
    if (remaining >= lengths[i]) {result.push(coordinates[i+1]); remaining -= lengths[i]; continue;}
    const t = lengths[i] ? remaining / lengths[i] : 0;
    result.push([coordinates[i][0] + (coordinates[i+1][0] - coordinates[i][0])*t, coordinates[i][1] + (coordinates[i+1][1] - coordinates[i][1])*t]);
    return result;
  }
  return coordinates;
}

export class StoryTimelineLayer {
  constructor(map, {provider = 'maplibre', id = 'geo-story', data, padding = {top: 95,right: 390,bottom: 145,left: 70}, onChange = () => {}, onSelect = () => {}} = {}) {
    if (provider !== 'maplibre') throw new Error('Use the selected map provider’s native layers');
    if (!map?.isStyleLoaded()) throw new Error('Create StoryTimelineLayer after MapLibre style load');
    if (!idPattern.test(id)) throw new Error('Invalid component ID');
    this.map = map; this.id = id; this.padding = padding; this.onChange = onChange; this.onSelect = onSelect;
    this.data = normalizeStory(data); this.progress = 0; this.playing = false; this.destroyed = false; this.frame = null; this.lastFrame = null;
    this.sources = {future:`${id}-future`, actual:`${id}-actual`, schematic:`${id}-schematic`, events:`${id}-events`, head:`${id}-head`};
    this.layers = [`${id}-future`,`${id}-actual-case`,`${id}-actual`,`${id}-schematic`,`${id}-halo`,`${id}-nodes`,`${id}-selected`,`${id}-labels`,`${id}-head-halo`,`${id}-head`];
    if (Object.values(this.sources).some(key=>map.getSource(key)) || this.layers.some(key=>map.getLayer(key))) throw new Error('Component ID already exists');
    const routes = this.data.events.slice(1).map((event,i) => ({type:'Feature',properties:{kind:event.routeKind,index:i},geometry:{type:'LineString',coordinates:event.route ?? [this.data.events[i].coordinates,event.coordinates]}}));
    this.routes = routes;
    const events = this.data.events.map(event => ({type:'Feature',id:event.id,properties:{id:event.id,title:event.title,index:event.index},geometry:{type:'Point',coordinates:event.coordinates}}));
    map.addSource(this.sources.future,{type:'geojson',data:fc(routes)});
    map.addSource(this.sources.actual,{type:'geojson',data:fc([])});
    map.addSource(this.sources.schematic,{type:'geojson',data:fc([])});
    map.addSource(this.sources.events,{type:'geojson',data:fc(events)});
    map.addSource(this.sources.head,{type:'geojson',data:fc([])});
    map.addLayer({id:this.layers[0],type:'line',source:this.sources.future,paint:{'line-color':'#56768d','line-width':2,'line-opacity':.3,'line-dasharray':[1,2]},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[1],type:'line',source:this.sources.actual,paint:{'line-color':'#fff','line-width':7,'line-opacity':.86},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[2],type:'line',source:this.sources.actual,paint:{'line-color':'#1676a8','line-width':3.8},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[3],type:'line',source:this.sources.schematic,paint:{'line-color':'#1676a8','line-width':3,'line-dasharray':[1.4,1.4]},layout:{'line-cap':'round','line-join':'round'}});
    map.addLayer({id:this.layers[4],type:'circle',source:this.sources.events,paint:{'circle-radius':14,'circle-color':'#fff','circle-opacity':.88}});
    map.addLayer({id:this.layers[5],type:'circle',source:this.sources.events,paint:{'circle-radius':8,'circle-color':['case',['<=',['get','index'],0],'#1676a8','#9eacb7'],'circle-stroke-width':2,'circle-stroke-color':'#fff'}});
    map.addLayer({id:this.layers[6],type:'circle',source:this.sources.events,filter:['==',['get','index'],0],paint:{'circle-radius':15,'circle-color':'#1676a8','circle-stroke-color':'#fff','circle-stroke-width':3}});
    map.addLayer({id:this.layers[7],type:'symbol',source:this.sources.events,layout:{'text-field':['get','title'],'text-font':['Noto Sans Regular'],'text-size':12,'text-offset':[0,2.2],'text-anchor':'top','text-max-width':10},paint:{'text-color':'#193749','text-halo-color':'#fff','text-halo-width':2.4}});
    map.addLayer({id:this.layers[8],type:'circle',source:this.sources.head,paint:{'circle-radius':17,'circle-color':'#1676a8','circle-opacity':.2}});
    map.addLayer({id:this.layers[9],type:'circle',source:this.sources.head,paint:{'circle-radius':6,'circle-color':'#fff','circle-stroke-color':'#1676a8','circle-stroke-width':3}});
    this.click = e => {const feature=e.features?.[0];if(feature)this.seekEvent(Number(feature.properties.index),{select:true});};
    this.enter = () => {map.getCanvas().style.cursor='pointer';};
    this.leave = () => {map.getCanvas().style.cursor='';};
    this.remove = () => this.destroy();
    for (const layer of [this.layers[5],this.layers[7]]) {map.on('click',layer,this.click);map.on('mouseenter',layer,this.enter);map.on('mouseleave',layer,this.leave);}
    map.on('remove',this.remove);
    this.setProgress(0);
  }

  setProgress(value) {
    if (this.destroyed) return;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Progress must be finite from 0 to 1');
    this.progress=clamp(value);
    const count=this.data.events.length,position=this.progress*Math.max(0,count-1);
    const selected=Math.min(count-1,Math.floor(position+1e-9));
    const actual=[],schematic=[];
    let head=this.data.events[0].coordinates;
    for(let i=0;i<this.routes.length;i++){
      const fraction=clamp(position-i);
      if(fraction<=0)break;
      const coordinates=partialRoute(this.routes[i].geometry.coordinates,fraction);
      (this.routes[i].properties.kind==='provided'?actual:schematic).push(line(coordinates));
      head=coordinates.at(-1);
    }
    this.map.getSource(this.sources.actual).setData(fc(actual));
    this.map.getSource(this.sources.schematic).setData(fc(schematic));
    this.map.getSource(this.sources.head).setData(fc([{type:'Feature',properties:{},geometry:{type:'Point',coordinates:head}}]));
    this.map.setFilter(this.layers[6],['==',['get','index'],selected]);
    this.map.setPaintProperty(this.layers[5],'circle-color',['case',['<=',['get','index'],selected],'#1676a8','#9eacb7']);
    this.onChange({progress:this.progress,eventIndex:selected,event:this.data.events[selected],position,playing:this.playing});
  }

  seekEvent(index,{select=false}={}) {
    if (!Number.isInteger(index)||index<0||index>=this.data.events.length) throw new Error('Unknown story event');
    this.pause();
    this.setProgress(this.data.events.length===1?0:index/(this.data.events.length-1));
    if(select)this.onSelect(this.data.events[index]);
    return this.data.events[index];
  }

  play({duration=14000}={}) {
    if(this.destroyed)return;
    if(!Number.isFinite(duration)||duration<=0)throw new Error('duration must be positive');
    if(this.playing)return;
    if(this.progress>=1)this.setProgress(0);
    this.playing=true;this.lastFrame=null;
    const step=timestamp=>{
      if(!this.playing||this.destroyed)return;
      if(this.lastFrame!=null)this.setProgress(this.progress+Math.min(100,timestamp-this.lastFrame)/duration);
      this.lastFrame=timestamp;
      if(this.progress>=1){this.pause();this.onChange({progress:1,eventIndex:this.data.events.length-1,event:this.data.events.at(-1),playing:false});return;}
      this.frame=requestAnimationFrame(step);
    };
    this.frame=requestAnimationFrame(step);
    this.onChange({progress:this.progress,eventIndex:Math.floor(this.progress*Math.max(0,this.data.events.length-1)),event:this.data.events[Math.floor(this.progress*Math.max(0,this.data.events.length-1))],playing:true});
  }

  pause(){if(!this.playing)return;this.playing=false;if(this.frame!=null)cancelAnimationFrame(this.frame);this.frame=null;this.lastFrame=null;this.setProgress(this.progress);}

  fit(){
    if(this.destroyed)return;
    const coords=[...this.data.events.map(e=>e.coordinates),...this.routes.flatMap(r=>r.geometry.coordinates)];
    const lng=coords.map(p=>p[0]),lat=coords.map(p=>p[1]);
    const west=Math.min(...lng),east=Math.max(...lng),south=Math.min(...lat),north=Math.max(...lat);
    if(east-west>180)throw new Error('Split story at the antimeridian before fitting');
    if(west===east&&south===north)this.map.easeTo({center:[west,south],zoom:12,padding:this.padding,duration:0});
    else this.map.fitBounds([[west,south],[east,north]],{padding:this.padding,maxZoom:12.5,duration:500});
  }

  inspect(){return {provider:'maplibre',rendererOwner:'provider-native',types:['line','circle','symbol'],events:this.data.events.length,
    providedRoutes:this.routes.filter(r=>r.properties.kind==='provided').length,schematicRoutes:this.routes.filter(r=>r.properties.kind==='schematic').length,
    progress:this.progress,playing:this.playing};}

  destroy(){
    if(this.destroyed)return;this.pause();this.destroyed=true;
    for(const layer of [this.layers[5],this.layers[7]]){this.map.off('click',layer,this.click);this.map.off('mouseenter',layer,this.enter);this.map.off('mouseleave',layer,this.leave);}
    this.map.off('remove',this.remove);
    for(const layer of [...this.layers].reverse())if(this.map.getLayer(layer))this.map.removeLayer(layer);
    for(const source of Object.values(this.sources))if(this.map.getSource(source))this.map.removeSource(source);
  }
}
