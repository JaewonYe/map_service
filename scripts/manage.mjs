import {spawn} from 'node:child_process';
import {copyFile,access} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export function runCommand(command,args,{cwd=root,capture=false}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,shell:process.platform==='win32'&&command==='npm.cmd',stdio:capture?['ignore','pipe','pipe']:'inherit'});
    let stdout='',stderr='';if(capture){child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);}
    child.once('error',reject);child.once('close',(code,signal)=>code===0?resolve(stdout):reject(Error(`${command} failed (exit ${code}, signal ${signal})${stderr}`)));
  });
}
export async function execute(action,run=runCommand){
  const docker=(...args)=>run('docker',['compose',...args]);
  if(!['start','dev','stop','status','inspect'].includes(action))throw Error('Unknown action');
  try{await access(join(root,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;await copyFile(join(root,'.env.example'),join(root,'.env'));}
  if(action==='inspect')return run(process.platform==='win32'?'npm.cmd':'npm',['run','inspect:tpk']);
  if(action==='dev'){await run(process.platform==='win32'?'npm.cmd':'npm',['ci']);return run(process.platform==='win32'?'npm.cmd':'npm',['run','dev']);}
  await run('docker',['info','--format','{{.ServerVersion}}'],{capture:true});
  if(action==='start'){await docker('up','-d','--build');console.log('Default URL: http://localhost:3001 (use PORT from .env if changed).');}
  if(action==='stop')await docker('down');
  if(action==='status'){await docker('ps','-a');await docker('logs','--tail=60','web');}
}
async function main(){
  if(process.argv[2])return execute(process.argv[2]);
  const menu={'1':['TPK 메타데이터 검사 (npm ci 필요)','inspect'],'2':['Docker 시작','start'],'3':['개발 서버 실행','dev'],'4':['Docker 종료 (데이터 유지)','stop'],'5':['상태·로그','status']};
  const reader=createInterface({input:process.stdin,output:process.stdout});
  try{while(true){console.log('\n=== 오프라인 TPK 지도 ===');for(const [id,[label]] of Object.entries(menu))console.log(`${id}. ${label}`);console.log('0. 메뉴 닫기');
    const choice=(await reader.question('선택: ')).trim();if(choice==='0')break;if(!menu[choice])continue;
    try{await execute(menu[choice][1]);}catch(error){console.error('실패:',error.message);}await reader.question('Enter: 메뉴로 돌아가기');
  }}finally{reader.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
