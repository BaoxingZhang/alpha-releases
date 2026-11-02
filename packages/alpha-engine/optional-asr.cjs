'use strict';

// Optional independent ASR backend.  This module is deliberately separate
// from the recovered Alpha transcribeVoice/transcribeVoiceBatch branches:
// it only accepts a caller-selected WAV entry from media-index.v1.json and a
// caller-installed, hash-verified sherpa-onnx model.  It never resolves native
// VoiceInfo/SILK/media1_ tokens and never changes the native support matrix.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadMediaIndex, findMediaEntry, readMediaEntry } = require('./media-index.cjs');

const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const MAX_MODEL_FILE_BYTES = 512 * 1024 * 1024;
const MODEL_SPECS = Object.freeze({
  'zipformer-zh-small': Object.freeze({
    backend: 'sherpa-onnx',
    modelType: 'zipformer',
    files: Object.freeze({
      encoder: Object.freeze({ name: 'encoder.int8.onnx', sizeBytes: 25848215, sha256: 'b95f7a94fdc91408e4b1562391e9ed23c8bcab5e7ca0542adf88512a937e3e23' }),
      decoder: Object.freeze({ name: 'decoder.onnx', sizeBytes: 24950841, sha256: '54ee5cb3ef1869e48a3fdbd94165134221da72815ad24a5a58ff2b48327d006c' }),
      joiner: Object.freeze({ name: 'joiner.int8.onnx', sizeBytes: 6018498, sha256: '4d6e87ccc7c613e372e3c284a8c0e3e355f4bb1c1578b640c7bd7943d41d6d25' }),
      tokens: Object.freeze({ name: 'tokens.txt', sizeBytes: 114134, sha256: '5beaddf82e078ef5644dcad130f3c4817a04016bfb0f31c0df28c6b4fa8df3af' })
    })
  })
});

function fail(code) { throw new Error(code); }

function absoluteDirectory(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.length > 4096 || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
  const resolved = path.resolve(value);
  let stat;
  try { stat = fs.lstatSync(resolved); } catch (failure) { if (failure.code === 'ENOENT') fail(`${code}_MISSING`); throw failure; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
  return resolved;
}

function modelSpec(modelId) {
  if (typeof modelId !== 'string' || !Object.hasOwn(MODEL_SPECS, modelId)) fail('ASR_MODEL_UNSUPPORTED');
  return MODEL_SPECS[modelId];
}

function loadOptionalRuntime() {
  try {
    // Optional dependency: the base recovery project must remain installable
    // without downloading a native ASR addon or model.
    return { runtime: require('sherpa-onnx-node'), error: '' };
  } catch (failure) {
    return { runtime: null, error: failure?.code === 'MODULE_NOT_FOUND' ? 'ASR_RUNTIME_UNAVAILABLE' : 'ASR_RUNTIME_LOAD_FAILED' };
  }
}

function verifyModelFile(root, file) {
  const target = path.resolve(root, file.name);
  const relative = path.relative(root, target);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) fail('ASR_MODEL_PATH_INVALID');
  let handle;
  let stat;
  try {
    handle = fs.openSync(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    stat = fs.fstatSync(handle);
  } catch (failure) {
    if (failure.code === 'ENOENT') fail('ASR_MODEL_FILE_MISSING');
    if (failure.code === 'ELOOP') fail('ASR_MODEL_FILE_SYMLINK');
    fail('ASR_MODEL_FILE_INVALID');
  }
  try {
    if (!stat.isFile() || stat.size !== file.sizeBytes || stat.size > MAX_MODEL_FILE_BYTES) fail('ASR_MODEL_FILE_INVALID');
    const hash = crypto.createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let offset = 0;
    for (;;) {
      const read = fs.readSync(handle, buffer, 0, buffer.length, offset);
      if (read === 0) break;
      hash.update(buffer.subarray(0, read)); offset += read;
    }
    if (offset !== stat.size || hash.digest('hex') !== file.sha256) fail('ASR_MODEL_HASH_MISMATCH');
  } finally { fs.closeSync(handle); }
  return target;
}

function verifyModelRoot(modelRoot, modelId = 'zipformer-zh-small') {
  const root = absoluteDirectory(modelRoot, 'ASR_MODEL_ROOT_INVALID');
  const spec = modelSpec(modelId);
  const files = {};
  for (const [key, file] of Object.entries(spec.files)) files[key] = verifyModelFile(root, file);
  return { modelId, root, spec, files };
}

function inspectAsrRuntime({ modelRoot, modelId = 'zipformer-zh-small' } = {}) {
  const result = {
    scope: 'alpha-independent-optional-asr',
    backend: 'sherpa-onnx',
    model_id: modelId,
    complete: false,
    native_schema_supported: false,
    explicit_index_only: true,
    synthetic_only: false,
    runtime_available: false,
    model_available: false,
    ready: false
  };
  const runtime = loadOptionalRuntime();
  result.runtime_available = Boolean(runtime.runtime);
  if (runtime.error) result.runtime_error = runtime.error;
  try {
    const model = verifyModelRoot(modelRoot, modelId);
    result.model_available = true;
    result.model_files = Object.fromEntries(Object.entries(model.files).map(([key, value]) => [key, path.basename(value)]));
  } catch (failure) { result.model_error = failure.message; }
  result.ready = result.runtime_available && result.model_available;
  return result;
}

function parsePcmWav(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length > MAX_AUDIO_BYTES) fail('ASR_WAV_TOO_LARGE');
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') fail('ASR_WAV_INVALID');
  let offset = 12; let format; let data;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4); const size = bytes.readUInt32LE(offset + 4); offset += 8;
    if (size > bytes.length - offset) fail('ASR_WAV_INVALID');
    if (id === 'fmt ') format = bytes.subarray(offset, offset + size);
    else if (id === 'data' && !data) data = bytes.subarray(offset, offset + size);
    offset += size + (size & 1);
  }
  if (!format || format.length < 16 || !data || !data.length) fail('ASR_WAV_INVALID');
  const audioFormat = format.readUInt16LE(0), channels = format.readUInt16LE(2), sampleRate = format.readUInt32LE(4), bits = format.readUInt16LE(14);
  if (audioFormat !== 1 || ![1, 2].includes(channels) || bits !== 16 || sampleRate !== 16000 || data.length % (channels * 2) !== 0) fail('ASR_WAV_UNSUPPORTED');
  const frames = data.length / (channels * 2); const samples = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let total = 0;
    for (let channel = 0; channel < channels; channel += 1) total += data.readInt16LE((frame * channels + channel) * 2) / 32768;
    samples[frame] = total / channels;
  }
  return { sampleRate, samples };
}

function createRecognizer(model, runtime) {
  const OfflineRecognizer = runtime?.OfflineRecognizer;
  if (typeof OfflineRecognizer !== 'function') fail('ASR_RUNTIME_API_UNAVAILABLE');
  return new OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: model.files.encoder, decoder: model.files.decoder, joiner: model.files.joiner },
      tokens: model.files.tokens,
      numThreads: 2,
      provider: 'cpu',
      debug: 0
    }
  });
}

function acceptWaveform(stream, wave) {
  if (!stream || typeof stream.acceptWaveform !== 'function') fail('ASR_RUNTIME_API_UNAVAILABLE');
  try { stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples }); }
  catch { stream.acceptWaveform(wave.sampleRate, wave.samples); }
}

function transcribeWavBytes(bytes, { modelRoot, modelId = 'zipformer-zh-small', runtime } = {}) {
  const wave = parsePcmWav(bytes);
  const model = verifyModelRoot(modelRoot, modelId);
  const loaded = runtime || loadOptionalRuntime().runtime;
  if (!loaded) fail('ASR_RUNTIME_UNAVAILABLE');
  const recognizer = createRecognizer(model, loaded);
  const stream = recognizer.createStream();
  acceptWaveform(stream, wave);
  if (typeof recognizer.decode !== 'function' || typeof recognizer.getResult !== 'function') fail('ASR_RUNTIME_API_UNAVAILABLE');
  recognizer.decode(stream);
  const raw = recognizer.getResult(stream);
  const text = typeof raw === 'string' ? raw : raw?.text;
  if (typeof text !== 'string' || text.length > 1024 * 1024) fail('ASR_RUNTIME_RESULT_INVALID');
  return { text, modelId, sampleRate: wave.sampleRate, sampleCount: wave.samples.length };
}

async function transcribeIndexedVoice({ mediaIndexRoot, mediaId, accountId = '', modelRoot, modelId = 'zipformer-zh-small', runtime } = {}) {
  const root = absoluteDirectory(mediaIndexRoot, 'ASR_MEDIA_INDEX_ROOT_INVALID');
  if (typeof mediaId !== 'string' || !mediaId || mediaId.length > 1024 || /[\u0000-\u001f\u007f]/u.test(mediaId)) fail('ASR_MEDIA_ID_INVALID');
  const index = loadMediaIndex({ root, expectedAccountId: accountId });
  const entry = findMediaEntry(index, { kind: 'voice', id: mediaId, rendition: 'source' });
  if (!entry) fail('ASR_MEDIA_ENTRY_NOT_FOUND');
  if (entry.mimeType && entry.mimeType !== 'audio/wav' && entry.mimeType !== 'audio/x-wav') fail('ASR_MEDIA_NOT_WAV');
  const { bytes } = await readMediaEntry(index, entry, { maxBytes: MAX_AUDIO_BYTES });
  const result = transcribeWavBytes(bytes, { modelRoot, modelId, runtime });
  return { ...result, mediaId, mediaSha256: entry.sha256, scope: 'alpha-independent-optional-asr', complete: false, native_schema_supported: false, explicit_index_only: true, synthetic_only: false };
}

module.exports = {
  MAX_AUDIO_BYTES,
  MODEL_SPECS,
  inspectAsrRuntime,
  verifyModelRoot,
  parsePcmWav,
  transcribeWavBytes,
  transcribeIndexedVoice
};
