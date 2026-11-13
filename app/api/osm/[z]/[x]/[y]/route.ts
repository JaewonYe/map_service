import {createHash} from 'node:crypto';
import {xyz} from '../../../../../../lib/tiles/tpk';
import {osmTile} from '../../../../../../lib/tiles/osm';
import {failure} from '../../../../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{z:string;x:string;y:string}>}){
  try{
    const {z,x,y}=await context.params;const tile=await osmTile(...xyz(z,x,y));
    if(!tile)return new Response(null,{status:404,headers:{'Cache-Control':'private,max-age=60'}});
    const etag='"'+createHash('sha256').update(tile.bytes).digest('hex')+'"';
    const headers={'Content-Type':tile.mime,'Cache-Control':'private,max-age=3600','X-Content-Type-Options':'nosniff','ETag':etag};
    if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
    return new Response(new Uint8Array(tile.bytes),{headers});
  }catch(error){return failure(error);}
}
