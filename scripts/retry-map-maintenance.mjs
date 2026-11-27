#!/usr/bin/env node
/** Retry only an existing journal using the installed image and exact existing mounts. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const execute=promisify(execFile),prefix='MAP_MAINTENANCE_DIAGNOSTIC=';
const mapKeys=new Set(['MAP_DOWNLOADS_DIR','MAP_IMAGERY_DIR','MAP_DEM_DIR','MAP_MAINTENANCE_TPK_DIR','MAP_MAINTENANCE_OSM_DIR','MAP_MAINTENANCE_STREET_DIR','MAP_MAINTENANCE_ELEVATION_DIR']);
class SetupError extends Error {}
const stopped=[],diagnosticNames=[];let diagnosticName,project,activePython;let interrupted=false;
process.once('SIGINT',()=>{interrupted=true;activePython?.abort();});
async function docker(args,timeout=35000){
 try{return await execute('docker',args,{encoding:'utf8',maxBuffer:2*1024**2,timeout,windowsHide:true});}
 catch(error){const failure=new SetupError('Docker 명령을 완료하지 못했습니다. 컨테이너 상태와 Docker 실행 상태를 확인하세요.');failure.exit=typeof error.code==='number'?error.code:1;throw failure;}
}
// execFile does not accept stdin through options; keep stdin handling explicit.
async function runPython(args,input){
 return new Promise((resolve,reject)=>{
  const controller=new AbortController();activePython=controller;let output='';const child=execFile('docker',args,{encoding:'utf8',maxBuffer:2*1024**2,timeout:120000,windowsHide:true,signal:controller.signal},(error,stdout)=>{
   activePython=undefined;output=stdout||'';const line=output.split(/\r?\n/).filter(l=>l.startsWith(prefix)).at(-1);
   if(error&&error.code!==2){reject(new SetupError('격리 재시도가 중단됐습니다. 기존 서비스 복구 상태를 확인하세요.'));return;}
   if(!line){reject(new SetupError('격리 재시도의 진단 결과를 받지 못했습니다. 원문 로그나 환경변수는 출력하지 않았습니다.'));return;}
   try{resolve(JSON.parse(line.slice(prefix.length)));}catch{reject(new SetupError('진단 응답 형식을 확인하지 못했습니다.'));}
  });child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
async function inspect(ids){if(!ids.length)return [];return JSON.parse((await docker(['inspect',...ids])).stdout);}
async function service(name){const ids=(await docker(['ps','-aq','--filter','label=com.docker.compose.project='+project,'--filter','label=com.docker.compose.service='+name])).stdout.trim().split(/\s+/).filter(Boolean);return inspect(ids);}
async function stop(container,restore=true){if(!container.State.Running&&!container.State.Restarting)return;await docker(['stop','--time','25',container.Id]);if(restore)stopped.push(container.Id);}
try{
 const args=process.argv.slice(2);let workerId;
 if(args.length===2&&args[0]==='--worker-container')workerId=args[1];
 else if(args.length===0)workerId=(await docker(['compose','--profile','downloads','ps','-a','-q','download-worker'])).stdout.trim();
 else throw new SetupError('사용법: node scripts/retry-map-maintenance.mjs [--worker-container 이름]');
 if(!workerId||/\s/.test(workerId))throw new SetupError('단일 download-worker 컨테이너를 찾지 못했습니다.');
 const [worker]=await inspect([workerId]);if(worker.Config.Labels?.['com.docker.compose.service']!=='download-worker')throw new SetupError('download-worker 서비스만 재시도할 수 있습니다.');project=worker.Config.Labels['com.docker.compose.project'];
 if(!project)throw new SetupError('Compose 프로젝트를 확인하지 못했습니다.');
 const python=await readFile(new URL('./downloads/maintenance_retry.py',import.meta.url),'utf8');
 const environments=(worker.Config.Env||[]).filter(v=>mapKeys.has(v.split('=',1)[0])).flatMap(v=>['-e',v]);
 const base=['run','--rm','-i','--pull','never','--network','none','--read-only','--tmpfs','/tmp:rw,size=64m','--entrypoint','/usr/bin/python3',...(worker.Config.User?['--user',worker.Config.User]:[]),...environments];
 const probeName='map-maintenance-probe-'+randomUUID();diagnosticNames.push(probeName);
 const before=await runPython([...base,'--name',probeName,'--volumes-from',worker.Id+':ro','-e','MAP_MAINTENANCE_DIAGNOSTIC_MODE=inspect',worker.Image,'-'],python);
 console.log(JSON.stringify(before));if(before.runnerError||typeof before.pending!=='boolean')throw new SetupError('저장된 정리 상태를 확인하지 못했습니다. 파일과 설정은 유지했습니다.');if(!before.pending){console.log('복구 대기 요청이 없습니다.');process.exitCode=0;}
 else{
  if(!before.ready||!['prepared','moving','completed'].includes(before.phase))throw new SetupError('저널이 재시도 가능한 단계가 아닙니다. 파일과 설정은 유지했습니다.');
  console.log('현재 프로젝트의 web과 worker를 잠시 중지하고 저장된 정리를 오프라인으로 한 번 재시도합니다.');
  for(const old of await service('imagery'))await stop(old,false);
  for(const web of await service('web'))await stop(web);
  await stop(worker);if(interrupted)throw new SetupError('사용자가 중단했습니다.');
  diagnosticName='map-maintenance-retry-'+randomUUID();diagnosticNames.push(diagnosticName);
  const result=await runPython([...base,'--name',diagnosticName,'--volumes-from',worker.Id,'-e','MAP_MAINTENANCE_DIAGNOSTIC_MODE=retry',worker.Image,'-'],python);
  console.log(JSON.stringify(result));process.exitCode=result.pending||result.runnerError?2:0;
 }
}catch(error){console.error(error instanceof SetupError?error.message:'진단을 완료하지 못했습니다. 비공개 원문은 출력하지 않았습니다.');process.exitCode=1;}
finally{
 let safe=true;
 for(const name of diagnosticNames){
  try{await docker(['stop','--time','25',name]);}catch{}
  try{if((await docker(['ps','-q','--filter','name=^'+name+'$'])).stdout.trim())safe=false;}catch{safe=false;}
 }
 if(safe){for(const id of stopped.reverse())try{await docker(['start',id]);}catch{console.error('기존 컨테이너를 다시 시작하지 못했습니다. Docker 상태를 확인하세요.');process.exitCode=1;}}
 else{console.error('진단 컨테이너의 종료를 확인하지 못해 기존 서비스를 자동 시작하지 않았습니다.');process.exitCode=1;}
}
