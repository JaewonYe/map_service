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

// Isolate read-only scenarios from records created by parallel CRUD tests.
function facility(name: string, category: string, latitude = point.latitude, longitude = point.longitude) {
  return {id: randomUUID(), name, category, latitude, longitude, description: '', address: '', contact: '', website: '',
    version: 1, createdAt: '2026-11-21T00:00:00Z', updatedAt: '2026-11-21T00:00:00Z'};
}
async function mockFacilities(page: import('@playwright/test').Page, state: {records: ReturnType<typeof facility>[]}) {
  await page.route('**/api/buildings', route => route.request().method() === 'GET'
    ? route.fulfill({json: {buildings: state.records}}) : route.fallback());
  await page.route('**/api/buildings/*', route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const building = state.records.find(record => record.id === new URL(route.request().url()).pathname.split('/').at(-1));
    return building ? route.fulfill({json: {building}}) : route.fulfill({status: 404, json: {error: '삭제된 시설'}});
  });
}
async function expandFacilities(page: import('@playwright/test').Page) {
  const panel = page.getByRole('complementary', {name: '시설 목록', exact: true});
  const toggle = panel.getByRole('button', {name: '시설 목록', exact: true});
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  return panel;
}

test('facility list searches names, composes category filters and restores the same markers without writes', async ({page}) => {
  const state = {records: [facility('태안 내구 시험장', '시험장'), facility('태안 주차 시설', '주차장'),
    facility('West DEPOT', '야외 공간', 35.1, 129.1), facility('<img src=x onerror=alert(1)>', '미분류')]};
  const original = JSON.stringify(state.records);
  const writes: string[] = [];
  page.on('request', request => {if (request.url().includes('/api/buildings') && request.method() !== 'GET') writes.push(request.method());});
  await mockFacilities(page, state); await page.goto('/');
  const panel = await expandFacilities(page), search = panel.getByRole('searchbox', {name: '시설명 검색'});
  const category = panel.getByRole('combobox', {name: '시설 분류'});
  await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 4개 / 전체 4개');
  await expect(page.locator('.building-marker')).toHaveCount(4);
  await expect(panel.locator('img')).toHaveCount(0);
  await search.fill('  내구  ');
  await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 4개');
  await expect(page.locator('.building-marker')).toHaveCount(1);
  await category.selectOption('주차장');
  await expect(panel.getByText('조건에 맞는 시설이 없습니다. 검색어나 분류를 바꾸세요.')).toBeVisible();
  await expect(page.locator('.building-marker')).toHaveCount(0);
  await search.fill('');
  await expect(panel.getByRole('button', {name: /태안 주차 시설/})).toBeVisible();
  await expect(page.locator('.building-marker')).toHaveCount(1);
  await panel.getByRole('button', {name: '검색·분류 초기화'}).click();
  await expect(page.locator('.building-marker')).toHaveCount(4);
  await search.fill(' wEsT ');
  await expect(panel.getByRole('button', {name: /West DEPOT/})).toBeVisible();
  await expect(page.locator('.building-marker')).toHaveCount(1);
  await category.selectOption('야외 공간');
  await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 4개');
  await search.fill('  '); await category.selectOption('');
  await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 4개 / 전체 4개');
  expect(JSON.stringify(state.records)).toBe(original); expect(writes).toEqual([]);
});

test('facility list separates loading, no registrations, request failure with retry, and no search matches', async ({page}) => {
  let release!: () => void, first = true, fail = false;
  const gate = new Promise<void>(resolve => {release = resolve;});
  const state = {records: [] as ReturnType<typeof facility>[]};
  await page.route('**/api/buildings', async route => {
    if (first) {first = false; await gate;}
    await route.fulfill(fail ? {status: 503, json: {error: '목록 저장소 오류'}} : {json: {buildings: state.records}});
  });
  try {
    await page.goto('/'); const panel = await expandFacilities(page);
    await expect(panel.getByText('시설 목록을 불러오는 중…')).toBeVisible();
    await expect(panel.getByText(/등록된 시설이 없습니다/)).toHaveCount(0);
    release();
    await expect(panel.getByText(/등록된 시설이 없습니다/)).toBeVisible();
    fail = true; await panel.getByRole('button', {name: '시설 목록 다시 불러오기'}).click();
    await expect(panel.getByRole('alert')).toContainText('목록 저장소 오류');
    await expect(panel.getByText(/등록된 시설이 없습니다|조건에 맞는 시설이 없습니다/)).toHaveCount(0);
    fail = false; state.records = [facility('정상 시설', '시험장')];
    await panel.getByRole('button', {name: '시설 목록 다시 불러오기'}).click();
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 1개');
    await panel.getByRole('searchbox', {name: '시설명 검색'}).fill('없는 시설');
    await expect(panel.getByText(/조건에 맞는 시설이 없습니다/)).toBeVisible();
    await expect(panel.getByText(/등록된 시설이 없습니다/)).toHaveCount(0);
  } finally {release();}
});

test('an offscreen list selection pans to the latest detail coordinates and preserves marker details and zoom', async ({page}) => {
  const record = facility('먼 곳 야외 시설', '야외 공간', 35.1, 129.1), state = {records: [record]};
  await mockFacilities(page, state); await page.goto('/');
  const panel = await expandFacilities(page);
  await expect(panel.getByTestId('facility-result-count')).toContainText('1개 / 전체 1개');
  const zoom = await page.getByTestId('zoom').innerText();
  state.records = [{...record, latitude: 35.123456, longitude: 129.123456, description: '최신 상세 정보', version: 2}];
  await panel.getByRole('button', {name: /먼 곳 야외 시설/}).click();
  const details = page.getByRole('dialog', {name: '시설·건물 정보', exact: true});
  await expect(details.getByText('최신 상세 정보')).toBeVisible();
  await expect(page.getByTestId('map-center')).toHaveText('중심: 35.123456, 129.123456');
  await expect(page.getByTestId('zoom')).toHaveText(zoom);
  await expect(panel.getByRole('button', {name: '시설 목록', exact: true})).toHaveAttribute('aria-expanded', 'false');
  await details.getByRole('button', {name: '닫기', exact: true}).click();
  await expect(panel.getByRole('button', {name: '시설 목록', exact: true})).toBeFocused();
  await page.getByRole('button', {name: `${record.name} 시설·건물 정보 보기`, exact: true}).click();
  await expect(details.getByText('최신 상세 정보')).toBeVisible();
});

test('registration edits and deletion keep active facility filters, counts and markers consistent and preserve other data', async ({page, request}) => {
  const prefix = `관리 ${randomUUID().slice(0, 8)}`;
  const aResponse = await request.post('/api/buildings', {data: {name: `${prefix} Trial`, category: '시험장', ...point}});
  const bResponse = await request.post('/api/buildings', {data: {name: `${prefix} Parking`, category: '주차장', ...point}});
  const a = (await aResponse.json()).building, b = (await bResponse.json()).building;
  let createdId: string | undefined;
  try {
    await page.route('**/api/buildings', async route => {
      if (route.request().method() !== 'GET') return route.fallback();
      const response = await route.fetch(), body = await response.json();
      await route.fulfill({json: {buildings: body.buildings.filter((record: any) => record.name.startsWith(prefix))}});
    });
    await page.goto('/'); let panel = await expandFacilities(page);
    await panel.getByRole('combobox', {name: '시설 분류'}).selectOption('시험장');
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 2개');
    await panel.getByRole('button', {name: new RegExp(`${prefix} Trial`)}).click();
    await page.getByRole('dialog').getByRole('button', {name: '수정', exact: true}).click();
    let form = page.getByRole('dialog', {name: '시설·건물 정보 수정'});
    await form.getByLabel('시설명', {exact: true}).fill(`${prefix} Changed`);
    await form.getByRole('combobox', {name: '용도·분류'}).selectOption('주차장');
    await form.getByRole('button', {name: '저장', exact: true}).click();
    await expect(form).toHaveCount(0); panel = await expandFacilities(page);
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 0개 / 전체 2개');
    await expect(page.locator('.building-marker')).toHaveCount(0);
    await expect(panel.locator('[aria-current="location"]')).toHaveCount(0);
    await page.getByRole('button', {name: '시설·건물 추가', exact: true}).click();
    await page.locator('.leaflet-container').click({position: {x: 700, y: 330}});
    form = page.getByRole('dialog', {name: '시설·건물 정보 등록'});
    await form.getByLabel('시설명', {exact: true}).fill(`${prefix} New`);
    await form.getByRole('combobox', {name: '용도·분류'}).selectOption('시험장');
    const saved = page.waitForResponse(r => r.url().endsWith('/api/buildings') && r.request().method() === 'POST');
    await form.getByRole('button', {name: '저장', exact: true}).click();
    createdId = (await (await saved).json()).building.id;
    await expect(form).toHaveCount(0); panel = await expandFacilities(page);
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 3개');
    await expect(page.locator('.building-marker')).toHaveCount(1);
    await panel.getByRole('button', {name: '시설 목록 다시 불러오기'}).click();
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 3개');
    await panel.getByRole('button', {name: '검색·분류 초기화'}).click();
    await panel.getByRole('searchbox', {name: '시설명 검색'}).fill('Changed');
    await panel.getByRole('button', {name: new RegExp(`${prefix} Changed`)}).click();
    await page.getByRole('dialog').getByRole('button', {name: '수정', exact: true}).click();
    form = page.getByRole('dialog', {name: '시설·건물 정보 수정'});
    await form.getByRole('button', {name: '삭제', exact: true}).click();
    await form.getByRole('button', {name: '삭제 확인', exact: true}).click();
    await expect(form).toHaveCount(0); panel = await expandFacilities(page);
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 0개 / 전체 2개');
    await expect(page.locator('.building-marker')).toHaveCount(0);
    expect((await (await request.get(`/api/buildings/${b.id}`)).json()).building).toEqual(b);
    await panel.getByRole('button', {name: '검색·분류 초기화'}).click();
    await expect(page.locator('.building-marker')).toHaveCount(2);
  } finally {await remove(request, a.id); await remove(request, b.id); if (createdId) await remove(request, createdId);}
});

test('filter changes reject a delayed detail and reload clears a deleted selected item', async ({page}) => {
  const a = facility('선택 시험장', '시험장'), b = facility('남은 주차장', '주차장'), state = {records: [a, b]};
  await mockFacilities(page, state);
  let release!: () => void, held = false;
  const gate = new Promise<void>(resolve => {release = resolve;});
  await page.route(`**/api/buildings/${a.id}`, async route => {
    if (!held) {held = true; await gate; await route.fulfill({json: {building: a}});} else await route.fallback();
  });
  try {
    await page.goto('/'); let panel = await expandFacilities(page);
    await panel.getByRole('button', {name: /선택 시험장/}).click();
    await expect.poll(() => held).toBe(true); panel = await expandFacilities(page);
    await panel.getByRole('searchbox', {name: '시설명 검색'}).fill('주차장');
    const stale = page.waitForResponse(r => r.url().endsWith(`/api/buildings/${a.id}`)); release(); await (await stale).finished();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('.building-marker')).toHaveCount(1);
    await panel.getByRole('button', {name: '검색·분류 초기화'}).click();
    await panel.getByRole('button', {name: /선택 시험장/}).click();
    await page.getByRole('dialog').getByRole('button', {name: '닫기', exact: true}).click();
    panel = await expandFacilities(page);
    await expect(panel.getByRole('button', {name: /선택 시험장/})).toHaveAttribute('aria-current', 'location');
    state.records = [b]; await panel.getByRole('button', {name: '시설 목록 다시 불러오기'}).click();
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 1개');
    await expect(panel.locator('[aria-current]')).toHaveCount(0);
    await expect(page.getByRole('button', {name: `${a.name} 시설·건물 정보 보기`, exact: true})).toHaveCount(0);
    await panel.getByRole('searchbox', {name: '시설명 검색'}).fill('주차장');
    await panel.getByRole('button', {name: /남은 주차장/}).click();
    await page.getByRole('dialog').getByRole('button', {name: '닫기', exact: true}).click();
    panel = await expandFacilities(page);
    state.records = [{...b, name: '변경된 시험장', category: '시험장'}];
    await panel.getByRole('button', {name: '시설 목록 다시 불러오기'}).click();
    await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 0개 / 전체 1개');
    await expect(panel.locator('[aria-current]')).toHaveCount(0);
    await expect(page.locator('.building-marker')).toHaveCount(0);
    await panel.getByRole('button', {name: '검색·분류 초기화'}).click();
    await expect(panel.getByRole('button', {name: /변경된 시험장/})).toBeVisible();
  } finally {release();}
});

test('mobile and keyboard facility selection leaves map measurement and registration tools usable', async ({page}, testInfo) => {
  const state = {records: [facility('West Field', '야외 공간', 35.1, 129.1)]};
  await page.setViewportSize({width: 390, height: 844});
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.fallback() : route.abort());
  await mockFacilities(page, state); await page.goto('/');
  const panel = await expandFacilities(page), search = panel.getByRole('searchbox', {name: '시설명 검색'});
  await search.focus(); await search.fill('west'); await search.press('Tab');
  const category = panel.getByRole('combobox', {name: '시설 분류'});
  await expect(category).toBeFocused(); await category.press('End'); await category.press('Tab');
  await expect(panel.getByRole('button', {name: '검색·분류 초기화'})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(panel.getByRole('button', {name: '시설 목록 다시 불러오기'})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(panel.getByRole('button', {name: /West Field/})).toBeFocused();
  const bounds = (await panel.boundingBox())!, addBounds = (await page.getByRole('button', {name: '시설·건물 추가', exact: true}).boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(addBounds.y);
  await page.screenshot({path: testInfo.outputPath('facility-list-mobile.png')});
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog', {name: '시설·건물 정보', exact: true})).toBeVisible();
  await expect(page.getByTestId('map-center')).toHaveText('중심: 35.100000, 129.100000');
  await page.keyboard.press('Escape'); await expect(panel.getByRole('button', {name: '시설 목록', exact: true})).toBeFocused();
  await page.getByRole('button', {name: '거리', exact: true}).click();
  await page.locator('.leaflet-container').click({position: {x: 300, y: 280}});
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 1개');
  await page.getByRole('button', {name: '시설·건물 추가', exact: true}).click();
  await expect(page.getByRole('button', {name: '위치 선택 취소', exact: true})).toBeVisible();
});

test('failed detail fetch can retry and a stale deleted facility is removed safely', async ({page}) => {
  const a = facility('실패 후 재시도', '시험장'), b = facility('보존 시설', '주차장'), state = {records: [a, b]};
  await mockFacilities(page, state); let fail = true;
  await page.route(`**/api/buildings/${a.id}`, route => fail ? route.fulfill({status: 503, json: {error: '상세 조회 오류'}}) : route.fallback());
  await page.goto('/'); let panel = await expandFacilities(page);
  await panel.getByRole('button', {name: /실패 후 재시도/}).click();
  await expect(page.getByText('상세 조회 오류', {exact: true})).toBeVisible();
  fail = false; await page.getByRole('button', {name: '시설 정보 다시 불러오기'}).click();
  await expect(page.getByRole('dialog').getByRole('heading', {name: a.name, exact: true})).toBeVisible();
  await page.getByRole('dialog').getByRole('button', {name: '닫기', exact: true}).click();
  panel = await expandFacilities(page); state.records = [b];
  await panel.getByRole('button', {name: /실패 후 재시도/}).click();
  await expect(page.getByText('시설이 삭제되었습니다. 목록을 다시 불러와 확인하세요.')).toBeVisible();
  panel = await expandFacilities(page);
  await expect(panel.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 1개');
  await expect(page.locator('.building-marker')).toHaveCount(1);
  await expect(panel.locator('[aria-current]')).toHaveCount(0);
});
