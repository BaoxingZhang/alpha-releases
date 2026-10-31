import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import { createFixture } from './data-bridge-fixture.mjs';
const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const protocol = require('../packages/alpha-protocol/index.cjs');
const { EngineClientFrame, EngineServerFrame } = protocol;
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const base = path.join(root, '.runtime', `search-navigation-boundary-${process.pid}`);
const accountId = 'synthetic-navigation-account';
const history = 'wxid_history_only';
const days = 'wxid_days_only';
const epoch = 'wxid_epoch_only';
const timestamp = 1700000500000n;
let dataset;

// Retain the actual desktop validators and context algorithms. Only Electron
// startup, wire transport and presentation-only display metadata are supplied.
const mainSource = await fs.readFile(path.join(root, 'src/main/index.js'), 'utf8');
const mainAst = parse(mainSource, { sourceType: 'unambiguous' });
function declaration(name) {
  const node = mainAst.program.body.find(node => node.id?.name === name || node.type === 'VariableDeclaration' && node.declarations.some(value => value.id?.name === name));
  assert.ok(node, `main declaration missing: ${name}`);
  return mainSource.slice(node.start, node.end);
}
const methodNames = ['listMessagePage', 'searchMessages', 'searchMessagePage', 'searchConversationPage', 'searchMessageContext', 'locateMessage', 'locateMessageByServerId'];
const engineClass = mainAst.program.body.find(node => node.id?.name === 'EngineClient');
const methods = methodNames.map(name => {
  const node = engineClass.body.body.find(node => node.key?.name === name);
  assert.ok(node, `main EngineClient method missing: ${name}`);
  return mainSource.slice(node.start, node.end);
});
const functionNames = ['messageAfterUnixMs', 'messagePageRequest', 'messagePageResponse', 'conversationPageRequest', 'searchPageRequest', 'searchPageResponse', 'searchRequestFailure', 'searchContextTarget', 'readSearchMessageContext', 'readAnchoredMessageContext', 'scope', 'locateRequest', 'locatedSearchResult', 'LocatedMessages', 'localDay', 'dayCountsRequest', 'dayCountsFromWire', 'CHAT_EXPORT_MESSAGE_TYPES', 'MESSAGE_TYPES', 'MAX_SAFE', 'safeCount$1', 'chatExportStatsFromWire'];
const desktop = vm.runInNewContext(functionNames.map(declaration).join('\n') + `\n({methods:{${methods.join(',\n')}}, searchPageRequest, searchPageResponse, readSearchMessageContext, LocatedMessages, dayCountsRequest, dayCountsFromWire, chatExportStatsFromWire})`, {
  Buffer, Uint8Array, TextEncoder, TextDecoder,
  MAX_INT64$3: 9223372036854775807n, MAX_INT64$1: 9223372036854775807n,
  MAX_UINT64: 18446744073709551615n, MAX_CURSOR_BYTES$1: 1024,
  MAX_TIE_PAGES: 100, MAX_ANCHORED_PAGES: 20,
  MAX_DAY_COUNT_RANGE_MS: 62n * 86400000n, SEARCH_REQUEST_TIMEOUT_MS: 30000,
  displayFields: () => ({}),
  electron: { app: { isPackaged: false } },
  process: { env: { ALPHA_RECOVERY_BACKEND: 'independent' } }
});
const toPlain = value => JSON.parse(JSON.stringify(value));

const rendererSource = await fs.readFile(path.join(root, 'src/renderer/assets/index-DPCwIOAb.js'), 'utf8');
const rendererAst = parse(rendererSource, { sourceType: 'unambiguous' });
function rendererDeclaration(name) {
  const node = rendererAst.program.body.find(node => node.id?.name === name);
  assert.ok(node, `renderer declaration missing: ${name}`);
  return rendererSource.slice(node.start, node.end);
}
const rendererDateCode = ['parseJumpDate', 'jumpLowerBound', 'monthRange', 'monthUtcOffset', 'localDay$2'].map(rendererDeclaration).join('\n');

test.before(async () => {
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  dataset = path.join(base, 'data');
  await createFixture(dataset);
  const compressed = zlib.zstdCompressSync(Buffer.from('压缩 Needle UNIQUEZSTD')).toString('hex');
  await execute('/usr/bin/python3', ['-c', String.raw`
import sqlite3,hashlib,sys
from pathlib import Path
root=Path(sys.argv[1]); compressed=bytes.fromhex(sys.argv[2])
history='wxid_history_only'; days='wxid_days_only'; epoch='wxid_epoch_only'
def table(user): return 'Msg_'+hashlib.md5(user.encode()).hexdigest()
schema='(local_id INTEGER PRIMARY KEY,server_id INTEGER,sort_seq INTEGER,local_type INTEGER,create_time INTEGER,real_sender_id INTEGER,status INTEGER,message_content BLOB,packed_info_data BLOB)'
for shard in range(2):
 with sqlite3.connect(root/f'message/message_{shard}.db') as db:
  db.executemany('INSERT INTO Name2Id VALUES (?)',[(history,),(days,),(epoch,)])
  for user in (history,days,epoch): db.execute('CREATE TABLE "'+table(user)+'" '+schema)
  rows=[]
  if shard==0:
   rows=[(1000,800001,1,1,1700000500,1,4,'Needle target',b'')]
   rows += [(i+1,810000+i,i+2,1,1700000499,1+i%2,4,f'Needle earlier {i}',b'') for i in range(21)]
   rows += [(1002,800002,2,1,1700000500,1,4,'Needle tie A',b''),(2000,800005,0,1,1700000501,1,4,compressed,b''),(3000,800006,-5,1,1700000502,2,4,'literal % _ .* [x]',b''),(4000,998,9,1,1700000505,1,4,'duplicate server A',b'')]
   db.executemany('INSERT INTO "'+table(days)+'" VALUES (?,?,?,?,?,?,?,?,?)',[(1,900001,1,1,1704124799,1,4,'before UTC+8 midnight',b''),(2,900002,2,1,1704124800,1,4,'at UTC+8 midnight',b'')])
   db.execute('INSERT INTO "'+table(epoch)+'" VALUES (1,900003,1,1,0,1,4,?,?)',('epoch message',b''))
   db.execute('INSERT INTO "'+table(epoch)+'" VALUES (2,900004,2,1,1,1,4,?,?)',('one second after epoch',b''))
  else:
   rows=[(1002,800003,300,1,1700000500,2,4,'Needle tie B',b''),(1003,800004,301,1,1700000500,2,4,'Needle tie C',b''),(4000,998,8,1,1700000506,1,4,'duplicate server B',b'')]
   db.execute('UPDATE "'+table('wxid_alpha')+'" SET message_content=? WHERE local_id=5',('readable fixture share',))
  db.executemany('INSERT INTO "'+table(history)+'" VALUES (?,?,?,?,?,?,?,?,?)',rows)
`, dataset, compressed]);
});
test.after(async () => { await fs.rm(base, { recursive: true, force: true }); });

async function client(t, dataDir = dataset) {
  const stateDir = await fs.mkdtemp(path.join(base, 'state-')); await fs.chmod(stateDir, 0o700);
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath: path.join(root, 'build/candidates/alpha-data-bridge'), dataDir, accountId });
  t.after(() => engine.close());
  let sequence = 1n;
  const raw = (method, value = {}) => engine.dispatch(EngineClientFrame.fromPartial({ requestId: sequence++, [method]: value }));
  assert.ok((await raw('hello', { protocol: { major: 1, minor: 0 } })).hello);
  const api = { ...desktop.methods, nextRequestId: 10000n, locatedMessages: new desktop.LocatedMessages(), start: async () => {}, call: frame => engine.dispatch(EngineClientFrame.fromPartial(frame)) };
  return { raw, api };
}
async function allSearch(api, query, options = {}) {
  const rows = []; let cursor = '';
  for (let i = 0; i < 100; i++) {
    const result = await api.searchMessagePage(accountId, query, { pageSize: 2, ...options, cursor });
    rows.push(...result.items);
    if (!result.nextCursor) return rows;
    assert.notEqual(result.nextCursor, cursor); cursor = result.nextCursor;
  }
  assert.fail('search pagination did not terminate');
}
async function allMessages(api, conversationId, ascending, initialCursor = '') {
  const rows = []; let cursor = initialCursor;
  for (let i = 0; i < 100; i++) {
    const result = await api.listMessagePage(accountId, conversationId, { pageSize: 2, ascending, cursor });
    rows.push(...result.items);
    if (!result.nextCursor) return rows;
    assert.notEqual(result.nextCursor, cursor); cursor = result.nextCursor;
  }
  assert.fail('message pagination did not terminate');
}
async function continuation(api, conversationId, options, hasMore) {
  const rows = []; let cursor = options.cursor;
  if (!hasMore) return rows;
  for (let i = 0; i < 100; i++) {
    const result = await api.listMessagePage(accountId, conversationId, { ...options, pageSize: 2, cursor });
    rows.push(...result.items);
    if (!result.nextCursor) return rows;
    assert.notEqual(result.nextCursor, cursor); cursor = result.nextCursor;
  }
  assert.fail('context continuation did not terminate');
}

test('real search includes readable zstd and historical conversations absent from sessions', async t => {
  const { api } = await client(t);
  const results = await allSearch(api, 'needle', { ascending: true });
  assert.equal(results.length, 26);
  assert.ok(results.every(row => row.conversationId === history));
  assert.ok(results.some(row => row.text === '压缩 Needle UNIQUEZSTD'));
  const listed = await allMessages(api, history, true);
  const ids = new Set(listed.map(row => row.id));
  assert.ok(results.every(row => row.exactIdentity && ids.has(row.id)));
  assert.equal(new Set(results.map(row => row.id)).size, results.length);
  const backwards = await allSearch(api, 'Needle', { ascending: false });
  assert.deepEqual(backwards.map(row => row.id), results.map(row => row.id).toReversed());
  assert.equal((await allSearch(api, '% _')).length, 1, 'wildcards must be literal user text');
  const grouped = await api.searchConversationPage(accountId, 'Needle', { pageSize: 10 });
  assert.equal(grouped.items.length, 1); assert.equal(grouped.items[0].matchCount, 26);
  assert.equal(grouped.items[0].id, backwards[0].id);
});

test('inclusive search milliseconds, sender scope and query-bound cursors stay exact', async t => {
  const { api } = await client(t);
  const atTime = await allSearch(api, 'Needle', { conversationId: history, fromUnixMs: String(timestamp), toUnixMs: String(timestamp), ascending: true });
  assert.equal(atTime.length, 4);
  const betweenSeconds = await allSearch(api, 'Needle', { conversationId: history, fromUnixMs: String(timestamp + 1n), toUnixMs: String(timestamp + 999n) });
  assert.equal(betweenSeconds.length, 0);
  const self = await allSearch(api, 'Needle', { conversationId: history, senderId: 'wxid_self' });
  assert.equal(self.length, 12); assert.ok(self.every(row => row.senderId === 'wxid_self'));
  const first = await api.searchMessagePage(accountId, 'Needle', { conversationId: history, pageSize: 1 });
  await assert.rejects(api.searchMessagePage(accountId, 'other', { conversationId: history, pageSize: 1, cursor: first.nextCursor }), /CURSOR/);
  await assert.rejects(api.searchMessagePage(accountId, 'Needle', { conversationId: history, senderId: 'wxid_self', pageSize: 1, cursor: first.nextCursor }), /CURSOR/);
});

test('actual desktop search context finds a target despite create_time and sort_seq disagreeing', async t => {
  const { api } = await client(t);
  const [target] = await allSearch(api, 'Needle target', { conversationId: history });
  assert.ok(target);
  const context = await api.searchMessageContext(accountId, target, { before: 10, after: 10 });
  assert.equal(context.items[context.targetIndex].id, target.id);
  const listed = await allMessages(api, history, true);
  for (let i = 1; i < listed.length; i++) assert.ok(BigInt(listed[i - 1].sentAtUnixMs) <= BigInt(listed[i].sentAtUnixMs));
  assert.equal(new Set(listed.map(row => row.id)).size, listed.length);
  assert.deepEqual((await allMessages(api, history, false)).map(row => row.id), listed.map(row => row.id).toReversed());
  const selectedIndex = listed.findIndex(row => row.id === target.id);
  assert.ok(context.items.length > 1);
  for (const row of context.items) assert.ok(listed.some(item => item.id === row.id));
  assert.ok(context.items.slice(0, context.targetIndex).every(row => listed.findIndex(item => item.id === row.id) < selectedIndex));
  assert.ok(context.items.slice(context.targetIndex + 1).every(row => listed.findIndex(item => item.id === row.id) > selectedIndex));
  const first = listed.findIndex(row => row.id === context.items[0].id);
  assert.deepEqual(Array.from(context.items, row => row.id), listed.slice(first, first + context.items.length).map(row => row.id));
  assert.ok(context.targetIndex >= Math.min(10, selectedIndex));
  assert.ok(context.items.length - context.targetIndex - 1 >= Math.min(10, listed.length - selectedIndex - 1));
  const older = await continuation(api, history, context.before, context.hasMoreBefore);
  const newer = await continuation(api, history, context.after, context.hasMoreAfter);
  assert.deepEqual([...older.toReversed(), ...context.items, ...newer].map(row => row.id), listed.map(row => row.id));
});

test('server-id locate anchors use real shared ordering and reject cross-shard ambiguity', async t => {
  const { api } = await client(t);
  const anchor = await api.locateMessage(accountId, history, '800001');
  assert.ok(anchor?.before); assert.ok(anchor.after);
  const listed = await allMessages(api, history, true), index = listed.findIndex(row => row.id === anchor.message.id);
  const older = await allMessages(api, history, false, anchor.before);
  const newer = await allMessages(api, history, true, anchor.after);
  assert.deepEqual(older.map(row => row.id), listed.slice(0, index).map(row => row.id).toReversed());
  assert.deepEqual(newer.map(row => row.id), listed.slice(index + 1).map(row => row.id));
  await assert.rejects(api.locateMessage(accountId, history, '998'), /MESSAGE_LOCATE_AMBIGUOUS/);
  assert.equal(await api.locateMessage(accountId, history, '999999999999'), null);
  const target = await api.locateMessageByServerId(accountId, history, '800001');
  const context = await api.searchMessageContext(accountId, target, { before: 3, after: 3 });
  assert.equal(context.targetIndex, 3); assert.equal(context.items.length, 7); assert.equal(context.items[3].id, anchor.message.id);
});

test('calendar half-open millisecond bounds, timezone days and first-message stats agree with actual rows', async t => {
  const { api, raw } = await client(t);
  const from = 1704124799500n, to = 1704124801000n;
  const response = await raw('getConversationDayCounts', { accountId, conversationId: days, fromUnixMs: from, toUnixMs: to, utcOffsetMinutes: 480 });
  assert.equal(response.error, undefined);
  const request = desktop.dayCountsRequest(accountId, days, { fromUnixMs: String(from), toUnixMs: String(to), utcOffsetMinutes: 480 });
  const calendar = desktop.dayCountsFromWire(response.getConversationDayCounts, request);
  assert.deepEqual(toPlain(calendar.days), [{ date: '2024-01-02', count: 1 }]);
  const epochResult = await raw('getConversationDayCounts', { accountId, conversationId: epoch, fromUnixMs: 0n, toUnixMs: 1000n, utcOffsetMinutes: -720 });
  assert.equal(epochResult.getConversationDayCounts?.days[0].localDay, -1n);
  const zeroPage = await api.listMessagePage(accountId, epoch, { ascending: true, afterUnixMs: '-1', pageSize: 10 });
  assert.equal(zeroPage.items[0]?.sentAtUnixMs, '0');
  const statsRequest = { accountId, conversationIds: [history, days, epoch, 'wxid_empty_conversation'] };
  const stats = await raw('getChatExportStats', statsRequest);
  assert.equal(stats.error, undefined);
  for (const row of stats.getChatExportStats.items) assert.equal(row.counts.reduce((sum, value) => sum + value.count, 0n), row.total);
  const historyStats = stats.getChatExportStats.items.find(row => row.conversationId === history);
  assert.equal(historyStats.total, 29n); assert.equal(historyStats.firstMessageUnixMs, timestamp - 1000n); assert.equal(historyStats.lastMessageUnixMs, timestamp + 6000n);
  const mapped = desktop.chatExportStatsFromWire(stats.getChatExportStats, statsRequest, true);
  const epochStats = mapped.items.find(row => row.conversationId === epoch);
  assert.equal(epochStats.total, 2); assert.equal(epochStats.firstMessageUnixMs, '0'); assert.equal(epochStats.lastMessageUnixMs, '1000');
  const emptyStats = mapped.items.find(row => row.conversationId === 'wxid_empty_conversation');
  assert.equal(emptyStats.total, 0); assert.equal(emptyStats.firstMessageUnixMs, '0'); assert.equal(emptyStats.lastMessageUnixMs, '0');
  assert.throws(() => desktop.chatExportStatsFromWire(stats.getChatExportStats, statsRequest, false), /CHAT_EXPORT_RESPONSE_INVALID/, 'original mode keeps its original epoch-zero rejection');
  const malformed = { items: [{ conversationId: epoch, total: 0n, counts: [], firstMessageUnixMs: 0n, lastMessageUnixMs: 1000n }], failedConversationIds: [] };
  assert.throws(() => desktop.chatExportStatsFromWire(malformed, { conversationIds: [epoch] }, true), /CHAT_EXPORT_RESPONSE_INVALID/);
});

test('renderer date navigation clamps pre-epoch starts in both timezone directions', async t => {
  const script = `${rendererDateCode}\nconst parsedEpoch=parseJumpDate(localDay$2("0")); const values={epoch:localDay$2("0"), parsedEpoch, epochBound:parsedEpoch&&jumpLowerBound(parsedEpoch.startMs), jump:jumpLowerBound(parseJumpDate("1970-01-01").startMs), january:monthRange(1970,1), december:monthRange(1969,12), previous:parseJumpDate("1969-12-30"), december31:parseJumpDate("1969-12-31"), invalid:parseJumpDate("1970-02-30"), offset:monthUtcOffset(1970,1)}; process.stdout.write(JSON.stringify(values));`;
  const run = timezone => JSON.parse(execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' }));
  const shanghai = run('Asia/Shanghai');
  assert.equal(shanghai.epoch, '1970-01-01');
  assert.deepEqual(shanghai.parsedEpoch, { date: '1970-01-01', startMs: -28800000 });
  assert.equal(shanghai.jump, '-1');
  assert.equal(shanghai.january.fromUnixMs, '0');
  assert.equal(shanghai.january.toUnixMs, '2649600000');
  assert.equal(shanghai.offset, 480);
  assert.equal(shanghai.december31, null, 'this local day ends before UTC epoch');
  const losAngeles = run('America/Los_Angeles');
  assert.equal(losAngeles.epoch, '1969-12-31');
  assert.deepEqual(losAngeles.parsedEpoch, { date: '1969-12-31', startMs: -57600000 });
  assert.equal(losAngeles.jump, '28799999');
  assert.equal(losAngeles.january.fromUnixMs, '28800000');
  assert.deepEqual(losAngeles.december, { fromUnixMs: '0', toUnixMs: '28800000' });
  assert.equal(losAngeles.offset, -480);
  const { api } = await client(t);
  for (const values of [shanghai, losAngeles]) {
    assert.equal(values.epochBound, '-1');
    assert.equal(values.previous, null, 'whole pre-epoch days remain invalid');
    assert.equal(values.invalid, null, 'calendar overflow is not a valid date');
    const page = await api.listMessagePage(accountId, epoch, { ascending: true, afterUnixMs: values.epochBound, pageSize: 10 });
    assert.deepEqual(Array.from(page.items, row => row.sentAtUnixMs), ['0', '1000']);
  }
});

test('partial search returns known results plus truthful coverage and original mode omits the independent extension', async t => {
  const partial = path.join(base, 'partial'); await fs.cp(dataset, partial, { recursive: true });
  await execute('/usr/bin/python3', ['-c', String.raw`
import sqlite3,hashlib,sys
from pathlib import Path
db=sqlite3.connect(Path(sys.argv[1])/'message/message_0.db')
known='Msg_'+hashlib.md5(b'wxid_history_only').hexdigest()
db.execute('UPDATE "'+known+'" SET message_content=? WHERE local_id=3000',(bytes.fromhex('28b52ffd00'),))
unknown='Msg_'+hashlib.md5(b'no_name_mapping_exists').hexdigest()
db.execute('CREATE TABLE "'+unknown+'" (local_id INTEGER PRIMARY KEY,server_id INTEGER,sort_seq INTEGER,local_type INTEGER,create_time INTEGER,real_sender_id INTEGER,status INTEGER,message_content BLOB,packed_info_data BLOB)')
db.execute('INSERT INTO "'+unknown+'" VALUES(1,123,1,1,1700000500,1,4,?,?)',('Needle unmapped',b''))
db.commit();db.close()
`, partial]);
  const { raw, api } = await client(t, partial);
  const request = desktop.searchPageRequest(accountId, 'Needle', { pageSize: 50 });
  const reply = await raw('searchMessages', request); assert.equal(reply.error, undefined);
  const encoded = EngineServerFrame.encode(reply).finish();
  const roundtrip = EngineServerFrame.decode(encoded);
  assert.equal(roundtrip.searchMessages.incomplete, true);
  assert.equal(roundtrip.searchMessages.unreadableMessages, 1n);
  assert.equal(roundtrip.searchMessages.unmappedTables, 1);
  const maintained = desktop.searchPageResponse(roundtrip.searchMessages, request, true);
  assert.ok(maintained.items.some(row => row.text === 'Needle target'));
  assert.ok(maintained.items.every(row => row.conversationId === history));
  assert.deepEqual(toPlain(maintained.coverage), { complete: false, unreadableMessages: '1', unmappedTables: 1 });
  await assert.rejects(api.searchMessages(accountId, 'Needle'), /SEARCH_RESULTS_INCOMPLETE/, 'legacy array-only search must not drop coverage');
  const original = desktop.searchPageResponse(roundtrip.searchMessages, request, false);
  assert.equal(Object.hasOwn(original, 'coverage'), false);
  const complete = await client(t); const good = await complete.raw('searchMessages', request);
  assert.equal(good.searchMessages.incomplete, false);
  assert.equal(good.searchMessages.unreadableMessages, 0n);
  assert.equal(good.searchMessages.unmappedTables, 0);
  for (const extension of [
    { incomplete: false, unreadableMessages: 1n, unmappedTables: 0 },
    { incomplete: true, unreadableMessages: 0n, unmappedTables: 0 },
    { incomplete: true, unreadableMessages: -1n, unmappedTables: 0 },
    { incomplete: true, unreadableMessages: 0n, unmappedTables: 1.5 }
  ]) assert.throws(() => desktop.searchPageResponse({ ...roundtrip.searchMessages, ...extension }, request, true), /SEARCH_COVERAGE_INVALID/);
});
