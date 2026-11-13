import {getBuildingStore} from '../../../../lib/buildings/store';
import {buildingBody, buildingFailure, buildingHeaders, buildingVersion, checkBuildingOrigin} from '../../../../lib/buildings/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = {params: Promise<{id: string}>};
export async function GET(_request: Request, context: Context) {
  try {
    const {id} = await context.params, building = await getBuildingStore().get(id);
    return Response.json({building}, {headers: {...buildingHeaders, ETag: `"${building.version}"`}});
  } catch (error) {return buildingFailure(error);}
}
export async function PUT(request: Request, context: Context) {
  try {
    checkBuildingOrigin(request);
    const {id} = await context.params, version = buildingVersion(request);
    const building = await getBuildingStore().update(id, await buildingBody(request), version);
    return Response.json({building}, {headers: {...buildingHeaders, ETag: `"${building.version}"`}});
  } catch (error) {return buildingFailure(error);}
}
export async function DELETE(request: Request, context: Context) {
  try {
    checkBuildingOrigin(request);
    const {id} = await context.params;
    await getBuildingStore().delete(id, buildingVersion(request));
    return new Response(null, {status: 204, headers: buildingHeaders});
  } catch (error) {return buildingFailure(error);}
}
