import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, open, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const countryURL = 'https://download.geofabrik.de/asia/south-korea-latest.osm.pbf';

export function runCommand(command, args, { cwd, capture = false } = {}) {
  return new Promise((resolve, reject) => {
    // npm.cmd needs cmd.exe on Windows. Arguments here are fixed application commands.
    const child = spawn(command, args, {
      cwd, shell: process.platform === 'win32' && command === 'npm.cmd',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
    });
    let stdout = '', stderr = '';
    if (capture) {
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
    }
    child.once('error', error => reject(new Error(`${command}: ${error.message}`)));
    child.once('close', (code, signal) => {
      if (signal) reject(new Error(`${command} interrupted (${signal}).`));
      else if (code !== 0) reject(new Error(`${command} ${args.join(' ')} failed (exit ${code}).${stderr ? `\n${stderr}` : ''}`));
      else resolve(stdout);
    });
  });
}

async function exists(path) {
  try { await access(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function createManager({ root = projectRoot, run = runCommand, platform = process.platform, log = console.log, request = fetch } = {}) {
  const path = relative => join(root, relative);
  const command = (name, args, capture = false) => run(name, args, { cwd: root, capture });
  const docker = (...args) => command('docker', ['compose', ...args]);
  const npm = (...args) => command(platform === 'win32' ? 'npm.cmd' : 'npm', args);
  async function initialize() {
    await mkdir(path('data/vector'), { recursive: true });
    await mkdir(path('data/imagery'), { recursive: true });
    if (!await exists(path('.env'))) await copyFile(path('.env.example'), path('.env'));
    await command('docker', ['info', '--format', '{{.ServerVersion}}'], true);
    await command('docker', ['compose', 'version'], true);
  }
  async function requireVector() {
    const filename = path('data/vector/region.mbtiles');
    if (!await exists(filename)) throw new Error('Map tiles are missing. Select "Prepare map data" first.');
    const handle = await open(filename, 'r');
    try {
      const header = Buffer.alloc(16);
      await handle.read(header, 0, 16, 0);
      if (header.toString() !== 'SQLite format 3\0') throw new Error('Invalid MBTiles header. Rebuild map tiles or restore your backup.');
    } finally { await handle.close(); }
  }
  async function dependencies() {
    const digest = createHash('sha256').update(await readFile(path('package-lock.json'))).digest('hex');
    let saved = '';
    try { saved = await readFile(path('.cache/launcher-lock'), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!await exists(path('node_modules/next/package.json')) || saved !== digest) {
      await npm('ci');
      await mkdir(path('.cache'), { recursive: true });
      await writeFile(path('.cache/launcher-lock'), digest);
    }
  }
  async function prepareMap(force = false) {
    if (force && !await exists(path('data/taean.osm.pbf'))) throw new Error('Retained Taean PBF is missing. Prepare map data first.');
    if (!force && await exists(path('data/vector/region.mbtiles'))) {
      await requireVector();
      log('Existing map tiles retained. No download or conversion needed.');
      return;
    }
    if (!await exists(path('data/taean.osm.pbf'))) {
      const source = path('data/south-korea.osm.pbf');
      if (!await exists(source)) {
        const partial = `${source}.part`;
        log('Downloading South Korea PBF. This can take a while.');
        if (platform === 'win32') {
          await command('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path('scripts/download-country.ps1'), '-OutputPath', partial]);
        } else {
          await command('curl', ['--fail', '--location', '--retry', '3', '--output', partial, countryURL]);
        }
        if ((await stat(partial)).size === 0) throw new Error('Empty PBF download. Existing data retained.');
        await rename(partial, source);
      }
      if ((await stat(source)).size === 0) throw new Error('South Korea PBF is empty. Replace it with a complete download.');
      await docker('build', 'extract');
      await docker('--profile', 'tools', 'run', '--rm', 'extract');
      if (!await exists(path('data/taean.osm.pbf'))) throw new Error('Extraction did not produce Taean PBF.');
    }
    await docker('stop', 'tiles');
    await docker('--profile', 'tools', 'run', '--rm', 'import');
    await requireVector();
    log('Map data prepared. Select service start next.');
  }
  async function prepareImagery(force = false, allowPartial = false) {
    const folder = path('data/imagery/taean/sentinel2');
    if (force && !await exists(join(folder, 'source/acquisition.json'))) throw new Error('Retained imagery bands are missing. Prepare satellite data first.');
    await docker('--profile', 'imagery-tools', 'build', 'imagery-download');
    if (!force && await exists(join(folder, 'manifest.json'))) {
      await docker('--profile', 'imagery-tools', 'run', '--rm', 'imagery-verify');
      log('Existing satellite data verified. No download or rebuild needed.');
      return;
    }
    if (!await exists(join(folder, 'source/acquisition.json'))) {
      await docker('--profile', 'imagery-tools', 'run', '--rm', 'imagery-download');
    }
    await docker('stop', 'imagery');
    await docker('--profile', 'imagery-tools', 'run', '--rm', 'imagery-build', ...(allowPartial ? ['--allow-partial'] : []));
    await docker('--profile', 'imagery-tools', 'run', '--rm', 'imagery-verify');
    await docker('up', '-d', 'imagery');
    log('RGB / infrared / NDVI prepared. Start services or refresh the page.');
  }
  async function serviceURL() {
    const config = JSON.parse(await command('docker', ['compose', 'config', '--format', 'json'], true));
    const port = Number(config.services.web.ports?.[0]?.published || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid web port.');
    return `http://127.0.0.1:${port}`;
  }
  async function start() {
    await requireVector();
    await docker('up', '-d', '--build');
    const url = await serviceURL();
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await request(`${url}/tile/14/13940/6391.pbf`, { signal: AbortSignal.timeout(3000) });
        if (response.status !== 200 && response.status !== 204) throw new Error(`Tile server HTTP ${response.status}`);
        if (response.status === 200 && !response.headers.get('content-type')?.includes('vector-tile')) throw new Error('Unexpected tile response type.');
        await response.arrayBuffer();
        log(`Service ready: ${url}`);
        if (platform === 'win32') {
          try { await command('rundll32.exe', ['url.dll,FileProtocolHandler', url]); }
          catch { log(`Browser did not open automatically. Open ${url} manually.`); }
        }
        return;
      } catch (error) {
        if (attempt === 89) throw new Error(`Service did not become ready: ${error.message}. Check status/logs.`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
  return {
    async execute(action) {
      if (!['map', 'imagery', 'start', 'dev', 'stop', 'status', 'rebuild-map', 'rebuild-imagery', 'partial-imagery'].includes(action)) throw new Error(`Unknown action: ${action}`);
      await initialize();
      switch (action) {
        case 'map': return prepareMap();
        case 'rebuild-map': return prepareMap(true);
        case 'imagery': return prepareImagery();
        case 'rebuild-imagery': return prepareImagery(true);
        case 'partial-imagery': return prepareImagery(true, true);
        case 'start': return start();
        case 'dev':
          await requireVector();
          await dependencies();
          await docker('up', '-d', 'tiles', 'imagery');
          log('Development server: http://127.0.0.1:3000 (Ctrl+C to stop frontend)');
          return npm('run', 'dev');
        case 'stop':
          await docker('down');
          log('Docker services stopped. All map and imagery files retained.');
          return;
        case 'status':
          await docker('ps', '-a');
          return docker('logs', '--tail=40', 'tiles', 'imagery', 'web');
      }
    }
  };
}

async function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
  const manager = createManager();
  const action = process.argv[2];
  if (action) { await manager.execute(action); return; }
  const choices = {
    '1': ['지도 데이터 준비 (최초 1회)', 'map'],
    '2': ['위성영상 RGB / 근적외선 / NDVI 준비 (선택)', 'imagery'],
    '3': ['서비스 시작 + 브라우저 열기 (평소 실행)', 'start'],
    '4': ['Next.js 개발 서버 실행', 'dev'],
    '5': ['Docker 서비스 종료 (데이터 유지)', 'stop'],
    '6': ['서비스 상태와 오류 로그 확인', 'status'],
    '7': ['보관한 PBF로 지도 타일 재생성', 'rebuild-map'],
    '8': ['보관한 밴드로 위성영상 재가공', 'rebuild-imagery'],
    '9': ['누락 영역을 투명 표시하고 위성영상 재가공 (불완전 영상 허용)', 'partial-imagery']
  };
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      console.log('\n=== 태안군 지도 실행 ===');
      for (const [key, [label]] of Object.entries(choices)) console.log(` ${key}. ${label}`);
      console.log(' 0. 메뉴 닫기 (실행 중인 Docker 서비스는 유지)');
      const selected = (await reader.question('번호 선택: ')).trim();
      if (selected === '0') break;
      if (!choices[selected]) { console.log('0부터 9까지의 번호를 선택하세요.'); continue; }
      try { await manager.execute(choices[selected][1]); }
      catch (error) { console.error(`\nFAILED: ${error.message}\nNo later setup steps were executed. Fix the error and retry.`); }
      await reader.question('\nEnter를 누르면 메뉴로 돌아갑니다...');
    }
  } finally { reader.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
}
