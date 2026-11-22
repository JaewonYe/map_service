import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {filterBuildings, mergeBuildingSnapshot} from '../lib/buildings/search';
import {BuildingStore} from '../lib/buildings/store';
import {BuildingError, parseBuilding} from '../lib/buildings/model';
import {buildingBody, buildingVersion, checkBuildingOrigin} from '../lib/buildings/http';

const input = {name: '태안 건물', description: '설명\n두 번째 줄', latitude: 36.597889, longitude: 126.240136,
  category: '공공시설', address: '태안군 테스트 주소', contact: '041-000-0000', website: 'https://example.com/'};
async function fixture(t: any) {
  const root = await mkdtemp(join(tmpdir(), 'building-data-')); t.after(() => rm(root, {recursive: true, force: true}));
  const directory = join(root, '건물 정보 data'); return {root, directory, store: new BuildingStore(directory)};
}
test('building input is validated and optional fields have safe defaults', () => {
  const result = parseBuilding({name: '  새 건물  ', latitude: 36, longitude: 126, id: '../outside'});
  assert.equal(result.name, '새 건물'); assert.equal(result.category, '미분류'); assert.equal(result.description, '');
  assert.ok(!('id' in result));
  for (const change of [{name: '  '}, {latitude: 90}, {longitude: 181}, {latitude: '36'},
    {name: 'x'.repeat(121)}, {description: 'x'.repeat(5001)}, {category: 'unknown'}, {website: 'javascript:alert(1)'},
    {website: 'https://example.com/' + '가'.repeat(500)}]) {
    assert.throws(() => parseBuilding({...input, ...change}), BuildingError);
  }
});
test('create, reopen, edit and delete persist without browser storage', async t => {
  const {directory, store} = await fixture(t); assert.deepEqual(await store.list(), []);
  const building = await store.create(input); assert.equal(building.version, 1);
  const reopened = new BuildingStore(directory); assert.deepEqual(await reopened.get(building.id), building);
  const changed = await reopened.update(building.id, {...input, description: '수정된 설명'}, 1);
  assert.equal(changed.version, 2); assert.equal(changed.createdAt, building.createdAt);
  assert.equal((await new BuildingStore(directory).get(building.id)).description, '수정된 설명');
  await reopened.delete(building.id, 2); assert.deepEqual(await store.list(), []);
  await assert.rejects(store.get(building.id), (error: unknown) => error instanceof BuildingError && error.status === 404);
});
test('parallel writes preserve records and competing edits reject stale versions', async t => {
  const {store} = await fixture(t);
  const records = await Promise.all(Array.from({length: 24}, (_, i) => store.create({...input, name: `건물 ${i}`})));
  assert.equal((await store.list()).length, 24);
  const results = await Promise.allSettled([
    store.update(records[0].id, {...input, name: '수정 A'}, 1),
    store.update(records[0].id, {...input, name: '수정 B'}, 1)
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(failed.reason.status, 409);
  await assert.rejects(store.delete(records[0].id, 1), (error: unknown) => error instanceof BuildingError && error.status === 409);
  assert.equal((await store.get(records[0].id)).version, 2);
});
test('unrelated files are ignored and data can be copied to a new server folder', async t => {
  const {root, directory, store} = await fixture(t), building = await store.create(input);
  await writeFile(join(directory, 'README.md'), 'notes'); await writeFile(join(directory, '.unfinished.tmp'), '{');
  assert.equal((await store.list()).length, 1);
  const target = join(root, 'moved'); await cp(directory, target, {recursive: true});
  assert.deepEqual(await new BuildingStore(target).get(building.id), building);
  assert.equal((await readdir(directory)).filter(name => name.endsWith('.tmp')).length, 1);
});
test('corrupt data is reported and never silently overwritten', async t => {
  const {directory, store} = await fixture(t), building = await store.create(input);
  const file = join(directory, `${building.id}.json`); await writeFile(file, '{ damaged');
  await assert.rejects(store.list(), (error: unknown) => error instanceof BuildingError && error.status === 503);
  await assert.rejects(store.update(building.id, input, 1)); assert.equal(await readFile(file, 'utf8'), '{ damaged');
});
test('ids cannot escape the data directory and record symlinks are not followed', async t => {
  const {root, directory, store} = await fixture(t), building = await store.create(input);
  await assert.rejects(store.get('../outside')); await assert.rejects(store.delete('invalid', 1));
  const target = join(root, 'outside.json'); await writeFile(target, JSON.stringify(building));
  const id = randomUUID();
  try {await symlink(target, join(directory, `${id}.json`));}
  catch (error) {if ((error as NodeJS.ErrnoException).code === 'EPERM') {t.skip('Symlinks unavailable'); return;} throw error;}
  await assert.rejects(store.get(id), (error: unknown) => error instanceof BuildingError && error.status === 503);
  assert.equal((await store.list()).length, 1);
});
test('HTTP input is bounded and cross-site writes are rejected', async () => {
  const url = 'http://localhost:3001/api/buildings';
  assert.throws(() => checkBuildingOrigin(new Request(url, {headers: {Origin: 'https://other.example'}})), /같은 사이트/);
  assert.throws(() => checkBuildingOrigin(new Request(url, {headers: {'Sec-Fetch-Site': 'cross-site'}})), /같은 사이트/);
  checkBuildingOrigin(new Request(url, {headers: {Origin: 'http://localhost:3001'}}));
  const body = (value: string, type = 'application/json') => new Request(url, {method: 'POST', headers: {'Content-Type': type}, body: value});
  assert.deepEqual(await buildingBody(body(JSON.stringify(input))), input);
  await assert.rejects(buildingBody(body('x'.repeat(40000))), (error: unknown) => error instanceof BuildingError && error.status === 413);
  await assert.rejects(buildingBody(body('{}', 'text/plain')), (error: unknown) => error instanceof BuildingError && error.status === 415);
  await assert.rejects(buildingBody(body('{ bad')));
  assert.equal(buildingVersion(new Request(url, {headers: {'If-Match': '"2"'}})), 2);
  assert.throws(() => buildingVersion(new Request(url)), /If-Match/);
});


test('outdoor facilities persist alongside existing buildings without a supplied identifier', async t => {
  const {directory, store} = await fixture(t);
  const legacy = await store.create(input);
  for (const category of ['시험장', '주차장', '야외 공간']) {
    const facility = await store.create({name: category, category, latitude: 36, longitude: 126});
    assert.match(facility.id, /^[0-9a-f-]{36}$/);
    assert.equal((await new BuildingStore(directory).get(facility.id)).category, category);
  }
  assert.equal((await new BuildingStore(directory).list()).length, 4);
  assert.deepEqual(await store.get(legacy.id), legacy);
});


test('facility name search trims whitespace and matches Korean substrings and English case', async t => {
  const {store} = await fixture(t);
  const a = await store.create({...input, name: '태안 내구 시험장', category: '시험장'});
  const b = await store.create({...input, name: 'West DEPOT', category: '주차장'});
  const all = [a, b];
  assert.deepEqual(filterBuildings(all, '  내구  ', '').map(item => item.id), [a.id]);
  assert.deepEqual(filterBuildings(all, 'dEpOt', '').map(item => item.id), [b.id]);
  assert.deepEqual(filterBuildings(all, '  ', ''), all);
});
test('facility category and name conditions compose and clearing restores every record', async t => {
  const {store} = await fixture(t);
  const a = await store.create({...input, name: '공통 시험 시설', category: '시험장'});
  const b = await store.create({...input, name: '공통 주차 시설', category: '주차장'});
  const all = [a, b];
  assert.deepEqual(filterBuildings(all, '', '주차장'), [b]);
  assert.deepEqual(filterBuildings(all, '공통', '시험장'), [a]);
  assert.deepEqual(filterBuildings(all, '주차', '시험장'), []);
  assert.deepEqual(filterBuildings(all, '', ''), all);
});
test('filtering never mutates or removes the stored source records', async t => {
  const {store} = await fixture(t), building = await store.create(input);
  const records = await store.list(), before = JSON.stringify(records);
  assert.deepEqual(filterBuildings(records, '일치하지 않음', '야외 공간'), []);
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(await store.get(building.id), building);
  assert.equal(filterBuildings(records, '', '')[0], records[0]);
});


test('a delayed list snapshot retains unrelated rows and overlays later create, update and delete results', async t => {
  const {store} = await fixture(t);
  const kept = await store.create({...input, name: '기존 시설'});
  const removed = await store.create({...input, name: '삭제할 시설'});
  const changed = {...kept, name: '수정된 시설', version: 2};
  const added = await store.create({...input, name: '새 시설'});
  const snapshot = [kept, removed], before = JSON.stringify(snapshot);
  const result = mergeBuildingSnapshot(snapshot, [{id: kept.id, building: changed}, {id: added.id, building: added}, {id: removed.id, building: null}]);
  assert.deepEqual(result, [changed, added]);
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(mergeBuildingSnapshot([kept], [{id: added.id, building: added}]), [kept, added]);
});

// Boundary fixtures are synthetic EPSG:4326 positions, never user survey data.
import {chmod} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {boundaryFromPoints, boundaryMetrics, boundaryPoints, normalizeBoundary, MAX_BOUNDARY_VERTICES} from '../lib/buildings/boundary';
const rectangle = {type: 'Polygon', coordinates: [[[126,36],[126.001,36],[126.001,36.001],[126,36.001],[126,36]]]};
test('boundary canonicalization closes, rounds, rotates and winds without mutating input', () => {
  const raw = {type: 'Polygon', coordinates: [[[126.001000001,36.001],[126.001,36],[126,36],[126,36.001]]]};
  const before = JSON.stringify(raw), normalized = normalizeBoundary(raw);
  assert.deepEqual(normalized, rectangle); assert.equal(JSON.stringify(raw), before);
  assert.deepEqual(boundaryFromPoints(boundaryPoints(normalized)), normalized);
  const metrics = boundaryMetrics(normalized);
  assert.ok(metrics.area > 9900 && metrics.area < 10200); assert.ok(metrics.perimeter > 400 && metrics.perimeter < 410);
  assert.deepEqual(parseBuilding({...input, boundary: raw}).boundary, normalized);
});
test('boundary rejects unsupported structures, duplicate, degenerate, crossing and touching rings', () => {
  const poly = (ring: unknown) => ({type:'Polygon', coordinates:[ring]});
  const invalid: unknown[] = [[], {}, null, {type:'MultiPolygon',coordinates:[[rectangle.coordinates]]},
    {type:'Polygon',coordinates:[...rectangle.coordinates,...rectangle.coordinates]},
    poly([[126,36],[126.001,36]]), poly([[126,36],[126,36],[126.001,36.001]]),
    poly([[126,36],[126.001,36],[126.00100001,36],[126,36.001]]),
    poly([[126,36],[126.001,36],[126.002,36]]),
    poly([[126,36],[126.001,36.001],[126,36.001],[126.001,36]]),
    poly([[126,36],[126.002,36],[126.002,36.002],[126.001,36],[126,36.002]])];
  for (const boundary of invalid) assert.throws(() => normalizeBoundary(boundary));
  // null is the explicit remove command; malformed values become client errors.
  for (const boundary of invalid.filter(value => value !== null)) assert.throws(() => parseBuilding({...input,boundary}), BuildingError);
  assert.equal(parseBuilding({...input,boundary:null}).boundary,null);
});
test('boundary requires finite numeric lon/lat, bounds and supported longitude extent', () => {
  for (const point of [[NaN,36],[Infinity,36],[126,-Infinity],[181,36],[126,85.1],[36,126],['126',36],[126,36,0]]) {
    assert.throws(() => normalizeBoundary({type:'Polygon',coordinates:[[point,[126.001,36],[126,36.001]]]}));
  }
  for (const ring of [[[179,36],[-179,36],[179,37]], [[-90,0],[90,0],[0,1]]])
    assert.throws(() => normalizeBoundary({type:'Polygon',coordinates:[ring]}), /날짜변경선/);
  assert.deepEqual(boundaryPoints(normalizeBoundary(rectangle))[0], [36,126]);
  const edge = normalizeBoundary({type:'Polygon',coordinates:[[[0,85.05112878],[0.001,85.05112878],[0,85.05]]]});
  assert.deepEqual(normalizeBoundary(edge),edge);
  assert.ok(boundaryPoints(edge).every(([lat])=>lat<=85.05112878));
});
test('boundary vertex and existing byte limits apply to the complete record', async t => {
  const ring = Array.from({length:MAX_BOUNDARY_VERTICES}, (_, i) => [126 + 0.01*Math.cos(i*2*Math.PI/MAX_BOUNDARY_VERTICES),36+0.01*Math.sin(i*2*Math.PI/MAX_BOUNDARY_VERTICES)]);
  const boundary = normalizeBoundary({type:'Polygon',coordinates:[ring]});
  assert.equal(boundary.coordinates[0].length,129);
  assert.throws(() => normalizeBoundary({type:'Polygon',coordinates:[[...ring,[126.02,36.02]]]}));
  const {store,directory} = await fixture(t);
  const data = {...input,name:'가'.repeat(120),description:'나'.repeat(5000),address:'다'.repeat(300),contact:'라'.repeat(160),website:'https://example.com/'+ 'x'.repeat(2000),boundary};
  const request = new Request('http://localhost/api/buildings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  assert.deepEqual(await buildingBody(request),data);
  const record = await store.create(data); assert.deepEqual(await new BuildingStore(directory).get(record.id),record);
  await assert.rejects(buildingBody(new Request('http://localhost/api/buildings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,padding:'x'.repeat(32768)})})), (e: unknown) => e instanceof BuildingError && e.status===413);
});
test('legacy files and old PUT omission preserve boundaries, explicit null removes without touching neighbours', async t => {
  const {store,directory} = await fixture(t);
  const legacy = await store.create(input), oldPath = join(directory,`${legacy.id}.json`), bytes = await readFile(oldPath,'utf8');
  const a = await store.create({...input,boundary:rectangle}), b = await store.create({...input,name:'야외',boundary:rectangle});
  assert.equal(await readFile(oldPath,'utf8'),bytes); assert.ok(!Object.hasOwn(await store.get(legacy.id),'boundary'));
  const edited = await store.update(a.id,{...input,name:'이전 클라이언트'},1);
  assert.deepEqual(edited.boundary,rectangle); assert.equal(edited.id,a.id); assert.equal(edited.createdAt,a.createdAt);
  assert.equal(edited.version,2);
  const removed = await store.update(a.id,{...input,boundary:null},2);
  assert.ok(!Object.hasOwn(removed,'boundary')); assert.equal(removed.version,3);
  await store.delete(a.id,3); assert.deepEqual(await store.get(b.id),b);
  assert.equal(await readFile(oldPath,'utf8'),bytes);
});
test('boundary persists through independent server process restarts', async t => {
  const {store,directory} = await fixture(t); const record = await store.create({...input,boundary:rectangle});
  const script = 'import {BuildingStore} from "./lib/buildings/store.ts"; console.log(JSON.stringify(await new BuildingStore(process.argv[1]).get(process.argv[2])));';
  for (let i=0;i<2;i++) {
    const {stdout} = await promisify(execFile)(process.execPath,['--import','tsx','--input-type=module','-e',script,directory,record.id]);
    assert.deepEqual(JSON.parse(stdout),record);
  }
});
test('boundary updates and removals reject stale versions and invalid geometry without changing disk', async t => {
  const {store,directory} = await fixture(t); const a=await store.create({...input,boundary:rectangle});
  const changed=await store.update(a.id,{...input,boundary:{type:'Polygon',coordinates:[[[126,36],[126.002,36],[126,36.002]]]}},1);
  const path=join(directory,`${a.id}.json`), bytes=await readFile(path,'utf8');
  for (const boundary of [null,rectangle]) await assert.rejects(store.update(a.id,{...input,boundary},1), (e:unknown)=>e instanceof BuildingError && e.status===409);
  await assert.rejects(store.update(a.id,{...input,boundary:{type:'Polygon',coordinates:[[[126,36],[126,36],[126,36]]]}},2));
  assert.equal(await readFile(path,'utf8'),bytes); assert.deepEqual(await store.get(a.id),changed);
});
test('real storage write failure preserves saved boundary and permits retry after repair', async t => {
  const {store,directory}=await fixture(t), record=await store.create({...input,boundary:rectangle});
  const path=join(directory,`${record.id}.json`), bytes=await readFile(path,'utf8');
  await chmod(directory,0o500);
  try {await assert.rejects(store.update(record.id,{...input,boundary:null},1)); assert.equal(await readFile(path,'utf8'),bytes);}
  finally {await chmod(directory,0o700);}
  assert.deepEqual(await store.get(record.id),record);
  assert.ok(!Object.hasOwn(await store.update(record.id,{...input,boundary:null},1),'boundary'));
  assert.equal((await readdir(directory)).filter(file=>file.endsWith('.tmp')).length,0);
});

import {editBoundaryDraft, newBoundaryDraft} from '../lib/buildings/boundary-draft';
test('draft moves, inserts and deletes selected middle vertices and undo restores selection without mutating source', () => {
  const original=boundaryPoints(normalizeBoundary(rectangle)), source=JSON.stringify(original);
  let state=newBoundaryDraft(original);
  state=editBoundaryDraft(state,{type:'move',index:1,point:[36.00001,126.002]});
  const moved=state; assert.equal(state.selected,1);
  state=editBoundaryDraft(state,{type:'insert',after:1,point:[36.001,126.0021]});
  assert.equal(state.points.length,5); assert.equal(state.selected,2);
  state=editBoundaryDraft(state,{type:'delete'}); assert.equal(state.points.length,4);
  state=editBoundaryDraft(state,{type:'undo'});assert.equal(state.points.length,5);assert.equal(state.selected,2);
  state=editBoundaryDraft(state,{type:'undo'});assert.deepEqual(state.points,moved.points);
  state=editBoundaryDraft(state,{type:'undo'});assert.deepEqual(state.points,original);
  assert.equal(JSON.stringify(original),source); assert.deepEqual(editBoundaryDraft(state,{type:'undo'}),state);
});
test('draft editing enforces triangle minimum and maximum insertion, validates numeric moves and preserves invalid geometry for repair',()=>{
  const trianglePoints=boundaryPoints(boundaryFromPoints([[36,126],[36,126.001],[36.001,126]]));
  let state=newBoundaryDraft(trianglePoints);
  assert.equal(editBoundaryDraft(state,{type:'delete'}),state);
  assert.throws(()=>editBoundaryDraft(state,{type:'move',index:0,point:[86,126]}));
  assert.throws(()=>editBoundaryDraft(state,{type:'insert',after:0,point:[NaN,126]}));
  state=editBoundaryDraft(state,{type:'move',index:1,point:trianglePoints[0]});
  assert.throws(()=>boundaryFromPoints(state.points));assert.deepEqual(editBoundaryDraft(state,{type:'undo'}).points,trianglePoints);
  const full=newBoundaryDraft(Array.from({length:128},(_,i)=>[36+i*0.000001,126] as const));
  assert.equal(editBoundaryDraft(full,{type:'insert',after:0,point:[36,126]}),full);
  assert.equal(editBoundaryDraft(full,{type:'select',index:128}),full);
});
test('point-only PUT keeps boundary and metadata byte-equivalent and does not touch neighbours; delete removes only target', async t=>{
  const {store,directory}=await fixture(t),a=await store.create({...input,boundary:rectangle}),b=await store.create({...input,name:'다른 시설',boundary:rectangle});
  const neighbour=await readFile(join(directory,`${b.id}.json`),'utf8');
  const {boundary:_boundary,...legacy}=a;
  const moved=await store.update(a.id,{...legacy,latitude:36.02,longitude:126.02},a.version);
  assert.deepEqual(moved.boundary,a.boundary);assert.equal(moved.id,a.id);assert.equal(moved.createdAt,a.createdAt);
  for(const key of ['name','description','category','address','contact','website'] as const)assert.equal(moved[key],a[key]);
  assert.equal(moved.version,2);assert.deepEqual(await new BuildingStore(directory).get(a.id),moved);
  await assert.rejects(store.delete(a.id,1),(e:unknown)=>e instanceof BuildingError&&e.status===409);
  await store.delete(a.id,2);await assert.rejects(store.get(a.id),(e:unknown)=>e instanceof BuildingError&&e.status===404);
  assert.equal(await readFile(join(directory,`${b.id}.json`),'utf8'),neighbour);
});
test('real delete write failure preserves target and neighbour and allows retry',async t=>{
  const {store,directory}=await fixture(t),a=await store.create({...input,boundary:rectangle}),b=await store.create({...input,name:'다른 시설',boundary:rectangle});
  const {chmod}=await import('node:fs/promises');const aPath=join(directory,`${a.id}.json`),before=await readFile(aPath,'utf8');
  await chmod(directory,0o500);
  try{await assert.rejects(store.delete(a.id,1));assert.equal(await readFile(aPath,'utf8'),before);assert.deepEqual(await store.get(b.id),b);}
  finally{await chmod(directory,0o700);}
  await store.delete(a.id,1);await assert.rejects(store.get(a.id));assert.deepEqual(await store.get(b.id),b);
});
