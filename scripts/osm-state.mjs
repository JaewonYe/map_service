import {readFile,stat,realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {parseEnv} from 'node:util';
export async function projectEnvironment(root){
  let file={};
  try{file=parseEnv(await readFile(join(root,'.env'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  return {...file,...process.env};
}
export async function osmSource(directory,filename='south-korea.osm.pbf'){
  if(!filename.endsWith('.osm.pbf')||/[\\/:\0]/.test(filename)||filename==='..')throw Error('OSM_PBF_FILE에는 폴더 없이 .osm.pbf 파일명만 입력하세요.');
  const names=filename==='south-korea.osm.pbf'?[filename,'south-korea-latest.osm.pbf']:[filename];
  for(const name of names){
    try{const file=await stat(join(directory,name));if(file.isFile()&&file.size>0)return {name,size:file.size,mtimeMs:Math.floor(file.mtimeMs)};}
    catch(error){if(!['ENOENT','ENOTDIR'].includes(error.code))throw error;}
  }
  return null;
}
export async function osmPrepared(directory,source){
  try{
    const m=JSON.parse((await readFile(join(directory,'metadata.json'),'utf8')).replace(/^\uFEFF/,''));
    if(!m||typeof m!=='object'||m.version!==1||m.type!=='osm-sqlite'||m.usageConfirmed!==true||typeof m.database!=='string'||!/^sets\/[a-zA-Z0-9_-]+\/map\.sqlite$/.test(m.database))return false;
    const root=await realpath(directory),filename=await realpath(resolve(directory,m.database));
    const rel=relative(root,filename);if(rel.startsWith('..')||isAbsolute(rel))return false;
    const db=await stat(filename);if(!db.isFile()||db.size===0)return false;
    if(!source)return true;
    if(m.sourceFile===source.name&&m.sourceSize===source.size&&Number.isFinite(m.sourceMtimeMs)&&Math.abs(m.sourceMtimeMs-source.mtimeMs)<=1)return true;
    // File copies may alter mtime. Verify bytes before requiring a new Docker import.
    if(m.sourceSize!==source.size||typeof m.sourceSha256!=='string'||!/^[a-f0-9]{64}$/i.test(m.sourceSha256))return false;
    const hash=createHash('sha256');for await(const chunk of createReadStream(join(directory,source.name)))hash.update(chunk);
    const after=await stat(join(directory,source.name));
    return hash.digest('hex')===m.sourceSha256.toLowerCase()&&after.size===source.size&&Math.abs(Math.floor(after.mtimeMs)-source.mtimeMs)<=1;
  }catch(error){if(error instanceof SyntaxError||['ENOENT','ENOTDIR'].includes(error.code))return false;throw error;}
}
