import {getTpk,xyz} from '../../../../../../lib/tiles/tpk';
import {failure} from '../../../../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{z:string;x:string;y:string}>}){
  try{
    const {z,x,y}=await context.params;const coords=xyz(z,x,y);
    const tile=await (await getTpk()).tile(...coords);
    if(!tile)return new Response(null,{status:404,headers:{'Cache-Control':'public,max-age=60'}});
    const headers={'Content-Type':tile.mime,'Content-Length':String(tile.bytes.length),'ETag':tile.etag,
      'Cache-Control':'private,max-age=3600','X-Content-Type-Options':'nosniff'};
    if(request.headers.get('if-none-match')===tile.etag)return new Response(null,{status:304,headers:{'ETag':tile.etag,'Cache-Control':headers['Cache-Control']}});
    return new Response(new Uint8Array(tile.bytes),{headers});
  }catch(error){return failure(error);}
}
