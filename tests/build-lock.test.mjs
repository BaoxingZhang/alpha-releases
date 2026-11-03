import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { acquireBuildLock } from '../scripts/build-lock.mjs';

async function temporaryLock(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-build-lock-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return path.join(directory, 'lock');
}

test('build lock serializes independent builders and releases by owner token', async t => {
  const lockPath = await temporaryLock(t);
  const release = await acquireBuildLock({ lockPath, timeoutMs: 0 });
  await assert.rejects(acquireBuildLock({ lockPath, timeoutMs: 0, pollIntervalMs: 0 }), /BUILD_LOCK_TIMEOUT/);
  await release();
  const secondRelease = await acquireBuildLock({ lockPath, timeoutMs: 0 });
  await secondRelease();
  assert.equal(await fs.stat(lockPath).then(() => true, () => false), false);
});

test('build lock removes an owner record whose process is no longer alive', async t => {
  const lockPath = await temporaryLock(t);
  await fs.mkdir(lockPath, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(lockPath, 'owner.json'), JSON.stringify({
    schema: 'alpha.recovered.build-lock.v1', token: 'dead-owner', pid: 2147483647, name: 'stale'
  }) + '\n', { mode: 0o600 });
  const release = await acquireBuildLock({ lockPath, timeoutMs: 0 });
  await release();
  assert.equal(await fs.stat(lockPath).then(() => true, () => false), false);
});

test('build lock rejects unsafe paths and invalid timing values', async () => {
  await assert.rejects(acquireBuildLock({ lockPath: 'relative', timeoutMs: 0 }), /BUILD_LOCK_PATH_INVALID/);
  await assert.rejects(acquireBuildLock({ lockPath: path.join(os.tmpdir(), 'alpha-build-lock-invalid'), timeoutMs: -1 }), /BUILD_LOCK_TIMEOUTMS_INVALID/);
});
