import {readFile, realpath, stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute, relative, resolve, win32, join} from 'node:path';
import sharp from 'sharp';
import {TileError, xyz} from '../tiles/tpk';
import {tileBounds} from '../tiles/catalog';
import type {ElevationMetadata, LayerInfo} from './types';

export function decodeHeight(r: number, g: number, b: number) { return r * 256 + g + b / 256 - 32768; }
export function pixelAt(lat: number, lon: number, z: number) {
  const n = 256 * 2 ** z;
  const x = Math.min(n - 1, Math.max(0, Math.floor((lon + 180) / 360 * n)));
  const y = Math.min(n - 1, Math.max(0, Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * n)));
  return {x: Math.floor(x / 256), y: Math.floor(y / 256), px: x % 256, py: y % 256};
}
function validate(input: unknown): ElevationMetadata {
  const m = input as ElevationMetadata, b = m?.bounds;
  if (m?.version !== 1 || m.projection !== 'EPSG:3857' || m.tileSize !== 256 || m.encoding !== 'terrarium' || m.units !== 'm' ||
      !b || ![b.south,b.north,b.west,b.east].every(Number.isFinite) || b.south >= b.north || b.west >= b.east ||
      b.south < -85.05113 || b.north > 85.05113 || b.west < -180 || b.east > 180 ||
      !Number.isInteger(m.minZoom) || !Number.isInteger(m.maxZoom) || m.minZoom < 0 || m.minZoom > m.maxZoom || m.maxZoom > 19 ||
      !Number.isFinite(m.minElevation) || !Number.isFinite(m.maxElevation) || m.minElevation > m.maxElevation ||
      typeof m.usageConfirmed !== 'boolean' || ![m.source,m.attribution,m.verticalDatum].every(v => typeof v === 'string' && v.length <= 1000) ||
      typeof m.tiles !== 'string' || isAbsolute(m.tiles) || win32.isAbsolute(m.tiles) ||
      !/^[a-zA-Z0-9_/-]+$/.test(m.tiles) || m.tiles.split('/').some(v => !v || v === '.' || v === '..')) {
    throw new TileError('Invalid elevation metadata.json; prepare a DEM with scripts/elevation/prepare.py');
  }
  return m;
}
/** Immutable, versioned XYZ dataset. Only metadata is read before permission confirmation. */
export class Elevation {
  private cache = new Map<string, Buffer>();
  private size = 0;
  private running = 0;
  private sampling = 0;
  private root?: string;
  private constructor(readonly directory: string, readonly metadata: ElevationMetadata, readonly revision: string) {}
  static async load(directory: string) {
    const root = await realpath(/*turbopackIgnore: true*/ directory);
    const filename = await realpath(/*turbopackIgnore: true*/ join(root,'metadata.json'));
    if (relative(root,filename).startsWith('..')) throw new TileError('Elevation metadata must remain inside its data directory');
    if ((await stat(/*turbopackIgnore: true*/ filename)).size > 65536) throw new TileError('Elevation metadata exceeds 64 KiB');
    const bytes = await readFile(/*turbopackIgnore: true*/ filename);
    let input: unknown;
    try { input = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,'')); }
    catch { throw new TileError('Invalid JSON in elevation metadata'); }
    return new Elevation(root, validate(input), createHash('sha256').update(bytes).digest('hex'));
  }
  info(): LayerInfo {
    const m = this.metadata;
    return {available:m.usageConfirmed,reason:m.usageConfirmed?undefined:'DEM 사용 권한을 확인하고 변환해야 합니다.',
      url:'/api/elevation/tiles/{z}/{x}/{y}',revision:this.revision,bounds:m.bounds,
      minNativeZoom:m.minZoom,maxNativeZoom:m.maxZoom,attribution:m.attribution,
      minElevation:m.minElevation,maxElevation:m.maxElevation,verticalDatum:m.verticalDatum};
  }
  private async read(kind: 'color' | 'height', z: number, x: number, y: number) {
    xyz(String(z),String(x),String(y));
    if (!this.metadata.usageConfirmed) throw new TileError('DEM local web usage permission is not confirmed',403);
    if (z < this.metadata.minZoom || z > this.metadata.maxZoom) return null;
    const b = this.metadata.bounds, area = tileBounds(z,x,y);
    if (area.west >= b.east || area.east <= b.west || area.south >= b.north || area.north <= b.south) return null;
    const key = `${kind}/${z}/${x}/${y}`;
    const hit = this.cache.get(key);
    if (hit) { this.cache.delete(key); this.cache.set(key,hit); return hit; }
    if (this.running >= 16) throw new TileError('Elevation tile service busy; retry shortly',429);
    this.running++;
    try {
      this.root ??= await realpath(/*turbopackIgnore: true*/ join(this.directory,this.metadata.tiles));
      const rootRel = relative(this.directory,this.root);
      if (rootRel.startsWith('..') || isAbsolute(rootRel)) throw new TileError('Elevation tiles must remain inside their data directory');
      const path = await realpath(/*turbopackIgnore: true*/ join(this.root,kind,String(z),String(x),`${y}.png`));
      const rel = relative(this.root,path);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new TileError('Elevation tile path escapes its data directory');
      if ((await stat(/*turbopackIgnore: true*/ path)).size > 2 * 1024 * 1024) throw new TileError('Elevation tile too large');
      const bytes = await readFile(/*turbopackIgnore: true*/ path);
      const image = await sharp(bytes,{limitInputPixels:65536}).metadata();
      if (image.format !== 'png' || image.width !== 256 || image.height !== 256 || !image.hasAlpha || image.channels !== 4 || image.depth !== 'uchar') throw new TileError('Expected a 256px RGBA elevation PNG');
      while (this.size + bytes.length > 32 * 1024 * 1024 || this.cache.size >= 256) {
        const first = this.cache.keys().next().value!; this.size -= this.cache.get(first)!.length; this.cache.delete(first);
      }
      // Another request may have filled this key while I/O was in flight.
      this.size -= this.cache.get(key)?.length || 0;
      this.cache.set(key,bytes); this.size += bytes.length;
      return bytes;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    finally { this.running--; }
  }
  tile(z: number,x: number,y: number) { return this.read('color',z,x,y); }
  async sample(lat: number, lon: number) {
    if (this.sampling >= 16) throw new TileError('Elevation sampling busy; retry shortly',429);
    this.sampling++;
    try { return await this.sampleValue(lat,lon); } finally { this.sampling--; }
  }
  private async sampleValue(lat: number, lon: number) {
    if (!this.metadata.usageConfirmed) throw new TileError('DEM local web usage permission is not confirmed',403);
    const b = this.metadata.bounds;
    if (lat < b.south || lat > b.north || lon < b.west || lon > b.east) return {elevationMeters:null,reason:'outside'};
    for (let z = this.metadata.maxZoom; z >= this.metadata.minZoom; z--) {
      const p = pixelAt(lat,lon,z), bytes = await this.read('height',z,p.x,p.y);
      if (!bytes) continue;
      const {data} = await sharp(bytes,{limitInputPixels:65536}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const offset = (p.py * 256 + p.px) * 4;
      // A known NoData pixel must not be substituted with a coarser, potentially misleading value.
      if (!data[offset+3]) return {elevationMeters:null,reason:'nodata'};
      return {elevationMeters:Math.round(decodeHeight(data[offset],data[offset+1],data[offset+2]) * 100) / 100,
        nativeZoom:z,units:'m',verticalDatum:this.metadata.verticalDatum};
    }
    return {elevationMeters:null,reason:'missing'};
  }
}
let current: {key:string;stamp:string;at:number;value:Promise<Elevation>} | undefined;
export async function getElevation() {
  const directory = resolve(/*turbopackIgnore: true*/ process.env.ELEVATION_DIR || 'data/elevation');
  if (current?.key === directory && Date.now() - current.at < 1000) return current.value;
  const details = await stat(/*turbopackIgnore: true*/ join(directory,'metadata.json')).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new TileError('No prepared DEM dataset. Prepare data/elevation/source/dem.tif first.',503);
    throw error;
  });
  const stamp = `${details.size}:${details.mtimeMs}:${details.ctimeMs}`;
  if (current?.key === directory && current.stamp === stamp) { current.at = Date.now(); return current.value; }
  const value = Elevation.load(directory);
  current = {key:directory,stamp,at:Date.now(),value};
  // No unhandled rejection when metadata is missing or invalid.
  value.catch(() => { if (current?.value === value) current = undefined; });
  return value;
}
