import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEngine } from '../packages/alpha-engine/index.cjs';

const accountId = 'voice-blob-account';

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
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/engine-voice-blob-'));
  const stateDir = path.join(root, 'state');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  const bridgeFactory = () => ({
    closed: false,
    async call(operation, params) {
      if (operation === 'account.info') return { id: accountId, readOnly: true, sourceKind: 'offline-wechat-v4', snapshotId: 'snapshot-voice-blob', capabilities: ['account.info'] };
      if (operation === 'media.read_voice') { assert.deepEqual(params, { key: 'voice-1' }); return response; }
      throw new Error(`unexpected operation ${operation}`);
    },
    async close() { this.closed = true; }
  });
  const engine = await createEngine({ lock: lock(), stateDir, dataDir, accountId, bridgePath: '/absolute/synthetic-bridge', bridgeFactory });
  t.after(() => engine.close());
  return engine;
}

test('independent engine reads explicit VoiceInfo bytes as a bounded candidate', async t => {
  const bytes = Buffer.from('SILK');
  const engine = await fixture(t, {
    status: 'ready', sourceKind: 'explicit-v4-voice-database-candidate', complete: false,
    nativeSchemaSupported: false, thirdPartyCandidate: true, decoded: false, mediaReady: false,
    key: 'voice-1', sourceDatabase: 'media_0.db', sourceTable: 'VoiceInfo', dataBytes: bytes.length,
    sha256: 'fe7b365e726ca9d3e76ce2b05576b55b174dcccf116adef81b03edf30d8fbf5e', encoding: 'unknown-voice-data', data: bytes.toString('base64')
  });
  const result = await engine.readVoiceBlob({ accountId, key: 'voice-1' });
  assert.equal(result.thirdPartyCandidate, true);
  assert.equal(result.nativeSchemaSupported, false);
  assert.deepEqual(result.data, bytes);
  assert.equal(result.dataBytes, 4);
});

test('independent engine rejects a VoiceInfo response that claims native readiness', async t => {
  const engine = await fixture(t, {
    status: 'ready', sourceKind: 'explicit-v4-voice-database-candidate', complete: true,
    nativeSchemaSupported: true, thirdPartyCandidate: true, decoded: true, mediaReady: true,
    key: 'voice-1', sourceDatabase: 'media_0.db', sourceTable: 'VoiceInfo', dataBytes: 0,
    sha256: '0'.repeat(64), encoding: 'silk', data: Buffer.alloc(0)
  });
  await assert.rejects(() => engine.readVoiceBlob({ accountId, key: 'voice-1' }), { message: 'BRIDGE_MEDIA_VOICE_RESPONSE_INVALID' });
});
