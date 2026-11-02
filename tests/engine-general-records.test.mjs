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

test('independent engine exposes partial payment, revoke, and call candidates', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-records-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFixture(dataDir);
  const script = `
import sqlite3,sys
db=sqlite3.connect(sys.argv[1] + '/message/message_1.db')
table=sys.argv[2]
payment='<msg><appmsg><type>2000</type><wcpayinfo><paysubtype>3</paysubtype><feedesc>￥8.00</feedesc><transferid>tr-engine</transferid><receiver_username>wxid_self</receiver_username><payer_username>wxid_beta</payer_username></wcpayinfo></appmsg></msg>'
revoke='<msg><sysmsg type="revokemsg"><revokemsg><content>撤回测试</content><revoketime>1699999900</revoketime></revokemsg></sysmsg></msg>'
call='<msg><voipinvitemsg><media>voice</media><durationseconds>7</durationseconds></voipinvitemsg></msg>'
friend='<msg><sysmsg type="VerifyMsg"><username>wxid_gamma</username><nickname>Gamma</nickname><content>加个好友</content><scene>33</scene></sysmsg></msg>'
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(6,223,401,49,1700000010,1,2,payment,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(7,224,402,10000,1700000011,2,2,revoke,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(8,225,403,50,1700000012,1,2,call,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(9,226,404,37,1700000013,1,2,friend,''))
db.commit();db.close()
`;
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
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.equal(hello.error, undefined);
  const paymentReply = await call('listGeneral', { accountId: fixture.accountId, tableName: '__alpha_general_payments', query: '', limit: 100, offset: 0, ascending: false });
  assert.equal(paymentReply.error, undefined, String(paymentReply.error?.code || 'payment failed'));
  const payment = paymentReply.listGeneral.response;
  assert.equal(payment.items.length, 1);
  assert.equal(payment.items[0].fields.find(field => field.name === 'partial').value, '1');
  assert.equal(payment.items[0].fields.find(field => field.name === 'amount').value, '￥8.00');
  const filteredPaymentReply = await call('listGeneral', { accountId: fixture.accountId, tableName: '__alpha_general_payments', query: '￥8.00', limit: 100, offset: 0, ascending: true });
  assert.equal(filteredPaymentReply.error, undefined, String(filteredPaymentReply.error?.code || 'filtered payment failed'));
  assert.equal(filteredPaymentReply.listGeneral.response.items.length, 1);
  assert.equal(filteredPaymentReply.listGeneral.response.items[0].fields.find(field => field.name === 'candidate').value, '1');
  const revokeReply = await call('listGeneral', { accountId: fixture.accountId, tableName: '__alpha_general_revokes', query: '', limit: 100, offset: 0, ascending: false });
  assert.equal(revokeReply.error, undefined, String(revokeReply.error?.code || 'revoke failed'));
  const revoke = revokeReply.listGeneral.response;
  assert.equal(revoke.items.length, 1);
  assert.equal(revoke.items[0].fields.find(field => field.name === 'revoke_content').value, '撤回测试');
  const callsReply = await call('listGeneral', { accountId: fixture.accountId, tableName: '__alpha_general_calls', query: '', limit: 100, offset: 0, ascending: false });
  assert.equal(callsReply.error, undefined, String(callsReply.error?.code || 'calls failed'));
  const calls = callsReply.listGeneral.response;
  assert.equal(calls.items.length, 1);
  assert.equal(calls.items[0].fields.find(field => field.name === 'kind').value, 'call');
  assert.equal(calls.items[0].fields.find(field => field.name === 'state').value, 'unknown');
  assert.equal(calls.items[0].fields.some(field => field.name === 'media'), false);
  assert.equal(calls.items[0].fields.some(field => field.name === 'duration_seconds'), false);
  assert.equal(calls.items[0].fields.some(field => field.name === 'interrupted'), false);
  assert.equal(calls.items[0].fields.find(field => field.name === 'partial').value, '1');
  const friendReply = await call('listGeneral', { accountId: fixture.accountId, tableName: '__alpha_general_friend_requests', query: '', limit: 100, offset: 0, ascending: false });
  assert.equal(friendReply.error, undefined, String(friendReply.error?.code || 'friend request failed'));
  const friendRequests = friendReply.listGeneral.response;
  assert.equal(friendRequests.items.length, 1);
  assert.equal(friendRequests.items[0].fields.find(field => field.name === 'person').value, 'wxid_gamma');
  assert.equal(friendRequests.items[0].fields.find(field => field.name === 'person_nickname').value, 'Gamma');
  assert.equal(friendRequests.items[0].fields.find(field => field.name === 'greeting').value, '加个好友');
  assert.equal(friendRequests.items[0].fields.find(field => field.name === 'partial').value, '1');
});

