import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEngine } from '../packages/alpha-engine/index.cjs';

const accountId = 'contact-fallback-account';

function lock() {
  return {
    assertAccess() {},
    status: () => ({ enabled: false, locked: false }),
    lock: () => ({ enabled: false, locked: false }),
    async unlock() { return this.status(); },
    async configure() { return this.status(); }
  };
}

function row(username, rowId) {
  return {
    username,
    localType: username.endsWith('@chatroom') ? '2' : '1',
    alias: username === 'wxid_alpha' ? 'alpha' : '',
    remark: username === 'wxid_alpha' ? 'Alpha' : username,
    nickName: username === 'wxid_alpha' ? 'Alpha' : username,
    source: { database: 'contact.db', table: 'contact', rowId: String(rowId) },
    fields: []
  };
}

test('contact lookup falls back to exact paged contacts DTOs', async t => {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/engine-contact-fallback-'));
  const stateDir = path.join(root, 'state');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  t.after(async () => { await engine?.close(); await fs.rm(root, { recursive: true, force: true }); });

  let engine;
  const bridgeFactory = () => ({
    closed: false,
    async call(operation, params = {}) {
      if (operation === 'account.info') return {
        id: accountId,
        readOnly: true,
        sourceKind: 'offline-wechat-v4',
        snapshotId: 'contact-fallback-snapshot',
        capabilities: ['account.info', 'contacts.list']
      };
      if (operation === 'contacts.lookup') throw new Error('UNSUPPORTED_OPERATION');
      if (operation === 'contacts.list') {
        const username = params.usernameExact;
        if (username === 'wxid_missing') return { items: [], nextCursor: '', hasMore: false };
        if (username === 'wxid_duplicate') return { items: [row(username, 4), row(username, 5)], nextCursor: '', hasMore: false };
        if (username === 'wxid_alpha') return { items: [row(username, 1)], nextCursor: '', hasMore: false };
        if (username === 'wxid_beta') return { items: [row(username, 2)], nextCursor: '', hasMore: false };
        return { items: [], nextCursor: '', hasMore: false };
      }
      throw new Error(`unexpected operation ${operation}`);
    },
    async close() { this.closed = true; }
  });
  engine = await createEngine({ lock: lock(), stateDir, dataDir, accountId, bridgePath: '/absolute/synthetic-bridge', bridgeFactory });

  assert.equal((await engine.dispatch({ requestId: 1n, hello: { protocol: { major: 1, minor: 0 } } })).error, undefined);
  const listed = await engine.dispatch({ requestId: 2n, listContacts: { accountId, lookup: { usernames: ['wxid_beta', 'wxid_missing', 'wxid_alpha'] } } });
  assert.equal(listed.error, undefined, listed.error?.code);
  assert.deepEqual(listed.listContacts.response.lookup.items.map(item => item.username), ['wxid_beta', 'wxid_alpha']);
  assert.equal(listed.listContacts.response.sourceTable, 'contact');

  const profile = await engine.dispatch({ requestId: 3n, getContactProfile: { accountId, username: 'wxid_alpha', commonGroupLimit: 0 } });
  assert.equal(profile.error, undefined, profile.error?.code);
  assert.equal(profile.getContactProfile.response.profile.username, 'wxid_alpha');

  const duplicate = await engine.dispatch({ requestId: 4n, listContacts: { accountId, lookup: { usernames: ['wxid_duplicate'] } } });
  assert.equal(duplicate.error?.code, 'CONTACT_LOOKUP_AMBIGUOUS');
});
