import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Elevation,decodeHeight,pixelAt} from '../lib/maps/elevation';
import {MapCatalog} from '../lib/tiles/catalog';
import {makeElevation} from './fixtures/elevation-fixture';
import {makeTpk,coordinate,center} from './fixtures/tpk-fixture';
async function fixture(t:any,permission=true){
  const dir=await mkdtemp(join(tmpdir(),'dem-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const metadata=await makeElevation(dir,permission);return {dir,metadata,dem:await Elevation.load(dir)};
}
test('XYZ pixel coordinates and Terrarium decode preserve zero, negative and fractional metres',()=>{
  assert.equal(decodeHeight(128,0,0),0);assert.equal(decodeHeight(127,243,128),-12.5);
  assert.deepEqual(pixelAt(center[0],center[1],16),{...coordinate(16),px:Math.floor((center[1]+180)/360*2**16*256)%256,
    py:Math.floor((1-Math.asinh(Math.tan(center[0]*Math.PI/180))/Math.PI)/2*2**16*256)%256});
});
test('DEM metadata, native tile and exact point altitude; NoData, zero and negative remain distinct',async t=>{
  const {dem}=await fixture(t);assert.equal(dem.info().available,true);
  assert.ok((await dem.tile(16,coordinate(16).x,coordinate(16).y))!.length>100);
  assert.equal((await dem.sample(...center as [number,number])).elevationMeters,123.5);
  const at=(px:number,py:number)=>{
    const {x,y}=coordinate(17),n=256*2**17;
    return [Math.atan(Math.sinh(Math.PI*(1-2*(y*256+py+.5)/n)))*180/Math.PI,(x*256+px+.5)/n*360-180] as [number,number];
  };
  assert.equal((await dem.sample(...at(140,100))).elevationMeters,0);
  assert.equal((await dem.sample(...at(50,100))).elevationMeters,-12.5);
  assert.deepEqual(await dem.sample(...at(0,0)),{elevationMeters:null,reason:'nodata'});
  assert.deepEqual(await dem.sample(0,0),{elevationMeters:null,reason:'outside'});
  assert.equal(await dem.tile(16,0,0),null);assert.equal(await dem.tile(19,coordinate(19).x,coordinate(19).y),null);
});
test('unapproved DEM is metadata-only and malformed/path-traversing metadata is rejected',async t=>{
  const {dir,metadata,dem}=await fixture(t,false);assert.equal(dem.info().available,false);
  await assert.rejects(dem.tile(16,coordinate(16).x,coordinate(16).y),{status:403});
  await assert.rejects(dem.sample(...center as [number,number]),{status:403});
  for(const change of [{tiles:'../escape'},{tiles:'C:/escape'},{units:'ft'},{maxZoom:24},{usageConfirmed:'true'},{bounds:{south:0,north:1,west:20,east:10}}]){
    await writeFile(join(dir,'metadata.json'),JSON.stringify({...metadata,...change}));await assert.rejects(Elevation.load(dir),{status:422});
  }
});
test('DEM dataset symlinks cannot escape the mounted directory',async t=>{
  const {dir,metadata}=await fixture(t);const outside=await mkdtemp(join(tmpdir(),'dem-out-'));t.after(()=>rm(outside,{recursive:true,force:true}));
  await symlink(outside,join(dir,'escape'));
  await writeFile(join(dir,'metadata.json'),JSON.stringify({...metadata,tiles:'escape'}));
  const dem=await Elevation.load(dir);await assert.rejects(dem.tile(16,coordinate(16).x,coordinate(16).y),{status:422});
});
test('street single TPK has its own permission independent of satellite global flag and config name',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'street-test-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=await makeTpk(dir);const old=process.env.TPK_USAGE_CONFIRMED,oldConfig=process.env.MAP_CONFIG_FILE;
  process.env.TPK_USAGE_CONFIRMED='true';process.env.MAP_CONFIG_FILE='satellite-custom.json';
  t.after(()=>{if(old===undefined)delete process.env.TPK_USAGE_CONFIRMED;else process.env.TPK_USAGE_CONFIRMED=old;
    if(oldConfig===undefined)delete process.env.MAP_CONFIG_FILE;else process.env.MAP_CONFIG_FILE=oldConfig;});
  const catalog=await MapCatalog.load({legacyPath:source.path,configFile:'maps.json',usageConfirmed:false});t.after(()=>catalog.close());
  assert.equal(catalog.info().usageConfirmed,false);await assert.rejects(catalog.tile(16,coordinate(16).x,coordinate(16).y),{status:403});
});
test('map-info remains usable with only a prepared DEM and no satellite or street TPK',async t=>{
  const {dir,metadata}=await fixture(t);
  const variables={TPK_PATH:join(dir,'absent-satellite','map.tpk'),MAP_CONFIG_FILE:'maps.json',STREET_TPK_DIR:join(dir,'absent-street'),
    ELEVATION_DIR:dir,MAP_MODE:'offline',OSM_USAGE_CONFIRMED:'false'};
  const before=Object.fromEntries(Object.keys(variables).map(key=>[key,process.env[key]]));Object.assign(process.env,variables);
  t.after(()=>{for(const [key,value] of Object.entries(before)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
  const {GET}=await import('../app/api/map-info/route');
  const response=await GET();assert.equal(response.status,200);const info=await response.json();
  assert.equal(info.mode,'layers');assert.equal(info.layers.satellite.available,false);assert.equal(info.layers.street.available,false);
  assert.equal(info.layers.elevation.available,true);assert.deepEqual(info.bounds,metadata.bounds);assert.deepEqual(info.sources,[]);
});
