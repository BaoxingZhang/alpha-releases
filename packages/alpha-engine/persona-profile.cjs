'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');

const PROFILE_VERSION = 'alpha-persona-v2';
const MAX_INPUT_BYTES = 128 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 30 * 1000;

function fail(code) { throw new Error(code); }

function execFileCancelable(binary, args, options, isCanceled) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let cancellationTimer;
    const child = execFile(binary, args, options, (failure, stdout, stderr) => {
      if (cancellationTimer) clearInterval(cancellationTimer);
      if (settled) return;
      settled = true;
      if (failure) reject(failure);
      else resolve({ stdout, stderr });
    });
    const requestTermination = () => {
      if (!settled && isCanceled() && child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
      }
    };
    requestTermination();
    cancellationTimer = setInterval(requestTermination, 25);
  });
}

function executableCandidates() {
  const candidates = [];
  for (const value of [process.env.ALPHA_INDEPENDENT_DATA_ANALYSIS_PATH, process.env.ALPHA_DATA_ANALYSIS_PATH]) {
    if (typeof value === 'string' && value) candidates.push(path.resolve(value));
  }
  candidates.push(path.resolve(__dirname, '../../vendor/runtime/bin/alpha-data-analysis'));
  candidates.push(path.resolve(__dirname, '../../build/runtime-bundle/bin/alpha-data-analysis'));
  // In an independent packaged app the engine lives at
  // Resources/app/independent/packages/alpha-engine and runtime peers live at
  // Resources/bin. This path is only a lookup; it never scans user folders.
  candidates.push(path.resolve(__dirname, '../../../../bin/alpha-data-analysis'));
  return [...new Set(candidates)];
}

function resolveExecutable() {
  for (const candidate of executableCandidates()) {
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && (stat.mode & 0o111)) return candidate;
    } catch {}
  }
  fail('PERSONA_ANALYSIS_UNAVAILABLE');
}

function direction(value) {
  return value === 1 || value === 2 ? value : 0;
}

function kind(value) {
  if (typeof value !== 'string' || !value || value.length > 64 || /[\u0000-\u001f\u007f]/.test(value)) return 'unknown';
  return value === 'sticker' ? 'emoji' : value;
}

function canonicalMessage(message) {
  if (!message || typeof message !== 'object' || typeof message.id !== 'string' || !message.id || message.id.length > 2048 || /[\u0000-\u001f\u007f]/.test(message.id) || typeof message.conversationId !== 'string' || !message.conversationId || message.conversationId.length > 1024) fail('PERSONA_MESSAGE_INVALID');
  if (typeof message.sentAtUnixMs !== 'bigint' || message.sentAtUnixMs < -(1n << 63n) || message.sentAtUnixMs > (1n << 63n) - 1n) fail('PERSONA_MESSAGE_INVALID');
  const timestamp = Number(message.sentAtUnixMs);
  if (!Number.isSafeInteger(timestamp)) fail('PERSONA_MESSAGE_TIMESTAMP_UNSAFE');
  const decoded = message.contentDecodeStatus === undefined || message.contentDecodeStatus === 'decoded';
  const value = {
    id: message.id,
    conversation_id: message.conversationId,
    sent_at_unix_ms: timestamp,
    direction: direction(message.direction),
    kind: kind(message.kind),
    text: decoded && typeof message.text === 'string' ? message.text.slice(0, 4 * 1024 * 1024) : ''
  };
  if (value.kind !== 'text' && value.kind !== 'unknown' && value.kind !== 'unsupported') value.media_kind = value.kind;
  return value;
}

function validateProfile(profile, perspective, sourceTruncated) {
  const keys = ['adjacent_qa', 'algorithm_version', 'average_character_count', 'catchphrases', 'citable_message_ids', 'emoji_preferences', 'media_preferences', 'perspective', 'punctuation', 'representative_messages', 'scanned_messages', 'shared_events', 'source_truncated', 'subject_messages', 'tone_markers', 'top_terms'];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) || Object.keys(profile).sort().join('\0') !== keys.sort().join('\0') || profile.algorithm_version !== PROFILE_VERSION || profile.perspective !== perspective || profile.source_truncated !== sourceTruncated) fail('PERSONA_PROFILE_RESULT_INVALID');
  return profile;
}

async function runDataAnalysis({ messages, perspective, sourceTruncated, pageLimit, messageLimit, sourceBytesRead, stateDir, timeoutMs = DEFAULT_TIMEOUT_MS, isCanceled = () => false }) {
  const binary = resolveExecutable();
  const temporary = await fsp.mkdtemp(path.join(stateDir, '.persona-profile-'));
  const inputPath = path.join(temporary, 'messages.jsonl');
  const outputPath = path.join(temporary, 'profile.json');
  try {
    // Bound the JSONL assembly before joining it.  The request allows up to
    // 100k source messages, so joining unbounded canonical lines first could
    // allocate far beyond MAX_INPUT_BYTES before the limit check runs.
    const lines = [];
    let inputBytes = 0;
    for (const message of messages) {
      const line = JSON.stringify(canonicalMessage(message));
      const lineBytes = Buffer.byteLength(line, 'utf8') + 1;
      if (inputBytes + lineBytes > MAX_INPUT_BYTES) fail('PERSONA_PROFILE_INPUT_TOO_LARGE');
      lines.push(line);
      inputBytes += lineBytes;
    }
    const input = lines.length ? `${lines.join('\n')}\n` : '';
    await fsp.writeFile(inputPath, input, { mode: 0o600, flag: 'wx' });
    if (isCanceled()) fail('PERSONA_PROFILE_CANCELED');
    const args = ['--input', inputPath, '--output', outputPath, '--format', 'persona-json', '--persona-perspective', perspective === 1 ? 'friend' : 'self', '--max-messages', String(messageLimit)];
    const env = { PATH: process.env.PATH || '/usr/bin:/bin', LC_ALL: 'C', TMPDIR: temporary };
    try {
      await execFileCancelable(binary, args, { cwd: temporary, env, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024, windowsHide: true }, isCanceled);
    } catch (failure) {
      if (isCanceled()) fail('PERSONA_PROFILE_CANCELED');
      if (failure?.killed || failure?.signal === 'SIGTERM') fail('PERSONA_ANALYSIS_TIMEOUT');
      fail('PERSONA_ANALYSIS_FAILED');
    }
    if (isCanceled()) fail('PERSONA_PROFILE_CANCELED');
    const output = await fsp.readFile(outputPath);
    if (output.length < 1 || output.length > MAX_OUTPUT_BYTES) fail('PERSONA_PROFILE_TOO_LARGE');
    let profile;
    try { profile = JSON.parse(output.toString('utf8')); } catch { fail('PERSONA_PROFILE_RESULT_INVALID'); }
    // The shipped CLI sees only the bounded input slice. The protocol's
    // source_truncated bit describes pagination outside that slice, so bind it
    // into the returned profile before hashing the exact bytes exposed to the
    // renderer.
    profile.source_truncated = sourceTruncated;
    const profileBytes = Buffer.from(`${JSON.stringify(profile, null, 2)}\n`, 'utf8');
    if (profileBytes.length > MAX_OUTPUT_BYTES) fail('PERSONA_PROFILE_TOO_LARGE');
    validateProfile(profile, perspective === 1 ? 'friend_clone' : 'self_reply', sourceTruncated);
    const digest = crypto.createHash('sha256').update(profileBytes).digest();
    return { profileJson: new Uint8Array(profileBytes), profileDigest: new Uint8Array(digest), pagesRead: pageLimit.pagesRead, sourceMessagesRead: BigInt(messages.length), sourceBytesRead: BigInt(sourceBytesRead), sourceTruncated, pageLimit: pageLimit.limit, messageLimit };
  } finally {
    await fsp.rm(temporary, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { runDataAnalysis, canonicalMessage, resolveExecutable, PROFILE_VERSION, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES };
