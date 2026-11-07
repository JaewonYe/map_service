import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('only local Esri RGB renders, with attribution and no other datasets',async({page})=>{
  const errors:string[]=[],requests:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'태안군 지도'})).toBeVisible();
  await expect.poll(()=>requests.some(url=>/\/imagery\/rgb\/.*\.jpg/.test(url))).toBe(true);
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('Esri');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  expect(requests.every(url=>url.startsWith('http://127.0.0.1:3100/')||url.startsWith('blob:'))).toBe(true);
  expect(requests.some(url=>/\.pbf|ndvi|infrared|sentinel/i.test(url))).toBe(false);
  expect(errors).toEqual([]);
});
test('RGB bytes proxy correctly; old dataset routes are absent',async({request})=>{
  const image=await request.get('/imagery/rgb/10/871/399.jpg');
  expect(image.status()).toBe(200);
  expect(await image.body()).toEqual(await readFile(new URL('./fixtures/satellite.jpg',import.meta.url)));
  expect((await request.get('/imagery/ndvi/10/871/399.jpg')).status()).toBe(404);
  expect((await request.get('/tile/10/871/399.pbf')).status()).toBe(404);
});
test('no archive shows preparation instructions without an online fallback',async({page})=>{
  await page.route('**/imagery/metadata.json',r=>r.fulfill({json:{datasets:[{id:'rgb',ready:false}]}}));
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Esri RGB 데이터가 없습니다');
});
