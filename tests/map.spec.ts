import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
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
  for (const variant of ['rgb','infrared','ndvi']) {
    const image=await request.get(`/imagery/${variant}/14/13940/6391.png`);
    expect(image.status()).toBe(200);
    expect(await image.body()).toEqual(await readFile(new URL('./fixtures/satellite.png', import.meta.url)));
  }
  expect((await request.get('/imagery/unknown/14/13940/6391.png')).status()).toBe(404);
});

test('failed vector tile requests show a useful message', async ({ page }) => {
  await page.route('**/tile/**', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('벡터 타일 생성');
});

test('local satellite imagery is selectable and overlays can be toggled', async ({ page }) => {
  const errors: string[] = [];
  const imageryRequests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/imagery\/(?:rgb|infrared|ndvi)\/\d/.test(request.url())) imageryRequests.push(request.url()); });
  await page.route('**/imagery/metadata.json', route => route.fulfill({ json: { datasets:
    [['rgb','자연색 RGB'],['infrared','근적외선 강조'],['ndvi','식생지수 NDVI']].map(([id,label]) => ({
      id,label,ready:true,bbox:[125.45,36.35,126.55,37.08],minzoom:6,maxzoom:14,
      dates:['2025-10-15'],attribution:'Synthetic imagery test',nominal_resolution_m:10,partial:true,coverage:0.9,coverage_scope:'bounding_box'
    }))
  } }));
  await page.route(/\/imagery\/(?:rgb|infrared|ndvi)\/\d+\/\d+\/\d+\.png$/, route => route.fulfill({
    contentType:'image/png', path: fileURLToPath(new URL('./fixtures/satellite.png', import.meta.url))
  }));
  await page.goto('/');
  await expect(page.getByLabel('지도 종류')).toHaveValue('rgb');
  await expect.poll(() => imageryRequests.length).toBeGreaterThan(0);
  await expect(page.getByText('자연색 RGB 약 10m · 2025-10-15')).toBeVisible();
  await expect(page.locator('.coverage-warning')).toContainText('90.0%');
  await page.getByLabel('도로·건물 표시').uncheck();
  await expect(page.getByLabel('도로·건물 표시')).not.toBeChecked();
  await page.getByLabel('지도 종류').selectOption('osm');
  await expect(page.getByLabel('도로·건물 표시')).toHaveCount(0);
  await page.getByRole('button', {name:'세 영상 나란히 비교'}).click();
  await expect(page.locator('.maplibregl-canvas')).toHaveCount(3);
  for (const label of ['자연색 RGB','근적외선 강조','식생지수 NDVI']) {
    await expect(page.getByText(label, {exact:true})).toBeVisible();
  }
  await page.locator('.maplibregl-ctrl-zoom-in').first().click();
  for (const id of ['rgb','infrared','ndvi']) {
    await expect.poll(() => imageryRequests.some(url => url.includes(`/imagery/${id}/11/`))).toBe(true);
  }
  expect(errors).toEqual([]);
});

test('unprepared satellite data keeps ordinary map available', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('지도 종류')).toHaveValue('osm');
  await expect(page.locator('option[value="rgb"]')).toHaveAttribute('disabled', '');
});
