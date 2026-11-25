import {lstat,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {downloadRoot} from './active';
import {DownloadError,jobId} from './model';
import type {Bounds} from '../tiles/tpk';
export type PreparedSatellite={id:string;name:string;createdAt?:string;bounds?:Bounds;zoomLevels:number[];selectable:boolean;reason?:string};
const summaries=new Map<string,{stamp:string;value:PreparedSatellite|null}>();
function extent(v:any):Bounds|undefined{
 if(!v||![v.south,v.west,v.north,v.east].every(Number.isFinite)||v.south>=v.north||v.west>=v.east||v.south< -85.05113||v.north>85.05113||v.west< -180||v.east>180)return;
 return {south:v.south,west:v.west,north:v.north,east:v.east};
}
/** Summary metadata only. The worker revalidates hashes, formats and rights before selection. */
export async function preparedSatellites():Promise<PreparedSatellite[]>{
 const root=join(downloadRoot(),'packages');let entries;
 try{const s=await lstat(/*turbopackIgnore: true*/ root);if(!s.isDirectory()||s.isSymbolicLink())throw new DownloadError('준비 지도 폴더의 경로·권한을 확인하세요.',503);entries=await readdir(/*turbopackIgnore: true*/ root,{withFileTypes:true});}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}
 const candidates=entries.filter(e=>{try{jobId(e.name);return e.isDirectory()||e.isSymbolicLink();}catch{return false;}});if(candidates.length>100)throw new DownloadError('준비 지도100개 한도입니다. 지도 정리 상태를 확인하세요.',503);
 const result:PreparedSatellite[]=[];
 for(const entry of candidates){
  const id=entry.name,path=join(root,id,'manifest.json');let value:PreparedSatellite|null=null;
  try{
   if(entry.isSymbolicLink())throw Error();const s=await lstat(/*turbopackIgnore: true*/ path);if(!s.isFile()||s.size>8*1024**2)throw Error();const stamp=`${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
   if(summaries.get(path)?.stamp===stamp)value=summaries.get(path)!.value;
   else{
    const m=JSON.parse(await readFile(/*turbopackIgnore: true*/ path,'utf8'));if(m.version!==1||m.id!==id||!m.items||typeof m.items!=='object')throw Error();
    if(m.items.satellite){const item=m.items.satellite;let levels=Array.isArray(item.zoomLevels)?item.zoomLevels:[];if(!levels.length&&Number.isInteger(item.minZoom)&&Number.isInteger(item.maxZoom)&&item.maxZoom-item.minZoom<=19)levels=Array.from({length:item.maxZoom-item.minZoom+1},(_,i)=>item.minZoom+i);
     value={id,name:typeof m.name==='string'?m.name.slice(0,160):'준비된 위성 지도',createdAt:typeof m.createdAt==='string'&&m.createdAt.length<40&&Number.isFinite(Date.parse(m.createdAt))?m.createdAt:undefined,bounds:extent(item.requestedBounds)||extent(m.requestedBounds)||extent(item.bounds),zoomLevels:[...new Set<number>(levels.filter((n:unknown)=>Number.isInteger(n)&&Number(n)>=0&&Number(n)<=19))].sort((a,b)=>a-b),selectable:item.usageConfirmed===true,reason:item.usageConfirmed===true?undefined:'이용 권한 확인이 없는 패키지입니다.'};
    }
    if(summaries.size>=100)summaries.delete(summaries.keys().next().value!);summaries.set(path,{stamp,value});
   }
  }catch{value={id,name:'검사할 수 없는 패키지',zoomLevels:[],selectable:false,reason:'패키지 경로·manifest를 확인하세요. 기존 파일은 보존합니다.'};}
  if(value)result.push(value);
 }
 return result.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||'')||a.name.localeCompare(b.name,'ko')||a.id.localeCompare(b.id));
}
