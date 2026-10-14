import {validateCoordinate} from '../../assets/adapters/coords.mjs';

// Demo-only coordinate grid. It does not load map tiles or represent a seventh map provider.
function view(value = {}) {
  return {center: validateCoordinate(value.center ?? [0, 0]), zoom: Math.max(1, Math.min(20, Number.isFinite(value.zoom) ? value.zoom : 3))};
}
export function createPreview(element, camera = {}, dataCrs = 'wgs84') {
  const host = document.createElement('div');
  Object.assign(host.style, {position: 'absolute', inset: '0', overflow: 'hidden'});
  element.append(host);
  const listeners = new Set(), cleanups = [];
  let dead = false;
  const life = {
    notify() { if (!dead) for (const listener of listeners) listener(); },
    cleanup(fn) { cleanups.push(fn); },
  };
  const api = preview(life, host, {}, camera);
  return {...api, dataCrs,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    destroy() { if (dead) return; dead = true; for (const cleanup of cleanups.reverse()) cleanup(); listeners.clear(); host.remove(); },
  };
}

function preview(life, host, config, camera) {
  let current = view(camera), drag;
  Object.assign(host.style, { background: '#071421', cursor: 'grab', touchAction: 'none', userSelect: 'none' });
  const grid = document.createElement('canvas');
  Object.assign(grid.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
  const label = document.createElement('div');
  label.textContent = '诊断坐标网格 · 非真实地图 · 拖动 / 滚轮缩放';
  Object.assign(label.style, { position: 'absolute', bottom: '12px', left: '12px', padding: '6px 10px', background: '#091525e8', color: '#829db7', font: '12px system-ui', borderRadius: '6px', pointerEvents: 'none' });
  host.append(grid, label);
  const world = ([lng, lat]) => {
    const y = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
    const scale = 256 * 2 ** current.zoom;
    return { x: (lng + 180) / 360 * scale, y: (1 - Math.log(Math.tan(y) + 1 / Math.cos(y)) / Math.PI) / 2 * scale };
  };
  const project = (coord) => {
    const point = world(validateCoordinate(coord)), center = world(current.center);
    const scale = 256 * 2 ** current.zoom;
    let dx = point.x - center.x;
    if (dx > scale / 2) dx -= scale; if (dx < -scale / 2) dx += scale;
    return { x: host.clientWidth / 2 + dx, y: host.clientHeight / 2 + point.y - center.y };
  };
  const redraw = () => {
    const ratio = globalThis.devicePixelRatio || 1, w = host.clientWidth, h = host.clientHeight;
    grid.width = Math.round(w * ratio); grid.height = Math.round(h * ratio);
    const ctx = grid.getContext('2d'); if (!ctx) return;
    ctx.scale(ratio, ratio); ctx.lineWidth = 1; ctx.strokeStyle = '#1e374b'; ctx.fillStyle = '#547187'; ctx.font = '10px monospace';
    const degreesPerScreen = w / (256 * 2 ** current.zoom) * 360;
    const steps = [0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 60];
    const step = steps.find((value) => value > degreesPerScreen / 10) || 60;
    const [lng, lat] = current.center;
    for (let offset = -15; offset <= 15; offset++) {
      const xlng = Math.floor(lng / step) * step + offset * step;
      const ylat = Math.floor(lat / step) * step + offset * step;
      if (xlng >= -180 && xlng <= 180) { const p = project([xlng, lat]); ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, h); ctx.stroke(); ctx.fillText(`${xlng.toFixed(step < 1 ? 4 : 0)}°`, p.x + 4, 18); }
      if (ylat > -85 && ylat < 85) { const p = project([lng, ylat]); ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(w, p.y); ctx.stroke(); ctx.fillText(`${ylat.toFixed(step < 1 ? 4 : 0)}°`, 6, p.y - 4); }
    }
    life.notify();
  };
  const move = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const scale = 256 * 2 ** current.zoom;
    const start = world(drag.center);
    const x = start.x - (event.clientX - drag.x), y = start.y - (event.clientY - drag.y);
    const rawLng = x / scale * 360 - 180;
    current.center = [((rawLng + 180) % 360 + 360) % 360 - 180, Math.max(-85, Math.min(85, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI))];
    redraw();
  };
  const down = (event) => { if (event.button !== 0) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, center: [...current.center] }; host.setPointerCapture(event.pointerId); host.style.cursor = 'grabbing'; };
  const up = () => { drag = null; host.style.cursor = 'grab'; };
  const wheel = (event) => { event.preventDefault(); current.zoom = Math.max(1, Math.min(20, current.zoom - Math.sign(event.deltaY) * 0.3)); redraw(); };
  for (const [event, handler] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up], ['lostpointercapture', up]]) { host.addEventListener(event, handler); life.cleanup(() => host.removeEventListener(event, handler)); }
  host.addEventListener('wheel', wheel, { passive: false }); life.cleanup(() => host.removeEventListener('wheel', wheel));
  if (typeof ResizeObserver !== 'undefined') { const observer = new ResizeObserver(redraw); observer.observe(host); life.cleanup(() => observer.disconnect()); }
  redraw();
  return { project, getView: () => ({ center: [...current.center], zoom: current.zoom }), setView: (value) => { current = view(value); redraw(); } };
}
