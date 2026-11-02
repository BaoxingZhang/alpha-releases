import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEngine } from '../packages/alpha-engine/index.cjs';

const accountId = 'probe-account';

function lock() {
  return {
    assertAccess() {},
    status: () => ({ enabled: false, locked: false }),
    lock: () => ({ enabled: false, locked: false }),
    async unlock() { return this.status(); },
    async configure() { return this.status(); }
  };
}

async function fixture(t, response) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/engine-media-probe-'));
  const stateDir = path.join(root, 'state');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  const bridgeFactory = () => ({
    closed: false,
    async call(operation) {
      if (operation === 'account.info') return {
        id: accountId,
        readOnly: true,
        sourceKind: 'offline-wechat-v4',
        snapshotId: 'snapshot-probe',
        capabilities: ['account.info', 'media.probe']
      };
      if (operation === 'media.probe') return response;
      throw new Error(`unexpected operation ${operation}`);
    },
    async close() { this.closed = true; }
  });
  const engine = await createEngine({ lock: lock(), stateDir, dataDir, accountId, bridgePath: '/absolute/synthetic-bridge', bridgeFactory });
  t.after(() => engine.close());
  return engine;
}

test('independent engine exposes bounded metadata-only media probe', async t => {
  const engine = await fixture(t, {
    status: 'ready',
    sourceKind: 'explicit-v4-media-database-probe',
    nativeSchemaSupported: false,
    metadataOnly: true,
    mediaReady: false,
    files: [{ path: 'hardlink.db', bytes: 123, sha256: 'a'.repeat(64) }],
    items: [{ kind: 'image', key: 'b'.repeat(32), name: 'photo.jpg', path: 'wxid/peer/photo.jpg', size: 7, modifyTime: 1700000000, dir1: 'wxid', dir2: 'peer', sourceDatabase: 'hardlink.db', sourceTable: 'image_hardlink_info_v4', metadataOnly: true, nativeSchemaSupported: false }],
    itemCount: 1,
    ambiguousItems: 0
  });
  const result = await engine.probeMedia(accountId);
  assert.equal(result.status, 'ready');
  assert.equal(result.metadataOnly, true);
  assert.equal(result.nativeSchemaSupported, false);
  assert.equal(result.mediaReady, false);
  assert.equal(result.items[0].path, 'wxid/peer/photo.jpg');
  assert.equal(result.items[0].size, 7);
});

test('independent engine rejects media probe metadata that violates the boundary', async t => {
  const engine = await fixture(t, {
    status: 'ready',
    sourceKind: 'explicit-v4-media-database-probe',
    nativeSchemaSupported: true,
    metadataOnly: true,
    mediaReady: true,
    files: [],
    items: [],
    itemCount: 0,
    ambiguousItems: 0
  });
  await assert.rejects(() => engine.probeMedia(accountId), { message: 'BRIDGE_MEDIA_PROBE_RESPONSE_INVALID' });
});
