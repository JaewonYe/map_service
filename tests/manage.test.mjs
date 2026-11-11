import test from 'node:test';
import assert from 'node:assert/strict';
import {execute,runCommand} from '../scripts/manage.mjs';
test('start invokes only the existing Next.js Compose service',async()=>{
  const calls=[];await execute('start',async(...args)=>{calls.push(args);return '';});
  assert.ok(calls.some(([c,a])=>c==='docker'&&a.join(' ')==='compose up -d --build'));
  assert.ok(calls.every(([c])=>c==='docker'));
});
test('failed Docker prerequisite prevents startup',async()=>{
  const calls=[];await assert.rejects(execute('start',async(c,a)=>{calls.push(a);throw Error('Docker stopped');}),/Docker stopped/);
  assert.equal(calls.length,1);
});
test('host development works without a Docker prerequisite',async()=>{
  const calls=[];await execute('dev',async(...args)=>{calls.push(args);return '';});
  assert.deepEqual(calls.map(([command,args])=>[command,args]),[
    [process.platform==='win32'?'npm.cmd':'npm',['ci']],
    [process.platform==='win32'?'npm.cmd':'npm',['run','dev']]
  ]);
});
test('process error codes remain visible',async()=>{await assert.rejects(runCommand(process.execPath,['-e','process.exit(7)'],{capture:true}),/exit 7/);});
