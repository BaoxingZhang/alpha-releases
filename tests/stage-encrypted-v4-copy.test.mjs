import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { parse, sameRegularInventory, stageEncryptedV4Copy } from '../scripts/stage-encrypted-v4-copy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const stagedRoot = path.join(root, '.runtime', 'v4-encrypted-static');
const tempRoot = await fs.realpath(os.tmpdir());
const execFileAsync = promisify(execFile);

async function sourceFixture(t, suffix = '') {
  const source = await fs.mkdtemp(path.join(tempRoot, `alpha-v4-static-${suffix}`));
  t.after(() => fs.rm(source, { recursive: true, force: true }));
  await fs.mkdir(path.join(source, 'contact'), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(source, 'contact', 'contact.db'), Buffer.from('encrypted synthetic bytes'));
  await fs.writeFile(path.join(source, 'notes.txt'), Buffer.from('metadata'));
  return source;
}

async function targetPath(t, name) {
  await fs.mkdir(stagedRoot, { recursive: true, mode: 0o700 });
  const target = path.join(stagedRoot, name);
  await fs.rm(target, { recursive: true, force: true });
  await fs.rm(`${target}.lock`, { force: true });
  t.after(() => Promise.all([
    fs.rm(target, { recursive: true, force: true }),
    fs.rm(`${target}.lock`, { force: true })
  ]));
  return target;
}

test('encrypted static copy parses explicit source/account and rejects malformed options', () => {
  assert.deepEqual(parse(['--source-dir', '/tmp/source', '--account-id', 'sanitized-v4', '--target-name', 'copy', '--json']), {
    'source-dir': '/tmp/source', 'account-id': 'sanitized-v4', 'target-name': 'copy', json: true
  });
  assert.throws(() => parse(['--source-dir', '/tmp/source']), /V4_STATIC_USAGE/);
  assert.throws(() => parse(['--source-dir', '/tmp/source', '--source-dir', '/tmp/other', '--account-id', 'x']), /V4_STATIC_USAGE/);
});

test('encrypted static copy detects a regular-file set changing between inventory passes', () => {
  const base = { files: [{ relative: 'a.db', size: 4, dev: 1, ino: 2, mtimeMs: 3 }] };
  assert.equal(sameRegularInventory(base, { files: [{ ...base.files[0] }] }), true);
  assert.equal(sameRegularInventory(base, { files: [{ ...base.files[0], relative: 'b.db' }] }), false);
  assert.equal(sameRegularInventory(base, { files: [{ ...base.files[0], size: 5 }] }), false);
  assert.equal(sameRegularInventory(base, { files: [...base.files, { relative: 'new.db', size: 1, dev: 1, ino: 3, mtimeMs: 4 }] }), false);
});

test('encrypted static copy excludes sidecars and publishes a relative hash manifest', async t => {
  const source = await sourceFixture(t, 'copy-');
  await fs.writeFile(path.join(source, 'contact', 'contact.db-wal'), Buffer.from('pending transaction'));
  await fs.writeFile(path.join(source, 'contact', 'contact.db-shm'), Buffer.from('shared memory'));
  await fs.writeFile(path.join(source, 'contact', 'contact.db-journal'), Buffer.from('rollback journal'));
  const name = `copy-${process.pid}`;
  const target = await targetPath(t, name);
  const report = await stageEncryptedV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: name });
  assert.equal(report.status, 'staged');
  assert.equal(report.published, true);
  assert.equal(report.encrypted_static_copy, true);
  assert.equal(report.sidecars_excluded, true);
  assert.equal(report.sidecar_count, 3);
  assert.equal(report.read_only, true);
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
  assert.equal(report.source_static_required, true);
  assert.equal(report.file_count, 2);
  assert.equal(report.target_dir, `.runtime/v4-encrypted-static/${name}`);
  assert.equal(JSON.stringify(report).includes(source), false);
  const manifestPath = path.join(target, '.alpha-v4-encrypted-static.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'alpha-independent-v4-encrypted-static-copy-manifest.v1');
  assert.equal(manifest.sidecars_excluded, true);
  assert.equal(manifest.sidecar_count, 3);
  assert.equal(manifest.files.length, 2);
  assert.equal(manifest.files.every(file => /^[0-9a-f]{64}$/.test(file.sha256)), true);
  assert.equal(manifest.files.some(file => path.isAbsolute(file.path)), false);
  await assert.rejects(fs.lstat(path.join(target, 'contact', 'contact.db-wal')), { code: 'ENOENT' });
  assert.equal((await fs.stat(path.join(target, 'contact', 'contact.db'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(target)).mode & 0o777, 0o700);
});

test('encrypted static copy rejects symlinks and special files without publishing', async t => {
  const source = await sourceFixture(t, 'unsafe-');
  const link = path.join(source, 'linked.db');
  await fs.symlink(path.join(source, 'notes.txt'), link);
  const linkName = `link-${process.pid}`;
  const linkTarget = await targetPath(t, linkName);
  await assert.rejects(stageEncryptedV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: linkName }), /V4_STATIC_SYMLINK_DENIED/);
  await assert.rejects(fs.lstat(linkTarget), { code: 'ENOENT' });
  await fs.rm(link);
  if (process.platform === 'win32') return;
  const fifo = path.join(source, 'fifo');
  await execFileAsync('mkfifo', [fifo]);
  const fifoName = `fifo-${process.pid}`;
  const fifoTarget = await targetPath(t, fifoName);
  await assert.rejects(stageEncryptedV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: fifoName }), /V4_STATIC_UNSUPPORTED_ENTRY/);
  await assert.rejects(fs.lstat(fifoTarget), { code: 'ENOENT' });
});

test('encrypted static copy protects target races and cleans failed staging', async t => {
  const source = await sourceFixture(t, 'race-');
  const name = `race-${process.pid}`;
  const target = await targetPath(t, name);
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  await assert.rejects(stageEncryptedV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: name }), /V4_STATIC_TARGET_EXISTS/);
  assert.equal((await fs.stat(target)).isDirectory(), true);
  await fs.rm(target, { recursive: true, force: true });

  const sidecarOnly = path.join(source, 'only.db-wal');
  await fs.rm(path.join(source, 'contact', 'contact.db'));
  await fs.rm(path.join(source, 'notes.txt'));
  await fs.writeFile(sidecarOnly, Buffer.from('sidecar only'));
  const emptyName = `empty-${process.pid}`;
  const emptyTarget = await targetPath(t, emptyName);
  await assert.rejects(stageEncryptedV4Copy({ sourceDir: source, account: 'sanitized-v4', targetName: emptyName }), /V4_STATIC_EMPTY_SOURCE/);
  await assert.rejects(fs.lstat(emptyTarget), { code: 'ENOENT' });
});
