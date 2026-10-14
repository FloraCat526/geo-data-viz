// Theme changes keep the map instance and business state; only basemap/style change.
export function createThemeController(map,{styles,initial='dark',applyTheme,isReady=()=>true,onState=()=>{},timeoutMs=20000}={}){
 let current=initial,busy=false,disposed=false,cancelWait;
 const waitReady=start=>new Promise((resolve,reject)=>{
  const events=['style.load','styledata','sourcedata','idle'];let timer,finished=false;
  const finish=error=>{if(finished)return;finished=true;clearTimeout(timer);for(const event of events)map.off(event,check);cancelWait=null;error?reject(error):resolve();};
  const check=()=>{if(disposed)return finish(Error('Disposed'));if(map.isStyleLoaded() && isReady())finish();};
  cancelWait=()=>finish(Error('Disposed'));for(const event of events)map.on(event,check);
  timer=setTimeout(()=>finish(Error('Map theme did not become ready')),timeoutMs);
  try{start?.();check();}catch{finish(Error('Map theme could not load'));}
 });
 const load=theme=>waitReady(()=>map.setStyle(styles[theme],{diff:false}));
 return {
  get current(){return current;},get busy(){return busy;},
  async change(next){
   if(disposed || busy || next===current)return false;
   if(!['dark','light'].includes(next) || !styles[next])throw Error('Unsupported theme');
   busy=true;onState('loading',current);const previous=current;
   try{
    await load(next);if(disposed)return false;
    await waitReady(()=>applyTheme(next));
    current=next;onState('ready',current);return true;
   }catch{
    if(disposed)return false;
    try{await load(previous);await waitReady(()=>applyTheme(previous));onState('restored',previous);}
    catch{if(!disposed)onState('unavailable',previous);}
    throw Error('Theme switch failed; check basemap connectivity.');
   }finally{busy=false;}
  },
  destroy(){disposed=true;cancelWait?.();}
 };
}
