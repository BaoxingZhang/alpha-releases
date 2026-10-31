import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createSearchFixture } from './search-fixture.mjs';
const require = createRequire(import.meta.url), execute = promisify(execFile);
const { createEngine, SUPPORTED } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');
const ok = (response, method) => { assert.equal(response.error, undefined, response.error?.code); assert.ok(response[method]); return response[method]; };
async function setup(t, mutate) {
  await fs.mkdir(path.join(root, '.runtime'), { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-search-'));
  const f = await createSearchFixture({ directory: path.join(directory, 'data') });
  if (mutate) await mutate(f);
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: f.directory, accountId: f.accountId, selfUsername: f.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const input = EngineClientFrame.fromPartial({ requestId: ++id, [method]: { accountId: f.accountId, ...payload } });
    const decoded = EngineClientFrame.decode(EngineClientFrame.encode(input).finish());
    const reply = await engine.dispatch(decoded);
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  }
  const hello = ok(await call('hello', { protocol: { major: 1, minor: 0 } }), 'hello');
  for (const method of ['searchMessages', 'locateMessage', 'getConversationDayCounts', 'getChatExportStats']) assert.ok(hello.supportedMethodIds.includes(SUPPORTED[method]));
  async function pages(method, payload, size = 2) {
    const items = []; let cursor = new Uint8Array();
    for (let n = 0; n < 30; n++) {
      const page = ok(await call(method, { ...payload, page: { pageSize: size, cursor } }), method); items.push(...page.items);
      if (!page.nextCursor.length) return items;
      assert.notDeepEqual(page.nextCursor, cursor); cursor = page.nextCursor;
    }
    assert.fail('cursor did not terminate');
  }
  return { ...f, call, pages, lock };
}

test('global/conversation Unicode literal search includes archived conversations and zstd with exact message identities', async t => {
  const f = await setup(t);
  const global = await f.pages('searchMessages', { query: '维护' });
  assert.equal(global.length, f.matchingCount); assert.equal(new Set(global.map(row => row.id)).size, global.length);
  assert.ok(global.some(row => row.conversationId === f.archivedConversationId));
  assert.ok(global.some(row => row.text === f.zstdText));
  assert.ok(global.every(row => row.exactIdentity && /^msg-[a-f0-9]{64}$/.test(row.id)));
  const chat = await f.pages('listMessages', { conversationId: f.conversationId, ascending: true });
  const scoped = await f.pages('searchMessages', { query: '维护', conversationId: f.conversationId, ascending: true });
  assert.deepEqual(scoped.map(row => row.id), chat.map(row => row.id));
  assert.deepEqual(scoped.map(row => row.text), chat.map(row => row.text));
  assert.equal((await f.pages('searchMessages', { query: 'NEEDLE' })).length, 4);
  assert.equal((await f.pages('searchMessages', { query: '100% _ . [literal]' })).length, 1);
  assert.equal((await f.pages('searchMessages', { query: "' OR 1=1 --" })).length, 0);
});

test('grouped pages report full counts and sender/closed-millisecond filters bind opaque cursors', async t => {
  const f = await setup(t);
  const grouped = await f.pages('searchMessages', { query: '维护', groupByConversation: true }, 1);
  assert.equal(grouped.length, 3);
  assert.deepEqual(Object.fromEntries(grouped.map(row => [row.conversationId, row.matchCount])), { wxid_beta: 2n, wxid_alpha: 6n, wxid_archived: 1n });
  assert.equal(grouped.reduce((sum, row) => sum + row.matchCount, 0n), 9n);
  const ascending = await f.pages('searchMessages', { query: '维护', groupByConversation: true, ascending: true }, 1);
  assert.deepEqual(new Set(ascending.map(row => row.conversationId)), new Set(grouped.map(row => row.conversationId)));
  const sender = await f.pages('searchMessages', { query: '维护', senderId: 'wxid_self' });
  assert.equal(sender.length, 3); assert.ok(sender.every(row => row.senderId === 'wxid_self'));
  const tied = await f.pages('searchMessages', { query: '维护', fromUnixMs: 1700000001000n, toUnixMs: 1700000001000n });
  assert.equal(tied.length, 2); assert.ok(tied.every(row => row.sentAtUnixMs === 1700000001000n));
  assert.deepEqual(await f.pages('searchMessages', { query: '维护', fromUnixMs: 1700000001001n, toUnixMs: 1700000001999n }), []);
  const first = ok(await f.call('searchMessages', { query: '维护', page: { pageSize: 1 } }), 'searchMessages');
  for (const change of [{ query: 'needle' }, { senderId: 'wxid_self' }, { conversationId: 'wxid_alpha' }, { groupByConversation: true }, { ascending: true }, { fromUnixMs: 0n }]) {
    const reply = await f.call('searchMessages', { query: '维护', ...change, page: { pageSize: 1, cursor: first.nextCursor } }); assert.equal(reply.error?.code, 'INVALID_CURSOR');
  }
});

test('locate preserves uint64 server IDs, returns untimed two-sided cursors, and rejects duplicate server IDs', async t => {
  const f = await setup(t);
  const chat = await f.pages('listMessages', { conversationId: f.conversationId, ascending: true });
  const target = ok(await f.call('locateMessage', { conversationId: f.conversationId, serverId: f.uniqueServerId }), 'locateMessage');
  assert.equal(target.message.id, chat[1].id); assert.ok(target.beforeCursor.length && target.afterCursor.length);
  const before = ok(await f.call('listMessages', { conversationId: f.conversationId, ascending: false, page: { pageSize: 500, cursor: target.beforeCursor } }), 'listMessages');
  const after = ok(await f.call('listMessages', { conversationId: f.conversationId, ascending: true, page: { pageSize: 500, cursor: target.afterCursor } }), 'listMessages');
  assert.deepEqual([...before.items].reverse().concat(target.message, after.items).map(row => row.id), chat.map(row => row.id));
  assert.equal((await f.call('listMessages', { conversationId: f.conversationId, ascending: true, afterUnixMs: 0n, page: { cursor: target.afterCursor } })).error?.code, 'INVALID_CURSOR');
  const unsigned = ok(await f.call('locateMessage', { conversationId: f.secondConversationId, serverId: f.unsignedServerId }), 'locateMessage'); assert.equal(unsigned.message.serverId, -1n);
  const missing = ok(await f.call('locateMessage', { conversationId: f.conversationId, serverId: '9999999' }), 'locateMessage'); assert.equal(missing.message, undefined); assert.equal(missing.beforeCursor.length, 0); assert.equal(missing.afterCursor.length, 0);
  assert.equal((await f.call('locateMessage', { conversationId: f.conversationId, serverId: f.ambiguousServerId })).error?.code, 'MESSAGE_LOCATE_AMBIGUOUS');
});

test('local-day counts honor half-open bounds/offsets and stats preserve totals, types and first/last times', async t => {
  const f = await setup(t);
  const from = 1699833600000n, to = from + 5n * 86400000n;
  for (const utcOffsetMinutes of [-720, 0, 480, 840]) {
    const response = ok(await f.call('getConversationDayCounts', { conversationId: f.secondConversationId, fromUnixMs: from, toUnixMs: to, utcOffsetMinutes }), 'getConversationDayCounts');
    assert.equal(response.days.reduce((sum, row) => sum + row.count, 0n), 3n);
    assert.ok(response.days.every((row, i, rows) => !i || row.localDay > rows[i-1].localDay));
  }
  const boundary = ok(await f.call('getConversationDayCounts', { conversationId: f.conversationId, fromUnixMs: 1700000000000n, toUnixMs: 1700000001000n, utcOffsetMinutes: 0 }), 'getConversationDayCounts'); assert.equal(boundary.days.reduce((sum, row) => sum + row.count, 0n), 1n);
  assert.equal((await f.call('getConversationDayCounts', { conversationId: f.conversationId, fromUnixMs: 0n, toUnixMs: 63n * 86400000n })).error?.code, 'DAY_COUNTS_RANGE_TOO_LONG');
  const stats = ok(await f.call('getChatExportStats', { conversationIds: [f.conversationId, f.secondConversationId, f.archivedConversationId, 'wxid_empty'], refresh: true }), 'getChatExportStats');
  assert.deepEqual(stats.items.map(row => row.total), [6n, 3n, 1n, 0n]);
  assert.ok(stats.items.every(row => row.counts.reduce((sum, value) => sum + value.count, 0n) === row.total));
  assert.equal(stats.items[0].firstMessageUnixMs, 1699999999000n); assert.equal(stats.items[0].lastMessageUnixMs, 1700000004000n);
  assert.deepEqual(Object.fromEntries(stats.items[0].counts.map(row => [row.category, row.count])), { text: 5n, other: 1n });
  assert.equal(stats.items[3].firstMessageUnixMs, 0n);
});

test('search coverage explicitly reports unreadable payloads and unmapped message tables through protobuf', async t => {
  const f = await setup(t, async fixture => {
    const script = `import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute('UPDATE "'+sys.argv[2]+'" SET message_content=? WHERE local_id=5',(b'\\x28\\xb5\\x2f\\xfd\\x00',));schema=c.execute('SELECT sql FROM sqlite_master WHERE name=?',(sys.argv[2],)).fetchone()[0];c.execute(schema.replace(sys.argv[2],'Msg_00000000000000000000000000000000'));c.execute('INSERT INTO Msg_00000000000000000000000000000000 SELECT * FROM "'+sys.argv[2]+'" WHERE local_id=1');c.commit();c.close()`;
    await execute('/usr/bin/python3', ['-c', script, path.join(fixture.directory, 'message/message_1.db'), fixture.table]);
  });
  const result = ok(await f.call('searchMessages', { query: '维护', page: { pageSize: 100 } }), 'searchMessages');
  assert.equal(result.incomplete, true); assert.equal(result.unreadableMessages, 1n); assert.equal(result.unmappedTables, 1); assert.equal(result.items.length, 8);
  const scoped = ok(await f.call('searchMessages', { query: '维护', conversationId: 'wxid_beta' }), 'searchMessages');
  assert.equal(scoped.incomplete, false); assert.equal(scoped.unreadableMessages, 0n); assert.equal(scoped.unmappedTables, 0); assert.equal(scoped.items.length, 2);
});

test('new operations fail closed on lock/source change and reject malformed scope', async t => {
  const f = await setup(t);
  assert.equal((await f.call('searchMessages', { query: ' ' })).error?.code, 'SEARCH_PAGE_QUERY_INVALID');
  assert.equal((await f.call('locateMessage', { conversationId: 'wxid_alpha', serverId: '18446744073709551616' })).error?.code, 'MESSAGE_LOCATE_REQUEST_INVALID');
  assert.equal((await f.call('getChatExportStats', { conversationIds: ['wxid_alpha', 'wxid_alpha'] })).error?.code, 'CHAT_EXPORT_REQUEST_INVALID');
  await f.call('configureApplicationLock', { action: 'enable_password', newPassword: Buffer.from('Synthetic search password') }); await f.call('lockApplication');
  for (const method of ['searchMessages', 'locateMessage', 'getConversationDayCounts', 'getChatExportStats']) assert.equal((await f.call(method)).error?.code, 'APP_LOCK_LOCKED');
  await f.call('unlockApplication', { password: Buffer.from('Synthetic search password') });
  ok(await f.call('listAccounts'), 'listAccounts'); await fs.appendFile(path.join(f.directory, 'message/message_0.db'), Buffer.from([0]));
  assert.equal((await f.call('searchMessages', { query: '维护' })).error?.code, 'DATASET_CHANGED');
  assert.equal((await f.call('getChatExportStats', { conversationIds: ['wxid_alpha'] })).error?.code, 'DATASET_CHANGED');
});

test('epoch-zero date jump uses after=-1 and real zero timestamps survive statistics', async t => {
  const f = await setup(t, async fixture => {
    const script = `import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute('UPDATE "'+sys.argv[2]+'" SET create_time=0 WHERE local_id=9007199254740993');c.commit();c.close()`;
    await execute('/usr/bin/python3', ['-c', script, path.join(fixture.directory, 'message/message_0.db'), fixture.table]);
  });
  const page = ok(await f.call('listMessages', { conversationId: f.conversationId, afterUnixMs: -1n, beforeUnixMs: 1000n, ascending: true }), 'listMessages');
  assert.equal(page.items.length, 1); assert.equal(page.items[0].sentAtUnixMs, 0n); assert.equal(page.appliedAfterUnixMs, -1n);
  const day = ok(await f.call('getConversationDayCounts', { conversationId: f.conversationId, fromUnixMs: 0n, toUnixMs: 1000n, utcOffsetMinutes: -720 }), 'getConversationDayCounts');
  assert.deepEqual(day.days, [{ localDay: -1n, count: 1n }]);
  const stats = ok(await f.call('getChatExportStats', { conversationIds: [f.conversationId] }), 'getChatExportStats');
  assert.equal(stats.items[0].firstMessageUnixMs, 0n); assert.equal(stats.items[0].total, 6n);
});
