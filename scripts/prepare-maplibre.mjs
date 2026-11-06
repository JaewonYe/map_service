import { mkdir, copyFile, chmod, access, constants } from 'node:fs/promises';

const target = new URL('../public/maplibre/', import.meta.url);
const names = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];
// Check both sources before creating partial output. ZIP updates can leave old node_modules.
for (const name of names) {
  try {
    await access(new URL(`../node_modules/maplibre-gl/dist/${name}`, import.meta.url), constants.R_OK);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.error(`MapLibre installation is incomplete or outdated: ${name} is missing.\nRun npm.cmd ci (Windows PowerShell) or npm ci, then retry npm run dev.\nUse the package.json and package-lock.json from the same repository version.`);
    process.exit(1);
  }
}
await mkdir(target, { recursive: true });
for (const name of names) {
  const destination = new URL(name, target);
  await copyFile(new URL(`../node_modules/maplibre-gl/dist/${name}`, import.meta.url), destination);
  await chmod(destination, 0o644);
}
await chmod(target, 0o755);
