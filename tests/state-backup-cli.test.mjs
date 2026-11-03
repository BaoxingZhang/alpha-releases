import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('..', import.meta.url));
const backupScript = path.join(root, 'scripts', 'backup-independent-state.mjs');
const restoreScript = path.join(root, 'scripts', 'restore-independent-state.mjs');

async function run(script, args) {
  return execFileAsync(process.execPath, [script, ...args], {
    cwd: root,
    maxBuffer: 1024 * 1024,
    windowsHide: true
  });
}

test('state backup and restore CLIs round-trip an allowlisted state directory', async t => {
  const tempRoot = await fs.realpath(os.tmpdir());
  const work = await fs.mkdtemp(path.join(tempRoot, 'alpha-state-backup-cli-'));
  t.after(() => fs.rm(work, { recursive: true, force: true }));
  const source = path.join(work, 'source');
  const archive = path.join(work, 'state.alpha-backup');
  const restored = path.join(work, 'restored');
  await fs.mkdir(source, { mode: 0o700 });
  await fs.chmod(source, 0o700);
  await fs.writeFile(path.join(source, 'selected-source.v1.json'), '{"version":1,"source":"fixture"}\n', { mode: 0o600 });
  await fs.chmod(path.join(source, 'selected-source.v1.json'), 0o600);

  const backup = await run(backupScript, ['--source', source, '--target', archive]);
  const backupResult = JSON.parse(backup.stdout);
  assert.equal(backupResult.schema, 'alpha-independent-state-backup.v1');
  assert.equal(backupResult.targetFile, archive);
  assert.deepEqual(backupResult.manifest.files.map(row => row.path), ['selected-source.v1.json']);
  assert.equal((await fs.stat(archive)).mode & 0o777, 0o600);

  const restore = await run(restoreScript, ['--source', archive, '--target', restored]);
  const restoreResult = JSON.parse(restore.stdout);
  assert.equal(restoreResult.schema, 'alpha-independent-state-backup.v1');
  assert.equal(restoreResult.targetDir, restored);
  assert.equal(restoreResult.manifest.aggregateSha256, backupResult.manifest.aggregateSha256);
  assert.equal(await fs.readFile(path.join(restored, 'selected-source.v1.json'), 'utf8'), '{"version":1,"source":"fixture"}\n');
  assert.equal((await fs.stat(restored)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(path.join(restored, 'selected-source.v1.json'))).mode & 0o777, 0o600);
});

test('state backup CLI rejects malformed arguments without creating output', async t => {
  const tempRoot = await fs.realpath(os.tmpdir());
  const work = await fs.mkdtemp(path.join(tempRoot, 'alpha-state-backup-cli-'));
  t.after(() => fs.rm(work, { recursive: true, force: true }));
  const target = path.join(work, 'unexpected.alpha-backup');
  await assert.rejects(run(backupScript, ['--target', target]), error => {
    assert.equal(error.code, 2);
    assert.match(error.stderr, /USAGE: --source \/absolute\/state/);
    return true;
  });
  await assert.rejects(fs.access(target), { code: 'ENOENT' });
});
