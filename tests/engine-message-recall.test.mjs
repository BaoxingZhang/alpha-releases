import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFixture } from './data-bridge-fixture.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');
const require = createRequire(import.meta.url);
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');

test('independent engine lists message-derived recall candidates with bound cursors', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-message-recall-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFixture(dataDir);
  const script = String.raw`import sqlite3,sys
db=sqlite3.connect(sys.argv[1]+'/message/message_1.db')
table=sys.argv[2]
revoke='''<msg><sysmsg type="revokemsg"><revokemsg><content>候选撤回</content><revoketime>1699999900</revoketime></revokemsg></sysmsg></msg>'''
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(11,228,500,10000,1700000014,2,2,revoke,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(12,229,501,10000,1700000015,2,2,'<msg><sysmsg type="revokemsg"><revokemsg><content>第二条撤回</content></revokemsg></sysmsg></msg>',''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(13,230,502,10000,1700000016,2,2,'<msg><text>not a revoke</text></msg>',''))
db.commit();db.close()`;
  await execute('/usr/bin/python3', ['-c', script, dataDir, fixture.table]);
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
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  const first = await call('listMessageRecallRecords', { accountId: fixture.accountId, conversationId: fixture.conversationId, limit: 1 });
  assert.equal(first.error, undefined, first.error?.code);
  assert.equal(first.listMessageRecallRecords.records.length, 1);
  const record = first.listMessageRecallRecords.records[0];
  assert.equal(record.conversationId, fixture.conversationId);
  assert.equal(record.originalLocalId, 12n);
  assert.equal(record.originalServerId, '229');
  assert.equal(record.originalText, '第二条撤回');
  assert.equal(record.originalSentAtUnixMs, 1700000015000n);
  assert.equal(record.originalSourceType, 10000n);
  assert.equal(record.confirmation, 'unverified-candidate');
  assert.equal(record.provenance, 'alpha-independent-message-derived-candidate');
  assert.equal(record.capturedAtUnixMs, 0n);
  assert.equal(record.decodeErrorCode, 'NATIVE_RECALL_SCHEMA_UNSUPPORTED');
  assert.equal(typeof first.listMessageRecallRecords.nextCursor, 'string');
  const second = await call('listMessageRecallRecords', { accountId: fixture.accountId, conversationId: fixture.conversationId, cursor: first.listMessageRecallRecords.nextCursor, limit: 1 });
  assert.equal(second.error, undefined, second.error?.code);
  assert.equal(second.listMessageRecallRecords.records.length, 1);
  assert.equal(second.listMessageRecallRecords.records[0].originalText, '候选撤回');
  assert.equal(second.listMessageRecallRecords.nextCursor, '');
  const wrongScope = await call('listMessageRecallRecords', { accountId: fixture.accountId, conversationId: 'wxid_beta', cursor: first.listMessageRecallRecords.nextCursor, limit: 1 });
  assert.equal(wrongScope.error?.code, 'MESSAGE_RECALL_CURSOR_INVALID');
});
