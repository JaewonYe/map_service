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

function boundsCenter(bounds: {south: number; west: number; north: number; east: number}) {
  const mercator = (latitude: number) => Math.asinh(Math.tan(latitude * Math.PI / 180));
  const latitude = Math.atan(Math.sinh((mercator(bounds.south) + mercator(bounds.north)) / 2)) * 180 / Math.PI;
  return `중심: ${latitude.toFixed(6)}, ${((bounds.west + bounds.east) / 2).toFixed(6)}`;
}

test('detail locations exclude the base and navigate between registered bounds while retaining measurements', async ({page}) => {
  const portBounds = {south: 36.605, west: 126.252, north: 36.610, east: 126.258};
  let taeanBounds: Parameters<typeof boundsCenter>[0];
  await page.route('**/api/map-info', async route => {
    const response = await route.fetch(), info = await response.json();
    taeanBounds = info.sources.find((source: any) => source.id === 'taean').bounds;
    info.sources.find((source: any) => source.id === 'port').bounds = portBounds;
    await route.fulfill({json: info});
  });
  await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  const panel = page.locator('.detail-locations'), list = page.getByRole('list', {name: '상세 지역 목록'});
  await expect(list.getByRole('button')).toHaveCount(2);
  await expect(list).not.toContainText('CC0 기본 지도');
  await page.getByRole('button', {name: '거리', exact: true}).click();
  await page.locator('.leaflet-container').click({position: {x: 550, y: 210}});
  await page.locator('.leaflet-container').click({position: {x: 780, y: 210}});
  await page.getByRole('button', {name: '측정 완료'}).click();
  const measurement = await page.getByTestId('measurement-result').textContent();
  await list.getByRole('button', {name: 'CC0 태안 지역 위치로 이동'}).click();
  await expect(page.getByText(/^중심:/)).toHaveText(boundsCenter(taeanBounds!));
  await expect(panel).toHaveJSProperty('open', false);
  await panel.locator('summary').click();
  await expect(list.getByRole('button', {name: 'CC0 태안 지역 위치로 이동'})).toHaveAttribute('aria-current', 'location');
  await list.getByRole('button', {name: 'CC0 항구 지역 위치로 이동'}).click();
  await expect(page.getByText(/^중심:/)).toHaveText(boundsCenter(portBounds));
  expect(Number(await page.getByTestId('zoom').textContent())).toBeLessThanOrEqual(16);
  await expect(page.getByTestId('measurement-result')).toHaveText(measurement!);
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 2개');
});

test('detail navigation shows unavailable statuses and permits metadata-only location inspection', async ({page}) => {
  await page.route('**/api/map-info', async route => {
    const response = await route.fetch(), info = await response.json();
    const taean = info.sources.find((source: any) => source.id === 'taean'); taean.usageConfirmed = false;
    const port = info.sources.find((source: any) => source.id === 'port'); port.status = 'unavailable';
    info.sources.push({...taean, id: 'inactive', name: '비활성 지역', status: 'disabled', bounds: undefined});
    await route.fulfill({json: info});
  });
  await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  const list = page.getByRole('list', {name: '상세 지역 목록'});
  await expect(list.getByRole('button')).toHaveCount(3);
  await expect(list.getByRole('button', {name: 'CC0 항구 지역 위치로 이동'})).toBeDisabled();
  await expect(list.getByRole('button', {name: '비활성 지역 위치로 이동'})).toBeDisabled();
  await expect(list.getByRole('button', {name: 'CC0 태안 지역 위치로 이동'})).toBeEnabled();
  await expect(list.getByRole('button', {name: 'CC0 태안 지역 위치로 이동'})).toContainText('메타데이터만');
  await list.getByRole('button', {name: 'CC0 태안 지역 위치로 이동'}).click();
  await expect(page.locator('.detail-locations')).toHaveJSProperty('open', false);
});

test('detail navigation explains an empty detail registry', async ({page}) => {
  await page.route('**/api/map-info', async route => {
    const response = await route.fetch(), info = await response.json();
    info.sources = info.sources.filter((source: any) => source.role === 'base');
    await route.fulfill({json: info});
  });
  await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.detail-locations')).toContainText('등록된 상세 지역이 없습니다.');
});

test('detail navigation remains usable on a narrow offline screen', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844});
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  const list = page.getByRole('list', {name: '상세 지역 목록'});
  const button = list.getByRole('button', {name: 'CC0 항구 지역 위치로 이동'}), bounds = (await button.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await button.click();
  await expect(page.locator('.detail-locations')).toHaveJSProperty('open', false);
  await expect(page.getByRole('complementary', {name: '거리와 면적 측정'})).toBeVisible();
});
