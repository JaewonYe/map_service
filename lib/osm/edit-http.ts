import {OsmEditError} from './edit-model';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export function fail(error:unknown){return Response.json({error:error instanceof OsmEditError?error.message:'일반 지도 데이터를 읽거나 저장하지 못했습니다. 준비 상태·저장 공간·권한을 확인하세요.'},{status:error instanceof OsmEditError?error.status:(error as any)?.status||503,headers});}
export function json(value:unknown){const text=JSON.stringify(value);if(Buffer.byteLength(text)>1024*1024)throw new OsmEditError('응답이 1MiB를 초과합니다. 조회 범위를 줄이세요.',422);return new Response(text,{headers:{...headers,'Content-Type':'application/json'}});}

export async function editBody(request:Request){
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new OsmEditError('Content-Type은 application/json이어야 합니다.',415);
 if(!request.body)throw new OsmEditError('일반 지도 수정 내용을 입력하세요.');
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>32768){await reader.cancel();throw new OsmEditError('요청은 최대 32KiB입니다.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new OsmEditError('올바른 JSON으로 입력하세요.');}
}
export function editOrigin(request:Request){
 if(request.headers.get('sec-fetch-site')==='cross-site')throw new OsmEditError('같은 사이트에서만 일반 지도를 수정할 수 있습니다.',403);
 const origin=request.headers.get('origin');if(!origin)return;
 try{const o=new URL(origin),host=request.headers.get('host')||new URL(request.url).host;if(!['http:','https:'].includes(o.protocol)||o.host!==host)throw Error();}catch{throw new OsmEditError('같은 사이트에서만 일반 지도를 수정할 수 있습니다.',403);}
}
