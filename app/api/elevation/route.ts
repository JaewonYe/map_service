import {getElevation} from '../../../lib/maps/elevation';
import {TileError} from '../../../lib/tiles/tpk';
import {failure} from '../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try {
    const search=new URL(request.url).searchParams;
    const latText=search.get('lat'),lonText=search.get('lon');
    const lat=Number(latText),lon=Number(lonText);
    if(!latText?.trim()||!lonText?.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85.05112878||Math.abs(lon)>180)
      throw new TileError('lat and lon must be valid Web Mercator coordinates',400);
    return Response.json(await (await getElevation()).sample(lat,lon),{headers:{'Cache-Control':'private,max-age=60'}});
  }catch(error){return failure(error);}
}
