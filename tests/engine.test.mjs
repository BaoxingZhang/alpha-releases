import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createFixture } from './data-bridge-fixture.mjs';

const require = createRequire(import.meta.url);
const { EngineClientFrame, EngineServerFrame, LengthDelimitedFrameDecoder, encodeLengthDelimitedFrame, DEFAULT_MAX_FRAME_BYTES } = require('../packages/alpha-protocol/index.cjs');
const { createEngine, SUPPORTED, ALL_METHODS } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { BridgeClient } = require('../packages/alpha-engine/bridge-client.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');
const cli = path.join(root, 'packages/alpha-engine/cli.cjs');
const accountId = 'synthetic-account';
const helloRequest = { protocol: { major: 1, minor: 0 }, desktopVersion: 'synthetic-test' };

async function fixture(t, withData = true) {
  const base = path.join(root, '.runtime/engine-tests');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'case-'));
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const dataDir = withData ? path.join(directory, 'data') : '';
  if (withData) await createFixture(dataDir);
  const clients = [];
  t.after(async () => { for (const c of clients) await c.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, stateDir, dataDir, start(extra = {}) { const c = stdioClient({ stateDir, dataDir, ...extra }); clients.push(c); return c; } };
}

function stdioClient({ stateDir, dataDir = '', ...extra }) {
  const child = spawn(process.execPath, [cli], { env: { ...process.env,
    ALPHA_INDEPENDENT_STATE_DIR: stateDir,
    ALPHA_INDEPENDENT_BRIDGE_PATH: bridgePath,
    ALPHA_INDEPENDENT_DATA_DIR: dataDir,
    ALPHA_INDEPENDENT_ACCOUNT_ID: dataDir ? accountId : '',
    ALPHA_INDEPENDENT_SELF_USERNAME: dataDir ? 'wxid_self' : '', ...extra }, stdio: ['pipe', 'pipe', 'pipe'] });
  const decoder = new LengthDelimitedFrameDecoder();
  const pending = new Map(), unsolicited = [], eventWaiters = [];
  let sequence = 0n, diagnostics = '', protocolError;
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  child.stderr.on('data', data => { diagnostics += data; });
  child.stdout.on('data', data => {
    try { for (const bytes of decoder.push(data)) {
      const response = EngineServerFrame.decode(bytes), waiter = pending.get(response.requestId);
      if (waiter) { clearTimeout(waiter.timer); pending.delete(response.requestId); waiter.resolve(response); }
      else if (eventWaiters.length) eventWaiters.shift()(response);
      else unsolicited.push(response);
    } } catch (error) { protocolError = error; child.kill(); }
  });
  child.on('error', error => { protocolError = error; });
  child.once('exit', () => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(protocolError || new Error('ENGINE_EXITED')); } pending.clear(); });
  child.stdin.on('error', () => {});
  function prepare(method, payload = {}, id = ++sequence) {
    const frame = EngineClientFrame.fromPartial({ requestId: id, [method]: payload });
    const bytes = encodeLengthDelimitedFrame(EngineClientFrame.encode(frame).finish());
    const reply = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('TEST_ENGINE_TIMEOUT')); child.kill(); }, 5000);
      pending.set(id, { resolve, reject, timer });
    });
    return { bytes, reply };
  }
  return { child, exited,
    send(method, payload = {}) { const request = prepare(method, payload); child.stdin.write(request.bytes); return request.reply; },
    async split(method, payload = {}) { const request = prepare(method, payload); for (const piece of [request.bytes.subarray(0, 1), request.bytes.subarray(1, 3), request.bytes.subarray(3, 8), request.bytes.subarray(8)]) { child.stdin.write(piece); await delay(1); } return request.reply; },
    batch(requests) { const entries = requests.map(([method, payload]) => prepare(method, payload)); child.stdin.write(Buffer.concat(entries.map(entry => entry.bytes))); return Promise.all(entries.map(entry => entry.reply)); },
    event() { return unsolicited.length ? Promise.resolve(unsolicited.shift()) : new Promise(resolve => eventWaiters.push(resolve)); },
    get diagnostics() { return diagnostics; },
    async close() { if (child.exitCode !== null || child.signalCode !== null) return; child.stdin.end(); const timer = setTimeout(() => child.kill('SIGKILL'), 2000); try { await exited; } finally { clearTimeout(timer); } }
  };
}
const ok = (response, key) => { assert.equal(response.error, undefined, JSON.stringify(response.error)); assert.ok(response[key]); return response[key]; };
const handshake = async c => ok(await c.send('hello', helloRequest), 'hello');
async function pages(c, method, params, pageSize = 2) {
  const items = []; let cursor = new Uint8Array();
  for (let i = 0; i < 20; i++) {
    const result = ok(await c.send(method, { ...params, page: { pageSize, cursor } }), method);
    items.push(...result.items); if (!result.nextCursor.length) return items;
    assert.notDeepEqual(result.nextCursor, cursor); cursor = result.nextCursor;
  }
  assert.fail('Pagination did not terminate');
}

test('Node stdio accepts split/coalesced frames and advertises exactly its implemented protobuf methods', async t => {
  const f = await fixture(t, false), c = f.start();
  const hello = ok(await c.split('hello', helloRequest), 'hello');
  assert.equal(hello.components[0].component, 'alpha-independent-engine');
  assert.deepEqual(hello.negotiatedProtocol, { major: 1, minor: 0 });
  assert.equal(hello.serverNonce.length, 16);
  const map = JSON.parse(await fs.readFile(path.join(root, 'docs/backend-compatibility-map.json'), 'utf8'));
  const expectedIds = map.requests.filter(entry => Object.hasOwn(SUPPORTED, entry.request)).map(entry => entry.alpha.fieldNumber).sort((a,b) => a-b);
  assert.deepEqual(hello.supportedMethodIds, expectedIds);
  const replies = await c.batch([['getCapabilities', {}], ['listAccounts', {}], ['getApplicationLockStatus', {}]]);
  assert.deepEqual(replies.map(reply => reply.requestId), [2n, 3n, 4n]);
  assert.equal(ok(replies[0], 'getCapabilities').entitlements, undefined);
  assert.deepEqual(ok(replies[1], 'listAccounts').accounts, []);
  const status = ok(replies[2], 'getApplicationLockStatus').status;
  assert.equal(status.enabled, false); assert.equal(status.provider, 'alpha-independent-password-v1');
  await c.close(); assert.equal((await c.exited).code, 0); assert.equal(c.diagnostics, '');
});

test('real Go SQLite data crosses protobuf with pagination, exact identifiers and persistent selection', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  const accounts = ok(await c.send('listAccounts'), 'listAccounts');
  assert.equal(accounts.accounts.length, 1); const account = accounts.accounts[0];
  assert.equal(account.id, accountId); assert.equal(account.handleState, 4); assert.equal(account.ready, true); assert.equal(account.selected, false);
  assert.deepEqual(account.capabilities, ['offline-readonly', 'contacts', 'conversations', 'messages']);
  assert.equal(account.subjectId, 'wxid_self');
  assert.equal(ok(await c.send('discoverAccounts', { sourceLocation: f.dataDir }), 'discoverAccounts').accounts[0].id, accountId);
  assert.equal((await c.send('discoverAccounts', { sourceLocation: path.dirname(f.dataDir) })).error.code, 'SOURCE_NOT_AUTHORIZED');
  assert.equal(ok(await c.send('selectAccount', { accountId }), 'selectAccount').account.selected, true);
  const contacts = ok(await c.send('listContacts', { accountId, ascending: true, limit: 100 }), 'listContacts').response.items;
  assert.deepEqual(contacts.map(x => x.username), ['wxid_alpha', 'wxid_beta', 'wxid_self']);
  const exact = ok(await c.send('listContacts', { accountId, ascending: true, query: '__alpha_contact_exact:wxid_alpha' }), 'listContacts').response.items;
  assert.equal(exact.length, 1); assert.equal(exact[0].displayName, '合成联系人甲');
  assert.equal(ok(await c.send('listContacts', { accountId, ascending: true, offset: 1, limit: 1 }), 'listContacts').response.items[0].username, 'wxid_beta');
  const conversations = await pages(c, 'listConversations', { accountId }, 1);
  assert.deepEqual(conversations.map(x => x.id), ['wxid_alpha', 'wxid_beta']);
  assert.equal(conversations[0].displayName, '合成联系人甲'); assert.equal(conversations[1].displayName, 'Beta');
  const messages = await pages(c, 'listMessages', { accountId, conversationId: 'wxid_alpha', ascending: true });
  assert.equal(messages.length, 6); assert.equal(new Set(messages.map(x => x.id)).size, 6);
  assert.deepEqual(messages.slice(0,5).map(x => x.text), ['earlier shard', 'first source', 'second source', 'same sequence', 'cross shard tie']);
  assert.equal(messages[1].serverId, 9223372036854775807n); assert.equal(messages[1].localId, 0);
  assert.equal(JSON.parse(Buffer.from(messages[1].sourceToken.slice('independent1_'.length), 'base64url').toString()).localId, '9007199254740993');
  assert.equal(messages[1].direction, 1); assert.equal(messages[2].direction, 2);
  assert.ok(messages[5].kind === 'unsupported' || messages[5].text.length > 0);
  const reversed = await pages(c, 'listMessages', { accountId, conversationId: 'wxid_alpha', ascending: false }, 1);
  assert.deepEqual(reversed.map(x => x.id), messages.map(x => x.id).toReversed());
  const revision = ok(await c.send('getDataRevision', { accountId }), 'getDataRevision').revision;
  assert.match(revision, /^[0-9a-f]{16}$/);
  await c.close(); const reopened = f.start(); await handshake(reopened);
  assert.equal(ok(await reopened.send('listAccounts'), 'listAccounts').selectedAccountId, accountId);
  assert.equal(ok(await reopened.send('getDataRevision', { accountId }), 'getDataRevision').revision, revision);
});

test('message time filters preserve exclusive milliseconds and opaque cursor scope', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  const request = { accountId, conversationId: 'wxid_alpha', ascending: true };
  const filtered = ok(await c.send('listMessages', { ...request, afterUnixMs: 1700000000000n, beforeUnixMs: 1700000003001n }), 'listMessages');
  assert.deepEqual(filtered.items.map(x => x.text), ['second source', 'same sequence', 'cross shard tie']);
  assert.equal(filtered.appliedAfterUnixMs, 1700000000000n); assert.equal(filtered.appliedBeforeUnixMs, 1700000003001n);
  for (const bounds of [{ afterUnixMs: 1700000000000n, beforeUnixMs: 1700000000001n }, { beforeUnixMs: 0n }]) {
    const empty = ok(await c.send('listMessages', { ...request, ...bounds }), 'listMessages');
    assert.deepEqual(empty.items, []); assert.equal(empty.nextCursor.length, 0);
  }
  const first = ok(await c.send('listMessages', { ...request, page: { pageSize: 1 } }), 'listMessages');
  assert.match(Buffer.from(first.nextCursor).toString(), /^[A-Za-z0-9_-]+$/);
  assert.equal((await c.send('listMessages', { ...request, conversationId: 'wxid_beta', page: { pageSize: 1, cursor: first.nextCursor } })).error.code, 'INVALID_CURSOR');
  assert.equal((await c.send('listMessages', { ...request, page: { cursor: Buffer.from('../outside') } })).error.code, 'CURSOR_INVALID');
});

test('all unimplemented request branches and unsupported contact modes fail explicitly', async t => {
  const f = await fixture(t), c = f.start();
  assert.equal((await c.send('listAccounts')).error.code, 'HELLO_REQUIRED');
  assert.equal((await c.send('hello', { protocol: { major: 2 } })).error.code, 'PROTOCOL_VERSION_UNSUPPORTED');
  await handshake(c);
  const unsupported = ALL_METHODS.filter(name => !Object.hasOwn(SUPPORTED, name));
  assert.equal(ALL_METHODS.length, 128); assert.equal(unsupported.length, 114);
  for (const method of unsupported) assert.equal((await c.send(method)).error?.code, 'UNIMPLEMENTED', method);
  for (const payload of [{ query: 'fuzzy' }, { query: '__alpha_contact_exact:' }, { directory: {} }, { lookup: {} }, { ascending: false }]) {
    const result = await c.send('listContacts', { accountId, ascending: true, ...payload });
    assert.ok(['UNIMPLEMENTED', 'CONTACT_QUERY_INVALID'].includes(result.error?.code));
  }
  assert.equal((await c.send('selectAccount', { accountId: 'another' })).error.code, 'ACCOUNT_NOT_FOUND');
});

test('real persisted password lock denies data, survives restart, throttles failures, and permits verified unlock', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  const password = 'Synthetic engine password 123';
  const configured = ok(await c.send('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from(password) }), 'configureApplicationLock').status;
  assert.equal(configured.enabled, true); assert.equal(configured.locked, false);
  assert.equal(ok(await c.send('lockApplication'), 'lockApplication').status.locked, true);
  for (const [method, payload] of [['listAccounts', {}], ['listContacts', { accountId, ascending: true }], ['listMessages', { accountId, conversationId: 'wxid_alpha' }], ['selectAccount', { accountId }]]) assert.equal((await c.send(method, payload)).error.code, 'APP_LOCK_LOCKED');
  assert.equal(ok(await c.send('unlockApplication', { password: Buffer.from(password) }), 'unlockApplication').status.locked, false);
  assert.equal(ok(await c.send('listAccounts'), 'listAccounts').accounts.length, 1);
  await c.close(); const reopened = f.start(); await handshake(reopened);
  assert.equal(ok(await reopened.send('getApplicationLockStatus'), 'getApplicationLockStatus').status.locked, true);
  assert.equal((await reopened.send('unlockApplication', { password: Buffer.from('wrong password') })).error.code, 'APP_LOCK_PASSWORD_INCORRECT');
  assert.equal((await reopened.send('unlockApplication', { password: Buffer.from(password) })).error.code, 'APP_LOCK_PASSWORD_THROTTLED');
  const status = ok(await reopened.send('getApplicationLockStatus'), 'getApplicationLockStatus').status;
  assert.equal(status.passwordFailedAttempts, 1); await delay(Number(status.passwordRetryAfterMs) + 20);
  assert.equal(ok(await reopened.send('unlockApplication', { password: Buffer.from(password) }), 'unlockApplication').status.verified, true);
  assert.equal(ok(await reopened.send('configureApplicationLock', { action: 'disable', password: Buffer.from(password) }), 'configureApplicationLock').status.enabled, false);
  const stored = await fs.readFile(path.join(f.stateDir, 'password-lock.v1.json'), 'utf8'); assert.equal(stored.includes(password), false);
});

test('dispatch erases supplied password buffers on success and invalid-request errors', async t => {
  const f = await fixture(t, false), lock = await createSecurity({ stateDir: f.stateDir });
  const engine = await createEngine({ lock, stateDir: f.stateDir }); t.after(() => engine.close());
  await engine.dispatch(EngineClientFrame.fromPartial({ requestId: 1n, hello: helloRequest }));
  const bytes = Buffer.from('Synthetic private password');
  const configured = await engine.dispatch(EngineClientFrame.fromPartial({ requestId: 2n, configureApplicationLock: { action: 'enable_password', newPassword: bytes } }));
  assert.ok(configured.configureApplicationLock); assert.ok(bytes.every(value => value === 0));
  const invalidBytes = Buffer.from('password');
  const invalid = await engine.dispatch(EngineClientFrame.fromPartial({ requestId: 3n, listAccounts: {}, unlockApplication: { password: invalidBytes } }));
  assert.equal(invalid.error.code, 'REQUEST_PAYLOAD_INVALID'); assert.ok(invalidBytes.every(value => value === 0));
  assert.equal((await engine.dispatch(EngineClientFrame.fromPartial({ requestId: 0n, listAccounts: {} }))).error.code, 'REQUEST_ID_INVALID');
});

test('stdio rejects oversized/truncated frames and malformed protobuf without producing success', async t => {
  const f = await fixture(t, false);
  const cases = [
    { bytes: (() => { const header = Buffer.alloc(4); header.writeUInt32BE(DEFAULT_MAX_FRAME_BYTES + 1); return header; })(), code: 'FRAME_TOO_LARGE', fatal: true },
    { bytes: Buffer.from([0, 0, 0, 4, 0x08]), code: 'TRUNCATED_FRAME', fatal: true },
    { bytes: encodeLengthDelimitedFrame(Buffer.from([0x82])), code: 'INVALID_PROTOBUF', fatal: false }
  ];
  for (const row of cases) {
    const c = f.start(); const event = c.event(); c.child.stdin.end(row.bytes);
    const response = await event; assert.equal(response.error?.code, row.code); assert.equal(response.requestId, 0n);
    assert.equal((await c.exited).code, row.fatal ? 1 : 0);
  }
});

test('bridge process failures never resolve pending operations with empty success', async t => {
  const f = await fixture(t, false);
  const cases = [
    ['invalid', "process.stdin.on('data',()=>process.stdout.write('not-json\\n'));", 'BRIDGE_RESPONSE_INVALID'],
    ['large', "process.stdin.on('data',()=>process.stdout.write('x'.repeat(2048)));", 'BRIDGE_RESPONSE_TOO_LARGE'],
    ['exit', "process.stdin.on('data',()=>process.exit(9));", 'BRIDGE_CLOSED'],
    ['timeout', "process.stdin.resume();", 'BRIDGE_TIMEOUT']
  ];
  for (const [name, source, code] of cases) {
    const executable = path.join(f.directory, `${name}.cjs`);
    await fs.writeFile(executable, `#!${process.execPath}\n${source}\n`, { mode: 0o700 });
    const bridge = new BridgeClient({ executable, dataDir: f.directory, accountId, timeoutMs: 500, maxLineBytes: 1024 });
    try { await assert.rejects(bridge.call('account.info'), error => error.message === code); }
    finally { await bridge.close(); }
  }
});
