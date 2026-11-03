import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { createFixture } from './data-bridge-fixture.mjs';
import { accountId, cleanAbsolute, parse } from '../scripts/inspect-source.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/inspect-source.mjs');
const base = path.join(root, '.runtime/inspect-source-tests');

async function snapshot(directory) {
  const result = {};
  for (const entry of await fs.readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    result[path.relative(directory, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  return result;
}

test('source inspection CLI reports bounded diagnostics without changing an explicit fixture', async t => {
  await fs.mkdir(base, { recursive: true });
  const outer = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(outer, { recursive: true, force: true }));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFixture(dataDir);
  const before = await snapshot(dataDir);
  const { stdout, stderr } = await execute(process.execPath, [script, '--data-dir', dataDir, '--account-id', fixture.accountId, '--json'], { cwd: root, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.schema, 'alpha-independent-source-diagnostics-cli.v1');
  assert.equal(report.scope, 'alpha-independent-source-diagnostics');
  assert.equal(report.status, 'ready');
  assert.equal(report.read_only, true);
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
  assert.equal(report.diagnostics.sourceKind, 'explicit-offline-sqlite-schema');
  assert.ok(report.diagnostics.databases.length >= 4);
  assert.ok(report.diagnostics.tableCount > 0);
  assert.deepEqual(await snapshot(dataDir), before);
});

test('source inspection argument helpers reject unsafe paths and labels', () => {
  assert.throws(() => cleanAbsolute('relative/data', 'PATH'), /PATH/);
  assert.throws(() => cleanAbsolute('/tmp/../tmp/data', 'PATH'), /PATH/);
  assert.throws(() => accountId('bad id'), /SOURCE_ACCOUNT_ID_INVALID/);
  assert.throws(() => accountId('../escape'), /SOURCE_ACCOUNT_ID_INVALID/);
  assert.deepEqual(parse(['--data-dir', '/tmp/data', '--account-id', 'acct-1', '--json']), {
    'data-dir': '/tmp/data', 'account-id': 'acct-1', json: true
  });
});
