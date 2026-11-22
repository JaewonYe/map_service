import {chromium,request} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const baseURL='http://127.0.0.1:3120',output=fileURLToPath(new URL('../docs/ui/issue-16/',import.meta.url));
const api=await request.newContext({baseURL});
const info=await(await api.get('/api/map-info')).json();
if(!info.sources?.length||!info.sources.every(s=>s.name?.startsWith('CC0 ')))throw Error('Synthetic CC0 catalog only');
const name='야외 시험장 · 직접 편집 검증',description='합성 시설 데이터 · 직접 편집 검증 전용';
let {buildings}=await(await api.get('/api/buildings')).json();
if(buildings.some(b=>b.name!==name||b.description!==description))throw Error('Unexpected facility data; refusing capture');
if(!buildings.length){const r=await api.post('/api/buildings',{data:{name,description,category:'야외 공간',latitude:36.5985,longitude:126.241,boundary:{type:'Polygon',coordinates:[[[126.2405,36.598],[126.2415,36.598],[126.2415,36.599],[126.2405,36.599],[126.2405,36.598]]]}}});if(!r.ok())throw Error(await r.text());}
({buildings}=await(await api.get('/api/buildings')).json());const target=buildings[0];
await mkdir(output,{recursive:true});const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
const manifest={baseURL,fixture:'Isolated .cache/ui-16-data; CC0 synthetic tiles, one synthetic facility; no saves/deletes',captures:[]};
for(const [device,viewport]of[['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]])for(const theme of ['light','dark']){
 const page=await browser.newPage({viewport,colorScheme:theme,reducedMotion:'reduce'});await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());await page.goto(baseURL);await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);await page.locator('.leaflet-tile-loaded').first().waitFor();
 async function show(){const toggle=page.getByRole('button',{name:'시설 목록',exact:true});if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();await page.getByRole('list',{name:'시설 검색 결과'}).getByRole('button',{name:new RegExp(name)}).click();}
 async function capture(state,details){await page.waitForFunction(()=>[...document.querySelectorAll('img.leaflet-tile')].every(i=>i.complete&&Number(getComputedStyle(i).opacity)===1));const file=`${device}-${theme}-${state}.png`;await page.screenshot({path:output+file,animations:'disabled'});manifest.captures.push({file,viewport,theme,state,details,camera:await page.getByTestId('map-center').innerText(),zoom:await page.getByTestId('zoom').innerText()});}
 async function raiseMap(){if(device==='mobile'){await page.locator('.leaflet-container').focus();for(let i=0;i<2;i++){await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>!document.querySelector('.leaflet-map-pane')?.classList.contains('leaflet-pan-anim'));}}}
 await show();await page.getByRole('button',{name:'위치 수정',exact:true}).click();const moving=page.getByRole('region',{name:'시설 위치 수정'});await moving.getByLabel('위치 위도',{exact:true}).fill('36.5988');await moving.getByLabel('위치 경도',{exact:true}).fill('126.2418');await moving.getByRole('button',{name:'좌표 미리보기'}).click();await raiseMap();await moving.locator('.boundary-editor-content').evaluate(el=>el.scrollTop=0);await capture('position','Original coordinate + unsaved point preview; saved boundary unchanged');if(device==='mobile'){await moving.getByRole('button',{name:'좌표 미리보기'}).scrollIntoViewIfNeeded();await capture('position-coordinates','Scrolled position coordinate alternative; save/cancel footer stays visible');}await moving.getByRole('button',{name:'위치 수정 취소'}).click();
 await show();await page.getByRole('button',{name:'경계 수정',exact:true}).click();const editor=page.getByRole('region',{name:'시설 경계 편집'});await editor.getByLabel('선택 정점',{exact:true}).selectOption('1');await raiseMap();await capture('vertices','Four saved vertices; vertex 2 selected; drag and insertion handles; no save');if(device==='mobile'){await editor.getByRole('button',{name:'선택 정점 삭제',exact:true}).scrollIntoViewIfNeeded();await capture('vertices-controls','Scrolled vertex selection/deletion controls and fixed save/cancel footer');}await editor.getByRole('button',{name:'경계 편집 취소'}).click();
 await show();const dialog=page.getByRole('dialog');await dialog.getByRole('button',{name:'수정',exact:true}).click();await dialog.getByRole('button',{name:'삭제',exact:true}).click();await dialog.getByRole('button',{name:'삭제 확인',exact:true}).scrollIntoViewIfNeeded();await capture('delete-confirm','Existing DELETE confirmation; record + marker + boundary consequence; never confirmed');await page.close();
}
if(JSON.stringify((await(await api.get(`/api/buildings/${target.id}`)).json()).building)!==JSON.stringify(target))throw Error('Capture changed saved data');
await writeFile(output+'manifest.json',JSON.stringify(manifest,null,2)+'\n');await browser.close();await api.dispose();
