import { mkdir, copyFile, chmod } from 'node:fs/promises';
const target = new URL('../public/maplibre/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs']) {
  const destination = new URL(name, target);
  await copyFile(new URL(`../node_modules/maplibre-gl/dist/${name}`, import.meta.url), destination);
  await chmod(destination, 0o644);
}
await chmod(target, 0o755);
