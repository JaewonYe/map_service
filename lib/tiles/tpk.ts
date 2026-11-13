import {createHash} from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {mkdir,open,rename,rm,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {crc32} from 'node:zlib';
import * as yauzl from 'yauzl';
import {XMLParser} from 'fast-xml-parser';
import {mapConfig} from '../map-config';

type Entry = yauzl.Entry;
export type Bounds={south:number;west:number;north:number;east:number};
export type MapInfo={revision:string;center:[number,number];bounds:Bounds;minZoom:number;maxZoom:number;zoom:number;zoomLevels:number[];projection:'EPSG:3857';tileSize:number;source:string;attribution:string;format:string;storage:string;packageVersion:string;licenseNotice:string;usageConfirmed:boolean;archive:{entries:number;bundles:number;zipMethods:number[];packetSize:number;indexOrder:string};};
export class TileError extends Error { constructor(message:string,public status=422){super(message);} }
export type TpkOptions={usageConfirmed?:boolean;memoryLimitBytes?:number};
const WORLD=20037508.342789244, RESOLUTION=156543.03392804097;
function find(value:any,key:string):any {
  if(!value||typeof value!=='object')return undefined;
  const own=Object.keys(value).find(name=>name.toLowerCase()===key.toLowerCase());if(own)return value[own];
  for(const child of Object.values(value)){const result=find(child,key);if(result!==undefined)return result;}
}
const array=(value:any)=>Array.isArray(value)?value:[value];
const numeric=(value:unknown)=>{const n=Number(value);if(!Number.isFinite(n))throw new TileError('Invalid numeric cache metadata');return n;};
export function xyz(z:string,x:string,y:string){
  if(![z,x,y].every(v=>/^(0|[1-9]\d{0,9})$/.test(v)))throw new TileError('Invalid XYZ coordinates',400);
  const tile=[Number(z),Number(x),Number(y)] as const;
  if(tile[0]>24||tile[1]>=2**tile[0]||tile[2]>=2**tile[0])throw new TileError('XYZ outside valid range',400);
  return tile;
}
export function bundleIndex(version:1|2,row:number,col:number,size=128){return version===1?col*size+row:row*size+col;}
export function imageType(data:Buffer){
  if(data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255)return 'image/jpeg';
  if(data.length>=8&&data.subarray(0,8).toString('hex')==='89504e470d0a1a0a')return 'image/png';
  throw new TileError('Unsupported tile image signature');
}
function normalize(name:string){
  const p=name.replaceAll('\\','/');
  if(p.startsWith('/')||p.split('/').includes('..')||/^[A-Za-z]:/.test(p))throw new TileError('Unsafe archive member path');
  return p;
}
async function readAt(path:string,start:number,length:number){
  const file=await open(path,'r');
  try{const data=Buffer.alloc(length);let count=0;while(count<length){const result=await file.read(data,count,length-count,start+count);if(!result.bytesRead)throw new TileError('Truncated cache record');count+=result.bytesRead;}return data;}
  finally{await file.close();}
}

export class Tpk {
  private entries=new Map<string,Entry>();private levels=new Map<number,number>();private metadata!:MapInfo;private prefix='';private version:1|2=2;private identity='';
  private localOffsets=new Map<string,number>();private pending=new Map<string,Promise<string>>();
  private memory=new Map<string,{bytes:Buffer;mime:string;etag:string}>();private memoryBytes=0;
  private indexes=new Map<string,Buffer>();private indexPending=new Map<string,Promise<Buffer>>();
  private running=0;private waiters:Array<()=>void>=[];
  private tilesPending=new Map<string,Promise<{bytes:Buffer;mime:string;etag:string}|null>>();
  private constructor(private path:string,private zip:yauzl.ZipFile,private cache:string,private options:TpkOptions){}
  static async load(path:string,cache=resolve('.cache/tpk'),options:TpkOptions={}){
    const file=await stat(path);if(!file.isFile())throw new TileError('TPK path is not a file');
    const zip=await new Promise<yauzl.ZipFile>((ok,fail)=>yauzl.open(path,{lazyEntries:true,autoClose:false},(e,z)=>e?fail(e):ok(z!)));
    const reader=new Tpk(path,zip,cache,options);
    try{
      await new Promise<void>((ok,fail)=>{
        zip.on('error',fail);zip.on('end',ok);zip.on('entry',(entry:Entry)=>{
          try{const key=normalize(entry.fileName).toLowerCase();if(reader.entries.has(key))throw new TileError('Duplicate archive member');
            if(reader.entries.size>250000)throw new TileError('Too many archive members');
            reader.entries.set(key,entry);zip.readEntry();}catch(e){fail(e);}
        });zip.readEntry();
      });
      reader.identity=createHash('sha256').update(`${resolve(path)}:${file.size}:${file.mtimeMs}:${file.ctimeMs}`).digest('hex');
      await reader.inspect();return reader;
    }catch(e){zip.close();throw e;}
  }
  close(){this.zip.close();}
  info(){return {...this.metadata,usageConfirmed:this.options.usageConfirmed??process.env.TPK_USAGE_CONFIRMED==='true'};}
  private entry(name:string){return this.entries.get(name.toLowerCase());}
  private async stream(entry:Entry){return new Promise<NodeJS.ReadableStream>((ok,fail)=>this.zip.openReadStream(entry,(e,s)=>e?fail(e):ok(s!)));}
  private async text(entry:Entry){
    if(entry.uncompressedSize>2*1024*1024)throw new TileError('Metadata exceeds 2 MiB');
    const chunks:Buffer[]=[];let length=0;
    for await(const chunk of await this.stream(entry) as AsyncIterable<Buffer>){length+=chunk.length;if(length>2*1024*1024)throw new TileError('Metadata too large');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);if(crc32(bytes)!==entry.crc32)throw new TileError('Metadata CRC mismatch');return bytes.toString('utf8');
  }
  private async inspect(){
    const configs=[...this.entries].filter(([key])=>key.endsWith('/conf.xml')||key==='conf.xml');
    if(configs.length!==1)throw new TileError('Expected one conf.xml. TPKX/JSON-only or multiple caches require separate inspection.');
    const [key,entry]=configs[0];this.prefix=key.slice(0,-'conf.xml'.length);
    const parser=new XMLParser({ignoreAttributes:false,removeNSPrefix:true,processEntities:false});
    const config=parser.parse(await this.text(entry));const tile=find(config,'TileCacheInfo');
    if(!tile)throw new TileError('TileCacheInfo is missing');
    const wkid=numeric(find(tile.SpatialReference,'LatestWKID')??find(tile.SpatialReference,'WKID'));
    if(![3857,102100,102113].includes(wkid))throw new TileError('Only EPSG:3857 cache is supported');
    const size=numeric(tile.TileCols);if(size!==256||numeric(tile.TileRows)!==256)throw new TileError('Only 256px square tiles are currently supported');
    if(Math.abs(numeric(tile.TileOrigin.X)+WORLD)>1||Math.abs(numeric(tile.TileOrigin.Y)-WORLD)>1)throw new TileError('Nonstandard tile origin; XYZ conversion is not safe');
    const storage=String(find(config,'StorageFormat'));this.version=storage.endsWith('CompactV2')?2:storage.endsWith('Compact')?1:(()=>{throw new TileError('Unsupported cache storage format');})();
    if(numeric(find(config,'PacketSize'))!==128)throw new TileError('Only 128x128 bundles supported');
    const present=new Set<number>();
    for(const name of this.entries.keys()){
      if(!name.startsWith(this.prefix+'_alllayers/'))continue;
      const match=name.match(/\/l(\d+)\/r[0-9a-f]+c[0-9a-f]+\.bundle$/);if(match)present.add(Number(match[1]));
    }
    for(const lod of array(tile.LODInfos?.LODInfo)){
      if(!lod)continue;const level=numeric(lod.LevelID),resolution=numeric(lod.Resolution),zoom=Math.round(Math.log2(RESOLUTION/resolution));
      if(!Number.isInteger(level)||level<0||resolution<=0)throw new TileError('Invalid LOD metadata');
      if(zoom<0||zoom>24||Math.abs(resolution-RESOLUTION/2**zoom)>resolution*1e-5)throw new TileError('LOD resolution is not an XYZ zoom level');
      if(present.has(level)){if(this.levels.has(zoom))throw new TileError('Duplicate XYZ zoom mapping');this.levels.set(zoom,level);}
    }
    const zoomLevels=[...this.levels.keys()].sort((a,b)=>a-b);if(!zoomLevels.length)throw new TileError('No supported bundle levels');
    const cdi=this.entry(this.prefix+'conf.cdi');if(!cdi)throw new TileError('conf.cdi bounds are missing; inspect package manually');
    const envelope=parser.parse(await this.text(cdi));
    const xmin=numeric(find(envelope,'XMin')),xmax=numeric(find(envelope,'XMax')),ymin=numeric(find(envelope,'YMin')),ymax=numeric(find(envelope,'YMax'));
    if(xmin>=xmax||ymin>=ymax||Math.max(Math.abs(xmin),Math.abs(xmax),Math.abs(ymin),Math.abs(ymax))>WORLD+1)throw new TileError('Invalid Web Mercator bounds');
    const lat=(y:number)=>Math.atan(Math.sinh(y/WORLD*Math.PI))*180/Math.PI;
    const extentWkid=find(envelope,'LatestWKID')??find(envelope,'WKID');
    if(extentWkid!==undefined&&![4326,3857,102100,102113].includes(Number(extentWkid)))throw new TileError('Unsupported extent spatial reference');
    const bounds=Number(extentWkid)===4326?{west:xmin,east:xmax,south:ymin,north:ymax}:{west:xmin/WORLD*180,east:xmax/WORLD*180,south:lat(ymin),north:lat(ymax)};
    if(bounds.west< -180||bounds.east>180||bounds.south< -85.052||bounds.north>85.052)throw new TileError('Invalid geographic extent');
    const desired=mapConfig.center;
    const center:[number,number]=desired[0]>=bounds.south&&desired[0]<=bounds.north&&desired[1]>=bounds.west&&desired[1]<=bounds.east?desired:[(bounds.south+bounds.north)/2,(bounds.west+bounds.east)/2];
    const item=[...this.entries].find(([n])=>n.endsWith('/iteminfo.xml'));
    const itemInfo=item?parser.parse(await this.text(item[1])):null;
    this.metadata={revision:this.identity,center,bounds,minZoom:zoomLevels[0],maxZoom:zoomLevels.at(-1)!,zoom:zoomLevels.reduce((a,b)=>Math.abs(b-mapConfig.zoom)<Math.abs(a-mapConfig.zoom)?b:a),zoomLevels,
      projection:'EPSG:3857',tileSize:size,source:String((itemInfo&&find(itemInfo,'title'))||'Local raster TPK'),attribution:String((itemInfo&&find(itemInfo,'accessInformation'))||'Local TPK · see package licence'),format:String(find(config,'CacheTileFormat')),
      storage,packageVersion:String((itemInfo&&find(itemInfo,'version'))||this.prefix.match(/v\d+/)?.[0]||'Not declared in metadata'),
      licenseNotice:itemInfo?String(find(itemInfo,'licenseInfo')||'No explicit usage terms found in item metadata'):'No item license metadata present',usageConfirmed:false,archive:{entries:this.entries.size,bundles:[...this.entries.keys()].filter(name=>name.endsWith('.bundle')).length,zipMethods:[...new Set([...this.entries.values()].filter(entry=>entry.fileName.toLowerCase().endsWith('.bundle')).map(entry=>entry.compressionMethod))],packetSize:128,indexOrder:this.version===1?'column-major':'row-major'}};
  }
  private async location(entry:Entry){
    const key=entry.fileName;let offset=this.localOffsets.get(key);
    if(offset===undefined){const header=await readAt(this.path,entry.relativeOffsetOfLocalHeader,30);
      if(header.readUInt32LE(0)!==0x04034b50)throw new TileError('Invalid ZIP local header');
      offset=entry.relativeOffsetOfLocalHeader+30+header.readUInt16LE(26)+header.readUInt16LE(28);this.localOffsets.set(key,offset);}
    return offset;
  }
  private async materialize(entry:Entry){
    const key=entry.fileName;let task=this.pending.get(key);if(task)return task;
    task=(async()=>{
      if(entry.uncompressedSize>512*1024*1024)throw new TileError('Compressed bundle exceeds 512 MiB cache limit; inspect/convert externally');
      const directory=join(this.cache,this.identity);await mkdir(directory,{recursive:true});
      const target=join(directory,createHash('sha256').update(key).digest('hex'));
      try{if((await stat(target)).size===entry.uncompressedSize)return target;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
      const partial=target+'.part';let count=0,crc=0;
      const validate=new Transform({transform(chunk:Buffer,_encoding,callback){count+=chunk.length;crc=crc32(chunk,crc);callback(count>entry.uncompressedSize?new TileError('Archive size mismatch'):null,chunk);}});
      try{await pipeline(await this.stream(entry) as import('node:stream').Readable,validate,createWriteStream(partial,{mode:0o600}));
        if(count!==entry.uncompressedSize||crc!==entry.crc32)throw new TileError('Bundle CRC/size mismatch');await rename(partial,target);return target;
      }finally{await rm(partial,{force:true});}
    })();this.pending.set(key,task);try{return await task;}finally{this.pending.delete(key);}
  }
  private async range(entry:Entry,offset:number,length:number){
    if(offset<0||length<0||offset+length>entry.uncompressedSize)throw new TileError('Invalid bundle offset/size');
    if(entry.generalPurposeBitFlag&1)throw new TileError('Encrypted TPK is not supported');
    if(entry.compressionMethod===0)return readAt(this.path,(await this.location(entry))+offset,length);
    if(entry.compressionMethod!==8)throw new TileError('Unsupported ZIP compression');
    return readAt(await this.materialize(entry),offset,length);
  }
  async tile(z:number,x:number,y:number){
    if(!this.info().usageConfirmed)throw new TileError('Confirm permitted local TPK web use before serving imagery (TPK_USAGE_CONFIRMED=true for single TPK, usageConfirmed=true per catalog source)',403);
    const key=`${z}/${x}/${y}`,cached=this.memory.get(key);if(cached){this.memory.delete(key);this.memory.set(key,cached);return cached;}
    const existing=this.tilesPending.get(key);if(existing)return existing;
    if(this.tilesPending.size>=512)throw new TileError('Tile queue busy; retry shortly',429);
    const task=(async()=>{
      if(this.running>=32)await new Promise<void>(resolve=>this.waiters.push(resolve));
      else this.running++;
      try{return await this.readTile(z,x,y);}finally{const next=this.waiters.shift();if(next)next();else this.running--;}
    })().then(tile=>{
      const memoryLimit=this.options.memoryLimitBytes??32*1024*1024;
      if(tile&&tile.bytes.length<=Math.min(8*1024*1024,memoryLimit)){while(this.memoryBytes+tile.bytes.length>memoryLimit||this.memory.size>=256){const first=this.memory.keys().next().value;if(first===undefined)break;this.memoryBytes-=this.memory.get(first)!.bytes.length;this.memory.delete(first);}this.memory.set(key,tile);this.memoryBytes+=tile.bytes.length;}
      return tile;
    });this.tilesPending.set(key,task);try{return await task;}finally{this.tilesPending.delete(key);}
  }
  private async readTile(z:number,x:number,y:number){
    const level=this.levels.get(z);if(level===undefined)return null;
    const west=x/2**z*360-180,east=(x+1)/2**z*360-180;
    const latitude=(row:number)=>Math.atan(Math.sinh(Math.PI*(1-2*row/2**z)))*180/Math.PI;
    const b=this.metadata.bounds;if(east<=b.west||west>=b.east||latitude(y)<=b.south||latitude(y+1)>=b.north)return null;
    const row=Math.floor(y/128)*128,col=Math.floor(x/128)*128;
    const base=`${this.prefix}_alllayers/l${String(level).padStart(2,'0')}/r${row.toString(16).padStart(4,'0')}c${col.toString(16).padStart(4,'0')}`;
    const bundle=this.entry(base+'.bundle');if(!bundle)return null;
    const index=bundleIndex(this.version,y%128,x%128);let offset:number,length:number;
    const indexKey=base;let table=this.indexes.get(indexKey);
    if(!table){
      let loading=this.indexPending.get(indexKey);
      if(!loading){loading=(async()=>{
        if(this.version===2){
          const data=await this.range(bundle,0,64+16384*8);
          if(data.readUInt32LE(0)!==3||data.readUInt32LE(4)!==16384)throw new TileError('Invalid Compact V2 header');return data;
        }
        const bundlx=this.entry(base+'.bundlx');if(!bundlx)throw new TileError('Compact V1 .bundlx missing');
        return this.range(bundlx,0,16+16384*5);
      })();this.indexPending.set(indexKey,loading);}
      try{table=await loading;if(this.indexes.size>=16)this.indexes.delete(this.indexes.keys().next().value!);this.indexes.set(indexKey,table);}
      finally{this.indexPending.delete(indexKey);}
    }
    if(this.version===2){
      const value=table.readBigUInt64LE(64+index*8);offset=Number(value&0xffffffffffn);length=Number(value>>40n);
      if(!length)return null;if(offset<64+16384*8)throw new TileError('Tile points into index');
    }else{
      offset=table.readUIntLE(16+index*5,5);if(!offset)return null;
      length=(await this.range(bundle,offset,4)).readUInt32LE();offset+=4;if(!length)return null;
    }
    if(length>20*1024*1024)throw new TileError('Tile exceeds 20 MiB limit');
    const bytes=await this.range(bundle,offset,length);return {bytes,mime:imageType(bytes),etag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};
  }
}

let active:{fingerprint:string;reader:Promise<Tpk>}|undefined;let checked=0;
export async function getTpk(){
  if(active&&Date.now()-checked<1000)return active.reader;
  const path=resolve(/*turbopackIgnore: true*/ process.env.TPK_PATH||'data/tpk/map.tpk');let file;
  try{file=await stat(path);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')throw new TileError('TPK file missing. Place it at data/tpk/map.tpk or configure TPK_PATH.',503);throw e;}
  checked=Date.now();
  const fingerprint=`${path}:${file.size}:${file.mtimeMs}:${file.ctimeMs}`;
  if(active&&active.fingerprint!==fingerprint)throw new TileError('TPK changed while running; restart the server before using the replacement.',503);
  if(!active){const reader=Tpk.load(path,resolve(/*turbopackIgnore: true*/ process.env.TPK_CACHE_DIR||'.cache/tpk'));active={fingerprint,reader};reader.catch(()=>{active=undefined;});}
  return active.reader;
}
