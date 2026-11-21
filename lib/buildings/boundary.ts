import {areaSquareMeters, distanceMeters, isSelfIntersecting, segmentMeters, type Coordinate} from '../map-measure';

export const MAX_BOUNDARY_VERTICES = 128;
export type Boundary = {type: 'Polygon'; coordinates: [number, number][][]};
export class BoundaryError extends Error {}

export function boundaryPoint(point: Coordinate): Coordinate {
  const [lat, lon] = point;
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) ||
      Math.abs(lat) > 85.05112878 || Math.abs(lon) > 180) throw new BoundaryError('경계 좌표는 허용 범위의 [경도, 위도] 숫자여야 합니다.');
  // Keep rounding at the Mercator limit inside the supported latitude domain.
  const roundedLat = Math.sign(lat) * Math.min(Math.abs(Number(lat.toFixed(7))), 85.0511287);
  return [roundedLat || 0, Number(lon.toFixed(7)) || 0];
}

/** Single EPSG:4326 ring. Persist closed, counterclockwise, with a deterministic first vertex. */
export function normalizeBoundary(value: unknown): Boundary {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BoundaryError('경계는 단일 GeoJSON Polygon이어야 합니다.');
  const raw = value as {type?: unknown; coordinates?: unknown};
  if (raw.type !== 'Polygon' || !Array.isArray(raw.coordinates) || raw.coordinates.length !== 1 || !Array.isArray(raw.coordinates[0])) {
    throw new BoundaryError('경계는 구멍 없는 단일 Polygon ring만 지원합니다.');
  }
  const input = raw.coordinates[0];
  if (input.length < 3 || input.length > MAX_BOUNDARY_VERTICES + 1) throw new BoundaryError(`경계는 3~${MAX_BOUNDARY_VERTICES}개 정점을 지원합니다.`);
  let ring: [number, number][] = input.map(value => {
    if (!Array.isArray(value) || value.length !== 2) throw new BoundaryError('각 경계 정점은 [경도, 위도] 두 숫자여야 합니다.');
    const [lat, lon] = boundaryPoint([value[1], value[0]]);
    return [lon, lat];
  });
  const equal = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
  if (equal(ring[0], ring.at(-1)!)) ring = ring.slice(0, -1);
  if (ring.length < 3 || ring.length > MAX_BOUNDARY_VERTICES || new Set(ring.map(p => p.join(','))).size !== ring.length) {
    throw new BoundaryError('서로 다른 정점이 3개 이상 필요하며 중복 정점은 허용하지 않습니다.');
  }
  const longitudes = ring.map(p => p[0]);
  if (Math.max(...longitudes) - Math.min(...longitudes) >= 180) throw new BoundaryError('날짜변경선을 가로지르거나 경도 폭 180도 이상인 경계는 지원하지 않습니다.');
  const points: Coordinate[] = ring.map(([lon, lat]) => [lat, lon]);
  if (isSelfIntersecting(points)) throw new BoundaryError('경계 선이 교차하거나 서로 닿습니다.');
  let signed = 0;
  const origin = ring[0];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i + ring.length - 1) % ring.length], b = ring[i], c = ring[(i + 1) % ring.length];
    const p = (b[0]-a[0])*(c[1]-b[1]), q = (b[1]-a[1])*(c[0]-b[0]);
    if (Math.abs(p-q) <= Number.EPSILON * 32 * (Math.abs(p)+Math.abs(q))) throw new BoundaryError('같은 선 위의 퇴화 정점은 제거하세요.');
    const next = ring[(i+1) % ring.length];
    signed += (b[0]-origin[0])*(next[1]-origin[1])-(next[0]-origin[0])*(b[1]-origin[1]);
  }
  if (!Number.isFinite(signed) || signed === 0 || areaSquareMeters(points) <= 0) throw new BoundaryError('경계의 면적은 양수여야 합니다.');
  if (signed < 0) ring.reverse();
  let first = 0;
  for (let i = 1; i < ring.length; i++) if (ring[i][0] < ring[first][0] || ring[i][0] === ring[first][0] && ring[i][1] < ring[first][1]) first = i;
  ring = [...ring.slice(first), ...ring.slice(0, first)];
  return {type: 'Polygon', coordinates: [[...ring, [...ring[0]]]]};
}

export function boundaryPoints(boundary: Boundary): Coordinate[] {
  return boundary.coordinates[0].slice(0, -1).map(([lon, lat]) => [lat, lon]);
}
export function boundaryFromPoints(points: readonly Coordinate[]): Boundary {
  return normalizeBoundary({type: 'Polygon', coordinates: [points.map(([lat, lon]) => [lon, lat])]});
}
export function boundaryMetrics(boundary: Boundary) {
  const points = boundaryPoints(boundary);
  return {area: areaSquareMeters(points), perimeter: distanceMeters(points) + segmentMeters(points.at(-1)!, points[0])};
}
