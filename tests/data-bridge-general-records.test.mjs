import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createFixture } from './data-bridge-fixture.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const binary = path.join(root, 'build/candidates/alpha-data-bridge');

function client(directory) {
  const child = spawn(binary, ['--data-dir', directory, '--account-id', 'synthetic-account'], { stdio: ['pipe', 'pipe', 'pipe'] });
  let buffer = '';
  const pending = new Map();
  let next = 0;
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    for (;;) {
      const end = buffer.indexOf('\n');
      if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      const value = JSON.parse(line);
      const callback = pending.get(value.id); pending.delete(value.id); callback?.(value);
    }
  });
  return {
    request(op, params = {}) {
      const id = String(++next);
      return new Promise(resolve => { pending.set(id, resolve); child.stdin.write(JSON.stringify({ id, op, params }) + '\n'); });
    },
    close() { child.stdin.end(); return new Promise(resolve => child.once('exit', resolve)); }
  };
}

async function fieldMap(record) {
  return new Map(record.fields.map(field => [field.name, field.value]));
}

test('message-derived payments and revokes remain explicitly partial candidates', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/general-records-'));
  const directory = path.join(outer, 'data');
  const fixture = await createFixture(directory);
  const script = `
import sqlite3,sys
db=sqlite3.connect(sys.argv[1] + '/message/message_1.db')
table=sys.argv[2]
payment='<msg><appmsg><type>2000</type><wcpayinfo><paysubtype>1</paysubtype><feedesc>￥20.00</feedesc><transcationid>tx-1</transcationid><transferid>tr-1</transferid><invalidtime>1700003600</invalidtime><pay_memo>测试备注</pay_memo><receiver_username>wxid_beta</receiver_username><payer_username>wxid_self</payer_username></wcpayinfo></appmsg></msg>'
revoke='<msg><sysmsg type="revokemsg"><revokemsg><content>撤回了一条消息</content><revoketime>1699999900</revoketime></revokemsg></sysmsg></msg>'
call='<msg><voipmsg><voiptype>video</voiptype><duration>42</duration></voipmsg></msg>'
unknown_call='<msg><text>not a voip payload</text></msg>'
malformed_call='<msg><voipmsg></msg>'
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(6,123456,301,49,1700000005,2,2,payment,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(7,123457,302,10000,1700000006,1,2,revoke,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(8,123458,303,50,1700000007,2,2,call,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(9,123459,304,50,1700000008,2,2,unknown_call,''))
db.execute('INSERT INTO "'+table+'" VALUES (?,?,?,?,?,?,?,?,?)',(10,123460,305,50,1700000009,2,2,malformed_call,''))
db.commit();db.close()
`;
  await execute('/usr/bin/python3', ['-c', script, directory, fixture.table]);
  const c = client(directory);
  t.after(async () => { await c.close(); await fs.rm(outer, { recursive: true, force: true }); });
  const payments = await c.request('general.list', { tableName: '__alpha_general_payments', query: '', limit: 100, offset: 0, ascending: false });
  assert.equal(payments.ok, true, JSON.stringify(payments));
  assert.equal(payments.result.items.length, 1);
  const payment = payments.result.items[0];
  const paymentFields = await fieldMap(payment);
  assert.equal(payment.tableName, '__alpha_general_payments');
  assert.equal(paymentFields.get('kind'), 'transfer');
  assert.equal(paymentFields.get('amount'), '￥20.00');
  assert.equal(paymentFields.get('transfer_id'), 'tr-1');
  assert.equal(paymentFields.get('transaction_id'), 'tx-1');
  assert.equal(paymentFields.get('partial'), '1');
  assert.equal(paymentFields.get('candidate'), '1');
  assert.equal(paymentFields.get('message_found'), '1');
  assert.equal(paymentFields.get('conversation'), fixture.conversationId);

  const revokes = await c.request('general.list', { tableName: '__alpha_general_revokes', query: '', limit: 100, offset: 0, ascending: false });
  assert.equal(revokes.ok, true, JSON.stringify(revokes));
  assert.equal(revokes.result.items.length, 1);
  const revokeFields = await fieldMap(revokes.result.items[0]);
  assert.equal(revokeFields.get('kind'), 'revoked');
  assert.equal(revokeFields.get('revoke_content'), '撤回了一条消息');
  assert.equal(revokeFields.get('message_found'), '0');
  assert.equal(revokeFields.get('partial'), '1');

  const calls = await c.request('general.list', { tableName: '__alpha_general_calls', query: '', limit: 10, offset: 0, ascending: false });
  assert.equal(calls.ok, true, JSON.stringify(calls));
  assert.equal(calls.result.items.length, 1);
  const callFields = await fieldMap(calls.result.items[0]);
  assert.equal(callFields.get('kind'), 'call');
  assert.equal(callFields.get('state'), 'unknown');
  assert.equal(callFields.has('media'), false);
  assert.equal(callFields.has('duration_seconds'), false);
  assert.equal(callFields.has('interrupted'), false);
  assert.equal(callFields.get('partial'), '1');
  assert.equal(callFields.get('candidate'), '1');
  assert.equal((await c.request('general.list', { tableName: '__alpha_general_payments', query: '', limit: 10, offset: 0, ascending: true })).error.code, 'INVALID_PARAMS');
});

