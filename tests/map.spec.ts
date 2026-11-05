import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('client-side Leaflet renders local tiles and supports zoom', async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '자체 호스팅 지도' })).toBeVisible();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(await page.locator('.leaflet-tile-loaded').first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(256);
  await expect(page.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap');
  await page.locator('.leaflet-control-zoom-in').click();
  await expect.poll(() => requests.some(url => url.includes('/tile/15/'))).toBe(true);
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(requests.every(url => new URL(url).origin === 'http://127.0.0.1:3100')).toBe(true);
});

test('Next.js proxies tile bytes and upstream errors; rejects invalid paths', async ({ request }) => {
  const tile = await request.get('/tile/14/8529/5974.png');
  expect(tile.status()).toBe(200);
  expect(tile.headers()['content-type']).toContain('image/png');
  expect(await tile.body()).toEqual(await readFile(new URL('./fixtures/tile.png', import.meta.url)));
  expect((await request.get('/tile/99/0/0.png')).status()).toBe(503);
  expect((await request.get('/tile/not-a-tile')).status()).toBe(404);
});

test('failed tile requests show a useful message and recover on new successful loads', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/tile/**', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('지도 타일을 불러오지 못했습니다');
  await page.unroute('**/tile/**');
  await page.locator('.leaflet-control-zoom-in').click();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(errors).toEqual([]);
});
