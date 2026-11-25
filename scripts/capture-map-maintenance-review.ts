/** Actual HTTP + Docker maintenance worker, with self-generated CC0 map data only. */
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,rm,copyFile,writeFile,readFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {makeCatalogFixture,pixels} from '../tests/fixtures/catalog-fixture';
import {coordinate} from '../tests/fixtures/tpk-fixture';
const run=promisify(execFile),root=resolve('.cache/map-maintenance-review'),out=resolve('docs/ui/map-maintenance'),url='http://127.0.0.1:3125';
const image=process.env.MAINTENANCE_REVIEW_IMAGE||'map-service-download-worker:maintenance',name='map-maintenance-review-'+randomUUID().slice(0,8);
await rm(root,{recursive:true,force:true});await mkdir(out,{recursive:true});const f=await makeCatalogFixture(join(root,'inputs'));
const save=async(path:string,value:unknown)=>{await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');};
const base=randomUUID(),detail=randomUUID();
for(const [id,file,minZoom,maxZoom,title]of [[base,'korea/base.tpk',0,13,'CC0 전국 개요'],[detail,'regions/taean.tpk',14,19,'CC0 지역 상세']] as const){
 const d=join(root,'downloads/packages',id,'satellite');await mkdir(d,{recursive:true});await copyFile(join(root,'inputs',file),join(d,'map.tpk'));await save(join(d,'maps.json'),{version:1,sources:[{id:'downloaded',name:title,file:'map.tpk',role:'base',minZoom,maxZoom,usageConfirmed:true}]});
 const files=[];for(const file of ['map.tpk','maps.json']){const bytes=await readFile(join(d,file));files.push({path:'satellite/'+file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}await save(join(root,'downloads/packages',id,'manifest.json'),{version:1,id,items:{satellite:{provider:'Self-generated CC0',attribution:'CC0 synthetic pixels',license:'CC0',usageConfirmed:true}},files});
 const request={version:1,id,type:'download',name:title,createdAt:'2026-11-25T00:00:00Z'};await save(join(root,'downloads/jobs',id+'.request.json'),request);await save(join(root,'downloads/jobs',id+'.state.json'),{id,request,state:'completed',stage:'CC0 지도 리더 fixture',packageId:id,registered:true,createdAt:request.createdAt,items:{}});
}
await save(join(root,'downloads/active.json'),{version:1,revision:2,layers:{satellite:base},satellitePackages:[detail,base]});
for(const d of ['imagery','dem','tpk','street','osm','elevation','facilities','edits']){await mkdir(join(root,d),{recursive:true});await writeFile(join(root,d,'sentinel.txt'),'preserve-'+d);}
await writeFile(join(root,'settings.env.fixture'),'CREDENTIAL_CONFIG_SENTINEL=fixture-only');await copyFile(join(root,'inputs/korea/base.tpk'),join(root,'tpk/map.tpk'));
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3125'],{stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',MAP_DOWNLOADS_DIR:join(root,'downloads'),BUILDINGS_DIR:join(root,'facilities'),OSM_EDITS_DIR:join(root,'edits'),OSM_TILE_DIR:join(root,'osm'),TPK_PATH:join(root,'tpk/map.tpk'),TPK_USAGE_CONFIRMED:'true',STREET_TPK_DIR:join(root,'street'),ELEVATION_DIR:join(root,'elevation'),MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false'}});
const reference=spawn('python3',['-m','http.server','3126','--bind','127.0.0.1','--directory',resolve('design-system/platform')],{stdio:'ignore'});
const mounts=['downloads','imagery','dem','tpk','osm','street','elevation'].flatMap(k=>['-v',join(root,k)+':/data/'+k]);
const envs=['-e','MAP_DOWNLOADS_DIR=/data/downloads','-e','MAP_IMAGERY_DIR=/data/imagery','-e','MAP_DEM_DIR=/data/dem',...['tpk','osm','street','elevation'].flatMap(k=>['-e','MAP_MAINTENANCE_'+k.toUpperCase()+'_DIR=/data/'+k])];
const manifest:any={source:'Self-generated CC0 reader/job fixtures; real Next.js HTTP and production Docker maintenance worker; no official provider imagery/download claim',image,captures:[],checks:[]};let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
async function info(){return (await fetch(url+'/api/downloads')).json();}
try{
 await run('docker',['run','-d','--rm','--name',name,'--network','none','--read-only','--tmpfs','/tmp:rw,size=64m',...mounts,...envs,image,'--offline']);
 await expect.poll(async()=>{try{const i=await info();return i.worker?.online&&i.worker?.maintenanceVersion===1;}catch{return false;}},{timeout:30000}).toBe(true);
 // Exercise the upload route and maintenance route concurrently in the real production server.
 let uploadController!:ReadableStreamDefaultController<Uint8Array>;const abort=new AbortController();
 const uploading=fetch(url+'/api/downloads/import',{method:'POST',headers:{'Content-Type':'application/zip','If-Match':'"2"','X-Map-Confirm-Usage':'true'},body:new ReadableStream<Uint8Array>({start(c){uploadController=c;c.enqueue(new Uint8Array([80,75]));}}),duplex:'half',signal:abort.signal} as RequestInit).catch(()=>null);
 await expect.poll(async()=>{try{return (await readdir(join(root,'downloads/incoming'))).some(n=>n.endsWith('.part'));}catch{return false;}}).toBe(true);
 const blocked=await fetch(url+'/api/downloads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'maintenance',operation:'clear',confirmation:'전체 초기화',registryRevision:2,includeLegacy:true})});assert.equal(blocked.status,409);abort.abort();try{uploadController.error(Error('fixture aborted upload'));}catch{}await uploading;
 await expect.poll(async()=>(await readdir(join(root,'downloads/incoming'))).filter(n=>n.endsWith('.part')).length).toBe(0);assert.equal((await info()).jobs.length,2);manifest.checks.push({action:'concurrent-upload',clearStatus:409,partialCleaned:true});
 const c=coordinate(19),tile=await fetch(url+`/api/tiles/19/${c.x}/${c.y}`);assert.equal(tile.status,200);assert.deepEqual(await pixels(Buffer.from(await tile.arrayBuffer())),[30,70,200]);
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'});let external=0;
 for(const device of ['desktop','mobile'])for(const theme of ['light','dark']){
  const viewport=device==='desktop'?{width:1440,height:900}:{width:390,height:844},page=await browser.newPage({viewport,colorScheme:theme as 'light'|'dark',reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:3126/reference.html');await page.locator('#theme').selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  await page.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.fallback();external++;return r.abort();});await page.goto(url+'/downloads');await page.getByLabel('화면 테마',{exact:true}).selectOption(theme);
  const button=page.getByRole('button',{name:'지도 데이터 전체 초기화',exact:true});await expect(button).toBeEnabled();await button.focus();await page.keyboard.press('Enter');const group=page.getByRole('group',{name:'전체 초기화 확인',exact:true});await expect(group.getByRole('heading')).toBeFocused();await expect(group.getByRole('button',{name:'확인하고 전체 초기화'})).toBeDisabled();await group.getByLabel('확인 문구: 전체 초기화',{exact:true}).fill('전체 초기화');await group.scrollIntoViewIfNeeded();
  const file=`${device}-${theme}-confirm.png`;await page.screenshot({path:join(out,file),animations:'disabled'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));manifest.captures.push({file,device,theme,viewport});await group.getByRole('button',{name:'정리 취소'}).click();await expect(button).toBeFocused();await page.close();
 }
 const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto(url+'/downloads');await page.getByRole('button',{name:'지도 데이터 전체 초기화',exact:true}).click();const group=page.getByRole('group',{name:'전체 초기화 확인',exact:true});await group.getByLabel('확인 문구: 전체 초기화',{exact:true}).fill('전체 초기화');await group.getByRole('button',{name:'확인하고 전체 초기화'}).click();
 await expect.poll(async()=>{const i=await info();return !i.maintenance.pending&&i.maintenance.operations[0]?.state;},{timeout:30000}).toBe('completed');let i=await info();assert.equal(i.jobs.length,0);assert.deepEqual(i.registry.layers,{});const backup=i.maintenance.operations[0].backupId;assert.ok(backup);
 const layers=await(await fetch(url+'/api/map-info')).json();assert.equal(layers.layers.satellite.available,false);manifest.checks.push({action:'clear',state:'completed',jobs:0,activeLayers:0,manualSatelliteAvailable:false,backupId:backup});
 await page.getByRole('button',{name:'작업 다시 조회',exact:true}).click();await page.getByText('복원 가능한 백업 1개',{exact:true}).click();await page.getByRole('button',{name:'이 백업 복원',exact:true}).click();const restore=page.getByRole('group',{name:'백업 복원 확인',exact:true});await restore.getByLabel('확인 문구: 백업 복원',{exact:true}).fill('백업 복원');await restore.getByRole('button',{name:'확인하고 백업 복원'}).click();
 await expect.poll(async()=>{const i=await info();return i.maintenance.operations.find((o:any)=>o.request.operation==='restore')?.state;},{timeout:30000}).toBe('completed');i=await info();assert.equal(i.jobs.length,2);assert.deepEqual(i.registry.satellitePackages,[detail,base]);const restored=await fetch(url+`/api/tiles/19/${c.x}/${c.y}`);assert.equal(restored.status,200);assert.equal(restored.headers.get('X-Map-Native-Zoom'),'19');assert.deepEqual(await pixels(Buffer.from(await restored.arrayBuffer())),[30,70,200]);
 for(const d of ['imagery','dem','tpk','street','osm','elevation','facilities','edits'])assert.equal(await readFile(join(root,d,'sentinel.txt'),'utf8'),'preserve-'+d);assert.equal(await readFile(join(root,'settings.env.fixture'),'utf8'),'CREDENTIAL_CONFIG_SENTINEL=fixture-only');manifest.checks.push({action:'restore',state:'completed',jobs:2,satellitePackages:2,nativeZoom:19,preserved:['raw/manual maps','facilities','OSM edits','configuration fixture']});await page.getByRole('button',{name:'작업 다시 조회',exact:true}).click();await page.getByRole('button',{name:'선택 작업·지도 삭제',exact:true}).click();const deletion=page.getByRole('group',{name:'지도 삭제 확인',exact:true});await deletion.getByLabel('확인 문구: 지도 삭제',{exact:true}).fill('지도 삭제');await deletion.getByRole('button',{name:'확인하고 지도 삭제'}).click();
 await expect.poll(async()=>{const i=await info();return i.maintenance.operations.find((o:any)=>o.request.operation==='delete')?.state;},{timeout:30000}).toBe('completed');i=await info();assert.equal(i.jobs.length,1);assert.equal(i.registry.satellitePackages.length,1);manifest.checks.push({action:'delete',state:'completed',jobs:1,satellitePackages:1});
 await page.getByRole('button',{name:'작업 다시 조회',exact:true}).click();const backups=page.getByText('복원 가능한 백업 1개',{exact:true});await backups.click();await page.getByRole('button',{name:'이 백업 복원',exact:true}).click();const undo=page.getByRole('group',{name:'백업 복원 확인',exact:true});await undo.getByLabel('확인 문구: 백업 복원',{exact:true}).fill('백업 복원');await undo.getByRole('button',{name:'확인하고 백업 복원'}).click();
 await expect.poll(async()=>{const i=await info();return i.jobs.length===2&&!i.maintenance.pending;},{timeout:30000}).toBe(true);manifest.checks.push({action:'undo-delete',state:'completed',jobs:2});manifest.externalRequests=external;assert.equal(external,0);await page.close();
}finally{
 await browser?.close();await run('docker',['stop','--time','5',name]).catch(()=>{});for(const child of [server,reference]){child.kill('SIGTERM');await new Promise<void>(ok=>{if(child.exitCode!==null||child.signalCode!==null)ok();else child.once('exit',()=>ok());});}await save(join(out,'manifest.json'),manifest);
}
console.log('Real HTTP/worker clear→restore, native zoom pixels, preservation and four theme/device captures passed.');
