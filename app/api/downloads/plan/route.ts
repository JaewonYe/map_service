import {estimate,body,json,failure} from '../../../../lib/downloads/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function POST(r:Request){try{return json(await estimate(await body(r)));}catch(e){return failure(e);}}
