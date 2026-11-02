'use strict';

const { spawn } = require('node:child_process');
const path = require('node:path');

const MAX_STDOUT_BYTES = 24 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const DEFAULT_TIMEOUT_MS = 15000;
const CODE = /^[A-Z][A-Z0-9_]{1,95}$/;

function absolute(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0') || value.includes('\n') || value.includes('\r')) throw new Error(code);
  return value;
}

function boundedInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(code);
  return value;
}

function hexKey(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/iu.test(value)) throw new Error('WCDB_COMPAT_KEY_INVALID');
  return value.toLowerCase();
}

function parseReply(stdout) {
  stdout = stdout.trimEnd();
  if (!stdout || stdout.includes('\n')) throw new Error('WCDB_COMPAT_RESPONSE_INVALID');
  let value;
  try { value = JSON.parse(stdout); } catch { throw new Error('WCDB_COMPAT_RESPONSE_INVALID'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.ok !== 'boolean') throw new Error('WCDB_COMPAT_RESPONSE_INVALID');
  if (!value.ok) {
    const code = value.error?.code;
    if (typeof code !== 'string' || !CODE.test(code)) throw new Error('WCDB_COMPAT_RESPONSE_INVALID');
    const error = new Error(code); error.code = code; return { error };
  }
  if (!value.result || typeof value.result !== 'object' || Array.isArray(value.result)) throw new Error('WCDB_COMPAT_RESPONSE_INVALID');
  return value.result;
}

function runExecutable({ executablePath, args, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  absolute(executablePath, 'WCDB_COMPAT_EXECUTABLE_INVALID');
  boundedInteger(timeoutMs, 100, 120000, 'WCDB_COMPAT_TIMEOUT_INVALID');
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const stdout = []; const stderr = []; let stdoutBytes = 0; let stderrBytes = 0; let settled = false;
    const finish = (failure, result) => { if (settled) return; settled = true; clearTimeout(timer); failure ? reject(failure) : resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(Object.assign(new Error('WCDB_COMPAT_TIMEOUT'), { code: 'WCDB_COMPAT_TIMEOUT' })); }, timeoutMs);
    child.stdout.on('data', chunk => { stdoutBytes += chunk.length; if (stdoutBytes > MAX_STDOUT_BYTES) { child.kill('SIGKILL'); finish(Object.assign(new Error('WCDB_COMPAT_RESPONSE_TOO_LARGE'), { code: 'WCDB_COMPAT_RESPONSE_TOO_LARGE' })); } else stdout.push(chunk); });
    child.stderr.on('data', chunk => { if (stderrBytes < MAX_STDERR_BYTES) { const part = chunk.subarray(0, MAX_STDERR_BYTES - stderrBytes); stderr.push(part); stderrBytes += part.length; } });
    child.on('error', error => finish(Object.assign(new Error('WCDB_COMPAT_EXECUTABLE_FAILED'), { code: 'WCDB_COMPAT_EXECUTABLE_FAILED', cause: error })));
    child.on('close', status => {
      if (settled) return;
      if (status !== 0) {
        const error = Object.assign(new Error('WCDB_COMPAT_HELPER_FAILED'), { code: 'WCDB_COMPAT_HELPER_FAILED', status, stderr: Buffer.concat(stderr).toString('utf8') });
        finish(error); return;
      }
      try { finish(null, parseReply(Buffer.concat(stdout).toString('utf8'))); }
      catch (error) { finish(error); }
    });
  });
}

async function probe({ executablePath, libraryPath, timeoutMs } = {}) {
  const result = await runExecutable({ executablePath, timeoutMs, args: ['--library', absolute(libraryPath, 'WCDB_COMPAT_LIBRARY_INVALID'), '--op', 'probe'] });
  if (result.schema !== 'alpha-third-party-wcdb-probe.v1' || result.nativeSchemaSupported !== false || typeof result.libraryBasename !== 'string' || !result.symbols || typeof result.symbols !== 'object') throw new Error('WCDB_COMPAT_RESPONSE_INVALID');
  return { ...result, sourceKind: 'explicit-third-party-wcdb', complete: false, writer: false };
}

async function getSnsTimeline({ executablePath, libraryPath, accountDir, key, limit = 100, offset = 0, username = '', keyword = '', startTime = 0, endTime = 0, timeoutMs } = {}) {
  const result = await runExecutable({
    executablePath,
    timeoutMs,
    args: ['--library', absolute(libraryPath, 'WCDB_COMPAT_LIBRARY_INVALID'), '--op', 'sns-timeline', '--account-dir', absolute(accountDir, 'WCDB_COMPAT_ACCOUNT_DIR_INVALID'), '--key', hexKey(key), '--limit', String(boundedInteger(limit, 1, 10000, 'WCDB_COMPAT_LIMIT_INVALID')), '--offset', String(boundedInteger(offset, 0, 1000000000, 'WCDB_COMPAT_OFFSET_INVALID')), '--username', String(username), '--keyword', String(keyword), '--start-time', String(boundedInteger(startTime, 0, 2147483647, 'WCDB_COMPAT_START_TIME_INVALID')), '--end-time', String(boundedInteger(endTime, 0, 2147483647, 'WCDB_COMPAT_END_TIME_INVALID'))]
  });
  if (result.schema !== 'alpha-third-party-wcdb-sns.v1' || result.nativeSchemaSupported !== false || typeof result.rawJsonBase64 !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(result.rawJsonBase64) || result.rawJsonBase64.length > Math.ceil(16 * 1024 * 1024 / 3) * 4) throw new Error('WCDB_COMPAT_RESPONSE_INVALID');
  let raw;
  try { raw = JSON.parse(Buffer.from(result.rawJsonBase64, 'base64').toString('utf8')); } catch { throw new Error('WCDB_COMPAT_SNS_RESPONSE_INVALID'); }
  return { schema: result.schema, sourceKind: 'explicit-third-party-wcdb', nativeSchemaSupported: false, complete: false, writer: false, raw };
}

module.exports = { probe, getSnsTimeline };
