import assert from 'node:assert/strict';
const base = process.env.MAP_URL || 'http://127.0.0.1:8080';
const tile = process.env.SMOKE_TILE || '14/13940/6391';
assert.match(tile, /^\d+\/\d+\/\d+$/);
const page = await fetch(new URL('/', base), { signal: AbortSignal.timeout(10000) });
assert.equal(page.status, 200, 'Next.js page HTTP status');
const html = await page.text();
assert.ok(html.includes('태안군 지도'), 'Page heading');
const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"\s]+\.(?:js|css)(?:\?[^"\s]*)?)"/g)].map(match => match[1]))];
assert.ok(assets.length > 0, 'Next.js JS/CSS bundles');
for (const path of assets) {
  const url = new URL(path, base);
  assert.equal(url.origin, new URL(base).origin, 'Assets must be self-hosted');
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, path);
  assert.ok((await response.arrayBuffer()).byteLength > 0, path);
}
process.env.MAP_URL = base;
await import('./check-vector.mjs');
console.log('Next.js page, bundles, and vector geometry passed.');
