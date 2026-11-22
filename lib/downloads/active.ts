import {readFile,lstat,realpath} from 'node:fs/promises';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {DownloadError,jobId,type DownloadKind} from './model';
export const downloadRoot=()=>resolve(/*turbopackIgnore: true*/ process.env.MAP_DOWNLOADS_DIR||'data/downloads');
export type Registry={version:1;revision:number;layers:Partial<Record<DownloadKind,string>>};
export async function registry():Promise<Registry>{
 const path=join(downloadRoot(),'active.json');
 try{const s=await lstat(/*turbopackIgnore: true*/ path);if(!s.isFile()||s.size>8192)throw Error();const v=JSON.parse(await readFile(/*turbopackIgnore: true*/ path,'utf8'));if(v.version!==1||!Number.isSafeInteger(v.revision)||v.revision<0||!v.layers||typeof v.layers!=='object'||Array.isArray(v.layers))throw Error();for(const [k,id]of Object.entries(v.layers)){if(!['osm','elevation','satellite'].includes(k))throw Error();jobId(id);}return v;}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {version:1,revision:0,layers:{}};throw new DownloadError('다운로드 등록 정보를 읽을 수 없습니다. 기존 파일을 보존하고 백업·권한을 확인하세요.',503);}
}
export async function managedDirectory(kind:DownloadKind):Promise<string|null>{
 const r=await registry(),id=r.layers[kind];if(!id)return null;
 const root=await realpath(/*turbopackIgnore: true*/ downloadRoot()),directory=await realpath(/*turbopackIgnore: true*/ join(root,'packages',id,kind));const rel=relative(root,directory);if(rel.startsWith('..')||isAbsolute(rel))throw new DownloadError('등록된 지도 경로가 데이터 폴더를 벗어납니다.',503);return directory;
}
