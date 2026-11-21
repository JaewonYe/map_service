import {randomUUID} from 'node:crypto';
import {test, expect, type APIRequestContext, type Page, type Locator} from '@playwright/test';
const point={latitude:36.6005,longitude:126.245};
const boundary={type:'Polygon',coordinates:[[[126.2445,36.600],[126.2455,36.600],[126.2455,36.601],[126.2445,36.601],[126.2445,36.600]]]};
async function create(request: APIRequestContext, saved=false, longitude=point.longitude) {
  const response=await request.post('/api/buildings',{data:{name:`경계 ${randomUUID().slice(0,8)}`,category:'야외 공간',...point,longitude,...(saved?{boundary}:{})}});
  expect(response.status()).toBe(201); return (await response.json()).building;
}
async function get(request: APIRequestContext,id:string) {return (await (await request.get(`/api/buildings/${id}`)).json()).building;}
async function remove(request: APIRequestContext,id:string) {const b=await get(request,id);if(b) await request.delete(`/api/buildings/${id}`,{headers:{'If-Match':`"${b.version}"`}});}
async function isolate(page:Page,ids:string[]) {
  await page.route('**/api/buildings',async route=>{
    if(route.request().method()!=='GET')return route.fallback();
    const response=await route.fetch(),body=await response.json();
    await route.fulfill({json:{buildings:body.buildings.filter((b:any)=>ids.includes(b.id))}});
  });
}
async function show(page:Page,b:any,filter='') {
  await page.getByRole('button',{name:'시설 목록',exact:true}).click();
  await page.getByRole('searchbox',{name:'시설명 검색'}).fill(filter);
  await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:new RegExp(b.name)}).click();
  return page.getByRole('dialog');
}
async function edit(page:Page,b:any,filter='') {
  const dialog=await show(page,b,filter);await dialog.getByRole('button',{name:b.boundary?'경계 수정':'경계 추가',exact:true}).click();
  return page.getByRole('region',{name:'시설 경계 편집'});
}
async function add(editor:Locator,lat:string,lon:string) {
  await editor.getByLabel('정점 위도',{exact:true}).fill(lat);await editor.getByLabel('정점 경도',{exact:true}).fill(lon);
  await editor.getByRole('button',{name:'정점 추가',exact:true}).click();
}
async function triangle(editor:Locator) {
  await editor.getByText('좌표로 정점 추가·수정',{exact:true}).click();
  await add(editor,'36.600','126.2445');await add(editor,'36.600','126.2455');await add(editor,'36.601','126.245');
}

test('drawn boundary persists on reload; measurement reset leaves it and marker; saved polygon opens detail', async({page,request})=>{
  const a=await create(request);
  try {
    await isolate(page,[a.id]);await page.goto('/');const editor=await edit(page,a);
    // Real map clicks use the shared measurement drawing lifecycle.
    for(const pos of [{x:440,y:260},{x:610,y:260},{x:510,y:360}]) await page.locator('.leaflet-container').click({position:pos});
    await expect(editor.getByTestId('boundary-point-count')).toHaveText('정점 3 / 128개');
    await expect(editor.locator('output')).toContainText('면적');
    await expect(page.locator('.facility-boundary-draft')).toHaveCount(1);
    await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect(editor).toHaveCount(0);
    const stored=await get(request,a.id);expect(stored.boundary.coordinates[0]).toHaveLength(4);expect(stored.version).toBe(2);
    await page.reload();await expect(page.locator('.facility-boundary-saved')).toHaveCount(1);
    await expect(page.getByRole('button',{name:`${a.name} 시설·건물 정보 보기`,exact:true})).toBeVisible();
    await page.getByRole('button',{name:'거리',exact:true}).click();await page.locator('.leaflet-container').click({position:{x:600,y:340}});
    await page.getByRole('button',{name:'초기화',exact:true}).click();await expect(page.locator('.facility-boundary-saved')).toHaveCount(1);
    await page.getByRole('button',{name:'이동',exact:true}).click();
    const shape=page.getByRole('button',{name:`${a.name} 시설 경계 정보 보기`,exact:true});await shape.focus();await shape.press('Enter');
    await expect(page.getByRole('dialog').getByText(/저장된 경계 · 면적/)).toBeVisible();
    expect((await get(request,a.id)).boundary).toEqual(stored.boundary);
  }finally{await remove(request,a.id);}
});

test('edit preview undo cancel and Escape preserve disk; save remove and facility delete isolate other boundary',async({page,request})=>{
  const a=await create(request,true),b=await create(request,true,126.247);
  try{
    await isolate(page,[a.id,b.id]);await page.goto('/');
    await page.getByRole('button',{name:'거리',exact:true}).click();
    for(const position of [{x:440,y:260},{x:550,y:350}])await page.locator('.leaflet-container').click({position});
    await page.getByRole('button',{name:'이동',exact:true}).click();
    let editor=await edit(page,a);
    await editor.getByRole('button',{name:'다시 그리기'}).click();
    // Click inside the existing saved polygon: it must draw rather than reopen details.
    const shape=(await page.locator('.facility-boundary-saved').first().boundingBox())!;
    const zoom=await page.getByTestId('zoom').innerText();
    await page.mouse.dblclick(shape.x+shape.width*0.2,shape.y+shape.height*0.2);
    await page.mouse.click(shape.x+shape.width*0.8,shape.y+shape.height*0.2);
    await page.mouse.click(shape.x+shape.width*0.2,shape.y+shape.height*0.8);
    await expect(page.getByTestId('zoom')).toHaveText(zoom);
    await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 3');
    await editor.getByRole('button',{name:'경계 마지막 점 취소'}).click();await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 2');
    await expect(editor.getByRole('button',{name:'경계 저장',exact:true})).toBeDisabled();
    await editor.getByRole('button',{name:'경계 편집 취소'}).click();expect(await get(request,a.id)).toEqual(a);
    editor=await edit(page,a);await editor.getByRole('button',{name:'다시 그리기'}).click();await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);expect(await get(request,a.id)).toEqual(a);
    editor=await edit(page,a);await editor.getByRole('button',{name:'다시 그리기'}).click();await triangle(editor);
    await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect(editor).toHaveCount(0);
    expect((await get(request,a.id)).boundary.coordinates[0]).toHaveLength(4);
    let dialog=await show(page,a);await dialog.getByRole('button',{name:'경계 제거',exact:true}).click();
    await dialog.getByRole('button',{name:'경계 제거 확인'}).click();await expect(dialog).toHaveCount(0);
    expect((await get(request,a.id)).boundary).toBeUndefined();expect(await get(request,b.id)).toEqual(b);
    dialog=await show(page,b);await dialog.getByRole('button',{name:'수정',exact:true}).click();await dialog.getByRole('button',{name:'삭제',exact:true}).click();
    await dialog.getByRole('button',{name:'삭제 확인',exact:true}).click();await expect(dialog).toHaveCount(0);
    await expect(page.locator('.facility-boundary-saved')).toHaveCount(0);expect((await get(request,a.id)).name).toBe(a.name);
    await expect(page.getByTestId('measurement-points')).toHaveText('선택한 점: 2개');
    await expect(page.locator('.measurement-line')).toHaveCount(1);
  }finally{await remove(request,a.id);await remove(request,b.id);}
});

test('boundary API retains old PUT omission, validates polygon and rejects stale removal and missing version',async({request})=>{
  const a=await create(request,true);
  try{
    const {boundary:_boundary,...old}=a;
    const response=await request.put(`/api/buildings/${a.id}`,{headers:{'If-Match':'"1"'},data:{...old,name:'이전 클라이언트'}});
    expect(response.status()).toBe(200);expect((await response.json()).building.boundary).toEqual(boundary);
    expect((await request.put(`/api/buildings/${a.id}`,{headers:{'If-Match':'"1"'},data:{...a,boundary:null}})).status()).toBe(409);
    expect((await request.put(`/api/buildings/${a.id}`,{data:{...a,boundary:null}})).status()).toBe(428);
    for(const invalid of [{type:'MultiPolygon',coordinates:[]},{type:'Polygon',coordinates:[[[126,36],[126,36],[126,36]]]},
      {type:'Polygon',coordinates:[[[126,36],[126.01,36.01],[126,36.01],[126.01,36]]]}])
      expect((await request.put(`/api/buildings/${a.id}`,{headers:{'If-Match':'"2"'},data:{...a,boundary:invalid}})).status()).toBe(400);
    expect((await get(request,a.id)).boundary).toEqual(boundary);
  }finally{await remove(request,a.id);}
});

test('failed save and conflict retain saved polygon and draft; failed remove leaves original boundary',async({page,request})=>{
  const a=await create(request,true);let fail=true;
  try{
    await isolate(page,[a.id]);await page.goto('/');const editor=await edit(page,a);await editor.getByRole('button',{name:'다시 그리기'}).click();await triangle(editor);
    await page.route(`**/api/buildings/${a.id}`,route=>fail&&route.request().method()==='PUT'?route.fulfill({status:503,json:{error:'합성 저장 실패'}}):route.fallback());
    await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('합성 저장 실패');
    await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 3');expect(await get(request,a.id)).toEqual(a);
    await expect(page.locator('.facility-boundary-saved')).toHaveCount(1);await expect(page.locator('.facility-boundary-draft')).toHaveCount(1);
    fail=false;await request.put(`/api/buildings/${a.id}`,{headers:{'If-Match':'"1"'},data:{...a,description:'다른 창 수정'}});
    await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('다른 화면에서 변경');
    await expect(editor.getByTestId('boundary-point-count')).toContainText('정점 3');await editor.getByRole('button',{name:'경계 편집 취소'}).click();
    const dialog=await show(page,a);fail=true;await dialog.getByRole('button',{name:'경계 제거',exact:true}).click();await dialog.getByRole('button',{name:'경계 제거 확인'}).click();
    await expect(dialog.getByRole('alert')).toContainText('합성 저장 실패');expect((await get(request,a.id)).boundary).toEqual(boundary);
    fail=false;await dialog.getByRole('button',{name:'경계 제거 확인'}).click();await expect(dialog).toHaveCount(0);expect((await get(request,a.id)).boundary).toBeUndefined();
  }finally{await remove(request,a.id);}
});

test('switching target discards unsaved draft; delayed save cannot write another facility',async({page,request})=>{
  const a=await create(request,true),b=await create(request,false,126.247);let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});let held=false;
  try{
    await isolate(page,[a.id,b.id]);await page.goto('/');let editor=await edit(page,a);await editor.getByRole('button',{name:'다시 그리기'}).click();await triangle(editor);
    await page.getByRole('button',{name:`${b.name} 시설·건물 정보 보기`,exact:true}).click();await expect(editor).toHaveCount(0);
    await expect(page.getByRole('dialog').getByRole('heading',{name:b.name,exact:true})).toBeVisible();expect(await get(request,a.id)).toEqual(a);
    await page.keyboard.press('Escape');editor=await edit(page,a);await editor.getByRole('button',{name:'다시 그리기'}).click();await triangle(editor);
    await page.route(`**/api/buildings/${a.id}`,async route=>{if(route.request().method()==='PUT'){held=true;await gate;}await route.fallback();});
    await editor.getByRole('button',{name:'경계 저장',exact:true}).click();await expect.poll(()=>held).toBe(true);
    await page.getByRole('button',{name:`${b.name} 시설·건물 정보 보기`,exact:true}).click();await page.keyboard.press('Escape');
    await expect(editor.getByRole('heading')).toContainText(a.name);await expect(page.getByRole('dialog')).toHaveCount(0);
    release();await expect(editor).toHaveCount(0);expect((await get(request,a.id)).boundary.coordinates[0]).toHaveLength(4);expect(await get(request,b.id)).toEqual(b);
  }finally{release();await remove(request,a.id);await remove(request,b.id);}
});

test('filters synchronize polygons and markers; mobile keyboard adds modifies saves and removes boundary offline',async({page,request},testInfo)=>{
  const a=await create(request),b=await create(request,true,126.247);
  try{
    await page.setViewportSize({width:390,height:844});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());
    await isolate(page,[a.id,b.id]);await page.goto('/');let editor=await edit(page,a,a.name);
    await expect(page.locator('.facility-boundary-saved')).toHaveCount(0);await expect(page.locator('.building-marker')).toHaveCount(1);
    await triangle(editor);await editor.getByLabel('정점 위도',{exact:true}).fill('36.6012');await editor.getByLabel('정점 경도',{exact:true}).fill('126.245');
    await editor.getByRole('button',{name:'3번 정점 수정'}).focus();await page.keyboard.press('Enter');
    await expect(editor.getByText('3: 36.6012, 126.245',{exact:true})).toBeVisible();
    const bounds=(await editor.boundingBox())!;expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
    await page.screenshot({path:testInfo.outputPath('facility-boundary-editor-mobile.png')});
    await editor.getByRole('button',{name:'경계 저장',exact:true}).focus();await page.keyboard.press('Enter');await expect(editor).toHaveCount(0);
    await page.screenshot({path:testInfo.outputPath('facility-boundary-mobile.png')});
    await page.getByRole('button',{name:'시설 목록',exact:true}).click();await page.getByRole('searchbox',{name:'시설명 검색'}).fill(b.name);
    await expect(page.getByRole('button',{name:`${a.name} 시설 경계 정보 보기`,exact:true})).toHaveCount(0);await expect(page.locator('.building-marker')).toHaveCount(1);
    await page.getByRole('button',{name:'검색·분류 초기화'}).click();await expect(page.locator('.facility-boundary-saved')).toHaveCount(2);
    await page.getByRole('button',{name:'시설 목록',exact:true}).click();const dialog=await show(page,a);
    await dialog.getByRole('button',{name:'경계 제거',exact:true}).focus();await page.keyboard.press('Enter');await dialog.getByRole('button',{name:'경계 제거 확인'}).focus();await page.keyboard.press('Enter');await expect(dialog).toHaveCount(0);
    await page.getByRole('button',{name:'면적',exact:true}).click();await page.locator('.leaflet-container').click({position:{x:300,y:280}});
    await expect(page.getByTestId('measurement-points')).toContainText('1개');expect(await get(request,b.id)).toEqual(b);
  }finally{await remove(request,a.id);await remove(request,b.id);}
});
