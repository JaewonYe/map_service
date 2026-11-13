import {spawn} from 'node:child_process';
import {projectEnvironment,osmSource,osmPrepared} from './osm-state.mjs';
import {copyFile,access,stat} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {join,resolve,win32} from 'node:path';
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
export async function runCommand(command,args,{cwd=root,capture=false,env}={}){
  const specification=await commandSpec(command,args);
  return new Promise((resolve,reject)=>{
    const child=spawn(specification.command,specification.args,{cwd,shell:false,stdio:capture?['ignore','pipe','pipe']:'inherit',...(env?{env}:{})});
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
export async function prepareDevelopmentOsm(run=runCommand,{projectRoot=root}={}){
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22||major===22&&minor<13)throw Error('OSM 일반 지도에는 Node.js 22.13 이상이 필요합니다. Node.js 24 LTS를 권장합니다.');
  const env=await projectEnvironment(projectRoot),directory=resolve(projectRoot,env.OSM_TILE_DIR||'data/osm');
  const source=await osmSource(directory,env.OSM_PBF_FILE);
  if(source&&!await osmPrepared(directory,source)){
    console.log('새 OSM PBF를 확인했습니다. 일반 지도를 최초 준비합니다 (Docker 필요 · 국가 데이터는 수분 이상 소요될 수 있습니다)…');
    await execute('osm',run,{projectRoot,osmDirectory:directory,automaticOsm:true});
  }
}
export async function execute(action,run=runCommand,{projectRoot=root,osmDirectory,automaticOsm=false}={}){
  const command=(name,args,options={})=>run(name,args,{cwd:projectRoot,...options});
  const docker=(...args)=>command('docker',['compose',...args]);
  if(!['start','dev','stop','status','inspect','elevation','osm'].includes(action))throw Error('Unknown action');
  try{await access(join(projectRoot,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;await copyFile(join(projectRoot,'.env.example'),join(projectRoot,'.env'));}
  if(action==='inspect'||action==='dev'){
    const npm=process.platform==='win32'?'npm.cmd':'npm';
    if(!await dependenciesReady(projectRoot,action)){
      console.log('필요한 패키지를 준비합니다 (최초 설치 시 인터넷 필요)…');
      await command(npm,['ci','--include=dev']);
      if(!await dependenciesReady(projectRoot,action))throw Error('패키지 설치 후에도 필요한 파일이 없습니다. npm 설치 로그를 확인하세요.');
    }
    if(action==='dev')await prepareDevelopmentOsm(run,{projectRoot});
    return command(npm,['run',action==='inspect'?'inspect:tpk':'dev']);
  }
  await command('docker',['info','--format','{{.ServerVersion}}'],{capture:true});
  if(action==='start'){
    const env=await projectEnvironment(projectRoot),directory=resolve(projectRoot,env.OSM_HOST_DIR||'data/osm');
    const source=await osmSource(directory,env.OSM_PBF_FILE);
    if(source&&!await osmPrepared(directory,source))await execute('osm',run,{projectRoot,osmDirectory:directory,automaticOsm:true});
    await docker('up','-d','--build');console.log('Default URL: http://localhost:3001 (use PORT from .env if changed).');}
  if(action==='osm'){
    const options={env:{...process.env,...(osmDirectory?{OSM_HOST_DIR:osmDirectory}:{})}};
    const output=await command('docker',['compose','--profile','tools','config','--format','json'],{...options,capture:true});
    let config;
    try{config=JSON.parse(output);}catch{throw Error('Docker Compose 설정을 읽지 못했습니다. Compose v2를 확인하세요.');}
    const service=config.services?.['prepare-osm'];
    const mount=service?.volumes?.find(volume=>volume.type==='bind'&&volume.target==='/data/osm');
    if(typeof mount?.source!=='string'||typeof service.image!=='string')throw Error('OSM_HOST_DIR와 prepare-osm Compose 설정을 확인하세요.');
    const directory=resolve(projectRoot,mount.source),source=await osmSource(directory,service.environment?.OSM_PBF_FILE);
    if(!source)throw Error(`OSM PBF가 없습니다: ${directory}\n다운로드한 south-korea.osm.pbf 또는 south-korea-latest.osm.pbf를 이 폴더에 복사하세요. 7번은 일반 지도용이며 고도 DEM은 필요하지 않습니다.`);
    if(automaticOsm&&await osmPrepared(directory,source))return;
    let build=false;
    try{await command('docker',['image','inspect',service.image,'--format','{{.Id}}'],{capture:true});}
    catch(error){if(/No such image|not found|does not exist/i.test(error.message))build=true;else throw error;}
    console.log('OSM 도로·건물·지명 데이터를 준비합니다. 원본은 보존하고 결과만 새 세트로 저장합니다.');
    await command('docker',['compose','--profile','tools','run','--rm','--pull','never',...(build?['--build']:[]),'prepare-osm',...(!automaticOsm?['--force']:[])],options);
    if(!await osmPrepared(directory,source))throw Error('변환 결과를 찾을 수 없습니다. OSM_HOST_DIR와 변환 로그를 확인하세요.');
    console.log('일반 지도 준비 완료. 실행 중인 서버는 재시작하고 브라우저를 새로고침하세요.');
  }
  if(action==='elevation'){
    // Compose resolves .env, shell overrides and Windows paths. Do not guess the
    // host folder or print the resolved config (which may contain credentials).
    const output=await command('docker',['compose','--profile','tools','config','--format','json'],{capture:true});
    let config;
    try{config=JSON.parse(output);}catch{throw Error('Docker Compose 설정을 읽지 못했습니다. Compose v2를 확인하세요.');}
    const service=config.services?.['prepare-elevation'];
    const mount=service?.volumes?.find(volume=>volume.type==='bind'&&volume.target==='/data/elevation');
    if(typeof mount?.source!=='string')throw Error('고도 데이터 폴더 설정을 확인하세요: ELEVATION_HOST_DIR');
    const filename=resolve(projectRoot,mount.source,'source','dem.tif');
    let file;
    try{file=await stat(filename);}catch(error){
      if(['ENOENT','ENOTDIR'].includes(error.code))throw Error(`고도 DEM 파일이 없습니다: ${filename}\n6번은 고도용 DEM GeoTIFF(.tif) 전용입니다. OSM .osm.pbf는 고도 데이터가 아니며 이 메뉴로 변환할 수 없습니다.\n고도 지도가 필요하면 해당 위치에 DEM을 준비하세요. 기존 지도 실행은 메뉴 2 또는 3을 사용하세요.`);
      throw error;
    }
    if(!file.isFile()||file.size===0)throw Error(`비어 있지 않은 DEM GeoTIFF 파일을 준비하세요: ${filename}`);
    if(String(service.environment?.ELEVATION_USAGE_CONFIRMED)!=='true')throw Error('DEM 변환·자체 웹 사용이 허용된 파일인지 확인한 뒤 .env의 ELEVATION_USAGE_CONFIRMED=true를 설정하세요.');
    await docker('--profile','tools','run','--rm','--build','prepare-elevation');
  }
  if(action==='stop')await docker('down');
  if(action==='status'){await docker('ps','-a');await docker('logs','--tail=60','web');}
}
async function main(){
  if(process.argv[2])return execute(process.argv[2]);
  const menu={'1':['TPK 메타데이터 검사 (필요 시 패키지 자동 설치)','inspect'],'2':['Docker 시작','start'],'3':['개발 서버 실행','dev'],'4':['Docker 종료 (데이터 유지)','stop'],'5':['상태·로그','status'],'6':['고도 지도 준비 (DEM .tif 전용 · OSM PBF 불가)','elevation'],'7':['OSM 일반 지도 준비·갱신 (.osm.pbf)','osm']};
  const reader=createInterface({input:process.stdin,output:process.stdout});
  try{while(true){console.log('\n=== 오프라인 TPK 지도 ===');for(const [id,[label]] of Object.entries(menu))console.log(`${id}. ${label}`);console.log('0. 메뉴 닫기');
    const choice=(await reader.question('선택: ')).trim();if(choice==='0')break;if(!menu[choice])continue;
    try{await execute(menu[choice][1]);}catch(error){console.error('실패:',error.message);}await reader.question('Enter: 메뉴로 돌아가기');
  }}finally{reader.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});
