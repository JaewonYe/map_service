// Reset only fixed test directories; production BUILDINGS_DIR is never read.
import {mkdir, rm} from 'node:fs/promises';
for (const name of ['single', 'multi', 'buildings']) {
  const path = new URL(`../.cache/test-building-data/${name}/`, import.meta.url);
  await rm(path, {recursive: true, force: true}); await mkdir(path, {recursive: true});
}
