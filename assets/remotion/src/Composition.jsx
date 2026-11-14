import React, {useMemo} from 'react';
import {AbsoluteFill, Easing, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {MapStage} from './MapStage.jsx';
import {dataTimeAtFrame, eventsThroughTime, sampleTimedTrack} from './timing.mjs';
import data from './data.json';
import background from './background.json';
import config from './project-config.json';

// This is the authoring surface: edit the story, camera, palette and annotations
// here using native Remotion primitives. Original feature properties stay intact.
const ACCENT='#8be8cf';
const fc=features=>({type:'FeatureCollection',features});
const empty=fc([]);
const pointOf=feature=>feature.geometry.coordinates.slice(0,2);
const timeOf=feature=>config.timeFormat==='iso8601'
  ? Date.parse(feature.properties[config.timeField]) : feature.properties[config.timeField];
const records=config.mode==='overview'?data.features:[...data.features].sort((a,b)=>timeOf(a)-timeOf(b));
const baseStyle=background?{
  version:8, sources:{'story-background':{type:'geojson',data:background}}, layers:[
    {id:'ocean',type:'background',paint:{'background-color':'#0a1721'}},
    {id:'land',type:'fill',source:'story-background',paint:{'fill-color':'#233c44'}},
    {id:'borders',type:'line',source:'story-background',paint:{'line-color':'#58737b','line-width':.6,'line-opacity':.6}},
  ]
}:'https://tiles.openfreemap.org/styles/dark';
const layers=[
 {id:'story-polygons',type:'fill',source:'mapstory-data',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':ACCENT,'fill-opacity':.28}},
 {id:'story-lines',type:'line',source:'mapstory-data',filter:['==',['geometry-type'],'LineString'],paint:{'line-color':ACCENT,'line-width':3}},
 {id:'story-points',type:'circle',source:'mapstory-data',filter:['==',['geometry-type'],'Point'],paint:{'circle-color':ACCENT,'circle-radius':4,'circle-stroke-color':'#effff7','circle-stroke-width':.8,'circle-opacity':.8}},
 {id:'story-trail-glow',type:'line',source:'mapstory-trail',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':ACCENT,'line-width':14,'line-blur':8,'line-opacity':.45}},
 {id:'story-trail',type:'line',source:'mapstory-trail',layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':ACCENT,'line-width':3}},
 {id:'story-focus',type:'circle',source:'mapstory-focus',paint:{'circle-radius':['get','radius'],'circle-opacity':0,'circle-stroke-color':'#fff1c6','circle-stroke-width':2}},
];
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=Easing.inOut(Easing.cubic);

function ClosingCard({count}){
 const frame=useCurrentFrame(); // Sequence-local frame: appropriate for this UI entrance only.
 const {fps}=useVideoConfig();
 const enter=spring({frame,fps,config:{damping:200}});
 return <div style={{position:'absolute',right:48,bottom:130,color:ACCENT,textAlign:'right',opacity:enter,transform:`translateY(${(1-enter)*16}px)`}}>
  <strong style={{fontSize:32,fontWeight:500}}>{count.toLocaleString('en-US')}</strong>
  <div style={{fontSize:12,marginTop:6}}>完整源记录 · 时间与位置保留</div>
 </div>;
}

export function GeoStory(){
 const frame=useCurrentFrame();
 const {fps,width,height,durationInFrames}=useVideoConfig();
 const introFrames=Math.min(Math.round(fps*1.5),Math.floor((durationInFrames-1)*.15));
 const outroFrames=Math.min(Math.round(fps*2),Math.floor((durationInFrames-1)*.15));
 // Compute business time outside Sequence: chapter-local frames must never reset event time.
 const sampled=useMemo(()=>{
  if(config.mode==='overview')return {visible:records,focus:null,observed:null,trail:[],time:null,progress:frame/(durationInFrames-1)};
  const time=dataTimeAtFrame(frame,{fps,durationInFrames,start:config.timeDomain[0],end:config.timeDomain[1],introFrames,outroFrames});
  if(config.mode==='track'){
   const state=sampleTimedTrack(records,time,{timeOf,coordinateOf:pointOf});
   return {visible:records.slice(0,state.index+1),focus:state.observed?state.point:null,observed:state.observed,trail:state.coordinates,time,progress:state.progress};
  }
  const visible=eventsThroughTime(records,time,{timeOf}),observed=visible.at(-1);
  const span=config.timeDomain[1]-config.timeDomain[0];
  return {visible,observed,focus:observed?pointOf(observed):null,trail:[],time,progress:span?clamp((time-config.timeDomain[0])/span):1};
 },[frame,fps,durationInFrames,introFrames,outroFrames]);
 const camera=useMemo(()=>{
  const follow=config.mode==='track'&&sampled.focus
    ? ease(clamp(frame/Math.max(1,introFrames)))*(1-ease(clamp((frame-(durationInFrames-1-outroFrames))/Math.max(1,outroFrames)))) : 0;
  return {...config.camera,
   center:config.camera.center.map((v,i)=>v+((sampled.focus?.[i]??v)-v)*follow),
   zoom:config.camera.zoom+follow*.65,
   pitch:follow*24,
   bearing:interpolate(frame,[0,durationInFrames-1],[-5,5]),
   padding:{left:Math.round(width*.2),right:30,top:60,bottom:100}};
 },[frame,width,durationInFrames,introFrames,outroFrames,sampled]);
 const sources=useMemo(()=>({
  'mapstory-data':fc(sampled.visible),
  'mapstory-trail':sampled.trail.length>1?fc([{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:sampled.trail}}]):empty,
  'mapstory-focus':sampled.focus?fc([{type:'Feature',properties:{radius:9+Math.sin(frame/fps*Math.PI*2)*2},geometry:{type:'Point',coordinates:sampled.focus}}]):empty,
 }),[sampled,frame,fps]);
 const project=useMemo(()=>sampled.focus?{focus:sampled.focus}:{},[sampled]);
 const titleEnter=spring({frame,fps,config:{damping:200}});
 const timeLabel=sampled.time===null?'空间总览':config.timeFormat==='iso8601'
  ? new Date(sampled.time).toISOString().slice(0,19).replace('T',' ')+' UTC'
  : `${Number(sampled.time.toFixed(2)).toLocaleString('en-US')} · ${config.timeLabel}`;
 const metric=config.valueField
  ? sampled.observed?.properties?.[config.valueField]??'—' : sampled.visible.length;
 return <AbsoluteFill style={{background:'#09151e',color:'#f4f7ef',fontFamily:'Arial,"PingFang SC",sans-serif'}}>
  <MapStage style={baseStyle} camera={camera} sources={sources} layers={layers} project={project}>
   {({points,ready})=>ready&&points.focus?<svg width={width} height={height} style={{position:'absolute',inset:0,pointerEvents:'none'}}>
    <path d={`M${points.focus.x+15} ${points.focus.y}h32`} stroke={ACCENT}/>
    <text x={points.focus.x+52} y={points.focus.y+4} fill={ACCENT} fontSize="12">{config.mode==='track'?'插值位置':'最新事件'}</text>
   </svg>:null}
  </MapStage>
  <AbsoluteFill style={{pointerEvents:'none',background:'linear-gradient(90deg,rgba(5,13,22,.95),rgba(5,13,22,.55) 30%,transparent 62%),linear-gradient(0deg,rgba(5,13,22,.9),transparent 35%)'}}/>
  <div style={{position:'absolute',left:48,top:36,fontSize:11,letterSpacing:3,color:'#9fb7bd'}}>GEO DATA VIZ / MAP STORY</div>
  <div style={{position:'absolute',left:48,top:height*.19,width:width*.3,opacity:titleEnter,transform:`translateY(${(1-titleEnter)*18}px)`}}>
   <div style={{fontSize:12,color:ACCENT,letterSpacing:2,marginBottom:18}}>{{overview:'空间总览',track:'观测轨迹',events:'事件回放'}[config.mode]}</div>
   <h1 style={{fontSize:Math.max(28,width*.035),lineHeight:1.25,margin:'0 0 28px',fontWeight:600}}>{config.title}</h1>
   <div style={{fontSize:Math.max(34,width*.041),lineHeight:1.1,fontVariantNumeric:'tabular-nums'}}>{typeof metric==='number'?metric.toLocaleString('en-US'):String(metric)}</div>
   <div style={{fontSize:12,lineHeight:1.7,color:'#a7bdc5',marginTop:12}}>{config.valueField?config.valueLabel:config.mode==='overview'?'源要素总数':'当前已出现记录'}<br/>{config.valueField?'指标取最近一次真实记录':''}</div>
  </div>
  <div style={{position:'absolute',right:48,top:height*.13,textAlign:'right',fontSize:18,color:ACCENT,fontVariantNumeric:'tabular-nums'}}>{timeLabel}</div>
  {outroFrames>0&&<Sequence from={durationInFrames-outroFrames} durationInFrames={outroFrames}><ClosingCard count={records.length}/></Sequence>}
  <div style={{position:'absolute',left:48,right:48,bottom:76,height:2,background:'#ffffff24'}}><div style={{width:`${sampled.progress*100}%`,height:'100%',background:ACCENT}}/></div>
  <div style={{position:'absolute',left:48,right:48,bottom:45,display:'flex',justifyContent:'space-between',gap:24,fontSize:10,color:'#91a9b4'}}>
   <span>{config.mode==='track'?'位置按源时间插值；点间连线不表示规划道路。':config.mode==='events'?'事件按源时间出现；圆圈不表示影响范围。':'全部源要素；颜色与点大小未绑定业务指标。'}</span>
   <span>{sampled.visible.length.toLocaleString('en-US')} / {records.length.toLocaleString('en-US')}</span>
  </div>
  <div style={{position:'absolute',left:48,right:48,bottom:20,fontSize:9,color:'#78919b',display:'flex',justifyContent:'space-between',gap:20}}><span>{config.attribution}</span><span style={{textAlign:'right'}}>{config.backgroundAttribution}</span></div>
 </AbsoluteFill>;
}
