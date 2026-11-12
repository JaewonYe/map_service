import {getCatalog} from '../../../lib/tiles/catalog';
import {osmInfo} from '../../../lib/tiles/osm';
import {failure} from '../../../lib/tiles/http';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
  try{return Response.json({...await (await getCatalog()).info(),osm:await osmInfo()},{headers:{'Cache-Control':'no-store'}});}
  catch(error){return failure(error);}
}
