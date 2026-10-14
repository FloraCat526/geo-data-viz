export const LIMIT = 20000;
const kinds = {Point:0, MultiPoint:1, LineString:1, MultiLineString:2, Polygon:2, MultiPolygon:3};
export const number = v => (!['number','string'].includes(typeof v) || String(v).trim() === '') ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
function validateGeometry(g) {
  if(!g || !(g.type in kinds)) throw Error('不支持的几何类型；请先用 Skill 分析并规范化。');
  function position(p){
    if(!Array.isArray(p)||p.length<2||p.some(v=>typeof v!=='number'||!Number.isFinite(v))||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('坐标必须为有效数字，不能填零替代缺失。');
  }
  function list(a,min){if(!Array.isArray(a)||a.length<min)throw Error('几何坐标为空或顶点不足。');}
  function line(a){list(a,2);a.forEach(position);}
  function polygon(a){list(a,1);for(const ring of a){
    list(ring,4);ring.forEach(position);
    if(ring[0].length!==ring.at(-1).length||ring[0].some((v,i)=>v!==ring.at(-1)[i]))throw Error('多边形环必须闭合。');
    if(new Set(ring.map(p=>JSON.stringify(p.slice(0,2)))).size<3)throw Error('多边形环至少需要三个不同顶点。');
  }}
  const c=g.coordinates;
  if(g.type==='Point')position(c);
  if(g.type==='MultiPoint'){list(c,1);c.forEach(position);}
  if(g.type==='LineString')line(c);
  if(g.type==='MultiLineString'){list(c,1);c.forEach(line);}
  if(g.type==='Polygon')polygon(c);
  if(g.type==='MultiPolygon'){list(c,1);c.forEach(polygon);}
}
export function coordinates(g) {
  if (!g || !(g.type in kinds)) throw Error('不支持的几何类型；请先用 Skill 分析并规范化。');
  let a = [g.coordinates];
  for (let i=0;i<kinds[g.type];i++) a=a.flat();
  return a;
}
export function prepare(input) {
  if(input?.type !== 'FeatureCollection' || !Array.isArray(input.features)) throw Error('请选择 GeoJSON FeatureCollection。CSV/Excel 请先由 Skill 分析转换。');
  let count=0;
  const seen = new Set();
  const features = input.features.map((f,i) => {
    if(f?.type!=='Feature'||(f.properties!==null&&f.properties!==undefined&&(typeof f.properties!=='object'||Array.isArray(f.properties)))) throw Error(`第 ${i+1} 个要素结构无效。`);
    try{validateGeometry(f.geometry);}catch(e){throw Error(`第 ${i+1} 个要素：${e.message}`);}
    const all=coordinates(f.geometry);
    if(!all.length) throw Error(`第 ${i+1} 个要素为空。`);
    for(const p of all) {
      if(!Array.isArray(p)||p.length<2||typeof p[0]!=='number'||typeof p[1]!=='number'||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90) throw Error(`第 ${i+1} 个要素坐标无效；请先修复，不能自动填零。`);
      if(++count>LIMIT) throw Error(`超过 ${LIMIT.toLocaleString()} 顶点的模板上限。请先聚合或升级 WebGL 渲染。`);
    }
    if(f.geometry.type==='LineString'&&all.length<2) throw Error('线至少需要两个顶点。');
    const polys=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[];
    for(const poly of polys) for(const ring of poly) if(ring.length<4||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1]) throw Error('多边形环必须至少四点并闭合。');
    const base=String(f.id??`row-${i+1}`); let id=base; while(seen.has(id)) id+='~'; seen.add(id);
    return {...f,id,properties:f.properties??{}};
  });
  if(!features.length) throw Error('没有可显示的要素。');
  const dataCrs=input.metadata?.dataCrs ?? (input.crs?'unknown':'wgs84');
  return {...input,features,metadata:{...input.metadata,dataCrs},vertexCount:count};
}
export function roleValue(feature, role, field) {
  if(field==='__viz') return feature.properties.__viz?.[role]??null;
  return field ? feature.properties[field]??null : null;
}
export function valueDomain(features,field) {
  const values=features.map(f=>number(roleValue(f,'value',field))).filter(x=>x!==null).sort((a,b)=>a-b);
  return {min:values[0]??0,max:values.at(-1)??0,maxAbs:values.reduce((a,b)=>Math.max(a,Math.abs(b)),0),count:values.length};
}
export function visual(value,domain,mode,scale=1) {
  const v=number(value), t=v===null?0:Math.min(1,Math.abs(v)/(domain.maxAbs||1));
  const color=v===null?'#a1aab7':domain.min<0?(v<0?'#6caaff':'#ffae61'):(t<.33?'#68efc5':t<.66?'#ffd175':'#ff706d');
  return {radius:(mode==='scatter'?4:Math.max(2,24*Math.sqrt(t)))*scale,color,missing:v===null};
}
export function fitCamera(features,width=1000,height=700) {
  const pts=features.flatMap(f=>coordinates(f.geometry));
  if(!pts.length)return {center:[0,0],zoom:2};
  const xs=pts.map(p=>(p[0]+360)%360).sort((a,b)=>a-b);
  let gap=-1,start=xs[0];
  xs.forEach((x,i)=>{const next=xs[(i+1)%xs.length]+(i===xs.length-1?360:0);if(next-x>gap){gap=next-x;start=next%360;}});
  const end=start+360-gap, ys=pts.map(p=>p[1]);
  const south=Math.min(...ys),north=Math.max(...ys);
  const merc=lat=>Math.log(Math.tan(Math.PI/4+Math.max(-85,Math.min(85,lat))*Math.PI/360));
  const spanX=Math.max((end-start)/360,1e-6),spanY=Math.max(Math.abs(merc(north)-merc(south))/(2*Math.PI),1e-6);
  const zoom=Math.max(1,Math.min(15,Math.log2(Math.min(Math.max(200,width-100)/(512*spanX),Math.max(200,height-100)/(512*spanY)))));
  return {center:[((start+end)/2+180)%360-180,(south+north)/2],zoom};
}
export function mapGeometry(geometry,convert) {
  function nested(c,d) {return d===0?convert(c):c.map(x=>nested(x,d-1));}
  return {...geometry,coordinates:nested(geometry.coordinates,kinds[geometry.type])};
}
