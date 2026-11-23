/** CC0 catalog/registration fixtures. No official imagery or live worker execution. */
import {spawn} from 'node:child_process';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {makeCatalogFixture,pixels} from '../tests/fixtures/catalog-fixture';
import {coordinate} from '../tests/fixtures/tpk-fixture';
const root=resolve('.cache/satellite-coexistence-review'),out=resolve('docs/ui/satellite-coexistence'),url='http://127.0.0.1:3125';
const base='11111111-1111-4111-8111-111111111111',detail='22222222-2222-4222-8222-222222222222';
const f=await makeCatalogFixture(join(root,'inputs'));await mkdir(join(root,'jobs'),{recursive:true});await mkdir(out,{recursive:true});
const save=async(path:string,value:unknown)=>writeFile(path,JSON.stringify(value,null,2)+'\n');
for(const [id,file,minZoom,maxZoom,name]of [[base,'korea/base.tpk',0,13,'CC0 전국 개요'],[detail,'regions/taean.tpk',14,19,'CC0 지역 상세']] as const){
 const directory=join(root,'packages',id,'satellite');await mkdir(directory,{recursive:true});await copyFile(join(root,'inputs',file),join(directory,'map.tpk'));
 await save(join(directory,'maps.json'),{version:1,sources:[{id:'downloaded',name,file:'map.tpk',role:'base',minZoom,maxZoom,usageConfirmed:true}]});
 const request={version:1,type:'download',id,name,createdAt:'2026-11-23T00:00:00Z'};
 await save(join(root,'jobs',id+'.request.json'),request);await save(join(root,'jobs',id+'.state.json'),{id,request,state:'completed',stage:'CC0 화면 검토 fixture',packageId:id,registered:true,createdAt:request.createdAt,items:{satellite:{state:'completed',result:{provider:'Self-generated CC0 pixels',format:'TPK CompactV2',notice:'화면·리더 검토용 합성 자료입니다. 실제 제공처 수신·worker 실행 결과가 아닙니다.'}}}});
}
await save(join(root,'active.json'),{version:1,revision:2,layers:{satellite:base},satellitePackages:[detail,base]});
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3125'],{stdio:['ignore','ignore','pipe'],env:{...process.env,MAP_DOWNLOADS_DIR:root,BUILDINGS_DIR:join(root,'facilities'),OSM_TILE_DIR:join(root,'no-osm'),OSM_EDITS_DIR:join(root,'edits'),STREET_TPK_DIR:join(root,'no-street'),ELEVATION_DIR:join(root,'no-dem'),MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false'}});
const reference=spawn('python3',['-m','http.server','3126','--bind','127.0.0.1','--directory',resolve('design-system/platform')],{stdio:'ignore'});
let errors='';server.stderr.on('data',chunk=>errors+=chunk);let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const manifest:any={source:'CC0 self-generated catalog fixtures; synthetic completed job labels; no official provider/worker evidence',baseURL:url,selected:[detail,base],checks:[],captures:[]};
try{
 let ready=false;for(let i=0;i<200;i++){try{if((await fetch(url+'/api/downloads')).ok){ready=true;break;}}catch{}await new Promise(ok=>setTimeout(ok,100));}if(!ready)throw Error('Review server did not start: '+errors);
 for(const z of [13,14,16,19]){const c=coordinate(z),r=await fetch(url+`/api/tiles/${z}/${c.x}/${c.y}`);assert.equal(r.status,200);assert.equal(r.headers.get('X-Map-Native-Zoom'),String(z));assert.equal(r.headers.get('X-Map-Fallback'),'false');assert.deepEqual(await pixels(Buffer.from(await r.arrayBuffer())),z===13?[30,130,60]:[30,70,200]);manifest.checks.push({zoom:z,nativeZoom:r.headers.get('X-Map-Native-Zoom'),source:r.headers.get('X-Map-Source'),fallback:false});}
 const c=coordinate(14),fallback=await fetch(url+`/api/tiles/14/${c.x+2}/${c.y}`);assert.equal(fallback.status,200);assert.equal(fallback.headers.get('X-Map-Native-Zoom'),'13');manifest.checks.push({outside:true,nativeZoom:13,fallback:true});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'});
 let external=0;
 for(const device of ['desktop','mobile'])for(const theme of ['light','dark']){
  const viewport=device==='desktop'?{width:1440,height:900}:{width:390,height:844},page=await browser.newPage({viewport,colorScheme:theme as 'light'|'dark',reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:3126/reference.html');await page.locator('#theme').selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.fallback();external++;return r.abort();});
  await page.goto(url+'/downloads');await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);await page.getByText(/오프라인 국가 개요입니다/).waitFor();
  const selection=page.getByLabel('함께 표시할 위성 지도',{exact:true});await expect(selection).toContainText('위성 패키지: 2개');await selection.scrollIntoViewIfNeeded();
  const file=`${device}-${theme}.png`;await page.screenshot({path:join(out,file),animations:'disabled'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));manifest.captures.push({file,device,theme,viewport});await page.close();
 }
 manifest.externalRequests=external;assert.equal(external,0);
}finally{await browser?.close();for(const process of [server,reference]){process.kill('SIGTERM');await new Promise<void>(ok=>{if(process.exitCode!==null||process.signalCode!==null)ok();else process.once('exit',()=>ok());});}await save(join(out,'manifest.json'),manifest);}
console.log('CC0 HTTP native zoom/fallback checks and four theme/device captures passed.');
