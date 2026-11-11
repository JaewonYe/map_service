import {test,expect} from '@playwright/test';
import {coordinate} from './fixtures/tpk-fixture';

test('offline Leaflet map, coordinates, zoom, scale and boundary work locally',async({page})=>{
  const requests:string[]=[],errors:string[]=[];page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.leaflet-control-scale')).toBeVisible();
  await expect(page.locator('.leaflet-overlay-pane path').first()).toBeVisible();
  await expect(page.getByTestId('zoom')).toHaveText('16');
  await page.locator('.leaflet-control-zoom-in').click();await expect(page.getByTestId('zoom')).toHaveText('17');
  await page.locator('.leaflet-container').click({position:{x:250,y:250}});await expect(page.getByTestId('clicked')).not.toContainText('지도를 클릭하세요');
  expect(requests.every(url=>url.startsWith('http://127.0.0.1:3100/'))).toBe(true);
  expect(errors).toEqual([]);
});
test('metadata comes from package, JPEG/PNG and conditional caching work; missing tile is 404',async({request})=>{
  const info=await request.get('/api/map-info');expect(info.status()).toBe(200);const metadata=await info.json();
  expect(metadata.zoomLevels).toEqual([15,16,17]);expect(metadata.osm.mode).toBe('unavailable');expect(metadata.packageVersion).toBe('1.0-synthetic');
  const {x,y}=coordinate(16);const tile=await request.get(`/api/tiles/16/${x}/${y}`);expect(tile.status()).toBe(200);expect(tile.headers()['content-type']).toBe('image/jpeg');
  expect((await request.get(`/api/tiles/16/${x+1}/${y+1}`)).headers()['content-type']).toBe('image/png');
  expect((await request.get(`/api/tiles/16/${x}/${y}`,{headers:{'If-None-Match':tile.headers().etag}})).status()).toBe(304);
  expect((await request.get('/api/tiles/16/0/0')).status()).toBe(404);
  expect((await request.get('/api/tiles/1/2/0')).status()).toBe(400);
  expect((await request.get('/api/osm/16/0/0')).status()).toBe(404);
});
test('offline network denial does not break satellite rendering',async({page})=>{
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto('/');await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.getByText('오프라인 OSM 타일이 없어 위성영상만 제공합니다.')).toBeVisible();
});

test('licensed local OSM layer switches without any public tile request',async({page})=>{
  const {png}=await import('./fixtures/tpk-fixture');const requests:string[]=[];
  page.on('request',request=>requests.push(request.url()));
  await page.route('**/api/map-info',async route=>{
    const response=await route.fetch(),body=await response.json();
    await route.fulfill({json:{...body,osm:{mode:'local',url:'/fixture-osm/{z}/{x}/{y}',attribution:'Synthetic local OSM fixture'}}});
  });
  await page.route('**/fixture-osm/**',route=>route.fulfill({contentType:'image/png',body:png()}));
  await page.goto('/');await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await page.getByRole('radio',{name:'OSM',exact:true}).check();
  await expect.poll(()=>requests.some(url=>url.includes('/fixture-osm/'))).toBe(true);
  await page.getByRole('radio',{name:'위성영상',exact:true}).check();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  expect(requests.every(url=>url.startsWith('http://127.0.0.1:3100/'))).toBe(true);
});
