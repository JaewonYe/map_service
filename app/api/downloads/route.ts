import {overview,listJobs,submit,body,json,failure} from '../../../lib/downloads/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(){try{return json({...await overview(),jobs:await listJobs()});}catch(e){return failure(e);}}
export async function POST(r:Request){try{const v=await body(r);return json(await submit(v,v.action||'download'),202);}catch(e){return failure(e);}}
