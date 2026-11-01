import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { createFixture } from './data-bridge-fixture.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');
const require = createRequire(import.meta.url);
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');

async function addRecords(directory, table) {
  const script = [
    'import sqlite3,sys',
    "db=sqlite3.connect(sys.argv[1] + '/message/message_1.db')",
    't=sys.argv[2]',
    "payment='<msg><appmsg><type>2000</type><wcpayinfo><paysubtype>3</paysubtype><feedesc>￥8.00</feedesc><transferid>tr-export</transferid><receiver_username>wxid_self</receiver_username><payer_username>wxid_beta</payer_username></wcpayinfo></appmsg></msg>'",
    "revoke='<msg><sysmsg type=\"revokemsg\"><revokemsg><content>撤回导出</content><revoketime>1699999900</revoketime></revokemsg></sysmsg></msg>'",
    "call='<msg><voipmsg><voiptype>video</voiptype><duration>9</duration></voipmsg></msg>'",
    "friend='<msg><sysmsg type=\"VerifyMsg\"><username>wxid_gamma</username><nickname>Gamma</nickname><content>加个好友</content><scene>33</scene></sysmsg></msg>'",
    "db.execute('INSERT INTO \"'+t+'\" VALUES (?,?,?,?,?,?,?,?,?)',(6,223,401,49,1700000010,1,2,payment,''))",
    "db.execute('INSERT INTO \"'+t+'\" VALUES (?,?,?,?,?,?,?,?,?)',(7,224,402,10000,1700000011,2,2,revoke,''))",
    "db.execute('INSERT INTO \"'+t+'\" VALUES (?,?,?,?,?,?,?,?,?)',(8,225,403,50,1700000012,1,2,call,''))",
    "db.execute('INSERT INTO \"'+t+'\" VALUES (?,?,?,?,?,?,?,?,?)',(9,226,404,37,1700000013,1,2,friend,''))",
    'db.commit();db.close()'
  ].join('\n');
  await execute('/usr/bin/python3', ['-c', script, directory, table]);
}

async function waitForTerminal(call, jobId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const reply = await call('watchChatExport', { jobId });
    const snapshot = reply.watchChatExport;
    if (['canceled', 'completed', 'completed_with_errors', 'failed'].includes(snapshot.state)) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('record export did not finish');
}

test('frame 136 exports partial payment/friend-request/revoke/call candidates with shared job lifecycle', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-record-export-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFixture(dataDir);
  await addRecords(dataDir, fixture.table);
  const stateDir = path.join(outer, 'state');
  const outputRoot = path.join(outer, 'out');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let requestId = 0n;
  const call = async (method, payload = {}) => {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: payload });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  };
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  const started = await call('startRecordExport', {
    accountId: fixture.accountId,
    format: 'json',
    outputDirectory: outputRoot,
    categories: [{ category: 'payments' }, { category: 'friend_requests' }, { category: 'revokes' }, { category: 'calls' }]
  });
  assert.equal(started.error, undefined, String(started.error?.code || 'start failed'));
  const snapshot = await waitForTerminal(call, started.startRecordExport.jobId);
  assert.equal(snapshot.kind, 'records');
  assert.equal(snapshot.state, 'completed');
  assert.equal(snapshot.items.length, 4);
  let paymentId = '';
  for (const item of snapshot.items) {
    assert.equal(item.state, 'completed');
    const parsed = JSON.parse(await fs.readFile(item.path, 'utf8'));
    assert.equal(parsed.partial, true);
    assert.equal(parsed.candidate, true);
    assert.equal(parsed.records.length, 1);
    assert.equal(parsed.records[0].fields.some(field => field.name === 'source_table'), true);
    if (item.conversationId === 'payments') paymentId = parsed.records[0].id;
  }
  assert.ok(paymentId);
  for (const format of ['csv', 'xlsx']) {
    const formatRoot = path.join(outer, `out-${format}`);
    const next = await call('startRecordExport', {
      accountId: fixture.accountId,
      format,
      outputDirectory: formatRoot,
      categories: [{ category: 'payments', selected: true, recordIds: [paymentId] }]
    });
    assert.equal(next.error, undefined, String(next.error?.code || `${format} start failed`));
    const formatSnapshot = await waitForTerminal(call, next.startRecordExport.jobId);
    assert.equal(formatSnapshot.state, 'completed');
    const output = await fs.readFile(formatSnapshot.items[0].path);
    if (format === 'csv') assert.match(output.toString('utf8'), /field\.partial/);
    else assert.equal(output.subarray(0, 2).toString('hex'), '504b');
  }
  const listed = await call('listChatExports', { accountId: fixture.accountId });
  assert.equal(listed.error, undefined);
  assert.equal(listed.listChatExports.jobs.some(job => job.jobId === started.startRecordExport.jobId && job.kind === 'records'), true);
});

test('record export rejects unsupported category/format and protects source path', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-record-export-reject-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFixture(dataDir);
  const stateDir = path.join(outer, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let requestId = 0n;
  const call = async (method, payload = {}) => {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: payload });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  };
  await call('hello', { protocol: { major: 1, minor: 0 } });
  const callExport = await call('startRecordExport', { accountId: fixture.accountId, format: 'json', outputDirectory: path.join(outer, 'calls-out'), categories: [{ category: 'calls' }] });
  assert.equal(callExport.error, undefined, String(callExport.error?.code || 'call export start failed'));
  const callSnapshot = await waitForTerminal(call, callExport.startRecordExport.jobId);
  assert.equal(callSnapshot.state, 'completed');
  assert.equal(callSnapshot.items.length, 1);
  const unsupportedFormat = await call('startRecordExport', { accountId: fixture.accountId, format: 'html', outputDirectory: path.join(outer, 'out'), categories: [{ category: 'payments' }] });
  assert.equal(unsupportedFormat.error.code, 'RECORD_EXPORT_FORMAT_UNSUPPORTED');
  const sourceOutput = await call('startRecordExport', { accountId: fixture.accountId, format: 'json', outputDirectory: dataDir, categories: [{ category: 'payments' }] });
  assert.equal(sourceOutput.error, undefined);
  const snapshot = await waitForTerminal(call, sourceOutput.startRecordExport.jobId);
  assert.equal(snapshot.state, 'completed_with_errors');
  assert.equal(snapshot.items[0].errorCode, 'EXPORT_DESTINATION_INVALID');
});
