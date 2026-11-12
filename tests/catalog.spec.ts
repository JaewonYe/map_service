import {test, expect} from '@playwright/test';
import {coordinate} from './fixtures/tpk-fixture';
import {pixels} from './fixtures/catalog-fixture';

test('multi-resolution UI shows registered areas, coordinates, boundaries and only local requests', async ({page}) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path')).toHaveCount(3);
  await page.getByTestId('map-sources').locator('summary').click();
  await expect(page.getByTestId('map-sources')).toContainText('CC0 기본 지도');
  await expect(page.getByTestId('map-sources')).toContainText('CC0 항구 지역');
  await page.getByTestId('map-sources').locator('summary').click();
  await page.locator('.leaflet-control-zoom-in').click(); await expect(page.getByTestId('zoom')).toHaveText('17');
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(requests.every(url => url.startsWith('http://127.0.0.1:3101/'))).toBe(true);
  expect(errors).toEqual([]);
});
test('API selects native detail by priority and enlarges a base tile for uncovered areas', async ({request}) => {
  const response = await request.get('/api/map-info'); expect(response.status()).toBe(200);
  const info = await response.json(); expect(info.mode).toBe('multi'); expect(info.sources).toHaveLength(3);
  expect(info.minZoom).toBe(0); expect(info.maxZoom).toBe(19);
  const c = coordinate(16), tile = await request.get(`/api/tiles/16/${c.x}/${c.y}`);
  expect(tile.status()).toBe(200); expect(tile.headers()['x-map-source']).toBe('port');
  expect(tile.headers()['x-map-fallback']).toBe('false');
  expect(await pixels(await tile.body())).toEqual([220, 30, 30]);
  const p = coordinate(19), url = `/api/tiles/19/${p.x + 1000}/${p.y}`;
  const fallback = await request.get(url); expect(fallback.status()).toBe(200);
  expect(fallback.headers()['x-map-source']).toBe('korea'); expect(fallback.headers()['x-map-fallback']).toBe('true');
  expect(Number(fallback.headers()['x-map-native-zoom'])).toBeLessThanOrEqual(13);
  expect(await pixels(await fallback.body())).toEqual([30, 130, 60]);
  expect((await request.get(url, {headers: {'If-None-Match': fallback.headers().etag}})).status()).toBe(304);
  expect((await request.get('/api/tiles/13/0/0')).status()).toBe(404);
});

test('zoom 19 keeps requesting tiles and displays native detail pixels', async ({page}) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto('/');
  await expect(page.getByTestId('zoom')).toHaveText('16');
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  for (const zoom of [17, 18, 19]) {
    await page.locator('.leaflet-control-zoom-in').click();
    await expect(page.getByTestId('zoom')).toHaveText(String(zoom));
  }
  await expect.poll(() => requested.some(url => url.includes('/api/tiles/19/'))).toBe(true);
  const center = coordinate(19);
  const tile = page.locator(`img.leaflet-tile[src*="/api/tiles/19/${center.x}/${center.y}?"]`);
  await expect(tile).toHaveClass(/leaflet-tile-loaded/);
  await expect(tile).toBeVisible();
  const pixel = await tile.evaluate(element => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    context.drawImage(element as HTMLImageElement, 0, 0);
    return [...context.getImageData(128, 128, 1, 1).data];
  });
  expect(pixel).toEqual([30, 70, 200, 255]);
});
