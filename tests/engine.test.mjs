import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { createFixture } from './data-bridge-fixture.mjs';
import { createMediaBrowseFixture } from './media-browse-fixture.mjs';

const require = createRequire(import.meta.url);
const { EngineClientFrame, EngineServerFrame, LengthDelimitedFrameDecoder, encodeLengthDelimitedFrame, DEFAULT_MAX_FRAME_BYTES } = require('../packages/alpha-protocol/index.cjs');
const { createEngine, SUPPORTED, ALL_METHODS } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { BridgeClient } = require('../packages/alpha-engine/bridge-client.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');
const cli = path.join(root, 'packages/alpha-engine/cli.cjs');
const accountId = 'synthetic-account';
const helloRequest = { protocol: { major: 1, minor: 0 }, desktopVersion: 'synthetic-test' };

async function fixture(t, withData = true, makeData = createFixture) {
  const base = path.join(root, '.runtime/engine-tests');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'case-'));
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const dataDir = withData ? path.join(directory, 'data') : '';
  if (withData) await makeData(dataDir);
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
async function addSyntheticGroupContact(dataDir) {
  const script = 'import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); db.execute("INSERT INTO contact VALUES (?,?,?,?,?)", ("room@chatroom", 2, "", "合成群", "合成群")); db.commit(); db.close()';
  await execute('/usr/bin/python3', ['-c', script, path.join(dataDir, 'contact/contact.db')]);
}
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
  const advanced = ok(await c.send('getAdvancedComponentStatus', { component: 5 }), 'getAdvancedComponentStatus');
  assert.equal(advanced.component, 5);
  assert.equal(advanced.target, 'macos-arm64');
  assert.equal(advanced.availability, 1);
  assert.equal(advanced.errorCode, 'INDEPENDENT_ADVANCED_COMPONENT_UNSUPPORTED');
  assert.equal((await c.send('getAdvancedComponentStatus', { component: 4 })).error.code, 'ADVANCED_COMPONENT_REQUEST_INVALID');
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
  const descendingContacts = ok(await c.send('listContacts', { accountId, ascending: false, limit: 100 }), 'listContacts').response.items;
  assert.deepEqual(descendingContacts.map(x => x.username), contacts.map(x => x.username).toReversed());
  const directory = ok(await c.send('listContacts', { accountId, ascending: true, limit: 2, offset: 1, directory: { categories: [] } }), 'listContacts').response.directory;
  assert.equal(directory.total, 3);
  assert.equal(directory.hasMore, false);
  assert.deepEqual(directory.items.map(item => [item.category, item.contact.username]), [['friend', 'wxid_beta'], ['friend', 'wxid_self']]);
  const descendingDirectory = ok(await c.send('listContacts', { accountId, ascending: false, limit: 2, offset: 1, directory: { categories: [] } }), 'listContacts').response.directory;
  assert.deepEqual(descendingDirectory.items.map(item => [item.category, item.contact.username]), [['friend', 'wxid_beta'], ['friend', 'wxid_alpha']]);
  assert.deepEqual(directory.counts, [
    { category: 'friend', count: 3 }, { category: 'group', count: 0 },
    { category: 'enterprise_friend', count: 0 }, { category: 'enterprise_group', count: 0 },
    { category: 'official', count: 0 }, { category: 'service', count: 0 },
    { category: 'former_friend', count: 0 }, { category: 'blocked', count: 0 }
  ]);
  const directoryQuery = ok(await c.send('listContacts', { accountId, ascending: true, limit: 10, directory: { categories: ['friend'] }, query: '合成' }), 'listContacts').response.directory;
  assert.equal(directoryQuery.total, 1);
  assert.equal(directoryQuery.items[0].contact.username, 'wxid_alpha');
  assert.equal((await c.send('listContacts', { accountId, ascending: true, directory: { categories: ['official'] } })).error.code, 'CONTACT_DIRECTORY_CATEGORY_UNSUPPORTED');
  const exact = ok(await c.send('listContacts', { accountId, ascending: true, query: '__alpha_contact_exact:wxid_alpha' }), 'listContacts').response.items;
  assert.equal(exact.length, 1); assert.equal(exact[0].displayName, '合成联系人甲');
  const profile = ok(await c.send('getContactProfile', { accountId, username: 'wxid_alpha', commonGroupLimit: 20 }), 'getContactProfile').response;
  assert.equal(profile.found, true);
  assert.equal(profile.profile.username, 'wxid_alpha');
  assert.equal(profile.profile.gender, 0);
  assert.deepEqual(profile.profile.commonGroups, []);
  const missingProfile = ok(await c.send('getContactProfile', { accountId, username: 'wxid_missing', commonGroupLimit: 0 }), 'getContactProfile').response;
  assert.equal(missingProfile.found, false);
  const fuzzy = ok(await c.send('listContacts', { accountId, ascending: true, query: '合成' }), 'listContacts').response.items;
  assert.deepEqual(fuzzy.map(x => x.username), ['wxid_alpha']);
  const alias = ok(await c.send('listContacts', { accountId, ascending: true, query: 'alpha' }), 'listContacts').response.items;
  assert.deepEqual(alias.map(x => x.username), ['wxid_alpha']);
  const wildcard = ok(await c.send('listContacts', { accountId, ascending: true, query: '%_' }), 'listContacts').response.items;
  assert.deepEqual(wildcard, []);
  const fuzzyOffset = ok(await c.send('listContacts', { accountId, ascending: true, query: 'wxid_', limit: 1, offset: 2 }), 'listContacts').response.items;
  assert.deepEqual(fuzzyOffset.map(x => x.username), ['wxid_self']);
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

test('removeAccount clears independent state, preserves the source, and requires explicit rediscovery', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  assert.ok(ok(await c.send('selectAccount', { accountId }), 'selectAccount').account.selected);
  const sourcePath = path.join(f.dataDir, 'contact/contact.db');
  const sourceBefore = await fs.readFile(sourcePath);
  const removed = ok(await c.send('removeAccount', { accountId }), 'removeAccount');
  assert.deepEqual(removed, { removed: true, selectedAccountId: '' });
  assert.deepEqual(ok(await c.send('listAccounts'), 'listAccounts'), { accounts: [], selectedAccountId: '' });
  assert.equal((await c.send('listMessages', { accountId, conversationId: 'wxid_alpha' })).error.code, 'ACCOUNT_NOT_FOUND');
  assert.deepEqual(await fs.readFile(sourcePath), sourceBefore);
  await assert.rejects(fs.access(path.join(f.stateDir, 'selected-source.v1.json')));
  const tombstone = path.join(f.stateDir, 'removed-account.v1.json');
  const tombstoneStat = await fs.stat(tombstone);
  assert.equal(tombstoneStat.mode & 0o077, 0);
  await c.close();

  const reopened = f.start(); await handshake(reopened);
  assert.deepEqual(ok(await reopened.send('listAccounts'), 'listAccounts'), { accounts: [], selectedAccountId: '' });
  assert.equal((await reopened.send('removeAccount', { accountId })).removeAccount.removed, false);
  const rediscovered = ok(await reopened.send('discoverAccounts', { sourceLocation: f.dataDir }), 'discoverAccounts');
  assert.equal(rediscovered.accounts.length, 1);
  assert.equal(rediscovered.accounts[0].id, accountId);
  assert.equal(ok(await reopened.send('listAccounts'), 'listAccounts').accounts.length, 1);
  assert.equal(await fs.stat(tombstone).then(() => true, () => false), false);
});

test('official plan creation intent stores opaque ciphertext with idempotent CAS semantics', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  const scheduleId = '11111111-1111-4111-8111-111111111111';
  const generation = '22222222-2222-4222-8222-222222222222';
  const ciphertext = Uint8Array.from([0, 1, 2, 250, 255]);
  const entry = { accountId, scheduleId, generation, ciphertext };
  assert.deepEqual(ok(await c.send('putPendingOfficialPlanCreate', { entry }), 'putPendingOfficialPlanCreate'), { inserted: true });
  const stored = ok(await c.send('getPendingOfficialPlanCreate', { accountId }), 'getPendingOfficialPlanCreate').entry;
  assert.equal(stored.accountId, accountId);
  assert.equal(stored.scheduleId, scheduleId);
  assert.equal(stored.generation, generation);
  assert.deepEqual(Buffer.from(stored.ciphertext), Buffer.from(ciphertext));
  assert.equal((await fs.stat(path.join(f.stateDir, 'official-plan-intent.v1.json'))).mode & 0o077, 0);
  assert.deepEqual(ok(await c.send('putPendingOfficialPlanCreate', { entry }), 'putPendingOfficialPlanCreate'), { inserted: false });
  assert.equal((await c.send('putPendingOfficialPlanCreate', { entry: { ...entry, ciphertext: Uint8Array.from([9]) } })).error.code, 'OFFICIAL_SCHEDULE_INTENT_CONFLICT');
  assert.equal((await c.send('getPendingOfficialPlanCreate', { accountId: 'other-account' })).error.code, 'ACCOUNT_NOT_FOUND');
  assert.deepEqual(ok(await c.send('clearPendingOfficialPlanCreate', { accountId, scheduleId, generation: '33333333-3333-4333-8333-333333333333' }), 'clearPendingOfficialPlanCreate'), { removed: false });
  await c.close();

  const reopened = f.start(); await handshake(reopened);
  const persisted = ok(await reopened.send('getPendingOfficialPlanCreate', { accountId }), 'getPendingOfficialPlanCreate').entry;
  assert.deepEqual(Buffer.from(persisted.ciphertext), Buffer.from(ciphertext));
  assert.deepEqual(ok(await reopened.send('clearPendingOfficialPlanCreate', { accountId, scheduleId, generation }), 'clearPendingOfficialPlanCreate'), { removed: true });
  assert.equal(ok(await reopened.send('getPendingOfficialPlanCreate', { accountId }), 'getPendingOfficialPlanCreate').entry, undefined);

  const secondGeneration = '44444444-4444-4444-8444-444444444444';
  assert.deepEqual(ok(await reopened.send('putPendingOfficialPlanCreate', { entry: { accountId, scheduleId, generation: secondGeneration, ciphertext } }), 'putPendingOfficialPlanCreate'), { inserted: true });
  assert.deepEqual(ok(await reopened.send('removeAccount', { accountId }), 'removeAccount'), { removed: true, selectedAccountId: '' });
  assert.equal(await fs.stat(path.join(f.stateDir, 'official-plan-intent.v1.json')).then(() => true, () => false), false);
  assert.equal((await reopened.send('getPendingOfficialPlanCreate', { accountId })).error.code, 'ACCOUNT_NOT_FOUND');
  assert.equal(ok(await reopened.send('discoverAccounts', { sourceLocation: f.dataDir }), 'discoverAccounts').accounts.length, 1);
  await reopened.close();
  await fs.writeFile(path.join(f.stateDir, 'official-plan-intent.v1.json'), '{"version":1,"entry":null}\n', { mode: 0o600 });
  const corrupted = f.start(); await handshake(corrupted);
  assert.equal((await corrupted.send('getPendingOfficialPlanCreate', { accountId })).error.code, 'OFFICIAL_SCHEDULE_INTENT_CORRUPT');
  await corrupted.close();
  await fs.rm(path.join(f.stateDir, 'official-plan-intent.v1.json'));
  await fs.symlink(path.join(f.directory, 'outside-intent.json'), path.join(f.stateDir, 'official-plan-intent.v1.json'));
  const linked = f.start(); await handshake(linked);
  assert.equal((await linked.send('getPendingOfficialPlanCreate', { accountId })).error.code, 'OFFICIAL_SCHEDULE_INTENT_CORRUPT');
});

test('read-only contact export uses verified contact fields and rejects unsupported classifications/media', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  const destination = path.join(f.directory, 'contacts.json');
  const exported = ok(await c.send('exportContacts', {
    accountId,
    categories: ['friend'],
    query: 'alpha',
    format: 'json',
    includeProfile: true,
    includeAvatars: false,
    destinationPath: destination,
    utcOffsetMinutes: 480
  }), 'exportContacts');
  assert.equal(exported.destinationPath, destination);
  assert.equal(exported.itemCount, 1);
  assert.equal(exported.avatarCount, 0);
  const document = JSON.parse(await fs.readFile(destination, 'utf8'));
  assert.deepEqual(document.contacts.map(item => item.username), ['wxid_alpha']);
  assert.deepEqual(document.contacts[0].profile, { username: 'wxid_alpha', alias: 'alpha', remark: '合成联系人甲', nickname: 'Alpha' });
  for (const format of ['csv', 'vcf', 'html']) {
    const outputPath = path.join(f.directory, `contacts.${format}`);
    const result = ok(await c.send('exportContacts', {
      accountId,
      categories: ['friend'],
      query: '',
      format,
      includeProfile: false,
      includeAvatars: false,
      destinationPath: outputPath,
      utcOffsetMinutes: 0
    }), 'exportContacts');
    assert.equal(result.itemCount, 3);
    const output = await fs.readFile(outputPath, 'utf8');
    assert.match(output, /wxid_alpha/);
  }
  const unsupported = await c.send('exportContacts', {
    accountId,
    categories: ['official'],
    query: '',
    format: 'json',
    includeProfile: false,
    includeAvatars: false,
    destinationPath: path.join(f.directory, 'unsupported.json'),
    utcOffsetMinutes: 0
  });
  assert.equal(unsupported.error.code, 'CONTACT_EXPORT_CATEGORY_UNSUPPORTED');
  const avatars = await c.send('exportContacts', {
    accountId,
    categories: ['friend'],
    query: '',
    format: 'csv',
    includeProfile: false,
    includeAvatars: true,
    destinationPath: path.join(f.directory, 'avatars.csv'),
    utcOffsetMinutes: 0
  });
  assert.equal(avatars.error.code, 'CONTACT_EXPORT_AVATARS_UNSUPPORTED');
  const xlsx = ok(await c.send('exportContacts', {
    accountId,
    categories: ['friend'],
    query: '',
    format: 'xlsx',
    includeProfile: false,
    includeAvatars: false,
    destinationPath: path.join(f.directory, 'contacts.xlsx'),
    utcOffsetMinutes: 0
  }), 'exportContacts');
  assert.equal(xlsx.itemCount, 3);
  const xlsxBytes = await fs.readFile(path.join(f.directory, 'contacts.xlsx'));
  assert.equal(xlsxBytes.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(xlsxBytes.includes(Buffer.from('wxid_alpha')));
});

test('contact directory derives only verified friend/group categories', async t => {
  const f = await fixture(t);
  await addSyntheticGroupContact(f.dataDir);
  const c = f.start(); await handshake(c);
  const directory = ok(await c.send('listContacts', { accountId, ascending: true, directory: { categories: ['group'] }, limit: 10 }), 'listContacts').response.directory;
  assert.equal(directory.total, 1);
  assert.equal(directory.items[0].category, 'group');
  assert.equal(directory.items[0].contact.username, 'room@chatroom');
  assert.equal(directory.counts.find(item => item.category === 'friend').count, 3);
  assert.equal(directory.counts.find(item => item.category === 'group').count, 1);
  assert.equal((await c.send('listContacts', { accountId, ascending: true, directory: { categories: ['blocked'] } })).error.code, 'CONTACT_DIRECTORY_CATEGORY_UNSUPPORTED');
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

test('independent getMessageSource resolves only its verified text token and fails closed', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  const page = ok(await c.send('listMessages', { accountId, conversationId: 'wxid_alpha', ascending: true, page: { pageSize: 100 } }), 'listMessages');
  const message = page.items.find(item => item.text === 'first source');
  assert.ok(message);
  assert.match(message.sourceToken, /^independent1_[A-Za-z0-9_-]+$/);
  const source = ok(await c.send('getMessageSource', {
    accountId, conversationId: message.conversationId, messageId: message.id, sourceToken: message.sourceToken
  }), 'getMessageSource');
  assert.deepEqual(source, { text: 'first source', format: 'text', redacted: false });
  assert.equal((await c.send('getMessageSource', {
    accountId, conversationId: message.conversationId, messageId: message.id, sourceToken: 'media1_' + '0'.repeat(32)
  })).error.code, 'MESSAGE_SOURCE_REQUEST_INVALID');
  assert.equal((await c.send('getMessageSource', {
    accountId, conversationId: message.conversationId, messageId: 'msg-missing', sourceToken: message.sourceToken
  })).error.code, 'MESSAGE_SOURCE_UNAVAILABLE');
  await fs.appendFile(path.join(f.dataDir, 'message/message_0.db'), Buffer.from([0]));
  assert.equal((await c.send('getMessageSource', {
    accountId, conversationId: message.conversationId, messageId: message.id, sourceToken: message.sourceToken
  })).error.code, 'DATASET_CHANGED');
  const password = Buffer.from('source lock password 123');
  assert.equal(ok(await c.send('configureApplicationLock', { action: 'enable_password', newPassword: password }), 'configureApplicationLock').status.enabled, true);
  assert.equal(ok(await c.send('lockApplication'), 'lockApplication').status.locked, true);
  assert.equal((await c.send('getMessageSource', {
    accountId, conversationId: message.conversationId, messageId: message.id, sourceToken: message.sourceToken
  })).error.code, 'APP_LOCK_LOCKED');
  assert.equal(ok(await c.send('unlockApplication', { password: Buffer.from('source lock password 123') }), 'unlockApplication').status.locked, false);
  assert.equal((await c.send('getMessageSource', {
    accountId, conversationId: message.conversationId, messageId: message.id, sourceToken: message.sourceToken
  })).error.code, 'DATASET_CHANGED');
});

test('all unimplemented request branches and unsupported contact modes fail explicitly', async t => {
  const f = await fixture(t), c = f.start();
  assert.equal((await c.send('listAccounts')).error.code, 'HELLO_REQUIRED');
  assert.equal((await c.send('hello', { protocol: { major: 2 } })).error.code, 'PROTOCOL_VERSION_UNSUPPORTED');
  await handshake(c);
  const unsupported = ALL_METHODS.filter(name => !Object.hasOwn(SUPPORTED, name));
  assert.equal(ALL_METHODS.length, 128); assert.equal(unsupported.length, ALL_METHODS.length - Object.keys(SUPPORTED).length);
  for (const method of unsupported) assert.equal((await c.send(method)).error?.code, 'UNIMPLEMENTED', method);
  for (const payload of [{ query: '__alpha_contact_exact:' }, { query: '   ' }, { query: '中'.repeat(171) }, { directory: { categories: ['official'] } }, { lookup: {} }]) {
    const result = await c.send('listContacts', { accountId, ascending: true, ...payload });
    assert.ok(['UNIMPLEMENTED', 'CONTACT_QUERY_INVALID', 'CONTACT_LOOKUP_INVALID', 'CONTACT_DIRECTORY_REQUEST_INVALID', 'CONTACT_DIRECTORY_CATEGORY_UNSUPPORTED'].includes(result.error?.code), `${JSON.stringify(payload)} => ${JSON.stringify(result.error)}`);
  }
  assert.equal((await c.send('selectAccount', { accountId: 'another' })).error.code, 'ACCOUNT_NOT_FOUND');
});

test('telemetry consent is persisted while the independent backend stays explicitly disabled', async t => {
  const f = await fixture(t, false), c = f.start(); await handshake(c);
  const initial = ok(await c.send('getTelemetryStatus'), 'getTelemetryStatus');
  assert.equal(initial.configured, false);
  assert.equal(initial.consentDecision, '');
  assert.deepEqual(initial.consentCategories, []);
  assert.equal(initial.queuedCount, 0n);
  assert.equal(initial.queuedBytes, 0n);
  assert.equal(initial.nextAttemptUnixMs, 0n);
  assert.equal(initial.lastErrorCode, '');

  const granted = ok(await c.send('setTelemetryConsent', {
    decision: 'granted', categories: ['crash', 'usage'], consentVersion: 'telemetry-v1'
  }), 'setTelemetryConsent').status;
  assert.equal(granted.configured, true);
  assert.equal(granted.consentDecision, 'granted');
  assert.deepEqual(granted.consentCategories, ['crash', 'usage']);
  assert.equal(granted.lastErrorCode, 'INDEPENDENT_TELEMETRY_DISABLED');
  assert.deepEqual(ok(await c.send('flushTelemetry'), 'flushTelemetry'), {
    outcome: 'disabled', acceptedCount: 0n, duplicateCount: 0n, queuedCount: 0n, nextAttemptUnixMs: 0n
  });
  const telemetryFile = path.join(f.stateDir, 'telemetry-consent.v1.json');
  const persisted = JSON.parse(await fs.readFile(telemetryFile, 'utf8'));
  assert.deepEqual(persisted, { version: 1, decision: 'granted', categories: ['crash', 'usage'], consentVersion: 'telemetry-v1' });
  assert.equal((await fs.stat(telemetryFile)).mode & 0o077, 0);

  await c.close();
  const reopened = f.start(); await handshake(reopened);
  const restored = ok(await reopened.send('getTelemetryStatus'), 'getTelemetryStatus');
  assert.equal(restored.configured, true);
  assert.equal(restored.consentDecision, 'granted');
  assert.deepEqual(restored.consentCategories, ['crash', 'usage']);
  assert.equal((await reopened.send('setTelemetryConsent', { decision: 'unknown' })).error.code, 'TELEMETRY_DECISION_INVALID');
  assert.equal((await reopened.send('setTelemetryConsent', { decision: 'revoked', categories: ['usage', 'usage'] })).error.code, 'TELEMETRY_CATEGORIES_INVALID');
  const revoked = ok(await reopened.send('setTelemetryConsent', { decision: 'revoked' }), 'setTelemetryConsent').status;
  assert.equal(revoked.configured, true);
  assert.equal(revoked.consentDecision, 'revoked');
  assert.deepEqual(revoked.consentCategories, []);
  assert.equal(revoked.lastErrorCode, '');
  assert.deepEqual(ok(await reopened.send('flushTelemetry'), 'flushTelemetry'), {
    outcome: 'disabled', acceptedCount: 0n, duplicateCount: 0n, queuedCount: 0n, nextAttemptUnixMs: 0n
  });
});

test('message anti-recall status reports the independent writer boundary per conversation', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  const status = ok(await c.send('getMessageAntiRecallStatuses', {
    accountId,
    conversationIds: ['wxid_alpha']
  }), 'getMessageAntiRecallStatuses').statuses[0];
  assert.equal(status.conversationId, 'wxid_alpha');
  assert.equal(status.status.detected, false);
  assert.equal(status.status.usable, false);
  assert.equal(status.status.enabled, false);
  assert.equal(status.status.knownTables, 0);
  assert.equal(status.status.errorCode, 'MESSAGE_ANTI_RECALL_WRITER_DISABLED');
  assert.equal(status.status.writerErrorCode, 'MESSAGE_ANTI_RECALL_WRITER_DISABLED');
  assert.deepEqual(ok(await c.send('getMessageAntiRecallStatuses', {
    accountId,
    conversationIds: ['wxid_alpha', 'wxid_beta']
  }), 'getMessageAntiRecallStatuses').statuses.map(item => item.conversationId), ['wxid_alpha', 'wxid_beta']);
  assert.equal((await c.send('getMessageAntiRecallStatuses', {
    accountId,
    conversationIds: ['wxid_alpha', 'wxid_alpha']
  })).error?.code, 'MESSAGE_RECALL_REQUEST_INVALID');
});

test('message anti-recall control reports the independent writer boundary without touching data', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  for (const action of [1, 2, 3, 4]) {
    const result = ok(await c.send('manageMessageAntiRecall', {
      operationId: action === 1 ? '' : `test-recall-${action}`,
      spec: { accountId, conversationId: 'wxid_alpha', action }
    }), 'manageMessageAntiRecall').result.status;
    assert.equal(result.detected, false);
    assert.equal(result.usable, false);
    assert.equal(result.enabled, false);
    assert.equal(result.verified, false);
    assert.equal(result.knownTables, 0);
    assert.equal(result.retainedRows, 0n);
    assert.equal(result.errorCode, 'MESSAGE_ANTI_RECALL_WRITER_DISABLED');
    assert.equal(result.writerErrorCode, 'MESSAGE_ANTI_RECALL_WRITER_DISABLED');
  }
  assert.equal((await c.send('manageMessageAntiRecall', {
    operationId: 'invalid', spec: { accountId, conversationId: 'wxid_alpha', action: 0 }
  })).error?.code, 'MESSAGE_ANTI_RECALL_REQUEST_INVALID');
  assert.equal((await c.send('manageMessageAntiRecall', {
    operationId: 'invalid', spec: { accountId: 'missing', conversationId: 'wxid_alpha', action: 1 }
  })).error?.code, 'ACCOUNT_NOT_FOUND');
});

test('moments anti-delete control reports the independent writer boundary without touching data', async t => {
  const f = await fixture(t), c = f.start(); await handshake(c);
  for (const action of [1, 2, 3]) {
    const result = ok(await c.send('manageMomentsAntiDelete', {
      operationId: action === 1 ? '' : `test-moments-${action}`,
      spec: { accountId, action }
    }), 'manageMomentsAntiDelete').result.status;
    assert.equal(result.detected, false);
    assert.equal(result.usable, false);
    assert.equal(result.enabled, false);
    assert.equal(result.verified, false);
    assert.equal(result.retainedRows, 0n);
    assert.equal(result.targetTable, '');
    assert.equal(result.shadowTable, '');
    assert.equal(result.triggerName, '');
    assert.equal(result.errorCode, 'MOMENTS_ANTI_DELETE_WRITER_DISABLED');
    assert.equal(result.writerErrorCode, 'MOMENTS_ANTI_DELETE_WRITER_DISABLED');
  }
  assert.equal((await c.send('manageMomentsAntiDelete', {
    operationId: '', spec: { accountId, action: 0 }
  })).error?.code, 'MOMENTS_ANTI_DELETE_REQUEST_INVALID');
  assert.equal((await c.send('manageMomentsAntiDelete', {
    operationId: '', spec: { accountId: 'other-account', action: 1 }
  })).error?.code, 'ACCOUNT_NOT_FOUND');
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

test('metadata media browse filters real kinds, preserves refs/display, and paginates account sessions', async t => {
  const f = await fixture(t, true, createMediaBrowseFixture), c = f.start();
  const hello = await handshake(c);
  assert.ok(hello.supportedMethodIds.includes(SUPPORTED.browseConversationMessages));
  assert.ok(hello.supportedMethodIds.includes(SUPPORTED.browseAccountMedia));

  const conversationMedia = ok(await c.send('browseConversationMessages', {
    accountId, conversationId: 'wxid_alpha', category: 'media', page: { pageSize: 20 }
  }), 'browseConversationMessages');
  assert.deepEqual(conversationMedia.items.map(item => String(item.sourceType)), ['47', '43', '34', '3', '3']);
  assert.deepEqual(conversationMedia.items.map(item => item.conversationId), Array(5).fill('wxid_alpha'));
  const image = conversationMedia.items.find(item => String(item.sourceType) === '3' && item.sentAtUnixMs === 1700000005000n);
  assert.equal(image.refs.length, 1);
  assert.equal(image.refs[0].kind, 'image'); assert.equal(image.refs[0].id, '11111111111111111111111111111111');
  assert.equal(image.refs[0].mimeType, 'image/*'); assert.equal(image.refs[0].rendition, 'source');
  const video = conversationMedia.items.find(item => String(item.sourceType) === '43');
  assert.equal(video.refs[0].uri, 'https://cdn.example/alpha.mp4');
  const voice = conversationMedia.items.find(item => String(item.sourceType) === '34');
  assert.equal(voice.refs.length, 1); assert.equal(voice.refs[0].kind, 'voice'); assert.equal(voice.refs[0].id, '10011');
  assert.equal(voice.refs[0].mimeType, 'audio/amr'); assert.equal(voice.refs[0].rendition, 'voice-data');
  for (const item of conversationMedia.items) assert.equal(item.mediaResolveToken, '');

  const link = ok(await c.send('browseConversationMessages', {
    accountId, conversationId: 'wxid_alpha', category: 'link', page: { pageSize: 5 }
  }), 'browseConversationMessages');
  assert.equal(link.items.length, 1); assert.equal(link.items[0].displayJson.length > 0, true);
  const file = ok(await c.send('browseConversationMessages', {
    accountId, conversationId: 'wxid_alpha', category: 'file', page: { pageSize: 5 }
  }), 'browseConversationMessages');
  assert.equal(file.items.length, 1); assert.equal(file.items[0].displayJson.length > 0, true);
  for (const category of ['music', 'mini-program', 'transaction']) {
    assert.equal((await c.send('browseConversationMessages', { accountId, conversationId: 'wxid_alpha', category })).error.code, 'TYPE_BROWSE_CATEGORY_UNSUPPORTED');
  }
  assert.equal((await c.send('browseConversationMessages', { accountId, conversationId: 'wxid_alpha', category: 'media', page: { pageSize: 121 } })).error.code, 'TYPE_BROWSE_REQUEST_INVALID');
  assert.equal((await c.send('browseAccountMedia', { accountId, category: 'file' })).error.code, 'ACCOUNT_MEDIA_CATEGORY_UNSUPPORTED');

  const exactEpoch = ok(await c.send('browseConversationMessages', {
    accountId, conversationId: 'wxid_alpha', category: 'media', fromUnixMs: 0n, toUnixMs: 0n, page: { pageSize: 5 }
  }), 'browseConversationMessages');
  assert.deepEqual(exactEpoch.items.map(item => String(item.sourceType)), ['3']);
  const betweenSeconds = ok(await c.send('browseConversationMessages', {
    accountId, conversationId: 'wxid_alpha', category: 'media', fromUnixMs: 1700000005001n, toUnixMs: 1700000005999n, page: { pageSize: 5 }
  }), 'browseConversationMessages');
  assert.deepEqual(betweenSeconds.items, []);

  const imageOnly = ok(await c.send('browseAccountMedia', {
    accountId, category: 'image', page: { pageSize: 20 }
  }), 'browseAccountMedia');
  assert.deepEqual(imageOnly.items.map(item => String(item.sourceType)), ['3', '3', '3']);
  assert.deepEqual(new Set(imageOnly.items.map(item => item.conversationId)), new Set(['wxid_alpha', 'wxid_beta']));
  const videoOnly = ok(await c.send('browseAccountMedia', {
    accountId, category: 'video', conversationId: 'wxid_beta', page: { pageSize: 5 }
  }), 'browseAccountMedia');
  assert.deepEqual(videoOnly.items.map(item => item.conversationId), ['wxid_beta']);
  assert.equal(String(videoOnly.items[0].sourceType), '43');
  const senderScoped = ok(await c.send('browseConversationMessages', {
    accountId, conversationId: 'wxid_alpha', category: 'media', senderId: 'wxid_self', page: { pageSize: 20 }
  }), 'browseConversationMessages');
  assert.ok(senderScoped.items.length > 0); assert.ok(senderScoped.items.every(item => item.senderId === 'wxid_self'));

  const first = ok(await c.send('browseAccountMedia', {
    accountId, category: 'media', page: { pageSize: 2 }
  }), 'browseAccountMedia');
  assert.equal(first.items.length, 2); assert.ok(first.nextCursor.length > 0);
  const second = ok(await c.send('browseAccountMedia', {
    accountId, category: 'media', page: { pageSize: 2, cursor: first.nextCursor }
  }), 'browseAccountMedia');
  assert.ok(second.items.length > 0); assert.notDeepEqual(second.nextCursor, first.nextCursor);
  assert.equal((await c.send('browseAccountMedia', {
    accountId, category: 'video', page: { pageSize: 2, cursor: first.nextCursor }
  })).error.code, 'BROWSE_CURSOR_INVALID');

  const all = [...first.items, ...second.items]; let cursor = second.nextCursor;
  for (let index = 0; cursor.length && index < 16; index += 1) {
    const page = ok(await c.send('browseAccountMedia', { accountId, category: 'media', page: { pageSize: 2, cursor } }), 'browseAccountMedia');
    all.push(...page.items); cursor = page.nextCursor;
  }
  assert.equal(cursor.length, 0);
  assert.deepEqual(new Set(all.map(item => item.conversationId)), new Set(['wxid_alpha', 'wxid_beta', 'wxid_gamma']));
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
  assert.equal((await c.send('browseAccountMedia', { accountId, category: 'media', conversationId: 'wxid_alpha', page: { pageSize: 20 } })).browseAccountMedia.items.length, 5);
});
