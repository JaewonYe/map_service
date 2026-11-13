import {getBuildingStore} from '../../../lib/buildings/store';
import {buildingBody, buildingFailure, buildingHeaders, checkBuildingOrigin} from '../../../lib/buildings/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {return Response.json({buildings: await getBuildingStore().list()}, {headers: buildingHeaders});}
  catch (error) {return buildingFailure(error);}
}
export async function POST(request: Request) {
  try {
    checkBuildingOrigin(request);
    const building = await getBuildingStore().create(await buildingBody(request));
    return Response.json({building}, {status: 201, headers: {...buildingHeaders, Location: `/api/buildings/${building.id}`}});
  } catch (error) {return buildingFailure(error);}
}
