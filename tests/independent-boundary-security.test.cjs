'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const runtime = path.resolve(__dirname, '../.runtime');
const bytes = value => new TextEncoder().encode(value);
function stateDirectory(t) {
  fs.mkdirSync(runtime, { recursive: true });
  const directory = fs.mkdtempSync(path.join(runtime, 'independent-boundary-security-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('independent lock rejects a dangling state symlink instead of becoming unconfigured', async t => {
  const stateDir = stateDirectory(t);
  fs.symlinkSync(path.join(stateDir, 'missing-state'), path.join(stateDir, 'password-lock.v1.json'));
  await assert.rejects(createSecurity({ stateDir }));
});

test('a successful explicit lock cannot be undone by an earlier pending unlock', async t => {
  const stateDir = stateDirectory(t);
  const lock = await createSecurity({ stateDir });
  const secret = bytes('Synthetic test passphrase 123');
  await lock.configure({ action: 'enable_password', newPassword: secret });
  lock.lock();
  const pendingUnlock = lock.unlock(secret);
  let lockAccepted = false;
  try { lockAccepted = lock.lock().locked; }
  catch (error) { assert.equal(error.message, 'APP_LOCK_BUSY'); }
  await pendingUnlock;
  if (lockAccepted) assert.equal(lock.status().locked, true);
});

test('password failure and throttling survive restart, and a restarted configured lock denies access', async t => {
  const stateDir = stateDirectory(t);
  const lock = await createSecurity({ stateDir });
  const secret = bytes('Another synthetic password 456');
  await lock.configure({ action: 'enable_password', newPassword: secret });
  lock.lock();
  await assert.rejects(lock.unlock(bytes('A wrong synthetic password')), { message: 'APP_LOCK_PASSWORD_INCORRECT' });
  const restored = await createSecurity({ stateDir });
  const status = restored.status();
  assert.equal(status.locked, true);
  assert.equal(status.verified, false);
  assert.equal(status.helloAvailable, false);
  assert.equal(status.helloConfigured, false);
  assert.equal(status.hardwareProtection, 1);
  assert.equal(status.passwordFailedAttempts, 1);
  assert.ok(status.passwordRetryAfterMs > 0n);
  assert.throws(() => restored.assertAccess(), { message: 'APP_LOCK_LOCKED' });
  await assert.rejects(restored.unlock(secret), { message: 'APP_LOCK_PASSWORD_THROTTLED' });
  const stored = fs.readFileSync(path.join(stateDir, 'password-lock.v1.json'), 'utf8');
  assert.equal(stored.includes('Another synthetic password'), false);
});

test('missing established state fails closed even after a successful unlock', async t => {
  const stateDir = stateDirectory(t);
  const lock = await createSecurity({ stateDir });
  await lock.configure({ action: 'enable_password', newPassword: bytes('Synthetic password 789') });
  assert.doesNotThrow(() => lock.assertAccess());
  fs.unlinkSync(path.join(stateDir, 'password-lock.v1.json'));
  assert.throws(() => lock.assertAccess(), { message: 'APP_LOCK_STATE_INVALID' });
  assert.throws(() => lock.status(), { message: 'APP_LOCK_STATE_INVALID' });
});

test('persisted malformed state and world-readable credentials are rejected', async t => {
  const malformedDir = stateDirectory(t);
  fs.writeFileSync(path.join(malformedDir, 'password-lock.v1.json'), '{broken', { mode: 0o600 });
  await assert.rejects(createSecurity({ stateDir: malformedDir }));
  const publicDir = stateDirectory(t);
  const publicFile = path.join(publicDir, 'password-lock.v1.json');
  fs.writeFileSync(publicFile, JSON.stringify({ version: 1, enabled: false, attempts: 0, retryAt: 0 }), { mode: 0o644 });
  fs.chmodSync(publicFile, 0o644);
  await assert.rejects(createSecurity({ stateDir: publicDir }));
});
