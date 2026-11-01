import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEngine } from '../packages/alpha-engine/index.cjs';

const accountId = 'synthetic-account';

function lock() {
  return {
    assertAccess() {},
    status: () => ({ enabled: false, locked: false }),
    lock: () => ({ enabled: false, locked: false }),
    async unlock() { return this.status(); },
    async configure() { return this.status(); }
  };
}

async function fixture(t, manifestAccountId = accountId) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/engine-media-index-'));
  const stateDir = path.join(root, 'state');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(stateDir, { mode: 0o700 });
  await fs.mkdir(path.join(dataDir, 'media'), { mode: 0o700, recursive: true });
  const bytes = Buffer.from('synthetic png payload\n', 'utf8');
  const relativePath = 'media/image.bin';
  await fs.writeFile(path.join(dataDir, relativePath), bytes, { mode: 0o600 });
  const entry = {
    kind: 'image', id: 'image-id', rendition: 'source', relativePath,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length,
    mimeType: 'image/png', accountId: manifestAccountId, conversationId: 'wxid_peer'
  };
  await fs.writeFile(path.join(dataDir, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId: manifestAccountId, entries: [entry] }) + '\n', { mode: 0o600 });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, stateDir, dataDir, entry };
}

function bridgeFactory() {
  return {
    closed: false,
    async call(operation) {
      if (operation === 'account.info') return { id: accountId, readOnly: true, sourceKind: 'offline-wechat-v4', snapshotId: 'snapshot-1', capabilities: ['account.info', 'messages.list'] };
      if (operation === 'messages.list') return {
        items: [{
          conversationId: 'wxid_peer', localId: '1', serverId: '2', createTime: '1700000000',
          localType: '3', sender: 'wxid_peer', contentEncoding: 'utf8', content: '[image]',
          source: { database: 'message_0.db', table: 'Msg_test' },
          refs: [{ kind: 'image', id: 'image-id', mimeType: 'image/png' }]
        }], nextCursor: '', hasMore: false
      };
      throw new Error(`unexpected operation ${operation}`);
    },
    async close() { this.closed = true; }
  };
}

async function readMessage(t, f) {
  const engine = await createEngine({
    lock: lock(), stateDir: f.stateDir, dataDir: f.dataDir, accountId,
    bridgePath: '/absolute/synthetic-bridge',
    bridgeFactory
  });
  t.after(() => engine.close());
  const hello = await engine.dispatch({ requestId: 1n, hello: { protocol: { major: 1, minor: 0 } } });
  assert.equal(hello.error, undefined);
  const response = await engine.dispatch({ requestId: 2n, listMessages: { accountId, conversationId: 'wxid_peer', page: { pageSize: 10, cursor: new Uint8Array() }, ascending: true } });
  assert.equal(response.error, undefined);
  return { response, entry: f.entry };
}

test('independent media index decorates a verified image ref with a local sha URI', async t => {
  const f = await fixture(t);
  const { response, entry } = await readMessage(t, f);
  const item = response.listMessages.items[0];
  assert.equal(item.refs[0].uri, `alpha-media://sha256/${entry.sha256}`);
  assert.equal(item.refs[0].mimeType, 'image/png');
});

test('media index account binding fails closed and leaves the source ref unchanged', async t => {
  const f = await fixture(t, 'other-account');
  const { response } = await readMessage(t, f);
  assert.equal(response.listMessages.items[0].refs[0].uri, '');
});
