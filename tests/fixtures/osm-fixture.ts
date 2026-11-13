/** Synthetic CC0 map geometry. Independent of any third-party imagery or OSM extract. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {WORLD} from '../../lib/osm/render';
export const osmBounds={south:36.57,west:126.20,north:36.63,east:126.28};
export function mercator(lon:number,lat:number){return [lon/180*WORLD,Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))*WORLD/Math.PI];}
export async function makeOsmIndex(directory:string){
  const database='sets/synthetic/map.sqlite';await mkdir(join(directory,'sets/synthetic'),{recursive:true});
  const db=new DatabaseSync(join(directory,database));
  db.exec(await readFile(new URL('../../scripts/osm/schema.sql',import.meta.url),'utf8'));
  const polygon=(west:number,south:number,east:number,north:number)=>({type:'Polygon',coordinates:[[[west,south],[east,south],[east,north],[west,north],[west,south]].map(p=>mercator(p[0],p[1]))]});
  const items=[
    {kind:'land',class:'land',name:'',minzoom:0,g:polygon(126.21,36.575,126.27,36.625)},
    {kind:'green',class:'forest',name:'',minzoom:8,g:polygon(126.235,36.59,126.245,36.61)},
    {kind:'road',class:'primary',name:'CC0 시험도로',minzoom:7,g:{type:'LineString',coordinates:[mercator(126.23,36.595),mercator(126.240136,36.597889),mercator(126.25,36.60)]}},
    {kind:'building',class:'yes',name:'시험 건물',minzoom:15,g:polygon(126.240,36.598,126.2405,36.5984)},
    {kind:'place',class:'town',name:'CC0 태안 시험지명',minzoom:10,g:{type:'Point',coordinates:mercator(126.240136,36.597889)}}
  ];
  for(const [i,item] of items.entries()){
    const raw=JSON.stringify(item.g);db.prepare('INSERT INTO features VALUES(?,?,?,?,?,?,?,?,?)').run(i+1,item.kind,item.class,item.name,item.minzoom,raw,raw,raw,raw);
    const p0=mercator(osmBounds.west,osmBounds.south),p1=mercator(osmBounds.east,osmBounds.north);
    db.prepare('INSERT INTO feature_index VALUES(?,?,?,?,?,?,?)').run(i+1,p0[0],p1[0],p0[1],p1[1],item.minzoom,19);
  }
  db.close();
  const metadata={version:1,type:'osm-sqlite',database,bounds:osmBounds,minZoom:0,maxZoom:19,usageConfirmed:true,
    source:'CC0 synthetic map',attribution:'CC0 synthetic map fixture',license:'CC0-1.0',coastlineFill:true,featureCount:items.length};
  await writeFile(join(directory,'metadata.json'),JSON.stringify(metadata));return metadata;
}
