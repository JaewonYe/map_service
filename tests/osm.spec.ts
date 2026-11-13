import {test,expect} from '@playwright/test';
import {coordinate} from './fixtures/tpk-fixture';
test('PBF-derived local general map appears without satellite TPK or internet, including zoom 19',async({page})=>{
  const external:string[]=[],errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();external.push(route.request().url());return route.abort();});
  await page.goto('/');await expect(page.getByRole('radio',{name:'일반 지도',exact:true})).toBeChecked();
  await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.getByRole('radio',{name:'위성영상',exact:true})).toHaveCount(0);
  for(let z=17;z<=19;z++){await page.locator('.leaflet-control-zoom-in').click();await expect(page.getByTestId('zoom')).toHaveText(String(z));}
  await expect(page.locator('.leaflet-tile-loaded').first()).toHaveAttribute('src',/\/api\/osm\/19\//);
  expect(external).toEqual([]);expect(errors).toEqual([]);
});
test('OSM index metadata, local PNG, ETag and out-of-bounds handling',async({request})=>{
  const response=await request.get('/api/map-info');expect(response.status()).toBe(200);
  const info=await response.json();expect(info.layers.street.available).toBe(true);expect(info.osm.prepared).toBe(true);
  expect(info.layers.satellite.available).toBe(false);expect(info.layers.street.maxNativeZoom).toBe(19);
  const {x,y}=coordinate(16),tile=await request.get(`/api/osm/16/${x}/${y}`);
  expect(tile.status()).toBe(200);expect(tile.headers()['content-type']).toBe('image/png');
  expect((await request.get(`/api/osm/16/${x}/${y}`,{headers:{'If-None-Match':tile.headers().etag}})).status()).toBe(304);
  expect((await request.get('/api/osm/16/0/0')).status()).toBe(404);expect((await request.get('/api/osm/1/2/0')).status()).toBe(400);
});
