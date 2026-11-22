import {chromium,request} from '@playwright/test';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,rename} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const baseURL='http://127.0.0.1:3120',root=fileURLToPath(new URL('../',import.meta.url));
const directory=resolve(root,'.cache/ui-18-base'),metadataFile=resolve(directory,'metadata.json'),out=resolve(root,'docs/ui/issue-18');
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const metadataBytes=await readFile(metadataFile),metadata=JSON.parse(metadataBytes.toString()),pbf=resolve(directory,'south-korea.osm.pbf');
const expected='eccc5bddd45f31710c04a5d13f878a7dbcdf5d97e3aa38dfc61f1a1fb6e7cb19';
if(metadata.sourceSha256!==expected||digest(await readFile(pbf))!==expected)throw Error('Only the exact generated CC0 PBF is allowed');
const database=resolve(directory,metadata.database),baseHash=digest(await readFile(database));
const api=await request.newContext({baseURL});
async function json(r){const value=await r.json();if(!r.ok())throw Error(JSON.stringify(value));return value;}
let state=await json(await api.get('/api/osm/objects?changes=1'));
if(state.changeCount)throw Error('Use the empty isolated ui-18-edits store');
const facilitySnapshot=await json(await api.get('/api/buildings'));if(facilitySnapshot.buildings.length)throw Error('Use the empty isolated ui-18-facilities store');
const target=await json(await api.get('/api/osm/objects/way%3A103')),place=await json(await api.get('/api/osm/objects/node%3A24'));
if(target.object.name!=='Test building'||place.object.name!=='태안 시험지명')throw Error('Unexpected prepared fixture objects');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
const manifest={baseURL,fixture:'Generated CC0 PBF through production prepare.py/schema2; isolated edits/facilities; copied published set only for source-change conflict',pbfSha256:expected,originalBaseSha256:baseHash,captures:[]};
async function capture(page,device,theme,state){await page.waitForFunction(()=>!document.querySelector('.leaflet-map-pane')?.classList.contains('leaflet-pan-anim'));await page.waitForFunction(()=>[...document.querySelectorAll('img.leaflet-tile')].every(i=>i.complete&&Number(getComputedStyle(i).opacity)===1));const file=`${device}-${theme}-${state}.png`;await page.screenshot({path:resolve(out,file),animations:'disabled'});manifest.captures.push({file,device,theme,state,viewport:page.viewportSize(),camera:await page.getByTestId('map-center').innerText(),zoom:await page.getByTestId('zoom').innerText()});}
async function open(page,device,theme){await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.fallback():route.abort());await page.goto(baseURL);await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);await page.getByRole('button',{name:'지도 정보',exact:true}).click();await page.getByRole('button',{name:'일반 지도 편집',exact:true}).click();return page.getByRole('region',{name:'일반 지도 편집',exact:true});}
async function raiseMap(page,device){if(device!=='mobile')return;await page.locator('.leaflet-container').focus();for(let i=0;i<2;i++){await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>!document.querySelector('.leaflet-map-pane')?.classList.contains('leaflet-pan-anim'));}}
async function alignAtTop(locator){await locator.evaluate(el=>{const panel=el.closest('.boundary-editor-content');panel.scrollTop+=el.getBoundingClientRect().top-panel.getBoundingClientRect().top;});}
async function publish(bytes){const temporary=resolve(directory,'.visual-metadata.tmp');await writeFile(temporary,bytes);await rename(temporary,metadataFile);}
try{
 for(const [device,viewport]of[['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport,colorScheme:theme,reducedMotion:'reduce'});const editor=await open(page,device,theme);
  await editor.getByRole('list',{name:'일반 지도 객체',exact:true}).getByRole('button',{name:/Test building/}).click();await editor.getByRole('button',{name:'객체 수정',exact:true}).waitFor();await raiseMap(page,device);if(device==='mobile')await alignAtTop(editor.getByRole('heading',{name:'Test building',exact:true}));await capture(page,device,theme,'selected');
  await editor.getByRole('button',{name:'객체 수정',exact:true}).click();await editor.getByLabel('지도 객체 이름',{exact:true}).fill('Test building · 미저장 초안');await editor.getByLabel('선택 지도 정점',{exact:true}).selectOption('1');await editor.locator('.boundary-editor-content').evaluate(el=>el.scrollTop=0);if(device==='mobile')await alignAtTop(editor.getByRole('heading',{name:'객체 초안 수정',exact:true}));await capture(page,device,theme,'editing');
  if(device==='mobile'){await editor.getByText('지도 정점 좌표 입력',{exact:true}).click();await alignAtTop(editor.getByText('지도 정점 좌표 입력',{exact:true}));await capture(page,device,theme,'editing-fields');}
  await editor.getByRole('button',{name:'지도 초안 취소'}).click();await editor.getByRole('button',{name:'로컬 삭제',exact:true}).click();await editor.getByRole('group',{name:'일반 지도 변경 확인'}).scrollIntoViewIfNeeded();await capture(page,device,theme,'delete-confirm');await page.close();
 }
 state=await json(await api.get('/api/osm/objects?changes=1'));
 await json(await api.post('/api/osm/objects',{headers:{'If-Match':`"${state.revision}"`},data:{action:'update',key:place.object.key,fingerprint:place.object.fingerprint,dataset:state.dataset,value:{...place.object,name:'로컬 수정 · 원본 변경 검토'}}}));
 const folder=resolve(directory,'sets/visual-conflict');await mkdir(folder,{recursive:true});await copyFile(database,resolve(folder,'map.sqlite'));
 const db=new DatabaseSync(resolve(folder,'map.sqlite'));try{db.prepare('UPDATE features SET name=?,fingerprint=? WHERE source_key=?').run('변경된 원본 지명','f'.repeat(64),place.object.key);}finally{db.close();}
 await publish(JSON.stringify({...metadata,database:'sets/visual-conflict/map.sqlite'}));
 for(const [device,viewport]of[['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]])for(const theme of ['light','dark']){
  const page=await browser.newPage({viewport,colorScheme:theme,reducedMotion:'reduce'});const editor=await open(page,device,theme);await editor.getByText(/로컬 수정 내역/).click();await editor.getByRole('list',{name:'일반 지도 수정 내역'}).getByRole('button',{name:/로컬 수정 · 원본 변경 검토.*충돌/}).click();await editor.getByText(/현재 원본: 변경된 원본 지명/).waitFor();await raiseMap(page,device);await editor.getByText(/현재 원본: 변경된 원본 지명/).scrollIntoViewIfNeeded();await capture(page,device,theme,'conflict');if(device==='mobile'){await editor.getByRole('button',{name:'원본으로 복원',exact:true}).scrollIntoViewIfNeeded();await capture(page,device,theme,'conflict-actions');}await page.close();
 }
}finally{
 await publish(metadataBytes);state=await json(await api.get('/api/osm/objects?changes=1'));if(state.changes.length===1&&state.changes[0].key===place.object.key)await json(await api.post('/api/osm/objects',{headers:{'If-Match':`"${state.revision}"`},data:{action:'restore',key:place.object.key,dataset:state.dataset}}));
 await browser.close();await api.dispose();
}
if(digest(await readFile(database))!==baseHash||digest(await readFile(pbf))!==expected)throw Error('Original fixture changed');
manifest.finalOriginalHashesPreserved=true;await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
