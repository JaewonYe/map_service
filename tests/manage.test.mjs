import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createManager,runCommand} from '../scripts/manage.mjs';
async function workspace(fn){const root=await mkdtemp(join(tmpdir(),'rgb-launch-'));try{await writeFile(join(root,'.env.example'),'PORT=8085');await fn(root);}finally{await rm(root,{recursive:true,force:true});}}
test('existing RGB archive is verified without redownloading or any other data services',async()=>workspace(async root=>{
  await mkdir(join(root,'data/imagery/taean/esri'),{recursive:true});await writeFile(join(root,'data/imagery/taean/esri/manifest.json'),'{}');
  const calls=[];await createManager({root,run:async(c,a)=>{calls.push(a);return '';},log(){}}).execute('imagery');
  assert.ok(calls.some(a=>a.includes('imagery-verify')));
  assert.ok(!calls.some(a=>a.includes('run')&&a.includes('imagery-download')));
  assert.ok(!calls.some(a=>a.includes('tiles')||a.includes('extract')||a.includes('import')));
}));
test('missing RGB blocks service startup',async()=>workspace(async root=>{
  const calls=[];await assert.rejects(createManager({root,run:async(c,a)=>{calls.push(a);return '';},log(){}}).execute('start'),/Esri RGB is missing/);
  assert.ok(!calls.some(a=>a.includes('up')));
}));
test('download failure prevents build and server startup',async()=>workspace(async root=>{
  const calls=[];const manager=createManager({root,run:async(c,a)=>{calls.push(a);if(a.includes('run')&&a.includes('imagery-download'))throw Error('download failed');return '';},log(){}});
  await assert.rejects(manager.execute('imagery'),/download failed/);
  assert.ok(!calls.some(a=>a.includes('run')&&a.includes('imagery-build')));
  assert.ok(!calls.some(a=>a.includes('up')));
}));
test('child errors preserve exit status',async()=>{await assert.rejects(runCommand(process.execPath,['-e','process.exit(7)'],{capture:true}),/exit 7/);});
