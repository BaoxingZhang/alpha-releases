'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const MAX_STDOUT_BYTES = 128 * 1024;
const MAX_STDERR_BYTES = 32 * 1024;
const KEY_PATTERN = /Data Key:\s*\[\s*([0-9a-fA-F]{64})\s*\]/i;

function failure(code) {
  return new Error(code);
}

function validateExecutable(executable) {
  if (typeof executable !== 'string' || !path.isAbsolute(executable)) throw failure('KEY_HELPER_PATH_INVALID');
  let stat;
  try { stat = fs.lstatSync(executable); } catch { throw failure('KEY_HELPER_PATH_INVALID'); }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111) === 0) throw failure('KEY_HELPER_PATH_INVALID');
  return executable;
}

function normalizeMode(mode) {
  if (mode === undefined || mode === null || mode === 'auto' || mode === 1) return 'auto';
  if (mode === 'memory-scan' || mode === 2) return 'memory-scan';
  // The candidate has no runtime-capture implementation. Keep this explicit
  // instead of silently mapping a native-only mode to a different operation.
  throw failure('KEY_ACQUISITION_MODE_UNSUPPORTED');
}

function parseDataKey(output) {
  const match = KEY_PATTERN.exec(output);
  if (!match) throw failure('KEY_HELPER_KEY_NOT_FOUND');
  return Buffer.from(match[1], 'hex');
}

/**
 * Run the explicitly selected Chatlog-compatible candidate in a private,
 * disposable configuration directory. The helper's own config file can
 * contain the extracted key, so it must never receive the application's
 * stateDir or a user directory.
 */
async function runKeyHelper({ executable, processId, mode = 'auto', timeoutMs = 180000, signal, onProgress }) {
  validateExecutable(executable);
  if (!Number.isSafeInteger(processId) || processId < 1 || processId > 0xffffffff) throw failure('DATABASE_KEY_ACQUISITION_REQUEST_INVALID');
  normalizeMode(mode);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) throw failure('KEY_ACQUISITION_TIMEOUT_INVALID');
  if (signal?.aborted) throw failure(signal.reason?.message === 'KEY_ACQUISITION_TIMEOUT' ? 'KEY_ACQUISITION_TIMEOUT' : 'KEY_ACQUISITION_CANCELED');

  const configDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'alpha-key-helper-'));
  let child;
  let timer;
  let killTimer;
  let reason = '';
  let stdoutBytes = 0;
  let stderrBytes = 0;
  const stdout = [];
  const stderr = [];
  const stop = code => {
    if (!reason) reason = code;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    try { child.kill('SIGTERM'); } catch {}
    killTimer ??= setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, 1000);
  };
  const onAbort = () => stop(signal?.reason?.message === 'KEY_ACQUISITION_TIMEOUT' ? 'KEY_ACQUISITION_TIMEOUT' : 'KEY_ACQUISITION_CANCELED');
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const env = { ...process.env, CHATLOG_DIR: configDir };
    // Do not let inherited Alpha state/configuration variables redirect the
    // helper to application state or expose its key through a known path.
    for (const name of Object.keys(env)) if (/^ALPHA_|^CHATLOG_DIR$/i.test(name)) delete env[name];
    env.CHATLOG_DIR = configDir;
    child = spawn(executable, ['key', '--pid', String(processId), '--force'], {
      cwd: configDir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    if (typeof onProgress === 'function') onProgress(3, 2, 'key.progress.scanning');
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) stop('KEY_HELPER_OUTPUT_TOO_LARGE');
      else stdout.push(chunk);
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_STDERR_BYTES) stop('KEY_HELPER_OUTPUT_TOO_LARGE');
      else stderr.push(chunk);
    });
    child.once('error', () => stop('KEY_HELPER_START_FAILED'));
    const finished = new Promise(resolve => child.once('close', (code, signalName) => resolve({ code, signalName })));
    timer = setTimeout(() => stop('KEY_ACQUISITION_TIMEOUT'), timeoutMs);
    const outcome = await finished;
    if (reason) throw failure(reason);
    if (outcome.code !== 0) {
      const diagnostics = Buffer.concat(stderr).toString('utf8');
      if (/wechat process not found/i.test(diagnostics)) throw failure('KEY_HELPER_PROCESS_NOT_FOUND');
      if (/sip|system integrity|operation not permitted/i.test(diagnostics)) throw failure('KEY_HELPER_PERMISSION_REQUIRED');
      throw failure('KEY_HELPER_FAILED');
    }
    const key = parseDataKey(Buffer.concat(stdout).toString('utf8'));
    return { key, provider: 'chatlog-candidate', locatorKind: 'macos-process-pid', databaseProbeSucceeded: false };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    clearTimeout(timer);
    clearTimeout(killTimer);
    for (const chunk of stdout) chunk.fill(0);
    for (const chunk of stderr) chunk.fill(0);
    // The helper may persist a key-bearing chatlog.json. Remove the entire
    // private directory before returning, including all failure paths.
    await fsp.rm(configDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { runKeyHelper, parseDataKey, validateExecutable };
