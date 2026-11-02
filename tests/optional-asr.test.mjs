import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectAsrRuntime, parsePcmWav, transcribeIndexedVoice } from '../packages/alpha-engine/optional-asr.cjs';
import { writeMediaIndex } from '../packages/alpha-engine/media-index.cjs';

function wav16(samples, sampleRate = 16000) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => data.writeInt16LE(sample, index * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + data.length, 4); header.write('WAVE', 8);
  header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('optional ASR parses bounded PCM WAV and exposes no native parity claim', () => {
  const parsed = parsePcmWav(wav16([0, 16384, -16384, 32767]));
  assert.equal(parsed.sampleRate, 16000);
  assert.equal(parsed.samples.length, 4);
  assert.ok(parsed.samples[1] > 0.49 && parsed.samples[1] < 0.51);
  assert.throws(() => parsePcmWav(Buffer.from('not-a-wav')), /ASR_WAV_INVALID/);
  assert.throws(() => parsePcmWav(wav16([0], 8000)), /ASR_WAV_UNSUPPORTED/);
});

test('optional ASR inspect reports missing runtime/model without downloading anything', () => {
  const result = inspectAsrRuntime({ modelRoot: path.join(os.tmpdir(), `alpha-asr-missing-${process.pid}`) });
  assert.equal(result.scope, 'alpha-independent-optional-asr');
  assert.equal(result.complete, false);
  assert.equal(result.native_schema_supported, false);
  assert.equal(result.explicit_index_only, true);
  assert.equal(result.ready, false);
  assert.match(result.model_error, /^ASR_MODEL_ROOT_INVALID_MISSING$/);
});

test('optional ASR accepts only a caller-selected voice media-index entry', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-optional-asr-'));
  const audio = wav16([0, 1, -1, 2]);
  await fs.writeFile(path.join(root, 'voice.wav'), audio, { mode: 0o600 });
  await writeMediaIndex({ root, accountId: 'acct-asr', entries: [{ kind: 'voice', id: 'voice-1', relativePath: 'voice.wav', mimeType: 'audio/wav', accountId: 'acct-asr' }] });
  await assert.rejects(
    transcribeIndexedVoice({ mediaIndexRoot: root, accountId: 'acct-asr', mediaId: 'voice-1', modelRoot: path.join(root, 'missing-model') }),
    /ASR_MODEL_ROOT_INVALID_MISSING/
  );
  await assert.rejects(
    transcribeIndexedVoice({ mediaIndexRoot: root, accountId: 'acct-asr', mediaId: 'missing', modelRoot: path.join(root, 'missing-model') }),
    /ASR_MEDIA_ENTRY_NOT_FOUND/
  );
});
