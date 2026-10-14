// Shared page semantics. Pure functions keep the UI and tests on one contract.
export function formatMetric(value, locale = globalThis.document?.documentElement?.lang || 'zh-CN'){
 if(typeof value!=='number' || !Number.isFinite(value))return locale.startsWith('en')?'Not provided':'未提供';
 return new Intl.NumberFormat(locale,Math.abs(value)>0 && Math.abs(value)<.001?{maximumSignificantDigits:3}:{maximumFractionDigits:3}).format(value);
}
export function matchesFeature(feature,{category='',query='',from='',to=''}={}){
 const v=feature.properties.__viz,day=v.time?.slice(0,10);
 return (!category || v.category===category) && (!query || (v.label || feature.id).toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) &&
  (!(from || to) || (!!day && (!from || day>=from) && (!to || day<=to)));
}
export function summarizeFeatures(features,aggregation='none'){
 const values=features.map(f=>f.properties.__viz.value).filter(v=>typeof v==='number' && Number.isFinite(v));
 const sum=values.reduce((a,b)=>a+b,0);
 return {count:features.length,valid:values.length,missing:features.length-values.length,zero:values.filter(v=>v===0).length,
  aggregate:values.length && aggregation!=='none' && Number.isFinite(sum)?(aggregation==='mean'?sum/values.length:sum):null};
}
export function effectExplanation(c){
 const color=c.colorBy==='category'?'颜色区分类别。':c.colorBy==='constant'?'颜色不表达大小。':'颜色表示指标大小。';
 switch(c.effect){
 case 'bubble':return `气泡面积表示${c.sizeMode==='absolute'?'指标绝对值':'指标规模'}，${color}小十字仅标记微小值的位置，不参与面积比较。`;
 case 'heatmap':return c.weight==='count'?'每条位置记录权重为 1，表示地点相对密度，不表示指标总量。':'按非负指标加权，表示相对贡献密度；不能从颜色直接读取精确数值。';
 case 'cluster':return '圆内数字是位置记录数；随缩放重新聚合，点击查看原始成员。';
 case 'points':case 'point-color':return `等大点表示位置，${c.effect==='points' && !c.colorBy?'颜色不表达大小。':color}`;
 case 'line':return '按输入几何绘制线路；固定线宽不表达流量，不推断方向或实时位置。';
 case 'fill':return c.colorBy==='constant'?'展示区域范围，填充颜色不表达数值大小。':`区域设色。${color}`;
 case 'extrusion':return `每 1 ${c.unit} 对应 ${c.heightScale} 米显示高度，属于指标映射，不自动等同真实建筑高度。`;
 default:return '';
 }
}
export function bubbleLegendSamples(maxAbs,maxRadius=28){
 return maxAbs>0?[.0625,.25,1].map(f=>({value:maxAbs*f,radius:maxRadius*Math.sqrt(f)})):[];
}
export function continuousGradient(scale){
 const [lo,hi]=[scale.domain[0],scale.domain.at(-1)];
 if(lo===hi)return scale.colors[0];
 return `linear-gradient(90deg,${scale.colors.map((c,i)=>`${c} ${(scale.domain[i]-lo)/(hi-lo)*100}%`).join(',')})`;
}

export function heatLegendGradient(stops){
 return `linear-gradient(90deg,${stops.map(([value,color])=>`${color} ${value*100}%`).join(',')})`;
}
