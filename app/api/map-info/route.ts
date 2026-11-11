import {getTpk} from '../../../lib/tiles/tpk';
import {osmInfo} from '../../../lib/tiles/osm';
import {failure} from '../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  try{return Response.json({...await (await getTpk()).info(),osm:await osmInfo()},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
