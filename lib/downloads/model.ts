import type {Bounds} from '../tiles/tpk';
export const kinds=['satellite','osm','elevation'] as const;
export type DownloadKind=typeof kinds[number];
export const kindLabels:Record<DownloadKind,string>={satellite:'위성',osm:'일반 지도',elevation:'고도'};
export const tileLimits={satellite:150000,elevation:10000} as const;
export const regions={
 'south-korea':{name:'대한민국',bounds:{west:124,south:33,east:132,north:39.5},url:'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf'},
 monaco:{name:'Monaco (작은 검증 지역)',bounds:{west:7.4,south:43.72,east:7.45,north:43.76},url:'https://download.geofabrik.de/europe/monaco-latest.osm.pbf'}
} as const;
export const taeanBounds:Bounds={west:126.230336932571,south:36.585138820015565,east:126.24993476192829,north:36.61063932151162};
export type DownloadPlan={name:string;bounds:Bounds;kinds:DownloadKind[];region:keyof typeof regions;demProvider:'opentopography'|'aws';refresh:boolean;levels:{satellite:{min:number;max:number};elevation:{min:number;max:number}};accepted:Partial<Record<DownloadKind,boolean>>;registryRevision:number};
export class DownloadError extends Error {constructor(message:string,public status=400){super(message);}}
export function parseBounds(value:any):Bounds{
 if(!value||![value.west,value.south,value.east,value.north].every(x=>typeof x==='number'&&Number.isFinite(x))||value.west< -180||value.east>180||value.south< -85||value.north>85||value.west>=value.east||value.south>=value.north||value.east-value.west>15||value.north-value.south>15)throw new DownloadError('다운로드 사각형은 유효한 위경도와 각 축 최대15도 범위여야 합니다.');
 const parsed=Object.fromEntries(['west','south','east','north'].map(k=>[k,Number(value[k].toFixed(7))])) as Bounds;
 if(parsed.west>=parsed.east||parsed.south>=parsed.north)throw new DownloadError('다운로드 사각형이 너무 작습니다. 영역을 넓혀 주세요.');return parsed;
}
export function parsePlan(v:any,confirm=true):DownloadPlan{
 if(!v||typeof v!=='object'||Array.isArray(v))throw new DownloadError('작업 설정을 JSON 객체로 입력하세요.');
 const bounds=parseBounds(v.bounds);
 if(typeof v.name!=='string'||!v.name.trim()||v.name.trim().length>80||/[\u0000-\u001f]/.test(v.name))throw new DownloadError('작업 이름은1–80자로 입력하세요.');
 if(!Array.isArray(v.kinds)||!v.kinds.length||v.kinds.length>3||new Set(v.kinds).size!==v.kinds.length||v.kinds.some((x:any)=>!kinds.includes(x)))throw new DownloadError('위성·일반·고도 중 하나 이상 선택하세요.');
 if(!Object.hasOwn(regions,v.region))throw new DownloadError('지원하는 Geofabrik 지역을 선택하세요.');
 const demProvider=v.demProvider??'opentopography';if(!['opentopography','aws'].includes(demProvider))throw new DownloadError('지원하는 고도 제공처를 선택하세요.');
 const levels={} as DownloadPlan['levels'];for(const k of ['satellite','elevation'] as const){const l=v.levels?.[k];if(!l||!Number.isInteger(l.min)||!Number.isInteger(l.max)||l.min<0||l.max>(k==='satellite'?19:15)||l.min>l.max)throw new DownloadError(`${kindLabels[k]} 표시 level 범위를 확인하세요.`);levels[k]={min:l.min,max:l.max};}
 if(!Number.isSafeInteger(v.registryRevision)||v.registryRevision<0)throw new DownloadError('현재 등록 revision을 다시 조회하세요.',409);
 const accepted:DownloadPlan['accepted']={};for(const k of v.kinds as DownloadKind[]){accepted[k]=v.accepted?.[k]===true;if(confirm&&!accepted[k])throw new DownloadError(`${kindLabels[k]} 제공처의 이용·오프라인 이전 조건을 확인하세요.`);}
 for(const k of ['satellite','elevation'] as const)if(v.kinds.includes(k)){const count=tileCount(bounds,levels[k].min,levels[k].max);if(count>tileLimits[k])throw new DownloadError(`${kindLabels[k]} 작업은 앱 한도 최대${tileLimits[k].toLocaleString('ko-KR')}타일입니다 (선택 영역 ${count.toLocaleString('ko-KR')}타일). 영역이나 상세도를 줄이세요.`,422);}
 if(v.kinds.includes('elevation')&&demProvider==='aws'&&(Math.ceil(bounds.east)-Math.floor(bounds.west)>4||Math.ceil(bounds.north)-Math.floor(bounds.south)>4))throw new DownloadError('고도 다운로드는 각 축 최대4개의 1도 원본 타일을 지원합니다.',422);
 if(v.kinds.includes('elevation')&&demProvider==='opentopography'&&areaKm2(bounds)>1000)throw new DownloadError('이 앱의 OpenTopography 작업 한도는1,000km²입니다. 영역을 줄이세요.',422);
 return {name:v.name.trim(),bounds,kinds:[...v.kinds],region:v.region,demProvider,refresh:v.refresh===true,levels,accepted,registryRevision:v.registryRevision};
}
export function tileCount(b:Bounds,min:number,max:number){let total=0;for(let z=min;z<=max;z++){const n=2**z,x=(lon:number)=>Math.min(n-1,Math.max(0,Math.floor((lon+180)/360*n))),y=(lat:number)=>Math.min(n-1,Math.max(0,Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n)));total+=(x(b.east)-x(b.west)+1)*(y(b.south)-y(b.north)+1);}return total;}
export function areaKm2(b:Bounds){return 6371.0088**2*Math.abs((b.east-b.west)*Math.PI/180*(Math.sin(b.north*Math.PI/180)-Math.sin(b.south*Math.PI/180)));}
export function jobId(v:unknown){if(typeof v!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v))throw new DownloadError('올바른 작업 ID가 필요합니다.');return v;}
