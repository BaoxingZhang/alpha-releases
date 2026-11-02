import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createReadOnlyHttpServer } = require('../packages/alpha-engine/http-server.cjs');

function probeEngine() {
  const probe = {
    status: 'ready',
    sourceKind: 'explicit-v4-media-database-probe',
    nativeSchemaSupported: false,
    metadataOnly: true,
    mediaReady: false,
    files: [{ path: 'hardlink.db', bytes: 123, sha256: 'a'.repeat(64) }],
    items: [{ kind: 'voice', key: 'voice-1', dataBytes: 42, sourceDatabase: 'media_0.db', sourceTable: 'VoiceInfo', metadataOnly: true, nativeSchemaSupported: false }],
    itemCount: 1,
    ambiguousItems: 0
  };
  return {
    async dispatch(request) {
      if (request.hello) return EngineServerFrame.fromPartial({ requestId: request.requestId, hello: { negotiatedProtocol: { major: 1, minor: 0 }, components: [], serverNonce: new Uint8Array(0), supportedMethodIds: [] } });
      if (request.listAccounts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listAccounts: { accounts: [{ id: 'acct-probe', accountId: 'acct-probe', displayName: 'Probe', capabilities: ['media.probe'], ready: true, verified: true }], selectedAccountId: 'acct-probe' } });
      throw new Error('unexpected dispatch');
    },
    async probeMedia(accountId) {
      assert.equal(accountId, 'acct-probe');
      return probe;
    }
  };
}

async function request(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  return { response, body: await response.json() };
}

test('HTTP and MCP adapters expose metadata-only v4 media probe', async t => {
  const token = 'p'.repeat(32);
  const service = createReadOnlyHttpServer({ engine: probeEngine(), token });
  const address = await service.start();
  const base = `http://${address.host}:${address.port}`;
  t.after(() => service.close());
  const headers = { Authorization: `Bearer ${token}` };

  let result = await request(base, '/api/v1/independent/media/probe?account_id=acct-probe', { headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, 'ready');
  assert.equal(result.body.scope, 'explicit-v4-media-database-probe');
  assert.equal(result.body.metadata_only, true);
  assert.equal(result.body.native_schema_supported, false);
  assert.equal(result.body.media_ready, false);
  assert.equal(result.body.items[0].data_bytes, 42);

  result = await request(base, '/api/v1/independent/media/probe?account_id=acct-probe', { method: 'POST', headers });
  assert.equal(result.response.status, 405);
  assert.equal(result.body.error.code, 'HTTP_API_METHOD_INVALID');

  const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'alpha-independent.media.probe', arguments: { account_id: 'acct-probe' } } }) });
  const mcpBody = await mcp.json();
  assert.equal(mcp.status, 200);
  assert.equal(mcpBody.result.structuredContent.scope, 'explicit-v4-media-database-probe');
  assert.equal(mcpBody.result.structuredContent.metadata_only, true);
  assert.equal(mcpBody.result.structuredContent.native_schema_supported, false);
  assert.equal(mcpBody.result.structuredContent.media_ready, false);
});
