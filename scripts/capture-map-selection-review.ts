/** Actual HTTP + Docker selection worker, with self-generated CC0 data only. */
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,rm,copyFile,writeFile,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {makeCatalogFixture,pixels,korea,taean} from '../tests/fixtures/catalog-fixture';
import {coordinate} from '../tests/fixtures/tpk-fixture';
const run=promisify(execFile),root=resolve('.cache/map-selection-review'),out=resolve('docs/ui/map-selection'),url='http://127.0.0.1:3130';
const image=process.env.SELECTION_REVIEW_IMAGE||'map-service-download-worker:selection',name='map-selection-review-'+randomUUID().slice(0,8);
await rm(root,{recursive:true,force:true});await mkdir(out,{recursive:true});await makeCatalogFixture(join(root,'inputs'));
const save=async(path:string,value:unknown)=>{await mkdir(resolve(path,'..'),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');};
const base=randomUUID(),local=randomUUID(),overlap=randomUUID();
for(const [index,[id,file,levels,bounds,title]]of ([[base,'korea/base.tpk',Array.from({length:14},(_,i)=>i),korea,'CC0 대한민국 개요'],[local,'regions/taean.tpk',[14,16,19],taean,'CC0 태안 상세'],[overlap,'regions/port.tpk',[16],taean,'CC0 태안 중첩']] as const).entries()){
 const d=join(root,'downloads/packages',id,'satellite');await mkdir(d,{recursive:true});await copyFile(join(root,'inputs',file),join(d,'map.tpk'));await save(join(d,'maps.json'),{version:1,sources:[{id:'downloaded',name:title,file:'map.tpk',role:'base',priority:0,minZoom:levels[0],maxZoom:levels.at(-1),usageConfirmed:true}]});
 const files=[];for(const file of ['map.tpk','maps.json']){const bytes=await readFile(join(d,file));files.push({path:'satellite/'+file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
 const createdAt=`2026-11-25T00:00:0${index}Z`;await save(join(root,'downloads/packages',id,'manifest.json'),{version:1,id,name:title,createdAt,items:{satellite:{provider:'Self-generated CC0',attribution:'CC0 synthetic pixels',license:'CC0',usageConfirmed:true,zoomLevels:levels,requestedBounds:bounds,bounds}},files});
 const request={version:1,id,type:'download',name:title,createdAt};await save(join(root,'downloads/jobs',id+'.request.json'),request);await save(join(root,'downloads/jobs',id+'.state.json'),{id,request,state:'completed',stage:'CC0 reader fixture',packageId:id,registered:true,createdAt,items:{}});
}
await save(join(root,'downloads/active.json'),{version:1,revision:1,layers:{satellite:base},satellitePackages:[base],satelliteVisible:true});
const preserve=['imagery','dem','tpk','street','osm','elevation','facilities','edits'];for(const d of preserve){await mkdir(join(root,d),{recursive:true});await writeFile(join(root,d,'sentinel.txt'),'preserve-'+d);}await copyFile(join(root,'inputs/korea/base.tpk'),join(root,'tpk/map.tpk'));
await mkdir(join(root,'downloads/exports'),{recursive:true});await writeFile(join(root,'downloads/exports',base+'.zip'),'CC0 ZIP preservation sentinel');
const hashes=new Map<string,string>();for(const id of [base,local,overlap])for(const f of ['manifest.json','satellite/map.tpk','satellite/maps.json']){const p=join(root,'downloads/packages',id,f);hashes.set(p,createHash('sha256').update(await readFile(p)).digest('hex'));}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3130'],{stdio:'ignore',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1',MAP_DOWNLOADS_DIR:join(root,'downloads'),BUILDINGS_DIR:join(root,'facilities'),OSM_EDITS_DIR:join(root,'edits'),OSM_TILE_DIR:join(root,'osm'),TPK_PATH:join(root,'tpk/map.tpk'),TPK_USAGE_CONFIRMED:'true',STREET_TPK_DIR:join(root,'street'),ELEVATION_DIR:join(root,'elevation'),MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false'}});
const reference=spawn('python3',['-m','http.server','3131','--bind','127.0.0.1','--directory',resolve('design-system/platform')],{stdio:'ignore'});
const mounts=['downloads','imagery','dem'].flatMap(k=>['-v',join(root,k)+':/data/'+k]);
const manifest:any={source:'Self-generated CC0 package/status fixtures; actual Next.js HTTP and production offline Docker worker selection; no official imagery claim',image,captures:[],checks:[]};let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
async function info(){return (await fetch(url+'/api/downloads')).json();}
async function tile(z:number,dx=0){const c=coordinate(z),r=await fetch(url+`/api/tiles/${z}/${c.x+dx}/${c.y}`);assert.equal(r.status,200);return {native:Number(r.headers.get('X-Map-Native-Zoom')),rgb:await pixels(Buffer.from(await r.arrayBuffer()))};}
try{
 await run('docker',['run','-d','--rm','--name',name,'--network','none','--read-only','--tmpfs','/tmp:rw,size=64m',...mounts,'-e','MAP_DOWNLOADS_DIR=/data/downloads','-e','MAP_IMAGERY_DIR=/data/imagery','-e','MAP_DEM_DIR=/data/dem',image,'--offline']);
 await expect.poll(async()=>{try{const i=await info();return i.worker?.online&&i.worker?.selectionVersion===1;}catch{return false;}},{timeout:30000}).toBe(true);assert.deepEqual(await tile(16),{native:13,rgb:[30,130,60]});
 browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium'});let external=0;
 const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});await page.goto(url+'/downloads');
 const selection=page.getByRole('region',{name:'다운로드한 위성 지도 표시'});await expect(selection.getByRole('checkbox')).toHaveCount(3);
 const west=page.getByLabel('서쪽 경도', {exact:true});const beforeWest=await west.inputValue();
 const pane=page.locator('.download-map .leaflet-map-pane');const beforeCamera=await pane.getAttribute('style');
 await selection.getByRole('button',{name:'전체 선택',exact:true}).click();await selection.getByRole('button',{name:'선택한 지도 표시',exact:true}).click();
 await expect.poll(async()=>(await info()).registry.satellitePackages?.length,{timeout:30000}).toBe(3);await expect(selection.getByText('선택 3개 / 사용 가능 3개 · 현재 적용 3개',{exact:true})).toBeVisible();
 assert.equal(await west.inputValue(),beforeWest);assert.equal(await pane.getAttribute('style'),beforeCamera);
 const checks=[await tile(14),await tile(16),await tile(19),await tile(14,2)];assert.deepEqual(checks,[{native:14,rgb:[30,70,200]},{native:16,rgb:[220,30,30]},{native:19,rgb:[30,70,200]},{native:13,rgb:[30,130,60]}]);manifest.checks.push({action:'all-select',selected:3,zoom14:checks[0],zoom16:checks[1],zoom19:checks[2],outsideLocal:checks[3],cameraAndBboxPreserved:true});
 for(const device of ['desktop','mobile'])for(const theme of ['light','dark']){
  const viewport=device==='desktop'?{width:1440,height:900}:{width:390,height:844},p=await browser.newPage({viewport,colorScheme:theme as 'light'|'dark',reducedMotion:'reduce'});
  await p.goto('http://127.0.0.1:3131/reference.html');await p.locator('#theme').selectOption(theme);await expect(p.locator('html')).toHaveAttribute('data-theme',theme);
  await p.route('**/*',r=>{if(new URL(r.request().url()).hostname==='127.0.0.1')return r.fallback();external++;return r.abort();});await p.goto(url+'/downloads');await p.getByLabel('화면 테마',{exact:true}).selectOption(theme);
  const region=p.getByRole('region',{name:'다운로드한 위성 지도 표시'});await expect(region.getByRole('checkbox',{checked:true})).toHaveCount(3);await region.scrollIntoViewIfNeeded();
  const file=`${device}-${theme}-selection.png`;await p.screenshot({path:join(out,file),animations:'disabled'});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));manifest.captures.push({file,device,theme,viewport});await p.close();
 }
 await selection.getByRole('button',{name:'전체 해제',exact:true}).click();await selection.getByRole('button',{name:'선택한 지도 표시',exact:true}).click();await expect.poll(async()=>(await info()).registry.satelliteVisible,{timeout:30000}).toBe(false);
 await expect(selection.getByText('선택 0개 / 사용 가능 3개 · 현재 적용 0개',{exact:true})).toBeVisible();await expect.poll(async()=>page.locator('.download-map .leaflet-tile-pane img').count()).toBe(0);let layers=await(await fetch(url+'/api/map-info')).json();assert.equal(layers.layers.satellite.available,false);await page.reload();await expect(selection.getByRole('checkbox',{checked:true})).toHaveCount(0);manifest.checks.push({action:'all-off-reload',satelliteVisible:false,manualFallback:false,previewTileCount:0});
 await selection.getByRole('checkbox',{name:'CC0 태안 상세',exact:true}).check();await selection.getByRole('button',{name:'선택한 지도 표시',exact:true}).click();await expect.poll(async()=>(await info()).registry.satellitePackages?.join(','),{timeout:30000}).toBe(local);assert.deepEqual(await tile(16),{native:16,rgb:[30,70,200]});
 await selection.getByRole('button',{name:'CC0 태안 상세 영역 보기',exact:true}).click();assert.equal(await west.inputValue(),beforeWest);
 for(const [p,h]of hashes)assert.equal(createHash('sha256').update(await readFile(p)).digest('hex'),h);for(const d of preserve)assert.equal(await readFile(join(root,d,'sentinel.txt'),'utf8'),'preserve-'+d);assert.equal(await readFile(join(root,'downloads/exports',base+'.zip'),'utf8'),'CC0 ZIP preservation sentinel');
 manifest.checks.push({action:'local-only',unselectedOverlapIgnored:true,sourceHashesPreserved:true,rawZipFacilitiesEditsPreserved:true,viewAreaKeepsDownloadBbox:true});manifest.externalRequests=external;assert.equal(external,0);await page.close();
}finally{
 await browser?.close();await run('docker',['stop','--time','5',name]).catch(()=>{});for(const child of [server,reference]){child.kill('SIGTERM');await new Promise<void>(ok=>{if(child.exitCode!==null||child.signalCode!==null)ok();else child.once('exit',()=>ok());});}await save(join(out,'manifest.json'),manifest);
}
console.log('Actual HTTP/worker selection, all-off, native zoom pixels, preservation, and four theme/device captures passed.');
