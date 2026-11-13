import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {commandSpec,execute,runCommand} from '../scripts/manage.mjs';
const npm=process.platform==='win32'?'npm.cmd':'npm';
async function fixture(t){
  const projectRoot=await mkdtemp(join(tmpdir(),'map-launcher-'));
  t.after(()=>rm(projectRoot,{recursive:true,force:true}));
  await writeFile(join(projectRoot,'.env.example'),'PORT=3001\n');
  async function install(){
    for(const file of ['tsx/dist/cli.mjs','fast-xml-parser/package.json','yauzl/index.js','sharp/package.json','next/dist/bin/next','react/package.json','leaflet/dist/leaflet.js']){
      const path=join(projectRoot,'node_modules',file);await mkdir(dirname(path),{recursive:true});await writeFile(path,'');
    }
  }
  return {projectRoot,install};
}
test('start invokes only the existing Next.js Compose service',async(t)=>{
  const {projectRoot}=await fixture(t);
  const calls=[];await execute('start',async(...args)=>{calls.push(args);return '';},{projectRoot});
  assert.ok(calls.some(([c,a])=>c==='docker'&&a.join(' ')==='compose up -d --build'));
  assert.ok(calls.every(([c])=>c==='docker'));
});
test('failed Docker prerequisite prevents startup',async(t)=>{
  const {projectRoot}=await fixture(t);
  const calls=[];await assert.rejects(execute('start',async(c,a)=>{calls.push(a);throw Error('Docker stopped');},{projectRoot}),/Docker stopped/);
  assert.equal(calls.length,1);
});
test('host development installs missing dependencies without a Docker prerequisite',async(t)=>{
  const {projectRoot,install}=await fixture(t);
  const calls=[];await execute('dev',async(...args)=>{calls.push(args);if(args[1][0]==='ci')await install();return '';},{projectRoot});
  assert.deepEqual(calls.map(([command,args])=>[command,args]),[
    [npm,['ci','--include=dev']],
    [npm,['run','dev']]
  ]);
});
test('inspection installs tsx and development dependencies before running',async(t)=>{
  const {projectRoot,install}=await fixture(t),calls=[];
  await execute('inspect',async(command,args,options)=>{
    calls.push([command,args]);assert.equal(options.cwd,projectRoot);
    if(args[0]==='ci')await install();return '';
  },{projectRoot});
  assert.deepEqual(calls,[[npm,['ci','--include=dev']],[npm,['run','inspect:tpk']]]);
});
test('prepared inspection and development skip installation for offline use',async(t)=>{
  const {projectRoot,install}=await fixture(t);await install();const calls=[];
  const run=async(command,args)=>{calls.push([command,args]);return '';};
  await execute('inspect',run,{projectRoot});await execute('dev',run,{projectRoot});
  assert.deepEqual(calls,[[npm,['run','inspect:tpk']],[npm,['run','dev']]]);
});
test('failed installation stops before inspection',async(t)=>{
  const {projectRoot}=await fixture(t),calls=[];
  await assert.rejects(execute('inspect',async(command,args)=>{calls.push([command,args]);throw Error('Registry unavailable');},{projectRoot}),/Registry unavailable/);
  assert.deepEqual(calls,[[npm,['ci','--include=dev']]]);
});
test('incomplete installation reports missing dependencies instead of starting inspection',async(t)=>{
  const {projectRoot}=await fixture(t),calls=[];
  await assert.rejects(execute('inspect',async(command,args)=>{calls.push([command,args]);return '';},{projectRoot}),/패키지 설치 후에도/);
  assert.deepEqual(calls,[[npm,['ci','--include=dev']]]);
});
test('Windows npm runs through Node while preserving paths and literal arguments',async()=>{
  const nodePath='C:\\Program Files\\nodejs\\node.exe',npmPath='C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  const args=['run','inspect:tpk','--','C:\\Maps & files\\100% (RGB)\\map.tpk'];
  const result=await commandSpec('npm.cmd',args,{platform:'win32',nodePath,env:{},check:async path=>assert.equal(path,npmPath)});
  assert.deepEqual(result,{command:nodePath,args:[npmPath,...args]});
});
test('Windows npm CLI can be discovered from PATH',async()=>{
  const npmPath='D:\\Tools & npm\\node_modules\\npm\\bin\\npm-cli.js';
  const result=await commandSpec('npm.cmd',['ci'],{
    platform:'win32',nodePath:'C:\\Node\\node.exe',env:{Path:'"D:\\Tools & npm"'},
    check:async path=>{if(path!==npmPath)throw Object.assign(Error('Missing'),{code:'ENOENT'});}
  });
  assert.deepEqual(result,{command:'C:\\Node\\node.exe',args:[npmPath,'ci']});
});
test('Windows missing npm CLI produces an actionable error',async()=>{
  await assert.rejects(commandSpec('npm.cmd',['ci'],{platform:'win32',nodePath:'C:\\Node\\node.exe',env:{},check:async()=>{throw Object.assign(Error('Missing'),{code:'ENOENT'});}}),/npm CLI를 찾을 수 없습니다/);
});
test('process error codes remain visible',async()=>{await assert.rejects(runCommand(process.execPath,['-e','process.exit(7)'],{capture:true}),/exit 7/);});
test('process arguments with spaces and shell metacharacters remain literal',async()=>{
  const value='space & percent% (parentheses) "quoted"';
  const output=await runCommand(process.execPath,['-e','process.stdout.write(process.argv[1])',value],{capture:true});
  assert.equal(output,value);
});

async function elevationFixture(t,{input='valid',permission='true'}={}){
  const {projectRoot}=await fixture(t);
  // The resolved Compose bind may differ from the project's default folder.
  const directory=join(projectRoot,'custom DEM data');
  await mkdir(join(directory,'source'),{recursive:true});
  if(input==='valid')await writeFile(join(directory,'source','dem.tif'),Buffer.from([0x49,0x49,0x2a,0]));
  if(input==='empty')await writeFile(join(directory,'source','dem.tif'),'');
  if(input==='directory')await mkdir(join(directory,'source','dem.tif'));
  if(input==='pbf'){
    await mkdir(join(projectRoot,'data','osm'),{recursive:true});
    await writeFile(join(projectRoot,'data','osm','south-korea.osm.pbf'),'OSM data is not a DEM');
  }
  const calls=[];
  const run=async(command,args,options)=>{
    calls.push([command,args,options]);
    if(args.includes('config')){
      assert.equal(options.capture,true);
      return JSON.stringify({services:{'prepare-elevation':{volumes:[{type:'bind',source:directory,target:'/data/elevation'}],
        environment:{ELEVATION_USAGE_CONFIRMED:permission}}}});
    }
    return '';
  };
  return {projectRoot,calls,run};
}
test('PBF-only input stops DEM preparation before an image build and explains the separate datasets',async t=>{
  const f=await elevationFixture(t,{input:'pbf'});
  await assert.rejects(execute('elevation',f.run,{projectRoot:f.projectRoot}),error=>{
    assert.match(error.message,/DEM 파일/);assert.match(error.message,/\.osm\.pbf/);assert.match(error.message,/메뉴 2 또는 3/);return true;
  });
  assert.equal(f.calls.length,2);assert.ok(!f.calls.some(([,args])=>args.includes('run')||args.includes('--build')));
});
test('DEM preparation rejects an empty file or a directory before an image build',async t=>{
  for(const input of ['empty','directory']){
    const f=await elevationFixture(t,{input});
    await assert.rejects(execute('elevation',f.run,{projectRoot:f.projectRoot}),/비어 있지 않은 DEM/);
    assert.ok(!f.calls.some(([,args])=>args.includes('--build')));
  }
});
test('DEM usage confirmation is checked before building a preparation image',async t=>{
  const f=await elevationFixture(t,{permission:'false'});
  await assert.rejects(execute('elevation',f.run,{projectRoot:f.projectRoot}),/ELEVATION_USAGE_CONFIRMED=true/);
  assert.ok(!f.calls.some(([,args])=>args.includes('--build')));
});
test('DEM preparation uses the Compose-resolved custom host directory and keeps arguments separate',async t=>{
  const f=await elevationFixture(t);
  await execute('elevation',f.run,{projectRoot:f.projectRoot});
  assert.deepEqual(f.calls.at(-1).slice(0,2),['docker',['compose','--profile','tools','run','--rm','--build','prepare-elevation']]);
});
