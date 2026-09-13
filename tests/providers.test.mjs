import test from 'node:test';
import assert from 'node:assert/strict';

const realSetTimeout = globalThis.setTimeout;
globalThis.location = { href: 'http://localhost:8765/' };
let sequence = 0, behavior = 'normal', instances = [], scripts = [], currentNamespace;
class Element {
  constructor(tag = 'div') { this.tagName = tag; this.style = {}; this.children = []; this.listeners = new Map(); this.clientWidth = 1000; this.clientHeight = 700; }
  append(...children) { for (const child of children) this.appendChild(child); }
  appendChild(child) {
    this.children.push(child); child.parent = this;
    if (this.tagName === 'head') queueMicrotask(() => {
      if (child.tagName === 'link') return child.onload?.();
      scripts.push(child);
      if (behavior === 'sdk-timeout') return;
      if (behavior === 'sdk-error') return child.onerror?.();
      installNamespace();
      const callback = new URL(child.src).searchParams.get('callback');
      if (callback) globalThis[callback]();
      child.onload?.();
    });
    return child;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); this.parent = null; }
  addEventListener(name, fn) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(fn); }
  removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
  setPointerCapture() {}
  getContext() { return { scale() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillText() {} }; }
}
globalThis.document = { head: new Element('head'), createElement: (tag) => new Element(tag) };
globalThis.ResizeObserver = class { observe() {} disconnect() { this.disconnected = true; } };
class LngLat { constructor(lng, lat) { this.lng = lng; this.lat = lat; } }
class LatLng { constructor(lat, lng) { this.lng = lng; this.lat = lat; } }
class FakeMap {
  constructor(first, second) {
    const options = second || first;
    this.options = options;
    if (behavior === 'constructor-error') throw new Error('secret-key is present in this vendor error');
    this.center = options.center || [0, 0]; this.zoom = options.zoom || 3; this.events = new Map(); this.destroyed = 0;
    instances.push(this);
    if (behavior === 'normal') realSetTimeout(() => this.emit('complete'), 0);
  }
  on(name, fn) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(fn); }
  off(name, fn) { this.events.get(name)?.delete(fn); }
  addListener(name, fn) { this.on(name, fn); return { remove: () => this.off(name, fn) }; }
  addEventListener(name, fn) { this.on(name, fn); }
  removeEventListener(name, fn) { this.off(name, fn); }
  emit(name) { for (const fn of this.events.get(name) || []) fn(); }
  destroy() { this.destroyed++; }
  loaded() { return behavior !== 'map-timeout'; }
  getCenter() { return this.center; }
  getZoom() { return this.zoom; }
  setCenter(center) { this.center = center; }
  setZoom(zoom) { this.zoom = zoom; }
  jumpTo({ center, zoom }) { this.center = center; this.zoom = zoom; }
  setZoomAndCenter(zoom, center) { this.center = center; this.zoom = zoom; }
  project(value) { const c = Array.isArray(value) ? value : [value.lng, value.lat]; return { x: c[0], y: c[1] }; }
  lngLatToContainer(value) { return this.project(value); }
  pointToPixel(value) { return this.project(value); }
  projectToContainer(value) { return this.project(value); }
  centerAndZoom(center, zoom) { this.center = center; this.zoom = zoom; if (behavior === 'normal') queueMicrotask(() => this.emit('tilesloaded')); }
  setMapStyle() {}
  setHeading() {}
  setTilt() {}
  enableScrollWheelZoom() {}
}
class Overlay {
  setMap(map) { this.map = map; if (map) { this.onAdd(); this.draw(); } else this.onRemove(); }
  getProjection() { return { fromLatLngToContainerPixel: (position) => { assert.ok(position instanceof LatLng); return { x: position.lng, y: position.lat }; } }; }
}
class AccessorMap extends FakeMap {
  constructor(...args) { super(...args); this.getCenter = undefined; this.getZoom = undefined; }
}
class TencentMap extends FakeMap {
  projectToContainer(value) { const point = this.project(value); return { getX: () => point.x, getY: () => point.y }; }
}
function installNamespace() {
  if (currentNamespace === 'mapbox') globalThis.mapboxgl = { Map: FakeMap };
  if (currentNamespace === 'maptec') globalThis.Maptec = { Map: AccessorMap };
  if (currentNamespace === 'amap') globalThis.AMap = { Map: FakeMap, LngLat };
  if (currentNamespace === 'baidu') globalThis.BMapGL = { Map: FakeMap, Point: LngLat };
  if (currentNamespace === 'tencent') globalThis.TMap = { Map: TencentMap, LatLng };
  if (currentNamespace === 'google') globalThis.google = { maps: { Map: FakeMap, LatLng, OverlayView: Overlay, event: { clearInstanceListeners(target) { target.events?.clear(); } } } };
}
async function fresh(name, mode = 'normal') {
  for (const key of ['mapboxgl', 'Maptec', 'AMap', 'BMapGL', 'TMap', 'google']) delete globalThis[key];
  behavior = mode; currentNamespace = name; instances = []; scripts = [];
  return import(new URL(`../assets/adapters/providers.mjs?test=${++sequence}`, import.meta.url));
}
const config = { key: 'secret-key', sdkUrl: 'https://sdk.example.invalid/sdk.js', securityJsCode: 'browser-security-code', dataCrs: 'wgs84' };

test('AMap forwards the explicit overseas flag and keeps it disabled by default', async () => {
  for (const [setting, expected] of [[undefined, false], [false, false], [true, true]]) {
    const { createProvider } = await fresh('amap');
    const runtimeConfig = { ...config };
    if (setting !== undefined) runtimeConfig.showOversea = setting;
    const provider = await createProvider('amap', new Element(), runtimeConfig, { center: [103.8198, 1.3521], zoom: 10 });
    try {
      assert.equal(instances[0].options.showOversea, expected);
      assert.deepEqual(instances[0].options.center, [103.8198, 1.3521]);
    } finally {
      provider.destroy();
    }
  }
});

test('all six SDK adapters use container coordinates and clean listeners/maps', async () => {
  for (const name of ['mapbox', 'maptec', 'google', 'amap', 'baidu', 'tencent']) {
    const { createProvider } = await fresh(name);
    const element = new Element();
    const provider = await createProvider(name, element, config, { center: [116, 39], zoom: 10 });
    assert.deepEqual(provider.project([116, 39]), { x: 116, y: 39 }, name);
    assert.deepEqual(provider.getView(), { center: [116, 39], zoom: 10 });
    provider.setView({ center: [117, 38], zoom: 11 });
    assert.deepEqual(provider.getView(), { center: [117, 38], zoom: 11 });
    let changes = 0; const unsubscribe = provider.onChange(() => changes++);
    for (const event of ['move', 'mapmove', 'moving', 'bounds_changed']) instances[0].emit(event);
    assert.ok(changes > 0, name);
    unsubscribe(); const count = changes;
    for (const event of ['move', 'mapmove', 'moving', 'bounds_changed']) instances[0].emit(event);
    assert.equal(changes, count);
    provider.destroy(); provider.destroy();
    assert.equal(element.children.length, 0);
    assert.equal(instances[0].destroyed, 1);
    assert.equal([...instances[0].events.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
  }
});

test('missing keys and unknown Maptec CRS fail before loading', async () => {
  const { createProvider } = await fresh('mapbox');
  const element = new Element();
  await assert.rejects(createProvider('mapbox', element, {}), /Key/);
  await assert.rejects(createProvider('maptec', element, { key: 'secret-key' }), /坐标系/);
  assert.equal(element.children.length, 0); assert.equal(scripts.length, 0);
});

test('key-bound SDK refuses changed keys and reuses same binding after destroy', async () => {
  const { createProvider } = await fresh('baidu');
  const element = new Element();
  (await createProvider('baidu', element, config)).destroy();
  (await createProvider('baidu', element, config)).destroy();
  assert.equal(scripts.length, 1);
  await assert.rejects(createProvider('baidu', element, { ...config, key: 'different-key' }), /刷新/);
  assert.equal(element.children.length, 0); assert.equal(scripts.length, 1);
});

test('SDK load errors clean the host and do not leak secrets', async () => {
  const { createProvider } = await fresh('mapbox', 'sdk-error');
  const element = new Element();
  await assert.rejects(createProvider('mapbox', element, config), (error) => !error.message.includes(config.key) && /SDK/.test(error.message));
  assert.equal(element.children.length, 0);
});

test('vendor constructor errors are redacted', async () => {
  const { createProvider } = await fresh('mapbox', 'constructor-error');
  const element = new Element();
  await assert.rejects(createProvider('mapbox', element, config), (error) => !error.message.includes(config.key));
  assert.equal(element.children.length, 0);
});

test('SDK and map timeout paths clean up; a late SDK cannot silently rebind keys', async () => {
  globalThis.setTimeout = (fn, delay, ...args) => realSetTimeout(fn, delay > 1000 ? 10 : delay, ...args);
  try {
    const sdk = await fresh('baidu', 'sdk-timeout');
    let element = new Element();
    await assert.rejects(sdk.createProvider('baidu', element, config), /超时/);
    assert.equal(element.children.length, 0);
    await assert.rejects(sdk.createProvider('baidu', element, { ...config, key: 'changed-key' }), /刷新/);
    const map = await fresh('mapbox', 'map-timeout');
    element = new Element();
    await assert.rejects(map.createProvider('mapbox', element, config), /超时/);
    assert.equal(element.children.length, 0); assert.equal(instances[0].destroyed, 1);
    assert.equal([...instances[0].events.values()].reduce((sum, listeners) => sum + listeners.size, 0), 0);
  } finally { globalThis.setTimeout = realSetTimeout; }
});
