import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createEngine } from '../packages/alpha-engine/index.cjs';

const accountId = 'synthetic-voice-account';

function lock() {
  return { assertAccess() {}, status: () => ({ enabled: false, locked: false }), lock: () => ({ enabled: false, locked: false }), async unlock() { return this.status(); }, async configure() { return this.status(); } };
}

test('synthetic voice playback maps a source id to a verified WAV media index entry', async t => {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/engine-voice-playback-'));
  const stateDir = path.join(root, 'state');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(dataDir, 'media'), { recursive: true, mode: 0o700 });
  const sourceId = '1'.repeat(64);
  const wav = Buffer.from('RIFFsynthetic-wav\n', 'utf8');
  const wavId = crypto.createHash('sha256').update(wav).digest('hex');
  await fs.writeFile(path.join(dataDir, 'media', 'voice.wav'), wav, { mode: 0o600 });
  await fs.writeFile(path.join(dataDir, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId, entries: [{ kind: 'voice', id: wavId, rendition: 'wav', relativePath: 'media/voice.wav', sha256: wavId, sizeBytes: wav.length, mimeType: 'audio/wav', accountId }] }) + '\n', { mode: 0o600 });
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  const bridgeFactory = () => ({
    closed: false,
    async call(operation, params) {
      if (operation === 'account.info') return { id: accountId, readOnly: true, sourceKind: 'offline-wechat-v4', snapshotId: 'voice-snapshot', capabilities: ['account.info', 'messages.voicePlayback'] };
      if (operation === 'voice.playback') return params.mediaId === sourceId ? { status: 'ready', mediaId: sourceId, wavMediaId: wavId, sourceTable: '__alpha_voice_playback_v1' } : { status: 'missing' };
      throw new Error(`unexpected operation ${operation}`);
    },
    async close() { this.closed = true; }
  });
  const engine = await createEngine({ lock: lock(), stateDir, dataDir, accountId, bridgePath: '/absolute/synthetic-bridge', bridgeFactory });
  t.after(() => engine.close());
  assert.equal((await engine.dispatch({ requestId: 1n, hello: { protocol: { major: 1, minor: 0 } } })).error, undefined);
  const response = await engine.dispatch({ requestId: 2n, decodeVoicePlayback: { accountId, mediaId: sourceId } });
  assert.equal(response.error, undefined, response.error?.code);
  assert.equal(response.decodeVoicePlayback.wavMediaId, wavId);
});

test('synthetic voice playback refuses a non-WAV or missing indexed object', async t => {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/engine-voice-playback-invalid-'));
  const stateDir = path.join(root, 'state');
  const dataDir = path.join(root, 'data');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const sourceId = '2'.repeat(64);
  const wavId = '3'.repeat(64);
  await fs.writeFile(path.join(dataDir, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId, entries: [{ kind: 'voice', id: wavId, rendition: 'source', relativePath: 'missing.wav', sha256: wavId, sizeBytes: 1, mimeType: 'audio/wav', accountId }] }) + '\n', { mode: 0o600 });
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  const bridgeFactory = () => ({ closed: false, async call(operation) { if (operation === 'account.info') return { id: accountId, readOnly: true, sourceKind: 'offline-wechat-v4', snapshotId: 'voice-snapshot', capabilities: ['account.info', 'messages.voicePlayback'] }; if (operation === 'voice.playback') return { status: 'ready', mediaId: sourceId, wavMediaId: wavId }; throw new Error(`unexpected operation ${operation}`); }, async close() { this.closed = true; } });
  const engine = await createEngine({ lock: lock(), stateDir, dataDir, accountId, bridgePath: '/absolute/synthetic-bridge', bridgeFactory });
  t.after(() => engine.close());
  assert.equal((await engine.dispatch({ requestId: 1n, hello: { protocol: { major: 1, minor: 0 } } })).error, undefined);
  const response = await engine.dispatch({ requestId: 2n, decodeVoicePlayback: { accountId, mediaId: sourceId } });
  assert.equal(response.error?.code, 'VOICE_PLAYBACK_NOT_FOUND');
});
