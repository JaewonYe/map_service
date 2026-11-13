/** Synthetic CC0 height field, not terrain data for Taean. */
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';
import {tileBounds} from '../../lib/tiles/catalog';
import {coordinate,center} from './tpk-fixture';
import {pixelAt} from '../../lib/maps/elevation';
import type {ElevationMetadata} from '../../lib/maps/types';
export async function makeElevation(directory:string,usageConfirmed=true){
  const m:ElevationMetadata={version:1,projection:'EPSG:3857',tileSize:256,encoding:'terrarium',units:'m',
    bounds:tileBounds(15,coordinate(15).x,coordinate(15).y),minZoom:15,maxZoom:17,minElevation:-12.5,maxElevation:500,
    source:'CC0 synthetic DEM',attribution:'CC0 synthetic fixture',verticalDatum:'Synthetic test datum',usageConfirmed,tiles:'sets/synthetic'};
  for(const z of [15,16,17]){
    const {x,y,px,py}=pixelAt(center[0],center[1],z);
    const raw=Buffer.alloc(256*256*4);
    for(let i=0;i<256*256;i++){
      const height=i%256<128?-12.5:0;
      const encoded=Math.round((height+32768)*256);
      raw[i*4]=encoded>>16;raw[i*4+1]=(encoded>>8)&255;raw[i*4+2]=encoded&255;raw[i*4+3]=255;
    }
    // The map's initial centre has a known, exact altitude.
    const offset=(py*256+px)*4,encoded=Math.round((123.5+32768)*256);
    raw[offset]=encoded>>16;raw[offset+1]=(encoded>>8)&255;raw[offset+2]=encoded&255;
    raw[3]=0; // A NoData pixel must not be confused with zero metres.
    const height=await sharp(raw,{raw:{width:256,height:256,channels:4}}).png().toBuffer();
    const color=await sharp({create:{width:256,height:256,channels:4,background:{r:218,g:193,b:123,alpha:1}}}).png().toBuffer();
    for(const [kind,bytes] of [['height',height],['color',color]] as const){
      const folder=join(directory,m.tiles,kind,String(z),String(x));await mkdir(folder,{recursive:true});await writeFile(join(folder,`${y}.png`),bytes);
    }
  }
  await writeFile(join(directory,'metadata.json'),JSON.stringify(m));
  return m;
}
