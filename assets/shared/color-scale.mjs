// Fixed, full-data color mapping shared by native/official-extension recipes.
const PALETTE=['#22d3ee','#a78bfa','#fbbf24','#fb7185','#34d399','#60a5fa','#f472b6','#a3e635','#fb923c','#2dd4bf','#c084fc','#facc15'];
const LIGHT_PALETTE=['#0369a1','#7c3aed','#b45309','#be123c','#047857','#1d4ed8','#be185d','#4d7c0f','#c2410c','#0f766e','#9333ea','#a16207'];
const hex=c=>typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c);
const finite=v=>typeof v==='number' && Number.isFinite(v);
export function colorMapping(features,spec) {
  const light=spec.theme==='light';
  const palette=light?LIGHT_PALETTE:PALETTE;
  const by=spec.colorBy || (['point-color','bubble','fill','extrusion'].includes(spec.effect)?'value':'constant');
  if(!['constant','value','category'].includes(by))throw Error('Unknown colorBy');
  if(spec.effect==='point-color' && by!=='value')throw Error('point-color requires value encoding');
  if(spec.effect==='heatmap' && by!=='constant')throw Error('Heatmap uses density colors, not colorBy');
  const scale=spec.colorScale || {}, missing=spec.missingColor || (light?'#64748b':'#94a3b8');
  if(!hex(missing))throw Error('missingColor must be #RRGGBB');
  const values=features.map(f=>f.properties.value).filter(finite);
  const categories=[...new Set(features.map(f=>f.properties.category).filter(v=>v!=null))].sort();
  if(by==='constant') {
    const color=spec.color || (light?'#0369a1':'#22d3ee');if(!hex(color))throw Error('color must be #RRGGBB');
    if(spec.colorScale)throw Error('Constant color does not use a colorScale');
    return {get:()=>color,legend:{type:'constant',entries:[{label:'位置 / 边界',color}]}};
  }
  let type=scale.type || (by==='category'?'categorical':'continuous');
  let domain=scale.domain, colors=scale.colors, breaks=scale.breaks;
  if(by==='category'){
    if(type!=='categorical')throw Error('Category colors require categorical scale');
    domain=domain || categories;colors=colors || palette.slice(0,domain.length);
    if(!Array.isArray(domain) || !domain.length || domain.some(v=>typeof v!=='string') || new Set(domain).size!==domain.length || categories.some(v=>!domain.includes(v)))throw Error('Category domain must include each nonmissing category exactly once');
  }else{
    if(!values.length)throw Error('Color mapping requires finite metric');
    if(!['continuous','threshold'].includes(type))throw Error('Value colors require continuous or threshold scale');
    const lo=values[0]; // avoid spread limits on large data
    const min=values.reduce((a,b)=>Math.min(a,b),lo),max=values.reduce((a,b)=>Math.max(a,b),lo);
    if(type==='continuous'){
      domain=domain || (min<0 && max>0?[-Math.max(-min,max),0,Math.max(-min,max)]:[min,max]);
      colors=colors || (domain.length===3?(light?['#be123c','#64748b','#0369a1']:['#fb7185','#e2e8f0','#22d3ee']):(light?['#0369a1','#7c3aed']:['#22d3ee','#a78bfa']));
      if(!Array.isArray(domain) || domain.length<2 || domain.some(v=>!finite(v)) || domain.some((v,i)=>i && v<=domain[i-1]) && !(domain.length===2 && domain[0]===domain[1]))throw Error('Continuous domain must be ascending finite stops');
    }else{
      if(!Array.isArray(breaks) || !breaks.length || breaks.some(v=>!finite(v)) || breaks.some((v,i)=>i && v<=breaks[i-1]))throw Error('Threshold breaks must be ascending finite numbers');
      domain=breaks;
    }
  }
  const count=type==='threshold'?breaks.length+1:domain.length;
  if(!Array.isArray(colors) || colors.length!==count || colors.some(c=>!hex(c)))throw Error('Provide one #RRGGBB color per domain stop/category or threshold interval');
  const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));
  const interpolate=(a,b,t)=>'#'+rgb(a).map((v,i)=>Math.round(v+(rgb(b)[i]-v)*t).toString(16).padStart(2,'0')).join('');
  const get=p=>{
    const value=p[by];if(value==null)return missing;
    if(type==='categorical')return colors[domain.indexOf(value)] ?? missing;
    if(type==='threshold')return colors[breaks.filter(b=>value>=b).length];
    if(domain[0]===domain.at(-1))return colors[0];
    if(value<=domain[0])return colors[0];if(value>=domain.at(-1))return colors.at(-1);
    const i=domain.findIndex(v=>v>=value);
    return interpolate(colors[i-1],colors[i],(value-domain[i-1])/(domain[i]-domain[i-1]));
  };
  const legendColors=type==='continuous' && domain[0]===domain.at(-1)?colors.slice(0,1):colors;
  const entries=legendColors.map((color,i)=>({color,label:type==='threshold'?(i===0?`< ${breaks[0]}`:i===breaks.length?`≥ ${breaks[i-1]}`:`${breaks[i-1]} ≤ x < ${breaks[i]}`):String(domain[i])}));
  return {get,legend:{type,by,domain,breaks,colors,missingColor:missing,entries,missing:features.filter(f=>f.properties[by]==null).length}};
}
