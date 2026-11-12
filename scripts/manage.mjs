import {spawn} from 'node:child_process';
import {copyFile,access} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,win32} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
// .cmd files need a shell on Windows. Invoke npm's JavaScript CLI through Node
// instead so paths and arguments remain separate, including spaces/metacharacters.
export async function commandSpec(command,args,{platform=process.platform,nodePath=process.execPath,env=process.env,check=access}={}){
  if(platform!=='win32'||!['npm','npm.cmd'].includes(command))return {command,args};
  const directories=[win32.dirname(nodePath),...(env.PATH||env.Path||'').split(';').filter(Boolean).map(value=>value.replace(/^"|"$/g,''))];
  const candidates=[
    ...(env.npm_execpath&&win32.basename(env.npm_execpath)==='npm-cli.js'?[env.npm_execpath]:[]),
    ...directories.map(directory=>win32.join(directory,'node_modules','npm','bin','npm-cli.js'))
  ];
  for(const candidate of new Set(candidates)){
    try{await check(candidate);return {command:nodePath,args:[candidate,...args]};}
    catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
  }
  throw Error('npm CLI를 찾을 수 없습니다. npm이 포함된 Node.js를 설치하고 실행 메뉴를 다시 여세요.');
}
export async function runCommand(command,args,{cwd=root,capture=false}={}){
  const specification=await commandSpec(command,args);
  return new Promise((resolve,reject)=>{
    const child=spawn(specification.command,specification.args,{cwd,shell:false,stdio:capture?['ignore','pipe','pipe']:'inherit'});
    let stdout='',stderr='';if(capture){child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);}
    child.once('error',reject);child.once('close',(code,signal)=>code===0?resolve(stdout):reject(Error(`${command} failed (exit ${code}, signal ${signal})${stderr}`)));
  });
}
async function dependenciesReady(projectRoot,action){
  const files=['tsx/dist/cli.mjs','fast-xml-parser/package.json','yauzl/index.js','sharp/package.json'];
  if(action==='dev')files.push('next/dist/bin/next','react/package.json','leaflet/dist/leaflet.js');
  try{await Promise.all(files.map(file=>access(join(projectRoot,'node_modules',file))));return true;}
  catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))return false;throw error;}
}
export async function execute(action,run=runCommand,{projectRoot=root}={}){
  const command=(name,args,options={})=>run(name,args,{cwd:projectRoot,...options});
  const docker=(...args)=>command('docker',['compose',...args]);
  if(!['start','dev','stop','status','inspect'].includes(action))throw Error('Unknown action');
  try{await access(join(projectRoot,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;await copyFile(join(projectRoot,'.env.example'),join(projectRoot,'.env'));}
  if(action==='inspect'||action==='dev'){
    const npm=process.platform==='win32'?'npm.cmd':'npm';
    if(!await dependenciesReady(projectRoot,action)){
      console.log('필요한 패키지를 준비합니다 (최초 설치 시 인터넷 필요)…');
      await command(npm,['ci','--include=dev']);
      if(!await dependenciesReady(projectRoot,action))throw Error('패키지 설치 후에도 필요한 파일이 없습니다. npm 설치 로그를 확인하세요.');
    }
    return command(npm,['run',action==='inspect'?'inspect:tpk':'dev']);
  }
  await command('docker',['info','--format','{{.ServerVersion}}'],{capture:true});
  if(action==='start'){await docker('up','-d','--build');console.log('Default URL: http://localhost:3001 (use PORT from .env if changed).');}
  if(action==='stop')await docker('down');
  if(action==='status'){await docker('ps','-a');await docker('logs','--tail=60','web');}
}
async function main(){
  if(process.argv[2])return execute(process.argv[2]);
  const menu={'1':['TPK 메타데이터 검사 (필요 시 패키지 자동 설치)','inspect'],'2':['Docker 시작','start'],'3':['개발 서버 실행','dev'],'4':['Docker 종료 (데이터 유지)','stop'],'5':['상태·로그','status']};
  const reader=createInterface({input:process.stdin,output:process.stdout});
  try{while(true){console.log('\n=== 오프라인 TPK 지도 ===');for(const [id,[label]] of Object.entries(menu))console.log(`${id}. ${label}`);console.log('0. 메뉴 닫기');
    const choice=(await reader.question('선택: ')).trim();if(choice==='0')break;if(!menu[choice])continue;
    try{await execute(menu[choice][1]);}catch(error){console.error('실패:',error.message);}await reader.question('Enter: 메뉴로 돌아가기');
  }}finally{reader.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
