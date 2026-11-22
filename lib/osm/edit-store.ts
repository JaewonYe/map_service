import {randomUUID} from 'node:crypto';
import {lstat,mkdir,open,readFile,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {objectKey,OsmEditError,validateObject,type ObjectValue} from './edit-model';
export type Edit={key:string;action:'update'|'hide'|'add';baseFingerprint:string|null;dataset:string;value:ObjectValue;updatedAt:string};
export type EditSnapshot={version:1;revision:number;edits:Edit[]};
const queues=new Map<string,Promise<unknown>>();
export class OsmEditStore {
 constructor(readonly directory:string){}
 async read():Promise<EditSnapshot>{
  try{
   const path=join(this.directory,'edits.json'),s=await lstat(/*turbopackIgnore: true*/ path);
   if(!s.isFile()||s.size>8*1024*1024)throw Error();
   const d=JSON.parse(await readFile(/*turbopackIgnore: true*/ path,'utf8')) as EditSnapshot;
   if(d.version!==1||!Number.isSafeInteger(d.revision)||d.revision<0||!Array.isArray(d.edits)||d.edits.length>500)throw Error();
   const keys=new Set<string>();for(const e of d.edits){objectKey(e.key);if(keys.has(e.key)||!['update','hide','add'].includes(e.action)||typeof e.dataset!=='string'||!/^\d{4}-/.test(e.updatedAt)||!(e.baseFingerprint===null||/^[a-f0-9]{64}$/.test(e.baseFingerprint)))throw Error();keys.add(e.key);validateObject(e.value);}
   return d;
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {version:1,revision:0,edits:[]};throw new OsmEditError('로컬 수정 저장소를 읽을 수 없습니다. 원본 파일을 보존하고 서버 로그/복구본을 확인하세요.',503);}
 }
 async mutate(expected:number,operation:(snapshot:EditSnapshot)=>Promise<void>):Promise<EditSnapshot>{
  const prior=queues.get(this.directory)||Promise.resolve();
  const task=prior.then(async()=>{
   const snapshot=await this.read();
   if(snapshot.revision!==expected)throw new OsmEditError('다른 화면에서 변경된 일반 지도입니다. 초안은 유지됩니다. 최신 수정 내역을 확인하세요.',409);
   await operation(snapshot);snapshot.revision++;
   if(snapshot.edits.length>500)throw new OsmEditError('로컬 수정은 최대 500개입니다. 불필요한 수정을 복원하세요.',409);
   const text=JSON.stringify(snapshot);if(Buffer.byteLength(text)+1>8*1024*1024)throw new OsmEditError('로컬 수정 저장소는 최대 8MiB입니다.',413);
   await mkdir(/*turbopackIgnore: true*/ this.directory,{recursive:true});
   const temporary=join(this.directory,`.edits-${randomUUID()}.tmp`);
   try{const file=await open(/*turbopackIgnore: true*/ temporary,'wx',0o600);try{await file.writeFile(text+'\n');await file.sync();}finally{await file.close();}await rename(/*turbopackIgnore: true*/ temporary,join(this.directory,'edits.json'));}
   finally{await rm(/*turbopackIgnore: true*/ temporary,{force:true});}
   return snapshot;
  });queues.set(this.directory,task.catch(()=>{}));return task;
 }
}
export function getOsmEdits(){return new OsmEditStore(resolve(/*turbopackIgnore: true*/ process.env.OSM_EDITS_DIR||'data/osm-edits'));}
