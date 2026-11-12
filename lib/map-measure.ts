export type Coordinate = readonly [latitude: number, longitude: number];
export const EARTH_RADIUS_METERS = 6371008.8;
const RAD = Math.PI / 180;

function check(point: Coordinate) {
  if (!point.every(Number.isFinite) || Math.abs(point[0]) > 90) {
    throw new RangeError('Measurement requires finite latitude/longitude coordinates');
  }
}

/** Great-circle length on the IUGG mean-radius sphere, independent of map zoom. */
export function segmentMeters(a: Coordinate, b: Coordinate): number {
  check(a); check(b);
  const latitude = (b[0] - a[0]) * RAD, longitude = (b[1] - a[1]) * RAD;
  const h = Math.sin(latitude / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function distanceMeters(points: readonly Coordinate[]): number {
  return points.slice(1).reduce((sum, point, i) => sum + segmentMeters(points[i], point), 0);
}

function vector(point: Coordinate): [number, number, number] {
  check(point);
  const latitude = point[0] * RAD, longitude = point[1] * RAD;
  return [Math.cos(latitude) * Math.cos(longitude), Math.cos(latitude) * Math.sin(longitude), Math.sin(latitude)];
}
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, value, i) => sum + value * b[i], 0);

/** Signed spherical triangles also handle concave rings and the date line. */
export function areaSquareMeters(points: readonly Coordinate[]): number {
  if (points.length < 3) return 0;
  const a = vector(points[0]); let excess = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const b = vector(points[i]), c = vector(points[i + 1]);
    // Subtraction before the cross product retains precision for small parcels.
    const u = b.map((value, index) => value - a[index]), v = c.map((value, index) => value - a[index]);
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    excess += 2 * Math.atan2(dot(a, cross), 1 + dot(a, b) + dot(b, c) + dot(c, a));
  }
  const sphere = 4 * Math.PI, size = Math.abs(excess) % sphere;
  const area = Math.min(size, sphere - size) * EARTH_RADIUS_METERS ** 2;
  return area < 1e-6 ? 0 : area;
}

type Point = readonly [number, number];
function orientation(a: Point, b: Point, c: Point) {
  const p = (b[0] - a[0]) * (c[1] - a[1]), q = (b[1] - a[1]) * (c[0] - a[0]);
  return Math.abs(p - q) <= Number.EPSILON * 16 * (Math.abs(p) + Math.abs(q)) ? 0 : Math.sign(p - q);
}
function onSegment(a: Point, b: Point, c: Point) {
  return c[0] >= Math.min(a[0], b[0]) && c[0] <= Math.max(a[0], b[0]) &&
    c[1] >= Math.min(a[1], b[1]) && c[1] <= Math.max(a[1], b[1]);
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const abC = orientation(a, b, c), abD = orientation(a, b, d), cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0 ||
    abC === 0 && onSegment(a, b, c) || abD === 0 && onSegment(a, b, d) ||
    cdA === 0 && onSegment(c, d, a) || cdB === 0 && onSegment(c, d, b);
}
export function isSelfIntersecting(points: readonly Coordinate[]): boolean {
  let ring = [...points];
  if (ring.length > 3 && segmentMeters(ring[0], ring.at(-1)!) < 1e-6) ring = ring.slice(0, -1);
  if (ring.length < 4) return false;
  let previous = ring[0][1];
  const projected: Point[] = ring.map(point => {
    check(point);
    const longitude = previous + ((point[1] - previous + 180) % 360 + 360) % 360 - 180;
    previous = longitude;
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, point[0]));
    return [longitude * RAD, Math.log(Math.tan(Math.PI / 4 + latitude * RAD / 2))];
  });
  for (let i = 0; i < projected.length; i++) for (let j = i + 1; j < projected.length; j++) {
    if (j === i + 1 || i === 0 && j === projected.length - 1) continue;
    if (intersects(projected[i], projected[(i + 1) % projected.length], projected[j], projected[(j + 1) % projected.length])) return true;
  }
  return false;
}

const number = new Intl.NumberFormat('ko-KR', {maximumFractionDigits: 2});
export function formatDistance(meters: number) {
  return meters >= 1000 ? `${number.format(meters / 1000)} km` : `${number.format(meters)} m`;
}
export function formatArea(squareMeters: number) {
  return squareMeters >= 1000000 ? `${number.format(squareMeters / 1000000)} km²` : `${number.format(squareMeters)} m²`;
}
