import {mkdir, writeFile} from 'node:fs/promises';
import {nodeSuites, runSuite} from './results.mjs';

if (!process.env.npm_execpath) throw Error('Run via npm run ci:node');
const directory = '.cache/ci/node';
await mkdir(directory, {recursive: true});
const results = [];
for (const name of nodeSuites) {
  console.log(`\nRunning ${name}`);
  results.push(await runSuite(name, process.execPath, [process.env.npm_execpath, 'run', name], directory));
  await writeFile('.cache/ci/node-results.json', JSON.stringify(results, null, 2));
}
// Keep the first failure code while still collecting every suite's result.
process.exitCode = results.find(result => result.exitCode !== 0)?.exitCode || 0;
