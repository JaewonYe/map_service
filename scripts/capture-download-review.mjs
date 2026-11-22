import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
const directory=resolve('.cache/issue20-proof-v2'),out=resolve('docs/ui/issue-20'),proof=JSON.parse(await readFile(resolve(directory,'proof.json'),'utf8'));
if(!proof.transport.startsWith('CC0 synthetic')||!proof.isolatedNoNetworkImport)throw Error('Isolated CC0 evidence required');
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});await mkdir(out,{recursive:true});
const manifest={baseURL:'http://127.0.0.1:3120',fixture:proof,source:'CC0 localhost HTTP protocol fixture, production converters, isolated offline import; not official source download evidence',captures:[]};
async function open(device,theme){const page=await browser.newPage({viewport:device==='desktop'?{width:1440,height:900}:{width:390,height:844},colorScheme:theme,reducedMotion:'reduce'});await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.fallback():r.abort());await page.goto(manifest.baseURL+'/downloads');await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);await page.getByText(/오프라인 국가 개요입니다/).waitFor();return page;}
async function capture(p,device,theme,state){const file=`${device}-${theme}-${state}.png`;await p.screenshot({path:resolve(out,file),animations:'disabled'});manifest.captures.push({file,device,theme,state,viewport:p.viewportSize()});}
try{
 // Keep the fixture's real slow stream open until the four progress views are captured.
 if(process.argv.includes('--reuse-progress')){const old=JSON.parse(await readFile(resolve(out,'manifest.json'),'utf8'));if(old.fixture.progressJob!==proof.progressJob)throw Error('Progress evidence belongs to a different fixture');manifest.captures.push(...old.captures.filter(c=>c.state==='progress'));if(manifest.captures.length!==4)throw Error('Four existing real progress captures required');}
 else for(const device of ['desktop','mobile'])for(const theme of ['light','dark']){
  const page=await open(device,theme);await page.getByRole('list',{name:'지도 준비 작업'}).getByRole('button',{name:/CC0 합성 · 실제 수신 진행/}).click();await page.getByRole('progressbar',{name:'일반 지도 수신 진행'}).waitFor();await page.getByRole('article',{name:'선택 작업 상세'}).scrollIntoViewIfNeeded();await capture(page,device,theme,'progress');await page.close();
 }
 await writeFile(resolve(directory,'release-progress'),'captured\n');
 for(const device of ['desktop','mobile'])for(const theme of ['light','dark']){
  const page=await open(device,theme);await capture(page,device,theme,'area');
  await page.getByText('고급 level 설정',{exact:true}).click();await page.getByRole('button',{name:'영역·작업량 확인',exact:true}).click();await page.getByText('예상 작업량',{exact:true}).waitFor();await page.locator('.download-estimate').scrollIntoViewIfNeeded();await capture(page,device,theme,'settings');
  await page.getByRole('list',{name:'지도 준비 작업'}).getByRole('button',{name:/CC0 합성 · checksum 실패/}).click();await page.getByRole('article',{name:'선택 작업 상세'}).scrollIntoViewIfNeeded();await capture(page,device,theme,'failure');
  await page.getByRole('list',{name:'지도 준비 작업'}).getByRole('button',{name:'등록/이전 작업 · 완료',exact:true}).click();await page.getByRole('article',{name:'선택 작업 상세'}).scrollIntoViewIfNeeded();await capture(page,device,theme,'complete');await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});let external=0;
 await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.fallback();external++;return r.abort();});
 await page.goto(manifest.baseURL+'/');manifest.restoredLayerChecks=[];
 for(const [label,url] of [['일반 지도','/api/osm/'],['고도 지도','/api/elevation/tiles/'],['위성영상','/api/tiles/']]){await page.getByRole('radio',{name:label,exact:true}).check();await expect.poll(()=>page.locator('img.leaflet-tile-loaded').evaluateAll((imgs,url)=>imgs.filter(i=>i.src.includes(url)&&i.naturalWidth>0&&getComputedStyle(i).opacity==='1').length,url)).toBeGreaterThan(0);manifest.restoredLayerChecks.push({label,loaded:true});}
 await page.getByRole('radio',{name:'일반 지도',exact:true}).check();await expect.poll(()=>page.locator('img.leaflet-tile-loaded').evaluateAll(imgs=>imgs.filter(i=>i.src.includes('/api/osm/')&&i.naturalWidth>0&&getComputedStyle(i).opacity==='1').length)).toBeGreaterThan(0);
 for(const theme of ['light','dark']){await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);await page.waitForLoadState('networkidle');await capture(page,'desktop',theme,'offline-restored-map');}
 manifest.externalRequests=external;if(external)throw Error('Restored map attempted external traffic');await page.close();
}finally{await writeFile(resolve(directory,'release-progress'),'done\n');await browser.close();await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');}
