"""Standalone GL page. Values and uploaded strings are inserted as safe JSON/text."""
TEMPLATE = r'''<!doctype html>
<html lang="zh-CN" data-theme="__THEME__" data-layout="__LAYOUT__"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title><style>
:root{color-scheme:dark;--bg:#080f1d;--surface:rgba(13,23,41,.96);--text:#edf4ff;--muted:#b1c0d5;--subtle:#91a4be;--border:#2c405b;--input:#172b45;--accent:#67e8f9;--shadow:0 12px 42px #0005;--error:#fda4af}
:root[data-theme="light"]{color-scheme:light;--bg:#f3f6fa;--surface:rgba(255,255,255,.97);--text:#172b46;--muted:#475569;--subtle:#52647d;--border:#d3dce8;--input:#f1f5f9;--accent:#0369a1;--shadow:0 10px 32px #1e3a5f18;--error:#b91c1c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 system-ui,sans-serif}#map{position:fixed;inset:0}
.panel{position:absolute;z-index:2;top:20px;left:20px;width:min(360px,calc(100% - 40px));background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:20px;box-shadow:var(--shadow);max-height:calc(100dvh - 80px);overflow:auto;backdrop-filter:blur(16px);scrollbar-width:thin;scrollbar-color:var(--border) transparent;overflow-wrap:anywhere}
h1{padding-right:42px;text-wrap:balance;font-size:24px;font-weight:700;letter-spacing:-.03em;margin:0 0 10px;line-height:1.25}p{margin:8px 0;color:var(--muted)}small,.muted{color:var(--subtle);font-size:12px}.eyebrow{color:var(--accent);font-size:10px;letter-spacing:.14em;margin-bottom:8px}
button,input,select{font:inherit}button,select,input{background:var(--input);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:8px 10px;min-height:38px;max-width:100%;min-width:0}button{cursor:pointer}button:disabled,select:disabled,input:disabled{cursor:wait;opacity:.6}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
#tools>summary{cursor:pointer;font-size:12px;color:var(--muted)}#tools{margin-top:12px}#controls{display:flex;flex-wrap:wrap;gap:7px;margin:12px 0}#controls input[type=search]{width:100%}.dates{display:flex;gap:8px;width:100%}.dates label{display:flex;flex:1;flex-direction:column;font-size:11px;color:var(--muted)}.dates input{width:100%;font-size:12px}
#status{font-size:12px;color:var(--accent);margin:8px 0}#status[data-state=rendered]{display:none}#status[data-state=error]{color:var(--error)}
#stats{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:16px 0}.stat{background:var(--input);padding:12px;border-radius:10px}.stat strong{font-size:23px;display:block;line-height:1.2;font-variant-numeric:tabular-nums;font-weight:650}.stat span{display:block;font-size:11px;color:var(--muted);margin-top:5px}.stat.wide{grid-column:1/-1}
#map-legend{position:absolute;z-index:2;right:20px;bottom:46px;width:260px;max-height:45dvh;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:12px 16px;box-shadow:var(--shadow);font-size:12px}#map-legend>summary{cursor:pointer;color:var(--muted)}#legend{font-size:12px;border-top:1px solid var(--border);padding-top:12px;margin-top:14px}.legend-title{font-size:11px;color:var(--muted);margin:8px 0}.legend-row{display:flex;align-items:center;gap:8px;margin:4px 0}.swatch{display:inline-block;width:12px;height:12px;border-radius:3px;flex-shrink:0}.gradient{height:10px;border-radius:6px;margin:8px 0}.ticks.numeric{position:relative;height:20px}.ticks.numeric span{position:absolute;white-space:nowrap}.ticks{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:11px}.bubbles{display:flex;align-items:flex-end;justify-content:space-around;gap:8px;padding:10px 0}.bubble-sample{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:var(--muted)}.bubble-mark{display:block;border:1px solid var(--text);background:var(--accent);opacity:.6;border-radius:50%}
#details{border-top:1px solid var(--border);margin-top:14px;padding-top:12px}#details h2{font-size:17px;margin:6px 0}.record{padding:8px 0;border-bottom:1px solid var(--border)}dl{display:grid;grid-template-columns:minmax(60px,1fr) 2fr;gap:5px 12px;margin:10px 0;font-size:12px}dt{color:var(--muted)}dd{margin:0;white-space:pre-wrap}
.results{border-top:1px solid var(--border);padding-top:10px;margin-top:12px}.results summary{cursor:pointer;font-size:12px;color:var(--muted)}#records{max-height:200px;overflow:auto}.record-link{display:block;width:100%;text-align:left;border:0;border-radius:0;background:transparent;border-bottom:1px solid var(--border);font-size:12px}#more{margin-top:8px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:14px;border-top:1px solid var(--border);padding-top:10px}.theme-options{display:flex;gap:3px}.theme-options button{padding:5px 8px;min-height:32px;font-size:11px;background:transparent;border-color:transparent;color:var(--muted)}.theme-options button[aria-pressed=true]{color:var(--accent);background:var(--input);border-color:var(--border)}.toolbar>button{font-size:11px;padding:5px 8px;min-height:32px}#panel-toggle{position:absolute;top:14px;right:14px;font-size:11px;padding:3px 8px;min-height:28px;margin-left:10px}.panel[data-collapsed=true] #panel-body{display:none}.panel[data-collapsed=true] h1{font-size:18px;margin-bottom:0}
:root[data-layout=presentation] .panel{width:min(360px,calc(100% - 40px))}:root[data-layout=presentation] h1{font-size:30px}:root[data-layout=presentation] .stat strong{font-size:30px}
:root[data-layout=report] .panel{border-radius:4px;box-shadow:none;width:min(380px,calc(100% - 40px))}:root[data-layout=report] h1{font-size:26px}:root[data-layout=report] .stat{background:transparent;border:1px solid var(--border)}
.maplibregl-ctrl-group,.mapboxgl-ctrl-group{background:var(--surface)!important}.maplibregl-ctrl-group button+button,.mapboxgl-ctrl-group button+button{border-top-color:var(--border)!important}:root[data-theme=dark] .maplibregl-ctrl-icon,:root[data-theme=dark] .mapboxgl-ctrl-icon{filter:invert(1)}
.maplibregl-ctrl-bottom-right{right:8px;bottom:8px;z-index:5}
@media(max-width:900px){.panel{top:auto;bottom:54px;left:10px;width:calc(100% - 20px)!important;max-height:43dvh;padding:16px;border-radius:16px 16px 10px 10px}#map-legend{top:10px;left:10px;right:auto;bottom:auto;width:180px;max-height:24dvh}h1,:root[data-layout=presentation] h1,:root[data-layout=report] h1{font-size:21px}.stat strong,:root[data-layout=presentation] .stat strong{font-size:22px}.panel[data-collapsed=true]{max-height:110px}}
@media(prefers-reduced-motion:no-preference){.panel{transition:background .18s,color .18s}}
[hidden]{display:none!important}.results summary{cursor:pointer}#subtitle{font-size:12px;color:var(--subtle);margin-top:4px}#stats>.stat:only-child{grid-column:1/-1}

/* Compact result panel: typography carries the hierarchy. */
.panel{border-radius:20px;padding:22px;background:var(--surface);box-shadow:0 8px 32px #00000024;border-color:color-mix(in srgb,var(--border) 65%,transparent)}
h1{font-size:22px;line-height:1.4;font-weight:650;letter-spacing:-.035em;text-wrap:pretty;margin-bottom:6px}
#subtitle{font-size:11px;letter-spacing:.02em;line-height:1.6}
#panel-toggle{background:transparent;border-color:transparent;color:var(--subtle);top:20px;right:16px;min-height:28px}
#panel-toggle:hover{background:var(--input);color:var(--text)}
#stats{gap:0;margin:22px 0 20px;padding:0 0 18px;border-bottom:1px solid var(--border)}
.stat{background:transparent;padding:0 14px 0 0;border-radius:0}
.stat+.stat{padding-left:16px;padding-right:0;border-left:1px solid var(--border)}
.stat strong{white-space:nowrap;font-size:26px;font-weight:600;letter-spacing:-.045em;line-height:1.25}
.stat span{font-size:11px;margin-top:5px;color:var(--muted)}
#tools{margin-top:0}#tools>summary{font-size:11px;color:var(--subtle);margin-bottom:10px}
#controls{gap:8px;margin:0}#controls select{flex:1 1 100px;width:0}#controls input{flex-basis:100%}
#controls select,#controls input{font-size:12px;min-height:38px;border-radius:10px;background:color-mix(in srgb,var(--input) 65%,var(--surface));border-color:color-mix(in srgb,var(--border) 60%,transparent)}
input::placeholder{color:var(--subtle);opacity:1}#controls input:focus,#controls select:focus{border-color:var(--accent)}
#clear-filters{font-size:11px;min-height:28px;padding:3px 0;border:0;background:transparent;color:var(--accent)}
.results{margin-top:14px;padding-top:0;border-top:0}.results summary{font-size:11px;padding:6px 0;color:var(--subtle)}
.toolbar{margin-top:14px;padding-top:14px}.toolbar>button{background:transparent;border-color:transparent;color:var(--muted)}
.theme-options{padding:3px;gap:2px;background:var(--input);border-radius:9px}
.theme-options button{min-height:26px;padding:3px 12px;border:0;border-radius:6px}
.theme-options button[aria-pressed=true]{background:var(--surface);color:var(--text);box-shadow:0 1px 4px #0002}
:root[data-layout=report] .stat{border:0}:root[data-layout=report] .stat+.stat{border-left:1px solid var(--border)}
@media(max-width:900px){.panel{padding:16px}#stats{margin:14px 0;padding-bottom:12px}.stat strong{font-size:25px}.toolbar{margin-top:10px;padding-top:10px}h1{font-size:20px}}

.effect-tabs{display:flex;flex-wrap:wrap;gap:4px;width:100%;padding:4px;border-radius:12px;background:var(--input);margin-bottom:4px}
.effect-tabs button{flex:1 1 90px;min-height:34px;padding:6px 8px;border:0;border-radius:9px;background:transparent;color:var(--muted);font-size:12px;font-weight:500}
.effect-tabs button[aria-pressed=true]{background:var(--surface);color:var(--accent);box-shadow:0 2px 8px #0002}
.effect-tabs button:hover:not([aria-pressed=true]){color:var(--text);background:color-mix(in srgb,var(--surface) 45%,transparent)}
.category-picker{width:100%;border:1px solid var(--border);border-radius:11px;background:color-mix(in srgb,var(--input) 55%,var(--surface));overflow:hidden}
.category-picker>summary{padding:10px 13px;font-size:12px;cursor:pointer;color:var(--text);list-style-position:inside;min-height:40px}
.category-picker[open]>summary{border-bottom:1px solid var(--border);color:var(--accent)}
.category-menu{padding:5px;max-height:185px;overflow:auto;background:var(--surface)}
.category-option{display:flex;align-items:center;gap:9px;min-height:36px;padding:7px 9px;border-radius:7px;font-size:12px;cursor:pointer}
.category-option:hover,.category-option:has(input:checked){background:var(--input)}
#controls .category-option input{appearance:auto;flex:0 0 14px;width:14px;height:14px;min-height:0;margin:0;accent-color:var(--accent)}
.category-option:has(input:checked){color:var(--accent)}
</style></head><body><main id="map" aria-label="交互地图"></main><section class="panel" aria-label="地图分析面板"><button id="panel-toggle" aria-expanded="true" aria-controls="panel-body">收起</button><h1 id="title"></h1><div id="panel-body"><p id="subtitle" hidden></p><div id="stats" aria-live="polite"></div><details id="tools" open><summary>筛选与效果</summary><div id="controls"></div></details><p id="status" role="status">正在准备地图…</p><button id="retry" hidden>重试加载</button><div id="details" tabindex="-1" hidden></div><details class="results"><summary id="results-label">浏览记录</summary><div id="records"></div><button id="more" hidden>加载更多记录</button></details><div class="toolbar"><div id="theme-controls"></div><button id="reset" disabled>重置视野</button></div></div></section><details id="map-legend" open><summary>图例</summary><div id="legend"></div></details><output id="verification" hidden></output>
<script type="application/json" id="geo-data">__PAYLOAD__</script><script type="module">
__MODULE__
const payload=JSON.parse(document.getElementById('geo-data').textContent),runtime=payload.runtime;
const el=id=>document.getElementById(id),status=el('status');
const setStatus=(text,state)=>{status.textContent=text;status.dataset.state=state;el('retry').hidden=!['error','resource-error','auth-error','pending-map'].includes(state);};
const textNode=(tag,text,className)=>{const n=document.createElement(tag);n.textContent=text;if(className)n.className=className;return n;};
const labels={'point-color':'指标着色',points:'位置点',bubble:'数量气泡',cluster:'点聚合',heatmap:'热力',line:'路线',fill:'区域设色',extrusion:'区域拉伸'};
let map,layer,switcher,themeController,basemapController,theme=payload.appearance.theme,lastPickKind=null,showVersion=0,pickVersion=0,currentConfig=payload.configs[0],visible=payload.data.features,limit=20;
const filters={category:'',query:'',from:'',to:''};
const hasMetric=payload.data.features.some(f=>typeof f.properties.__viz.value==='number');
el('subtitle').textContent=payload.ui.subtitle || '';el('subtitle').hidden=!payload.ui.subtitle;
el('title').textContent=currentConfig.title;

function statistics(){
 const s=summarizeFeatures(visible,payload.ui.aggregation),box=el('stats');box.replaceChildren();
 function card(value,label,wide=false){const n=textNode('div','',wide?'stat wide':'stat');const number=textNode('strong',value);if(value.length>7)number.style.fontSize='20px';if(value.length>12)n.classList.add('wide');n.append(number,textNode('span',label));box.append(n);}
 card(formatMetric(s.count),s.count===payload.data.features.length?(payload.ui.recordLabel || '记录数'):`筛选结果 / 全部 ${formatMetric(payload.data.features.length)}`);
 if(hasMetric && payload.ui.aggregation==='none' && s.missing)card(formatMetric(s.missing),'指标缺失');else if(!hasMetric){const count=new Set(visible.map(f=>f.properties.__viz.category).filter(v=>v!=null)).size;if(count>1)card(formatMetric(count),'类别');}
 if(payload.ui.aggregation!=='none')card(formatMetric(s.aggregate),`${s.count===payload.data.features.length?'':'筛选后'}${payload.ui.metricLabel || (payload.ui.aggregation==='sum'?'合计':'均值')}（${currentConfig.unit || '无量纲'}）`);
 if(hasMetric && payload.ui.aggregation!=='none' && s.missing){const note=textNode('small',`${s.missing} 条指标缺失，未计入统计`);note.style.gridColumn='1/-1';box.append(note);}
 if(el('results-label'))el('results-label').textContent=`记录列表（${s.count}）`;
}
function renderRecords(){
 const box=el('records');if(!box)return;box.replaceChildren();
 for(const f of visible.slice(0,limit)){const b=textNode('button',f.properties.__viz.label || f.id,'record-link');b.onclick=()=>{pick({items:[f]});if(f.geometry.type==='Point')map.fitBounds([f.geometry.coordinates,f.geometry.coordinates],{padding:viewPadding(),maxZoom:map.getZoom(),duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:350,retainPadding:false});};box.append(b);}
 el('more').hidden=limit>=visible.length;el('more').onclick=()=>{limit+=20;renderRecords();};
}
function renderDetails(items,target){
 for(const f of items){const v=f.properties.__viz,section=textNode('section','','record');section.append(textNode('h2',v.label || f.id));const dl=document.createElement('dl');
  const pairs=[...(hasMetric?[['指标',formatMetric(v.value)+(v.value==null?'':' '+(currentConfig.unit || ''))]]:[]),...(v.category!=null?[['类别',v.category]]:[]),...(v.time?[['时间',v.time]]:[]),...(f.properties.details || []).map(d=>[d.label,d.value==null?'未提供':String(d.value)])];
  for(const [key,value] of pairs)dl.append(textNode('dt',key),textNode('dd',value));section.append(dl);target.append(section);
 }
}
async function pick(result){
 lastPickKind=result.kind==='cluster'?'cluster':'items';const version=++pickVersion,target=el('details');target.hidden=false;target.replaceChildren();
 if(result.kind!=='cluster'){layer.setSelected(result.items.map(f=>f.id));renderDetails(result.items,target);target.focus({preventScroll:true});target.scrollIntoView({block:'nearest'});return;}
 target.append(textNode('div',`聚合包含 ${result.count} 条记录`));const zoom=textNode('button','展开地图');zoom.onclick=result.expand;target.append(zoom);
 const list=document.createElement('div'),more=textNode('button','查看成员');let offset=0;target.append(list,more);
 more.onclick=async()=>{more.disabled=true;try{const items=await result.loadLeaves(offset,50);if(version!==pickVersion)return;offset+=items.length;renderDetails(items,list);more.textContent=`已显示 ${offset}/${result.count}，继续加载`;more.hidden=offset>=result.count || !items.length;}catch{if(version===pickVersion)list.textContent='成员加载失败，请重新点击。';}finally{more.disabled=false;}};
 await more.onclick();
}
function legend(){
 const l=layer.legend,c=currentConfig,box=el('legend');box.replaceChildren();
 const title=t=>box.append(textNode('div',t,'legend-title'));
 if(c.effect==='heatmap')title(c.weight==='count'?'地点相对密度':'指标加权相对密度');
 if(c.effect==='bubble'){
  title(`面积 ∝ ${c.sizeMode==='absolute'?'指标绝对值':'指标'}（${l.unit}）`);const samples=textNode('div','','bubbles');if(l.maxRadius>40)samples.style.flexDirection='column';
  for(const sample of bubbleLegendSamples(l.maxAbs,l.maxRadius)){const n=textNode('div','','bubble-sample'),mark=textNode('span','','bubble-mark');mark.style.width=sample.radius*2+'px';mark.style.height=sample.radius*2+'px';n.append(mark,textNode('span',formatMetric(sample.value)));samples.append(n);}box.append(samples);
  if(!l.maxAbs)title('全量指标为零或缺失');title('十字：微小值位置；空心点：零值');
 }
 if(c.effect==='heatmap'){
  const gradient=textNode('div','','gradient');gradient.style.background=heatLegendGradient(l.heatStops);box.append(gradient);const ticks=textNode('div','','ticks');ticks.append(textNode('span','低相对密度'),textNode('span','高相对密度'));box.append(ticks);
 }
 if(c.effect==='cluster')title('圆内数字 = 记录数，聚合范围随缩放变化');
 if(c.effect==='line')title('颜色区分类别或指标，线宽不表示流量');
 if(c.effect==='extrusion')title(`1 ${l.unit} → ${c.heightScale} 米显示高度（非实测楼高）`);
 const scale=l.colorScale;
 if(scale.type==='continuous'){
  title(`指标颜色（${l.unit}）`);const gradient=textNode('div','','gradient');gradient.style.background=continuousGradient(scale);box.append(gradient);const ticks=textNode('div','','ticks numeric');for(const [i,entry] of scale.entries.entries()){const tick=textNode('span',formatMetric(Number(entry.label))),range=scale.domain.at(-1)-scale.domain[0];tick.style.left=(range?(Number(entry.label)-scale.domain[0])/range*100:0)+'%';tick.style.transform=i===0?'none':i===scale.entries.length-1?'translateX(-100%)':'translateX(-50%)';ticks.append(tick);}box.append(ticks);
 }else if(scale.type!=='constant'){
  for(const entry of scale.entries){const row=textNode('div','','legend-row'),swatch=textNode('i','','swatch');swatch.style.background=entry.color;row.append(swatch,textNode('span',entry.label+(scale.by==='value'?' '+l.unit:'')));box.append(row);}
 }
 if((hasMetric && l.missing && (['bubble','point-color','fill','extrusion'].includes(c.effect)||scale.by==='value')) || scale.missing){const row=textNode('div','','legend-row'),swatch=textNode('i','','swatch');swatch.style.background=scale.missingColor || (theme==='light'?'#64748b':'#94a3b8');row.append(swatch,textNode('span','缺失值（有别于零）'));box.append(row);}
 el('map-legend').hidden=box.childElementCount===0;
}
function applyFilter(){
 if(!layer)return;
 layer.setSelected([]);visible=payload.data.features.filter(f=>matchesFeature(f,filters));layer.setFilter(f=>matchesFeature(f,filters));status.dataset.filteredCount=String(visible.length);pickVersion++;lastPickKind=null;limit=20;
 el('details').hidden=visible.length>0;el('details').textContent=visible.length?'':'没有匹配结果，请调整筛选条件。';const clear=el('clear-filters');if(clear)clear.hidden=!Object.values(filters).some(Boolean);statistics();renderRecords();
}
function busyControls(busy){if(el('category-picker')){el('category-picker').inert=busy;if(busy)el('category-picker').open=false;}for(const c of document.querySelectorAll('#controls input,#controls select,#controls button,.toolbar button'))c.disabled=busy;}
async function show(c){
 if(themeController?.busy)return;const request=++showVersion;pickVersion++;busyControls(true);setStatus('正在加载数据效果…','loading');
 try{const next=await switcher.show({...c,theme});if(!next || request!==showVersion)return;layer=next;currentConfig=c;
  el('title').textContent=c.title;

  map.setPitch(c.effect==='extrusion'||payload.basemap.type==='terrain'?45:0);applyFilter();legend();
 }catch(error){console.error('Visualization setup failed',error);if(request!==showVersion)return;const select=document.querySelector('[aria-label="可视化效果"]');if(select)select.value=String(payload.configs.indexOf(currentConfig));setStatus('新效果加载失败，已保留原效果。请检查数据条件或网络。','error');}
 finally{if(request===showVersion){for(const b of document.querySelectorAll('[data-effect-index]'))b.setAttribute('aria-pressed',String(payload.configs[Number(b.dataset.effectIndex)]===currentConfig));busyControls(false);}}
}
function verification(){if(!layer)return;const proof=layer.inspect();el('verification').textContent=JSON.stringify({...proof,basemap:runtime.basemap,basemapState:basemapController?.inspect(),theme,layout:payload.ui.layout,style:runtime.styles[theme],tilesLoaded:map.areTilesLoaded(),effect:currentConfig.effect,filteredCount:visible.length,statistics:summarizeFeatures(visible,payload.ui.aggregation),zoom:map.getZoom(),center:map.getCenter().toArray(),pitch:map.getPitch(),bearing:map.getBearing()});if(proof.registered && basemapController?.inspect().registered && map.areTilesLoaded() && !themeController?.busy && !['error','auth-error'].includes(status.dataset.state))setStatus('地图已就绪','rendered');}
function viewPadding(){
 const r=document.querySelector('.panel').getBoundingClientRect(),margin=Math.max(45,(currentConfig.maxRadius || 28)*1.35+8);
 return innerWidth<=900?{top:margin,bottom:Math.ceil(innerHeight-r.top)+margin,left:margin,right:margin}:{top:margin,bottom:margin,left:Math.ceil(r.right)+margin,right:!el('map-legend').hidden&&el('map-legend').open?Math.ceil(innerWidth-el('map-legend').getBoundingClientRect().left)+margin:margin};
}
function fitView(){const [w,s,e,n]=payload.view.wrappedBounds;map.fitBounds([[w,s],[e<w?e+360:e,n]],{padding:viewPadding(),maxZoom:13,duration:0,retainPadding:false});}

function controls(){
 const box=el('controls');
 if(payload.configs.length>1){const group=textNode('div','','effect-tabs');group.setAttribute('role','group');group.setAttribute('aria-label','可视化效果');payload.configs.forEach((c,i)=>{const appearance=c.blendMode==='additive'?(payload.ui.locale==='en'?' · Additive':' · 叠加'):c.glow?(payload.ui.locale==='en'?' · Glow':' · 柔光'):'';const label=c.effect==='fill'?'区域设色':c.effect==='extrusion'?'3D 高度':labels[c.effect]+(c.colorBy==='category'?' · 类别':'')+appearance;const button=textNode('button',label);button.dataset.effectIndex=i;button.setAttribute('aria-pressed',String(i===0));button.onclick=()=>{if(c!==currentConfig)show(c);};group.append(button);});box.append(group);}
 const categories=[...new Set(payload.data.features.map(f=>f.properties.__viz.category).filter(v=>v!=null))];
 if(categories.length>1){const picker=textNode('details','','category-picker');picker.id='category-picker';const summary=textNode('summary','全部类别');summary.setAttribute('aria-label','类别筛选');summary.id='category-summary';const menu=textNode('div','','category-menu');menu.setAttribute('role','group');menu.setAttribute('aria-label','选择类别');
 for(const category of ['',...categories]){const label=textNode('label','','category-option'),input=document.createElement('input');input.type='radio';input.name='map-category';input.value=category;input.checked=category==='';input.onchange=()=>{filters.category=category;summary.textContent=category || '全部类别';picker.open=false;applyFilter();summary.focus();};label.append(input,textNode('span',category || '全部类别'));menu.append(label);}
 picker.append(summary,menu);box.append(picker);picker.addEventListener('keydown',e=>{if(e.key==='Escape'){picker.open=false;summary.focus();}});document.addEventListener('pointerdown',e=>{if(!picker.contains(e.target))picker.open=false;});}
 const search=document.createElement('input');search.type='search';search.placeholder='搜索名称';search.setAttribute('aria-label','搜索名称');search.oninput=()=>{filters.query=search.value;applyFilter();};box.append(search);
 const days=[...new Set(payload.data.features.map(f=>f.properties.__viz.time?.slice(0,10)).filter(Boolean))].sort();
 if(days.length>1){const range=document.createElement('details');range.style.width='100%';range.append(textNode('summary','日期范围'));const dates=textNode('div','','dates');for(const [key,label] of [['from','开始日期'],['to','结束日期']]){const holder=textNode('label',label),input=document.createElement('input');input.type='date';input.min=days[0];input.max=days.at(-1);input.setAttribute('aria-label',label);input.onchange=()=>{filters[key]=input.value;applyFilter();};holder.append(input);dates.append(holder);}range.append(dates,textNode('small','按来源时间的日历日期筛选；未提供时间的记录不计入日期范围。'));box.append(range);}
 const clear=textNode('button','清空筛选');clear.id='clear-filters';clear.hidden=!Object.values(filters).some(Boolean);clear.onclick=()=>{Object.assign(filters,{category:'',query:'',from:'',to:''});for(const input of box.querySelectorAll('input:not([type=radio])'))input.value='';for(const input of box.querySelectorAll('input[name=map-category]'))input.checked=input.value==='';if(el('category-summary'))el('category-summary').textContent='全部类别';applyFilter();};box.append(clear);
 el('reset').disabled=false;el('reset').onclick=fitView;
 if(payload.appearance.themeSwitcher){const group=el('theme-controls');group.className='theme-options';group.setAttribute('role','group');group.setAttribute('aria-label','地图主题');for(const [value,label] of [['dark','深色'],['light','浅色']]){const b=textNode('button',label);b.dataset.theme=value;b.setAttribute('aria-pressed',String(value===theme));b.onclick=async()=>{if(value===theme || !themeController || themeController.busy)return;try{await themeController.change(value);}catch{}finally{busyControls(false);verification();}};group.append(b);}}
}
function themeState(state,value){
 if(state==='loading'){pickVersion++;busyControls(true);setStatus('正在切换地图风格…','loading');return;}
 theme=value;document.documentElement.dataset.theme=theme;for(const b of document.querySelectorAll('button[data-theme]'))b.setAttribute('aria-pressed',String(b.dataset.theme===theme));if(layer)legend();
 if(lastPickKind==='cluster'){for(const b of el('details').querySelectorAll('button'))b.remove();el('details').append(textNode('p','再次点击聚合点可继续查看成员。'));lastPickKind=null;}
 setStatus(state==='ready'?'地图已就绪':state==='restored'?'新风格未能加载，已恢复原风格。':'底图暂不可用，请检查网络后重试。',state==='ready'?'rendered':'error');verification();
}
el('panel-toggle').onclick=()=>{const panel=document.querySelector('.panel'),collapsed=panel.dataset.collapsed!=='true';panel.dataset.collapsed=String(collapsed);el('panel-toggle').textContent=collapsed?'展开':'收起';el('panel-toggle').setAttribute('aria-expanded',String(!collapsed));};
if(payload.ui.layout!=='explore')el('tools').open=false;
if(innerWidth<=900)el('map-legend').open=false;

const coverage=payload.data.features.map(f=>f.properties.__viz.time?.slice(0,10)).filter(Boolean).sort();
if(coverage.length)el('subtitle').after(textNode('p',`数据日期 ${coverage[0]}${coverage[0]===coverage.at(-1)?'':' — '+coverage.at(-1)}`,'muted'));
if(payload.ui.showRecords===false)document.querySelector('.results')?.remove();
statistics();
async function start(){
 if(runtime.requiresKey && !payload.token){setStatus('待接入：未提供 Mapbox 浏览器 Token。请通过已授权配置重新生成 HTML。','pending-key');return;}
 try{setStatus('正在加载地图服务…','loading');const css=document.createElement('link');css.rel='stylesheet';css.href=runtime.css;document.head.append(css);
  for(const url of [runtime.js,...(runtime.supplements??[])])await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;const timer=setTimeout(()=>reject(Error('SDK timeout')),20000);s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=()=>{clearTimeout(timer);reject(Error('SDK failed'));};document.head.append(s);});
  const sdk=window[runtime.global];map=new sdk.Map({container:'map',...(runtime.requiresKey?{accessToken:payload.token}:{}),style:runtime.style,center:payload.view.center,zoom:5,fadeDuration:payload.configs.some(c=>c.effect==='cluster')?0:300,attributionControl:runtime.provider==='maplibre'?{compact:true}:true});map.addControl(new sdk.NavigationControl(),'top-right');
  if(runtime.provider==='maplibre'){const collapseAttribution=()=>{const attribution=map.getContainer().querySelector('details.maplibregl-ctrl-attrib');if(attribution){attribution.open=false;attribution.classList.remove('maplibregl-compact-show');}};collapseAttribution();map.on('load',()=>requestAnimationFrame(collapseAttribution));}
  const advice=runtime.requiresKey?'网络、Token 权限与来源限制':payload.basemap.type==='vector'?'网络及底图服务':'网络、瓦片来源、CORS 与缩放覆盖范围';const timer=setTimeout(()=>setStatus('地图尚未就绪，请检查'+advice+'。','pending-map'),30000);
  map.on('error',event=>{if(themeController?.busy)return;clearTimeout(timer);const auth=[401,403].includes(event.error?.status);setStatus(auth?'地图鉴权失败，请检查 Token 权限与来源限制。':'地图资源请求失败，请检查'+advice+'。',auth?'auth-error':'resource-error');});switcher=createVizSwitcher(map,payload.data,{provider:runtime.provider,onPick:pick});map.on('idle',verification);
  map.on('load',async()=>{try{basemapController=applyBasemap(map,payload.basemap,{provider:runtime.provider,theme});await basemapController.ready;await waitForBasemapStyle(map);await show(currentConfig);if(!layer){clearTimeout(timer);return;}themeController=createThemeController(map,{styles:runtime.styles,initial:theme,isReady:()=>!!layer?.inspect().registered&&!!basemapController?.inspect().registered,applyTheme:next=>{basemapController?.destroy();basemapController=applyBasemap(map,{...payload.basemap,styleUrl:runtime.styles[next]},{provider:runtime.provider,theme:next});layer.setTheme(next);},onState:themeState});controls();fitView();map.once('idle',()=>clearTimeout(timer));}catch{clearTimeout(timer);setStatus('底图或数据层配置未通过检查，请核对资源来源、指标与几何类型。','error');}});
 }catch{setStatus(runtime.label+' SDK 未能加载，请检查网络和浏览器环境。','error');}
}
el('retry').onclick=()=>location.reload();
window.addEventListener('pagehide',()=>{pickVersion++;showVersion++;themeController?.destroy();switcher?.destroy();basemapController?.destroy();map?.remove();},{once:true});start();
</script></body></html>'''
