/** Windows/Ubuntu launcher. Tokens stay in the inherited environment, never in argv. */
import {mkdir,readFile,readdir,writeFile,rename,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const flags=process.argv.slice(2),allowed=['--accept-usage','--refresh','--help','--osm'];
if(flags.some(x=>!allowed.includes(x)))throw Error('지원 옵션: --accept-usage --refresh --osm --help');
if(flags.includes('--help')||!flags.includes('--accept-usage')){console.log('공식 이용 조건과 이 앱의 오프라인 표시·이전 권한을 확인한 뒤 실행하세요.\nnode --env-file=.env.downloads scripts/download-taean.mjs --accept-usage [--refresh] [--osm]\n기본: 지정 태안 영역 / World Imagery export POST EPSG:3857 level15–17 + OpenTopography COP30 GTiff. --osm은 대한민국 지역 PBF 전체 다운로드를 추가합니다.');process.exit(flags.includes('--help')?0:2);}
const directory=resolve(root,process.env.MAP_DOWNLOADS_HOST_DIR||'data/downloads');await mkdir(join(directory,'jobs'),{recursive:true});
for(const p of [process.env.IMAGERY_HOST_DIR||'data/imagery',process.env.DEM_HOST_DIR||'data/dem'])await mkdir(resolve(root,p),{recursive:true});
const files=(await readdir(join(directory,'jobs'))).filter(x=>x.endsWith('.request.json'));if(files.length>=100)throw Error('작업 기록100개 한도입니다. 백업 후 정리하세요.');
let pending=0;for(const f of files){let state;try{state=JSON.parse(await readFile(join(directory,'jobs',f.replace('.request.json','.state.json')),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}if(!state||['queued','running'].includes(state.state))pending++;}if(pending>=10)throw Error('대기/진행 작업10개 한도입니다. 기존 작업이 끝난 후 요청하세요.');
let registry={revision:0};try{registry=JSON.parse(await readFile(join(directory,'active.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw Error('등록 정보 오류: 기존 파일을 보존하고 복구하세요.');}
const id=randomUUID(),kinds=['satellite','elevation',...(flags.includes('--osm')?['osm']:[])];
const request={version:1,type:'download',id,createdAt:new Date().toISOString(),name:'태안 시험장 공식 원본 준비',bounds:{south:36.585138820015565,north:36.61063932151162,west:126.230336932571,east:126.24993476192829},kinds,region:'south-korea',demProvider:'opentopography',refresh:flags.includes('--refresh'),levels:{satellite:{min:15,max:17},elevation:{min:8,max:13}},accepted:Object.fromEntries(kinds.map(k=>[k,true])),registryRevision:registry.revision};
const temporary=join(directory,'jobs',id+'.tmp');await writeFile(temporary,JSON.stringify(request)+'\n',{flag:'wx',mode:0o600});await rename(temporary,join(directory,'jobs',id+'.request.json'));console.log('태안 준비 작업 '+id+'를 저장했습니다. 원본은 data/imagery·data/dem, 준비/상태는 별도 다운로드 폴더에 보존합니다.');
let exit=null;
const args=['compose','--profile','downloads','run','--rm','--build','download-worker','--once'];
const child=spawn('docker',args,{cwd:root,env:process.env,shell:false,stdio:['ignore','inherit','inherit']});
child.on('error',()=>{exit=127;});child.on('close',code=>{exit=code;});
let last='',deadline=Date.now()+2*60*60*1000;
while(Date.now()<deadline){
 let state=null;try{state=JSON.parse(await readFile(join(directory,'jobs',id+'.state.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(state){const text=JSON.stringify({state:state.state,stage:state.stage,items:Object.fromEntries(Object.entries(state.items||{}).map(([k,v])=>[k,{state:v.state,stage:v.description||v.stage,received:v.downloaded,total:v.total,reason:v.reason}]))});if(text!==last){console.log(text);last=text;}
  if(!['running','queued'].includes(state.state)){console.log(state.error||('결과: '+state.state));if(state.packageId)console.log('검증된 이전 ZIP: '+join(directory,'exports',state.packageId+'.zip'));process.exit(state.state==='completed'?0:1);}
 }
 if(exit!==null&&exit!==75){console.error('worker를 실행하지 못했거나 중단됐습니다. Docker/네트워크/인증 설정을 확인하세요. 요청은 보존돼 웹에서 조회·재시도할 수 있습니다.');process.exit(exit||1);}
 await new Promise(r=>setTimeout(r,1000));
}
console.error('CLI 대기2시간을 초과했습니다. 저장된 작업 상태를 확인하세요.');process.exit(1);
