import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {browserCounts, nodeCounts, projects, runSuite, validNode} from '../../scripts/ci/results.mjs';

async function fixture(t, source) {
  const directory = await mkdtemp(join(tmpdir(), 'ci-tooling-'));
  t.after(() => rm(directory, {recursive: true, force: true}));
  const path = join(directory, 'fixture.mjs'); await writeFile(path, source);
  return {directory, path};
}
test('a nonzero command keeps its exit code and diagnostic log', async t => {
  const {directory, path} = await fixture(t, "console.error('diagnostic'); process.exit(7);");
  const result = await runSuite('failure', process.execPath, [path], directory);
  assert.equal(result.exitCode, 7); assert.match(await readFile(join(directory, 'failure.log'), 'utf8'), /diagnostic/);
});
test('empty and all-skipped Node execution fail the evidence gate', async t => {
  for (const [source, flags] of [["import {run} from 'node:test'; import {tap} from 'node:test/reporters'; run({files:[]}).compose(tap).pipe(process.stdout);", []], ["import test from 'node:test'; test.skip('not implemented',()=>{});", ['--test']]]) {
    const {directory, path} = await fixture(t, source);
    const result = await runSuite('empty', process.execPath, [...flags, path], directory);
    assert.equal(result.processExitCode, 0); assert.equal(result.exitCode, 1);
  }
});
test('real assertion failure stays failed; passing tests have explicit counts', async t => {
  const {directory, path} = await fixture(t, "import test from 'node:test'; test('works',()=>{});");
  const pass = await runSuite('pass', process.execPath, ['--test', path], directory);
  assert.equal(pass.exitCode, 0); assert.equal(pass.counts.pass, 1);
  await writeFile(path, "import test from 'node:test'; test('fails',()=>{throw Error('assertion');});");
  assert.notEqual((await runSuite('fail', process.execPath, ['--test', path], directory)).exitCode, 0);
});
test('missing or inconsistent Node counts cannot pass', () => {
  assert.equal(nodeCounts(''), null);
  assert.equal(validNode({tests: 2, pass: 1, fail: 0, cancelled: 0, skipped: 0, todo: 0}), false);
});
test('all five browser projects must execute; failures, global errors and empty reports fail', () => {
  const report = {stats: {expected: 5, unexpected: 0, skipped: 1, flaky: 0}, suites: [{specs: [{tests: projects.map(projectName => ({projectName, status: 'expected', results: [{status: 'passed'}]}))}]}]};
  assert.equal(browserCounts(report).valid, true);
  assert.equal(browserCounts({}).valid, false);
  assert.equal(browserCounts({...report, stats: {...report.stats, unexpected: 1}}).valid, false);
  assert.equal(browserCounts({...report, errors: [{message: 'server failed'}]}).valid, false);
  report.suites[0].specs[0].tests[0] = {projectName: 'single', status: 'skipped', results: [{status: 'skipped'}]};
  assert.equal(browserCounts(report).valid, false);
});
