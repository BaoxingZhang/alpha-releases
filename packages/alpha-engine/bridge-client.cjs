'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');

class BridgeClient {
  constructor({ executable, dataDir, accountId, timeoutMs = 30000, maxLineBytes = 16 * 1024 * 1024 }) {
    if (!path.isAbsolute(executable) || !path.isAbsolute(dataDir)) throw new Error('BRIDGE_PATH_INVALID');
    this.pending = new Map(); this.sequence = 0; this.closed = false; this.buffer = Buffer.alloc(0);
    this.timeoutMs = timeoutMs; this.maxLineBytes = maxLineBytes;
    this.child = spawn(executable, ['--data-dir', dataDir, '--account-id', accountId], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.child.stdout.on('data', chunk => this.read(chunk));
    this.child.stderr.on('data', () => {}); // Do not echo database paths/content into protocol diagnostics.
    this.child.on('error', () => this.fail('BRIDGE_START_FAILED'));
    this.child.on('close', () => this.fail('BRIDGE_CLOSED'));
    this.child.stdin.on('error', () => this.fail('BRIDGE_WRITE_FAILED'));
  }
  fail(code) {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error(code)); }
    this.pending.clear(); this.buffer = Buffer.alloc(0);
    this.child.kill();
  }
  read(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let newline;
    while ((newline = this.buffer.indexOf(10)) !== -1) {
      if (newline > this.maxLineBytes) return this.fail('BRIDGE_RESPONSE_TOO_LARGE');
      const line = this.buffer.subarray(0, newline); this.buffer = this.buffer.subarray(newline + 1);
      let reply;
      try { reply = JSON.parse(line.toString('utf8')); } catch { return this.fail('BRIDGE_RESPONSE_INVALID'); }
      const request = typeof reply?.id === 'string' ? this.pending.get(reply.id) : null;
      if (!request || typeof reply.ok !== 'boolean') return this.fail('BRIDGE_RESPONSE_INVALID');
      this.pending.delete(reply.id); clearTimeout(request.timer);
      if (reply.ok && Object.hasOwn(reply, 'result')) request.resolve(reply.result);
      else if (!reply.ok && /^[A-Z][A-Z0-9_]{1,95}$/.test(reply.error?.code ?? '')) request.reject(new Error(reply.error.code));
      else { request.reject(new Error('BRIDGE_RESPONSE_INVALID')); return this.fail('BRIDGE_RESPONSE_INVALID'); }
    }
    if (this.buffer.length > this.maxLineBytes) this.fail('BRIDGE_RESPONSE_TOO_LARGE');
  }
  call(op, params = {}) {
    if (this.closed) return Promise.reject(new Error('BRIDGE_CLOSED'));
    if (this.pending.size >= 32) return Promise.reject(new Error('BRIDGE_BUSY'));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail('BRIDGE_TIMEOUT'), this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, op, params }) + '\n', error => { if (error) this.fail('BRIDGE_WRITE_FAILED'); });
    });
  }
  async close() {
    if (!this.closed) this.fail('BRIDGE_CLOSED');
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => { this.child.kill('SIGKILL'); resolve(); }, 1000);
      this.child.once('close', () => { clearTimeout(timer); resolve(); });
    });
  }
}
module.exports = { BridgeClient };
