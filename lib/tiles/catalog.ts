import {createHash} from 'node:crypto';
import {readFile, realpath, stat} from 'node:fs/promises';
import {dirname, isAbsolute, join, relative, resolve, win32} from 'node:path';
import sharp from 'sharp';
import {mapConfig} from '../map-config';
import {Tpk, TileError, type Bounds, type MapInfo} from './tpk';

type Role = 'base' | 'detail';
type SourceConfig = {
  id: string;
  name: string;
  file: string;
  role: Role;
  priority: number;
  minZoom: number;
  maxZoom: number;
  bounds?: Bounds;
  usageConfirmed: boolean;
  enabled: boolean;
};
export type SourceInfo = {
  id: string;
  name: string;
  role: Role;
  priority: number;
  status: 'ready' | 'unavailable' | 'disabled';
  error?: string;
  usageConfirmed: boolean;
  bounds?: Bounds;
  minZoom: number;
  maxZoom: number;
  zoomLevels: number[];
  metadata?: MapInfo;
};
export type CatalogInfo = MapInfo & {
  mode: 'single' | 'multi';
  sources: SourceInfo[];
  warnings: string[];
};
export type CatalogTile = {
  bytes: Buffer;
  mime: string;
  etag: string;
  sourceId: string;
  nativeZoom: number;
  fallback: boolean;
  contributingSources: string[];
};
type LoadedSource = {info: SourceInfo; reader: Tpk};
type Candidate = {source: LoadedSource; zoom: number; x: number; y: number};
type LoadOptions = {configPath?: string; legacyPath?: string; cache?: string};
const DEFAULT_CONFIG = 'maps.json';
const TILE_LIMIT = 32 * 1024 * 1024;

function integer(value: unknown, label: string, min: number, max: number): number {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new TileError(`${label} must be an integer from ${min} to ${max}`);
  }
  return Number(value);
}
function boolean(value: unknown, label: string, fallback: boolean) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new TileError(`${label} must be a JSON boolean`);
  return value;
}
function bounds(value: unknown): Bounds {
  const b = value as Bounds;
  if (!b || ![b.south, b.west, b.north, b.east].every(Number.isFinite) ||
      b.south >= b.north || b.west >= b.east || b.south < -85.05113 ||
      b.north > 85.05113 || b.west < -180 || b.east > 180) {
    throw new TileError('Invalid source bounds');
  }
  return {south: b.south, west: b.west, north: b.north, east: b.east};
}
function overlap(a: Bounds, b: Bounds) {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south;
}
export function tileBounds(z: number, x: number, y: number): Bounds {
  const lat = (row: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * row / 2 ** z))) * 180 / Math.PI;
  return {west: x / 2 ** z * 360 - 180, east: (x + 1) / 2 ** z * 360 - 180,
    north: lat(y), south: lat(y + 1)};
}
function union(values: Bounds[]): Bounds {
  return {south: Math.min(...values.map(b => b.south)), west: Math.min(...values.map(b => b.west)),
    north: Math.max(...values.map(b => b.north)), east: Math.max(...values.map(b => b.east))};
}
async function fingerprint(path: string) {
  try {
    const file = await stat(/*turbopackIgnore: true*/ path);
    return `${file.size}:${file.mtimeMs}:${file.ctimeMs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing';
    throw error;
  }
}
function parseConfig(input: unknown): SourceConfig[] {
  const config = input as {version: unknown; sources: unknown[]};
  if (config?.version !== 1 || !Array.isArray(config.sources) || !config.sources.length || config.sources.length > 32) {
    throw new TileError('maps.json requires version: 1 and 1–32 sources');
  }
  const ids = new Set<string>();
  const result = config.sources.map((value: any): SourceConfig => {
    if (!value || typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(value.id) || ids.has(value.id)) {
      throw new TileError('Source ids must be unique lowercase letters, digits, underscores or hyphens');
    }
    ids.add(value.id);
    if (!['base', 'detail'].includes(value.role)) throw new TileError(`Invalid role for ${value.id}`);
    const file: string = typeof value.file === 'string' ? value.file.replaceAll('\\', '/') : '';
    if (!file.toLowerCase().endsWith('.tpk') || isAbsolute(file) || win32.isAbsolute(file) ||
        file.split('/').some(segment => !segment || segment === '.' || segment === '..') || file.includes(':')) {
      throw new TileError(`Source ${value.id} file must be a relative .tpk path inside the config directory`);
    }
    const minZoom = integer(value.minZoom ?? (value.role === 'base' ? 0 : 14), 'minZoom', 0, 19);
    const maxZoom = integer(value.maxZoom ?? (value.role === 'base' ? 13 : 19), 'maxZoom', 0, 19);
    if (minZoom > maxZoom) throw new TileError(`Invalid zoom range for ${value.id}`);
    return {id: value.id, name: typeof value.name === 'string' ? value.name.slice(0, 160) : value.id,
      file, role: value.role, priority: integer(value.priority ?? 0, 'priority', -100000, 100000),
      minZoom, maxZoom, bounds: value.bounds === undefined ? undefined : bounds(value.bounds),
      usageConfirmed: boolean(value.usageConfirmed, 'usageConfirmed', false),
      enabled: boolean(value.enabled, 'enabled', true)};
  });
  if (!result.some(source => source.role === 'base' && source.enabled)) {
    throw new TileError('Register at least one enabled base source for low-resolution fallback');
  }
  return result;
}

/** One catalog per server process. Metadata inspection never reads tile records. */
export class MapCatalog {
  private loaded: LoadedSource[] = [];
  private sources: SourceInfo[] = [];
  private metadata!: CatalogInfo;
  private tracked = new Map<string, string>();
  private checked = 0;
  private changed = false;
  private memory = new Map<string, CatalogTile>();
  private memoryBytes = 0;
  private pending = new Map<string, Promise<CatalogTile | null>>();
  private running = 0;
  private waiters: Array<() => void> = [];
  private reported = new Set<string>();

  static async load(options: LoadOptions = {}) {
    const catalog = new MapCatalog();
    try { await catalog.load(options); return catalog; }
    catch (error) { catalog.close(); throw error; }
  }
  close() { for (const source of this.loaded) source.reader.close(); }
  info(): CatalogInfo {
    // Legacy permission remains controlled by the existing environment variable.
    if (this.metadata.mode === 'single') {
      const usageConfirmed = this.loaded[0].reader.info().usageConfirmed;
      return {...this.metadata, usageConfirmed,
        sources: this.sources.map(source => ({...source, usageConfirmed}))};
    }
    return this.metadata;
  }
  private async track(path: string) { this.tracked.set(path, await fingerprint(path)); }
  private async load(options: LoadOptions) {
    const legacyPath = resolve(/*turbopackIgnore: true*/ options.legacyPath || process.env.TPK_PATH || 'data/tpk/map.tpk');
    const configPath = resolve(/*turbopackIgnore: true*/ options.configPath || join(/*turbopackIgnore: true*/ dirname(legacyPath), process.env.MAP_CONFIG_FILE || DEFAULT_CONFIG));
    const cache = resolve(/*turbopackIgnore: true*/ options.cache || process.env.TPK_CACHE_DIR || '.cache/tpk');
    await this.track(configPath);
    if (this.tracked.get(configPath) === 'missing') {
      if (options.configPath || process.env.MAP_CONFIG_FILE && process.env.MAP_CONFIG_FILE !== DEFAULT_CONFIG) {
        throw new TileError('Map catalog file missing. Check MAP_CONFIG_FILE.', 503);
      }
      await this.track(legacyPath);
      if (this.tracked.get(legacyPath) === 'missing') throw new TileError('No maps.json or TPK file found. Place data in data/tpk/.', 503);
      const reader = await Tpk.load(legacyPath, cache);
      const metadata = reader.info();
      const info: SourceInfo = {id: 'legacy', name: '위성영상', role: 'detail', priority: 0, status: 'ready',
        usageConfirmed: metadata.usageConfirmed, bounds: metadata.bounds, minZoom: metadata.minZoom,
        maxZoom: metadata.maxZoom, zoomLevels: metadata.zoomLevels, metadata};
      this.loaded.push({reader, info}); this.sources.push(info);
      this.metadata = {...metadata, mode: 'single', sources: this.sources, warnings: []};
      return;
    }
    if ((await stat(/*turbopackIgnore: true*/ configPath)).size > 1024 * 1024) throw new TileError('Map catalog exceeds 1 MiB');
    let input: unknown;
    try { input = JSON.parse(await readFile(/*turbopackIgnore: true*/ configPath, 'utf8')); }
    catch (error) { if (error instanceof SyntaxError) throw new TileError('Invalid JSON in map catalog'); throw error; }
    const configs = parseConfig(input);
    const root = await realpath(/*turbopackIgnore: true*/ dirname(configPath));
    const warnings: string[] = [];
    for (const config of configs) {
      const info: SourceInfo = {...config, status: config.enabled ? 'unavailable' : 'disabled', zoomLevels: []};
      // Do not expose host paths or configuration filenames through the API.
      delete (info as any).file; delete (info as any).enabled;
      this.sources.push(info);
      if (!config.enabled) continue;
      const path = resolve(/*turbopackIgnore: true*/ root, config.file);
      await this.track(path);
      let reader: Tpk | undefined;
      try {
        const actual = await realpath(/*turbopackIgnore: true*/ path);
        const rel = relative(root, actual);
        if (rel.startsWith('..') || isAbsolute(rel)) throw new TileError('TPK symlinks must remain inside the catalog directory');
        reader = await Tpk.load(actual, cache, {usageConfirmed: config.usageConfirmed, memoryLimitBytes: 4 * 1024 * 1024});
        const metadata = reader.info();
        if (config.bounds && (config.bounds.south < metadata.bounds.south || config.bounds.north > metadata.bounds.north ||
            config.bounds.west < metadata.bounds.west || config.bounds.east > metadata.bounds.east)) {
          throw new TileError('Configured bounds must be inside actual TPK bounds');
        }
        info.metadata = metadata;
        info.bounds = config.bounds || metadata.bounds;
        info.zoomLevels = metadata.zoomLevels.filter(z => z >= config.minZoom && z <= config.maxZoom);
        if (!info.zoomLevels.length) throw new TileError('No downloaded TPK levels intersect the configured zoom range');
        info.minZoom = info.zoomLevels[0]; info.maxZoom = info.zoomLevels.at(-1)!;
        info.status = 'ready'; this.loaded.push({info, reader}); reader = undefined;
        if (!config.usageConfirmed) warnings.push(`${info.name}: 사용 권한 미확인 — 메타데이터만 제공합니다.`);
        const absent = Array.from({length: config.maxZoom - config.minZoom + 1}, (_, i) => i + config.minZoom).filter(z => !info.zoomLevels.includes(z));
        if (absent.length) warnings.push(`${info.name}: 미포함 줌 ${absent.join(', ')} — 낮은 줌 타일로 대체합니다.`);
      } catch (error) {
        info.status = 'unavailable';
        info.error = error instanceof TileError ? error.message : 'TPK file missing or unreadable';
        warnings.push(`${info.name}: ${info.error}`);
      } finally { reader?.close(); }
    }
    if (!this.loaded.length) throw new TileError('No usable TPK metadata found. Inspect registered source files.', 503);
    const available = this.loaded.map(source => source.info);
    if (!available.some(source => source.role === 'base' && source.usageConfirmed)) {
      warnings.push('사용 가능한 기본 지도가 없습니다. 고해상도 데이터가 없는 곳은 표시할 수 없습니다.');
    }
    const extent = union(available.map(source => source.bounds!));
    const desired = mapConfig.center;
    const center: [number, number] = desired[0] >= extent.south && desired[0] <= extent.north && desired[1] >= extent.west && desired[1] <= extent.east
      ? desired : [(extent.south + extent.north) / 2, (extent.west + extent.east) / 2];
    const first = this.loaded[0].reader.info();
    this.metadata = {...first, revision: createHash('sha256').update(JSON.stringify([...this.tracked])).update(JSON.stringify(configs)).digest('hex'),
      center, bounds: extent, minZoom: 0, maxZoom: 19, zoom: Math.min(19, Math.max(0, mapConfig.zoom)),
      zoomLevels: [...new Set(available.flatMap(source => source.zoomLevels))].sort((a, b) => a - b),
      source: 'Local multi-resolution TPK catalog', attribution: [...new Set(available.map(source => source.metadata!.attribution))].join(' · '),
      usageConfirmed: available.some(source => source.usageConfirmed), mode: 'multi', sources: this.sources, warnings,
      packageVersion: 'catalog-v1', storage: 'Multiple Compact V1/V2 caches', format: 'JPEG/PNG',
      licenseNotice: 'See sources[].metadata.licenseNotice for each package',
      archive: {entries: available.reduce((sum, source) => sum + source.metadata!.archive.entries, 0),
        bundles: available.reduce((sum, source) => sum + source.metadata!.archive.bundles, 0),
        zipMethods: [...new Set(available.flatMap(source => source.metadata!.archive.zipMethods))],
        packetSize: 128, indexOrder: 'Per source: see sources[].metadata.archive.indexOrder'}};
  }
  async checkUnchanged() {
    if (this.changed) throw new TileError('Map configuration or TPK changed. Restart the server and reload the page.', 503);
    if (Date.now() - this.checked < 1000) return;
    this.checked = Date.now();
    for (const [path, before] of this.tracked) {
      if (await fingerprint(path) !== before) {
        this.changed = true;
        throw new TileError('Map configuration or TPK changed. Restart the server and reload the page.', 503);
      }
    }
  }
  async tile(z: number, x: number, y: number): Promise<CatalogTile | null> {
    await this.checkUnchanged();
    if (!this.info().usageConfirmed) throw new TileError('No TPK source has confirmed local web usage permission.', 403);
    const key = `${z}/${x}/${y}`;
    const cached = this.memory.get(key);
    if (cached) { this.memory.delete(key); this.memory.set(key, cached); return cached; }
    const pending = this.pending.get(key); if (pending) return pending;
    if (this.pending.size >= 256) throw new TileError('Tile queue busy; retry shortly', 429);
    const task = (async () => {
      if (this.running >= 8) await new Promise<void>(ok => this.waiters.push(ok)); else this.running++;
      try {
        const area = tileBounds(z, x, y);
        const candidates: Candidate[] = [];
        for (const source of this.loaded) {
          if (!source.reader.info().usageConfirmed || !overlap(area, source.info.bounds!)) continue;
          for (const zoom of source.info.zoomLevels.filter(level => level <= z)) {
            const factor = 2 ** (z - zoom);
            candidates.push({source, zoom, x: Math.floor(x / factor), y: Math.floor(y / factor)});
          }
        }
        candidates.sort((a, b) => b.zoom - a.zoom ||
          Number(b.source.info.role === 'detail') - Number(a.source.info.role === 'detail') ||
          b.source.info.priority - a.source.info.priority ||
          (a.source.info.id < b.source.info.id ? -1 : a.source.info.id > b.source.info.id ? 1 : 0));
        return await this.select(candidates, 0, z, x, y);
      } finally { const next = this.waiters.shift(); if (next) next(); else this.running--; }
    })().then(tile => {
      if (tile && tile.bytes.length <= TILE_LIMIT) {
        while (this.memoryBytes + tile.bytes.length > TILE_LIMIT || this.memory.size >= 256) {
          const first = this.memory.keys().next().value!;
          this.memoryBytes -= this.memory.get(first)!.bytes.length; this.memory.delete(first);
        }
        this.memory.set(key, tile); this.memoryBytes += tile.bytes.length;
      }
      return tile;
    });
    this.pending.set(key, task);
    try { return await task; } finally { this.pending.delete(key); }
  }
  private async select(candidates: Candidate[], start: number, z: number, x: number, y: number): Promise<CatalogTile | null> {
    let firstError: unknown;
    for (let i = start; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        const tile = await candidate.source.reader.tile(candidate.zoom, candidate.x, candidate.y);
        if (!tile) continue;
        let bytes = tile.bytes, mime = tile.mime;
        const factor = 2 ** (z - candidate.zoom);
        if (factor > 1) {
          const span = 256 / factor;
          const left = Math.floor((x % factor) * span), top = Math.floor((y % factor) * span);
          const width = Math.max(1, Math.ceil(((x % factor) + 1) * span) - left);
          const height = Math.max(1, Math.ceil(((y % factor) + 1) * span) - top);
          bytes = await sharp(bytes, {limitInputPixels: 65536}).extract({left, top, width, height})
            .resize(256, 256, {kernel: 'cubic'}).png().toBuffer();
          mime = 'image/png';
        }
        const contributors = [candidate.source.info.id];
        let fallback = candidate.zoom < z;
        if (mime === 'image/png' && (await sharp(bytes, {limitInputPixels: 65536}).metadata()).hasAlpha) {
          const underlay = await this.select(candidates, i + 1, z, x, y);
          if (underlay) {
            bytes = await sharp(underlay.bytes, {limitInputPixels: 65536}).composite([{input: bytes}]).png().toBuffer();
            contributors.push(...underlay.contributingSources);
            fallback ||= underlay.fallback;
          }
        }
        return {bytes, mime, etag: '"' + createHash('sha256').update(bytes).digest('hex') + '"',
          sourceId: candidate.source.info.id, nativeZoom: candidate.zoom, fallback,
          contributingSources: [...new Set(contributors)]};
      } catch (error) {
        firstError ??= error;
        if (!this.reported.has(candidate.source.info.id)) {
          this.reported.add(candidate.source.info.id); console.error(`TPK tile source ${candidate.source.info.id} failed:`, error);
        }
      }
    }
    if (firstError) throw firstError;
    return null;
  }
}

let active: Promise<MapCatalog> | undefined;
export async function getCatalog() {
  if (!active) { active = MapCatalog.load(); active.catch(() => { active = undefined; }); }
  const catalog = await active;
  await catalog.checkUnchanged();
  return catalog;
}
