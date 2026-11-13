import {randomUUID} from 'node:crypto';
import {lstat, mkdir, open, readFile, readdir, rename, rm, unlink} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {BuildingError, buildingId, parseBuilding, type Building} from './model';

const MAX_RECORDS = 10000;
const RECORD_FILE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.json$/;
export class BuildingStore {
  private writing: Promise<unknown> = Promise.resolve();
  constructor(private directory: string) {}
  private path(id: string) {return join(this.directory, `${buildingId(id)}.json`);}
  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.writing.then(operation); this.writing = result.catch(() => {}); return result;
  }
  async list(): Promise<Building[]> {
    let entries;
    try {entries = await readdir(/*turbopackIgnore: true*/ this.directory, {withFileTypes: true});}
    catch (error) {if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error;}
    const files = entries.filter(entry => entry.isFile() && RECORD_FILE.test(entry.name));
    if (files.length > MAX_RECORDS) throw new BuildingError('등록 건물 수가 지원 한도를 초과했습니다.', 503);
    const result: Building[] = [];
    for (let i = 0; i < files.length; i += 32) {
      result.push(...await Promise.all(files.slice(i, i + 32).map(entry => this.get(entry.name.slice(0, -5)).catch(error => {
        // A record may be deleted while a list request is being read.
        if (error instanceof BuildingError && error.status === 404) return null;
        throw error;
      }))).then(values => values.filter((value): value is Building => value !== null)));
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  }
  async get(id: string): Promise<Building> {
    const canonicalId = buildingId(id), path = this.path(canonicalId);
    try {
      const file = await lstat(/*turbopackIgnore: true*/ path);
      if (!file.isFile() || file.size > 65536) throw Error('Invalid building data file');
      const value = JSON.parse((await readFile(/*turbopackIgnore: true*/ path, 'utf8')).replace(/^\uFEFF/, ''));
      const input = parseBuilding(value);
      if (value.id !== canonicalId || !Number.isSafeInteger(value.version) || value.version < 1 ||
          ![value.createdAt, value.updatedAt].every(date => typeof date === 'string' && Number.isFinite(Date.parse(date)))) {
        throw Error('Invalid building record metadata');
      }
      return {...input, id: canonicalId, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new BuildingError('건물 정보를 찾을 수 없습니다.', 404);
      throw new BuildingError('등록된 건물 데이터 파일을 읽을 수 없습니다. 서버 로그를 확인하세요.', 503, error);
    }
  }
  private async write(building: Building) {
    const path = this.path(building.id), temporary = join(this.directory, `.${building.id}-${randomUUID()}.tmp`);
    try {
      const file = await open(/*turbopackIgnore: true*/ temporary, 'wx', 0o600);
      try {await file.writeFile(JSON.stringify(building, null, 2) + '\n', 'utf8'); await file.sync();}
      finally {await file.close();}
      await rename(/*turbopackIgnore: true*/ temporary, path);
    } finally {await rm(/*turbopackIgnore: true*/ temporary, {force: true});}
  }
  async create(value: unknown): Promise<Building> {
    const input = parseBuilding(value);
    return this.mutate(async () => {
      await mkdir(/*turbopackIgnore: true*/ this.directory, {recursive: true});
      const count = (await readdir(/*turbopackIgnore: true*/ this.directory)).filter(name => RECORD_FILE.test(name)).length;
      if (count >= MAX_RECORDS) throw new BuildingError('최대 10,000개의 건물을 등록할 수 있습니다.', 409);
      const now = new Date().toISOString();
      const building = {...input, id: randomUUID(), version: 1, createdAt: now, updatedAt: now};
      await this.write(building); return building;
    });
  }
  async update(id: string, value: unknown, version: number): Promise<Building> {
    buildingId(id); const input = parseBuilding(value);
    return this.mutate(async () => {
      const previous = await this.get(id); this.checkVersion(previous, version);
      const building = {...input, id: previous.id, version: previous.version + 1, createdAt: previous.createdAt, updatedAt: new Date().toISOString()};
      await this.write(building); return building;
    });
  }
  async delete(id: string, version: number) {
    buildingId(id);
    return this.mutate(async () => {
      const previous = await this.get(id); this.checkVersion(previous, version);
      await unlink(/*turbopackIgnore: true*/ this.path(id));
    });
  }
  private checkVersion(building: Building, version: number) {
    if (!Number.isSafeInteger(version) || version < 1) throw new BuildingError('수정할 데이터 버전이 필요합니다.', 428);
    if (building.version !== version) throw new BuildingError('다른 화면에서 변경된 정보입니다. 창을 닫고 건물 정보를 다시 열어주세요.', 409);
  }
}

const globalStore = globalThis as typeof globalThis & {buildingStores?: Map<string, BuildingStore>};
export function getBuildingStore() {
  const directory = resolve(/*turbopackIgnore: true*/ process.env.BUILDINGS_DIR || 'data/buildings');
  const stores = globalStore.buildingStores ??= new Map();
  if (!stores.has(directory)) stores.set(directory, new BuildingStore(directory));
  return stores.get(directory)!;
}
