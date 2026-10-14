// Local Alpine demo: one native map, bounded camera preflight, no duplicate WebGL scene.
const mountainLandscapeStyle={version:8,
 glyphs:'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
 sources:{},layers:[{id:'landscape-background',type:'background',paint:{'background-color':'#182a36'}}]};
let mountainPreview=true,mountainActivation,mountainWarmSize='',mountainCancelled=false;
function mountainSize(){const canvas=window.sceneTarget.map.getCanvas();return `${canvas.width}x${canvas.height}`;}
function requireMountainVisible(){if(mountainCancelled||document.hidden)throw new Error('飞越准备已暂停，再次点击播放即可继续。');}
async function warmMountainCameraPath(){
 const target=window.sceneTarget,map=target.map,size=mountainSize();
 if(mountainWarmSize===size)return;
 const release=target.frameGuard?.hold(),started=performance.now(),deadline=started+60000;
 const handlers=['dragPan','dragRotate','scrollZoom','boxZoom','doubleClickZoom','touchZoomRotate','touchPitch','keyboard']
  .map(key=>map[key]).filter(handler=>handler?.isEnabled());
 handlers.forEach(handler=>handler.disable());
 document.body.dataset.mountainPhase='warming';
 let succeeded=false;
 try{
  // Three seconds samples endpoints and mid-chapter views, not every video frame.
  const times=Array.from({length:9},(_,index)=>index*3);
  for(let index=0;index<times.length;index++){
   requireMountainVisible();
   const timeout=Math.min(15000,deadline-performance.now());
   if(timeout<=0)throw new Error('飞越资源加载超时，请再次点击播放重试。');
   $('status').textContent=`准备飞越 ${Math.round(index/times.length*100)}%`;
   await waitForSceneMapFrame(map,()=>map.jumpTo(sampleScene(data,times[index]).camera),timeout,{stage:'mountain camera preflight'});
  }
  requireMountainVisible();
  mountainWarmSize=size;succeeded=true;
  document.body.dataset.mountainWarmupMs=String(Math.round(performance.now()-started));
  document.body.dataset.mountainWarmSamples=String(times.length);
 }finally{
  // Preflight never changes scene time, chapters or business data. Restore the
  // paused overview before uncovering the same map, including failed retries.
  try{await waitForSceneMapFrame(map,()=>map.jumpTo(mountainPreview?mountainPreviewCamera:sampleScene(data,viz.time).camera),15000,{stage:'restore mountain view'});release?.();}
  catch{release?.(false);}
  handlers.forEach(handler=>handler.enable());
  document.body.dataset.mountainPhase=succeeded?'prepared':'overview';
 }
}
async function activateMountainScene(){
 if(!mountainPreview)return;
 if(!mountainActivation)mountainActivation=(async()=>{
  await warmMountainCameraPath();
  requireMountainVisible();
  await viz.setData(data);mountainPreview=false;
 })().catch(error=>{mountainActivation=null;throw error;});
 return mountainActivation;
}
async function startMountainPlayback(){
 if($('play').disabled)return;
 mountainCancelled=false;
 $('play').disabled=true;$('progress').disabled=true;
 try{await activateMountainScene();requireMountainVisible();$('status').textContent='';document.body.dataset.mountainPhase='playing';viz.play();}
 catch(error){$('status').textContent=error.message;}
 finally{$('play').disabled=false;$('progress').disabled=false;}
}
async function seekMountain(time){
 mountainCancelled=false;viz.pause();$('play').disabled=true;$('progress').disabled=true;
 try{await activateMountainScene();await viz.seek(time);$('status').textContent='';document.body.dataset.mountainPhase='paused';}
 catch(error){$('status').textContent=error.message;}
 finally{$('play').disabled=false;$('progress').disabled=false;}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)mountainCancelled=true;});
window.addEventListener('pagehide',()=>{mountainCancelled=true;},{once:true});
