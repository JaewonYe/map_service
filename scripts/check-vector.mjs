import assert from 'node:assert/strict';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

const base = process.env.MAP_URL || 'http://127.0.0.1:8081';
const tile = process.env.SMOKE_TILE || '14/8529/5974';
assert.match(tile, /^\d+\/\d+\/\d+$/);
const response = await fetch(new URL(`/tile/${tile}.pbf`, base), { signal: AbortSignal.timeout(30000) });
assert.equal(response.status, 200, 'Vector tile HTTP status');
const decoded = new VectorTile(new PbfReader(new Uint8Array(await response.arrayBuffer())));
assert.ok(decoded.layers.roads?.length > 0, 'Expected real road features in selected tile');
assert.ok(decoded.layers.buildings?.length > 0, 'Expected real buildings in selected tile');
// Decode geometry too; a nonempty HTTP body alone does not prove usable tiles.
for (const name of ['roads', 'buildings']) {
  assert.ok(decoded.layers[name].feature(0).loadGeometry().length > 0);
}
console.log(`Vector tile verified: ${decoded.layers.roads.length} roads, ${decoded.layers.buildings.length} buildings.`);
