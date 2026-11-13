import type {Bounds} from '../tiles/tpk';
export type Geometry={type:string;coordinates:any};
export type Feature={id:number;kind:string;class:string;name:string;geometry:string};
export const WORLD=20037508.342789244;
export function escapeXml(value:string){return value.replace(/[\u0000-\u001f]/g,'').replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));}
export function mercatorBounds(bounds:Bounds){
  const y=(latitude:number)=>Math.log(Math.tan(Math.PI/4+latitude*Math.PI/360))*WORLD/Math.PI;
  return {minx:bounds.west/180*WORLD,maxx:bounds.east/180*WORLD,miny:y(bounds.south),maxy:y(bounds.north)};
}
/** Small local cartography style; geometry stays independent of prepared satellite TPKs. */
export function renderSvg(features:Feature[],z:number,x:number,y:number,coastline:boolean){
  const span=2*WORLD/2**z,left=-WORLD+x*span,top=WORLD-y*span;
  const project=(point:number[])=>[(point[0]-left)/span*256,(top-point[1])/span*256];
  const number=(v:number)=>Number.isFinite(v)?Math.max(-1e7,Math.min(1e7,v)).toFixed(1):'0';
  const line=(points:number[][],close=false)=>points.map((point,i)=>{const p=project(point);return `${i?'L':'M'}${number(p[0])} ${number(p[1])}`;}).join('')+(close?'Z':'');
  function path(g:Geometry):string{
    if(g.type==='LineString')return line(g.coordinates);
    if(g.type==='MultiLineString')return g.coordinates.map((points:number[][])=>line(points)).join('');
    if(g.type==='Polygon')return g.coordinates.map((points:number[][])=>line(points,true)).join('');
    if(g.type==='MultiPolygon')return g.coordinates.map((polygon:number[][][])=>polygon.map(points=>line(points,true)).join('')).join('');
    if(g.type==='GeometryCollection')return '';
    return '';
  }
  function anchor(g:Geometry):number[]|null{
    if(g.type==='Point')return project(g.coordinates);
    const points=g.type==='LineString'?g.coordinates:g.type==='Polygon'?g.coordinates[0]:null;
    return points?.length?project(points[Math.floor(points.length/2)]):null;
  }
  const order=['land','green','water','building','river','coastline','rail','road','place','poi'];
  const sorted=features.map(f=>({...f,g:JSON.parse(f.geometry) as Geometry})).sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind)||a.id-b.id);
  const paths:string[]=[],casing:string[]=[],roads:string[]=[],labels:Array<{f:Feature;p:number[];size:number;weight:string}>=[];
  for(const f of sorted){
    const d=path(f.g),p=anchor(f.g);
    const add=(attributes:string)=>{if(d)paths.push(`<path d="${d}" ${attributes}/>`);};
    if(f.kind==='land')add('fill="#f2efe9" fill-rule="evenodd"');
    if(f.kind==='green')add(`fill="${f.class==='farmland'?'#e9e5cc':'#cde5bd'}" fill-rule="evenodd"`);
    if(f.kind==='water')add('fill="#aad3df" fill-rule="evenodd"');
    if(f.kind==='building')add('fill="#d7ccc3" stroke="#b8aaa0" stroke-width="0.5" fill-rule="evenodd"');
    if(f.kind==='river'||f.kind==='coastline')add(`fill="none" stroke="#8bbdcc" stroke-width="${f.kind==='coastline'?.7:f.class==='river'?2:1}"`);
    if(f.kind==='rail')add('fill="none" stroke="#888" stroke-width="1.2" stroke-dasharray="4 3"');
    if(f.kind==='road'&&d){
      const major=['motorway','trunk','primary','secondary','tertiary'].includes(f.class);
      const width=major?(z<11?1.5:z<15?3:6):(z<15?1.3:3);
      const color=f.class==='motorway'?'#ed9b9b':f.class==='trunk'?'#f4b395':f.class==='primary'?'#f7cf86':f.class==='secondary'?'#f9e8a2':'#ffffff';
      casing.push(`<path d="${d}" fill="none" stroke="#c6bfb5" stroke-width="${width+1.1}"/>`);
      roads.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"${['path','footway','steps','track'].includes(f.class)?' stroke-dasharray="3 2"':''}/>`);
    }
    if(f.name&&p&&p[0]>=5&&p[0]<251&&p[1]>=8&&p[1]<248&&
      (f.kind==='place'||(f.kind==='road'&&z>=14)||(f.kind==='poi'&&z>=16))){
      labels.push({f,p,size:f.kind==='place'?(f.class==='city'?15:13):10,weight:f.kind==='place'?'600':'400'});
    }
  }
  const text:string[]=[],occupied:Array<{x:number;y:number;w:number;h:number}>=[],seen=new Set<string>();
  labels.sort((a,b)=>Number(b.f.kind==='place')-Number(a.f.kind==='place')||a.f.id-b.f.id);
  for(const {f,p,size,weight} of labels){
    const name=f.name.slice(0,48),key=f.kind+':'+name;
    if(seen.has(key))continue;
    const rect={x:p[0],y:p[1],w:Math.min(220,[...name].length*size*.85),h:size+5};
    if(occupied.some(other=>Math.abs(other.x-rect.x)<(other.w+rect.w)/2+3&&Math.abs(other.y-rect.y)<(other.h+rect.h)/2+3))continue;
    occupied.push(rect);seen.add(key);
    text.push(`<text x="${number(p[0])}" y="${number(p[1])}" text-anchor="middle" font-family="Malgun Gothic,Noto Sans CJK KR,sans-serif" font-size="${size}" font-weight="${weight}" fill="#3f484a" stroke="#ffffff" stroke-width="2.5" paint-order="stroke">${escapeXml(name)}</text>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" fill="${coastline?'#aad3df':'#f2efe9'}"/><g stroke-linejoin="round" stroke-linecap="round">${paths.join('')}${casing.join('')}${roads.join('')}${text.join('')}</g></svg>`;
}
