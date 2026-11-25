import {mkdir,open,rename,readFile,lstat,readdir,statfs,rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {DownloadError,parsePlan,jobId,regions,tileCount,areaKm2} from './model';
import {downloadRoot,registry,assertNoMaintenance} from './active';
export const responseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export function json(v:unknown,status=200){return Response.json(v,{status,headers:responseHeaders});}
export function failure(e:unknown){return json({error:e instanceof DownloadError?e.message:'다운로드 관리 데이터를 처리하지 못했습니다. 저장 공간·권한과 worker 상태를 확인하세요.'},e instanceof DownloadError?e.status:503);}
export function origin(r:Request){const o=r.headers.get('origin');if(r.headers.get('sec-fetch-site')==='cross-site')throw new DownloadError('같은 사이트에서만 지도 작업을 요청할 수 있습니다.',403);if(o){try{const u=new URL(o);if(!['http:','https:'].includes(u.protocol)||u.host!==(r.headers.get('host')||new URL(r.url).host))throw Error();}catch{throw new DownloadError('같은 사이트에서만 지도 작업을 요청할 수 있습니다.',403);}}}
export async function body(r:Request){origin(r);if(r.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new DownloadError('JSON 요청이 필요합니다.',415);if(!r.body)throw new DownloadError('작업 설정을 입력하세요.');let n=0;const chunks:Buffer[]=[];for await(const c of r.body as any){n+=c.length;if(n>16384)throw new DownloadError('요청은 최대16KiB입니다.',413);chunks.push(Buffer.from(c));}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw new DownloadError('올바른 JSON을 입력하세요.');}}
export async function readJson(path:string,max=262144){const s=await lstat(/*turbopackIgnore: true*/ path);if(!s.isFile()||s.size>max)throw new DownloadError('작업 파일의 형식·크기가 잘못되었습니다.',503);return JSON.parse(await readFile(/*turbopackIgnore: true*/ path,'utf8'));}
export async function atomic(path:string,v:unknown){const temporary=`${path}.${randomUUID()}.tmp`;try{const f=await open(/*turbopackIgnore: true*/ temporary,'wx',0o600);try{await f.writeFile(JSON.stringify(v)+'\n');await f.sync();}finally{await f.close();}await rename(/*turbopackIgnore: true*/ temporary,path);}finally{await rm(/*turbopackIgnore: true*/ temporary,{force:true});}}
export async function listJobs(){let files:string[];try{files=await readdir(/*turbopackIgnore: true*/ join(downloadRoot(),'jobs'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return [];throw e;}const ids=files.filter(f=>f.endsWith('.request.json')).map(f=>jobId(f.slice(0,-13)));if(ids.length>100)throw new DownloadError('작업 기록100개 한도입니다. 백업 후 운영 절차에 따라 정리하세요.',503);return (await Promise.all(ids.map(async id=>{try{return await readJob(id);}catch(e){if(e instanceof DownloadError&&e.status===404)return null;throw e;}}))).filter(x=>x!==null).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));}
export async function readJob(id:string){jobId(id);try{const request=await readJson(join(downloadRoot(),'jobs',`${id}.request.json`),16384);let state;try{state=await readJson(join(downloadRoot(),'jobs',`${id}.state.json`));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}let cancelRequested=false;try{cancelRequested=(await lstat(/*turbopackIgnore: true*/ join(downloadRoot(),'jobs',`${id}.cancel.json`))).isFile();}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}return {...(state||{id,version:1,state:'queued',stage:'대기',createdAt:request.createdAt,updatedAt:request.createdAt,request,items:{}}),cancelRequested};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new DownloadError('작업을 찾을 수 없습니다.',404);throw e;}}
export async function overview(){let worker:any=null,providers:any=null;for(const [file,assign]of [['worker.json',(x:any)=>worker=x],['providers.json',(x:any)=>providers=x]] as const)try{assign(await readJson(join(downloadRoot(),file)));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}const r=await registry();let freeBytes:number|null=null;try{const fs=await statfs(/*turbopackIgnore: true*/ downloadRoot());freeBytes=fs.bavail*fs.bsize;}catch{}return {maintenance:await maintenanceInfo(),registry:r,worker:worker?{...worker,online:Date.now()-Date.parse(worker.updatedAt)<45000}:null,providers,freeBytes,serverStorage:'서버의 별도 다운로드 데이터 폴더',regions};}
let submitting=Promise.resolve();
async function exclusive<T>(action:()=>Promise<T>):Promise<T>{let release!:()=>void;const prior=submitting;submitting=new Promise<void>(done=>release=done);await prior;try{return await action();}finally{release();}}
export async function submit(v:any,type='download'){
 return exclusive(async()=>{await assertNoMaintenance();const jobs=await listJobs();if(jobs.length>=100||jobs.filter(j=>['queued','running'].includes(j.state)).length>=10)throw new DownloadError('동시 대기 작업은10개, 작업 기록은100개까지입니다.',429);const r=await registry();if(v.registryRevision!==r.revision)throw new DownloadError('등록 상태가 변경됐습니다. 다시 조회하고 요청하세요.',409);
  const id=randomUUID(),createdAt=new Date().toISOString();let request:any={version:1,id,createdAt,type};
  if(type==='download')request={...request,...parsePlan(v)};else if(type==='activate')request={...request,packageId:jobId(v.packageId),registryRevision:r.revision};else if(type==='reset')request={...request,registryRevision:r.revision};else if(type==='import'){if(v.confirmUsage!==true)throw new DownloadError('이전 패키지 이용 조건을 확인하세요.');request={...request,uploadId:jobId(v.uploadId),confirmUsage:true,registryRevision:r.revision};}else throw new DownloadError('지원하지 않는 작업입니다.');
  await mkdir(/*turbopackIgnore: true*/ join(downloadRoot(),'jobs'),{recursive:true});await atomic(join(downloadRoot(),'jobs',`${id}.request.json`),request);return {id,createdAt};
 });
}
export async function estimate(v:any){const p=parsePlan(v,false),info=await overview();return {...info,plan:p,areaKm2:areaKm2(p.bounds),tileCounts:{satellite:tileCount(p.bounds,p.levels.satellite.min,p.levels.satellite.max),elevation:tileCount(p.bounds,p.levels.elevation.min,p.levels.elevation.max)},demSourceTiles:(Math.ceil(p.bounds.east)-Math.floor(p.bounds.west))*(Math.ceil(p.bounds.north)-Math.floor(p.bounds.south)),bytesEstimate:null,pbfSourceBytes:info.providers?.osm?.regions?.[p.region]?.bytes??null,pbfSizeCheckedAt:info.providers?.osm?.regions?.[p.region]?.checkedAt??null,timeEstimate:null,explanation:'PBF는 선택 영역만 받지 않고 선택한 지역 원본 전체를 받습니다. '+(p.demProvider==='aws'?'고도는 필요한1도 원본 파일을 받은 뒤 자릅니다. ':'고도는 OpenTopography에서 선택 사각형의 GeoTIFF를 받습니다. ')+'제공처 크기가 확인되기 전 용량·시간은 미확정입니다.'};}
export async function cancel(id:string){return exclusive(async()=>{await assertNoMaintenance();const j=await readJob(id);if(!['queued','running'].includes(j.state))throw new DownloadError('진행 중인 작업만 취소할 수 있습니다.',409);await assertNoMaintenance();await atomic(join(downloadRoot(),'jobs',`${id}.cancel.json`),{requestedAt:new Date().toISOString()});return {id,cancelRequested:true};});}
export async function archive(id:string){await assertNoMaintenance();const j=await readJob(id);if(!j.packageId)throw new DownloadError('준비된 이전 패키지가 없습니다.',409);const file=join(downloadRoot(),'exports',`${jobId(j.packageId)}.zip`),s=await lstat(/*turbopackIgnore: true*/ file);if(!s.isFile())throw new DownloadError('패키지 파일이 잘못되었습니다.',503);await assertNoMaintenance();return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ file)) as any,{headers:{...responseHeaders,'Content-Type':'application/zip','Content-Length':String(s.size),'Content-Disposition':`attachment; filename="map-package-${j.packageId}.zip"`}});}
let uploading=0;
export async function upload(r:Request){
 origin(r);await assertNoMaintenance();if(r.headers.get('content-type')?.split(';')[0]!=='application/zip'||r.headers.get('x-map-confirm-usage')!=='true')throw new DownloadError('ZIP 형식과 이전 패키지 이용 조건 확인이 필요합니다.',415);
 const match=r.headers.get('if-match');if(!match||!/^"(?:0|[1-9]\d*)"$/.test(match))throw new DownloadError('If-Match에 현재 등록 revision이 필요합니다.',428);
 if(!r.body)throw new DownloadError('이전 패키지를 선택하세요.');
 const maximum=2*1024**3;let size=0;const id=randomUUID(),dir=join(downloadRoot(),'incoming'),file=join(dir,`${id}.zip`),part=file+'.part';await exclusive(async()=>{await assertNoMaintenance();if(uploading>=2)throw new DownloadError('패키지 업로드는 동시에2개까지입니다.',429);uploading++;});
 try{await mkdir(/*turbopackIgnore: true*/ dir,{recursive:true});const f=await open(/*turbopackIgnore: true*/ part,'wx',0o600);try{for await(const c of r.body as any){size+=c.length;if(size>maximum)throw new DownloadError('이전 ZIP은 최대2GiB입니다.',413);const fs=await statfs(/*turbopackIgnore: true*/ dir);if(fs.bavail*fs.bsize<c.length+512*1024**2)throw new DownloadError('이전 ZIP 저장 디스크가 부족합니다.',507);await f.write(c);}if(!size)throw new DownloadError('비어 있는 ZIP입니다.');await f.sync();}finally{await f.close();}await rename(/*turbopackIgnore: true*/ part,file);return await submit({uploadId:id,confirmUsage:true,registryRevision:Number(match.slice(1,-1))},'import');}
 catch(e){await rm(/*turbopackIgnore: true*/ file,{force:true});throw e;}finally{uploading--;await rm(/*turbopackIgnore: true*/ part,{force:true});}
}

export async function maintenanceInfo(){
 let pending:any=null;try{pending=await readJson(join(downloadRoot(),'maintenance.pending.json'),16384);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 let files:string[]=[];try{files=await readdir(/*turbopackIgnore: true*/ join(downloadRoot(),'maintenance'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 const states=files.filter(f=>f.endsWith('.state.json'));if(states.length>100)throw new DownloadError('지도 정리 기록100개 한도입니다. 백업 보관 상태를 확인하세요.',503);
 const operations=await Promise.all(states.map(f=>readJson(join(downloadRoot(),'maintenance',jobId(f.slice(0,-11))+'.state.json'))));
 if(pending&&!operations.some(o=>o.id===pending.id))operations.push({id:pending.id,request:pending,state:'queued',stage:'지도 정리 대기',createdAt:pending.createdAt});
 // Expose only operation summaries; journals and host paths stay on the worker.
 return {pending:pending?.id??null,operations:operations.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),backupCount:operations.filter(o=>o.backupId&&!operations.some(r=>r.request.operation==='restore'&&r.request.backupId===o.backupId&&r.state==='completed')).length};
}
export async function requestMaintenance(v:any){
 return exclusive(async()=>{
  const phrases={delete:'지도 삭제',clear:'전체 초기화',restore:'백업 복원'} as const;
  const operation=v.operation as keyof typeof phrases;
  if(!Object.hasOwn(phrases,operation)||v.confirmation!==phrases[operation])throw new DownloadError('확인 문구를 정확히 입력하세요.');
  await assertNoMaintenance();if(uploading)throw new DownloadError('ZIP 업로드가 진행 중입니다. 업로드 완료·취소 후 다시 시도하세요.',409);
  const r=await registry();if(v.registryRevision!==r.revision)throw new DownloadError('등록 상태가 변경됐습니다. 다시 조회하고 확인하세요.',409);
  const worker=await readJson(join(downloadRoot(),'worker.json')).catch(()=>null);
  if(worker?.maintenanceVersion!==1||!Number.isFinite(Date.parse(worker.updatedAt))||Date.now()-Date.parse(worker.updatedAt)>45000)throw new DownloadError('삭제 기능을 지원하는 worker가 연결되지 않았습니다. web과 worker를 함께 업데이트·실행하세요.',503);
  if(v.includeLegacy!==undefined&&typeof v.includeLegacy!=='boolean')throw new DownloadError('초기화 범위를 확인하세요.');
  if(operation==='clear'&&v.includeLegacy&&!worker.legacyReset)throw new DownloadError('수동 지도 초기화 마운트가 없습니다. worker 설정을 업데이트하세요.',409);
  const info=await maintenanceInfo();if(info.operations.length>=100||operation!=='restore'&&info.backupCount>=20)throw new DownloadError('백업20개/정리 기록100개 한도입니다. 백업을 점검한 후 진행하세요.',409);
  const jobs=await listJobs();if(operation!=='clear'&&jobs.some(j=>['queued','running'].includes(j.state)))throw new DownloadError('다운로드 완료·취소 후 삭제 또는 복원하세요.',409);
  const id=randomUUID(),createdAt=new Date().toISOString();const request:any={version:1,type:'maintenance',id,createdAt,operation,confirmation:phrases[operation],registryRevision:r.revision,includeLegacy:operation==='clear'&&v.includeLegacy===true,ready:false};
  if(operation==='delete'){const target=await readJob(jobId(v.targetId));if(['queued','running'].includes(target.state))throw new DownloadError('작업을 취소한 뒤 삭제하세요.',409);request.targetId=target.id;}
  if(operation==='restore'){request.backupId=jobId(v.backupId);if(!info.operations.some(o=>o.backupId===request.backupId&&o.state==='completed'))throw new DownloadError('완료된 백업을 선택하세요.',409);}
  await mkdir(/*turbopackIgnore: true*/ downloadRoot(),{recursive:true});await atomic(join(downloadRoot(),'maintenance.pending.json'),request);
  try{
   const [{releaseStreetCatalog},{releaseCatalogs},{releaseOsmReader},{releaseElevationReader}]=await Promise.all([import('../maps/layers'),import('../tiles/catalog'),import('../osm/index'),import('../maps/elevation')]);
   await releaseStreetCatalog();await Promise.all([releaseCatalogs(),releaseOsmReader()]);releaseElevationReader();
   const gate=await readJson(join(downloadRoot(),'maintenance.pending.json'),16384);if(gate.id!==id)throw new DownloadError('지도 정리 요청이 만료됐습니다. 다시 확인하세요.',409);
   request.ready=true;await atomic(join(downloadRoot(),'maintenance.pending.json'),request);
  }catch(e){await rm(/*turbopackIgnore: true*/ join(downloadRoot(),'maintenance.pending.json'),{force:true});throw e;}
  return {id,maintenance:true,createdAt};
 });
}
