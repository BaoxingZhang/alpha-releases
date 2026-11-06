import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createReadOnlyHttpServer } = require('../packages/alpha-engine/http-server.cjs');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function handshakeEngine() {
  let calls = 0;
  return {
    get calls() { return calls; },
    async dispatch(request) {
      calls += 1;
      if (!request.hello) throw new Error('UNEXPECTED_ENGINE_CALL');
      return EngineServerFrame.fromPartial({ requestId: request.requestId, hello: { negotiatedProtocol: { major: 1, minor: 0 }, components: [], serverNonce: new Uint8Array(0), supportedMethodIds: [] } });
    }
  };
}

test('message operation evidence diagnostics are static, artifact-bound, and read-only', async t => {
  const evidence = JSON.parse(await fs.readFile(path.join(root, 'docs/native-message-send-evidence.json'), 'utf8'));
  const artifact = await fs.readFile(path.join(root, evidence.artifact.path));
  assert.equal(crypto.createHash('sha256').update(artifact).digest('hex'), evidence.artifact.sha256);
  const token = 'e'.repeat(32);
  const engine = handshakeEngine();
  const service = createReadOnlyHttpServer({ engine, token });
  const address = await service.start();
  t.after(() => service.close());
  const base = `http://${address.host}:${address.port}`;
  const headers = { Authorization: `Bearer ${token}` };

  const response = await fetch(`${base}/api/v1/independent/messages/operation-evidence`, { headers });
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.scope, 'alpha-independent-message-operation-evidence');
  assert.equal(value.artifact_path, evidence.artifact.path);
  assert.equal(value.artifact_sha256, evidence.artifact.sha256);
  assert.deepEqual(value.observed_protocol_types, evidence.observedProtocolTypes);
  assert.deepEqual(value.observed_error_strings, evidence.observedErrorStrings);
  assert.equal(value.static_only, true);
  assert.equal(value.executed, false);
  assert.equal(value.real_data_validated, false);
  assert.equal(value.complete, false);
  assert.equal(value.native_schema_supported, false);
  assert.equal(value.writer, false);
  assert.equal(value.read_only, true);
  assert.equal(engine.calls, 1);

  const mcp = await service.mcpCall({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'alpha-independent.messages.get_operation_evidence', arguments: {} } });
  assert.equal(mcp.result.isError, undefined);
  assert.deepEqual(mcp.result.structuredContent, value);
  assert.equal(engine.calls, 1);
  const post = await fetch(`${base}/api/v1/independent/messages/operation-evidence`, { method: 'POST', headers });
  assert.equal(post.status, 405);
});
