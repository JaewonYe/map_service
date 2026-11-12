import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, readdir, rm, writeFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {MapCatalog, tileBounds} from '../lib/tiles/catalog';
import {coordinate, makeTpk} from './fixtures/tpk-fixture';
import {color, gradient, korea, makeCatalogFixture, packageFile, pixels, taean} from './fixtures/catalog-fixture';

async function fixture(t: any) {
  const directory = await mkdtemp(join(tmpdir(), 'map-catalog-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const result = await makeCatalogFixture(directory);
  const load = async () => {
    const catalog = await MapCatalog.load({configPath: result.configPath, cache: join(directory, 'cache')});
    t.after(() => catalog.close()); return catalog;
  };
  return {directory, ...result, load};
}
test('catalog reads actual metadata, exposes multiple bounds and keeps filenames private', async t => {
  const f = await fixture(t), catalog = await f.load(), info = catalog.info();
  assert.equal(info.mode, 'multi'); assert.equal(info.minZoom, 0); assert.equal(info.maxZoom, 19);
  assert.equal(info.zoom, 16); assert.equal(info.sources.length, 3);
  assert.deepEqual(info.sources[0].zoomLevels, Array.from({length: 14}, (_, z) => z));
  assert.deepEqual(info.sources[1].zoomLevels, [14, 16, 19]);
  assert.deepEqual(info.sources[0].bounds, korea); assert.deepEqual(info.sources[1].bounds, taean);
  assert.ok(!JSON.stringify(info).includes('base.tpk'));
  assert.ok(info.warnings.some(warning => warning.includes('미포함 줌')));
  const world = tileBounds(0, 0, 0); assert.equal(world.west, -180); assert.equal(world.east, 180);
});
test('base works at zoom 0–13; details win at 14–19 with deterministic overlap priority', async t => {
  const f = await fixture(t), catalog = await f.load();
  for (let z = 0; z <= 13; z++) {
    const {x, y} = coordinate(z), tile = await catalog.tile(z, x, y);
    assert.equal(tile?.sourceId, 'korea'); assert.equal(tile?.nativeZoom, z); assert.equal(tile?.fallback, false);
  }
  for (const [z, source, zoom] of [[14, 'taean', 14], [15, 'taean', 14], [16, 'port', 16], [17, 'port', 16], [18, 'port', 16], [19, 'taean', 19]] as const) {
    const {x, y} = coordinate(z), tile = await catalog.tile(z, x, y);
    assert.equal(tile?.sourceId, source); assert.equal(tile?.nativeZoom, zoom);
  }
});
test('missing high-priority tile falls through other detail, then base without a blank', async t => {
  const f = await fixture(t);
  f.config.sources[1] = {...f.config.sources[1], minZoom: 16} as typeof f.config.sources[number];
  await writeFile(f.configPath, JSON.stringify(f.config));
  const catalog = await f.load(), c = coordinate(16);
  const exact = await catalog.tile(16, c.x, c.y); assert.deepEqual(exact?.bytes, f.red);
  const hole = await catalog.tile(16, c.x + 2, c.y + 2);
  assert.equal(hole?.sourceId, 'korea'); assert.equal(hole?.nativeZoom, 13); assert.equal(hole?.fallback, true);
  assert.deepEqual(await pixels(hole!.bytes), [30, 130, 60]);
  const edge = await catalog.tile(19, coordinate(19).x + 24, coordinate(19).y);
  assert.ok(edge); // Region edge/hole is still covered by the base.
  assert.equal(await catalog.tile(13, 0, 0), null);
});
test('higher native resolution precedes priority; ties use id independently of JSON order', async t => {
  const f = await fixture(t);
  f.config.sources[1].priority = 200;
  f.config.sources[2].priority = 200;
  f.config.sources.reverse(); await writeFile(f.configPath, JSON.stringify(f.config));
  const catalog = await f.load(), c = coordinate(16);
  assert.equal((await catalog.tile(16, c.x, c.y))?.sourceId, 'port');
  const c19 = coordinate(19); assert.equal((await catalog.tile(19, c19.x, c19.y))?.sourceId, 'taean');
});
test('fallback crops the correct ancestor quadrant instead of stretching the entire tile', async t => {
  const f = await fixture(t), c = coordinate(13);
  await packageFile(f.directory, 'korea/base.tpk', [13], [{z: 13, ...c, bytes: await gradient()}], korea);
  f.config.sources = [f.config.sources[0]]; await writeFile(f.configPath, JSON.stringify(f.config));
  const catalog = await f.load(), z = 19, x = c.x * 64 + 42, y = c.y * 64 + 7;
  const tile = await catalog.tile(z, x, y); assert.equal(tile?.nativeZoom, 13);
  const [r, g, b] = await pixels(tile!.bytes);
  assert.ok(Math.abs(r - (42 * 4 + 1.5)) <= 1); assert.ok(Math.abs(g - (7 * 4 + 1.5)) <= 1); assert.equal(b, 20);
  assert.equal((await sharp(tile!.bytes).metadata()).width, 256);
});
test('transparent detail pixels show the underlying base', async t => {
  const f = await fixture(t), c = coordinate(16);
  const bytes = Buffer.alloc(256 * 256 * 4);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) {
    const offset = (y * 256 + x) * 4; bytes[offset] = 220; bytes[offset + 3] = 255;
  }
  const image = await sharp(bytes, {raw: {width: 256, height: 256, channels: 4}}).png().toBuffer();
  await packageFile(f.directory, 'regions/taean.tpk', [16], [{z: 16, ...c, bytes: image}], taean);
  f.config.sources = f.config.sources.filter(source => source.id !== 'port'); await writeFile(f.configPath, JSON.stringify(f.config));
  const tile = await (await f.load()).tile(16, c.x, c.y);
  assert.deepEqual(await pixels(tile!.bytes, 64, 128), [220, 0, 0]);
  assert.deepEqual(await pixels(tile!.bytes, 192, 128), [30, 130, 60]);
  assert.deepEqual(tile?.contributingSources, ['taean', 'korea']);
});
test('unconfirmed source is metadata-only even when the old global flag is true', async t => {
  const f = await fixture(t), original = process.env.TPK_USAGE_CONFIRMED;
  process.env.TPK_USAGE_CONFIRMED = 'true'; t.after(() => { if (original === undefined) delete process.env.TPK_USAGE_CONFIRMED; else process.env.TPK_USAGE_CONFIRMED = original; });
  for (const source of f.config.sources) source.usageConfirmed = false;
  await writeFile(f.configPath, JSON.stringify(f.config));
  const catalog = await f.load(), c = coordinate(16);
  assert.equal(catalog.info().usageConfirmed, false); assert.equal(catalog.info().sources[1].metadata?.usageConfirmed, false);
  await assert.rejects(catalog.tile(16, c.x, c.y), /permission/);
  assert.ok(!(await readdir(f.directory)).includes('cache'), 'inspection/denied tile must not unpack bundles');
});
test('denied or missing details cannot hide an authorized base', async t => {
  const f = await fixture(t); f.config.sources[1].usageConfirmed = false;
  f.config.sources[2].file = 'regions/missing.tpk'; await writeFile(f.configPath, JSON.stringify(f.config));
  const catalog = await f.load(), c = coordinate(16), tile = await catalog.tile(16, c.x, c.y);
  assert.equal(tile?.sourceId, 'korea'); assert.equal(catalog.info().sources[2].status, 'unavailable');
  assert.equal((await catalog.info()).sources[1].usageConfirmed, false);
  assert.ok(!(await readdir(f.directory)).includes('cache'), 'unconfirmed deflated detail must not be extracted');
});
test('corrupt high-priority tile falls through to the next authorized region', async t => {
  const f = await fixture(t);
  await makeTpk(f.directory, 2, false, true);
  f.config.sources[2].file = 'synthetic-v2-bad.tpk'; await writeFile(f.configPath, JSON.stringify(f.config));
  const log = t.mock.method(console, 'error', () => {});
  const catalog = await f.load(), c = coordinate(16), tile = await catalog.tile(16, c.x, c.y);
  assert.equal(tile?.sourceId, 'taean'); assert.deepEqual(tile?.bytes, f.blue);
  assert.equal(log.mock.callCount(), 1);
});
test('catalog rejects duplicate ids, traversal, non-boolean permissions and invalid zooms', async t => {
  const f = await fixture(t), original = JSON.stringify(f.config);
  for (const update of [
    (config: any) => {config.sources[1].id = 'korea';},
    (config: any) => {delete config.sources[1].id;},
    (config: any) => {config.sources[1].file = '../secret.tpk';},
    (config: any) => {config.sources[1].file = 'C:\\data\\secret.tpk';},
    (config: any) => {config.sources[1].usageConfirmed = 'true';},
    (config: any) => {config.sources[1].maxZoom = 25;},
    (config: any) => {config.sources = config.sources.filter((s: any) => s.role !== 'base');}
  ]) {
    const config = JSON.parse(original); update(config); await writeFile(f.configPath, JSON.stringify(config));
    await assert.rejects(MapCatalog.load({configPath: f.configPath}));
  }
});
test('symlinks escaping the mounted data directory are not read', async t => {
  const f = await fixture(t), other = await mkdtemp(join(tmpdir(), 'outside-tpk-'));
  t.after(() => rm(other, {recursive: true, force: true}));
  const path = await packageFile(other, 'outside.tpk', [16], [{z: 16, ...coordinate(16), bytes: await color(0, 0, 0)}]);
  try { await symlink(path, join(f.directory, 'regions/escape.tpk')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EPERM') { t.skip('Symlinks unavailable on this host'); return; } throw error; }
  f.config.sources[1].file = 'regions/escape.tpk'; await writeFile(f.configPath, JSON.stringify(f.config));
  assert.equal((await f.load()).info().sources[1].status, 'unavailable');
});
test('concurrent fallback requests share work and keep consistent ETags', async t => {
  const f = await fixture(t), catalog = await f.load(), c = coordinate(18);
  const tiles = await Promise.all(Array.from({length: 90}, () => catalog.tile(18, c.x + 20, c.y + 20)));
  assert.ok(tiles.every(tile => tile && tile.etag === tiles[0]!.etag));
});
test('restarting and reloading configuration adds regions without frontend changes', async t => {
  const f = await fixture(t), original = await f.load(), c = coordinate(16);
  assert.equal((await original.tile(16, c.x, c.y))?.sourceId, 'port');
  await packageFile(f.directory, 'regions/new.tpk', [16], [{z: 16, ...c, bytes: await color(10, 20, 30)}]);
  f.config.sources.push({...f.config.sources[2], id: 'new', file: 'regions/new.tpk', priority: 999});
  await writeFile(f.configPath, JSON.stringify(f.config));
  // A running reader detects the changed config before serving a stale cached tile.
  const now = Date.now() + 2000; t.mock.method(Date, 'now', () => now);
  await assert.rejects(original.tile(16, c.x, c.y), /Restart the server/);
  const updated = await f.load(); assert.equal(updated.info().sources.length, 4);
  assert.notEqual(updated.info().revision, original.info().revision);
  assert.equal((await updated.tile(16, c.x, c.y))?.sourceId, 'new');
});
test('single TPK remains compatible when no catalog is installed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'legacy-tpk-')); t.after(() => rm(directory, {recursive: true, force: true}));
  const original = process.env.TPK_USAGE_CONFIRMED; process.env.TPK_USAGE_CONFIRMED = 'true';
  t.after(() => {if (original === undefined) delete process.env.TPK_USAGE_CONFIRMED; else process.env.TPK_USAGE_CONFIRMED = original;});
  const source = await makeTpk(directory), catalog = await MapCatalog.load({legacyPath: source.path}); t.after(() => catalog.close());
  assert.equal(catalog.info().mode, 'single'); assert.equal(catalog.info().zoom, 16);
  const c = coordinate(16); assert.deepEqual((await catalog.tile(16, c.x, c.y))?.bytes, source.jpeg);
  assert.ok((await readFile(source.path)).length);
});
