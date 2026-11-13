import test from 'node:test';
import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, readdir, rm, symlink, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
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
