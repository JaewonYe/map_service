import {readJob,cancel,submit,body,json,failure} from '../../../../lib/downloads/server';
import {DownloadError} from '../../../../lib/downloads/model';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(r:Request,c:{params:Promise<{id:string}>}){try{return json(await readJob((await c.params).id));}catch(e){return failure(e);}}
export async function POST(r:Request,c:{params:Promise<{id:string}>}){try{const v=await body(r),id=(await c.params).id;if(v.action==='cancel')return json(await cancel(id),202);if(v.action==='retry'){const j=await readJob(id);if(!['failed','partial','cancelled','interrupted'].includes(j.state))throw new DownloadError('현재 작업에서는 요청한 동작을 실행할 수 없습니다.',409);return json(await submit({...j.request,registryRevision:v.registryRevision}),202);}throw new DownloadError('지원하지 않는 작업입니다.');}catch(e){return failure(e);}}
