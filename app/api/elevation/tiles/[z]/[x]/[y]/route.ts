import {createHash} from 'node:crypto';
import {xyz} from '../../../../../../../lib/tiles/tpk';
import {getElevation} from '../../../../../../../lib/maps/elevation';
import {failure} from '../../../../../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{z:string;x:string;y:string}>}){
  try {
    const {z,x,y}=await context.params,coordinates=xyz(z,x,y);
    const bytes=await (await getElevation()).tile(...coordinates);
    if(!bytes)return new Response(null,{status:404,headers:{'Cache-Control':'private,max-age=60'}});
    const etag='"'+createHash('sha256').update(bytes).digest('hex')+'"';
    const headers={'Content-Type':'image/png','Cache-Control':'private,max-age=3600','ETag':etag,'X-Content-Type-Options':'nosniff'};
    if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers});
    return new Response(new Uint8Array(bytes),{headers});
  }catch(error){return failure(error);}
}
