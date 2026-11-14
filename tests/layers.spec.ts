import {test,expect} from '@playwright/test';
import {center,coordinate} from './fixtures/tpk-fixture';
test('satellite, general and elevation switch offline; native zoom is overzoomed at 19',async({page})=>{
  const external:string[]=[];
  await page.route('**/*',route=>{
    if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();
    external.push(route.request().url());return route.abort();
  });
  await page.goto('/');await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  for(const name of ['일반 지도','고도 지도','위성영상']){
    await page.getByRole('radio',{name,exact:true}).check();await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  }
  await page.getByRole('radio',{name:'고도 지도',exact:true}).check();
  for(let z=17;z<=19;z++){await page.locator('.leaflet-control-zoom-in').click();await expect(page.getByTestId('zoom')).toHaveText(String(z));}
  await expect(page.getByTestId('zoom')).toHaveText('19');await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  const tile=page.locator('.leaflet-tile-loaded').first();await expect(tile).toHaveAttribute('src',/\/api\/elevation\/tiles\/17\//);
  await expect(page.getByText('고도 색상: 낮음')).toBeVisible();expect(external).toEqual([]);
  await page.getByRole('button',{name:'지도 데이터 준비',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'지도 데이터 준비'})).toContainText('DEM GeoTIFF');
});
test('point altitude, missing data, validation, tile MIME and caching',async({request})=>{
  const metadata=await (await request.get('/api/map-info')).json();
  expect(metadata.layers.street.available).toBe(true);expect(metadata.layers.elevation.available).toBe(true);
  expect(metadata.layers.elevation.verticalDatum).toBe('Synthetic test datum');
  expect((await (await request.get(`/api/elevation?lat=${center[0]}&lon=${center[1]}`)).json()).elevationMeters).toBe(123.5);
  expect((await (await request.get('/api/elevation?lat=0&lon=0')).json()).elevationMeters).toBeNull();
  for(const query of ['','lat=&lon=0','lat=90&lon=0','lat=x&lon=0'])expect((await request.get('/api/elevation?'+query)).status()).toBe(400);
  const {x,y}=coordinate(16);
  for(const path of [`/api/street/16/${x}/${y}`,`/api/elevation/tiles/16/${x}/${y}`]){
    const tile=await request.get(path);expect(tile.status()).toBe(200);expect(tile.headers()['content-type']).toBe('image/png');
    expect((await request.get(path,{headers:{'If-None-Match':tile.headers().etag}})).status()).toBe(304);
  }
  expect((await request.get('/api/elevation/tiles/16/0/0')).status()).toBe(404);
  expect((await request.get('/api/elevation/tiles/1/2/0')).status()).toBe(400);
});
test('clicking the map queries local elevation and retains measurement tools across layer changes',async({page})=>{
  await page.goto('/');await expect(page.getByRole('radio',{name:'고도 지도',exact:true})).toBeVisible();
  const response=page.waitForResponse(r=>r.url().includes('/api/elevation?'));
  await page.locator('.leaflet-container').click({position:{x:500,y:300}});await response;
  await expect(page.getByTestId('elevation-value')).not.toContainText('확인 중');
  await expect(page.getByTestId('elevation-value')).not.toContainText('지도를 클릭하세요');
  await page.getByRole('radio',{name:'일반 지도',exact:true}).check();
  await expect(page.getByRole('button',{name:'거리',exact:true})).toBeVisible();
  await page.locator('.leaflet-container').click({position:{x:500,y:300},button:'right'});
  await expect(page.getByRole('menuitem',{name:'시설·건물 정보 등록'})).toBeVisible();
});
