import {archive,failure} from '../../../../../lib/downloads/server';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(r:Request,c:{params:Promise<{id:string}>}){try{return await archive((await c.params).id);}catch(e){return failure(e);}}
