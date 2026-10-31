import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { createFixture } from './data-bridge-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const binary = path.join(root, 'build/candidates/alpha-data-bridge');
const execute = promisify(execFile);
const base = path.join(root, '.runtime/data-bridge-tests');
await fs.mkdir(base, { recursive: true });

function client(directory, accountId = 'synthetic-account') {
  const child = spawn(binary, ['--data-dir', directory, '--account-id', accountId], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let next = 0; let diagnostics = '';
  child.stderr.on('data', data => { diagnostics += data; });
  const reader = createInterface({ input: child.stdout });
  reader.on('line', line => { const message = JSON.parse(line); const callback = pending.get(message.id); pending.delete(message.id); callback?.resolve(message); });
  child.on('error', error => { for (const callback of pending.values()) callback.reject(error); pending.clear(); });
  child.on('exit', code => { for (const callback of pending.values()) callback.reject(new Error(`bridge exited ${code}: ${diagnostics}`)); pending.clear(); });
  return {
    async request(op, params = {}) {
      const id = String(++next);
      return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, op, params }) + '\n'); });
    },
    async close() { if (child.exitCode !== null) return; const closed = new Promise(resolve => child.once('exit', resolve)); child.stdin.end(); await closed; reader.close(); },
    get diagnostics() { return diagnostics; }
  };
}
async function create(t) {
  const outer = await fs.mkdtemp(path.join(base, 'case-'));
  const directory = path.join(outer, 'data');
  const fixture = await createFixture(directory);
  t.after(() => fs.rm(outer, { recursive: true, force: true }));
  return { outer, directory, fixture };
}
async function snapshot(directory) {
  const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true });
  const hashes = {};
  for (const entry of entries) if (entry.isFile()) {
    const name = path.join(entry.parentPath, entry.name);
    hashes[path.relative(directory, name)] = createHash('sha256').update(await fs.readFile(name)).digest('hex');
  }
  return hashes;
}
async function allPages(c, op, params) {
  const items = []; let cursor = '';
  for (let i = 0; i < 20; i++) {
    const reply = await c.request(op, { ...params, cursor });
    assert.equal(reply.ok, true, JSON.stringify(reply));
    items.push(...reply.result.items);
    if (!reply.result.hasMore) { assert.equal(reply.result.nextCursor, ''); return items; }
    assert.ok(reply.result.nextCursor); assert.notEqual(reply.result.nextCursor, cursor); cursor = reply.result.nextCursor;
  }
  assert.fail('Pagination failed to terminate');
}

test('real SQLite bridge preserves source identity, 64-bit values and deterministic cross-shard pages', async t => {
  const { directory, fixture } = await create(t); const before = await snapshot(directory);
  const c = client(directory); t.after(() => c.close());
  const info = await c.request('account.info');
  assert.equal(info.ok, true); assert.equal(info.result.id, fixture.accountId); assert.equal(info.result.readOnly, true); assert.equal(info.result.live, false);
  assert.equal(info.result.idProvenance, 'caller-supplied-dataset-label'); assert.equal(info.result.databases.length, 4);
  const contacts = await allPages(c, 'contacts.list', { limit: 1 });
  assert.deepEqual(contacts.map(x => x.username), ['wxid_alpha', 'wxid_beta', 'wxid_self']);
  const exact = await c.request('contacts.list', { usernameExact: 'wxid_alpha' });
  assert.equal(exact.result.items[0].remark, '合成联系人甲'); assert.equal(exact.result.items.length, 1);
  const fuzzy = await allPages(c, 'contacts.list', { query: '合成' });
  assert.deepEqual(fuzzy.map(x => x.username), ['wxid_alpha']);
  const fuzzyPaged = await allPages(c, 'contacts.list', { query: 'wxid_', limit: 1 });
  assert.deepEqual(fuzzyPaged.map(x => x.username), ['wxid_alpha', 'wxid_beta', 'wxid_self']);
  const literal = await allPages(c, 'contacts.list', { query: '%_' });
  assert.deepEqual(literal, []);
  const sessions = await allPages(c, 'sessions.list', { limit: 1 });
  assert.deepEqual(sessions.map(x => x.username), ['wxid_alpha', 'wxid_beta']);
  const messages = await allPages(c, 'messages.list', { conversationId: fixture.conversationId, limit: 2, ascending: true });
  assert.deepEqual(messages.map(x => x.sortSeq), ['50', '100', '200', '200', '200', '300']);
  assert.equal(messages[1].serverId, '9223372036854775807'); assert.equal(messages[1].localId, '9007199254740993');
  assert.equal(messages[1].source.localId, messages[1].localId); assert.equal(messages[1].source.table, fixture.table);
  assert.equal(messages[1].packedInfoBase64, 'AP8='); assert.equal(messages[5].contentEncoding, 'binary'); assert.equal(messages[5].content, '');
  const identities = messages.map(x => `${x.source.database}/${x.source.table}/${x.localId}`);
  assert.equal(new Set(identities).size, 6);
  const descending = await allPages(c, 'messages.list', { conversationId: fixture.conversationId, limit: 1, ascending: false });
  assert.deepEqual(descending.map(x => `${x.source.database}/${x.source.table}/${x.localId}`), identities.toReversed());
  const filtered = await allPages(c, 'messages.list', { conversationId: fixture.conversationId, limit: 1, afterTime: '1700000001', beforeTime: '1700000003' });
  assert.deepEqual(filtered.map(x => x.content), ['second source', 'same sequence', 'cross shard tie']);
  assert.deepEqual(await snapshot(directory), before); assert.equal(c.diagnostics, '');
});

test('bridge rejects unknown write requests, bad filters and cursors from another query', async t => {
  const { directory } = await create(t); const c = client(directory); t.after(() => c.close());
  assert.equal((await c.request('sql.exec', {})).error.code, 'UNSUPPORTED_OPERATION');
  assert.equal((await c.request('contacts.list', { mode: 'rw' })).error.code, 'INVALID_REQUEST');
  assert.equal((await c.request('messages.list', { conversationId: 'wxid_alpha', afterTime: '0 OR 1=1' })).error.code, 'INVALID_PARAMS');
  const first = await c.request('messages.list', { conversationId: 'wxid_alpha', limit: 1 });
  assert.equal((await c.request('messages.list', { conversationId: 'wxid_beta', cursor: first.result.nextCursor })).error.code, 'INVALID_CURSOR');
  assert.equal((await c.request('messages.list', { conversationId: 'wxid_alpha', cursor: '../outside' })).error.code, 'INVALID_CURSOR');
  assert.equal((await c.request('messages.list', { conversationId: '";DROP TABLE contact;--' })).result.items.length, 0);
  assert.equal((await c.request('contacts.list')).result.items.length, 3);
});

test('startup rejects symlinks, active sidecars and directories without supported databases', async t => {
  const { directory, outer } = await create(t);
  const run = data => execute(binary, ['--data-dir', data, '--account-id', 'synthetic'], { timeout: 3000 });
  const link = path.join(outer, 'link'); await fs.symlink(directory, link);
  await assert.rejects(run(link), error => error.code === 2 && /SYMLINK_DENIED/.test(error.stderr));
  const empty = path.join(outer, 'empty'); await fs.mkdir(empty);
  await assert.rejects(run(empty), error => error.code === 2 && /NO_DATABASES/.test(error.stderr));
  await fs.writeFile(path.join(directory, 'message/message_0.db-wal'), '');
  await assert.rejects(run(directory), error => error.code === 2 && /ACTIVE_DATABASE_DENIED/.test(error.stderr));
});

test('opened dataset mutation is rejected instead of serving stale immutable SQLite data', async t => {
  const { directory } = await create(t); const c = client(directory); t.after(() => c.close());
  assert.equal((await c.request('account.info')).ok, true);
  await fs.appendFile(path.join(directory, 'contact/contact.db'), Buffer.from([0]));
  assert.equal((await c.request('contacts.list')).error.code, 'DATASET_CHANGED');
});
