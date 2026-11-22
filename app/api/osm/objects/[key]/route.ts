import {editView,detail} from '../../../../../lib/osm/edit-service';
import {objectKey,OsmEditError} from '../../../../../lib/osm/edit-model';
import {json,fail} from '../../../../../lib/osm/edit-http';
export const runtime='nodejs',dynamic='force-dynamic';
export async function GET(request:Request,context:{params:Promise<{key:string}>}){try{const key=objectKey((await context.params).key),{index,snapshot}=await editView(),object=detail(index,snapshot,key);if(!object)throw new OsmEditError('일반 지도 객체가 없습니다.',404);return json({revision:snapshot.revision,dataset:index.revision,object,original:index.source(key),bounds:index.metadata.bounds});}catch(error){return fail(error);}}
