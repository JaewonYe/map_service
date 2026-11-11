import {readFile,realpath,stat,readdir} from 'node:fs/promises';
import {isAbsolute,relative,resolve,join} from 'node:path';
import {imageType} from './tpk';
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
export async function osmInfo(){
  const directory=process.env.OSM_TILE_DIR;
  if(directory&&process.env.OSM_USAGE_CONFIRMED==='true'){
    try{if((await stat(directory)).isDirectory()&&await hasLocalTiles(directory))return {mode:'local',url:'/api/osm/{z}/{x}/{y}',attribution:'© OpenStreetMap contributors'};}catch{}
  }
  return process.env.MAP_MODE==='online'
    ?{mode:'online',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors'}
    :{mode:'unavailable',url:null,attribution:'© OpenStreetMap contributors'};
}
export async function osmTile(z:number,x:number,y:number){
  if((await osmInfo()).mode!=='local')return null;
  const root=await realpath(/*turbopackIgnore: true*/ resolve(/*turbopackIgnore: true*/ process.env.OSM_TILE_DIR!));
  for(const extension of ['png','jpg']){
    try{
      const filename=await realpath(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ root,String(z),String(x),`${y}.${extension}`));
      const rel=relative(root,filename);if(rel.startsWith('..')||isAbsolute(rel))return null;
      if((await stat(/*turbopackIgnore: true*/ filename)).size>20*1024*1024)return null;
      const bytes=await readFile(/*turbopackIgnore: true*/ filename);return {bytes,mime:imageType(bytes)};
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  }return null;
}
