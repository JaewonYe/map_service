/** All pixels and package metadata in this fixture are self-generated, CC0. */
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import sharp from 'sharp';
import {zip, coordinate} from './tpk-fixture';

export const korea = {south: 32, west: 124, north: 39, east: 132};
export const taean = {south: 36.58, west: 126.23, north: 36.62, east: 126.26};
export async function color(r: number, g: number, b: number, alpha = 1) {
  return sharp({create: {width: 256, height: 256, channels: alpha === 1 ? 3 : 4,
    background: {r, g, b, alpha}}}).png().toBuffer();
}
export async function gradient() {
  const bytes = Buffer.alloc(256 * 256 * 3);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const offset = (y * 256 + x) * 3; bytes[offset] = x; bytes[offset + 1] = y; bytes[offset + 2] = 20;
  }
  return sharp(bytes, {raw: {width: 256, height: 256, channels: 3}}).png().toBuffer();
}
export async function pixels(bytes: Buffer, x = 128, y = 128) {
  const output = await sharp(bytes).removeAlpha().raw().toBuffer();
  return [...output.subarray((y * 256 + x) * 3, (y * 256 + x) * 3 + 3)];
}
export type TestTile = {z: number; x: number; y: number; bytes: Buffer};
export async function packageFile(directory: string, name: string, levels: number[], tiles: TestTile[],
  extent = taean, compressed = false) {
  const lods = levels.map(z => `<LODInfo><LevelID>${z}</LevelID><Resolution>${156543.03392804097 / 2 ** z}</Resolution></LODInfo>`).join('');
  const files: Array<{name: string; bytes: Buffer}> = [
    {name: 'v101/Layers/conf.xml', bytes: Buffer.from(`<CacheInfo><TileCacheInfo><SpatialReference><WKID>3857</WKID></SpatialReference><TileOrigin><X>-20037508.342789244</X><Y>20037508.342789244</Y></TileOrigin><TileCols>256</TileCols><TileRows>256</TileRows><LODInfos>${lods}</LODInfos></TileCacheInfo><CacheImageInfo><CacheTileFormat>PNG</CacheTileFormat></CacheImageInfo><CacheStorageInfo><StorageFormat>esriMapCacheStorageModeCompactV2</StorageFormat><PacketSize>128</PacketSize></CacheStorageInfo></CacheInfo>`)},
    {name: 'v101/Layers/conf.cdi', bytes: Buffer.from(`<EnvelopeN><SpatialReference><WKID>4326</WKID></SpatialReference><XMin>${extent.west}</XMin><YMin>${extent.south}</YMin><XMax>${extent.east}</XMax><YMax>${extent.north}</YMax></EnvelopeN>`)},
    {name: 'esriinfo/iteminfo.xml', bytes: Buffer.from('<ESRI_ItemInformation><version>CC0-test</version><licenseInfo>CC0 synthetic pixels</licenseInfo><accessInformation>Self-generated CC0 test pixels</accessInformation></ESRI_ItemInformation>')}
  ];
  const bundles = new Map<string, TestTile[]>();
  for (const tile of tiles) {
    const row = Math.floor(tile.y / 128) * 128, col = Math.floor(tile.x / 128) * 128;
    const name = `v101/Layers/_alllayers/L${String(tile.z).padStart(2, '0')}/R${row.toString(16).padStart(4, '0')}C${col.toString(16).padStart(4, '0')}.bundle`;
    const group = bundles.get(name) || []; group.push(tile); bundles.set(name, group);
  }
  for (const [name, group] of bundles) {
    const header = Buffer.alloc(64 + 16384 * 8); header.writeUInt32LE(3); header.writeUInt32LE(16384, 4);
    const parts: Buffer[] = [header]; let offset = header.length;
    for (const tile of group) {
      const index = (tile.y % 128) * 128 + tile.x % 128;
      header.writeBigUInt64LE(BigInt(tile.bytes.length) << 40n | BigInt(offset), 64 + index * 8);
      parts.push(tile.bytes); offset += tile.bytes.length;
    }
    files.push({name, bytes: Buffer.concat(parts)});
  }
  const path = join(directory, name); await mkdir(dirname(path), {recursive: true});
  await writeFile(path, zip(files, compressed)); return path;
}
export async function makeCatalogFixture(directory: string) {
  const green = await color(30, 130, 60), blue = await color(30, 70, 200), red = await color(220, 30, 30);
  const tiles: TestTile[] = [];
  for (let z = 0; z <= 13; z++) {
    const center = coordinate(z);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = center.x + dx, y = center.y + dy;
      if (x >= 0 && y >= 0 && x < 2 ** z && y < 2 ** z) tiles.push({z, x, y, bytes: green});
    }
  }
  await packageFile(directory, 'korea/base.tpk', Array.from({length: 14}, (_, z) => z), tiles, korea);
  await packageFile(directory, 'regions/taean.tpk', [14, 16, 19], [14, 16, 19].map(z => ({z, ...coordinate(z), bytes: blue})), taean, true);
  await packageFile(directory, 'regions/port.tpk', [16], [{z: 16, ...coordinate(16), bytes: red}], taean);
  const config = {version: 1, sources: [
    {id: 'korea', name: 'CC0 기본 지도', file: 'korea/base.tpk', role: 'base', priority: 0, usageConfirmed: true},
    {id: 'taean', name: 'CC0 태안 지역', file: 'regions/taean.tpk', role: 'detail', priority: 100, usageConfirmed: true},
    {id: 'port', name: 'CC0 항구 지역', file: 'regions/port.tpk', role: 'detail', priority: 200, usageConfirmed: true}
  ]};
  const configPath = join(directory, 'maps.json'); await writeFile(configPath, JSON.stringify(config));
  return {configPath, config, green, blue, red};
}
