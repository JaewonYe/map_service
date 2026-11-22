import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import sharp from 'sharp';
import {OsmIndex} from '../lib/osm';
import {renderSvg,escapeXml} from '../lib/osm/render';
import {makeOsmIndex} from './fixtures/osm-fixture';
import {coordinate} from './fixtures/tpk-fixture';
async function fixture(t:any){
  const directory=await mkdtemp(join(tmpdir(),'osm-render-'));t.after(()=>rm(directory,{force:true,recursive:true}));
  const metadata=await makeOsmIndex(directory);return {directory,metadata};
}
test('indexed OSM renders real PNGs at low/detail/zoom19, reuses cached requests and returns 404 outside bounds',async t=>{
  const {directory}=await fixture(t),reader=await OsmIndex.load(directory);t.after(()=>reader.close());
  for(const z of [0,7,13,16,19]){
    const {x,y}=coordinate(z),tile=await reader.tile(z,x,y);assert.ok(tile);assert.equal(tile.mime,'image/png');
    const image=await sharp(tile.bytes).metadata();assert.equal(image.width,256);assert.equal(image.height,256);
    const group=await Promise.all(Array.from({length:12},()=>reader.tile(z,x,y)));assert.ok(group.every(other=>other?.etag===tile.etag));
  }
  const centre=coordinate(16);
  const viewport=await Promise.all(Array.from({length:30},(_,i)=>reader.tile(16,centre.x+i%6,centre.y+Math.floor(i/6))));
  assert.ok(viewport.every(tile=>tile?.mime==='image/png'));
  assert.equal(await reader.tile(16,0,0),null);assert.equal(await reader.tile(20,coordinate(20).x,coordinate(20).y),null);
  await assert.rejects(reader.tile(1,2,0),{status:400});
});
test('renderer escapes user-controlled labels and includes roads, buildings and Korean names',()=>{
  const point={type:'Point',coordinates:[0,0]},name='<script>alert("x")</script>& 한글';
  const svg=renderSvg([{id:1,kind:'place',class:'city',name,geometry:JSON.stringify(point)}],0,0,0,false);
  assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('한글'));
  assert.equal(escapeXml('a\u0000&b'),'a&amp;b');
});
test('metadata and usage permission are validated before database access',async t=>{
  const {directory,metadata}=await fixture(t);
  for(const patch of [{usageConfirmed:false},{database:'../outside.sqlite'},{bounds:{south:2,north:1,west:0,east:1}},{maxZoom:24}]){
    await writeFile(join(directory,'metadata.json'),JSON.stringify({...metadata,...patch}));await assert.rejects(OsmIndex.load(directory));
  }
});
test('index symlinks cannot escape the data folder',async t=>{
  const {directory,metadata}=await fixture(t),external=await mkdtemp(join(tmpdir(),'osm-other-'));t.after(()=>rm(external,{recursive:true,force:true}));
  const original=await readFile(join(directory,metadata.database));await writeFile(join(external,'map.sqlite'),original);
  await rm(join(directory,metadata.database));await symlink(join(external,'map.sqlite'),join(directory,metadata.database));
  await assert.rejects(OsmIndex.load(directory),{status:422});
});

import {OsmEditStore} from '../lib/osm/edit-store';
import {validateObject,project,unproject} from '../lib/osm/edit-model';
import {change,objects,editView,detail} from '../lib/osm/edit-service';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {chmod,mkdir,copyFile} from 'node:fs/promises';
import {GET,POST} from '../app/api/osm/objects/route';
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function editingFixture(t:any){const f=await fixture(t),dir=join(f.directory,'edits');const previous=[process.env.OSM_TILE_DIR,process.env.OSM_EDITS_DIR];process.env.OSM_TILE_DIR=f.directory;process.env.OSM_EDITS_DIR=dir;t.after(()=>{for(const [i,k]of ['OSM_TILE_DIR','OSM_EDITS_DIR'].entries()){if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];}});return {...f,dir,store:new OsmEditStore(dir)};}
const pointValue={name:'새 표시 지점',kind:'place',class:'town',geometry:{type:'Point',coordinates:[126.240136,36.597889]}};
async function updateName(name:string){const {index,snapshot}=await editView(),object=index.source('node:5')!;return change({action:'update',key:object.key,fingerprint:object.fingerprint,dataset:index.revision,value:{...object,name}},snapshot.revision);}
test('OSM edit geometry validates kinds, topology, bounds, precision and projection without reusing facilities schema',()=>{
 assert.deepEqual(unproject(project([126,36])).map(x=>Math.round(x)),[126,36]);
 assert.equal(validateObject(pointValue).name,'새 표시 지점');
 for(const v of [null,{...pointValue,kind:'constructor'},{...pointValue,name:'x'.repeat(161)},{...pointValue,geometry:{type:'Point',coordinates:[NaN,36]}},{...pointValue,geometry:{type:'Point',coordinates:[126,90]}},{...pointValue,kind:'road'},{...pointValue,geometry:{type:'MultiPolygon',coordinates:[]}}])assert.throws(()=>validateObject(v));
 assert.throws(()=>validateObject(pointValue,{south:0,north:1,west:0,east:1}));
 const building={name:'건물',kind:'building',class:'yes',geometry:{type:'Polygon',coordinates:[[[126,36],[126.01,36],[126.01,36.01],[126,36]]]}};assert.equal(validateObject(building).geometry.type,'Polygon');
 assert.throws(()=>validateObject({...building,geometry:{...building.geometry,coordinates:[[[126,36],[126.01,36.01],[126,36.01],[126.01,36],[126,36]]]}}));
 assert.throws(()=>validateObject({...building,geometry:{...building.geometry,coordinates:[...building.geometry.coordinates,...building.geometry.coordinates]}}));
 assert.throws(()=>validateObject({name:'road',kind:'road',class:'path',geometry:{type:'LineString',coordinates:[[126,36],[126,36]]}}));
 assert.throws(()=>validateObject({...pointValue,kind:'road',class:'primary',geometry:{type:'LineString',coordinates:Array.from({length:257},(_,i)=>[126+i*.00001,36])}}));
});
test('atomic edits preserve data on real write failure, reject stale competing instances and corrupt files',async t=>{
 const {dir,store}=await editingFixture(t);await change({action:'add',value:pointValue,dataset:(await editView()).index.revision},0);
 const bytes=await readFile(join(dir,'edits.json'));await chmod(dir,0o500);try{await assert.rejects(store.mutate(1,async s=>{s.edits=[];}));assert.equal(hash(await readFile(join(dir,'edits.json'))),hash(bytes));}finally{await chmod(dir,0o700);}
 const results=await Promise.allSettled([store.mutate(1,async()=>{}),new OsmEditStore(dir).mutate(1,async()=>{})]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal((await new OsmEditStore(dir).read()).revision,2);
 await writeFile(join(dir,'edits.json'),'{bad');await assert.rejects(store.mutate(2,async()=>{}));assert.equal(await readFile(join(dir,'edits.json'),'utf8'),'{bad');
});
test('base identity, original bytes and PNG labels persist across edits, cache hits, hides, restore and reader reload',async t=>{
 const {directory,metadata,store}=await editingFixture(t),path=join(directory,metadata.database),original=hash(await readFile(path));
 let reader=(await editView()).index;const {x,y}=coordinate(16),before=(await reader.tile(16,x,y))!;
 const changed=await updateName('로컬 변경 지명');const after=(await reader.tile(16,x,y))!;assert.notEqual(after.etag,before.etag);assert.ok(after.bytes.length>0);assert.equal((await reader.tile(16,x,y))!.etag,after.etag);
 const reloaded=await OsmIndex.load(directory);try{assert.equal((await reloaded.tile(16,x,y))!.etag,after.etag);}finally{reloaded.close();}
 const v=(await editView()),object=detail(v.index,v.snapshot,'node:5')!;await change({action:'hide',key:object.key,fingerprint:object.fingerprint,dataset:v.index.revision},changed.revision);
 assert.notEqual((await reader.tile(16,x,y))!.etag,after.etag);
 await change({action:'restore',key:object.key,dataset:v.index.revision},(await store.read()).revision);assert.equal((await reader.tile(16,x,y))!.etag,before.etag);assert.equal(hash(await readFile(path)),original);
});
test('moved/new objects compose actual adjacent PNGs and multiple zoom caches without duplicate original geometry',async t=>{
 await editingFixture(t);const {index}=await editView();const c15=coordinate(15),baseline=(await index.tile(15,c15.x,c15.y))!;const a=await change({action:'add',dataset:index.revision,value:pointValue},0);
 assert.match(a.key,/^local:/);const added=(await index.tile(15,c15.x,c15.y))!;assert.notEqual(added.etag,baseline.etag);const at=await objects(new Request('http://localhost/api/osm/objects?bbox=126.23,36.59,126.25,36.61&zoom=16'));assert.ok(at.objects.some(x=>x.key===a.key));
 const key=a.key;for(const z of [14,16,19]){const c=coordinate(z);await Promise.all([index.tile(z,c.x,c.y),index.tile(z,c.x+1,c.y)]);}
 await change({action:'update',key,dataset:index.revision,value:{...pointValue,geometry:{type:'Point',coordinates:[126.27,36.62]}}},1);
 assert.equal((await index.tile(15,c15.x,c15.y))!.etag,baseline.etag);
 const filtered=await objects(new Request('http://localhost/api/osm/objects?bbox=126.23,36.59,126.25,36.61&zoom=16'));assert.ok(!filtered.objects.some(x=>x.key===key));
 await change({action:'hide',key,dataset:index.revision},2);assert.equal((await editView()).snapshot.edits.length,0);
});
async function replaceBase(directory:string,metadata:any,patch:(db:DatabaseSync)=>void){const set=`sets/replaced${Math.random().toString(36).slice(2)}`;await mkdir(join(directory,set),{recursive:true});await copyFile(join(directory,metadata.database),join(directory,set,'map.sqlite'));const db=new DatabaseSync(join(directory,set,'map.sqlite'));try{patch(db);}finally{db.close();}const next={...metadata,database:set+'/map.sqlite'};await writeFile(join(directory,'metadata.json'),JSON.stringify(next));return next;}
test('source IDs survive reordered ordinals; changed/deleted fingerprints conflict without discarding edits; explicit reapply or restore',async t=>{
 const {directory,metadata,store}=await editingFixture(t);await updateName('보존할 수정');
 const reindexed=await replaceBase(directory,metadata,db=>{db.exec('UPDATE features SET id=id+100; UPDATE feature_index SET id=id+100;');});
 let v=await editView();assert.equal(v.index.reconcile(v.snapshot)[0].object.state,'modified');
 const updated=await replaceBase(directory,reindexed,db=>{db.prepare('UPDATE features SET name=?,fingerprint=? WHERE source_key=?').run('새 원본','f'.repeat(64),'node:5');});
 v=await editView();let edit=v.index.reconcile(v.snapshot)[0];assert.equal(edit.object.state,'conflict');assert.equal(edit.object.name,'보존할 수정');assert.equal(edit.base!.name,'새 원본');
 await assert.rejects(change({action:'update',key:'node:5',dataset:v.index.revision,fingerprint:edit.base!.fingerprint,value:edit.object},1),{status:409});
 await change({action:'reapply',key:'node:5',dataset:v.index.revision,fingerprint:edit.base!.fingerprint,value:edit.object},1);assert.equal((await editView()).index.reconcile(await store.read())[0].object.state,'modified');
 await replaceBase(directory,updated,db=>{db.exec("DELETE FROM feature_index WHERE id IN (SELECT id FROM features WHERE source_key='node:5'); DELETE FROM features WHERE source_key='node:5';");});
 v=await editView();assert.equal(v.index.reconcile(v.snapshot)[0].object.state,'conflict');assert.equal(v.snapshot.edits[0].value.name,'보존할 수정');await change({action:'restore',key:'node:5',dataset:v.index.revision},2);assert.equal((await store.read()).edits.length,0);
});
test('schema1 remains readable but cannot edit and never rewrites old database or pending edits',async t=>{
 const {directory,metadata}=await editingFixture(t);await updateName('구형에서도 보존');await replaceBase(directory,metadata,db=>{db.exec('DROP INDEX features_source;ALTER TABLE features DROP COLUMN source_key;ALTER TABLE features DROP COLUMN fingerprint;ALTER TABLE features DROP COLUMN readonly_reason;PRAGMA user_version=1;');});
 const v=await editView();assert.equal(v.index.schemaVersion,1);assert.match(v.index.objects({west:126.23,south:36.59,east:126.25,north:36.61},16)[0].reason!,/schema1/);assert.equal(v.index.reconcile(v.snapshot)[0].object.state,'conflict');const c=coordinate(16);assert.ok(await v.index.tile(16,c.x,c.y));await assert.rejects(change({action:'add',dataset:v.index.revision,value:pointValue},1),{status:409});
});
test('bounded object API rejects broad queries, invalid JSON, origin, missing/stale revisions and exposes local mutation',async t=>{
 await editingFixture(t);const base='http://localhost/api/osm/objects';
 for(const query of ['','?bbox=0,0,1,1&zoom=16','?bbox=126,36,126.1,36.1&zoom=3','?changes=1&offset=-1'])assert.ok((await GET(new Request(base+query))).status>=400);
 const state=await(await GET(new Request(base+'?changes=1'))).json();
 const request=(body:any,match:string|null='"0"',extra={})=>new Request(base,{method:'POST',headers:{'Content-Type':'application/json',...(match?{'If-Match':match}:{}),...extra},body:typeof body==='string'?body:JSON.stringify(body)});
 assert.equal((await POST(request({action:'add'},null))).status,428);assert.equal((await POST(request('{invalid'))).status,400);assert.equal((await POST(request({},'"0"',{Origin:'https://elsewhere.test'}))).status,403);assert.equal((await POST(request('x'.repeat(32769)))).status,413);
 const response=await POST(request({action:'add',dataset:state.dataset,value:pointValue}));assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await POST(request({action:'add',dataset:state.dataset,value:pointValue}))).status,409);
});

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('edits and rendered PNGs survive an independent server process; pending older renders cannot poison a new revision',async t=>{
 const {directory}=await editingFixture(t);const {index}=await editView(),c=coordinate(15),before=await index.tile(15,c.x,c.y);
 const pending=index.tile(15,c.x+1,c.y);await updateName('독립 프로세스 변경');await pending;
 const after=(await index.tile(15,c.x,c.y))!;assert.notEqual(after.etag,before!.etag);
 const script=`import {OsmIndex} from './lib/osm/index.ts';import {getOsmEdits} from './lib/osm/edit-store.ts';const r=await OsmIndex.load(process.env.OSM_TILE_DIR);const tile=await r.tile(15,${c.x},${c.y});console.log(JSON.stringify({snapshot:await getOsmEdits().read(),etag:tile.etag}));r.close();`;
 const {stdout}=await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script],{cwd:process.cwd(),env:{...process.env,OSM_TILE_DIR:directory}});
 const actual=JSON.parse(stdout.trim());assert.equal(actual.etag,after.etag);assert.equal(actual.snapshot.edits[0].value.name,'독립 프로세스 변경');
 const closing=index.tile(15,c.x,c.y);index.close();index.close();await assert.rejects(closing,{status:503});
});
test('bounded selection rejects dense results and omits huge geometry instead of sending a national dataset',async t=>{
 const {directory,metadata}=await editingFixture(t);
 await replaceBase(directory,metadata,db=>{db.prepare('UPDATE features SET g3=? WHERE id=4').run(JSON.stringify({type:'Polygon',coordinates:[Array.from({length:6000},()=>[0,0])]}));});
 let v=await editView();assert.equal(v.index.source('way:4')!.editable,false);assert.equal(v.index.source('way:4')!.geometry,null);
 const path=v.index.metadata.database;const activeMeta=JSON.parse(await readFile(join(directory,'metadata.json'),'utf8'));
 await replaceBase(directory,activeMeta,db=>{for(let i=10;i<211;i++){db.prepare('INSERT INTO features(id,kind,class,name,minzoom,g0,g1,g2,g3,source_key,fingerprint) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(i,'place','town','dense',0,'{}','{}','{}',JSON.stringify({type:'Point',coordinates:project([126.24,36.60])}),`node:${i}`,'a'.repeat(64));const p=project([126.24,36.6]);db.prepare('INSERT INTO feature_index VALUES(?,?,?,?,?,?,?)').run(i,p[0],p[0],p[1],p[1],0,19);}});
 await assert.rejects(objects(new Request('http://localhost/api/osm/objects?bbox=126.23,36.59,126.25,36.61&zoom=16')),{status:422});assert.ok(path);
});
test('geometry supports legal limits and rejects undersized, duplicate, non-finite, crossing and oversized requests',()=>{
 const polygon={kind:'building',class:'yes',name:'한도',geometry:{type:'Polygon',coordinates:[Array.from({length:128},(_,i)=>[126+.001*Math.cos(i*Math.PI/64),36+.001*Math.sin(i*Math.PI/64)])]}};
 assert.equal(validateObject(polygon).geometry.coordinates[0].length,129);
 assert.throws(()=>validateObject({...polygon,geometry:{type:'Polygon',coordinates:[Array.from({length:130},(_,i)=>[126+.001*Math.cos(i*Math.PI/65),36+.001*Math.sin(i*Math.PI/65)])]}}));
 assert.throws(()=>validateObject({...pointValue,geometry:{type:'Point',coordinates:[Infinity,36]}}));
 assert.throws(()=>validateObject({name:'cross',kind:'road',class:'primary',geometry:{type:'LineString',coordinates:[[126,36],[126.01,36.01],[126,36.01],[126.01,36]]}}));
 assert.throws(()=>validateObject({name:'retrace',kind:'road',class:'primary',geometry:{type:'LineString',coordinates:[[126,36],[126.02,36],[126.01,36]]}}),/되짚어/);
 assert.equal(validateObject({name:'straight',kind:'road',class:'primary',geometry:{type:'LineString',coordinates:[[126,36],[126.01,36],[126.02,36]]}}).geometry.type,'LineString');
 assert.throws(()=>validateObject({name:'short',kind:'road',class:'primary',geometry:{type:'LineString',coordinates:[[126,36]]}}));
});
