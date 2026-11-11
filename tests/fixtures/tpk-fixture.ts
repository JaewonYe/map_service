/** Self-generated synthetic pixels and metadata, CC0. No Esri imagery. */
import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {crc32,deflateRawSync,deflateSync} from 'node:zlib';
export const center=[36.597889,126.240136];
export function coordinate(z:number){return {x:Math.floor((center[1]+180)/360*2**z),y:Math.floor((1-Math.asinh(Math.tan(center[0]*Math.PI/180))/Math.PI)/2*2**z)};}
export function png(){
  const chunk=(name:string,data:Buffer)=>{const header=Buffer.alloc(8),tail=Buffer.alloc(4);header.writeUInt32BE(data.length);header.write(name,4);tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(name),data])));return Buffer.concat([header,data,tail]);};
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(256);ihdr.writeUInt32BE(256,4);ihdr[8]=8;ihdr[9]=2;
  const rows=Buffer.alloc(256*(1+256*3));for(let y=0;y<256;y++)for(let x=0;x<256;x++){const p=y*(1+768)+1+x*3;rows[p]=45;rows[p+1]=125;rows[p+2]=75;}
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export function zip(files:Array<{name:string;bytes:Buffer}>,compressed=false){
  const records:Buffer[]=[],central:Buffer[]=[];let offset=0;
  for(const file of files){
    const name=Buffer.from(file.name),data=compressed?deflateRawSync(file.bytes):file.bytes,crc=crc32(file.bytes);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(compressed?8:0,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(file.bytes.length,22);header.writeUInt16LE(name.length,26);
    const record=Buffer.concat([header,name,data]);records.push(record);
    const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(compressed?8:0,10);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(file.bytes.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);central.push(Buffer.concat([directory,name]));offset+=record.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...records,directory,end]);
}
export async function makeTpk(directory:string,version:1|2=2,compressed=false,badOffset=false){
  await mkdir(directory,{recursive:true});const jpeg=await readFile(new URL('./satellite.jpg',import.meta.url));const picture=png();
  const files:Array<{name:string;bytes:Buffer}>=[];
  const lods=[15,16,17].map((z,i)=>`<LODInfo><LevelID>${i}</LevelID><Resolution>${156543.03392804097/2**z}</Resolution></LODInfo>`).join('');
  files.push({name:'v101/Layers/conf.xml',bytes:Buffer.from(`<CacheInfo><TileCacheInfo><SpatialReference><WKID>102100</WKID></SpatialReference><TileOrigin><X>-20037508.342789244</X><Y>20037508.342789244</Y></TileOrigin><TileCols>256</TileCols><TileRows>256</TileRows><LODInfos>${lods}</LODInfos></TileCacheInfo><CacheImageInfo><CacheTileFormat>MIXED</CacheTileFormat></CacheImageInfo><CacheStorageInfo><StorageFormat>esriMapCacheStorageModeCompact${version===2?'V2':''}</StorageFormat><PacketSize>128</PacketSize></CacheStorageInfo></CacheInfo>`)});
  files.push({name:'v101/Layers/conf.cdi',bytes:Buffer.from('<EnvelopeN><XMin>14051896.830</XMin><YMin>4381437.173</YMin><XMax>14054078.450</XMax><YMax>4384973.002</YMax></EnvelopeN>')});
  files.push({name:'esriinfo/iteminfo.xml',bytes:Buffer.from('<ESRI_ItemInformation><version>1.0-synthetic</version><licenseInfo>CC0 synthetic pixels; not real satellite imagery</licenseInfo></ESRI_ItemInformation>')});
  for(const [level,z] of [15,16,17].entries()){
    const {x,y}=coordinate(z),row=Math.floor(y/128)*128,col=Math.floor(x/128)*128;
    const stem=`v101/Layers/_alllayers/L${String(level).padStart(2,'0')}/R${row.toString(16).padStart(4,'0')}C${col.toString(16).padStart(4,'0')}`;
    const header=Buffer.alloc(version===2?64+16384*8:64);header.writeUInt32LE(3);header.writeUInt32LE(16384,4);
    const bundlx=Buffer.alloc(16+16384*5+16);let offset=header.length;const parts:Buffer[]=[header];
    for(const [dx,dy,bytes] of [[0,0,jpeg],[1,1,picture]] as Array<[number,number,Buffer]>){
      const index=version===1?((x+dx)%128)*128+(y+dy)%128:((y+dy)%128)*128+(x+dx)%128;
      const size=Buffer.alloc(4);size.writeUInt32LE(bytes.length);parts.push(size,bytes);
      if(version===2)header.writeBigUInt64LE((BigInt(bytes.length)<<40n)|BigInt(badOffset?header.length+99999999:offset+4),64+index*8);
      else bundlx.writeUIntLE(offset,16+index*5,5);
      offset+=4+bytes.length;
    }
    files.push({name:stem+'.bundle',bytes:Buffer.concat(parts)});if(version===1)files.push({name:stem+'.bundlx',bytes:bundlx});
  }
  const path=join(directory,`synthetic-v${version}${compressed?'-deflated':''}${badOffset?'-bad':''}.tpk`);
  await writeFile(path,zip(files,compressed));return {path,jpeg,png:picture};
}
