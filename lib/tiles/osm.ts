import {readFile,realpath,stat,readdir} from 'node:fs/promises';
import {isAbsolute,relative,resolve,join} from 'node:path';
import {imageType,type Bounds} from './tpk';
import {getOsmIndex} from '../osm';
export type OsmInfo={mode:'local'|'online'|'unavailable'|'pending'|'error';url:string|null;attribution:string;bounds?:Bounds;minNativeZoom?:number;maxNativeZoom?:number;revision?:string;prepared?:boolean;reason?:string};
let directoryState:{key:string;at:number;ready:boolean}|undefined;
async function hasLocalTiles(directory:string){
  if(directoryState?.key===directory&&Date.now()-directoryState.at<1000)return directoryState.ready;
  let ready=false;
  for(const level of await readdir(/*turbopackIgnore: true*/ directory,{withFileTypes:true})){
    if(!level.isDirectory()||!/^\d{1,2}$/.test(level.name)||Number(level.name)>24)continue;
    for(const column of await readdir(/*turbopackIgnore: true*/ join(directory,level.name),{withFileTypes:true})){
      if(!column.isDirectory()||!/^\d+$/.test(column.name)||Number(column.name)>=2**Number(level.name))continue;
      if((await readdir(/*turbopackIgnore: true*/ join(directory,level.name,column.name))).some(name=>/^(0|[1-9]\d*)\.(png|jpg)$/.test(name)&&Number(name.split('.')[0])<2**Number(level.name))){ready=true;break;}
    }
    if(ready)break;
  }
  directoryState={key:directory,at:Date.now(),ready};return ready;
}
export async function osmInfo():Promise<OsmInfo>{
  const directory=process.env.OSM_TILE_DIR||'data/osm';
  try{
    const reader=await getOsmIndex(),m=reader.metadata;
    return {mode:'local',url:'/api/osm/{z}/{x}/{y}',attribution:m.attribution,bounds:m.bounds,
      minNativeZoom:0,maxNativeZoom:19,revision:reader.revision,prepared:true};
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')return {mode:'error',url:null,attribution:'© OpenStreetMap contributors',
      reason:'OSM 준비 데이터를 읽을 수 없습니다. 실행 메뉴 7 또는 prepare-osm --force로 다시 준비하고 서버를 재시작하세요.'};
  }
  if(directory&&process.env.OSM_USAGE_CONFIRMED==='true'){
    try{if((await stat(directory)).isDirectory()&&await hasLocalTiles(directory))return {mode:'local',url:'/api/osm/{z}/{x}/{y}',attribution:'© OpenStreetMap contributors'};}catch{}
  }
  if(process.env.MAP_MODE!=='online'){
    const configured=process.env.OSM_PBF_FILE||'south-korea.osm.pbf';
    for(const name of configured==='south-korea.osm.pbf'?[configured,'south-korea-latest.osm.pbf']:[configured]){
      if(name.includes('/')||name.includes('\\')||name.includes(':'))continue;
      try{if((await stat(/*turbopackIgnore: true*/ join(directory,name))).isFile())return {mode:'pending',url:null,attribution:'© OpenStreetMap contributors',
        reason:'OSM PBF를 확인했습니다. 실행 메뉴 7로 준비하거나 메뉴 3을 다시 실행하면 자동으로 변환합니다.'};}catch{}
    }
  }
  return process.env.MAP_MODE==='online'
    ?{mode:'online',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors'}
    :{mode:'unavailable',url:null,attribution:'© OpenStreetMap contributors'};
}
export async function osmTile(z:number,x:number,y:number){
  const info=await osmInfo();
  if(info.prepared)return (await getOsmIndex()).tile(z,x,y);
  if(info.mode!=='local')return null;
  const root=await realpath(/*turbopackIgnore: true*/ resolve(/*turbopackIgnore: true*/ process.env.OSM_TILE_DIR||'data/osm'));
  for(const extension of ['png','jpg']){
    try{
      const filename=await realpath(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ root,String(z),String(x),`${y}.${extension}`));
      const rel=relative(root,filename);if(rel.startsWith('..')||isAbsolute(rel))return null;
      if((await stat(/*turbopackIgnore: true*/ filename)).size>20*1024*1024)return null;
      const bytes=await readFile(/*turbopackIgnore: true*/ filename);return {bytes,mime:imageType(bytes)};
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }return null;
}
