import {test, expect, type Page} from '@playwright/test';
const a={id:'11111111-1111-4111-8111-111111111111',version:1,name:'제1시험장',category:'시험장',description:'합성 시설 설명',address:'합성 주소',contact:'',website:'',latitude:36.5985,longitude:126.241,createdAt:'2026-11-21T00:00:00Z',updatedAt:'2026-11-21T00:00:00Z',
  boundary:{type:'Polygon',coordinates:[[[126.2405,36.598],[126.2415,36.598],[126.2415,36.599],[126.2405,36.599],[126.2405,36.598]]]}};
async function fixtures(page:Page,records=[a]) {
 await page.route('**/api/buildings',route=>route.fulfill({json:{buildings:records}}));
 await page.route('**/api/buildings/*',route=>{
  const building=records.find(b=>b.id===new URL(route.request().url()).pathname.split('/').at(-1));
  return route.fulfill({status:building?200:404,json:building?{building}:{error:'없음'}});
 });
}
async function openList(page:Page){const toggle=page.getByRole('button',{name:'시설 목록',exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();}
const theme=(page:Page)=>page.getByLabel('화면 테마',{exact:true});

test('desktop viewport follows the reference header sidebar and map; both themes style cards menus and controls',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await fixtures(page);await page.goto('/');
 const header=page.locator('.app-header'),sidebar=page.locator('.facility-sidebar-slot'),map=page.locator('.leaflet-container');
 await expect(page.getByRole('searchbox',{name:'시설명 검색'})).toBeVisible();
 const hb=(await header.boundingBox())!,sb=(await sidebar.boundingBox())!,mb=(await map.boundingBox())!;
 expect(hb.height).toBe(56);expect(sb.width).toBe(320);expect(mb.x).toBe(320);expect(sb.y).toBe(56);
 expect(mb.x+mb.width).toBe(1440);expect(mb.height).toBeGreaterThan(700);
 await expect(page.getByRole('button',{name:'시설·건물 추가',exact:true})).toHaveCSS('min-height','44px');
 for(const [value,color] of [['light','rgb(255, 255, 255)'],['dark','rgb(17, 28, 46)']]){
  await theme(page).selectOption(value);await expect(sidebar).toHaveCSS('background-color',color);
  await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:/제1시험장/}).click();
  const card=page.getByRole('dialog',{name:'시설·건물 정보',exact:true});await expect(card).toHaveCSS('background-color',color);
  const cb=(await card.boundingBox())!;expect(cb.x).toBeGreaterThanOrEqual(mb.x);expect(cb.y).toBeGreaterThanOrEqual(mb.y+56);
  await expect(page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:/제1시험장/})).toHaveAttribute('aria-current','location');
  await card.getByRole('button',{name:'닫기',exact:true}).click();
  await map.click({button:'right',position:{x:500,y:300}});await expect(page.getByRole('menu')).toHaveCSS('background-color',color);await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'지도 정보',exact:true}).click();await expect(page.getByRole('region',{name:'지도 데이터 정보'})).toHaveCSS('background-color',color);
  await page.getByRole('button',{name:'지도 정보 닫기'}).click();
 }
});

test('saved preference is applied before first paint without hydration errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(/hydration|did not match/i.test(message.text()))errors.push(message.text());});
 await page.addInitScript(()=>{localStorage.setItem('platform.theme','dark');requestAnimationFrame(()=>{(window as any).firstTheme=document.documentElement.dataset.theme;});});
 await page.goto('/');await expect(theme(page)).toHaveValue('dark');
 await expect.poll(()=>page.evaluate(()=>(window as any).firstTheme)).toBe('dark');
 await expect(page.locator('body')).toHaveCSS('background-color','rgb(11, 18, 32)');
 await theme(page).selectOption('light');expect(await page.evaluate(()=>localStorage.getItem('platform.theme'))).toBe('light');
 expect(errors).toEqual([]);
});

test('theme choices persist on reload and only system follows OS changes',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});await page.goto('/');
 await theme(page).selectOption('dark');await page.reload();await expect(theme(page)).toHaveValue('dark');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('body')).toHaveCSS('background-color','rgb(11, 18, 32)');
 await theme(page).selectOption('light');await page.emulateMedia({colorScheme:'dark'});await expect(page.locator('body')).toHaveCSS('background-color','rgb(245, 247, 250)');
 await theme(page).selectOption('system');await expect(page.locator('html')).not.toHaveAttribute('data-theme');await expect(page.locator('body')).toHaveCSS('background-color','rgb(11, 18, 32)');
 await page.emulateMedia({colorScheme:'light'});await expect(page.locator('body')).toHaveCSS('background-color','rgb(245, 247, 250)');
 await page.reload();await expect(theme(page)).toHaveValue('system');await expect(page.locator('html')).not.toHaveAttribute('data-theme');
});

test('denied storage and invalid preference fall back to system and do not prevent editing',async({browser})=>{
 for(const denied of [true,false]){
  const context=await browser.newContext({baseURL:'http://127.0.0.1:3102',colorScheme:'dark'}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(flag=>{if(flag)Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage unavailable','SecurityError');}});else localStorage.setItem('platform.theme','invalid');},denied);
  await fixtures(page);await page.goto('/');await expect(theme(page)).toHaveValue('system');await expect(page.locator('html')).not.toHaveAttribute('data-theme');
  await expect(page.locator('body')).toHaveCSS('background-color','rgb(11, 18, 32)');await theme(page).selectOption('light');
  await page.getByRole('button',{name:'시설·건물 추가',exact:true}).click();await page.locator('.leaflet-container').click({position:{x:500,y:300}});
  await page.getByRole('dialog').getByLabel('시설명',{exact:true}).fill('유지할 입력');await page.getByLabel('편집창 화면 테마',{exact:true}).selectOption('dark');
  await expect(page.getByRole('dialog').getByLabel('시설명',{exact:true})).toHaveValue('유지할 입력');await page.keyboard.press('Escape');
  expect(errors).toEqual([]);await context.close();
 }
});

test('switching themes preserves search selection map coordinates form input and boundary draft',async({page})=>{
 await fixtures(page);await page.goto('/');const search=page.getByRole('searchbox',{name:'시설명 검색'});await search.fill('시험장');
 await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:/제1시험장/}).click();const center=await page.getByTestId('map-center').innerText(),zoom=await page.getByTestId('zoom').innerText();
 await theme(page).selectOption('dark');await expect(search).toHaveValue('시험장');await expect(page.getByRole('region',{name:'선택 시설'})).toBeVisible();
 await page.getByRole('dialog').getByRole('button',{name:'수정',exact:true}).click();const form=page.getByRole('dialog');await form.getByRole('textbox',{name:'설명',exact:true}).fill('테마 전환 중 유지');
 await page.getByLabel('편집창 화면 테마',{exact:true}).selectOption('system');
 await page.emulateMedia({colorScheme:'light'});await expect(form.getByRole('textbox',{name:'설명',exact:true})).toHaveValue('테마 전환 중 유지');await form.getByRole('button',{name:'취소',exact:true}).click();
 await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:/제1시험장/}).click();await page.getByRole('button',{name:'경계 수정',exact:true}).click();
 const editor=page.getByRole('region',{name:'시설 경계 편집'});await editor.getByRole('button',{name:'경계 마지막 점 취소'}).click();
 await theme(page).selectOption('light');await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 3');
 await theme(page).selectOption('system');await page.emulateMedia({colorScheme:'dark'});await expect(editor).toHaveCSS('background-color','rgb(17, 28, 46)');
 await expect(page.getByTestId('map-center')).toHaveText(center);await expect(page.getByTestId('zoom')).toHaveText(zoom);await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 3');
 await editor.getByRole('button',{name:'경계 편집 취소'}).click();await expect(search).toHaveValue('시험장');
});

test('mobile drawer long names and keyboard focus leave controls and map usable through resize',async({page})=>{
 const long={...a,name:'야외 시설과 건물 사이의 긴 이름을 가진 시험 공간 '.repeat(3)};await page.setViewportSize({width:390,height:844});await fixtures(page,[long]);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());await page.goto('/');await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','mobile');await openList(page);
 const panel=page.getByRole('complementary',{name:'시설 목록'}),row=panel.getByRole('list',{name:'시설 검색 결과'}).getByRole('button');
 await row.focus();await expect(row).toBeFocused();const bounds=(await row.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'시설 목록',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'거리',exact:true}).click();await page.locator('.leaflet-container').click({position:{x:300,y:260}});await expect(page.getByTestId('measurement-points')).toContainText('1개');
 const center=await page.getByTestId('map-center').innerText();await page.setViewportSize({width:1440,height:900});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','desktop');await expect(page.locator('.leaflet-container')).toHaveCSS('width','1120px');
 await expect(page.getByTestId('measurement-points')).toContainText('1개');await expect(page.getByTestId('map-center')).toHaveText(center);
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','mobile');
 await expect(page.getByRole('button',{name:'시설 목록',exact:true})).toHaveAttribute('aria-expanded','false');await openList(page);
 await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button').click();await page.getByRole('button',{name:'경계 수정',exact:true}).click();
 const editor=page.getByRole('region',{name:'시설 경계 편집'});await expect(page.locator('.map-workspace')).toHaveAttribute('data-boundary-editing','true');
 const eb=(await editor.boundingBox())!,zb=(await page.locator('.leaflet-control-zoom').boundingBox())!,fb=(await page.getByRole('complementary',{name:'지도 좌표 정보'}).boundingBox())!;
 expect(eb.x).toBeGreaterThan(zb.x+zb.width);expect(eb.y+eb.height).toBeLessThanOrEqual(fb.y);
 const save=editor.getByRole('button',{name:'경계 저장',exact:true});await expect(save).toBeInViewport();await save.focus();await expect(save).toBeFocused();
 const bb=(await save.boundingBox())!;expect(bb.y).toBeGreaterThanOrEqual(eb.y);expect(bb.y+bb.height).toBeLessThanOrEqual(eb.y+eb.height);
 await page.keyboard.press('Escape');await expect(editor).toHaveCount(0);
 await openList(page);
 for(let i=0;i<3;i++){
  await page.setViewportSize({width:1440,height:900});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','desktop');
  await page.setViewportSize({width:390,height:844});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','mobile');
  await expect(page.getByRole('button',{name:'시설 목록',exact:true})).toHaveAttribute('aria-expanded','true');
  await expect(page.getByRole('list',{name:'시설 검색 결과'})).toBeVisible();
 }
});

test('theme preference synchronizes across tabs while retaining map state',async({page,context})=>{
 await page.goto('/');const second=await context.newPage();await second.goto('/');await expect(second.getByTestId('zoom')).toHaveText('16');const zoom=await second.getByTestId('zoom').innerText();
 await theme(page).selectOption('dark');await expect(theme(second)).toHaveValue('dark');await expect(second.locator('html')).toHaveAttribute('data-theme','dark');await expect(second.getByTestId('zoom')).toHaveText(zoom);
 await theme(page).selectOption('system');await expect(theme(second)).toHaveValue('system');await expect(second.locator('html')).not.toHaveAttribute('data-theme');await second.close();
});
