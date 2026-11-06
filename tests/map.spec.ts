import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

test('MapLibre renders vector tiles locally and supports zoom', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '태안군 지도' })).toBeVisible();
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(() => requests.some(url => url.includes('/tile/'))).toBe(true);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('OpenStreetMap');
  await page.locator('.maplibregl-ctrl-zoom-in').click();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(requests.every(url => url.startsWith('blob:') || new URL(url).origin === 'http://127.0.0.1:3100')).toBe(true);
  expect(requests.some(url => /glyph|sprite|\.zip/.test(url))).toBe(false);
});

test('Next.js proxies usable road/building geometry and upstream errors', async ({ request }) => {
  const tile = await request.get('/tile/14/13940/6391.pbf');
  expect(tile.status()).toBe(200);
  expect(await tile.body()).toEqual(await readFile(new URL('./fixtures/tile.pbf', import.meta.url)));
  const decoded = new VectorTile(new PbfReader(await tile.body()));
  expect(decoded.layers.roads.length).toBeGreaterThan(0);
  expect(decoded.layers.buildings.length).toBeGreaterThan(0);
  expect(decoded.layers.roads.feature(0).loadGeometry().length).toBeGreaterThan(0);
  expect((await request.get('/tile/99/0/0.pbf')).status()).toBe(503);
  expect((await request.get('/tile/not-a-tile')).status()).toBe(404);
});

test('failed vector tile requests show a useful message', async ({ page }) => {
  await page.route('**/tile/**', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('벡터 타일 생성');
});
