import {appendFile, readFile} from 'node:fs/promises';
import {browserCounts, nodeSuites} from './results.mjs';

const mode = process.argv[2];
let valid = false, text = `## Map regression: ${mode}\n\nCommit: ${process.env.GITHUB_SHA || 'local'}\n\n`;
if (mode === 'node') {
  let results = [];
  try {results = JSON.parse(await readFile('.cache/ci/node-results.json', 'utf8'));} catch {}
  text += `Typecheck: ${process.env.TYPECHECK_OUTCOME || 'not run'}\n\n`;
  text += '| Command | Exit | Total | Passed | Failed | Cancelled | Skipped | Todo |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
  for (const name of nodeSuites) {
    const result = results.find(result => result.name === name), c = result?.counts;
    text += `| ${name} | ${result?.exitCode ?? 'not run'} | ${c?.tests ?? 'unknown'} | ${c?.pass ?? 'unknown'} | ${c?.fail ?? 'unknown'} | ${c?.cancelled ?? 'unknown'} | ${c?.skipped ?? 'unknown'} | ${c?.todo ?? 'unknown'} |\n`;
  }
  valid = nodeSuites.every(name => results.some(result => result.name === name && result.exitCode === 0)) && process.env.TYPECHECK_OUTCOME === 'success';
} else if (mode === 'browser') {
  try {
    const c = browserCounts(JSON.parse(await readFile('.cache/ci/playwright.json', 'utf8')));
    valid = c.valid;
    text += `Executed: ${c.executed}; passed: ${c.passed}; failed: ${c.failed}; flaky: ${c.flaky}; skipped: ${c.skipped}.\n\n`;
    text += '| Project | Executed | Skipped |\n| --- | --- | --- |\n';
    for (const [name, count] of Object.entries(c.byProject)) text += `| ${name} | ${count.executed} | ${count.skipped} |\n`;
  } catch {text += 'Browser report unavailable: not run or interrupted; no success evidence.\n';}
} else throw Error('Expected node or browser');
text += '\nScope: synthetic fixtures and the checked-in public Esri format sample. Production DEM/PBF conversion is checked by the separate Conversion regression job. Real user TPK/DEM/PBF, Windows/Ubuntu desktop, authentication/operations and approved platform contracts are NOT verified by this job.\n';
text += `\nEvidence gate: ${valid ? 'passed' : 'FAILED (missing/empty/all-skipped/failed execution)'}\n`;
console.log(text);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
process.exitCode = valid ? 0 : 1;
