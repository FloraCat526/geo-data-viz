import React, {useEffect, useRef, useState} from 'react';
import {AbsoluteFill, Html5Audio, Img, Sequence, staticFile, useCurrentFrame,
  useDelayRender, useVideoConfig} from 'remotion';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {SceneNarrativeViz, createSceneTarget, sampleScene} from './runtime/components/scene-narrative.mjs';

const asset = src => /^https?:\/\//i.test(src) ? src : staticFile(src.replace(/^\/+/, ''));

export function SceneComposition({scene, config}) {
  const container = useRef(null);
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [initialHandle] = useState(() => delayRender('Loading scene map'));
  const initialReleased = useRef(false);
  const [viz, setViz] = useState(null);
  const queue = useRef(Promise.resolve());
  const time = frame === durationInFrames - 1 ? scene.duration : Math.min(scene.duration, frame / fps);
  const sample = sampleScene(scene, time);

  useEffect(() => {
    let active = true;
    const resolvedConfig = {...config};
    if (scene.provider === 'static') resolvedConfig.imageUrl = asset(config.imageUrl);
    createSceneTarget(container.current, {provider:scene.provider, config:resolvedConfig,
      basemap:config.basemap ?? scene.basemap, theme:scene.theme || 'dark', libraries:{maplibregl}, interactive:false,
      ...(['maplibre','mapbox','maptiler'].includes(scene.provider)?{initialCamera:sampleScene(scene,0).camera}:{})})
      .then(async target => {
        const layer = new SceneNarrativeViz(target, {data:scene, provider:scene.provider,
          theme:scene.theme || 'dark'});
        await layer.ready;
        if (active) setViz(layer);
      }).catch(cancelRender);
    // Map SDK instances live with this render page. Removing a map on a React
    // effect cleanup can interrupt Remotion's frame lifecycle.
    return () => {active = false;};
  }, [scene, config, initialHandle, continueRender, cancelRender]);

  useEffect(() => {
    if (!viz) return;
    const handle = delayRender(`Scene frame ${frame}`);
    queue.current = queue.current.then(() => viz.seek(time))
      .then(() => {
        continueRender(handle);
        if (!initialReleased.current) {
          initialReleased.current = true;
          continueRender(initialHandle);
        }
      }).catch(cancelRender);
  }, [viz, frame, time, initialHandle, delayRender, continueRender, cancelRender]);

  const chapter = sample.chapter;
  const image = chapter?.image || sample.location?.image;
  const enter = Math.min(1, Math.max(0, sample.chapterProgress * 10));
  const title = chapter?.title || scene.title;
  const text = chapter?.text || sample.location?.description || '';
  const basemap = config.basemap ?? scene.basemap;
  const credits = [...new Set([scene.attribution, scene.metadata?.source,
    config.attribution, basemap?.imagery?.attribution,
    basemap?.terrain?.attribution].filter(value => typeof value === 'string' && value))]
    .map(value => value.replace(/<[^>]*>/g, '')).join(' · ');

  return <AbsoluteFill style={{background:'#081323', fontFamily:'Arial, "PingFang SC", sans-serif'}}>
    <AbsoluteFill ref={container} />
    <AbsoluteFill style={{pointerEvents:'none', background:'linear-gradient(90deg,rgba(5,15,28,.68),transparent 65%)'}} />
    <div style={{position:'absolute', left:58, top:58, width:480, color:'#fff',
      opacity:enter, transform:`translateY(${(1-enter)*12}px)`}}>
      <div style={{fontSize:16, letterSpacing:3, color:'#91d9ff', marginBottom:18}}>{scene.title}</div>
      <div style={{fontSize:48, fontWeight:650, lineHeight:1.18, letterSpacing:-1}}>{title}</div>
      {text && <div style={{fontSize:22, lineHeight:1.65, color:'#e2edf8', marginTop:24,
        maxWidth:430, whiteSpace:'pre-wrap'}}>{text}</div>}
      {image && <Img src={asset(image)} style={{width:300, height:180, marginTop:24,
        objectFit:'cover', borderRadius:16}} />}
    </div>
    <div style={{position:'absolute', left:58, right:58, bottom:36, height:2,
      background:'rgba(255,255,255,.2)'}}><div style={{width:`${sample.progress*100}%`,
        height:'100%', background:'#9bdcff'}} /></div>
    {credits && <div style={{position:'absolute', right:16, bottom:54, zIndex:10, maxWidth:'70%',
      textAlign:'right', color:'#fff', background:'rgba(0,0,0,.55)', padding:'4px 7px',
      fontSize:12, lineHeight:1.35}}>{credits}</div>}
    {(scene.audio || []).map((track, index) => {
      const from = Math.round(track.start * fps);
      const frames = Math.max(1, Math.round(((track.end ?? scene.duration) - track.start) * fps));
      return <Sequence key={index} from={from} durationInFrames={frames}>
        <Html5Audio src={asset(track.src)} volume={track.volume ?? 1} />
      </Sequence>;
    })}
  </AbsoluteFill>;
}
