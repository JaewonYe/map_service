import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Tpk,bundleIndex,xyz} from '../lib/tiles/tpk';
import {coordinate,makeTpk} from './fixtures/tpk-fixture';

test('XYZ validation and V1/V2 use different index ordering',()=>{
  assert.deepEqual(xyz('16','55749','25600'),[16,55749,25600]);
  for(const v of [['-1','0','0'],['1','2','0'],['1.0','0','0'],['99','0','0'],['1','..','0']])assert.throws(()=>xyz(...v as [string,string,string]));
  assert.equal(bundleIndex(1,2,3),386);assert.equal(bundleIndex(2,2,3),259);
});
for(const version of [1,2] as const)for(const compressed of [false,true])test(`read synthetic V${version}, compressed=${compressed}`,async()=>{
  const directory=await mkdtemp(join(tmpdir(),'tpk-test-'));let reader:Tpk|undefined;
  try{
    const fixture=await makeTpk(directory,version,compressed),before=createHash('sha256').update(await readFile(fixture.path)).digest('hex');
    reader=await Tpk.load(fixture.path,join(directory,'cache'));
    const info=reader.info();assert.deepEqual(info.zoomLevels,[15,16,17]);assert.equal(info.tileSize,256);assert.equal(info.projection,'EPSG:3857');assert.equal(info.zoom,16);assert.equal(info.packageVersion,'1.0-synthetic');
    assert.ok(info.center[0]>=info.bounds.south&&info.center[0]<=info.bounds.north);
    const c=coordinate(16);process.env.TPK_USAGE_CONFIRMED='false';await assert.rejects(reader.tile(16,c.x,c.y),/Confirm permitted/);
    process.env.TPK_USAGE_CONFIRMED='true';
    const tiles=await Promise.all(Array.from({length:70},()=>reader!.tile(16,c.x,c.y)));
    assert.deepEqual(tiles[0]?.bytes,fixture.jpeg);assert.equal(tiles[0]?.mime,'image/jpeg');assert.ok(tiles.every(t=>t?.etag===tiles[0]?.etag));
    const png=await reader.tile(16,c.x+1,c.y+1);assert.equal(png?.mime,'image/png');assert.deepEqual(png?.bytes,fixture.png);
    assert.equal(await reader.tile(14,1,1),null);assert.equal(await reader.tile(16,0,0),null);
    assert.equal(createHash('sha256').update(await readFile(fixture.path)).digest('hex'),before);
  }finally{reader?.close();await rm(directory,{recursive:true,force:true});}
});
test('corrupt Compact V2 offsets cannot read outside the member',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'tpk-bad-'));let reader:Tpk|undefined;
  try{const fixture=await makeTpk(directory,2,false,true);reader=await Tpk.load(fixture.path);process.env.TPK_USAGE_CONFIRMED='true';const c=coordinate(16);await assert.rejects(reader.tile(16,c.x,c.y),/offset/);}
  finally{reader?.close();await rm(directory,{recursive:true,force:true});}
});

test('OSM is unavailable offline unless a permitted local tile directory is configured',async()=>{
  const {osmInfo,osmTile}=await import('../lib/tiles/osm');
  const directory=await mkdtemp(join(tmpdir(),'osm-local-'));
  const original={mode:process.env.MAP_MODE,dir:process.env.OSM_TILE_DIR,confirmed:process.env.OSM_USAGE_CONFIRMED};
  try{
    process.env.MAP_MODE='offline';process.env.OSM_TILE_DIR=directory;process.env.OSM_USAGE_CONFIRMED='false';
    assert.equal((await osmInfo()).mode,'unavailable');assert.equal(await osmTile(16,1,1),null);
    process.env.OSM_USAGE_CONFIRMED='true';
    const {mkdir,writeFile}=await import('node:fs/promises');const {png}=await import('./fixtures/tpk-fixture');
    await mkdir(join(directory,'16/1'),{recursive:true});await writeFile(join(directory,'16/1/1.png'),png());
    assert.equal((await osmInfo()).mode,'local');assert.equal((await osmTile(16,1,1))?.mime,'image/png');
    process.env.OSM_USAGE_CONFIRMED='false';process.env.MAP_MODE='online';assert.equal((await osmInfo()).mode,'online');
  }finally{
    for(const [name,value] of Object.entries({MAP_MODE:original.mode,OSM_TILE_DIR:original.dir,OSM_USAGE_CONFIRMED:original.confirmed})){if(value===undefined)delete process.env[name];else process.env[name]=value;}
    await rm(directory,{recursive:true,force:true});
  }
});

test('official Apache-2.0 Esri V2 sample matches published off-diagonal JPEGs',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'esri-reference-'));let reader:Tpk|undefined;
  try{
    const {zip}=await import('./fixtures/tpk-fixture');const {writeFile}=await import('node:fs/promises');
    const reference=new URL('./fixtures/esri-reference/',import.meta.url);
    const entries=await Promise.all(['conf.xml','conf.cdi','R0000C0000.bundle'].map(async name=>({
      name:name.endsWith('.bundle')?'v101/Layers/_alllayers/L01/'+name:'v101/Layers/'+name,
      bytes:await readFile(new URL(name,reference))
    })));
    const path=join(directory,'reference.tpk');await writeFile(path,zip(entries));
    reader=await Tpk.load(path);process.env.TPK_USAGE_CONFIRMED='true';
    assert.deepEqual(reader.info().zoomLevels,[1]);
    assert.deepEqual((await reader.tile(1,1,0))?.bytes,await readFile(new URL('row0-col1.jpg',reference)));
    assert.deepEqual((await reader.tile(1,0,1))?.bytes,await readFile(new URL('row1-col0.jpg',reference)));
  }finally{reader?.close();await rm(directory,{recursive:true,force:true});}
});
