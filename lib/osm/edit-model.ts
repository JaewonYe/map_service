import type {Bounds} from '../tiles/tpk';
import {WORLD} from './render';
import {areaSquareMeters, isSelfIntersecting} from '../map-measure';
export class OsmEditError extends Error {constructor(message:string,public status=400){super(message);}}
export const classes={road:['motorway','trunk','primary','secondary','tertiary','unclassified','residential','living_street','service','pedestrian','footway','path','cycleway','steps','track'],building:['yes','house','industrial','commercial','public'],place:['city','town','village','suburb','neighbourhood','hamlet'],poi:['cafe','school','parking','hospital','viewpoint']} as const;
export type Kind=keyof typeof classes;
export type Geometry={type:'Point'|'LineString'|'Polygon';coordinates:any};
export type ObjectValue={name:string;kind:Kind;class:string;geometry:Geometry};
export type MapObject={key:string;name:string;kind:string;class:string;geometry:Geometry|null;fingerprint:string|null;editable:boolean;reason?:string;source:'base'|'local';state:'original'|'modified'|'hidden'|'conflict'};
export function objectKey(value:unknown):string {
 if(typeof value!=='string'||! /^(?:(?:node|way|relation):[1-9]\d{0,18}|legacy:[1-9]\d*|local:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.test(value))throw new OsmEditError('올바른 일반 지도 객체 식별자가 필요합니다.');return value;
}
export const project=(p:number[])=>[p[0]/180*WORLD,Math.log(Math.tan(Math.PI/4+p[1]*Math.PI/360))*WORLD/Math.PI];
export const unproject=(p:number[])=>[p[0]/WORLD*180,Math.atan(Math.sinh(p[1]/WORLD*Math.PI))*180/Math.PI];
export function transformGeometry(g:Geometry,convert:(p:number[])=>number[]):Geometry {return {type:g.type,coordinates:g.type==='Point'?convert(g.coordinates):g.type==='LineString'?g.coordinates.map(convert):g.coordinates.map((ring:number[][])=>ring.map(convert))};}
export function vertices(g:Geometry):number[][] {return g.type==='Point'?[g.coordinates]:g.type==='LineString'?g.coordinates:g.coordinates[0].slice(0,-1);}
export function validateObject(value:unknown,bounds?:Bounds):ObjectValue {
 const v=value as ObjectValue;
 if(!v||typeof v!=='object'||!Object.hasOwn(classes,v.kind)||typeof v.class!=='string'||!(classes[v.kind] as readonly string[]).includes(v.class))throw new OsmEditError('지원하는 객체 종류와 표시 분류를 선택하세요.');
 if(typeof v.name!=='string'||v.name.trim().length>160||/[\u0000-\u001f]/.test(v.name)||(!v.name.trim()&&['place','poi'].includes(v.kind)))throw new OsmEditError('이름은 최대 160자이며 지명·표시 지점은 이름이 필요합니다.');
 const g=v.geometry,expected=v.kind==='road'?'LineString':v.kind==='building'?'Polygon':'Point';
 if(!g||g.type!==expected||!Array.isArray(g.coordinates))throw new OsmEditError('지원 형상은 지점 Point, 도로 LineString, 건물 단일 Polygon입니다.');
 if(g.type==='Polygon'&&(g.coordinates.length!==1||!Array.isArray(g.coordinates[0])))throw new OsmEditError('구멍 없는 단일 외곽만 편집할 수 있습니다.');
 let raw=g.type==='Point'?[g.coordinates]:g.type==='LineString'?g.coordinates:g.coordinates[0];
 if(!Array.isArray(raw)||raw.length>(g.type==='Polygon'?129:g.type==='Point'?1:256))throw new OsmEditError('정점 한도는 지점 1개, 도로 256개, 건물 128개입니다.');
 let points=raw.map((p:unknown)=>{
  if(!Array.isArray(p)||p.length!==2||!p.every(x=>typeof x==='number'&&Number.isFinite(x))||Math.abs(p[0])>180||Math.abs(p[1])>85.05112878)throw new OsmEditError('좌표는 허용 범위의 [경도, 위도] 숫자여야 합니다.');
  const result=[Number(p[0].toFixed(7)),Math.sign(p[1])*Math.min(Math.abs(Number(p[1].toFixed(7))),85.0511287)];
  if(bounds&&(result[0]<bounds.west-1e-7||result[0]>bounds.east+1e-7||result[1]<bounds.south-1e-7||result[1]>bounds.north+1e-7))throw new OsmEditError('준비된 OSM 지도 범위 안에서만 저장할 수 있습니다.');return result;
 }) as number[][];
 const same=(a:number[],b:number[])=>a[0]===b[0]&&a[1]===b[1];
 if(g.type==='Polygon'&&points.length>1&&same(points[0],points.at(-1)!))points=points.slice(0,-1);
 const min=g.type==='Point'?1:g.type==='LineString'?2:3;
 if(points.length<min||points.length>(g.type==='Polygon'?128:256)||new Set(points.map(p=>p.join(','))).size!==points.length)throw new OsmEditError(`서로 다른 정점이 ${min}개 이상 필요합니다. 중복 정점은 허용하지 않습니다.`);
 const lon=points.map(p=>p[0]);if(Math.max(...lon)-Math.min(...lon)>=180)throw new OsmEditError('날짜변경선을 가로지르는 형상은 지원하지 않습니다.');
 const latlon=points.map(p=>[p[1],p[0]] as const);
 if(g.type==='Polygon'){
  if(isSelfIntersecting(latlon))throw new OsmEditError('경계가 교차하거나 닿습니다.');
  if(areaSquareMeters(latlon)<=0)throw new OsmEditError('빈 면적이나 퇴화 형상은 저장할 수 없습니다.');
  let signed=0;for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
   if(Math.abs((b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]))<1e-16)throw new OsmEditError('일직선의 퇴화 정점을 이동하거나 삭제하세요.');signed+=a[0]*b[1]-b[0]*a[1];
  }if(signed<0)points.reverse();
 }
 if(g.type==='LineString')for(let i=1;i<points.length-1;i++){
  const [a,b,c]=[points[i-1],points[i],points[i+1]],dx=b[0]-a[0],dy=b[1]-a[1],ex=c[0]-b[0],ey=c[1]-b[1];
  if(Math.abs(dx*ey-dy*ex)<1e-16&&dx*ex+dy*ey<0)throw new OsmEditError('도로 선이 되짚어 겹칩니다. 정점을 이동하거나 삭제하세요.');
 }
 if(g.type==='LineString')for(let i=0;i<points.length-1;i++)for(let j=i+2;j<points.length-1;j++){
  const [a,b,c,d]=[points[i],points[i+1],points[j],points[j+1]],cross=(p:number[],q:number[],r:number[])=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const inside=(p:number[],q:number[],r:number[])=>r[0]>=Math.min(p[0],q[0])&&r[0]<=Math.max(p[0],q[0])&&r[1]>=Math.min(p[1],q[1])&&r[1]<=Math.max(p[1],q[1]);
  if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0||Math.abs(cross(a,b,c))<1e-16&&inside(a,b,c)||Math.abs(cross(a,b,d))<1e-16&&inside(a,b,d)||Math.abs(cross(c,d,a))<1e-16&&inside(c,d,a)||Math.abs(cross(c,d,b))<1e-16&&inside(c,d,b))throw new OsmEditError('도로 선이 자기 교차하거나 닿습니다.');
 }
 return {kind:v.kind,class:v.class,name:v.name.trim(),geometry:{type:g.type,coordinates:g.type==='Point'?points[0]:g.type==='LineString'?points:[[...points,points[0]]]}};
}
export function minzoom(v:ObjectValue){
 const roads:Record<string,number>={motorway:5,trunk:6,primary:7,secondary:9,tertiary:10,unclassified:12,residential:13,living_street:14,service:15,pedestrian:15,footway:16,path:16,cycleway:16,steps:17,track:15};
 const places:Record<string,number>={city:8,town:10,village:12,suburb:12,neighbourhood:15,hamlet:14};
 return v.kind==='building'?15:v.kind==='poi'?16:v.kind==='place'?places[v.class]:roads[v.class];
}
export function intersectsBounds(g:Geometry,b:Bounds){const ps=vertices(g),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);return Math.min(...xs)<=b.east&&Math.max(...xs)>=b.west&&Math.min(...ys)<=b.north&&Math.max(...ys)>=b.south;}
