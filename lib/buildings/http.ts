import {BuildingError} from './model';

export const buildingHeaders = {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'};
export function checkBuildingOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new BuildingError('같은 사이트에서만 건물 정보를 변경할 수 있습니다.', 403);
  if (origin) {
    try {
      const url = new URL(origin), host = request.headers.get('host') || new URL(request.url).host;
      if (!['http:', 'https:'].includes(url.protocol) || url.host !== host) throw Error();
    } catch {throw new BuildingError('같은 사이트에서만 건물 정보를 변경할 수 있습니다.', 403);}
  }
}
export async function buildingBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new BuildingError('Content-Type은 application/json이어야 합니다.', 415);
  }
  if (!request.body) throw new BuildingError('건물 정보를 입력하세요.');
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 32768) {await reader.cancel(); throw new BuildingError('요청은 최대 32KiB까지 지원합니다.', 413);}
      chunks.push(value);
    }
  } finally {reader.releaseLock();}
  try {return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
  catch {throw new BuildingError('올바른 JSON 형식으로 입력하세요.');}
}
export function buildingVersion(request: Request) {
  const value = request.headers.get('if-match');
  if (!value || !/^"[1-9]\d*"$/.test(value) || !Number.isSafeInteger(Number(value.slice(1, -1)))) {
    throw new BuildingError('If-Match에 현재 건물 버전을 지정하세요.', 428);
  }
  return Number(value.slice(1, -1));
}
export function buildingFailure(error: unknown) {
  if (error instanceof BuildingError && error.status < 500) return Response.json({error: error.message}, {status: error.status, headers: buildingHeaders});
  console.error('Building data operation failed:', error);
  return Response.json({error: error instanceof BuildingError ? error.message : '건물 데이터 폴더를 읽거나 쓸 수 없습니다. 저장 공간과 쓰기 권한을 확인하세요.'},
    {status: 503, headers: buildingHeaders});
}
