import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,symlink,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {parsePlan,parseBounds,tileCount,areaKm2,regions,tileLimits} from '../lib/downloads/model';
import {registry,managedDirectory} from '../lib/downloads/active';
import {submit,listJobs,cancel,atomic,readJob,upload} from '../lib/downloads/server';
import {GET,POST} from '../app/api/downloads/route';
import {POST as PLAN} from '../app/api/downloads/plan/route';
import {getOsmIndex} from '../lib/osm/index';
import {editView,change} from '../lib/osm/edit-service';
import {getElevation} from '../lib/maps/elevation';
import {getCatalog} from '../lib/tiles/catalog';
import {makeOsmIndex} from './fixtures/osm-fixture';
import {makeElevation} from './fixtures/elevation-fixture';
import {makeTpk,coordinate,center} from './fixtures/tpk-fixture';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const plan=()=>({name:'CC0 준비',bounds:{west:126.23,south:36.59,east:126.25,north:36.61},kinds:['osm','elevation'],region:'south-korea',levels:{satellite:{min:0,max:13},elevation:{min:8,max:13}},accepted:{osm:true,elevation:true},registryRevision:0});
async function fixture(t:any){const root=await mkdtemp(join(tmpdir(),'download-manager-')),previous=process.env.MAP_DOWNLOADS_DIR;process.env.MAP_DOWNLOADS_DIR=root;t.after(async()=>{if(previous===undefined)delete process.env.MAP_DOWNLOADS_DIR;else process.env.MAP_DOWNLOADS_DIR=previous;await rm(root,{recursive:true,force:true});});return root;}
test('bounded plan validates sources levels acceptance finite geometry precision and workload',()=>{
 assert.equal(parsePlan(plan()).name,'CC0 준비');assert.equal(tileCount({west:-1,south:-1,east:1,north:1},0,1),5);assert.ok(areaKm2({west:0,south:0,east:1,north:1})>12000);
 for(const patch of [{name:''},{region:'https://evil.test/a.pbf'},{kinds:['osm','osm']},{accepted:{}},{bounds:{west:0,south:0,east:50,north:1}},{kinds:['satellite'],accepted:{satellite:true},bounds:{west:126,south:36,east:127,north:37},levels:{satellite:{min:0,max:19},elevation:{min:8,max:13}}}])assert.throws(()=>parsePlan({...plan(),...patch}));
 assert.throws(()=>parseBounds({west:126,south:36,east:126.000000001,north:36.01}));
});
test('South Korea satellite levels0–13 pass the real plan and queue API while DEM and larger requests stay bounded',async t=>{
 const root=await fixture(t),bounds=regions['south-korea'].bounds;
 const korea={...plan(),name:'대한민국 위성 개요',bounds,kinds:['satellite'],accepted:{satellite:true},levels:{satellite:{min:0,max:13},elevation:{min:8,max:13}}};
 assert.equal(tileCount(bounds,0,13),45048);assert.equal(tileCount(bounds,0,12),11376);assert.equal(tileLimits.satellite,150000);assert.equal(tileLimits.elevation,10000);
 assert.deepEqual(parsePlan(korea).levels.satellite,{min:0,max:13});
 const request=(data:any)=>new Request('http://localhost/api/downloads/plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const estimate=await PLAN(request(korea));assert.equal(estimate.status,200);const body=await estimate.json();assert.equal(body.tileCounts.satellite,45048);assert.equal(body.bytesEstimate,null);assert.equal(body.timeEstimate,null);
 const queued=await POST(request(korea));assert.equal(queued.status,202);const job=await queued.json();assert.deepEqual(JSON.parse(await readFile(join(root,'jobs',job.id+'.request.json'),'utf8')).bounds,bounds);
 const larger={...korea,levels:{...korea.levels,satellite:{min:0,max:14}}};const rejected=await PLAN(request(larger));assert.equal(rejected.status,422);assert.match((await rejected.json()).error,/150,000/);
 const dem={...korea,kinds:['satellite','elevation'],accepted:{satellite:true,elevation:true}};assert.throws(()=>parsePlan(dem),/고도.*10,000/);
 assert.equal((await listJobs()).length,1);
});
test('actual job API persists immutable queue requests across independent reads and enforces origin size and JSON',async t=>{
 const root=await fixture(t),request=(data:any,headers={})=>new Request('http://localhost/api/downloads',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:typeof data==='string'?data:JSON.stringify(data)});
 const r=await POST(request(plan()));assert.equal(r.status,202);const {id}=await r.json();assert.match(id,/^[a-f0-9-]{36}$/);const bytes=await readFile(join(root,'jobs',id+'.request.json'));assert.equal(JSON.parse(bytes.toString()).type,'download');assert.equal((await readJob(id)).state,'queued');assert.equal((await GET()).headers.get('cache-control'),'no-store');
 assert.equal((await POST(request(plan(),{Origin:'https://evil.test'}))).status,403);assert.equal((await POST(request('{invalid'))).status,400);assert.equal((await POST(request('x'.repeat(16385)))).status,413);assert.deepEqual(await readFile(join(root,'jobs',id+'.request.json')),bytes);
});
test('queue capacity cancellation and stale registry checks never replace active data',async t=>{
 const root=await fixture(t);for(let i=0;i<10;i++)await submit(plan());await assert.rejects(submit(plan()),{status:429});const jobs=await listJobs();await cancel(jobs[0].id);assert.ok((await readFile(join(root,'jobs',jobs[0].id+'.cancel.json'))).length);assert.equal((await readJob(jobs[0].id)).state,'queued');
 const r={version:1,revision:1,layers:{}};await atomic(join(root,'active.json'),r);const bytes=await readFile(join(root,'active.json'));await assert.rejects(submit({...plan(),registryRevision:0}));assert.deepEqual(await readFile(join(root,'active.json')),bytes);
});
test('registry corruption and symlink escape fail without resetting operator files',async t=>{
 const root=await fixture(t),id=randomUUID();await writeFile(join(root,'active.json'),'{bad');await assert.rejects(registry());assert.equal(await readFile(join(root,'active.json'),'utf8'),'{bad');await atomic(join(root,'active.json'),{version:1,revision:1,layers:{osm:id}});await mkdir(join(root,'packages',id),{recursive:true});const outside=await mkdtemp(join(tmpdir(),'outside-map-'));t.after(()=>rm(outside,{recursive:true,force:true}));await symlink(outside,join(root,'packages',id,'osm'));await assert.rejects(managedDirectory('osm'));
});
test('streaming portable upload queues only complete files; interruption cleans partial and preserves request count',async t=>{
 const root=await fixture(t);const headers={'Content-Type':'application/zip','If-Match':'"0"','X-Map-Confirm-Usage':'true'};
 const result=await upload(new Request('http://localhost/api/downloads/import',{method:'POST',headers,body:Buffer.from('PK-test')}) as Request);assert.equal((await readJob(result.id)).request.type,'import');const req=JSON.parse(await readFile(join(root,'jobs',result.id+'.request.json'),'utf8'));assert.equal(await readFile(join(root,'incoming',req.uploadId+'.zip'),'utf8'),'PK-test');
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array([80,75]));c.error(Error('disconnect'));}});await assert.rejects(upload(new Request('http://localhost/api/downloads/import',{method:'POST',headers,body:stream,duplex:'half'} as any)));assert.equal((await listJobs()).length,1);assert.ok(!(await readdir(join(root,'incoming'))).some(n=>n.endsWith('.part')));
 await assert.rejects(upload(new Request('http://localhost/api/downloads/import',{method:'POST',headers:{...headers,Origin:'https://evil.test'},body:Buffer.from('PK')})),{status:403});
});
test('managed OSM reader edit API and PNG share active source identity while legacy base and edits survive switch',async t=>{
 const root=await fixture(t),oldOsm=process.env.OSM_TILE_DIR,oldEdits=process.env.OSM_EDITS_DIR;const legacy=join(root,'legacy'),id=randomUUID(),next=join(root,'packages',id,'osm');await makeOsmIndex(legacy);await makeOsmIndex(next);process.env.OSM_TILE_DIR=legacy;process.env.OSM_EDITS_DIR=join(root,'edits');t.after(()=>{if(oldOsm===undefined)delete process.env.OSM_TILE_DIR;else process.env.OSM_TILE_DIR=oldOsm;if(oldEdits===undefined)delete process.env.OSM_EDITS_DIR;else process.env.OSM_EDITS_DIR=oldEdits;});
 const old=await getOsmIndex(true),base=old.source('node:5')!;const oldBytes=await readFile(join(legacy,old.metadata.database));await change({action:'update',key:base.key,dataset:old.revision,fingerprint:base.fingerprint,value:{...base,name:'보존하는 로컬 수정'}},0);const before=hash(await readFile(join(root,'edits/edits.json')));
 await atomic(join(root,'active.json'),{version:1,revision:1,layers:{osm:id}});const current=await editView();assert.equal(await managedDirectory('osm'),next);assert.equal(current.index.reconcile(current.snapshot)[0].object.name,'보존하는 로컬 수정');assert.equal(current.index.reconcile(current.snapshot)[0].object.state,'modified');const c=coordinate(16);assert.ok(await current.index.tile(16,c.x,c.y));
 await atomic(join(root,'active.json'),{version:1,revision:2,layers:{}});assert.equal((await getOsmIndex(true)).metadata.database,old.metadata.database);assert.equal(hash(await readFile(join(root,'edits/edits.json'))),before);assert.deepEqual(await readFile(join(legacy,old.metadata.database)),oldBytes);
});
test('managed elevation returns real height and actual TPK reader serves supported package after registry activation',async t=>{
 const root=await fixture(t),id=randomUUID(),dem=join(root,'packages',id,'elevation'),sat=join(root,'packages',id,'satellite');await makeElevation(dem);const p=await makeTpk(sat);await writeFile(join(sat,'maps.json'),JSON.stringify({version:1,sources:[{id:'prepared',name:'CC0',file:p.path.split('/').at(-1),role:'base',minZoom:15,maxZoom:17,usageConfirmed:true}]}));
 await atomic(join(root,'active.json'),{version:1,revision:1,layers:{elevation:id,satellite:id}});assert.equal((await(await getElevation()).sample(...center as [number,number])).elevationMeters,123.5);const c=coordinate(16),tile=await(await getCatalog()).tile(16,c.x,c.y);assert.ok(tile);assert.equal(tile.mime,'image/jpeg');
});

test('Taean CLI keeps credentials out of job and argv while using specified bounds POST profile and raw folders',async t=>{
 const root=await fixture(t),bin=join(root,'bin');await mkdir(bin);const {chmod}=await import('node:fs/promises');const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const docker=join(bin,'docker');await writeFile(docker,`#!/usr/bin/env node\nconst fs=require('node:fs'),p=require('node:path');const dir=process.env.MAP_DOWNLOADS_HOST_DIR;const file=fs.readdirSync(p.join(dir,'jobs')).find(x=>x.endsWith('.request.json'));const r=JSON.parse(fs.readFileSync(p.join(dir,'jobs',file)));fs.writeFileSync(p.join(dir,'argv.json'),JSON.stringify(process.argv.slice(2)));fs.writeFileSync(p.join(dir,'env-proof.json'),JSON.stringify({arcgis:process.env.ARCGIS_TOKEN==='fixture-credential-must-not-appear',opentopo:process.env.OPENTOPOGRAPHY_API_KEY==='fixture-credential-must-not-appear'}));fs.writeFileSync(p.join(dir,'jobs',r.id+'.state.json'),JSON.stringify({id:r.id,state:'failed',stage:'fixture blocked',items:{},error:'synthetic permission failure'}));\n`);await chmod(docker,0o755);
 const envFile=join(root,'empty-credentials.env');await writeFile(envFile,'ARCGIS_TOKEN=\nOPENTOPOGRAPHY_API_KEY=\n');
 const sentinel='fixture-credential-must-not-appear';let output='';try{await promisify(execFile)(process.execPath,['--env-file='+envFile,'scripts/download-taean.mjs','--accept-usage'],{cwd:process.cwd(),env:{...process.env,PATH:bin+':'+process.env.PATH,MAP_DOWNLOADS_HOST_DIR:root,IMAGERY_HOST_DIR:join(root,'imagery'),DEM_HOST_DIR:join(root,'dem'),ARCGIS_TOKEN:sentinel,OPENTOPOGRAPHY_API_KEY:sentinel}});assert.fail('blocked fixture should exit nonzero');}catch(e:any){assert.equal(e.code,1);output=e.stdout+e.stderr;}
 assert.deepEqual(JSON.parse(await readFile(join(root,'env-proof.json'),'utf8')),{arcgis:true,opentopo:true});assert.ok(output.includes('\"ARCGIS_TOKEN\":true'));
 const files=(await readdir(join(root,'jobs'))).filter(n=>n.endsWith('.request.json'));assert.equal(files.length,1);const raw=await readFile(join(root,'jobs',files[0]),'utf8'),r=JSON.parse(raw);assert.equal(r.bounds.south,36.585138820015565);assert.equal(r.bounds.east,126.24993476192829);assert.deepEqual(r.levels.satellite,{min:15,max:17});assert.equal(r.demProvider,'opentopography');assert.equal(r.kinds.includes('osm'),false);assert.equal(raw.includes(sentinel),false);assert.equal(output.includes(sentinel),false);const argv=JSON.parse(await readFile(join(root,'argv.json'),'utf8'));assert.deepEqual(argv,['compose','--profile','downloads','run','--rm','--build','download-worker','--once']);assert.equal(argv.join(' ').includes(sentinel),false);
});

test('organization discovery uses the current token safely and only returns an official organization URL',async t=>{
 const root=await fixture(t),loader=join(root,'mock-fetch.mjs'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 const sentinel='fixture-discovery-token',base={urlKey:'fixture-org',customBaseUrl:'maps.arcgis.com',user:{orgId:'fixture-org-id',username:'fixture-user',email:'fixture@example.test'}};
 for(const [result,ok]of [[base,true],[{...base,customBaseUrl:'evil.example'},false],[{...base,urlKey:'x/../../bad'},false],[{error:{code:498,message:sentinel}},false]] as const){
  await writeFile(loader,`globalThis.fetch=async(url,options)=>{if(url!=='https://www.arcgis.com/sharing/rest/portals/self?f=json'||options.headers.Authorization!=='Bearer '+process.env.ARCGIS_TOKEN||options.headers.Referer!=='https://fixture-app.example'||options.redirect!=='error')throw Error('invalid request');return new Response(JSON.stringify(${JSON.stringify(result)}));};`);
  let stdout='',stderr='',code=0;try{({stdout,stderr}=await promisify(execFile)(process.execPath,['--import',loader,'scripts/arcgis-organization.mjs'],{cwd:process.cwd(),env:{...process.env,ARCGIS_TOKEN:sentinel,ARCGIS_REFERER:'https://fixture-app.example'}}));}catch(e:any){stdout=e.stdout;stderr=e.stderr;code=e.code;}
  assert.equal(code,ok?0:1);if(ok)assert.equal(stdout,'https://fixture-org.maps.arcgis.com\n');else assert.equal(stdout,'');assert.equal((stdout+stderr).includes(sentinel),false);assert.equal((stdout+stderr).includes('fixture@example.test'),false);assert.equal((stdout+stderr).includes('fixture-user'),false);
 }
});

test('Taean CLI resumes a Docker startup failure without another request or changed revision',async t=>{
 const root=await fixture(t),bin=join(root,'bin');await mkdir(bin);const {chmod}=await import('node:fs/promises'),{execFile}=await import('node:child_process'),{promisify}=await import('node:util');
 const docker=join(bin,'docker');await writeFile(docker,`#!/usr/bin/env node\nconst fs=require('node:fs'),p=require('node:path'),root=process.env.MAP_DOWNLOADS_HOST_DIR;fs.appendFileSync(p.join(root,'calls.jsonl'),JSON.stringify(process.argv.slice(2))+'\\n');if(process.env.CLI_FIXTURE_MODE==='offline')process.exit(127);const file=fs.readdirSync(p.join(root,'jobs')).find(x=>x.endsWith('.request.json'));const r=JSON.parse(fs.readFileSync(p.join(root,'jobs',file)));fs.writeFileSync(p.join(root,'jobs',r.id+'.state.json'),JSON.stringify({id:r.id,state:'completed',stage:'registered',registered:true,items:{}}));\n`);await chmod(docker,0o755);
 const sentinel='fixture-resume-token';const env={...process.env,PATH:bin+':'+process.env.PATH,MAP_DOWNLOADS_HOST_DIR:root,IMAGERY_HOST_DIR:join(root,'imagery'),DEM_HOST_DIR:join(root,'dem'),ARCGIS_TOKEN:sentinel};
 async function run(flags:string[],mode='online'){try{const r=await promisify(execFile)(process.execPath,['scripts/download-taean.mjs','--accept-usage',...flags],{cwd:process.cwd(),env:{...env,CLI_FIXTURE_MODE:mode}});return {code:0,output:r.stdout+r.stderr};}catch(e:any){return {code:e.code,output:e.stdout+e.stderr};}}
 const first=await run([],'offline');assert.equal(first.code,127);assert.ok(first.output.includes('--resume'));const files=()=>readdir(join(root,'jobs')).then(v=>v.filter(x=>x.endsWith('.request.json')));assert.equal((await files()).length,1);
 const file=(await files())[0],before=await readFile(join(root,'jobs',file)),request=JSON.parse(before.toString());
 const duplicate=await run([]);assert.equal(duplicate.code,1);assert.ok(duplicate.output.includes('새 요청을 추가하지 않았습니다'));assert.equal((await files()).length,1);
 const incompatible=await run(['--resume','--refresh']);assert.equal(incompatible.code,1);
 assert.equal((await readFile(join(root,'calls.jsonl'),'utf8')).trim().split('\n').length,1);
 await atomic(join(root,'active.json'),{version:1,revision:7,layers:{}});await atomic(join(root,'jobs',request.id+'.state.json'),{id:request.id,state:'running',items:{}});
 const resumed=await run(['--resume']);assert.equal(resumed.code,0);assert.ok(resumed.output.includes('기존 태안 작업 '+request.id));assert.deepEqual(await readFile(join(root,'jobs',file)),before);assert.equal(JSON.parse(before.toString()).registryRevision,0);
 const calls=await readFile(join(root,'calls.jsonl'),'utf8');assert.equal(calls.trim().split('\n').length,2);assert.equal(calls.includes(sentinel),false);assert.equal((first.output+resumed.output+before.toString()).includes(sentinel),false);
 const completed=await run(['--resume']);assert.equal(completed.code,1);assert.equal((await files()).length,1);
 await rm(join(root,'jobs',request.id+'.state.json'));const other=randomUUID();await atomic(join(root,'jobs',other+'.request.json'),{...request,id:other});const multiple=await run(['--resume']);assert.equal(multiple.code,1);assert.equal((await files()).length,2);assert.equal((await readFile(join(root,'calls.jsonl'),'utf8')).trim().split('\n').length,2);
 await rm(join(root,'jobs',other+'.request.json'));await atomic(join(root,'jobs',file),{...request,name:'another task'});const unrelated=await run(['--resume']);assert.equal(unrelated.code,1);assert.equal((await readFile(join(root,'calls.jsonl'),'utf8')).trim().split('\n').length,2);
});
