import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));

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
    await mkdir(path('data/imagery'), { recursive: true });
    if (!await exists(path('.env'))) await copyFile(path('.env.example'), path('.env'));
    await command('docker', ['info', '--format', '{{.ServerVersion}}'], true);
    await command('docker', ['compose', 'version'], true);
  }
  async function requireImagery() {
    const manifestPath=path('data/imagery/taean/esri/manifest.json');
    if (!await exists(manifestPath)) throw new Error('Esri RGB is missing. Select Prepare RGB first.');
    const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
    const filename=join(path('data/imagery/taean/esri'),manifest.mbtiles || '');
    if (!manifest.ready || !manifest.mbtiles || !await exists(filename)) throw new Error('Esri RGB is incomplete. Rebuild or restore the archive.');
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
  async function prepareImagery(force=false) {
    const folder=path('data/imagery/taean/esri');
    if(force && !await exists(join(folder,'source/acquisition.json'))) throw new Error('Retained Esri archive missing. Prepare RGB first.');
    await docker('--profile','imagery-tools','build','imagery-download');
    if(!force && await exists(join(folder,'manifest.json'))) {
      await docker('--profile','imagery-tools','run','--rm','imagery-verify');
      log('Existing Esri RGB archive verified. No new download.');return;
    }
    if(!await exists(join(folder,'source/acquisition.json'))) await docker('--profile','imagery-tools','run','--rm','imagery-download');
    await docker('stop','imagery');
    await docker('--profile','imagery-tools','run','--rm','imagery-build');
    await docker('--profile','imagery-tools','run','--rm','imagery-verify');
    log('Esri RGB ready. Start services next.');
  }
  async function serviceURL() {
    const config = JSON.parse(await command('docker', ['compose', 'config', '--format', 'json'], true));
    const port = Number(config.services.web.ports?.[0]?.published || 8080);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid web port.');
    return `http://127.0.0.1:${port}`;
  }
  async function start() {
    await requireImagery();
    await docker('up', '-d', '--build');
    const url = await serviceURL();
    for (let attempt = 0; attempt < 90; attempt++) {
      try {
        const response = await request(`${url}/imagery/metadata.json`, { signal: AbortSignal.timeout(3000) });
        if(!response.ok) throw new Error(`Imagery server HTTP ${response.status}`);
        const metadata=await response.json();
        if(!metadata.datasets?.some(entry=>entry.id==='rgb' && entry.ready)) throw new Error('Esri RGB is not ready.');
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
      if (!['imagery','start','dev','stop','status','rebuild-imagery'].includes(action)) throw new Error(`Unknown action: ${action}`);
      await initialize();
      switch (action) {
        case 'imagery': return prepareImagery();
        case 'rebuild-imagery': return prepareImagery(true);
        case 'start': return start();
        case 'dev':
          await requireImagery();
          await dependencies();
          await docker('up', '-d', 'imagery');
          log('Development server: http://127.0.0.1:3000 (Ctrl+C to stop frontend)');
          return npm('run', 'dev');
        case 'stop':
          await docker('down');
          log('Docker services stopped. All map and imagery files retained.');
          return;
        case 'status':
          await docker('ps', '-a');
          return docker('logs', '--tail=40', 'imagery', 'web');
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
    '1':['Esri RGB 다운로드·준비 (최초 1회)','imagery'],
    '2':['서비스 시작 + 브라우저 열기','start'],
    '3':['개발 서버 실행','dev'],
    '4':['서비스 종료 (파일 유지)','stop'],
    '5':['상태·오류 로그','status'],
    '6':['보관한 Esri 원본으로 재구성','rebuild-imagery']
  };
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      console.log('\n=== 태안군 Esri RGB ===');
      for (const [key, [label]] of Object.entries(choices)) console.log(` ${key}. ${label}`);
      console.log(' 0. 메뉴 닫기 (실행 중인 Docker 서비스는 유지)');
      const selected = (await reader.question('번호 선택: ')).trim();
      if (selected === '0') break;
      if (!choices[selected]) { console.log('0부터 6까지의 번호를 선택하세요.'); continue; }
      try { await manager.execute(choices[selected][1]); }
      catch (error) { console.error(`\nFAILED: ${error.message}\nNo later setup steps were executed. Fix the error and retry.`); }
      await reader.question('\nEnter를 누르면 메뉴로 돌아갑니다...');
    }
  } finally { reader.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(`FAILED: ${error.message}`); process.exitCode = 1; });
}
