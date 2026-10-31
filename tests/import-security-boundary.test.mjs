import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createEncryptedFixture, cleanupEncryptedFixtureHelper } from './encrypted-fixture.mjs';
const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { BridgeClient } = require('../packages/alpha-engine/bridge-client.cjs');
const { EngineClientFrame } = require('../packages/alpha-protocol/index.cjs');
const snapshotStore = require('../packages/alpha-engine/snapshot-store.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');
const importerPath = path.join(root, 'build/candidates/alpha-snapshot-import');
const base = path.join(root, '.runtime', `import-security-boundary-${process.pid}`);
const accountId = 'synthetic-import-boundary';
const password = 'Synthetic import boundary password';
let fixture;
test.before(async () => {
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  fixture = await createEncryptedFixture({ directory: path.join(base, 'fixture') });
});
test.after(async () => { await fs.rm(base, { recursive: true, force: true }); await cleanupEncryptedFixtureHelper(); });

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(base, 'case-'));
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const encryptedDir = path.join(directory, 'encrypted');
  await fs.cp(fixture.sourceDir, encryptedDir, { recursive: true });
  const snapshotRoot = path.join(stateDir, 'snapshots');
  let lock = await createSecurity({ stateDir });
  let engine;
  const close = async () => { if (engine) await engine.close(); engine = null; };
  t.after(close);
  const open = async options => {
    await close();
    lock = await createSecurity({ stateDir });
    engine = await createEngine({ lock, stateDir, bridgePath, importerPath, encryptedDir, accountId, ...options });
    let requestId = 0n;
    return (method, value = {}) => engine.dispatch(EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: value }));
  };
  const manifest = async () => JSON.parse(await fs.readFile(path.join(snapshotRoot, 'manifest.v1.json'), 'utf8'));
  return { directory, stateDir, encryptedDir, snapshotRoot, open, close, manifest };
}
async function hello(call) {
  const result = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.ok(result.hello, result.error?.code);
}
async function importValid(call) {
  const databaseKey = Buffer.from(fixture.keyHex, 'hex');
  const result = await call('importDatabaseKey', { accountId, databaseKey });
  assert.ok(result.importDatabaseKey?.account.ready, result.error?.code);
  assert.ok(databaseKey.every(value => value === 0));
}
async function assertRestartNotReady(context, options = {}) {
  let call;
  try { call = await context.open(options); }
  catch (error) { assert.match(error.message, /SNAPSHOT_|SOURCE_CHANGED/); return; }
  const greeting = await call('hello', { protocol: { major: 1, minor: 0 } });
  if (greeting.error) { assert.match(greeting.error.code, /SNAPSHOT_|SOURCE_CHANGED/); return; }
  const accounts = await call('listAccounts');
  if (accounts.error) assert.match(accounts.error.code, /SNAPSHOT_|SOURCE_CHANGED/);
  else assert.equal(accounts.listAccounts.accounts.some(account => account.ready), false);
}
async function waitForTemporaryPlaintext(snapshotRoot) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const entries = await fs.readdir(snapshotRoot, { recursive: true, withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.db') || !entry.parentPath.includes('.alpha-snapshot-')) continue;
      const stat = await fs.stat(path.join(entry.parentPath, entry.name)).catch(() => null);
      if (stat?.size > 0) return;
    }
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.fail('Real importer must reach its unpublished plaintext stage before cancellation');
}

test('valid-but-modified decrypted snapshot is rejected after restart even when its timestamp is restored', async t => {
  const context = await setup(t); const call = await context.open(); await hello(call); await importValid(call); await context.close();
  const manifest = await context.manifest();
  const file = path.join(manifest.outputDir, 'contact/contact.db');
  const stat = await fs.stat(file), bytes = await fs.readFile(file);
  const before = Buffer.from('合成联系人甲'), replacement = Buffer.from('合成联系人乙');
  const offset = bytes.indexOf(before); assert.ok(offset >= 0); assert.equal(before.length, replacement.length);
  replacement.copy(bytes, offset); await fs.writeFile(file, bytes); await fs.utimes(file, stat.atime, stat.mtime);
  await assertRestartNotReady(context);
});

test('manifest cannot redirect a verified snapshot outside its assigned snapshot root', async t => {
  const context = await setup(t); const call = await context.open(); await hello(call); await importValid(call); await context.close();
  const manifest = await context.manifest();
  manifest.outputDir = fixture.plaintextDir;
  await fs.writeFile(path.join(context.snapshotRoot, 'manifest.v1.json'), JSON.stringify(manifest));
  let outsideStarts = 0;
  await assertRestartNotReady(context, { bridgeFactory(options) {
    if (!options.dataDir.startsWith(context.snapshotRoot + path.sep)) { outsideStarts++; throw new Error('OUTSIDE_SNAPSHOT_OPEN'); }
    return new BridgeClient(options);
  } });
  assert.equal(outsideStarts, 0);
});

test('locked initialization does not fingerprint or open the encrypted source', async t => {
  const context = await setup(t); let call = await context.open(); await hello(call); await importValid(call);
  assert.ok((await call('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from(password) })).configureApplicationLock);
  await context.close();
  const hidden = context.encryptedDir + '-temporarily-unavailable';
  await fs.rename(context.encryptedDir, hidden);
  try {
    call = await context.open(); await hello(call);
    assert.equal((await call('listAccounts')).error?.code, 'APP_LOCK_LOCKED');
  } finally { await fs.rename(hidden, context.encryptedDir); }
  assert.ok((await call('unlockApplication', { password: Buffer.from(password) })).unlockApplication);
  const accounts = await call('listAccounts');
  assert.ok(accounts.listAccounts?.accounts[0].ready, accounts.error?.code);
});

test('import key is erased even when account validation or the lock rejects it before import', async t => {
  const context = await setup(t); const call = await context.open(); await hello(call);
  const invalidKey = Buffer.from(fixture.keyHex, 'hex');
  const invalid = await call('importDatabaseKey', { accountId: 'wrong-account', databaseKey: invalidKey });
  assert.ok(invalid.error); assert.ok(invalidKey.every(value => value === 0));
  assert.ok((await call('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from(password) })).configureApplicationLock);
  assert.ok((await call('lockApplication')).lockApplication);
  const lockedKey = Buffer.from(fixture.keyHex, 'hex');
  assert.equal((await call('importDatabaseKey', { accountId, databaseKey: lockedKey })).error?.code, 'APP_LOCK_LOCKED');
  assert.ok(lockedKey.every(value => value === 0));
});

test('closing the engine cancels import and removes all unpublished plaintext work directories', async t => {
  const context = await setup(t); const call = await context.open(); await hello(call);
  const key = Buffer.from(fixture.keyHex, 'hex');
  const pending = call('importDatabaseKey', { accountId, databaseKey: key });
  await waitForTemporaryPlaintext(context.snapshotRoot);
  await context.close();
  const result = await pending;
  assert.ok(result.error, 'cancelled import cannot report a ready account');
  assert.ok(key.every(value => value === 0));
  const remaining = await fs.readdir(context.snapshotRoot).catch(() => []);
  assert.deepEqual(remaining, [], 'all task-owned unpublished plaintext must be removed');
});

test('locking during a real import stops it and removes plaintext before reporting locked', async t => {
  const context = await setup(t); const call = await context.open(); await hello(call);
  assert.ok((await call('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from(password) })).configureApplicationLock);
  const key = Buffer.from(fixture.keyHex, 'hex');
  const pending = call('importDatabaseKey', { accountId, databaseKey: key });
  await waitForTemporaryPlaintext(context.snapshotRoot);
  const locked = await call('lockApplication');
  assert.equal(locked.lockApplication?.status.locked, true, locked.error?.code);
  assert.ok((await pending).error);
  assert.ok(key.every(value => value === 0));
  assert.deepEqual(await fs.readdir(context.snapshotRoot), []);
  assert.equal((await call('listAccounts')).error?.code, 'APP_LOCK_LOCKED');
});

test('locking after manifest commit preserves a complete snapshot and never leaves a dangling manifest', async t => {
  const context = await setup(t); let call = await context.open(); await hello(call);
  assert.ok((await call('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from(password) })).configureApplicationLock);
  const original = snapshotStore.writeManifest;
  let committed, release;
  const atCommit = new Promise(resolve => { committed = resolve; });
  const resumed = new Promise(resolve => { release = resolve; });
  snapshotStore.writeManifest = async (...args) => { await original(...args); committed(); await resumed; };
  const pending = call('importDatabaseKey', { accountId, databaseKey: Buffer.from(fixture.keyHex, 'hex') });
  let locked;
  try {
    await atCommit;
    locked = call('lockApplication');
    release();
    assert.equal((await locked).lockApplication?.status.locked, true);
    assert.equal((await pending).error?.code, 'APP_LOCK_LOCKED');
  } finally { release(); snapshotStore.writeManifest = original; }
  const manifest = await context.manifest();
  for (const row of manifest.databases) assert.ok((await fs.stat(path.join(manifest.outputDir, row.relativePath))).isFile());
  call = await context.open(); await hello(call);
  assert.equal((await call('listAccounts')).error?.code, 'APP_LOCK_LOCKED');
  assert.ok((await call('unlockApplication', { password: Buffer.from(password) })).unlockApplication);
  assert.ok((await call('listAccounts')).listAccounts?.accounts[0].ready);
});

test('persisted successful import state never contains its database key or application password', async t => {
  const context = await setup(t); const call = await context.open(); await hello(call);
  assert.ok((await call('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from(password) })).configureApplicationLock);
  await importValid(call);
  const key = Buffer.from(fixture.keyHex, 'hex');
  const files = await fs.readdir(context.stateDir, { recursive: true, withFileTypes: true });
  for (const entry of files) if (entry.isFile()) {
    const bytes = await fs.readFile(path.join(entry.parentPath, entry.name));
    assert.equal(bytes.includes(Buffer.from(fixture.keyHex)), false, entry.name);
    assert.equal(bytes.includes(key), false, entry.name);
    assert.equal(bytes.includes(Buffer.from(password)), false, entry.name);
  }
});
