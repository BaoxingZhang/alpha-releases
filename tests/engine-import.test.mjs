import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createEncryptedFixture } from './encrypted-fixture.mjs';

const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame, LengthDelimitedFrameDecoder, encodeLengthDelimitedFrame } = require('../packages/alpha-protocol/index.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');
const importerPath = path.join(root, 'build/candidates/alpha-snapshot-import');
const accountId = 'encrypted-synthetic-account';
const helloPayload = { protocol: { major: 1, minor: 0 } };
const success = (reply, name) => { assert.equal(reply.error, undefined, reply.error?.code); assert.ok(reply[name]); return reply[name]; };

async function setup(t) {
  await fs.mkdir(path.join(root, '.runtime'), { recursive: true });
  const base = await fs.mkdtemp(path.join(root, '.runtime/engine-import-'));
  const encrypted = await createEncryptedFixture({ directory: path.join(base, 'fixture') });
  const stateDir = path.join(base, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const engines = [], children = [];
  t.after(async () => { for (const engine of engines) await engine.close(); for (const child of children) await child.close(); await fs.rm(base, { recursive: true, force: true }); });
  async function open(options = {}) {
    const lock = await createSecurity({ stateDir });
    const engine = await createEngine({ lock, stateDir, encryptedDir: encrypted.sourceDir, bridgePath, importerPath, accountId, selfUsername: 'wxid_self', ...options }); engines.push(engine);
    let id = 0n; const call = (method, value = {}) => engine.dispatch(EngineClientFrame.fromPartial({ requestId: ++id, [method]: value }));
    return { call, engine, lock };
  }
  return { ...encrypted, base, stateDir, open, start() { const child = stdio({ stateDir, encryptedDir: encrypted.sourceDir }); children.push(child); return child; } };
}
async function assertNoKey(directory, keyHex) {
  for (const item of await fs.readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!item.isFile()) continue;
    const bytes = await fs.readFile(path.join(item.parentPath, item.name));
    assert.equal(bytes.includes(Buffer.from(keyHex)), false, 'hex key not persisted');
    assert.equal(bytes.includes(Buffer.from(keyHex, 'hex')), false, 'raw key not persisted');
  }
}
async function cleanWork(stateDir) {
  const items = await fs.readdir(path.join(stateDir, 'snapshots')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
  assert.equal(items.some(name => name.startsWith('.work-') || name.startsWith('.alpha-snapshot-')), false);
}
function stdio({ stateDir, encryptedDir }) {
  const child = spawn(process.execPath, [path.join(root, 'packages/alpha-engine/cli.cjs')], { env: { ...process.env, ALPHA_INDEPENDENT_STATE_DIR: stateDir, ALPHA_INDEPENDENT_DATA_DIR: '', ALPHA_INDEPENDENT_ENCRYPTED_DIR: encryptedDir, ALPHA_INDEPENDENT_IMPORTER_PATH: importerPath, ALPHA_INDEPENDENT_BRIDGE_PATH: bridgePath, ALPHA_INDEPENDENT_ACCOUNT_ID: accountId }, stdio: ['pipe', 'pipe', 'pipe'] });
  const decoder = new LengthDelimitedFrameDecoder(), pending = new Map(); let id = 0n, stderr = '';
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', bytes => { for (const frame of decoder.push(bytes)) { const reply = EngineServerFrame.decode(frame), item = pending.get(reply.requestId); if (item) { clearTimeout(item.timer); pending.delete(reply.requestId); item.resolve(reply); } } });
  child.stdin.on('error', () => {});
  child.once('exit', () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(`engine exited: ${stderr}`)); } pending.clear(); });
  return { child, exited, get stderr() { return stderr; },
    call(method, value = {}) { const requestId = ++id; return new Promise((resolve, reject) => { const timer = setTimeout(() => { reject(new Error('test engine timeout')); child.kill('SIGKILL'); }, 15000); pending.set(requestId, { resolve, reject, timer }); const frame = EngineClientFrame.fromPartial({ requestId, [method]: value }); child.stdin.write(encodeLengthDelimitedFrame(EngineClientFrame.encode(frame).finish())); }); },
    async close() { if (child.exitCode !== null || child.signalCode !== null) return; child.stdin.end(); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await exited; clearTimeout(timer); }
  };
}

async function waitForImporterWork(stateDir) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const entries = await fs.readdir(path.join(stateDir, 'snapshots'), { recursive: true }).catch(() => []);
    // Real Go creates this only after reading the stdin key and before PBKDF work.
    if (entries.some(name => path.basename(name).startsWith('.alpha-snapshot-'))) return;
    await delay(5);
  }
  assert.fail('real Go importer did not start');
}

test('real encrypted fixture -> Go importer -> Go bridge only becomes ready after authenticated decryption', async t => {
  const f = await setup(t), { call } = await f.open(); success(await call('hello', helloPayload), 'hello');
  const waiting = success(await call('listAccounts'), 'listAccounts').accounts[0];
  assert.equal(waiting.state, 1); assert.equal(waiting.handleState, 3); assert.equal(waiting.ready, false); assert.equal(waiting.dataSourcePath, f.sourceDir);
  assert.equal(success(await call('discoverAccounts', { sourceLocation: f.sourceDir }), 'discoverAccounts').accounts[0].ready, false);
  assert.equal((await call('selectAccount', { accountId })).error.code, 'DATABASE_KEY_REQUIRED');
  const key = Buffer.from(f.keyHex, 'hex');
  const ready = success(await call('importDatabaseKey', { accountId, databaseKey: key }), 'importDatabaseKey').account;
  assert.equal(ready.ready, true); assert.equal(ready.handleState, 4); assert.ok(key.every(value => value === 0));
  const messages = success(await call('listMessages', { accountId, conversationId: 'wxid_alpha', ascending: true }), 'listMessages').items;
  assert.equal(messages.length, 6); assert.equal(messages[1].text, 'first source'); assert.equal(messages[1].serverId, 9223372036854775807n);
  const manifest = JSON.parse(await fs.readFile(path.join(f.stateDir, 'snapshots/manifest.v1.json'), 'utf8'));
  assert.equal(manifest.version, 2); assert.equal(manifest.databases.length, 4); assert.match(manifest.outputDir, /snapshot-[a-f0-9-]+\/data$/);
  for (const row of manifest.databases) { const stat = await fs.stat(path.join(manifest.outputDir, row.relativePath)); assert.equal(stat.mode & 0o777, 0o600); assert.equal(stat.size, row.bytes); assert.equal(row.pages, row.bytes / 4096); }
  await assertNoKey(f.stateDir, f.keyHex); await cleanWork(f.stateDir);
});

test('watchDatabaseKeyAcquisition reports the bounded terminal journal and supports cursors', async t => {
  const f = await setup(t), { call } = await f.open(); await call('hello', helloPayload);
  const initial = success(await call('watchDatabaseKeyAcquisition', { accountId }), 'watchDatabaseKeyAcquisition');
  assert.equal(initial.active, false); assert.deepEqual(initial.events, []); assert.equal(initial.lastEventSeq, 0n);
  success(await call('importDatabaseKey', { accountId, databaseKey: Buffer.from(f.keyHex, 'hex') }), 'importDatabaseKey');
  const watched = success(await call('watchDatabaseKeyAcquisition', { accountId }), 'watchDatabaseKeyAcquisition');
  assert.equal(watched.active, false); assert.ok(watched.events.length >= 6); assert.ok(watched.lastEventSeq >= 6n);
  for (let index = 0; index < watched.events.length; index += 1) {
    const event = watched.events[index];
    assert.equal(event.eventSeq, BigInt(index + 1));
    assert.ok(event.eventSeq <= watched.lastEventSeq);
    assert.ok(event.phase >= 0 && event.phase <= 6);
    assert.ok(event.completedSteps >= 0 && event.completedSteps <= event.totalSteps);
    assert.match(event.messageKey, /^[a-zA-Z0-9._-]*$/);
    assert.equal(event.messageKey.includes(f.keyHex), false);
  }
  const terminal = watched.events.at(-1);
  assert.equal(terminal.phase, 6); assert.equal(terminal.completedSteps, terminal.totalSteps); assert.equal(terminal.terminal, true); assert.equal(terminal.errorCode, '');
  const after = success(await call('watchDatabaseKeyAcquisition', { accountId, afterEventSeq: watched.lastEventSeq }), 'watchDatabaseKeyAcquisition');
  assert.equal(after.active, false); assert.deepEqual(after.events, []); assert.equal(after.lastEventSeq, watched.lastEventSeq);
  await assertNoKey(f.stateDir, f.keyHex);
});

test('watchDatabaseKeyAcquisition drops old events at the process-local history bound', async t => {
  const f = await setup(t), importer = path.join(f.base, 'bounded-import-failure.cjs');
  await fs.writeFile(importer, `#!${process.execPath}\nprocess.stdin.resume(); process.stdin.on('end',()=>process.stdout.write('{}'));\n`, { mode: 0o700 });
  const { call } = await f.open({ importerPath: importer, importerTimeoutMs: 3000 }); await call('hello', helloPayload);
  for (let index = 0; index < 70; index += 1) {
    const key = Buffer.from(f.keyHex, 'hex');
    assert.equal((await call('importDatabaseKey', { accountId, databaseKey: key })).error.code, 'IMPORT_SUMMARY_INVALID');
    assert.ok(key.every(value => value === 0));
  }
  const watched = success(await call('watchDatabaseKeyAcquisition', { accountId }), 'watchDatabaseKeyAcquisition');
  assert.equal(watched.active, false); assert.equal(watched.events.length, 64); assert.equal(watched.events[0].eventSeq, watched.lastEventSeq - 63n); assert.equal(watched.events.at(-1).terminal, true);
});

test('restart validates both cached plaintext hashes and same encrypted source without invoking importer', async t => {
  const f = await setup(t), first = await f.open(); await first.call('hello', helloPayload); success(await first.call('importDatabaseKey', { accountId, databaseKey: Buffer.from(f.keyHex, 'hex') }), 'importDatabaseKey'); await first.engine.close();
  const second = await f.open({ importerPath: '/deliberately/nonexistent/importer' }); await second.call('hello', helloPayload);
  assert.equal(success(await second.call('listAccounts'), 'listAccounts').accounts[0].ready, true); await second.engine.close();
  const file = path.join(f.sourceDir, 'contact/contact.db'), bytes = await fs.readFile(file); bytes[64] ^= 1; await fs.writeFile(file, bytes);
  const third = await f.open(); await third.call('hello', helloPayload);
  assert.equal(success(await third.call('listAccounts'), 'listAccounts').accounts[0].ready, false);
  await assertNoKey(f.stateDir, f.keyHex);
});

test('wrong key fails authentication, clears work/key and permits a subsequent correct import', async t => {
  const f = await setup(t), { call } = await f.open(); await call('hello', helloPayload);
  const wrong = Buffer.alloc(32, 0xff); assert.equal((await call('importDatabaseKey', { accountId, databaseKey: wrong })).error.code, 'KEY_AUTHENTICATION_FAILED'); assert.ok(wrong.every(n => n === 0));
  assert.equal(success(await call('listAccounts'), 'listAccounts').accounts[0].ready, false); await cleanWork(f.stateDir);
  success(await call('importDatabaseKey', { accountId, databaseKey: Buffer.from(f.keyHex, 'hex') }), 'importDatabaseKey'); await assertNoKey(f.stateDir, f.keyHex);
});

test('every early import error erases key and filesystem setup failure does not leave busy state', async t => {
  const f = await setup(t), { call } = await f.open(); await call('hello', helloPayload);
  const invalid = Buffer.from(f.keyHex, 'hex'); assert.equal((await call('importDatabaseKey', { accountId: 'wrong', databaseKey: invalid })).error.code, 'DATABASE_KEY_INVALID'); assert.ok(invalid.every(n => n === 0));
  const snapshots = path.join(f.stateDir, 'snapshots'); await fs.writeFile(snapshots, 'blocked');
  const blocked = Buffer.from(f.keyHex, 'hex'); assert.ok((await call('importDatabaseKey', { accountId, databaseKey: blocked })).error); assert.ok(blocked.every(n => n === 0));
  await fs.unlink(snapshots); success(await call('importDatabaseKey', { accountId, databaseKey: Buffer.from(f.keyHex, 'hex') }), 'importDatabaseKey');
});

test('real stdio stays responsive during Go import: duplicate rejection, status, lock cancellation and EOF cleanup', async t => {
  const f = await setup(t), c = f.start(); success(await c.call('hello', helloPayload), 'hello');
  const password = 'Synthetic import password'; success(await c.call('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from(password) }), 'configureApplicationLock');
  const importing = c.call('importDatabaseKey', { accountId, databaseKey: Buffer.from(f.keyHex, 'hex') });
  await waitForImporterWork(f.stateDir);
  const active = success(await c.call('watchDatabaseKeyAcquisition', { accountId }), 'watchDatabaseKeyAcquisition');
  assert.equal(active.active, true); assert.ok(active.events.some(event => event.phase === 3 && event.terminal === false));
  assert.equal((await c.call('importDatabaseKey', { accountId, databaseKey: Buffer.from(f.keyHex, 'hex') })).error.code, 'IMPORT_BUSY');
  const start = Date.now(); assert.equal(success(await c.call('getApplicationLockStatus'), 'getApplicationLockStatus').status.locked, false);
  assert.equal(success(await c.call('lockApplication'), 'lockApplication').status.locked, true); assert.ok(Date.now() - start < 2000);
  assert.ok(['APP_LOCK_LOCKED', 'IMPORT_CANCELED'].includes((await importing).error.code)); await cleanWork(f.stateDir);
  const canceled = success(await c.call('watchDatabaseKeyAcquisition', { accountId }), 'watchDatabaseKeyAcquisition');
  assert.equal(canceled.active, false); assert.equal(canceled.events.at(-1).terminal, true); assert.ok(['APP_LOCK_LOCKED', 'IMPORT_CANCELED'].includes(canceled.events.at(-1).errorCode));
  success(await c.call('unlockApplication', { password: Buffer.from(password) }), 'unlockApplication');
  const pending = c.call('importDatabaseKey', { accountId, databaseKey: Buffer.from(f.keyHex, 'hex') }); await waitForImporterWork(f.stateDir); c.child.stdin.end();
  assert.equal((await pending).error.code, 'IMPORT_CANCELED'); assert.equal((await c.exited).code, 0);
  await cleanWork(f.stateDir); await assertNoKey(f.stateDir, f.keyHex); assert.equal(c.stderr, '');
});

test('fault injection only: importer timeout, bounded output and malformed summary clean up and never publish', async t => {
  const f = await setup(t);
  for (const [name, content, expected] of [
    ['timeout', 'process.stdin.resume(); setInterval(()=>{},1000);', 'IMPORT_TIMEOUT'],
    ['overflow', "process.stdin.resume(); process.stdout.write('x'.repeat(3*1024*1024));", 'IMPORT_OUTPUT_TOO_LARGE'],
    ['malformed', "process.stdin.resume(); process.stdin.on('end',()=>process.stdout.write('{}'));", 'IMPORT_SUMMARY_INVALID']
  ]) {
    const executable = path.join(f.base, name + '.cjs'); await fs.writeFile(executable, `#!${process.execPath}\n${content}\n`, { mode: 0o700 });
    const { call, engine } = await f.open({ importerPath: executable, importerTimeoutMs: name === 'timeout' ? 100 : 3000 }); await call('hello', helloPayload);
    const key = Buffer.from(f.keyHex, 'hex'); assert.equal((await call('importDatabaseKey', { accountId, databaseKey: key })).error.code, expected); assert.ok(key.every(n => n === 0));
    const watched = success(await call('watchDatabaseKeyAcquisition', { accountId }), 'watchDatabaseKeyAcquisition');
    assert.equal(watched.active, false); assert.equal(watched.events.at(-1).terminal, true); assert.equal(watched.events.at(-1).errorCode, expected);
    assert.equal(success(await call('listAccounts'), 'listAccounts').accounts[0].ready, false); await cleanWork(f.stateDir); await engine.close();
  }
});
