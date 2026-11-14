import React, {useLayoutEffect, useRef, useState} from 'react';
import {flushSync} from 'react-dom';
import {
  AbsoluteFill, getRemotionEnvironment, useBufferState, useCurrentFrame,
  useDelayRender, useVideoConfig,
} from 'remotion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {waitForSceneMapFrame} from './runtime/components/scene-narrative.mjs';

const EMPTY = Object.freeze({});
const NO_LAYERS = Object.freeze([]);
const TIMEOUT = 30000;

function withoutLayerTransitions(layer) {
  const paint = {...layer.paint};
  for (const property of Object.keys(paint)) {
    if (property.endsWith('-transition')) paint[property] = {duration: 0, delay: 0};
  }
  if (layer.type === 'raster') paint['raster-fade-duration'] = 0;
  return {...layer, paint};
}

function cameraPose(initial, current = EMPTY) {
  return {center: [0, 0], zoom: 0, bearing: 0, pitch: 0, roll: 0, elevation: 0,
    ...initial, ...current,
    padding: {top: 0, bottom: 0, left: 0, right: 0, ...initial.padding, ...current.padding}};
}

/**
 * Frame-driven MapLibre stage. style (object or URL), layers, and source IDs are
 * creation-time configuration: change the React key to replace them. Use unique
 * IDs absent from the basemap; the starter composition uses "mapstory-data".
 *
 * Pass immutable camera, sources (id -> GeoJSON), and project (id -> [lng, lat])
 * values for the current frame. Omitted camera fields reset to the initial pose
 * (then MapLibre defaults), so random seeking never inherits an earlier frame.
 * A render-prop child receives {frame, points,
 * ready}; only show geographic overlays when ready is true. All coordinates are
 * in composition pixels, independent of the Studio preview's display scale.
 */
export function MapStage({style, camera = EMPTY, sources = EMPTY,
  layers = NO_LAYERS, project = EMPTY, children}) {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const {delayPlayback} = useBufferState();
  const container = useRef(null);
  const lifecycle = useRef(null);
  const creation = useRef({style, layers, sources, camera,
    sourceIds: Object.keys(sources), isRendering: getRemotionEnvironment().isRendering});
  const [snapshot, setSnapshot] = useState(null);
  const [failure, setFailure] = useState(null);

  useLayoutEffect(() => {
    const initial = creation.current;
    const state = {active: true, failed: false, revision: 0,
      releases: new Set(), queue: Promise.resolve(), map: null};
    state.ready = new Promise(resolve => { state.resolveReady = resolve; });
    lifecycle.current = state;

    state.hold = label => {
      const handle = initial.isRendering ? delayRender(label) : null;
      const playback = initial.isRendering ? null : delayPlayback();
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        state.releases.delete(release);
        if (handle !== null) continueRender(handle);
        playback?.unblock();
      };
      state.releases.add(release);
      return release;
    };
    state.fail = error => {
      // A removed preview instance must never cancel its replacement's render.
      if (!state.active || state.failed) return;
      state.failed = true;
      state.resolveReady();
      clearTimeout(state.loadTimer);
      try { cancelRender(error); }
      catch (reported) { setFailure(reported); }
      finally { for (const release of [...state.releases]) release(); }
    };
    state.initialRelease = state.hold('MapStage: loading map');
    state.loadTimer = setTimeout(() => state.fail(new Error(
      'MapStage timed out loading its style. Check local assets and map resource access.'
    )), TIMEOUT);

    const onError = event => state.fail(event.error ?? new Error('MapStage resource failed to load'));
    const onStyleLoad = () => {
      if (!state.active || state.failed || state.styleReady) return;
      try {
        for (const id of initial.sourceIds) {
          if (state.map.getSource(id)) throw new Error(`MapStage source ID conflicts with the basemap: ${id}`);
          state.map.addSource(id, {type: 'geojson', data: initial.sources[id]});
        }
        for (const layer of initial.layers) {
          if (state.map.getLayer(layer.id)) throw new Error(`MapStage layer ID conflicts with an existing layer: ${layer.id}`);
          state.map.addLayer(withoutLayerTransitions(layer));
        }
        state.styleReady = true;
        clearTimeout(state.loadTimer);
        state.resolveReady();
      } catch (error) { state.fail(error); }
    };

    try {
      if (!initial.style) throw new Error('MapStage requires an explicit MapLibre style object or URL.');
      state.map = new maplibregl.Map({
        container: container.current, ...cameraPose(initial.camera),
        interactive: false, attributionControl: false, fadeDuration: 0,
        renderWorldCopies: false,
        canvasContextAttributes: {preserveDrawingBuffer: true, antialias: true},
      });
      state.map.on('error', onError);
      state.map.on('style.load', onStyleLoad);
      // transformStyle applies to URL styles too, before their first paint.
      state.map.setStyle(initial.style, {diff: false, transformStyle: (_previous, next) => ({
        ...next, transition: {duration: 0, delay: 0},
        layers: next.layers.map(withoutLayerTransitions),
      })});
    } catch (error) { state.fail(error); }

    return () => {
      state.active = false;
      clearTimeout(state.loadTimer);
      state.resolveReady();
      for (const release of [...state.releases]) release();
      state.map?.off('error', onError);
      state.map?.off('style.load', onStyleLoad);
      // Remotion captures the WebGL canvas after React work has completed. Keep
      // it alive in render pages; Studio/Player (including StrictMode) must free it.
      if (!initial.isRendering) state.map?.remove();
      if (lifecycle.current === state) lifecycle.current = null;
    };
    // Creation-time options deliberately stay fixed until a key remount.
  }, []);

  useLayoutEffect(() => {
    const state = lifecycle.current;
    if (!state?.active || state.failed) return;
    const {sourceIds, isRendering} = creation.current;
    const request = {frame, camera, sources, project, width, height,
      revision: ++state.revision};
    const release = state.hold(`MapStage: frame ${frame}`);
    // A new preview request owns the buffer immediately; obsolete requests need
    // no additional handles. Export requests are all rendered in order.
    if (!isRendering) {
      state.previewRelease?.();
      state.previewRelease = release;
    }
    const obsolete = () => !state.active || state.failed ||
      (!isRendering && request.revision !== state.revision);

    state.queue = state.queue.then(async () => {
      if (obsolete()) return;
      await state.ready;
      if (obsolete()) return;
      const ids = Object.keys(request.sources);
      if (ids.length !== sourceIds.length || sourceIds.some(id => !Object.hasOwn(request.sources, id))) {
        throw new Error('MapStage source IDs changed. Use a new React key to recreate the map.');
      }
      await waitForSceneMapFrame(state.map, () => {
        state.map.resize();
        state.map.jumpTo(cameraPose(creation.current.camera, request.camera));
        for (const id of sourceIds) state.map.getSource(id).setData(request.sources[id]);
      }, TIMEOUT, {stage: `MapStage frame ${request.frame}`, sources: sourceIds});
      if (obsolete()) return;
      const points = Object.fromEntries(Object.entries(request.project).map(([id, coordinates]) => {
        const {x, y} = state.map.project(coordinates);
        return [id, {x, y}];
      }));
      // Publish DOM/SVG positions before releasing the frame capture handle.
      flushSync(() => setSnapshot({...request, points}));
      state.initialRelease();
    }).catch(error => state.fail(error)).finally(release);
  }, [frame, camera, sources, project, width, height]);

  if (failure) throw failure;
  const ready = snapshot !== null && snapshot.frame === frame &&
    snapshot.camera === camera && snapshot.sources === sources && snapshot.project === project &&
    snapshot.width === width && snapshot.height === height;
  return <AbsoluteFill style={{width, height, overflow: 'hidden'}}>
    <div ref={container} style={{position: 'absolute', inset: 0, width, height}}/>
    {children?.({frame: snapshot?.frame ?? frame, points: snapshot?.points ?? EMPTY, ready})}
  </AbsoluteFill>;
}
