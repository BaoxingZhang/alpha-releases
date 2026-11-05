import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { containsPath, parse, stageV4Copy } from '../scripts/stage-v4-copy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stagedRoot = path.join(root, '.runtime', 'v4-staged');
const tempRoot = await fs.realpath(os.tmpdir());
const execFileAsync = promisify(execFile);

async function sourceFixture(t, suffix = '') {
  const source = await fs.mkdtemp(path.join(tempRoot, `alpha-v4-stage-${suffix}`));
  t.after(() => fs.rm(source, { recursive: true, force: true }));
  await fs.mkdir(path.join(source, 'contact'), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(source, 'contact', 'contact.db'), Buffer.from('synthetic sqlite bytes'));
  await fs.writeFile(path.join(source, 'notes.txt'), Buffer.from('metadata'));
  return source;
}

function readyPreflight(status = 'ready') {
  return async ({ dataDir }) => ({
    schema: 'alpha-independent-v4-preflight.v1',
    scope: 'alpha-independent-v4-preflight',
    status,
    read_only: true,
    complete: false,
    native_schema_supported: false,
    account_id: 'sanitized-v4',
    schema_only: { status, databases: [{ path: 'contact/contact.db', tables: [] }], errors: [], checked: dataDir },
    source: { status, diagnostics: { sourceKind: 'explicit-offline-sqlite-schema', databases: [{ path: 'contact/contact.db' }], tableCount: 1 } }
  });
}

async function targetPath(name) {
  await fs.mkdir(stagedRoot, { recursive: true, mode: 0o700 });
  const target = path.join(stagedRoot, name);
  await fs.rm(target, { recursive: true, force: true });
  await fs.rm(`${target}.lock`, { force: true });
  return target;
}

test('stage-v4 parses explicit source/account and rejects unknown or duplicate options', async () => {
  assert.deepEqual(parse(['--source-dir', '/tmp/source', '--account-id', 'sanitized-v4', '--target-name', 'copy', '--json']), {
    'source-dir': '/tmp/source', 'account-id': 'sanitized-v4', 'target-name': 'copy', json: true
  });
  assert.throws(() => parse(['--source-dir', '/tmp/source']), /V4_STAGE_USAGE/);
  assert.throws(() => parse(['--source-dir', '/tmp/source', '--source-dir', '/tmp/other', '--account-id', 'x']), /V4_STAGE_USAGE/);
  await assert.rejects(stageV4Copy({ sourceDir: '/definitely/missing-v4-source', account: 'invalid account', targetName: 'copy', preflight: readyPreflight() }), /V4_STAGE_ACCOUNT_ID_INVALID/);
  assert.equal(containsPath('/tmp/parent', '/tmp/parent/child'), true);
  assert.equal(containsPath('/tmp/parent', '/tmp/parent-sibling'), false);
});

test('stage-v4 copies a stable source, writes a relative hash manifest, and reports ready', async t => {
  const source = await sourceFixture(t, 'ready-');
  const name = `ready-${process.pid}`;
  const target = await targetPath(name);
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  const report = await stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: name, preflight: readyPreflight() });
  assert.equal(report.status, 'ready');
  assert.equal(report.published, true);
  assert.equal(report.read_only, true);
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
  assert.equal(report.target_dir, `.runtime/v4-staged/${name}`);
  assert.equal(report.manifest.file_count, 2);
  assert.equal(JSON.stringify(report).includes(source), false);
  const manifest = JSON.parse(await fs.readFile(path.join(target, '.alpha-v4-staged.json'), 'utf8'));
  assert.equal(manifest.schema, 'alpha-independent-v4-staged-manifest.v1');
  assert.equal(manifest.files.some(file => file.path === 'contact/contact.db' && /^[0-9a-f]{64}$/.test(file.sha256)), true);
  assert.equal(manifest.files.some(file => path.isAbsolute(file.path)), false);
  assert.equal((await fs.stat(path.join(target, 'contact', 'contact.db'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(target)).mode & 0o777, 0o700);
});

test('stage-v4 publishes schema-only copies with the same bounded status markers', async t => {
  const source = await sourceFixture(t, 'schema-');
  const name = `schema-${process.pid}`;
  const target = await targetPath(name);
  t.after(() => fs.rm(target, { recursive: true, force: true }));
  const report = await stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: name, preflight: readyPreflight('schema-only') });
  assert.equal(report.status, 'schema-only');
  assert.equal(report.published, true);
  assert.equal(report.read_only, true);
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
});

test('stage-v4 rejects symlinks, active sidecars, and sources inside project runtime', async t => {
  const source = await sourceFixture(t, 'unsafe-');
  await fs.symlink(path.join(source, 'notes.txt'), path.join(source, 'linked.txt'));
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: `link-${process.pid}`, preflight: readyPreflight() }), /V4_STAGE_SYMLINK_DENIED/);
  await fs.rm(path.join(source, 'linked.txt'));
  await fs.writeFile(path.join(source, 'contact', 'contact.db-wal'), Buffer.from('sidecar'));
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: `sidecar-${process.pid}`, preflight: readyPreflight() }), /V4_STAGE_ACTIVE_DATABASE_DENIED/);
  await assert.rejects(stageV4Copy({ sourceDir: stagedRoot, account: 'sanitized-v4', targetName: `overlap-${process.pid}`, preflight: readyPreflight() }), /V4_STAGE_SOURCE_PROJECT_RUNTIME_DENIED/);
});

test('stage-v4 rejects special files and configured size/depth limits', async t => {
  if (process.platform === 'win32') return;
  const source = await sourceFixture(t, 'limits-');
  const fifo = path.join(source, 'fifo');
  await execFileAsync('mkfifo', [fifo]);
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: `fifo-${process.pid}`, preflight: readyPreflight() }), /V4_STAGE_UNSUPPORTED_ENTRY/);
  await fs.rm(fifo, { force: true });
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: `bytes-${process.pid}`, preflight: readyPreflight(), limits: { maxFiles: 100, maxDepth: 8, maxSingleBytes: 1, maxTotalBytes: 1024 } }), /V4_STAGE_FILE_TOO_LARGE/);
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: `count-${process.pid}`, preflight: readyPreflight(), limits: { maxFiles: 1, maxDepth: 8, maxSingleBytes: 1024, maxTotalBytes: 1024 } }), /V4_STAGE_DATASET_TOO_LARGE/);
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: `depth-${process.pid}`, preflight: readyPreflight(), limits: { maxFiles: 100, maxDepth: 0, maxSingleBytes: 1024, maxTotalBytes: 1024 } }), /V4_STAGE_DATASET_TOO_LARGE/);
});

test('stage-v4 cleans a rejected preflight copy and leaves no target behind', async t => {
  const source = await sourceFixture(t, 'rejected-');
  const name = `rejected-${process.pid}`;
  const target = await targetPath(name);
  const before = new Set(await fs.readdir(stagedRoot));
  const report = await stageV4Copy({
    sourceDir: source,
    account: 'sanitized-v4',
    targetName: name,
    preflight: async () => ({
      schema: 'alpha-independent-v4-preflight.v1',
      scope: 'alpha-independent-v4-preflight',
      status: 'rejected',
      read_only: true,
      complete: false,
      native_schema_supported: false,
      schema_only: { status: 'rejected', databases: [], errors: [{ code: 'SCHEMA_MISMATCH' }] },
      source: { status: 'rejected', diagnostics: { databases: [], tableCount: 0 } }
    })
  });
  assert.equal(report.status, 'rejected');
  assert.equal(report.published, false);
  await assert.rejects(fs.lstat(target), { code: 'ENOENT' });
  await assert.rejects(fs.lstat(`${target}.lock`), { code: 'ENOENT' });
  const after = new Set(await fs.readdir(stagedRoot));
  assert.deepEqual([...after].filter(entry => !before.has(entry)), []);
});

test('stage-v4 rejects an existing target and a target created during preflight', async t => {
  const source = await sourceFixture(t, 'target-');
  const existingName = `existing-${process.pid}`;
  const existing = await targetPath(existingName);
  await fs.mkdir(existing, { recursive: true, mode: 0o700 });
  t.after(() => fs.rm(existing, { recursive: true, force: true }));
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: existingName, preflight: readyPreflight() }), /V4_STAGE_TARGET_EXISTS/);

  const raceName = `race-${process.pid}`;
  const race = await targetPath(raceName);
  t.after(() => fs.rm(race, { recursive: true, force: true }));
  const preflight = async () => {
    await fs.mkdir(race, { recursive: true, mode: 0o700 });
    return { status: 'ready', read_only: true, complete: false, native_schema_supported: false, schema_only: { status: 'ready', databases: [], errors: [] }, source: { status: 'ready', diagnostics: { databases: [], tableCount: 0 } } };
  };
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: raceName, preflight }), /V4_STAGE_TARGET_EXISTS/);
  assert.equal((await fs.stat(race)).isDirectory(), true);

  const symlinkName = `race-link-${process.pid}`;
  const symlink = await targetPath(symlinkName);
  const outside = await fs.mkdtemp(path.join(tempRoot, `alpha-v4-stage-outside-${process.pid}-`));
  t.after(() => Promise.all([
    fs.rm(symlink, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true })
  ]));
  const symlinkPreflight = async () => {
    await fs.symlink(outside, symlink);
    return { status: 'ready', read_only: true, complete: false, native_schema_supported: false, schema_only: { status: 'ready', databases: [], errors: [] }, source: { status: 'ready', diagnostics: { databases: [], tableCount: 0 } } };
  };
  await assert.rejects(stageV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: symlinkName, preflight: symlinkPreflight }), /V4_STAGE_TARGET_EXISTS/);
  assert.equal((await fs.lstat(symlink)).isSymbolicLink(), true);
});
