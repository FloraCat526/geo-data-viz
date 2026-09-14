// Legacy north-up 2D loading/projection adapter retained for existing consumers.
// Not a visualization renderer. Prefer provider-native layers/official extensions; verified capability gaps may use fallback rendering.
import { CRS, validateCoordinate } from './coords.mjs';

// SDK globals live for the page lifetime. Keys are held in memory only and never logged.
const sdkStates = new Map();
const cssStates = new Map();
const SDK_TIMEOUT = 25000;
const MAP_TIMEOUT = 20000;
let serial = 0;
class ProviderError extends Error {}
export const PROVIDERS = Object.freeze(['google', 'mapbox', 'maptec', 'baidu', 'amap', 'tencent']);

export function getProviderCrs(name, config = {}) {
  if (!PROVIDERS.includes(name)) throw new ProviderError('未知地图供应商。');
  if (name === 'maptec') {
    if (!CRS.includes(config.dataCrs)) throw new ProviderError('Maptec 需按实际 SDK / 数据契约明确选择底图坐标系。');
    return config.dataCrs;
  }
  return ({ google: 'wgs84', mapbox: 'wgs84', baidu: 'bd09', amap: 'gcj02', tencent: 'gcj02' })[name];
}

function safeUrl(value, label) {
  let url;
  try { url = new URL(value, location.href); } catch { throw new ProviderError(`${label} URL 无效。`); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ProviderError(`${label} 只接受 HTTP(S) URL。`);
  if (url.username || url.password) throw new ProviderError(`${label} 不接受嵌入用户名或密码。`);
  return url;
}

function loadCss(value) {
  if (!value) return Promise.resolve();
  const href = safeUrl(value, 'CSS').href;
  if (cssStates.has(href)) return cssStates.get(href);
  const promise = new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = href;
    const finish = (error) => {
      clearTimeout(timer); link.onload = link.onerror = null;
      if (error) { link.remove(); reject(new ProviderError('地图样式文件加载失败或超时，请检查网络与 CSS URL。')); }
      else resolve();
    };
    const timer = setTimeout(() => finish(true), SDK_TIMEOUT);
    link.onload = () => finish(false); link.onerror = () => finish(true);
    document.head.appendChild(link);
  });
  cssStates.set(href, promise);
  promise.catch(() => cssStates.delete(href));
  return promise;
}

async function loadSdk(name, globalReady, value, binding, callbackParam) {
  const base = safeUrl(value, 'SDK');
  const signature = JSON.stringify([base.href, binding]);
  const existing = sdkStates.get(name);
  if (existing) {
    if (existing.signature !== signature) throw new ProviderError(`${name} 已加载另一组 Key / SDK / 安全配置，请刷新页面后重新连接。`);
    return existing.promise;
  }
  if (globalReady()) throw new ProviderError(`${name} SDK 已由其他代码加载，无法核实当前 Key；请在独立页面刷新后连接。`);
  const callbackName = `__geoVizSdk${++serial}`;
  if (callbackParam) base.searchParams.set(callbackParam, callbackName);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (error) => {
      if (settled) return;
      if (!error && !globalReady()) return;
      settled = true; clearTimeout(timer); script.onload = script.onerror = null;
      if (callbackParam) {
        // Keep a harmless callback after a timeout, because a delayed response may execute.
        globalThis[callbackName] = () => {};
      }
      if (error) { script.remove(); reject(new ProviderError(`${name} SDK 加载失败或超时，请检查网络、Key 与域名白名单；修改配置后刷新重试。`)); }
      else resolve();
    };
    const timer = setTimeout(() => finish(true), SDK_TIMEOUT);
    if (callbackParam) globalThis[callbackName] = () => finish(false);
    script.async = true; script.src = base.href;
    script.onload = () => finish(false); script.onerror = () => finish(true);
    document.head.appendChild(script);
  });
  // Retain failed bindings: a timed-out script may have partially initialized a global SDK.
  sdkStates.set(name, { signature, promise });
  return promise;
}

function pair(center) {
  const lng = typeof center.lng === 'function' ? center.lng() : center.lng ?? center.longitude ?? center.getLng?.();
  const lat = typeof center.lat === 'function' ? center.lat() : center.lat ?? center.latitude ?? center.getLat?.();
  return validateCoordinate(Array.isArray(center) ? center : [lng, lat]);
}

function pixel(value) {
  const x = value?.x ?? value?.getX?.(), y = value?.y ?? value?.getY?.();
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : { x: NaN, y: NaN };
}

function view(value = {}) {
  return { center: validateCoordinate(value.center ?? [0, 0]), zoom: Math.max(1, Math.min(20, Number.isFinite(value.zoom) ? value.zoom : 3)) };
}

function lifecycle(host, dataCrs) {
  const cleanups = [], listeners = new Set();
  let dead = false, map;
  const notify = () => { if (!dead) for (const fn of listeners) fn(); };
  const cleanup = (fn) => { cleanups.push(fn); return fn; };
  const on = (target, event, fn, kind = 'on') => {
    if (kind === 'google') { const handle = target.addListener(event, fn); cleanup(() => handle.remove()); }
    else if (kind === 'baidu') { target.addEventListener(event, fn); cleanup(() => target.removeEventListener(event, fn)); }
    else { target.on(event, fn); cleanup(() => target.off(event, fn)); }
  };
  return {
    dataCrs, notify, cleanup, on,
    setMap(value) { map = value; },
    get map() { return map; },
    onChange(callback) { listeners.add(callback); return () => listeners.delete(callback); },
    destroy() {
      if (dead) return; dead = true;
      for (const fn of cleanups.reverse()) { try { fn(); } catch { /* Best-effort independent cleanup. */ } }
      listeners.clear();
      try { if (typeof map?.destroy === 'function') map.destroy(); else map?.remove?.(); } catch { /* Release remaining DOM even if the vendor destroy throws. */ } finally { host.remove(); map = null; }
    },
  };
}

function ready(life, event, options = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error) => {
      if (settled) return; settled = true; clearTimeout(timer); clearInterval(poll);
      if (error) reject(new ProviderError('地图初始化失败或超时，请检查 Key 权限、网络、样式地址和域名白名单。'));
      else resolve();
    };
    const timer = setTimeout(() => finish(true), MAP_TIMEOUT);
    const poll = options.check ? setInterval(() => { try { if (options.check()) finish(false); } catch { /* Projection may not exist yet. */ } }, 100) : undefined;
    if (event) life.on(life.map, event, () => finish(false), options.kind);
    if (options.errorEvent) life.on(life.map, options.errorEvent, () => finish(true), options.kind);
    life.cleanup(() => { if (!settled) finish(true); });
    try { options.start?.(); } catch { finish(true); }
    if (options.check?.()) finish(false);
  });
}

function addResize(life, host) {
  if (typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(() => { life.map?.resize?.(); life.notify(); });
  observer.observe(host); life.cleanup(() => observer.disconnect());
}

function glApi(life, useRenderEvent = true) {
  const map = life.map;
  if (typeof map.project !== 'function') throw new ProviderError('当前 SDK 未暴露容器坐标投影能力，请核对已验证的 SDK 版本。');
  map.dragRotate?.disable?.(); map.touchZoomRotate?.disableRotation?.(); map.touchPitch?.disable?.();
  map.keyboard?.disableRotation?.();
  const events = ['move', 'zoom', 'resize', 'moveend', 'zoomend'];
  if (useRenderEvent) events.push('render');
  for (const event of events) life.on(map, event, life.notify);
  return {
    project: (coord) => pixel(map.project(validateCoordinate(coord))),
    getView: () => ({ center: pair(map.getCenter?.() ?? map.center), zoom: map.getZoom?.() ?? map.zoom }),
    setView: (value) => {
      const next = view(value);
      if (map.jumpTo) map.jumpTo({ ...next, bearing: 0, pitch: 0 });
      else {
        if (map.setCenter) map.setCenter(next.center); else map.center = next.center;
        if (map.setZoom) map.setZoom(next.zoom); else map.zoom = next.zoom;
        if (map.setPitch) map.setPitch(0); else map.pitch = 0;
        if (map.setBearing) map.setBearing(0); else map.bearing = 0;
      }
    },
  };
}

async function mapbox(life, host, config, camera) {
  await Promise.all([
    loadSdk('mapbox', () => globalThis.mapboxgl?.Map, config.sdkUrl || 'https://api.mapbox.com/mapbox-gl-js/v3.28.1/mapbox-gl.js', null),
    loadCss(config.cssUrl || 'https://api.mapbox.com/mapbox-gl-js/v3.28.1/mapbox-gl.css'),
  ]);
  const map = new mapboxgl.Map({ container: host, accessToken: config.key, style: config.style || 'mapbox://styles/mapbox/dark-v11', ...camera, pitch: 0, bearing: 0, projection: 'mercator', renderWorldCopies: false, maxPitch: 0, dragRotate: false, touchPitch: false });
  life.setMap(map);
  await ready(life, 'load', { check: () => map.loaded(), errorEvent: 'error' });
  return glApi(life);
}

async function maptec(life, host, config, camera) {
  if (!config.sdkUrl) throw new ProviderError('请提供你获准使用的 Maptec SDK URL；此模板不内置私有或测试环境地址。');
  await Promise.all([
    loadSdk('maptec', () => globalThis.Maptec?.Map, config.sdkUrl, config.key),
    loadCss(config.cssUrl),
  ]);
  Maptec.apiKey = config.key;
  const map = new Maptec.Map({ container: host, style: config.style || 'dark', ...camera, pitch: 0, bearing: 0, maxPitch: 0, dragRotate: false, renderWorldCopies: false });
  life.setMap(map);
  await ready(life, 'load', { check: () => map.loaded?.() === true, errorEvent: 'error' });
  return glApi(life, false);
}

const GOOGLE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#15263b' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7c9ab7' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#102034' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#071321' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#243c52' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

async function google(life, host, config, camera) {
  const url = safeUrl(config.sdkUrl || 'https://maps.googleapis.com/maps/api/js', 'Google SDK');
  url.searchParams.set('key', config.key); url.searchParams.set('v', 'quarterly'); url.searchParams.set('loading', 'async');
  await loadSdk('google', () => globalThis.google?.maps?.Map, url.href, config.key, 'callback');
  const options = { center: { lng: camera.center[0], lat: camera.center[1] }, zoom: camera.zoom, tilt: 0, heading: 0, rotateControl: false, streetViewControl: false, mapTypeControl: false, fullscreenControl: false, headingInteractionEnabled: false, tiltInteractionEnabled: false };
  if (config.mapId) options.mapId = config.mapId;
  else options.styles = Array.isArray(config.style) ? config.style : GOOGLE_DARK;
  const map = new globalThis.google.maps.Map(host, options);
  life.setMap(map);
  const overlay = new globalThis.google.maps.OverlayView();
  let projection;
  overlay.onAdd = () => {}; overlay.onRemove = () => { projection = null; };
  overlay.draw = () => { projection = overlay.getProjection(); life.notify(); };
  life.cleanup(() => { overlay.setMap(null); globalThis.google.maps.event.clearInstanceListeners(overlay); globalThis.google.maps.event.clearInstanceListeners(map); map.unbindAll?.(); });
  overlay.setMap(map);
  await ready(life, null, { check: () => Boolean(projection?.fromLatLngToContainerPixel(new globalThis.google.maps.LatLng(camera.center[1], camera.center[0]))) });
  for (const event of ['bounds_changed', 'zoom_changed', 'idle']) life.on(map, event, life.notify, 'google');
  return {
    project: (coord) => { const [lng, lat] = validateCoordinate(coord); return pixel(projection?.fromLatLngToContainerPixel(new globalThis.google.maps.LatLng(lat, lng))); },
    getView: () => ({ center: pair(map.getCenter()), zoom: map.getZoom() }),
    setView: (value) => { const next = view(value); map.setCenter({ lng: next.center[0], lat: next.center[1] }); map.setZoom(next.zoom); map.setHeading(0); map.setTilt(0); },
  };
}

async function amap(life, host, config, camera) {
  const security = config.securityServiceHost ? { serviceHost: config.securityServiceHost } : config.securityJsCode ? { securityJsCode: config.securityJsCode } : null;
  if (!security) throw new ProviderError('高德请提供 securityJsCode 或安全代理 serviceHost（已有老 Key 请按控制台要求配置）。');
  const url = safeUrl(config.sdkUrl || 'https://webapi.amap.com/maps', '高德 SDK');
  url.searchParams.set('v', '2.0'); url.searchParams.set('key', config.key);
  // Do not overwrite an active security binding before loadSdk has checked it.
  if (!sdkStates.has('amap')) globalThis._AMapSecurityConfig = security;
  await loadSdk('amap', () => globalThis.AMap?.Map, url.href, [config.key, security]);
  const map = new AMap.Map(host, { ...camera, viewMode: '2D', pitch: 0, rotation: 0, rotateEnable: false, pitchEnable: false, showOversea: config.showOversea === true, mapStyle: config.style || 'amap://styles/darkblue' });
  life.setMap(map);
  await ready(life, 'complete');
  for (const event of ['mapmove', 'zoomchange', 'resize', 'moveend', 'zoomend']) life.on(map, event, life.notify);
  return {
    project: (coord) => pixel(map.lngLatToContainer(new AMap.LngLat(...validateCoordinate(coord)))),
    getView: () => ({ center: pair(map.getCenter()), zoom: map.getZoom() }),
    setView: (value) => { const next = view(value); map.setZoomAndCenter(next.zoom, next.center); },
  };
}

async function baidu(life, host, config, camera) {
  // Official 4.0 compatibility path: load 4.0, select 'gl', then construct BMapGL.Map.
  const url = safeUrl(config.sdkUrl || 'https://api.map.baidu.com/api', '百度 SDK');
  url.searchParams.set('v', '4.0'); url.searchParams.delete('type'); url.searchParams.set('ak', config.key);
  await loadSdk('baidu', () => globalThis.BMapGL?.Map, url.href, config.key, 'callback');
  BMapGL.apiVersion = 'gl';
  const map = new BMapGL.Map(host, { enableRotate: false, enableTilt: false, minZoom: 3, maxZoom: 20 });
  life.setMap(map);
  await ready(life, 'tilesloaded', { kind: 'baidu', start() {
    map.centerAndZoom(new BMapGL.Point(...camera.center), Math.max(3, camera.zoom));
    map.setHeading?.(0); map.setTilt?.(0); map.enableScrollWheelZoom(true);
    map.disableRotate?.(); map.disableTilt?.();
    if (config.style) {
      const style = typeof config.style === 'string' ? { styleId: config.style } : config.style;
      if (typeof map.setMapStyle === 'function') map.setMapStyle(style);
      else if (typeof map.setMapStyleV2 === 'function') map.setMapStyleV2(style);
      else throw new ProviderError('当前百度 SDK 不支持配置地图样式，请核对版本。');
    }
  } });
  for (const event of ['moving', 'zooming', 'moveend', 'zoomend', 'resize']) life.on(map, event, life.notify, 'baidu');
  return {
    project: (coord) => pixel(map.pointToPixel(new BMapGL.Point(...validateCoordinate(coord)))),
    getView: () => ({ center: pair(map.getCenter()), zoom: map.getZoom() }),
    setView: (value) => { const next = view(value); map.centerAndZoom(new BMapGL.Point(...next.center), Math.max(3, next.zoom)); },
  };
}

async function tencent(life, host, config, camera) {
  const url = safeUrl(config.sdkUrl || 'https://map.qq.com/api/gljs', '腾讯 SDK');
  url.searchParams.set('v', '1.exp'); url.searchParams.set('key', config.key);
  await loadSdk('tencent', () => globalThis.TMap?.Map, url.href, config.key, 'callback');
  const options = { center: new TMap.LatLng(camera.center[1], camera.center[0]), zoom: camera.zoom, pitch: 0, rotation: 0, viewMode: '2D' };
  if (config.style) options.mapStyleId = config.style;
  const map = new TMap.Map(host, options);
  life.setMap(map);
  map.setRotatable?.(false); map.setPitchable?.(false);
  if (typeof map.projectToContainer !== 'function') throw new ProviderError('当前腾讯 SDK 不支持 projectToContainer，请按官方 GL JS 版本核对。');
  await ready(life, 'idle', { check: () => Number.isFinite(pixel(map.projectToContainer(options.center)).x) });
  for (const event of ['center_changed', 'zoom', 'bounds_changed', 'resize', 'idle']) life.on(map, event, life.notify);
  return {
    project: (coord) => { const [lng, lat] = validateCoordinate(coord); return pixel(map.projectToContainer(new TMap.LatLng(lat, lng))); },
    getView: () => ({ center: pair(map.getCenter()), zoom: map.getZoom() }),
    setView: (value) => { const next = view(value); map.setCenter(new TMap.LatLng(next.center[1], next.center[0])); map.setZoom(next.zoom); map.setPitch?.(0); map.setRotation?.(0); },
  };
}

/** Coordinates passed to project and camera must already use the returned dataCrs. */
export async function createProvider(name, element, config = {}, camera = {}) {
  const dataCrs = getProviderCrs(name, config);
  if (typeof config.key !== 'string' || !config.key.trim()) throw new ProviderError('请先填写该供应商的浏览器端地图 Key / Token。');
  if (!element?.appendChild) throw new ProviderError('缺少地图容器。');
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'absolute', inset: '0', overflow: 'hidden' });
  element.appendChild(host);
  const life = lifecycle(host, dataCrs);
  try {
    const api = await ({ google, mapbox, maptec, baidu, amap, tencent })[name](life, host, config, view(camera));
    addResize(life, host);
    return { ...api, dataCrs, onChange: life.onChange, destroy: life.destroy };
  } catch (error) {
    life.destroy();
    // Vendor errors can contain credential-bearing request URLs. Never surface them verbatim.
    throw error instanceof ProviderError ? error : new ProviderError('地图初始化或投影失败，请核对 SDK 版本、Key 权限与配置。');
  }
}
