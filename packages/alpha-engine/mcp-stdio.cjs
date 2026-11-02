'use strict';

// Standalone local MCP stdio transport for Codex and other MCP clients.
// Business methods, tool definitions and independent/native boundaries all
// remain in http-server.cjs; this file only supplies newline-delimited JSON-RPC.
const fs = require('node:fs');
const path = require('node:path');
const { createSecurity } = require('../alpha-security/index.cjs');
const { createEngine } = require('./index.cjs');
const { createReadOnlyHttpServer } = require('./http-server.cjs');

const DEFAULT_TOKEN = 'alpha-independent-stdio-local-token-0000';

function writeMessage(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parseRequest(line) {
  try {
    const value = JSON.parse(line);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MCP_REQUEST_INVALID');
    return value;
  } catch {
    return null;
  }
}

async function runMcpStdio({ input = process.stdin, output = process.stdout, errorOutput = process.stderr, createAdapter } = {}) {
  const stateDir = process.env.ALPHA_INDEPENDENT_STATE_DIR;
  if (typeof stateDir !== 'string' || !path.isAbsolute(stateDir)) throw new Error('ENGINE_STATE_PATH_REQUIRED');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({
    lock,
    stateDir,
    bridgePath: process.env.ALPHA_INDEPENDENT_BRIDGE_PATH,
    importerPath: process.env.ALPHA_INDEPENDENT_IMPORTER_PATH || '',
    keyHelperPath: process.env.ALPHA_INDEPENDENT_KEY_HELPER_PATH || '',
    encryptedDir: process.env.ALPHA_INDEPENDENT_ENCRYPTED_DIR || '',
    dataDir: process.env.ALPHA_INDEPENDENT_DATA_DIR || '',
    accountId: process.env.ALPHA_INDEPENDENT_ACCOUNT_ID || '',
    selfUsername: process.env.ALPHA_INDEPENDENT_SELF_USERNAME || ''
  });
  const adapter = createAdapter
    ? createAdapter(engine)
    : createReadOnlyHttpServer({ engine, token: process.env.ALPHA_INDEPENDENT_HTTP_TOKEN || DEFAULT_TOKEN });
  if (!adapter || typeof adapter.mcpCall !== 'function') {
    await engine.close();
    throw new Error('MCP_STDIO_ADAPTER_REQUIRED');
  }

  let buffer = '';
  let queue = Promise.resolve();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await queue.catch(() => void 0);
    await adapter.close?.().catch?.(() => void 0);
    await engine.close().catch(() => void 0);
  };
  const dispatch = async line => {
    if (!line.trim()) return;
    const request = parseRequest(line);
    if (!request) {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    try {
      const reply = await adapter.mcpCall(request);
      if (reply !== null) output.write(`${JSON.stringify(reply)}\n`);
    } catch (failure) {
      errorOutput.write(`${failure?.message || 'MCP_STDIO_FAILED'}\n`);
      const id = request.id === undefined ? null : request.id;
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: failure?.message || 'MCP_STDIO_FAILED' } })}\n`);
    }
  };
  input.setEncoding?.('utf8');
  input.on('data', chunk => {
    buffer += chunk;
    for (;;) {
      const newline = buffer.indexOf('\n');
      if (newline < 0) break;
      const line = buffer.slice(0, newline).replace(/\r$/, '');
      buffer = buffer.slice(newline + 1);
      queue = queue.then(() => dispatch(line));
    }
  });
  await new Promise(resolve => input.once('end', resolve));
  if (buffer.trim()) queue = queue.then(() => dispatch(buffer));
  await close();
}

if (require.main === module) {
  runMcpStdio().catch(failure => {
    process.stderr.write(`${failure?.message || 'MCP_STDIO_FAILED'}\n`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_TOKEN, parseRequest, runMcpStdio };
