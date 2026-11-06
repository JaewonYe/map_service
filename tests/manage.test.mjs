import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createManager, runCommand } from '../scripts/manage.mjs';

async function workspace(fn) {
  const root = await mkdtemp(join(tmpdir(), 'map-launcher-'));
  try {
    await writeFile(join(root, '.env.example'), 'PORT=8080\n');
    await mkdir(join(root, 'data/vector'), { recursive: true });
    await fn(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const validHeader = Buffer.from('SQLite format 3\0fixture');

test('existing map data and user configuration are reused without download or conversion', async () => workspace(async root => {
  await writeFile(join(root, '.env'), 'PORT=9999\n');
  await writeFile(join(root, 'data/vector/region.mbtiles'), validHeader);
  const calls = [];
  await createManager({ root, run: async (command, args) => { calls.push([command, ...args]); return ''; }, log() {} }).execute('map');
  assert.equal(await readFile(join(root, '.env'), 'utf8'), 'PORT=9999\n');
  assert.equal(calls.length, 2); // Only Docker readiness checks.
  assert.ok(calls.every(call => !call.includes('import') && !call.includes('extract')));
}));

test('failed tile conversion does not start services or remove an existing output', async () => workspace(async root => {
  await writeFile(join(root, 'data/taean.osm.pbf'), 'input');
  await writeFile(join(root, 'data/vector/region.mbtiles'), validHeader);
  const calls = [];
  const manager = createManager({ root, run: async (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('import')) throw new Error('conversion failed');
    return '';
  }, log() {} });
  await assert.rejects(manager.execute('rebuild-map'), /conversion failed/);
  assert.deepEqual(await readFile(join(root, 'data/vector/region.mbtiles')), validHeader);
  assert.ok(!calls.some(call => call.includes('up')));
  assert.ok(!calls.some(call => call.includes('-v')));
}));

test('existing satellite package is verified without downloading or rebuilding imagery', async () => workspace(async root => {
  await mkdir(join(root, 'data/imagery/taean/sentinel2'), { recursive: true });
  await writeFile(join(root, 'data/imagery/taean/sentinel2/manifest.json'), '{}');
  const calls = [];
  await createManager({ root, run: async (command, args) => { calls.push(args); return ''; }, log() {} }).execute('imagery');
  assert.ok(calls.some(call => call.includes('imagery-verify')));
  assert.ok(!calls.some(call => call.includes('run') && (call.includes('imagery-download') || call.includes('imagery-build'))));
}));

test('start uses the configured web port and verifies a tile response before opening a browser', async () => workspace(async root => {
  await writeFile(join(root, 'data/vector/region.mbtiles'), validHeader);
  const calls = [];
  let verified = false;
  await createManager({ root, platform: 'win32', run: async (command, args) => {
    calls.push([command, ...args]);
    if (args.includes('--format') && args.includes('json')) return JSON.stringify({ services: { web: { ports: [{ published: '23456' }] } } });
    if (command === 'rundll32.exe') assert.ok(verified);
    return '';
  }, request: async url => {
    assert.equal(url, 'http://127.0.0.1:23456/tile/14/13940/6391.pbf');
    verified = true;
    return new Response('tile', { headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile' } });
  }, log() {} }).execute('start');
  assert.ok(calls.some(call => call.includes('http://127.0.0.1:23456')));
}));

test('missing map blocks start; failed npm install does not start services or mark dependencies ready', async () => workspace(async root => {
  const calls = [];
  const manager = createManager({ root, run: async (command, args) => {
    calls.push([command, ...args]);
    if (command === 'npm' || command === 'npm.cmd') throw new Error('install failed');
    return '';
  }, log() {} });
  await assert.rejects(manager.execute('start'), /Map tiles are missing/);
  await writeFile(join(root, 'data/vector/region.mbtiles'), validHeader);
  await writeFile(join(root, 'package-lock.json'), '{}');
  await assert.rejects(manager.execute('dev'), /install failed/);
  await assert.rejects(access(join(root, '.cache/launcher-lock')));
  assert.ok(!calls.some(call => call.includes('up')));
}));

test('process failures keep the original nonzero exit status visible', async () => {
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(7)'], { capture: true }), /exit 7/);
});

test('partial imagery is explicit and reuses the downloaded acquisition', async () => workspace(async root => {
  await mkdir(join(root, 'data/imagery/taean/sentinel2/source'), { recursive: true });
  await writeFile(join(root, 'data/imagery/taean/sentinel2/source/acquisition.json'), '{}');
  const calls = [];
  const manager = createManager({ root, run: async (command, args) => { calls.push(args); return ''; }, log() {} });
  await manager.execute('partial-imagery');
  assert.ok(calls.some(call => call.includes('imagery-build') && call.includes('--allow-partial')));
  assert.ok(!calls.some(call => call.includes('run') && call.includes('imagery-download')));
  calls.length = 0;
  await manager.execute('rebuild-imagery');
  assert.ok(calls.some(call => call.includes('imagery-build')));
  assert.ok(!calls.some(call => call.includes('--allow-partial')));
}));
