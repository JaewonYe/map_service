import assert from 'node:assert/strict';
const base = process.env.MAP_URL || 'http://127.0.0.1:8080';
const tile = process.env.SMOKE_TILE || '14/8529/5974';
assert.match(tile, /^\d+\/\d+\/\d+$/);
const page = await fetch(new URL('/', base), { signal: AbortSignal.timeout(10000) });
assert.equal(page.status, 200, 'Next.js page HTTP status');
const html = await page.text();
assert.ok(html.includes('자체 호스팅 지도'), 'Page heading');
const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g)].map(match => match[1]))];
assert.ok(assets.length > 0, 'Next.js JS/CSS bundles');
for (const path of assets) {
  const url = new URL(path, base);
  assert.equal(url.origin, new URL(base).origin, 'Assets must be self-hosted');
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, path);
  assert.ok((await response.arrayBuffer()).byteLength > 0, path);
}
const response = await fetch(new URL(`/tile/${tile}.png`, base), { signal: AbortSignal.timeout(180000) });
assert.equal(response.status, 200, 'Tile HTTP status');
assert.match(response.headers.get('content-type') || '', /image\/png/);
const bytes = Buffer.from(await response.arrayBuffer());
assert.ok(bytes.length >= 24);
assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'PNG signature');
assert.equal(bytes.readUInt32BE(16), 256, 'Tile width');
assert.equal(bytes.readUInt32BE(20), 256, 'Tile height');
console.log('Next.js page, bundles, and 256x256 PNG tile passed.');
