import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile),sentinel='SYNTHETIC_SECRET_DO_NOT_EMIT';
async function fixture(t,mode){
 const root=await mkdtemp(join(tmpdir(),'maintenance-runner-'));t.after(()=>rm(root,{recursive:true,force:true}));const bin=join(root,'bin');await mkdir(bin);const log=join(root,'calls.jsonl');
 const source=`#!/usr/bin/env node
const fs=require('fs');const args=process.argv.slice(2);fs.appendFileSync(process.env.MAP_RETRY_CALLS,JSON.stringify(args)+'\\n');
const item=id=>({Id:id,Image:'sha256:synthetic-local-image',Config:{User:'1000',Labels:{'com.docker.compose.service':id==='fixture-worker'?'download-worker':id==='fixture-web'?'web':'imagery','com.docker.compose.project':'synthetic-project'},Env:['MAP_DOWNLOADS_DIR=/data/downloads','MAP_IMAGERY_DIR=/private-synthetic-owner/imagery','ARCGIS_TOKEN=${sentinel}','HTTP_PROXY=https://${sentinel}@proxy.invalid']},State:{Running:true,Restarting:false}});
if(args[0]==='compose')console.log('fixture-worker');
else if(args[0]==='inspect')console.log(JSON.stringify(args.slice(1).map(item)));
else if(args[0]==='ps'){if(args.some(x=>x.includes('service=imagery')))console.log('fixture-imagery');else if(args.some(x=>x.includes('service=web')))console.log('fixture-web');}
else if(args[0]==='run'){let input='';process.stdin.on('data',x=>input+=x);process.stdin.on('end',()=>{if(!input.includes('Worker'))process.exit(9);const retry=args.includes('MAP_MAINTENANCE_DIAGNOSTIC_MODE=retry');if(retry&&process.env.MAP_RETRY_MODE==='engine-error'){console.error('${sentinel}');console.log('${sentinel}');process.exit(7);}const data=process.env.MAP_RETRY_MODE==='empty'?{pending:false}:retry?{pending:true,phase:'moving',moved:1,total:3,failure:{code:'EACCES',errno:13}}:{pending:true,ready:true,phase:'moving',moved:1,total:3};console.log('MAP_MAINTENANCE_DIAGNOSTIC='+JSON.stringify(data));process.exit(retry?2:0);});}
`;
 await writeFile(join(bin,'docker'),source);await chmod(join(bin,'docker'),0o755);
 let result;try{const r=await exec(process.execPath,[resolve('scripts/retry-map-maintenance.mjs')],{env:{...process.env,PATH:bin+':'+process.env.PATH,MAP_RETRY_CALLS:log,MAP_RETRY_MODE:mode}});result={code:0,output:r.stdout+r.stderr};}catch(error){result={code:error.code,output:(error.stdout||'')+(error.stderr||'')};}
 const calls=(await readFile(log,'utf8')).trim().split('\n').map(JSON.parse);return {...result,calls};
}
test('journal retry uses exact existing mounts offline, forwards map paths only, and restores services',async t=>{
 const result=await fixture(t,'failed');assert.equal(result.code,2);assert.match(result.output,/EACCES/);assert.ok(!result.output.includes(sentinel));assert.ok(!result.output.includes('/private-synthetic-owner'));
 const runs=result.calls.filter(a=>a[0]==='run');assert.equal(runs.length,2);assert.ok(runs[0].includes('fixture-worker:ro'));assert.ok(runs[1].includes('fixture-worker'));for(const args of runs){assert.equal(args[args.indexOf('--network')+1],'none');assert.ok(args.includes('--read-only'));assert.ok(args.includes('--pull'));assert.ok(!args.join(' ').includes(sentinel));assert.ok(!args.join(' ').includes('ARCGIS_TOKEN'));assert.ok(args.includes('MAP_IMAGERY_DIR=/private-synthetic-owner/imagery'));}
 assert.deepEqual(result.calls.filter(a=>a[0]==='stop').slice(0,3).map(a=>a.at(-1)),['fixture-imagery','fixture-web','fixture-worker']);assert.deepEqual(result.calls.filter(a=>a[0]==='start').map(a=>a[1]),['fixture-worker','fixture-web']);
});
test('no pending request leaves every service unchanged',async t=>{
 const result=await fixture(t,'empty');assert.equal(result.code,0);assert.equal(result.calls.filter(a=>a[0]==='run').length,1);assert.equal(result.calls.filter(a=>(a[0]==='stop'||a[0]==='start')&&a.some(v=>v.startsWith('fixture-'))).length,0);
});
test('failed diagnostic process cleans up and restores services without dumping private stderr',async t=>{
 const result=await fixture(t,'engine-error');assert.equal(result.code,1);assert.ok(!result.output.includes(sentinel));assert.deepEqual(result.calls.filter(a=>a[0]==='start').map(a=>a[1]),['fixture-worker','fixture-web']);assert.ok(result.calls.some(a=>a[0]==='stop'&&a.at(-1).startsWith('map-maintenance-retry-')));
});
