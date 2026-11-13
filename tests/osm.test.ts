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
