'use strict';
const { spawn } = require('node:child_process');
const fail = code => new Error(code);
// Deliberately build a mutable stdin buffer, not a key-bearing argv/env/string.
function keyPayload(key) {
  const head = Buffer.from('{"keyHex":"'), tail = Buffer.from('"}\n');
  const output = Buffer.alloc(head.length + 64 + tail.length); head.copy(output);
  const digits = Buffer.from('0123456789abcdef');
  for (let i = 0; i < 32; i++) { output[head.length + i * 2] = digits[key[i] >>> 4]; output[head.length + i * 2 + 1] = digits[key[i] & 15]; }
  tail.copy(output, head.length + 64); return output;
}
async function runImporter({ executable, sourceDir, outputDir, key, signal, timeoutMs = 115000 }) {
  if (signal.aborted) throw fail('IMPORT_CANCELED');
  const child = spawn(executable, ['--source-dir', sourceDir, '--output-dir', outputDir], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  let reason = '', outputBytes = 0, errorBytes = 0, forceTimer, payload;
  const output = [], diagnostics = [];
  const stop = code => { if (!reason) reason = code; if (child.exitCode !== null || child.signalCode !== null) return; child.kill('SIGTERM'); forceTimer ??= setTimeout(() => child.kill('SIGKILL'), 1000); };
  const aborted = () => stop(signal.reason?.message === 'IMPORT_TIMEOUT' ? 'IMPORT_TIMEOUT' : 'IMPORT_CANCELED'); signal.addEventListener('abort', aborted, { once: true });
  const timeout = setTimeout(() => stop('IMPORT_TIMEOUT'), timeoutMs);
  child.stdout.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > 2 * 1024 * 1024) stop('IMPORT_OUTPUT_TOO_LARGE'); else output.push(chunk); });
  child.stderr.on('data', chunk => { errorBytes += chunk.length; if (errorBytes > 4096) stop('IMPORT_OUTPUT_TOO_LARGE'); else diagnostics.push(chunk); });
  child.stdin.on('error', () => stop('IMPORT_WRITE_FAILED'));
  const finished = new Promise(resolve => {
    child.once('error', () => stop('IMPORT_START_FAILED'));
    child.once('close', (code, signalName) => resolve({ code, signalName }));
  });
  try {
    payload = keyPayload(key); child.stdin.end(payload, () => payload?.fill(0));
    const outcome = await finished;
    if (reason) throw fail(reason);
    if (outcome.code !== 0) throw fail((Buffer.concat(diagnostics).toString('utf8').match(/^([A-Z][A-Z0-9_]{1,95}):/m) || [])[1] || 'IMPORT_FAILED');
    try { return JSON.parse(Buffer.concat(output).toString('utf8')); } catch { throw fail('IMPORT_SUMMARY_INVALID'); }
  } finally {
    payload?.fill(0); clearTimeout(timeout); clearTimeout(forceTimer); signal.removeEventListener('abort', aborted);
    if (child.exitCode === null && child.signalCode === null) { stop('IMPORT_CANCELED'); await finished; clearTimeout(forceTimer); }
  }
}
module.exports = { runImporter };
