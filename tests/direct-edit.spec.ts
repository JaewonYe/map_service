import {randomUUID} from 'node:crypto';
import {test,expect,type Page,type APIRequestContext,type Locator} from '@playwright/test';
const boundary={type:'Polygon',coordinates:[[[126.2445,36.600],[126.2455,36.600],[126.2455,36.601],[126.2445,36.601],[126.2445,36.600]]]};
async function create(request:APIRequestContext,extra={}){const response=await request.post('/api/buildings',{data:{name:`직접 편집 ${randomUUID().slice(0,8)}`,category:'야외 공간',latitude:36.6005,longitude:126.245,description:'합성 검증',boundary,...extra}});expect(response.status()).toBe(201);return(await response.json()).building;}
async function get(request:APIRequestContext,id:string){return(await(await request.get(`/api/buildings/${id}`)).json()).building;}
async function remove(request:APIRequestContext,id:string){const b=await get(request,id);if(b)await request.delete(`/api/buildings/${id}`,{headers:{'If-Match':`"${b.version}"`}});}
async function isolate(page:Page,ids:string[]){await page.route('**/api/buildings',async route=>{if(route.request().method()!=='GET')return route.fallback();const response=await route.fetch();const body=await response.json();return route.fulfill({json:{buildings:body.buildings.filter((b:any)=>ids.includes(b.id))}});});}
async function show(page:Page,b:any){const toggle=page.getByRole('button',{name:'시설 목록',exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:new RegExp(b.name)}).click();return page.getByRole('dialog');}
async function position(page:Page,b:any){const dialog=await show(page,b);await dialog.getByRole('button',{name:'위치 수정',exact:true}).click();return page.getByRole('region',{name:'시설 위치 수정'});}
async function edit(page:Page,b:any){const dialog=await show(page,b);await dialog.getByRole('button',{name:'경계 수정',exact:true}).click();return page.getByRole('region',{name:'시설 경계 편집'});}
async function drag(page:Page,handle:Locator,dx:number,dy:number){const p=(await handle.boundingBox())!;await page.mouse.move(p.x+p.width/2,p.y+p.height/2);await page.mouse.down();await page.mouse.move(p.x+p.width/2+dx,p.y+p.height/2+dy,{steps:8});await page.mouse.up();}
async function coords(editor:Locator,latitude:string,longitude:string){await editor.getByLabel('위치 위도',{exact:true}).fill(latitude);await editor.getByLabel('위치 경도',{exact:true}).fill(longitude);}

test('explicit point move previews drag and map choice; cancel restores; save retains boundary and neighbours across reload',async({page,request})=>{
 const a=await create(request),b=await create(request,{longitude:126.247});
 try{
  await page.setViewportSize({width:1440,height:900});await isolate(page,[a.id,b.id]);await page.goto('/');
  expect(await page.locator('.facility-position-handle').count()).toBe(0);
  let editor=await position(page,a);await expect(page.getByRole('button',{name:'거리',exact:true})).toBeDisabled();
  await drag(page,page.getByRole('button',{name:'미저장 시설 지점 이동',exact:true}),70,-50);
  await expect(editor.getByTestId('position-draft')).not.toContainText('36.6005000, 126.2450000');expect(await get(request,a.id)).toEqual(a);
  await page.locator('.leaflet-container').click({position:{x:620,y:220}});
  await expect(page.locator('.facility-position-original')).toHaveCount(1);await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);expect(await get(request,a.id)).toEqual(a);await expect(page.locator('.facility-position-handle')).toHaveCount(0);
  editor=await position(page,a);await coords(editor,'36.602','126.249');await editor.getByRole('button',{name:'좌표 미리보기'}).click();
  await expect(editor.getByTestId('position-draft')).toContainText('36.6020000, 126.2490000');
  await editor.getByRole('button',{name:'위치 저장',exact:true}).click();await expect(editor).toHaveCount(0);
  const moved=await get(request,a.id);expect(moved).toMatchObject({...a,latitude:36.602,longitude:126.249,version:2,updatedAt:expect.any(String)});expect(await get(request,b.id)).toEqual(b);
  await page.getByRole('dialog').getByText('시설 상세 정보',{exact:true}).click();await expect(page.getByRole('dialog')).toContainText('36.6020000, 126.2490000');
  await page.reload();await show(page,a);await page.getByRole('dialog').getByText('시설 상세 정보',{exact:true}).click();await expect(page.getByRole('dialog')).toContainText('36.6020000, 126.2490000');expect((await get(request,a.id)).boundary).toEqual(a.boundary);
 }finally{await remove(request,a.id);await remove(request,b.id);}
});

test('point failure conflict and delayed save keep drafts and fixed target; numeric edits and map modes remain isolated',async({page,request})=>{
 const a=await create(request),b=await create(request,{longitude:126.247});let mode='fail',release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);let held=0;
 try{
  await isolate(page,[a.id,b.id]);await page.goto('/');let editor=await position(page,a);await coords(editor,'36.603','126.248');
  await page.route(`**/api/buildings/${a.id}`,async route=>{if(route.request().method()!=='PUT')return route.fallback();if(mode==='fail')return route.fulfill({status:503,json:{error:'합성 위치 저장 실패'}});if(mode==='hold'){held++;await gate;}return route.fallback();});
  await editor.getByRole('button',{name:'위치 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('합성 위치 저장 실패');await expect(editor.getByLabel('위치 위도',{exact:true})).toHaveValue('36.603');expect(await get(request,a.id)).toEqual(a);
  mode='pass';await request.put(`/api/buildings/${a.id}`,{headers:{'If-Match':'"1"'},data:{...a,description:'다른 창 수정'}});
  await editor.getByRole('button',{name:'위치 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('다른 화면에서 변경');await expect(editor.getByLabel('위치 위도',{exact:true})).toHaveValue('36.603');
  await editor.getByRole('button',{name:'위치 수정 취소'}).click();editor=await position(page,a);await coords(editor,'36.604','126.249');mode='hold';
  await editor.getByRole('button',{name:'위치 저장',exact:true}).click();await expect.poll(()=>held).toBe(1);await expect(editor.getByRole('button',{name:'위치 저장 중…'})).toBeDisabled();
  await page.getByRole('button',{name:`${b.name} 시설·건물 정보 보기`,exact:true}).click();await page.keyboard.press('Escape');await expect(editor).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
  release();await expect(editor).toHaveCount(0);expect((await get(request,a.id)).latitude).toBe(36.604);expect((await get(request,a.id)).boundary).toEqual(a.boundary);expect(await get(request,b.id)).toEqual(b);
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();await page.getByRole('button',{name:'면적',exact:true}).click();await page.locator('.leaflet-container').click({position:{x:500,y:260}});await expect(page.getByTestId('measurement-points')).toContainText('1개');
 }finally{release();await remove(request,a.id);await remove(request,b.id);}
});

test('point drafts survive both themes and responsive changes; keyboard coordinate alternative does not delete a record',async({page,request})=>{
 const a=await create(request);
 try{
  await page.setViewportSize({width:390,height:844});await isolate(page,[a.id]);await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());await page.goto('/');const editor=await position(page,a);
  await coords(editor,'36.602','126.248');await editor.getByRole('button',{name:'좌표 미리보기'}).focus();await page.keyboard.press('Enter');
  for(const theme of ['dark','light']){await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);await expect(editor.getByLabel('위치 경도',{exact:true})).toHaveValue('126.248');}
  await page.setViewportSize({width:1440,height:900});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','desktop');await page.setViewportSize({width:390,height:844});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','mobile');
  await expect(editor.getByTestId('position-draft')).toContainText('36.6020000');
  await editor.getByLabel('위치 경도',{exact:true}).focus();await page.keyboard.press('Backspace');expect(await get(request,a.id)).toEqual(a);
  const save=editor.getByRole('button',{name:'위치 저장',exact:true});await expect(save).toBeInViewport();const eb=(await editor.boundingBox())!,zb=(await page.locator('.leaflet-control-zoom').boundingBox())!;expect(eb.x).toBeGreaterThan(zb.x+zb.width);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await editor.getByRole('button',{name:'원래 위치로 되돌리기'}).click();await expect(editor.getByLabel('위치 위도',{exact:true})).toHaveValue(String(a.latitude));await page.keyboard.press('Escape');expect(await get(request,a.id)).toEqual(a);
 }finally{await remove(request,a.id);}
});

test('vertex drag previews metrics, inserts once, deletes selected middle and undo persists canonical geometry',async({page,request})=>{
 const a=await create(request),b=await create(request,{longitude:126.247});
 try{
  await page.setViewportSize({width:1440,height:900});await isolate(page,[a.id,b.id]);await page.goto('/');const editor=await edit(page,a);
  const before=await editor.locator('output').innerText();await drag(page,page.getByRole('button',{name:'2번 경계 정점 선택·이동',exact:true}),32,-25);
  await expect(editor.locator('output')).not.toHaveText(before);await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 4');expect(await get(request,a.id)).toEqual(a);
  await editor.getByRole('button',{name:'직전 조작 되돌리기'}).click();await expect(editor.locator('output')).toHaveText(before);
  await page.getByRole('button',{name:'1번 변에 정점 삽입',exact:true}).click();await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 5');await expect(editor.getByLabel('선택 정점',{exact:true})).toHaveValue('1');
  await expect(editor.getByRole('button',{name:'경계 저장',exact:true})).toBeDisabled();
  await drag(page,page.getByRole('button',{name:'2번 경계 정점 선택·이동',exact:true}),0,28);
  await expect(editor.getByRole('button',{name:'경계 저장',exact:true})).toBeEnabled();await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 5');
  await editor.getByRole('button',{name:'선택 정점 삭제',exact:true}).click();await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 4');
  await editor.getByRole('button',{name:'직전 조작 되돌리기'}).click();await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 5');
  await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect(editor).toHaveCount(0);const saved=await get(request,a.id);expect(saved.boundary.coordinates[0]).toHaveLength(6);expect(saved.latitude).toBe(a.latitude);expect(saved.longitude).toBe(a.longitude);expect(await get(request,b.id)).toEqual(b);
  await page.reload();await expect(page.locator('.facility-boundary-vertex')).toHaveCount(0);await edit(page,a);await expect(page.locator('.facility-boundary-vertex')).toHaveCount(5);
 }finally{await remove(request,a.id);await remove(request,b.id);}
});

test('vertex keyboard alternatives keep minimum, show duplicate crossing and range errors; undo repairs draft',async({page,request})=>{
 const a=await create(request);
 try{
  await isolate(page,[a.id]);await page.goto('/');const editor=await edit(page,a);await editor.getByLabel('선택 정점',{exact:true}).selectOption('1');await editor.getByRole('button',{name:'선택 정점 삭제',exact:true}).click();
  await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 3');await expect(editor.getByRole('button',{name:'선택 정점 삭제',exact:true})).toBeDisabled();await expect(editor.getByText(/정점은 최소 3개/)).toBeVisible();
  await editor.getByRole('button',{name:'직전 조작 되돌리기'}).click();await editor.getByText('좌표로 정점 추가·수정',{exact:true}).click();
  const lat=editor.getByLabel('정점 위도',{exact:true}),lon=editor.getByLabel('정점 경도',{exact:true});
  await lat.fill('36.6');await lon.fill('126.2445');await editor.getByRole('button',{name:'2번 정점 수정',exact:true}).click();await expect(editor.locator('output')).toContainText('중복');await expect(editor.getByRole('button',{name:'경계 저장',exact:true})).toBeDisabled();
  await editor.getByRole('button',{name:'직전 조작 되돌리기'}).click();await lat.fill('36.6012');await lon.fill('126.245');await editor.getByRole('button',{name:'2번 정점 수정',exact:true}).click();await expect(editor.locator('output')).toContainText('교차');
  await editor.getByRole('button',{name:'직전 조작 되돌리기'}).click();await lat.fill('90');await editor.getByRole('button',{name:'2번 정점 수정',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('허용 범위');
  await lat.fill('36.5998');await lon.fill('126.245');await editor.getByLabel('선택 정점',{exact:true}).selectOption('0');await editor.getByRole('button',{name:'선택 정점 뒤에 삽입',exact:true}).focus();await page.keyboard.press('Enter');await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 5');
  await lat.focus();await page.keyboard.press('Delete');expect(await get(request,a.id)).toEqual(a);await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 5');await page.keyboard.press('Escape');expect(await get(request,a.id)).toEqual(a);
 }finally{await remove(request,a.id);}
});

test('maximum vertices block insertion without adding map clicks and remain editable',async({page,request})=>{
 const ring=Array.from({length:128},(_,i)=>[126.245+0.001*Math.cos(2*Math.PI*i/128),36.6005+0.001*Math.sin(2*Math.PI*i/128)]);const a=await create(request,{boundary:{type:'Polygon',coordinates:[[...ring,ring[0]]]}});
 try{
  await isolate(page,[a.id]);await page.goto('/');const editor=await edit(page,a);await expect(page.locator('.facility-boundary-vertex')).toHaveCount(128);await expect(page.locator('.facility-boundary-insert')).toHaveCount(0);
  await page.locator('.leaflet-container').click({position:{x:650,y:200}});await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 128');await expect(editor.getByRole('alert')).toContainText('최대 128');expect(await get(request,a.id)).toEqual(a);
  await editor.getByText('좌표로 정점 추가·수정',{exact:true}).click();await expect(editor.getByRole('button',{name:'정점 추가',exact:true})).toBeDisabled();await expect(editor.getByRole('button',{name:'선택 정점 뒤에 삽입'})).toBeDisabled();
 }finally{await remove(request,a.id);}
});

test('reused facility delete confirmation distinguishes record marker and boundary; failure conflict and success isolate neighbour',async({page,request})=>{
 const a=await create(request),b=await create(request,{longitude:126.247});let fail=true;
 try{
  await isolate(page,[a.id,b.id]);await page.goto('/');let dialog=await show(page,a);await dialog.getByRole('button',{name:'수정',exact:true}).click();await dialog.getByRole('button',{name:'삭제',exact:true}).click();await expect(dialog).toContainText('레코드와 대표 마커, 저장된 경계를 모두 삭제');expect(await get(request,a.id)).toEqual(a);
  await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await dialog.getByRole('button',{name:'삭제',exact:true}).click();
  await page.route(`**/api/buildings/${a.id}`,route=>fail&&route.request().method()==='DELETE'?route.fulfill({status:503,json:{error:'합성 삭제 실패'}}):route.fallback());await dialog.getByRole('button',{name:'삭제 확인',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('합성 삭제 실패');expect(await get(request,a.id)).toEqual(a);
  fail=false;await request.put(`/api/buildings/${a.id}`,{headers:{'If-Match':'"1"'},data:{...a,description:'다른 창 수정'}});await dialog.getByRole('button',{name:'삭제 확인',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('다른 화면에서 변경');expect(await get(request,b.id)).toEqual(b);
  await page.keyboard.press('Escape');dialog=await show(page,a);await dialog.getByRole('button',{name:'수정',exact:true}).click();await dialog.getByRole('button',{name:'삭제',exact:true}).click();await dialog.getByRole('button',{name:'삭제 확인',exact:true}).click();await expect(dialog).toHaveCount(0);
  expect((await request.get(`/api/buildings/${a.id}`)).status()).toBe(404);await expect(page.locator('.building-marker')).toHaveCount(1);await expect(page.locator('.facility-boundary-saved')).toHaveCount(1);await expect(page.getByTestId('facility-result-count')).toHaveText('검색 결과 1개 / 전체 1개');expect(await get(request,b.id)).toEqual(b);
 }finally{await remove(request,a.id);await remove(request,b.id);}
});

test('mobile touch can drag a point and vertex and tap insertion while theme and resize preserve draft',async({browser,request})=>{
 const a=await create(request);const context=await browser.newContext({baseURL:'http://127.0.0.1:3102',viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage();
 try{
  await isolate(page,[a.id]);await page.goto('/');let editor=await position(page,a);const map=page.locator('.leaflet-container');await map.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
  const session=await context.newCDPSession(page);
  async function touchDrag(handle:Locator){await expect(page.locator('.leaflet-map-pane')).not.toHaveClass(/leaflet-pan-anim/);const p=(await handle.boundingBox())!,x=p.x+p.width/2,y=p.y+p.height/2;await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let i=1;i<=5;i++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+30*i/5,y:y-20*i/5}]});await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await touchDrag(page.getByRole('button',{name:'미저장 시설 지점 이동',exact:true}));await expect(editor.getByTestId('position-draft')).not.toContainText('36.6005000, 126.2450000');await editor.getByRole('button',{name:'위치 수정 취소'}).click();
  editor=await edit(page,a);await map.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');const before=await editor.locator('output').innerText();await touchDrag(page.getByRole('button',{name:'2번 경계 정점 선택·이동',exact:true}));await expect(editor.locator('output')).not.toHaveText(before);
  const insert=page.getByRole('button',{name:'1번 변에 정점 삽입',exact:true}),ib=(await insert.boundingBox())!;await page.touchscreen.tap(ib.x+22,ib.y+22);await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 5');
  await page.getByLabel('화면 테마',{exact:true}).selectOption('dark');await page.setViewportSize({width:1440,height:900});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','desktop');await page.setViewportSize({width:390,height:844});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','mobile');await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 5');expect(await get(request,a.id)).toEqual(a);
  const deletion=editor.getByRole('button',{name:'선택 정점 삭제',exact:true});await deletion.scrollIntoViewIfNeeded();const db=(await deletion.boundingBox())!;await page.touchscreen.tap(db.x+db.width/2,db.y+db.height/2);await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 4');
  const save=editor.getByRole('button',{name:'경계 저장',exact:true}),sb=(await save.boundingBox())!;await page.touchscreen.tap(sb.x+sb.width/2,sb.y+sb.height/2);await expect(editor).toHaveCount(0);expect((await get(request,a.id)).boundary).not.toEqual(a.boundary);expect((await get(request,a.id)).latitude).toBe(a.latitude);
 }finally{await context.close();await remove(request,a.id);}
});

test('direct-edit target switches discard drafts, and failed or delayed vertex saves never affect the other facility',async({page,request})=>{
 const a=await create(request),b=await create(request,{longitude:126.247});let mode='fail',held=false,release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 try{
  await page.setViewportSize({width:1440,height:900});await isolate(page,[a.id,b.id]);await page.goto('/');let moving=await position(page,a);await coords(moving,'36.603','126.248');await moving.getByRole('button',{name:'좌표 미리보기'}).click();
  await page.getByRole('button',{name:`${b.name} 시설·건물 정보 보기`,exact:true}).click();await expect(moving).toHaveCount(0);expect(await get(request,a.id)).toEqual(a);await page.keyboard.press('Escape');
  let editor=await edit(page,a);await drag(page,page.getByRole('button',{name:'2번 경계 정점 선택·이동',exact:true}),20,-15);
  await page.route(`**/api/buildings/${a.id}`,async route=>{if(route.request().method()!=='PUT')return route.fallback();if(mode==='fail')return route.fulfill({status:503,json:{error:'합성 정점 저장 실패'}});if(mode==='hold'){held=true;await gate;}return route.fallback();});
  const changed=await editor.locator('output').innerText();await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('합성 정점 저장 실패');await expect(editor.locator('output')).toHaveText(changed);expect(await get(request,a.id)).toEqual(a);
  mode='pass';await request.put(`/api/buildings/${a.id}`,{headers:{'If-Match':'"1"'},data:{...a,description:'동시 수정'}});await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('다른 화면에서 변경');await expect(editor.locator('output')).toHaveText(changed);
  await editor.getByRole('button',{name:'경계 편집 취소'}).click();editor=await edit(page,a);await drag(page,page.getByRole('button',{name:'2번 경계 정점 선택·이동',exact:true}),20,-15);mode='hold';
  await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect.poll(()=>held).toBe(true);await expect(editor.getByRole('button',{name:'선택 정점 삭제'})).toBeDisabled();await expect(editor.getByRole('button',{name:'직전 조작 되돌리기'})).toBeDisabled();
  await page.getByRole('button',{name:`${b.name} 시설·건물 정보 보기`,exact:true}).click();await page.keyboard.press('Escape');await expect(editor.getByRole('heading')).toContainText(a.name);await expect(page.getByRole('dialog')).toHaveCount(0);
  release();await expect(editor).toHaveCount(0);expect(await get(request,b.id)).toEqual(b);expect((await get(request,a.id)).boundary).not.toEqual(a.boundary);
 }finally{release();await remove(request,a.id);await remove(request,b.id);}
});
