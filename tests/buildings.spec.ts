import {randomUUID} from 'node:crypto';
import {test, expect, type APIRequestContext} from '@playwright/test';

const point = {latitude: 36.5985, longitude: 126.241};
async function create(request: APIRequestContext, name: string) {
  const response = await request.post('/api/buildings', {data: {name, ...point}});
  expect(response.status()).toBe(201); return (await response.json()).building;
}
async function remove(request: APIRequestContext, id: string) {
  const response = await request.get(`/api/buildings/${id}`);
  if (response.ok()) await request.delete(`/api/buildings/${id}`, {headers: {'If-Match': `"${(await response.json()).building.version}"`}});
}

test('right-click building registration persists across reload, editing and deletion offline', async ({page, request}) => {
  const name = `등록 테스트 ${randomUUID().slice(0, 8)}`;
  let id: string | undefined;
  try {
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
    await page.locator('.leaflet-container').click({button: 'right', position: {x: 550, y: 340}});
    await page.getByRole('menuitem', {name: '시설·건물 정보 등록'}).click();
    let dialog = page.getByRole('dialog', {name: '시설·건물 정보 등록'});
    await expect(dialog).toBeVisible();
    const latitude = Number(await dialog.getByLabel('위도', {exact: true}).inputValue());
    const longitude = Number(await dialog.getByLabel('경도', {exact: true}).inputValue());
    expect(Math.abs(latitude - 36.597889)).toBeLessThan(0.01); expect(Math.abs(longitude - 126.240136)).toBeLessThan(0.01);
    await dialog.getByLabel('시설명', {exact: true}).fill(name);
    await dialog.getByRole('textbox', {name: '설명', exact: true}).fill('태안군 건물 설명\n두 번째 줄');
    await dialog.getByRole('combobox', {name: '용도·분류', exact: true}).selectOption('공공시설');
    await dialog.getByLabel('주소', {exact: true}).fill('태안군 테스트 주소');
    await dialog.getByLabel('연락처', {exact: true}).fill('041-000-0000');
    await dialog.getByLabel('관련 URL', {exact: true}).fill('https://example.com/');
    await dialog.getByRole('button', {name: '저장', exact: true}).click();
    await expect(dialog).toHaveCount(0);
    const listed = (await (await request.get('/api/buildings')).json()).buildings.find((building: any) => building.name === name);
    expect(listed).toBeTruthy(); id = listed.id;
    await page.reload(); const marker = page.getByRole('button', {name: `${name} 시설·건물 정보 보기`, exact: true});
    await expect(marker).toBeVisible(); await marker.click();
    await page.getByRole('dialog', {name: '시설·건물 정보', exact: true}).getByRole('button', {name: '수정', exact: true}).click();
    dialog = page.getByRole('dialog', {name: '시설·건물 정보 수정'});
    await expect(dialog.getByRole('textbox', {name: '설명', exact: true})).toHaveValue('태안군 건물 설명\n두 번째 줄');
    await dialog.getByRole('textbox', {name: '설명', exact: true}).fill('수정된 건물 설명');
    await dialog.getByRole('button', {name: '저장', exact: true}).click(); await expect(dialog).toHaveCount(0);
    await page.reload(); await page.getByRole('button', {name: `${name} 시설·건물 정보 보기`, exact: true}).click();
    await page.getByRole('dialog', {name: '시설·건물 정보', exact: true}).getByRole('button', {name: '수정', exact: true}).click();
    dialog = page.getByRole('dialog', {name: '시설·건물 정보 수정'});
    await expect(dialog.getByRole('textbox', {name: '설명', exact: true})).toHaveValue('수정된 건물 설명');
    await dialog.getByRole('button', {name: '삭제', exact: true}).click();
    await dialog.getByRole('button', {name: '삭제 확인', exact: true}).click();
    await expect(dialog).toHaveCount(0); await expect(marker).toHaveCount(0);
  } finally {if (id) await remove(request, id);}
});

test('failed save keeps the editor draft and existing stored record', async ({page, request}) => {
  const building = await create(request, `오류 테스트 ${randomUUID().slice(0, 8)}`);
  try {
    await page.goto('/'); await page.getByRole('button', {name: `${building.name} 시설·건물 정보 보기`, exact: true}).click();
    await page.getByRole('dialog', {name: '시설·건물 정보', exact: true}).getByRole('button', {name: '수정', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: '시설·건물 정보 수정'});
    await dialog.getByRole('textbox', {name: '설명', exact: true}).fill('실패해도 보존할 입력');
    await page.route(`**/api/buildings/${building.id}`, route => route.request().method() === 'PUT'
      ? route.fulfill({status: 503, json: {error: '테스트 저장 공간 오류'}}) : route.continue());
    await dialog.getByRole('button', {name: '저장', exact: true}).click();
    await expect(dialog.getByRole('alert')).toHaveText('테스트 저장 공간 오류');
    await expect(dialog.getByRole('textbox', {name: '설명', exact: true})).toHaveValue('실패해도 보존할 입력');
    expect((await (await request.get(`/api/buildings/${building.id}`)).json()).building.description).toBe('');
    await dialog.getByRole('button', {name: '취소', exact: true}).click();
  } finally {await remove(request, building.id);}
});

test('building API validates input, origin, versions and competing updates', async ({request}) => {
  expect((await request.post('/api/buildings', {data: {name: '', ...point}})).status()).toBe(400);
  expect((await request.post('/api/buildings', {data: {name: 'invalid', ...point, website: 'javascript:alert(1)'}})).status()).toBe(400);
  expect((await request.post('/api/buildings', {headers: {Origin: 'https://other.example'}, data: {name: 'invalid', ...point}})).status()).toBe(403);
  expect((await request.post('/api/buildings', {data: {name: 'large', ...point, description: 'x'.repeat(40000)}})).status()).toBe(413);
  const building = await create(request, `API 테스트 ${randomUUID().slice(0, 8)}`);
  try {
    expect((await request.put(`/api/buildings/${building.id}`, {data: {...building, name: 'no version'}})).status()).toBe(428);
    const updates = await Promise.all(['A', 'B'].map(name => request.put(`/api/buildings/${building.id}`, {
      headers: {'If-Match': '"1"'}, data: {...building, name}
    })));
    expect(updates.map(response => response.status()).sort()).toEqual([200, 409]);
    expect((await request.delete(`/api/buildings/${building.id}`, {headers: {'If-Match': '"1"'}})).status()).toBe(409);
    const current = await request.get(`/api/buildings/${building.id}`); expect(current.headers()['cache-control']).toBe('no-store');
    expect((await current.json()).building.version).toBe(2);
  } finally {await remove(request, building.id);}
});

test('building labels render as plain text and the editor fits a narrow screen', async ({page, request}, testInfo) => {
  const name = '<img src=x onerror="window.buildingInjected=true">';
  const building = await create(request, name);
  try {
    await page.setViewportSize({width: 390, height: 844}); await page.goto('/');
    const marker = page.getByRole('button', {name: `${name} 시설·건물 정보 보기`, exact: true});
    await marker.hover(); await expect(page.locator('.building-tooltip')).toHaveText(name);
    await expect(page.locator('.building-tooltip img')).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).buildingInjected)).toBeUndefined();
    await marker.click();
    const details = page.getByRole('dialog', {name: '시설·건물 정보', exact: true});
    await expect(details.getByRole('heading', {name, exact: true})).toHaveText(name);
    await expect(details.locator('img')).toHaveCount(0);
    await details.getByRole('button', {name: '수정', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: '시설·건물 정보 수정'});
    await expect(dialog.getByLabel('시설명', {exact: true})).toHaveValue(name);
    const bounds = (await dialog.boundingBox())!; expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({path: testInfo.outputPath('building-editor-mobile.png')});
    await dialog.getByRole('button', {name: '취소', exact: true}).click();
  } finally {await remove(request, building.id);}
});

test('a delayed initial list cannot remove a newly saved building marker', async ({page, request}) => {
  const name = `지연 응답 ${randomUUID().slice(0, 8)}`;
  let release!: () => void, held = false, id: string | undefined;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route('**/api/buildings', async route => {
    if (route.request().method() === 'GET' && !held) {
      held = true; await gate; await route.fulfill({json: {buildings: []}});
    } else await route.continue();
  });
  try {
    await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
    await expect.poll(() => held).toBe(true);
    await page.locator('.leaflet-container').click({button: 'right', position: {x: 850, y: 350}});
    await page.getByRole('menuitem', {name: '시설·건물 정보 등록'}).click();
    const dialog = page.getByRole('dialog', {name: '시설·건물 정보 등록'});
    await dialog.getByLabel('시설명', {exact: true}).fill(name);
    const saved = page.waitForResponse(response => response.url().endsWith('/api/buildings') && response.request().method() === 'POST');
    await dialog.getByRole('button', {name: '저장', exact: true}).click();
    const response = await saved; expect(response.status()).toBe(201); id = (await response.json()).building.id;
    await expect(dialog).toHaveCount(0);
    const marker = page.getByRole('button', {name: `${name} 시설·건물 정보 보기`, exact: true});
    await expect(marker).toBeVisible();
    const stale = page.waitForResponse(response => response.url().endsWith('/api/buildings') && response.request().method() === 'GET');
    release(); await (await stale).finished();
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(marker).toBeVisible();
  } finally {release(); if (id) await remove(request, id);}
});


test('touch-friendly facility registration selects a map location without a user ID and opens read-only details', async ({page, request}) => {
  const name = `야외 시험장 ${randomUUID().slice(0, 8)}`;
  let id: string | undefined;
  try {
    await page.setViewportSize({width: 390, height: 844});
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
    const add = page.getByRole('button', {name: '시설·건물 추가', exact: true});
    await add.click(); await expect(add).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', {name: '위치 선택 취소', exact: true}).click();
    await expect(add).toHaveAttribute('aria-pressed', 'false');
    await add.click(); await page.keyboard.press('Escape');
    await expect(add).toHaveAttribute('aria-pressed', 'false');
    await add.click();
    await page.locator('.leaflet-container').click({position: {x: 300, y: 280}});
    const form = page.getByRole('dialog', {name: '시설·건물 정보 등록', exact: true});
    await expect(form).toBeVisible();
    await expect(form.getByLabel(/ID|식별자|시설번호/i)).toHaveCount(0);
    await expect(form.getByLabel('위도', {exact: true})).not.toHaveValue('');
    await form.getByLabel('시설명', {exact: true}).fill(name);
    await form.getByRole('combobox', {name: '용도·분류', exact: true}).selectOption('시험장');
    await form.getByLabel('설명', {exact: true}).fill('야외 내구 시험 구역');
    const saved = page.waitForResponse(response => response.url().endsWith('/api/buildings') && response.request().method() === 'POST');
    await form.getByRole('button', {name: '저장', exact: true}).click();
    id = (await (await saved).json()).building.id;
    await expect(form).toHaveCount(0); await page.reload();
    await page.getByRole('button', {name: `${name} 시설·건물 정보 보기`, exact: true}).click();
    const details = page.getByRole('dialog', {name: '시설·건물 정보', exact: true});
    await expect(details.getByRole('heading', {name, exact: true})).toBeVisible();
    await expect(details.getByText('시험장', {exact: true})).toBeVisible();
    await expect(details.getByText('야외 내구 시험 구역', {exact: true})).toBeVisible();
    await expect(details.locator('input, textarea, select')).toHaveCount(0);
    await details.getByRole('button', {name: '닫기', exact: true}).click();
    await expect(details).toHaveCount(0);
  } finally {if (id) await remove(request, id);}
});
