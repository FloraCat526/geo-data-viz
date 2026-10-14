/** Geo Data Viz — MIT. MapLibre-native itinerary map layers; no routing or geocoding. */
const collection = features => ({type: 'FeatureCollection', features});
const idPattern = /^[A-Za-z][\w-]*$/;

function labelChip() {
  const canvas = document.createElement('canvas');
  canvas.width = 76; canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#dce5e9';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#18364b29';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.moveTo(18, 5); ctx.lineTo(58, 5); ctx.quadraticCurveTo(71, 5, 71, 18);
  ctx.lineTo(71, 38); ctx.quadraticCurveTo(71, 51, 58, 51);
  ctx.lineTo(18, 51); ctx.quadraticCurveTo(5, 51, 5, 38);
  ctx.lineTo(5, 18); ctx.quadraticCurveTo(5, 5, 18, 5);
  ctx.closePath(); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.stroke();
  return ctx.getImageData(0, 0, 76, 56);
}

function coordinate(value) {
  if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 85) {
    throw new Error('Coordinates must be WGS84 [longitude, latitude] within MapLibre Mercator bounds');
  }
  return [...value];
}

function shortText(value, field, max = 500) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw new Error(`${field} must be text of at most ${max} characters`);
  return value.trim();
}

function color(value) {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error('Day color must be #RRGGBB');
  return value;
}

/** Normalize only supplied values. Missing route geometry becomes an explicitly schematic connection. */
export function normalizeItinerary(input) {
  if (!input || !Array.isArray(input.days) || !input.days.length) throw new Error('Itinerary requires at least one day');
  const dayIds = new Set(), stopIds = new Set();
  const palette = ['#37699c', '#c57c48', '#657f70', '#a66d8c', '#7469a6'];
  const days = input.days.map((day, index) => {
    if (!day || typeof day !== 'object') throw new Error('Each day must be an object');
    const id = shortText(day.id ?? `day-${index + 1}`, 'day.id', 80);
    if (!idPattern.test(id) || dayIds.has(id)) throw new Error('Day IDs must be unique and URL-safe');
    dayIds.add(id);
    const label = shortText(day.label ?? `第 ${index + 1} 天`, 'day.label', 80);
    const date = shortText(day.date, 'day.date', 32);
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('day.date must be YYYY-MM-DD');
    if (!Array.isArray(day.stops)) throw new Error('day.stops must be an array');
    const stops = (day.stops ?? []).map((stop, stopIndex) => {
      if (!stop || typeof stop !== 'object') throw new Error('Each stop must be an object');
      const stopId = shortText(stop.id, 'stop.id', 80);
      if (!idPattern.test(stopId) || stopIds.has(stopId)) throw new Error('Stop IDs must be unique and URL-safe');
      stopIds.add(stopId);
      const name = shortText(stop.name, 'stop.name', 120);
      if (!name) throw new Error('Every stop needs a name');
      if (stop.details != null && !Array.isArray(stop.details)) throw new Error('stop.details must be an array');
      const details = (stop.details ?? []).map(item => ({
        label: shortText(item?.label, 'detail.label', 80),
        text: shortText(item?.text, 'detail.text', 500)
      })).filter(item => item.label && item.text);
      return {
        id: stopId, dayId: id, order: stopIndex + 1, name,
        coordinates: coordinate(stop.coordinates),
        time: shortText(stop.time, 'stop.time', 80),
        tag: shortText(stop.tag, 'stop.tag', 80),
        summary: shortText(stop.summary, 'stop.summary', 1000), details
      };
    });
    if (!stops.length) throw new Error('Each day needs at least one stop');
    let route = null;
    if (day.route != null) {
      if (day.route.type !== 'LineString' || !Array.isArray(day.route.coordinates) || day.route.coordinates.length < 2) throw new Error('day.route must be a LineString with at least two vertices');
      route = day.route.coordinates.map(coordinate);
      if (route.some((point, i) => i && Math.abs(point[0] - route[i - 1][0]) > 180)) throw new Error('Split paths at the antimeridian before displaying');
    }
    return {id, label, date, color: color(day.color ?? palette[index % palette.length]), stops,
      route, routeKind: route ? 'provided' : 'schematic'};
  });
  return {title: shortText(input.title ?? '旅行规划', 'title', 150), days};
}

export function itineraryGeoJSON(itinerary) {
  const stops = [], routes = [];
  const longitudes = itinerary.days.flatMap(day => day.stops.map(stop => stop.coordinates[0]));
  const midpoint = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  for (const day of itinerary.days) {
    for (const stop of day.stops) stops.push({type: 'Feature', id: stop.id,
      properties: {id: stop.id, dayId: day.id, order: String(stop.order), name: stop.name, color: day.color,
        labelSide: stop.coordinates[0] <= midpoint ? 'west' : 'east'},
      geometry: {type: 'Point', coordinates: stop.coordinates}});
    const coordinates = day.route ?? day.stops.map(stop => stop.coordinates);
    if (coordinates.length > 1) routes.push({type: 'Feature', id: day.id,
      properties: {dayId: day.id, kind: day.routeKind, color: day.color},
      geometry: {type: 'LineString', coordinates}});
  }
  return {stops: collection(stops), routes: collection(routes)};
}

export class TravelItineraryLayer {
  constructor(map, {provider = 'maplibre', id = 'geo-itinerary', data, padding = {top: 110, right: 420, bottom: 90, left: 60}, onSelect = () => {}} = {}) {
    if (provider !== 'maplibre') throw new Error('Use the selected map provider’s native map layers');
    if (!map?.isStyleLoaded()) throw new Error('Create TravelItineraryLayer after MapLibre style load');
    if (!idPattern.test(id)) throw new Error('Invalid component ID');
    this.map = map; this.id = id; this.padding = padding; this.onSelect = onSelect;
    this.data = normalizeItinerary(data); this.dayId = null; this.stopId = null; this.destroyed = false;
    const geo = itineraryGeoJSON(this.data);
    this.sources = {routes: `${id}-routes`, stops: `${id}-stops`};
    this.labelImage = `${id}-name-chip`;
    this.layers = [`${id}-route-case`, `${id}-route-provided`, `${id}-route-schematic`, `${id}-stop-halo`, `${id}-stop-core`, `${id}-stop-label`, `${id}-stop-selected`, `${id}-stop-name`];
    if (Object.values(this.sources).some(source => map.getSource(source)) || this.layers.some(layer => map.getLayer(layer)) || map.hasImage(this.labelImage)) throw new Error('Component ID already exists');
    map.addImage(this.labelImage, labelChip(), {pixelRatio: 2, stretchX: [[24, 52]], stretchY: [[20, 36]], content: [17, 11, 59, 45]});
    map.addSource(this.sources.routes, {type: 'geojson', data: geo.routes});
    map.addSource(this.sources.stops, {type: 'geojson', data: geo.stops});
    const route = this.sources.routes, stops = this.sources.stops;
    map.addLayer({id: this.layers[0], type: 'line', source: route, paint: {'line-color': '#ffffff', 'line-width': 7, 'line-opacity': .88}, layout: {'line-cap': 'round', 'line-join': 'round'}});
    map.addLayer({id: this.layers[1], type: 'line', source: route, filter: ['==', ['get', 'kind'], 'provided'], paint: {'line-color': ['get', 'color'], 'line-width': 3.4}, layout: {'line-cap': 'round', 'line-join': 'round'}});
    map.addLayer({id: this.layers[2], type: 'line', source: route, filter: ['==', ['get', 'kind'], 'schematic'], paint: {'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [1.6, 1.35]}, layout: {'line-cap': 'round', 'line-join': 'round'}});
    map.addLayer({id: this.layers[3], type: 'circle', source: stops, paint: {'circle-radius': 16, 'circle-color': '#fff', 'circle-opacity': .94}});
    map.addLayer({id: this.layers[4], type: 'circle', source: stops, paint: {'circle-radius': 12.5, 'circle-color': ['get', 'color'], 'circle-stroke-width': 1, 'circle-stroke-color': '#fff'}});
    map.addLayer({id: this.layers[5], type: 'symbol', source: stops, layout: {'text-field': ['get', 'order'], 'text-size': 12, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true}, paint: {'text-color': '#fff'}});
    map.addLayer({id: this.layers[6], type: 'circle', source: stops, filter: ['==', ['get', 'id'], ''], paint: {'circle-radius': 17, 'circle-color': '#fff', 'circle-opacity': 0, 'circle-stroke-color': '#173047', 'circle-stroke-width': 2.5}});
    map.addLayer({id: this.layers[7], type: 'symbol', source: stops,
      layout: {'text-field': ['get', 'name'], 'text-size': 12, 'text-font': ['Noto Sans Regular'],
        'icon-image': this.labelImage, 'icon-text-fit': 'both',
        'text-variable-anchor-offset': ['case', ['==', ['get', 'labelSide'], 'west'],
          ['literal', ['left', [2, 0], 'top', [0, 2], 'bottom', [0, 2], 'right', [2, 0]]],
          ['literal', ['right', [2, 0], 'top', [0, 2], 'bottom', [0, 2], 'left', [2, 0]]]],
        'text-justify': 'auto', 'text-padding': 4, 'text-max-width': 12},
      paint: {'text-color': '#203b50'}});
    this.click = event => {const hit = event.features?.[0]; if (hit) this.selectStop(hit.properties.id, {fly: false});};
    this.enter = () => {map.getCanvas().style.cursor = 'pointer';};
    this.leave = () => {map.getCanvas().style.cursor = '';};
    this.remove = () => this.destroy();
    for (const layer of [this.layers[4], this.layers[7]]) {
      map.on('click', layer, this.click); map.on('mouseenter', layer, this.enter); map.on('mouseleave', layer, this.leave);
    }
    map.on('remove', this.remove);
  }

  setDay(dayId = null, {fit = true} = {}) {
    if (this.destroyed) return;
    if (dayId !== null && !this.data.days.some(day => day.id === dayId)) throw new Error('Unknown itinerary day');
    this.dayId = dayId; this.stopId = null;
    const dayFilter = dayId === null ? ['all'] : ['==', ['get', 'dayId'], dayId];
    for (const layer of this.layers.slice(0, 6)) {
      const kind = layer === this.layers[1] ? 'provided' : layer === this.layers[2] ? 'schematic' : null;
      this.map.setFilter(layer, kind ? ['all', dayFilter, ['==', ['get', 'kind'], kind]] : dayFilter);
    }
    this.map.setFilter(this.layers[7], dayFilter);
    this.map.setFilter(this.layers[6], ['==', ['get', 'id'], '']);
    if (fit) this.fit();
  }

  fit() {
    if (this.destroyed) return;
    const days = this.dayId ? this.data.days.filter(day => day.id === this.dayId) : this.data.days;
    const coordinates = days.flatMap(day => [...day.stops.map(stop => stop.coordinates), ...(day.route ?? [])]);
    const lng = coordinates.map(p => p[0]), lat = coordinates.map(p => p[1]);
    const west = Math.min(...lng), east = Math.max(...lng), south = Math.min(...lat), north = Math.max(...lat);
    if (east - west > 180) throw new Error('Split itinerary at the antimeridian before fitting the map');
    if (west === east && south === north) this.map.easeTo({center: [west, south], zoom: 13, padding: this.padding, duration: 0});
    else this.map.fitBounds([[west, south], [east, north]], {padding: this.padding, maxZoom: this.dayId ? 14.3 : 13, duration: 500});
  }

  selectStop(stopId, {fly = true} = {}) {
    if (this.destroyed) return;
    const stop = this.data.days.flatMap(day => day.stops).find(item => item.id === stopId);
    if (!stop) throw new Error('Unknown itinerary stop');
    if (this.dayId && stop.dayId !== this.dayId) this.setDay(stop.dayId, {fit: false});
    this.stopId = stopId;
    this.map.setFilter(this.layers[6], ['==', ['get', 'id'], stopId]);
    if (fly) this.map.flyTo({center: stop.coordinates, zoom: Math.max(this.map.getZoom(), 12.8), duration: 650});
    this.onSelect(stop);
    return stop;
  }

  inspect() {
    return {provider: 'maplibre', rendererOwner: 'provider-native', types: ['line', 'circle', 'symbol'], days: this.data.days.length,
      stops: this.data.days.reduce((sum, day) => sum + day.stops.length, 0), providedRoutes: this.data.days.filter(day => day.route).length,
      schematicRoutes: this.data.days.filter(day => !day.route && day.stops.length > 1).length, selectedDay: this.dayId, selectedStop: this.stopId};
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const layer of [this.layers[4], this.layers[7]]) {
      this.map.off('click', layer, this.click); this.map.off('mouseenter', layer, this.enter); this.map.off('mouseleave', layer, this.leave);
    }
    this.map.off('remove', this.remove);
    for (const layer of [...this.layers].reverse()) if (this.map.getLayer(layer)) this.map.removeLayer(layer);
    for (const source of Object.values(this.sources)) if (this.map.getSource(source)) this.map.removeSource(source);
    if (this.map.hasImage(this.labelImage)) this.map.removeImage(this.labelImage);
  }
}
