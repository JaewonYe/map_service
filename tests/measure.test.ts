import test from 'node:test';
import assert from 'node:assert/strict';
import {areaSquareMeters, distanceMeters, EARTH_RADIUS_METERS, formatArea, formatDistance, isSelfIntersecting, segmentMeters, type Coordinate} from '../lib/map-measure';

test('one degree on the equator matches the known spherical arc length', () => {
  const distance = segmentMeters([0, 0], [0, 1]);
  assert.ok(Math.abs(distance - 111195.0802335329) < 1e-6);
  assert.equal(segmentMeters([36.6, 126.2], [36.6, 126.2]), 0);
});
test('path distance adds segments without closing the line', () => {
  assert.equal(distanceMeters([]), 0); assert.equal(distanceMeters([[0, 0]]), 0);
  const route: Coordinate[] = [[0, 0], [0, 1], [1, 1]];
  assert.ok(Math.abs(distanceMeters(route) - 2 * 111195.0802335329) < 1e-6);
  assert.ok(Math.abs(distanceMeters(route) - distanceMeters([...route].reverse())) < 1e-6);
});
test('an octant triangle covers one eighth of the sphere in either winding direction', () => {
  const triangle: Coordinate[] = [[0, 0], [0, 90], [90, 0]];
  const expected = Math.PI * EARTH_RADIUS_METERS ** 2 / 2;
  assert.ok(Math.abs(areaSquareMeters(triangle) - expected) < 1);
  assert.equal(areaSquareMeters([...triangle].reverse()), areaSquareMeters(triangle));
  assert.ok(Math.abs(areaSquareMeters([...triangle, triangle[0]]) - expected) < 1);
});
test('date-line distance and area use the short crossing', () => {
  assert.ok(Math.abs(segmentMeters([0, 179], [0, -179]) - 2 * 111195.0802335329) < 1e-6);
  const crossing: Coordinate[] = [[0, 179], [0, -179], [1, -179], [1, 179]];
  const normal: Coordinate[] = [[0, -1], [0, 1], [1, 1], [1, -1]];
  assert.ok(Math.abs(areaSquareMeters(crossing) / areaSquareMeters(normal) - 1) < 1e-10);
  assert.equal(isSelfIntersecting(crossing), false);
});
test('meter-scale area near Taean retains numerical precision', () => {
  const lat = 36.597889, lng = 126.240136, dLat = 180 / Math.PI / EARTH_RADIUS_METERS;
  const dLng = dLat / Math.cos(lat * Math.PI / 180);
  const square: Coordinate[] = [[lat, lng], [lat, lng + dLng], [lat + dLat, lng + dLng], [lat + dLat, lng]];
  assert.ok(Math.abs(areaSquareMeters(square) - 1) < 1e-5);
});
test('incomplete and collinear polygons have no measurable area', () => {
  assert.equal(areaSquareMeters([]), 0); assert.equal(areaSquareMeters([[0, 0], [0, 1]]), 0);
  assert.equal(areaSquareMeters([[0, 0], [0, 1], [0, 2]]), 0);
});
test('self-crossing and touching polygons are detected without rejecting concave rings', () => {
  assert.equal(isSelfIntersecting([[0, 0], [1, 1], [0, 1], [1, 0]]), true);
  const concave: Coordinate[] = [[0, 0], [0, 2], [2, 2], [1, 1], [2, 0]];
  assert.equal(isSelfIntersecting(concave), false);
  assert.equal(isSelfIntersecting([...concave, concave[0]]), false);
  assert.equal(isSelfIntersecting([[0, 0], [0, 2], [1, 1], [2, 2], [1, 1], [2, 0]]), true);
});
test('distance and area formatting switches metric units at the right thresholds', () => {
  assert.equal(formatDistance(0), '0 m'); assert.equal(formatDistance(999), '999 m');
  assert.equal(formatDistance(1250), '1.25 km');
  assert.equal(formatArea(1250), '1,250 m²'); assert.equal(formatArea(1000000), '1 km²');
});
test('invalid geographic input fails explicitly', () => {
  assert.throws(() => segmentMeters([NaN, 0], [0, 0]), /finite/);
  assert.throws(() => segmentMeters([91, 0], [0, 0]), /finite/);
  assert.throws(() => areaSquareMeters([[0, 0], [1, 0], [0, Infinity]]), /finite/);
});
