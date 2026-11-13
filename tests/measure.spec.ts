import {test, expect, type Page} from '@playwright/test';

async function open(page: Page) {
  await page.goto('/'); await expect(page.locator('.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.getByRole('complementary', {name: '거리와 면적 측정'})).toBeVisible();
}
const position = {a: {x: 550, y: 210}, b: {x: 780, y: 210}, c: {x: 780, y: 350}};

test('distance drawing supports undo, finish, zoom and clearing while retaining click coordinates', async ({page}) => {
  await open(page); await page.getByRole('button', {name: '거리', exact: true}).click();
  const map = page.locator('.leaflet-container');
  await map.click({position: position.a}); await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 1개');
  await expect(page.getByRole('button', {name: '측정 완료'})).toBeDisabled();
  await map.click({position: position.b}); await map.click({position: position.c});
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 3개');
  await expect(page.locator('path.measurement-line')).toBeVisible();
  await expect(page.getByTestId('measurement-result')).toContainText('거리:');
  await expect(page.getByTestId('measurement-result')).not.toHaveText('거리: 0 m');
  await expect(page.getByTestId('clicked')).not.toContainText('지도를 클릭하세요');
  await page.getByRole('button', {name: '마지막 점 취소'}).click();
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 2개');
  await page.getByRole('button', {name: '측정 완료'}).click();
  await expect(page.getByRole('button', {name: '이동', exact: true})).toHaveAttribute('aria-pressed', 'true');
  const result = await page.getByTestId('measurement-result').textContent();
  await map.click({position: position.c}); await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 2개');
  await page.locator('.leaflet-control-zoom-in').click(); await expect(page.getByTestId('zoom')).toHaveText('17');
  await expect(page.getByTestId('measurement-result')).toHaveText(result!);
  await page.getByRole('button', {name: '초기화', exact: true}).click();
  await expect(page.locator('path.measurement-line')).toHaveCount(0);
  await expect(page.locator('path.measurement-vertex')).toHaveCount(0);
  await expect(page.getByTestId('measurement-result')).toHaveText('측정값: —');
});

test('polygon measurement reports area and perimeter and can be completed', async ({page}) => {
  await open(page); await page.getByRole('button', {name: '면적', exact: true}).click();
  const map = page.locator('.leaflet-container');
  await map.click({position: position.a}); await map.click({position: position.b});
  await expect(page.getByRole('button', {name: '측정 완료'})).toBeDisabled();
  await map.click({position: position.c});
  await expect(page.locator('path.measurement-polygon')).toBeVisible();
  await expect(page.getByTestId('measurement-result')).toContainText('m²');
  await expect(page.getByRole('complementary', {name: '거리와 면적 측정'})).toContainText('둘레:');
  await page.getByRole('button', {name: '측정 완료'}).click();
  await expect(page.getByRole('button', {name: '측정 완료'})).toBeDisabled();
  await expect(page.locator('path.measurement-polygon')).toBeVisible();
});

test('self-crossing polygon warns and becomes valid again after undo', async ({page}) => {
  await open(page); await page.getByRole('button', {name: '면적', exact: true}).click();
  const map = page.locator('.leaflet-container');
  const toolbar = page.getByRole('complementary', {name: '거리와 면적 측정'});
  for (const point of [{x: 550, y: 210}, {x: 780, y: 350}, {x: 550, y: 350}, {x: 780, y: 210}]) await map.click({position: point});
  await expect(toolbar.getByRole('alert')).toContainText('선이 서로 교차합니다');
  await expect(page.getByRole('button', {name: '측정 완료'})).toBeDisabled();
  await page.getByRole('button', {name: '마지막 점 취소'}).click();
  await expect(toolbar.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', {name: '측정 완료'})).toBeEnabled();
});

test('measurement toolbar works on a narrow screen with external hosts blocked', async ({page}, testInfo) => {
  await page.setViewportSize({width: 390, height: 844});
  const requests: string[] = []; page.on('request', request => requests.push(request.url()));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await open(page); await page.getByRole('button', {name: '거리', exact: true}).click();
  const map = page.locator('.leaflet-container');
  await map.click({position: {x: 90, y: 240}}); await map.click({position: {x: 300, y: 300}});
  await page.getByRole('button', {name: '측정 완료'}).click();
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 2개');
  const bounds = await page.getByRole('complementary', {name: '거리와 면적 측정'}).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(requests.every(url => url.startsWith('http://127.0.0.1:3101/'))).toBe(true);
  await page.screenshot({path: testInfo.outputPath('measurement-mobile.png')});
});

test('right-click starts distance at the clicked point without adding a menu-click vertex', async ({page}) => {
  await open(page);
  const map = page.locator('.leaflet-container'), bounds = (await map.boundingBox())!;
  await map.click({button: 'right', position: position.a});
  const menu = page.getByRole('menu', {name: '지도 메뉴'});
  await expect(menu).toBeVisible();
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 0개');
  await menu.getByRole('menuitem', {name: '거리 측정 시작'}).click();
  await expect(menu).toHaveCount(0);
  await expect(page.getByRole('button', {name: '거리', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 1개');
  const marker = (await page.locator('path.measurement-vertex').boundingBox())!;
  expect(Math.abs(marker.x + marker.width / 2 - (bounds.x + position.a.x))).toBeLessThan(2);
  expect(Math.abs(marker.y + marker.height / 2 - (bounds.y + position.a.y))).toBeLessThan(2);
  await map.click({position: position.b});
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 2개');
  await expect(page.getByTestId('measurement-result')).not.toHaveText('거리: 0 m');
  await page.getByRole('button', {name: '측정 완료'}).click();
});

test('right-click menu supports keyboard selection of area measurement', async ({page}) => {
  await open(page);
  const map = page.locator('.leaflet-container');
  await map.click({button: 'right', position: position.a});
  const menu = page.getByRole('menu', {name: '지도 메뉴'});
  await expect(menu.getByRole('menuitem', {name: '거리 측정 시작'})).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', {name: '면적 측정 시작'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 1개');
  await expect(page.getByRole('button', {name: '면적', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await map.click({position: position.b}); await map.click({position: position.c});
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 3개');
  await expect(page.locator('path.measurement-polygon')).toBeVisible();
  await expect(page.getByTestId('measurement-result')).toContainText('m²');
  await page.getByRole('button', {name: '측정 완료'}).click();
});

test('opening or dismissing a right-click menu preserves the current measurement', async ({page}) => {
  await open(page); await page.getByRole('button', {name: '거리', exact: true}).click();
  const map = page.locator('.leaflet-container');
  await map.click({position: position.a}); await map.click({position: position.b});
  const result = await page.getByTestId('measurement-result').textContent();
  await map.click({button: 'right', position: position.c});
  const menu = page.getByRole('menu', {name: '지도 메뉴'});
  await expect(menu).toBeVisible(); await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 2개');
  await expect(page.getByTestId('measurement-result')).toHaveText(result!);
  await map.click({button: 'right', position: position.c});
  await menu.getByRole('menuitem', {name: '면적 측정 시작'}).click();
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 1개');
  await expect(page.locator('path.measurement-line')).toHaveCount(0);
});

test('right-click menu stays inside the map on a narrow screen and dismisses on click or zoom', async ({page}) => {
  await page.setViewportSize({width: 390, height: 844}); await open(page);
  const map = page.locator('.leaflet-container'), bounds = (await map.boundingBox())!;
  await map.click({button: 'right', position: {x: bounds.width - 9, y: bounds.height - 70}});
  const menu = page.getByRole('menu', {name: '지도 메뉴'});
  await expect(menu).toBeVisible();
  const menuBounds = (await menu.boundingBox())!;
  expect(menuBounds.x).toBeGreaterThanOrEqual(bounds.x);
  expect(menuBounds.y).toBeGreaterThanOrEqual(bounds.y);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  await map.click({position: {x: 90, y: 240}}); await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 0개');
  await map.click({button: 'right', position: {x: 90, y: 240}}); await expect(menu).toBeVisible();
  await page.locator('.leaflet-control-zoom-in').click(); await expect(menu).toHaveCount(0);
  await expect(page.getByTestId('zoom')).toHaveText('17');
});
