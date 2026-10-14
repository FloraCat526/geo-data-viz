import {createProvider as createMapProvider,getProviderCrs as getMapCrs} from '../../assets/adapters/providers.mjs';
import {createPreview} from './preview.mjs';
import {transformCoordinate} from '../../assets/adapters/coords.mjs';
import {prepare,coordinates,mapGeometry,roleValue,number,valueDomain,visual,fitCamera} from './core.mjs';
const $=id=>document.getElementById(id), stage=$('stage'), canvas=$('overlay'),ctx=canvas.getContext('2d');
const names={preview:'效果预览',google:'Google Maps',mapbox:'Mapbox',maptec:'Maptec',baidu:'百度地图',amap:'高德地图',tencent:'腾讯地图'};
let data,adapter,active='preview',mapElement,unsubscribe,projected=[],converted=[],generation=0,dirty=true,lastDraw=0,paused=matchMedia('(prefers-reduced-motion: reduce)').matches,selected=null;
let dataGeneration=0,analysisController,sourceFile=null,currentProfile=null,analysisAvailable=false,localSource=null;
let valueField='',categoryField='',timeField='',domain={min:0,max:0,maxAbs:0,count:0};
const configs=new Map();
let defaultProvider='preview';
function status(message='',error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function showConfig(){
  const name=$('provider').value;
  $('connect').hidden=true;
  $('map-config').hidden=name==='preview';
  $('map-config').open=name!=='preview'&&!configs.has(name);
  $('amap-fields').hidden=name!=='amap';
  $('maptec-fields').hidden=name!=='maptec';
  // Do not echo saved credentials into input fields.
  $('map-key').value='';$('security-code').value='';
}
$('config-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('provider').value,key=$('map-key').value.trim();
  if(name==='preview'||!key)return;
  if(name==='mapbox'&&!key.startsWith('pk.')){status('请使用 Mapbox 浏览器 public Token（pk.），不要填写 secret Token。',true);return;}
  const config={key};
  if(name==='amap'){
    config.showOversea=$('overseas').checked;
    const serviceHost=$('security-host').value.trim(),code=$('security-code').value.trim();
    if(serviceHost)config.securityServiceHost=serviceHost;
    else if(code)config.securityJsCode=code;
    else{status('请填写高德安全 JS Code 或安全代理地址。',true);return;}
  }
  if(name==='maptec'){
    config.sdkUrl=$('sdk-url').value.trim();config.cssUrl=$('css-url').value.trim();config.dataCrs=$('maptec-crs').value;
    if(!config.sdkUrl||!config.cssUrl||!config.dataCrs){status('请提供 Maptec SDK、CSS 与服务坐标系。',true);return;}
  }
  configs.set(name,config);$('map-key').value='';$('security-code').value='';$('map-config').open=false;void connect();
});
function sourceCrs(){return $('crs').value;}
const getProviderCrs=(name,config)=>name==='preview'?safeCrs():getMapCrs(name,config);
const createProvider=(name,element,config,camera)=>name==='preview'?Promise.resolve(createPreview(element,camera,safeCrs())):createMapProvider(name,element,config,camera);
function safeCrs(){return sourceCrs()==='unknown'?'wgs84':sourceCrs();}
function currentCamera(targetCrs){
  if(adapter){const view=adapter.getView();return {...view,center:transformCoordinate(view.center,adapter.dataCrs,targetCrs)};}
  const view=fitCamera(data.features,stage.clientWidth,stage.clientHeight);
  return {...view,center:transformCoordinate(view.center,safeCrs(),targetCrs)};
}
async function connect(){
  if(!data) return;
  const name=$('provider').value,config=configs.get(name)??{};
  if(name!=='preview'&&!configs.has(name)){status('请在连接地图中填写自己的浏览器 Key。');return;}
  if(name!=='preview'&&sourceCrs()==='unknown'){status('请先确认数据坐标系，再连接真实底图。',true);return;}
  let crs,camera;
  try{crs=getProviderCrs(name,config);camera=currentCamera(crs);}catch(e){status(e.message,true);return;}
  const ticket=++generation,dataTicket=dataGeneration;
  const element=document.createElement('div');element.className='map-instance';element.style.opacity='0';element.style.pointerEvents='none';$('maps').append(element);
  $('connect').disabled=true;status('正在连接 '+names[name]+'…');
  try{
    const next=await createProvider(name,element,config,camera);
    if(ticket!==generation||dataTicket!==dataGeneration||name!==$('provider').value){next.destroy();element.remove();return;}
    const previous=adapter;
    unsubscribe?.();adapter=next;active=name;mapElement?.remove();mapElement=element;
    element.style.opacity='1';element.style.pointerEvents='auto';previous?.destroy();
    unsubscribe=adapter.onChange(()=>{dirty=true;});rebuild();
    $('active-provider').textContent=names[name];
    $('connect').hidden=true;
    status();
  }catch(e){element.remove();if(ticket===generation){status(e.message||'地图连接失败，请检查配置与域名限制。',true);$('connect').hidden=false;}}
  finally{if(ticket===generation)$('connect').disabled=false;}
}
function opts(id,fields,initial){
  const el=$(id);el.replaceChildren();
  for(const [value,label] of fields){const opt=document.createElement('option');opt.value=value;opt.textContent=label;el.append(opt);}
  el.value=initial;
}
function setupFields(){
  const fields=[...new Set(data.features.flatMap(f=>Object.keys(f.properties)))].filter(x=>x!=='__viz');
  const roles=data.metadata.roles??{};
  const candidates=currentProfile?.roleCandidates?.value;
  const numeric=fields.filter(k=>k===roles.value||(Array.isArray(candidates)?candidates.includes(k):data.features.some(f=>number(f.properties[k])!==null)));
  valueField=fields.includes(roles.value)?roles.value:'';
  categoryField=fields.includes(roles.category)?roles.category:'';
  timeField=fields.includes(roles.time)?roles.time:'';
  opts('value-field',[['','等大点（请按业务含义选择指标）'],...numeric.map(k=>[k,k])],valueField);
  opts('category-field',[['','不使用分类'],...fields.map(k=>[k,k])],categoryField);
  opts('time-field',[['','不使用时间'],...fields.map(k=>[k,k])],timeField);
  refreshFilters();
}
function refreshFilters(){
  for(const [role,field,id,label] of [['category',categoryField,'category-filter','全部分类'],['time',timeField,'time-filter','全部时间']]){
    const entries=[...new Set(data.features.map(f=>roleValue(f,role,field)).filter(x=>x!==null).map(String))].sort();
    opts(id,[['',label],...entries.map(x=>[x,x])],'');
  }
  domain=valueDomain(data.features,valueField);rebuild();
}
function selectedFeatures(){return data.features.filter(f=>(!$('category-filter').value||String(roleValue(f,'category',categoryField))===$('category-filter').value)&&(!$('time-filter').value||String(roleValue(f,'time',timeField))===$('time-filter').value));}
function rebuild(){
  if(!data)return;
  const features=selectedFeatures();$('visible-count').textContent=features.length.toLocaleString();
  if(adapter){converted=(sourceCrs()==='unknown'&&active!=='preview')?[]:features.map(f=>({...f,geometry:mapGeometry(f.geometry,p=>transformCoordinate(p,safeCrs(),adapter.dataCrs))}));}
  updateLegend();dirty=true;
  if(selected&&!features.some(f=>f.id===selected)){$('detail').hidden=true;}
  else if(selected){const f=data.features.find(f=>f.id===selected);if(f)showDetail(f);}
  const source=data.metadata?.source;
  $('footnote').textContent=(source?.synthetic?'合成演示数据 · 非真实观测 ｜ ':'')+(sourceCrs()==='unknown'?'源坐标系未知 · 仅检查效果':`${sourceCrs().toUpperCase()} 源坐标保留`)+(adapter&&sourceCrs()!==adapter.dataCrs&&sourceCrs()!=='unknown'?' · 跨系转换为近似显示':'');
}
function updateLegend(){
  const el=$('legend');el.replaceChildren();
  const ramp=document.createElement('div');ramp.className='ramp';if(domain.min<0)ramp.style.background='linear-gradient(90deg,#6caaff,#ffae61)';el.append(ramp);
  const range=document.createElement('div');
  range.textContent=domain.count?`${domain.min.toLocaleString()} — ${domain.max.toLocaleString()}`:'—';el.append(range);
}
function projectData(){projected=converted.map(f=>({...f,geometry:mapGeometry(f.geometry,p=>{const q=adapter.project(p);return [q.x,q.y];})}));}
function draw(now){
  const width=stage.clientWidth,height=stage.clientHeight;
  ctx.clearRect(0,0,width,height);
  const mode=$('effect').value,scale=Number($('scale').value),animated=mode==='pulse'&&!paused;
  const order=[...projected].sort((a,b)=>Math.abs(number(roleValue(b,'value',valueField))??0)-Math.abs(number(roleValue(a,'value',valueField))??0));
  for(const f of order){
    const v=valueField?roleValue(f,'value',valueField):1;
    const style=visual(v,valueField?domain:{maxAbs:1,min:0},mode,scale),color=style.color;
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.5;
    const type=f.geometry.type,c=f.geometry.coordinates;
    function point(p){
      const [x,y]=p,r=valueField?style.radius:6*scale;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x < -100||y < -100||x>width+100||y>height+100)return;
      if(mode==='pulse'){
        const phase=(String(f.id).split('').reduce((a,c)=>a+c.charCodeAt(0),0)%29)/29;
        const t=animated?((now/2200+phase)%1):.45;
        ctx.globalAlpha=(1-t)*.6;ctx.beginPath();ctx.arc(x,y,r+18*t*scale,0,Math.PI*2);ctx.lineWidth=2;ctx.stroke();
        ctx.shadowColor=color;ctx.shadowBlur=12*scale;ctx.globalAlpha=.9;ctx.beginPath();ctx.arc(x,y,3*scale,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
      }else{ctx.globalAlpha=.65;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.globalAlpha=.9;ctx.lineWidth=.7;ctx.stroke();}
      if(selected===f.id){ctx.globalAlpha=1;ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r+5,0,Math.PI*2);ctx.stroke();ctx.strokeStyle=color;}
    }
    function path(line){line.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));}
    if(type==='Point')point(c);else if(type==='MultiPoint')c.forEach(point);
    else if(type==='LineString'||type==='MultiLineString'){
      ctx.globalAlpha=.8;ctx.lineWidth=Math.max(1,style.radius/4);ctx.beginPath();(type==='LineString'?[c]:c).forEach(path);ctx.stroke();
    }else{
      for(const poly of (type==='Polygon'?[c]:c)){ctx.beginPath();for(const ring of poly){path(ring);ctx.closePath();}ctx.globalAlpha=.25;ctx.fill('evenodd');ctx.globalAlpha=.8;ctx.stroke();}
    }
  }
  ctx.globalAlpha=1;
}
let raf;
function tick(now){
  if(adapter&&!document.hidden&&(dirty||($('effect').value==='pulse'&&!paused))&&now-lastDraw>=33){
    try{if(dirty)projectData();draw(now);dirty=false;}catch{status('投影或渲染失败，请检查 SDK 版本、坐标系和数据。',true);paused=true;}
    lastDraw=now;
  }
  raf=requestAnimationFrame(tick);
}
function showDetail(feature){
  selected=feature.id;const p=feature.properties;
  const peers=feature.geometry.type==='Point'?selectedFeatures().filter(f=>f.geometry.type==='Point'&&f.geometry.coordinates[0]===feature.geometry.coordinates[0]&&f.geometry.coordinates[1]===feature.geometry.coordinates[1]):[];
  const suffix=peers.length>1?` · 同位置 ${peers.findIndex(f=>f.id===feature.id)+1}/${peers.length}（再点切换）`:'';
  $('detail-title').textContent=String(p.__viz?.label??p.name??p.名称??feature.id)+suffix;$('detail-body').textContent=JSON.stringify(p,null,2);$('detail').hidden=false;dirty=true;
}
let down;
stage.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});
stage.addEventListener('pointerup',e=>{
  if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5||e.target.closest('button,select,input,.detail,.legend'))return;
  const rect=stage.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;const hits=[];
  for(const f of projected){if(!['Point','MultiPoint'].includes(f.geometry.type))continue;
    const size=visual(roleValue(f,'value',valueField),domain,$('effect').value,Number($('scale').value)).radius;
    const d=Math.min(...coordinates(f.geometry).map(p=>Math.hypot(p[0]-x,p[1]-y)));
    if(d<=Math.max(size,10))hits.push({f,d});
  }
  hits.sort((a,b)=>a.d-b.d);
  if(hits.length){const peers=hits.filter(h=>Math.abs(h.d-hits[0].d)<.01).map(h=>h.f);const next=peers[(peers.findIndex(f=>f.id===selected)+1)%peers.length];showDetail(data.features.find(f=>f.id===next.id));}
});
function resize(){const dpr=Math.min(2,devicePixelRatio||1);canvas.width=Math.round(stage.clientWidth*dpr);canvas.height=Math.round(stage.clientHeight*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);dirty=true;}
const observer=new ResizeObserver(resize);observer.observe(stage);
const warningLabels={
  numeric_value_unbound:'发现数值列，尚未绑定业务指标。请在字段映射或“显示指标”中选择。',
  unknown_crs:'经纬度范围无法区分 WGS84、GCJ02、BD09，需按来源确认坐标系。',
  non_rfc7946_crs:'源 GeoJSON 声明了非 WGS84 或未识别的坐标系，原始坐标已保留。',
  crs_override:'按你的选择更新坐标系声明，未改写原始坐标。',
  nonfinite_properties:'无穷大或非有限属性已规范化为空值。',
  zero_zero:'保留了 (0,0) 位置，请核实是否为有效位置或缺失占位。',
  mercator_latitude_limit:'包含极地坐标，Web Mercator 地图可能裁切。',
  antimeridian:'数据跨越日界线，展示采用经度环绕适配。',
  metric_gaps:'部分指标缺失或无效，保留为空值并显示为灰色。',
  signed_metric:'指标包含负值，颜色区分正负，面积按绝对值。',
  time_gaps:'部分时间无法解析或缺失，请检查时间格式及单位。',
  polygon_validation_scope:'已检查面环结构与坐标；未认证自相交等拓扑正确性。',
  empty_dataset:'文件中没有数据记录。',
};
function showAnalysis(profile,local=false){
  const counts=profile?.counts??{validFeatures:data?.features.length??0,invalidRecords:0};
  $('invalid-count').textContent=(counts.invalidRecords??0).toLocaleString();
  const state=profile?.status??'ready';
  const labels={ready:'分析完成',needs_crs:'待确认数据坐标系',needs_coordinates:'待选择有效经纬度列',needs_geocoding:'仅有地址，需要 Skill 补充地理编码'};
  const summary=local?'GeoJSON 浏览器校验完成；完整数据分析请在 Agent 中使用 Skill。':`${labels[state]??state} · 输入 ${counts.inputRecords??counts.validFeatures??0} 条`;
  $('analysis-summary').textContent=summary+(counts.duplicatePointLocations?` · 同位置记录 ${counts.duplicatePointLocations} 条已保留`:'');
  $('analysis-summary').classList.toggle('pending',state!=='ready');
  const warnings=profile?.warnings??[];
  $('warnings').replaceChildren();
  for(const warning of warnings){const li=document.createElement('li');li.textContent=warningLabels[String(warning).split(':')[0]]??String(warning);$('warnings').append(li);}
  const invalid=profile?.invalidRows??[];
  const reasons={
    'longitude/latitude fields unavailable or ambiguous':'经纬度列缺失或存在多个候选，请明确映射',
    'record must be an object':'记录必须为对象',
    'properties must be an object or null':'属性必须为对象或空值',
    'lng: missing':'经度缺失','lat: missing':'纬度缺失',
    'lng: not a finite number':'经度不是有效数字','lat: not a finite number':'纬度不是有效数字',
  };
  $('invalid-rows').textContent=invalid.slice(0,12).map(row=>`第 ${row.row} 条：${(row.reasons??[]).map(reason=>reasons[reason]??reason).join('；')}`).join('\n')+(invalid.length>12?`\n另有 ${invalid.length-12} 条，完整结果可由 Skill 分析查看。`:'');
  $('quality-panel').hidden=!warnings.length&&!invalid.length;
  $('quality-panel').open=invalid.length>0;
  $('mapping-panel').hidden=!sourceFile||!analysisAvailable;
  if(sourceFile&&analysisAvailable){
    const fields=Object.keys(profile?.fields??{}).filter(k=>k!=='__viz');
    for(const role of ['lng','lat','label','value','category','time']){
      const entries=role==='value'?fields.filter(k=>k===profile?.roles?.value||(Array.isArray(profile?.roleCandidates?.value)?profile.roleCandidates.value.includes(k):(profile.fields[k].numeric??0)>0)):fields;
      opts('map-'+role,[['',role==='value'?'暂不绑定指标':'自动识别'],...entries.map(k=>[k,k])],profile?.roles?.[role]??'');
    }
    const sheets=profile?.source?.availableSheets??[];
    $('sheet-label').hidden=!sheets.length;
    opts('sheet',sheets.map(name=>[name,name]),profile?.source?.sheet??'');
    if(state==='needs_coordinates')$('mapping-panel').open=true;
  }
}
function invalidatePending(){++generation;$('connect').disabled=false;$('reanalyze').disabled=false;$('crs').disabled=false;analysisController?.abort();}
async function loadData(input,name,profile=null,{local=false,ticket=dataGeneration}={}){
  if(ticket!==dataGeneration)return;
  const next=input?.features?.length?prepare(input):{type:'FeatureCollection',features:[],metadata:input?.metadata??{dataCrs:'unknown'},vertexCount:0};
  data=next;currentProfile=profile;selected=null;projected=[];converted=[];
  $('detail').hidden=true;$('dataset-name').textContent=name;$('feature-count').textContent=data.features.length.toLocaleString();$('crs').value=data.metadata.dataCrs;
  if(!['wgs84','gcj02','bd09','unknown'].includes($('crs').value))$('crs').value='unknown';
  if(sourceCrs()==='unknown'||!data.features.length){$('provider').value='preview';showConfig();}
  setupFields();showAnalysis(profile,local);await connect();if(ticket===dataGeneration)fit();
  if(ticket===dataGeneration&&!data.features.length)status('没有可展示的有效要素。请查看分析提示、选择经纬度列后重新分析。',true);
}
function fit(){if(!adapter||!data?.features.length)return;const view=fitCamera(data.features,stage.clientWidth,stage.clientHeight);adapter.setView({...view,center:transformCoordinate(view.center,safeCrs(),adapter.dataCrs)});dirty=true;}
function mappingOptions(){
  const fields={};for(const role of ['lng','lat','value','label','category','time']){const value=$('map-'+role).value;if(value)fields[role]=value;}
  return {crs:sourceCrs(),fields,...($('sheet').value?{sheet:$('sheet').value}:{})};
}
async function analyzeFile(file,options={},isNew=false){
  const ticket=++dataGeneration;invalidatePending();
  sourceFile=file;analysisAvailable=false;currentProfile=null;localSource=null;
  data={type:'FeatureCollection',features:[],metadata:{dataCrs:'unknown'}};projected=[];converted=[];selected=null;
  $('detail').hidden=true;$('feature-count').textContent='0';$('invalid-count').textContent='—';$('dataset-name').textContent=file.name;
  $('provider').value='preview';showConfig();await connect();
  status('正在浏览器中校验 GeoJSON…');
  try{
    if(file.size>30*1024*1024)throw Error('文件超过 30MB，请先用 Skill 聚合。');
    const parsed=JSON.parse(await file.text());
    if(ticket!==dataGeneration)return;
    localSource=parsed;
    const prepared=prepare(parsed);if(options.crs)prepared.metadata.dataCrs=options.crs;
    await loadData(prepared,file.name,null,{local:true,ticket});
  }catch(error){if(ticket===dataGeneration){status(error instanceof SyntaxError?'请选择有效的 GeoJSON 文件。':error.message,true);$('analysis-summary').textContent='导入未完成，请修正提示后重试。';}}
}
async function resetData(){
  const ticket=++dataGeneration;invalidatePending();sourceFile=null;localSource=null;analysisAvailable=false;$('file').value='';$('provider').value=defaultProvider;showConfig();
  try{const response=await fetch('./data.geojson');if(!response.ok)throw Error('无法读取 data.geojson，请用 HTTP 服务启动页面。');const input=await response.json();if(ticket!==dataGeneration)return;await loadData(input,'',{status:'ready',counts:{inputRecords:input.features.length,validFeatures:input.features.length,invalidRecords:0},warnings:[]},{ticket});}
  catch(error){if(ticket===dataGeneration)status(error.message,true);}
}
$('file').addEventListener('change',e=>{const file=e.target.files[0];if(file)analyzeFile(file,{},true);});
$('reset-data').addEventListener('click',resetData);
$('reanalyze').addEventListener('click',()=>{if(sourceFile)analyzeFile(sourceFile,mappingOptions());});
$('sheet').addEventListener('change',()=>{if(sourceFile)analyzeFile(sourceFile,{crs:sourceCrs(),sheet:$('sheet').value});});
$('provider').addEventListener('change',()=>{++generation;$('connect').disabled=false;showConfig();void connect();});$('connect').addEventListener('click',connect);
$('crs').addEventListener('change',async()=>{
  if(sourceFile&&analysisAvailable){await analyzeFile(sourceFile,mappingOptions());return;}
  if(!data)return;
  ++dataGeneration;invalidatePending();data.metadata.dataCrs=sourceCrs();
  if(sourceCrs()==='unknown'){$('provider').value='preview';showConfig();}
  await connect();rebuild();fit();
});
$('value-field').addEventListener('change',()=>{valueField=$('value-field').value;domain=valueDomain(data.features,valueField);rebuild();});
$('category-field').addEventListener('change',()=>{categoryField=$('category-field').value;refreshFilters();});
$('time-field').addEventListener('change',()=>{timeField=$('time-field').value;refreshFilters();});
for(const id of ['effect','category-filter','time-filter'])$(id).addEventListener('change',rebuild);
$('scale').addEventListener('input',()=>{$('scale-label').textContent=Number($('scale').value).toFixed(1)+'×';dirty=true;});
function pauseLabel(){$('pause').textContent=paused?'播放动画':'暂停动画';}
$('pause').addEventListener('click',()=>{paused=!paused;pauseLabel();dirty=true;});pauseLabel();
$('fit').addEventListener('click',fit);$('close-detail').addEventListener('click',()=>{selected=null;$('detail').hidden=true;dirty=true;});
$('export').addEventListener('click',()=>{if(!data)return;const {vertexCount,...output}=data;const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/geo+json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='geographic-data.geojson';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
document.addEventListener('visibilitychange',()=>{dirty=true;});
window.addEventListener('pagehide',()=>{++dataGeneration;analysisController?.abort();++generation;cancelAnimationFrame(raf);observer.disconnect();unsubscribe?.();adapter?.destroy();configs.clear();$('map-key').value='';$('security-code').value='';});
showConfig();resize();raf=requestAnimationFrame(tick);
try{await resetData();}catch(error){status(error.message,true);}
