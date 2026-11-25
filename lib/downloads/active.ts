import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {DownloadError,jobId,type DownloadKind} from './model';
export const downloadRoot=()=>resolve(/*turbopackIgnore: true*/ process.env.MAP_DOWNLOADS_DIR||'data/downloads');
export type Registry={version:1;revision:number;layers:Partial<Record<DownloadKind,string>>;satellitePackages?:string[]};
/** Legacy registries select one satellite package. Only explicit activations add others. */
export function satellitePackages(r:Registry):string[]{return r.satellitePackages??(r.layers.satellite?[r.layers.satellite]:[]);}
export async function registry():Promise<Registry>{
 const path=join(downloadRoot(),'active.json');
 try{const s=await lstat(/*turbopackIgnore: true*/ path);if(!s.isFile()||s.size>8192)throw Error();const v=JSON.parse(await readFile(/*turbopackIgnore: true*/ path,'utf8'));if(v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<0||!v.layers||typeof v.layers!=='object'||Array.isArray(v.layers))throw Error();for(const [k,id]of Object.entries(v.layers)){if(!['osm','elevation','satellite'].includes(k))throw Error();jobId(id);}
 if(v.satellitePackages!==undefined){const ids=v.satellitePackages;if(!Array.isArray(ids)||ids.length>32||new Set(ids).size!==ids.length||ids.at(-1)!==v.layers.satellite)throw Error();for(const id of ids)jobId(id);}
 return v;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {version:1,revision:0,layers:{}};throw new DownloadError('다운로드 등록 정보를 읽을 수 없습니다. 기존 파일을 보존하고 백업·권한을 확인하세요.',503);}
}
async function packageDirectory(id:string,kind:DownloadKind):Promise<string>{
 const root=await realpath(/*turbopackIgnore: true*/ downloadRoot()),directory=await realpath(/*turbopackIgnore: true*/ join(root,'packages',id,kind));const rel=relative(root,directory);if(rel.startsWith('..')||isAbsolute(rel))throw new DownloadError('등록된 지도 경로가 데이터 폴더를 벗어납니다.',503);return directory;
}
export async function assertNoMaintenance(){
 try{await lstat(/*turbopackIgnore: true*/ join(downloadRoot(),'maintenance.pending.json'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e;}
 throw new DownloadError('지도 삭제·초기화·복원 중입니다. 정리가 끝난 뒤 다시 조회하세요.',503);
}
export async function managedSatellitePackages():Promise<Array<{id:string;directory:string}>>{
 await assertNoMaintenance();const r=await registry();return Promise.all(satellitePackages(r).map(async id=>({id,directory:await packageDirectory(id,'satellite')})));
}
export async function managedDirectory(kind:DownloadKind):Promise<string|null>{
 await assertNoMaintenance();const r=await registry(),id=r.layers[kind];if(!id)return null;
 return packageDirectory(id,kind);
}
