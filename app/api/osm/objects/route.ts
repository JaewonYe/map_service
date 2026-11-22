import {objects,change} from '../../../../lib/osm/edit-service';
import {OsmEditError} from '../../../../lib/osm/edit-model';
export const runtime='nodejs',dynamic='force-dynamic';
import {json,fail,editBody,editOrigin} from '../../../../lib/osm/edit-http';
export async function GET(request:Request){try{return json(await objects(request));}catch(error){return fail(error);}}
export async function POST(request:Request){try{editOrigin(request);const match=request.headers.get('if-match');if(!match||!/^"(?:0|[1-9]\d*)"$/.test(match)||!Number.isSafeInteger(Number(match.slice(1,-1))))throw new OsmEditError('If-Match에 현재 수정 저장소 revision이 필요합니다.',428);return json(await change(await editBody(request),Number(match.slice(1,-1))));}catch(error){return fail(error);}}
