import {readFile,realpath,stat} from 'node:fs/promises';
import {managedDirectory} from '../downloads/active';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {DatabaseSync,type StatementSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {getOsmEdits,type EditSnapshot} from './edit-store';
import {classes,transformGeometry,unproject,project,validateObject,intersectsBounds,minzoom,type MapObject,type ObjectValue,OsmEditError} from './edit-model';
import {TileError,xyz,type Bounds} from '../tiles/tpk';
import {tileBounds} from '../tiles/catalog';
import {renderSvg,mercatorBounds,type Feature} from './render';
export type OsmMetadata={version:1;type:'osm-sqlite';database:string;bounds:Bounds;minZoom:0;maxZoom:19;
  usageConfirmed:boolean;attribution:string;coastlineFill:boolean;featureCount:number};
export class OsmIndex{
  private query:StatementSync;
  private overview:StatementSync;
  private memory=new Map<string,{bytes:Buffer;mime:string;etag:string}>();
  private memoryBytes=0;
  private pending=new Map<string,Promise<{bytes:Buffer;mime:string;etag:string}|null>>();
  private running=0;
  private waiters:Array<()=>void>=[];
  private closed=false;
  private constructor(private db:DatabaseSync,readonly metadata:OsmMetadata,readonly revision:string,readonly schemaVersion:number){
    db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=2000; PRAGMA trusted_schema=OFF;');
    const select=`SELECT f.id,f.kind,f.class,f.name,
      CASE WHEN ?<=7 THEN f.g0 WHEN ?<=10 THEN f.g1 WHEN ?<=13 THEN f.g2 ELSE f.g3 END AS geometry${this.schemaVersion===2?',f.source_key,f.fingerprint,f.readonly_reason':''}`;
    const where=`WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=? AND r.minz<=? AND r.maxz>=? AND f.minzoom<=?
      ORDER BY f.minzoom,f.id LIMIT 12001`;
    // Wide views start with the zoom B-tree; detailed views start with the spatial R-tree.
    this.query=db.prepare(`${select} FROM feature_index r CROSS JOIN features f ON f.id=r.id ${where}`);
    this.overview=db.prepare(`${select} FROM features f INDEXED BY features_zoom CROSS JOIN feature_index r ON f.id=r.id ${where}`);
  }
  static async load(directory:string){
    const root=await realpath(/*turbopackIgnore: true*/ directory);
    const metadataFile=await realpath(/*turbopackIgnore: true*/ join(root,'metadata.json'));
    if(relative(root,metadataFile).startsWith('..'))throw new TileError('OSM metadata must remain inside its data folder');
    if((await stat(/*turbopackIgnore: true*/ metadataFile)).size>65536)throw new TileError('OSM metadata exceeds 64 KiB');
    const text=await readFile(/*turbopackIgnore: true*/ metadataFile,'utf8');
    let m:OsmMetadata;
    try{m=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw new TileError('Invalid JSON in OSM metadata');}
    const b=m?.bounds;
    if(m?.version!==1||m.type!=='osm-sqlite'||m.minZoom!==0||m.maxZoom!==19||typeof m.usageConfirmed!=='boolean'||
      typeof m.attribution!=='string'||m.attribution.length>1000||typeof m.coastlineFill!=='boolean'||
      !Number.isInteger(m.featureCount)||m.featureCount<1||!b||![b.south,b.north,b.west,b.east].every(Number.isFinite)||
      b.south>=b.north||b.west>=b.east||b.south< -85.05113||b.north>85.05113||b.west< -180||b.east>180||
      typeof m.database!=='string'||!/^sets\/[a-zA-Z0-9_-]+\/map\.sqlite$/.test(m.database))throw new TileError('Invalid prepared OSM metadata');
    if(!m.usageConfirmed)throw new TileError('OSM dataset usage is not confirmed',403);
    const filename=await realpath(/*turbopackIgnore: true*/ join(root,m.database));
    const rel=relative(root,filename);if(rel.startsWith('..')||isAbsolute(rel))throw new TileError('OSM index must remain inside its data folder');
    const db=new DatabaseSync(/*turbopackIgnore: true*/ filename,{readOnly:true,allowExtension:false});
    try{
      const version=(db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version;
      if(![1,2].includes(version))throw new TileError('Unsupported OSM index version');
      return new OsmIndex(db,m,createHash('sha256').update(text).digest('hex'),version);
    }catch(error){db.close();throw error;}
  }
  object(row:any):MapObject {
    let geometry=null,reason=row.readonly_reason||'';
    try{const raw=JSON.parse(row.geometry||row.g3);if(!['Point','LineString','Polygon'].includes(raw.type)||raw.type==='Polygon'&&raw.coordinates.length!==1)throw Error();
      if(JSON.stringify(raw).length>32768)throw Error();geometry=transformGeometry(raw,unproject);
      validateObject({kind:row.kind,class:row.class,name:row.name,geometry},this.metadata.bounds);
    }catch{reason ||= '지원하지 않는 형상/분류·대형 객체는 읽기 전용입니다.';}
    if(this.schemaVersion===1)reason='구형 schema1 지도는 조회만 가능합니다. 원본 PBF를 prepare-osm --force로 다시 준비하세요.';
    else if(!row.source_key||row.source_key.startsWith('relation:'))reason ||= '원본 식별 불가·관계·파생 객체는 읽기 전용입니다.';
    else if((this.db.prepare('SELECT count(*) AS n FROM features WHERE source_key=?').get(row.source_key) as any).n!==1)reason='분할되거나 중복 식별된 객체는 읽기 전용입니다.';
    return {key:row.source_key||`legacy:${row.id}`,name:row.name,kind:row.kind,class:row.class,geometry,fingerprint:row.fingerprint||null,editable:!reason,reason:reason||undefined,source:'base',state:'original'};
  }
  private get objectColumns(){return `f.id,f.kind,f.class,f.name,f.minzoom,CASE WHEN length(f.g3)<=32768 THEN f.g3 ELSE NULL END AS g3${this.schemaVersion===2?',f.source_key,f.fingerprint,f.readonly_reason':''}`;}
  source(key:string):MapObject|null {
    const row=key.startsWith('legacy:')?this.db.prepare(`SELECT ${this.objectColumns} FROM features f WHERE f.id=?`).get(Number(key.slice(7))):this.schemaVersion===2?this.db.prepare(`SELECT ${this.objectColumns} FROM features f WHERE f.source_key=? LIMIT 1`).get(key):null;
    return row?this.object(row):null;
  }
  objects(bounds:Bounds,zoom:number):MapObject[]{
    const a=mercatorBounds(bounds),rows=this.db.prepare(`SELECT ${this.objectColumns} FROM feature_index r JOIN features f ON f.id=r.id WHERE r.minx<=? AND r.maxx>=? AND r.miny<=? AND r.maxy>=? AND f.minzoom<=? ORDER BY f.id LIMIT 201`).all(a.maxx,a.minx,a.maxy,a.miny,zoom);
    if(rows.length>200)throw new OsmEditError('객체가 너무 많습니다. 확대하거나 조회 범위를 줄이세요.',422);
    return rows.map(row=>this.object(row));
  }
  reconcile(snapshot:EditSnapshot){
    return snapshot.edits.map(edit=>{
      const base=edit.action==='add'?null:this.source(edit.key);
      const conflict=edit.action!=='add'&&(!base||!base.editable||base.fingerprint!==edit.baseFingerprint);
      const object:MapObject={...edit.value,key:edit.key,fingerprint:edit.baseFingerprint,editable:!conflict,source:edit.action==='add'?'local':'base',state:conflict?'conflict':edit.action==='hide'?'hidden':'modified',reason:conflict?'원본이 변경·삭제되었거나 식별/편집할 수 없습니다. 수정 기록은 보존됩니다.':undefined};
      // New base bounds can shrink; never apply an out-of-scope local geometry silently.
      try{validateObject(edit.value,this.metadata.bounds);}catch{object.state='conflict';object.editable=false;object.reason='새 원본의 편집 범위/분류와 맞지 않는 로컬 수정입니다.';}
      return {edit,base,object};
    });
  }
  close(){if(this.closed)return;this.closed=true;if(!this.pending.size)this.db.close();}
  async tile(z:number,x:number,y:number){
    xyz(String(z),String(x),String(y));
    if(this.closed)throw new TileError('OSM dataset changed; reload the page',503);
    const b=this.metadata.bounds,a=tileBounds(z,x,y);
    if(z>19||a.west>=b.east||a.east<=b.west||a.south>=b.north||a.north<=b.south)return null;
    const snapshot=await getOsmEdits().read();
    if(this.closed)throw new TileError('OSM dataset changed while loading edits; reload the page',503);
    const key=`${this.revision}:${snapshot.revision}:${z}/${x}/${y}`,hit=this.memory.get(key);
    if(hit){this.memory.delete(key);this.memory.set(key,hit);return hit;}
    const pending=this.pending.get(key);if(pending)return pending;
    if(this.pending.size>=256)throw new TileError('OSM renderer busy; retry shortly',429);
    const task=(async()=>{
      if(this.running>=8)await new Promise<void>(done=>this.waiters.push(done));else this.running++;
      try{
      const area=mercatorBounds(a),padding=(area.maxx-area.minx)/256*128;
      let features=(z<=7?this.overview:this.query).all(z,z,z,area.maxx+padding,area.minx-padding,area.maxy+padding,area.miny-padding,z,z,z) as unknown as Feature[];
      if(features.length>12000)throw new TileError('OSM tile is too dense. Zoom in to inspect this area.',422);
      const edits=this.reconcile(snapshot).filter(item=>item.object.state!=='conflict');
      const changed=new Set(edits.map(item=>item.edit.key));
      features=features.filter((f:any)=>!changed.has(f.source_key));
      for(const [i,{edit}] of edits.entries()){
        const value=edit.value;if(edit.action==='hide'||minzoom(value)>z)continue;
        const paddingBounds={west:a.west-(a.east-a.west)*.5,east:a.east+(a.east-a.west)*.5,south:a.south-(a.north-a.south)*.5,north:a.north+(a.north-a.south)*.5};
        if(intersectsBounds(value.geometry,paddingBounds))features.push({id:-i-1,kind:value.kind,class:value.class,name:value.name,geometry:JSON.stringify(transformGeometry(value.geometry,project))});
      }
      const svg=renderSvg(features,z,x,y,this.metadata.coastlineFill);
      if(Buffer.byteLength(svg)>8*1024*1024)throw new TileError('OSM tile geometry is too large. Zoom in.',422);
      const bytes=await sharp(Buffer.from(svg),{limitInputPixels:65536}).png().toBuffer();
      const tile={bytes,mime:'image/png',etag:'"'+createHash('sha256').update(bytes).digest('hex')+'"'};
      while(this.memoryBytes+bytes.length>32*1024*1024||this.memory.size>=256){const first=this.memory.keys().next().value!;this.memoryBytes-=this.memory.get(first)!.bytes.length;this.memory.delete(first);}
      this.memory.set(key,tile);this.memoryBytes+=bytes.length;return tile;
      }finally{const next=this.waiters.shift();if(next)next();else this.running--;}
    })();
    this.pending.set(key,task);
    try{return await task;}finally{this.pending.delete(key);if(this.closed&&!this.pending.size)this.db.close();}
  }
}
let active:{directory:string;stamp:string;time:number;reader:OsmIndex}|undefined;
let loading:Promise<OsmIndex>|undefined;
export async function getOsmIndex(force=false){
  const directory=await managedDirectory('osm')||resolve(/*turbopackIgnore: true*/ process.env.OSM_TILE_DIR||'data/osm');
  if(!force&&active?.directory===directory&&Date.now()-active.time<1000)return active.reader;
  const details=await stat(/*turbopackIgnore: true*/ join(directory,'metadata.json'));
  const stamp=`${details.size}:${details.mtimeMs}:${details.ctimeMs}`;
  if(active?.directory===directory&&active.stamp===stamp){active.time=Date.now();return active.reader;}
  if(!loading)loading=OsmIndex.load(directory).then(reader=>{active?.reader.close();active={directory,stamp,time:Date.now(),reader};return reader;});
  try{return await loading;}finally{loading=undefined;}
}
