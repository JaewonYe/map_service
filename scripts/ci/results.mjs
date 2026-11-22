import {spawn} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const nodeSuites = ['test:tiles', 'test:buildings', 'test:layers', 'test:osm', 'test:measure', 'test:launcher', 'test:downloads', 'test:ci-tools'];
export const projects = ['single', 'multi', 'osm', 'layers', 'buildings'];

export function nodeCounts(output) {
  const counts = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const matches = [...output.matchAll(new RegExp(`^# ${key} (\\d+)$`, 'gm'))];
    if (!matches.length) return null;
    counts[key] = Number(matches.at(-1)[1]);
  }
  return counts;
}
export function validNode(c) {
  return !!c && c.tests > 0 && c.pass > 0 && c.fail === 0 && c.cancelled === 0 &&
    c.tests === c.pass + c.fail + c.cancelled + c.skipped + c.todo;
}
export async function runSuite(name, executable, args, directory) {
  await mkdir(directory, {recursive: true});
  let output = '';
  const exitCode = await new Promise(resolve => {
    // Each subprocess starts its own test runner, including when this helper is tested.
    const {NODE_TEST_CONTEXT: _testContext, ...environment} = process.env;
    const child = spawn(executable, args, {env: {...environment, NODE_OPTIONS: process.env.NODE_OPTIONS?.includes('--test-reporter=tap') ? process.env.NODE_OPTIONS : `${process.env.NODE_OPTIONS || ''} --test-reporter=tap`}, stdio: ['ignore', 'pipe', 'pipe']});
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {output += chunk; process.stdout.write(chunk);});
    child.on('error', error => {output += `${error.message}\n`;});
    child.on('close', code => resolve(code ?? 1));
  });
  await writeFile(join(directory, name.replaceAll(':', '-') + '.log'), output);
  const counts = nodeCounts(output);
  return {name, exitCode: exitCode || (validNode(counts) ? 0 : 1), processExitCode: exitCode, counts};
}
export function browserCounts(report) {
  const byProject = Object.fromEntries(projects.map(name => [name, {executed: 0, skipped: 0}]));
  function visit(suites = []) {
    for (const suite of suites) {
      for (const spec of suite.specs || []) for (const test of spec.tests || []) {
        const count = byProject[test.projectName];
        if (!count) continue;
        if (test.status === 'skipped') count.skipped++;
        else if (test.results?.some(result => result.status !== 'skipped')) count.executed++;
      }
      visit(suite.suites);
    }
  }
  visit(report.suites);
  const {expected = 0, unexpected = 0, flaky = 0, skipped = 0} = report.stats || {};
  const executed = expected + unexpected + flaky;
  return {executed, passed: expected, failed: unexpected, flaky, skipped, byProject,
    valid: executed > 0 && unexpected === 0 && flaky === 0 && !report.errors?.length &&
      Object.values(byProject).every(count => count.executed > 0)};
}
