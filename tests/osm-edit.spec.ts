import {test,expect,type Page,type APIRequestContext,type Locator} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {coordinate} from './fixtures/tpk-fixture';
// These cases intentionally share one prepared dataset and its global optimistic revision.
// Keep the existing two-worker project configuration; this new file executes its mutations in order.
test.describe.configure({mode:'default'});
const unique=()=>`CC0 편집 ${randomUUID().slice(0,8)}`;
async function state(request:APIRequestContext){return(await(await request.get('/api/osm/objects?changes=1')).json());}
async function mutate(request:APIRequestContext,payload:any){const s=await state(request);const r=await request.post('/api/osm/objects',{headers:{'If-Match':`"${s.revision}"`},data:{dataset:s.dataset,...payload}});expect(r.status(),await r.text()).toBe(200);return r.json();}
async function cleanup(request:APIRequestContext,key:string){await mutate(request,{action:'restore',key});}
async function enter(page:Page){await page.getByRole('button',{name:'지도 정보',exact:true}).click();await page.getByRole('button',{name:'일반 지도 편집',exact:true}).click();const editor=page.getByRole('region',{name:'일반 지도 편집',exact:true});await expect(editor).toBeVisible();await expect(editor.getByRole('button',{name:'현재 화면 다시 조회'})).toBeEnabled();return editor;}
async function choose(editor:Locator,name:string){await editor.getByRole('list',{name:'일반 지도 객체',exact:true}).getByRole('button',{name:new RegExp(name)}).click();await expect(editor.getByRole('heading',{name,exact:true})).toBeVisible();}
async function newObject(editor:Locator,kind:string,name:string){await editor.getByLabel('새 객체 유형',{exact:true}).selectOption(kind);await editor.getByRole('button',{name:'새 일반 지도 객체 추가'}).click();await editor.getByLabel('지도 객체 이름',{exact:true}).fill(name);await editor.getByText('지도 정점 좌표 입력',{exact:true}).click();}
async function add(editor:Locator,lat:string,lon:string){await editor.getByLabel('지도 정점 위도',{exact:true}).fill(lat);await editor.getByLabel('지도 정점 경도',{exact:true}).fill(lon);await editor.getByRole('button',{name:'지도 정점 끝에 추가',exact:true}).click();}
async function save(editor:Locator){await editor.getByRole('button',{name:'일반 지도 저장',exact:true}).click();await expect(editor.getByRole('button',{name:'객체 수정',exact:true})).toBeVisible();}
async function keyFor(request:APIRequestContext,name:string){return(await state(request)).changes.find((o:any)=>o.name===name)?.key;}

test('explicit offline mode selects actual objects with overlapping click candidates and keeps facilities and measurements separate',async({page,request})=>{
 await page.setViewportSize({width:1440,height:900});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());await page.goto('/');
 await page.getByRole('button',{name:'거리',exact:true}).click();await page.locator('.leaflet-container').click({position:{x:550,y:230}});
 const editor=await enter(page);await expect(page.locator('.map-workspace')).toHaveAttribute('data-osm-editing','true');await expect(page.getByRole('button',{name:'시설·건물 추가',exact:true})).toBeDisabled();
 await choose(editor,'CC0 태안 시험지명');await expect(editor).toContainText('node:5');await expect(editor).toContainText('Point');await expect(editor).toContainText('OSM 원본');
 await editor.getByRole('button',{name:'객체 선택 해제'}).click();const box=(await page.locator('.leaflet-container').boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await expect(editor.getByRole('status').filter({hasText:/겹친 후보/})).toBeVisible();await choose(editor,'CC0 태안 시험지명');await expect(editor).toContainText('node:5');
 await editor.getByRole('button',{name:'일반 지도 편집 종료'}).click();await expect(page.getByTestId('measurement-points')).toContainText('1개');await expect(page.getByRole('button',{name:'시설·건물 추가',exact:true})).toBeEnabled();expect((await state(request)).changes).toEqual([]);
});

test('new point saves into actual PNG and reloads; editing name and position replaces old label; local delete removes only new object',async({page,request})=>{
 const name=unique();let key='';const {x,y}=coordinate(15);const url=`/api/osm/15/${x}/${y}`;const before=(await request.get(url)).headers().etag;
 try{
  await page.goto('/');const editor=await enter(page);const priorUrl=await page.locator('img.leaflet-tile-loaded').first().getAttribute('src');await newObject(editor,'place',name);await add(editor,'36.5985','126.241');await save(editor);await expect.poll(()=>page.locator('img.leaflet-tile-loaded').first().getAttribute('src')).not.toBe(priorUrl);key=await keyFor(request,name);expect(key).toMatch(/^local:/);
  const after=await request.get(url);expect(after.headers().etag).not.toBe(before);expect(after.headers()['cache-control']).toBe('private,no-cache');
  await page.reload();const again=await enter(page);await choose(again,name);await again.getByRole('button',{name:'객체 수정',exact:true}).click();await again.getByLabel('지도 객체 이름',{exact:true}).fill(name+' 변경');await again.getByText('지도 정점 좌표 입력',{exact:true}).click();await again.getByLabel('지도 정점 위도',{exact:true}).fill('36.600');await again.getByLabel('지도 정점 경도',{exact:true}).fill('126.244');await again.getByRole('button',{name:'선택 지도 정점 수정',exact:true}).click();await save(again);
  expect((await(await request.get('/api/osm/objects/'+encodeURIComponent(key))).json()).object.geometry.coordinates).toEqual([126.244,36.6]);expect((await request.get(url)).headers().etag).not.toBe(after.headers().etag);
  await again.getByRole('button',{name:'로컬 삭제',exact:true}).click();await expect(again.getByRole('group',{name:'일반 지도 변경 확인'})).toContainText('원본 파일은 보존');await again.getByRole('button',{name:'일반 지도 변경 돌아가기'}).click();expect(await keyFor(request,name+' 변경')).toBe(key);
  await again.getByRole('button',{name:'로컬 삭제',exact:true}).click();await again.getByRole('button',{name:'일반 지도 변경 확인',exact:true}).click();await expect.poll(()=>keyFor(request,name+' 변경')).toBeUndefined();key='';
 }finally{if(key)await cleanup(request,key);}
});

test('road and building shape coordinate alternatives insert remove undo validate and save distinct geometries',async({page,request})=>{
 const keys:string[]=[];
 try{
  await page.goto('/');const editor=await enter(page);
  for(const kind of ['road','building']){
   const name=unique();await newObject(editor,kind,name);await add(editor,'36.599','126.242');await add(editor,'36.599','126.243');await add(editor,'36.600','126.243');
   await editor.getByRole('button',{name:'선택 지도 정점 뒤에 삽입'}).click();await expect(editor.locator('output')).toContainText('중복');await expect(editor.getByRole('button',{name:'일반 지도 저장',exact:true})).toBeDisabled();await editor.getByRole('button',{name:'지도 직전 조작 되돌리기'}).click();
   await editor.getByLabel('선택 지도 정점',{exact:true}).selectOption('1');if(kind==='building')await expect(editor.getByRole('button',{name:'선택 지도 정점 삭제',exact:true})).toBeDisabled();else{await editor.getByRole('button',{name:'선택 지도 정점 삭제',exact:true}).click();await editor.getByRole('button',{name:'지도 직전 조작 되돌리기'}).click();}
   await save(editor);const key=await keyFor(request,name);keys.push(key);const object=(await(await request.get('/api/osm/objects/'+encodeURIComponent(key))).json()).object;expect(object.geometry.type).toBe(kind==='road'?'LineString':'Polygon');await editor.getByRole('button',{name:'객체 선택 해제'}).click();
  }
 }finally{for(const key of keys)await cleanup(request,key);}
});

test('source hide and original restore change PNG without deleting base or facility records',async({page,request})=>{
 const original=(await(await request.get('/api/osm/objects/node%3A5')).json()).object;const {x,y}=coordinate(15),url=`/api/osm/15/${x}/${y}`,before=(await request.get(url)).headers().etag;
 try{
  await page.goto('/');const editor=await enter(page);await choose(editor,original.name);await editor.getByRole('button',{name:'로컬 삭제',exact:true}).click();await editor.getByRole('button',{name:'일반 지도 변경 확인',exact:true}).click();
  await expect.poll(async()=> (await state(request)).changes.find((o:any)=>o.key===original.key)?.state).toBe('hidden');expect((await request.get(url)).headers().etag).not.toBe(before);
  await editor.getByText(/로컬 수정 내역/).click();await editor.getByRole('list',{name:'일반 지도 수정 내역'}).getByRole('button',{name:new RegExp(original.name)}).click();await editor.getByRole('button',{name:'원본으로 복원',exact:true}).click();await editor.getByRole('button',{name:'일반 지도 변경 확인',exact:true}).click();await expect.poll(async()=> (await state(request)).changes.length).toBe(0);expect((await request.get(url)).headers().etag).toBe(before);
 }finally{if((await state(request)).changes.some((o:any)=>o.key===original.key))await cleanup(request,original.key);}
});

test('save failure version conflict and delayed responses preserve draft and lock duplicate target switches',async({page,request})=>{
 const name=unique();let key='',release!:()=>void,held=false;const gate=new Promise<void>(r=>release=r);let mode='fail';
 try{
  await page.goto('/');const editor=await enter(page);await newObject(editor,'place',name);await add(editor,'36.5985','126.241');
  await page.route('**/api/osm/objects',async route=>{if(route.request().method()!=='POST')return route.fallback();if(mode==='fail')return route.fulfill({status:503,json:{error:'합성 저장 실패'}});if(mode==='hold'){held=true;await gate;}return route.fallback();});
  await editor.getByRole('button',{name:'일반 지도 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('합성 저장 실패');await expect(editor.getByLabel('지도 객체 이름',{exact:true})).toHaveValue(name);
  mode='hold';await editor.getByRole('button',{name:'일반 지도 저장',exact:true}).click();await expect.poll(()=>held).toBe(true);await expect(editor.getByRole('button',{name:'지도 초안 취소'})).toBeDisabled();await page.keyboard.press('Escape');await expect(editor).toBeVisible();release();await expect(editor.getByRole('button',{name:'객체 수정',exact:true})).toBeVisible();key=await keyFor(request,name);
  await editor.getByRole('button',{name:'객체 수정',exact:true}).click();await editor.getByLabel('지도 객체 이름',{exact:true}).fill(name+' 충돌');await mutate(request,{action:'update',key,value:{...pointValue,name:'다른 창'}});mode='pass';await editor.getByRole('button',{name:'일반 지도 저장',exact:true}).click();await expect(editor.getByRole('alert')).toContainText('다른 화면에서 변경');await expect(editor.getByLabel('지도 객체 이름',{exact:true})).toHaveValue(name+' 충돌');
  await editor.getByRole('button',{name:'일반 지도 편집 종료'}).click();await expect(editor.getByRole('group',{name:'일반 지도 변경 확인'})).toContainText('미저장 초안');await editor.getByRole('button',{name:'일반 지도 변경 확인',exact:true}).click();await expect(editor).toHaveCount(0);
 }finally{release();if(key)await cleanup(request,key);}
});
const pointValue={name:'점',kind:'place',class:'town',geometry:{type:'Point',coordinates:[126.241,36.5985]}};

test('prepared base replacement shows retained conflict and explicit reapply then restore',async({page,request})=>{
 const original=(await(await request.get('/api/osm/objects/node%3A5')).json()).object;const directory=resolve('.cache/test-osm'),metadataFile=resolve(directory,'metadata.json'),bytes=await readFile(metadataFile);const metadata=JSON.parse(bytes.toString());
 try{
  await mutate(request,{action:'update',key:original.key,fingerprint:original.fingerprint,value:{...original,name:'로컬 충돌 보존'}});
  const folder=resolve(directory,'sets/browser-replaced');await mkdir(folder,{recursive:true});await copyFile(resolve(directory,metadata.database),resolve(folder,'map.sqlite'));const db=new DatabaseSync(resolve(folder,'map.sqlite'));db.prepare('UPDATE features SET name=?,fingerprint=? WHERE source_key=?').run('새 원본 지명','e'.repeat(64),original.key);db.close();await writeFile(metadataFile,JSON.stringify({...metadata,database:'sets/browser-replaced/map.sqlite'}));
  await page.goto('/');const editor=await enter(page);await editor.getByText(/로컬 수정 내역/).click();await editor.getByRole('list',{name:'일반 지도 수정 내역'}).getByRole('button',{name:/로컬 충돌 보존.*충돌/}).click();await expect(editor).toContainText('현재 원본: 새 원본 지명');await editor.getByRole('button',{name:'객체 수정',exact:true}).click();await editor.getByRole('button',{name:'원본 검토 후 재적용'}).click();await expect(editor.getByRole('button',{name:'객체 수정',exact:true})).toBeVisible();expect((await state(request)).changes.find((o:any)=>o.key===original.key)?.state).toBe('modified');
  await editor.getByRole('button',{name:'원본으로 복원',exact:true}).click();await editor.getByRole('button',{name:'일반 지도 변경 확인',exact:true}).click();await expect.poll(async()=> (await state(request)).changes.length).toBe(0);
 }finally{await writeFile(metadataFile,bytes);if((await state(request)).changes.some((o:any)=>o.key===original.key))await cleanup(request,original.key);}
});

test('mobile touch point editing, keyboard alternatives, theme and responsive changes keep draft and visible footer',async({browser,request})=>{
 const context=await browser.newContext({baseURL:'http://127.0.0.1:3104',hasTouch:true,isMobile:true,viewport:{width:390,height:844}}),page=await context.newPage();const name=unique();let key='';
 try{
  await page.goto('/');const editor=await enter(page);await editor.getByLabel('새 객체 유형',{exact:true}).selectOption('place');await editor.getByRole('button',{name:'새 일반 지도 객체 추가'}).click();await editor.getByLabel('지도 객체 이름',{exact:true}).fill(name);await page.touchscreen.tap(200,230);await expect(editor.locator('output')).toContainText('정점 1/1');
  await page.getByLabel('화면 테마',{exact:true}).selectOption('dark');await expect(editor).toHaveCSS('background-color','rgb(17, 28, 46)');await page.setViewportSize({width:1440,height:900});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','desktop');await page.setViewportSize({width:390,height:844});await expect(page.locator('.map-workspace')).toHaveAttribute('data-layout','mobile');await expect(editor.getByLabel('지도 객체 이름',{exact:true})).toHaveValue(name);
  await editor.getByLabel('지도 객체 이름',{exact:true}).focus();await page.keyboard.press('Backspace');await expect(editor.locator('output')).toContainText('정점 1/1');await editor.getByLabel('지도 객체 이름',{exact:true}).fill(name);
  const save=editor.getByRole('button',{name:'일반 지도 저장',exact:true});await expect(save).toBeInViewport();await save.focus();await page.keyboard.press('Enter');await expect(editor.getByRole('button',{name:'객체 수정',exact:true})).toBeVisible();key=await keyFor(request,name);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 }finally{await context.close();if(key)await cleanup(request,key);}
});

test('unsupported derived objects explain read-only state and wide or failed queries are distinct from no candidates',async({page})=>{
 await page.goto('/');const editor=await enter(page);await editor.getByRole('list',{name:'일반 지도 객체',exact:true}).getByRole('button',{name:/이름 없음 · land/}).click();await expect(editor.getByRole('button',{name:'객체 수정',exact:true})).toBeDisabled();await expect(editor.getByText(/읽기 전용/)).toBeVisible();
 await page.route('**/api/osm/objects?*',route=>route.fulfill({status:503,json:{error:'합성 조회 실패'}}));await editor.getByRole('button',{name:'현재 화면 다시 조회'}).click();await expect(editor.getByRole('alert')).toContainText('합성 조회 실패');await expect(editor.getByRole('button',{name:'현재 화면 다시 조회'})).toBeEnabled();
});
