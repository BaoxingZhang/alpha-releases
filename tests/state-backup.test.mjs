import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createStateBackup, restoreStateBackup, removeOwned, SCHEMA } = require('../packages/alpha-engine/state-backup.cjs');

async function fixture(t) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, 'alpha-state-backup-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source'), destination = path.join(root, 'destination'), archive = path.join(root, 'state.alpha-backup');
  await fs.mkdir(source, { mode: 0o700 });
  await fs.chmod(source, 0o700);
  return { root, source, destination, archive };
}

async function put(source, name, text) {
  await fs.writeFile(path.join(source, name), text, { mode: 0o600 });
  await fs.chmod(path.join(source, name), 0o600);
}

test('state backup round-trips allowlisted state and records hashes without absolute source paths', async t => {
  const f = await fixture(t);
  await put(f.source, 'selected-source.v1.json', '{"version":1,"source":"fixture"}\n');
  await put(f.source, 'chat-export-schedules.v1.json', '{"version":1,"schedules":[]}\n');
  await fs.mkdir(path.join(f.source, 'snapshots'), { mode: 0o700 });
  await put(path.join(f.source, 'snapshots'), 'ignored.tmp', 'plaintext snapshot is excluded');
  const result = await createStateBackup({ sourceDir: f.source, targetFile: f.archive });
  assert.equal(result.schema, SCHEMA);
  assert.equal(result.manifest.files.length, 2);
  assert.equal(result.manifest.files[0].path, 'chat-export-schedules.v1.json');
  assert.equal(result.manifest.files.every(row => /^[a-f0-9]{64}$/.test(row.sha256)), true);
  assert.equal(JSON.stringify(result.manifest).includes(f.source), false);
  const restored = await restoreStateBackup({ sourceFile: f.archive, targetDir: f.destination });
  assert.equal(restored.manifest.aggregateSha256, result.manifest.aggregateSha256);
  assert.deepEqual(await fs.readFile(path.join(f.destination, 'selected-source.v1.json')), await fs.readFile(path.join(f.source, 'selected-source.v1.json')));
  await assert.rejects(fs.access(path.join(f.destination, 'snapshots')), { code: 'ENOENT' });
  assert.equal((await fs.stat(f.archive)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(f.destination)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(f.destination, 'selected-source.v1.json'))).mode & 0o777, 0o600);
});

test('backup rejects relative, overlapping, existing and symlink paths', async t => {
  const f = await fixture(t);
  await put(f.source, 'selected-source.v1.json', '{}');
  await assert.rejects(createStateBackup({ sourceDir: 'relative', targetFile: f.archive }), /STATE_PATH_INVALID/);
  await assert.rejects(createStateBackup({ sourceDir: f.source, targetFile: path.join(f.source, 'backup') }), /STATE_PATH_OVERLAP/);
  await fs.writeFile(f.archive, 'existing', { mode: 0o600 });
  await assert.rejects(createStateBackup({ sourceDir: f.source, targetFile: f.archive }), /STATE_TARGET_EXISTS/);
  const linkTarget = path.join(f.root, 'link-source');
  await fs.symlink(f.source, linkTarget);
  await assert.rejects(createStateBackup({ sourceDir: linkTarget, targetFile: path.join(f.root, 'other') }), /STATE_SYMLINK_DENIED/);
});

test('backup fails closed for unknown or sensitive state and never publishes an archive', async t => {
  const f = await fixture(t);
  await put(f.source, 'password-lock.v1.json', '{}');
  await assert.rejects(createStateBackup({ sourceDir: f.source, targetFile: f.archive }), /STATE_SENSITIVE_FILE_DENIED/);
  await assert.rejects(fs.access(f.archive), { code: 'ENOENT' });
  await fs.rm(path.join(f.source, 'password-lock.v1.json'));
  await put(f.source, 'official-plan-intent.v1.json', '{"ciphertext":"opaque"}');
  await assert.rejects(createStateBackup({ sourceDir: f.source, targetFile: f.archive }), /STATE_SENSITIVE_FILE_DENIED/);
  await fs.rm(path.join(f.source, 'official-plan-intent.v1.json'));
  await put(f.source, 'database-key.txt', 'secret');
  await assert.rejects(createStateBackup({ sourceDir: f.source, targetFile: f.archive }), /STATE_SENSITIVE_FILE_DENIED/);
  await fs.rm(path.join(f.source, 'database-key.txt'));
  await put(f.source, 'unknown.json', '{}');
  await assert.rejects(createStateBackup({ sourceDir: f.source, targetFile: f.archive }), /STATE_ENTRY_UNKNOWN/);
});

test('restore rejects tampering and leaves no partial destination', async t => {
  const f = await fixture(t);
  await put(f.source, 'selected-source.v1.json', '{"ok":true}\n');
  await createStateBackup({ sourceDir: f.source, targetFile: f.archive });
  const bytes = await fs.readFile(f.archive);
  bytes[bytes.length - 1] ^= 0xff;
  const tampered = path.join(f.root, 'tampered.alpha-backup');
  await fs.writeFile(tampered, bytes, { mode: 0o600 });
  await assert.rejects(restoreStateBackup({ sourceFile: tampered, targetDir: f.destination }), /STATE_BACKUP_HASH_MISMATCH|STATE_BACKUP_TAMPERED/);
  await assert.rejects(fs.access(f.destination), { code: 'ENOENT' });
  const existing = path.join(f.root, 'existing'); await fs.mkdir(existing, { mode: 0o700 });
  await assert.rejects(restoreStateBackup({ sourceFile: f.archive, targetDir: existing }), /STATE_TARGET_EXISTS/);
});

test('restore refuses archive symlinks, target overlap and source parent symlinks', async t => {
  const f = await fixture(t);
  await put(f.source, 'selected-source.v1.json', '{}');
  await createStateBackup({ sourceDir: f.source, targetFile: f.archive });
  const archiveLink = path.join(f.root, 'archive-link'); await fs.symlink(f.archive, archiveLink);
  await assert.rejects(restoreStateBackup({ sourceFile: archiveLink, targetDir: f.destination }), /STATE_SYMLINK_DENIED/);
  const sourceParentLink = path.join(f.root, 'source-parent-link'); await fs.symlink(path.dirname(f.archive), sourceParentLink);
  await assert.rejects(restoreStateBackup({ sourceFile: path.join(sourceParentLink, path.basename(f.archive)), targetDir: f.destination }), /STATE_SYMLINK_DENIED/);
  const targetParentLink = path.join(f.root, 'target-parent-link'); await fs.symlink(path.dirname(f.destination), targetParentLink);
  await assert.rejects(restoreStateBackup({ sourceFile: f.archive, targetDir: path.join(targetParentLink, 'restored') }), /STATE_SYMLINK_DENIED/);
  await assert.rejects(restoreStateBackup({ sourceFile: f.archive, targetDir: path.join(f.root, 'new', 'child') }), /STATE_PATH_MISSING/);
});

test('manifest hashes are reproducible for unchanged state', async t => {
  const f = await fixture(t);
  await put(f.source, 'selected-source.v1.json', 'same');
  const second = path.join(f.root, 'second.alpha-backup');
  const first = await createStateBackup({ sourceDir: f.source, targetFile: f.archive });
  const copy = await createStateBackup({ sourceDir: f.source, targetFile: second });
  assert.equal(first.manifest.aggregateSha256, copy.manifest.aggregateSha256);
  assert.equal(crypto.createHash('sha256').update(await fs.readFile(path.join(f.source, 'selected-source.v1.json'))).digest('hex'), first.manifest.files[0].sha256);
});

test('failed temporary cleanup preserves a path that was replaced by another owner', async t => {
  const f = await fixture(t);
  const file = path.join(f.root, 'owned.tmp');
  await fs.writeFile(file, 'owned', { mode: 0o600 });
  const owned = await fs.lstat(file, { bigint: true });
  await fs.unlink(file);
  await fs.writeFile(file, 'preexisting', { mode: 0o600 });
  assert.equal(await removeOwned(file, owned), false);
  assert.equal(await fs.readFile(file, 'utf8'), 'preexisting');
  const directory = path.join(f.root, 'owned-dir');
  await fs.mkdir(directory, { mode: 0o700 });
  const ownedDirectory = await fs.lstat(directory, { bigint: true });
  await fs.rm(directory, { recursive: true });
  await fs.mkdir(directory, { mode: 0o700 });
  await put(directory, 'preserved.json', '{}');
  assert.equal(await removeOwned(directory, ownedDirectory, true), false);
  assert.equal(await fs.readFile(path.join(directory, 'preserved.json'), 'utf8'), '{}');
});
