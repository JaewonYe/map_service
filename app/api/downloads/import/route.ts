import {upload,json,failure} from '../../../../lib/downloads/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function POST(r:Request){try{return json(await upload(r),202);}catch(e){return failure(e);}}
