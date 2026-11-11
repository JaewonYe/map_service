import {xyz} from '../../../../../../lib/tiles/tpk';
import {osmTile} from '../../../../../../lib/tiles/osm';
import {failure} from '../../../../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(_request:Request,context:{params:Promise<{z:string;x:string;y:string}>}){
  try{
    const {z,x,y}=await context.params;const tile=await osmTile(...xyz(z,x,y));
    return tile?new Response(new Uint8Array(tile.bytes),{headers:{'Content-Type':tile.mime,'Cache-Control':'private,max-age=3600','X-Content-Type-Options':'nosniff'}}):new Response(null,{status:404});
  }catch(error){return failure(error);}
}
