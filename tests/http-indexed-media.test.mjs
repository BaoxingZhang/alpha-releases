import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createReadOnlyHttpServer } = require('../packages/alpha-engine/http-server.cjs');

function indexedEngine() {
  const accountId = 'acct-indexed';
  const conversationId = 'wxid-peer';
  const messageId = 'msg-indexed';
  const mediaId = 'image-id';
  const bytes = Buffer.from('indexed-media-bytes\n', 'utf8');
  const sha256 = 'a'.repeat(64);
  const calls = [];
  return {
    calls,
    async dispatch(request) {
      if (request.hello) return EngineServerFrame.fromPartial({ requestId: request.requestId, hello: { negotiatedProtocol: { major: 1, minor: 0 }, components: [], serverNonce: new Uint8Array(0), supportedMethodIds: [] } });
      if (request.listAccounts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listAccounts: { accounts: [{ id: accountId, accountId, displayName: 'Indexed', ready: true, verified: true }], selectedAccountId: accountId } });
      throw new Error('unexpected dispatch');
    },
    async readIndexedMedia(request) {
      calls.push(request);
      if (request.accountId !== accountId || request.conversationId !== conversationId || request.messageId !== messageId || request.mediaId !== mediaId || request.sha256 !== sha256 || request.kind !== 'image' || request.rendition !== 'source') throw new Error('INDEXED_MEDIA_NOT_FOUND');
      return { entry: { kind: 'image', id: mediaId, rendition: 'source', relativePath: 'media/image.bin', sha256, sizeBytes: bytes.length, mimeType: 'image/png', accountId, conversationId, messageId }, bytes };
    }
  };
}

async function request(base, pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, options);
  const body = response.headers.get('content-type')?.startsWith('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { response, body };
}

test('HTTP indexed media route returns only explicitly bound SHA-256 bytes', async t => {
  const token = 'i'.repeat(32);
  const engine = indexedEngine();
  const service = createReadOnlyHttpServer({ engine, token });
  const address = await service.start();
  const base = `http://${address.host}:${address.port}`;
  t.after(() => service.close());
  const headers = { Authorization: `Bearer ${token}` };
  const sha256 = 'a'.repeat(64);
  const result = await request(base, `/api/v1/independent/media/indexed/${sha256}?account_id=acct-indexed&conversation_id=wxid-peer&message_id=msg-indexed&media_id=image-id&kind=image`, { headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get('content-type'), 'image/png');
  assert.equal(result.response.headers.get('x-alpha-media-scope'), 'independent-indexed-media');
  assert.equal(result.response.headers.get('x-alpha-media-sha256'), sha256);
  assert.deepEqual(result.body, Buffer.from('indexed-media-bytes\n', 'utf8'));
  assert.equal(engine.calls.length, 1);

  const native = await request(base, `/api/v1/independent/media/indexed/media1_fake?account_id=acct-indexed&conversation_id=wxid-peer&message_id=msg-indexed&media_id=image-id&kind=image`, { headers });
  assert.equal(native.response.status, 404);
  const missingAccount = await request(base, `/api/v1/independent/media/indexed/${sha256}?conversation_id=wxid-peer&message_id=msg-indexed&media_id=image-id&kind=image`, { headers });
  assert.equal(missingAccount.response.status, 400);
  assert.equal(missingAccount.body.error.code, 'HTTP_API_INDEXED_MEDIA_ACCOUNT_REQUIRED');
});

test('MCP indexed media tool returns bounded base64 and preserves independent boundary', async t => {
  const token = 'j'.repeat(32);
  const engine = indexedEngine();
  const service = createReadOnlyHttpServer({ engine, token });
  const address = await service.start();
  const base = `http://${address.host}:${address.port}`;
  t.after(() => service.close());
  const response = await fetch(`${base}/mcp`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'alpha-independent.media.read_indexed', arguments: { account_id: 'acct-indexed', conversation_id: 'wxid-peer', message_id: 'msg-indexed', media_id: 'image-id', sha256: 'a'.repeat(64), kind: 'image' } } }) });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.result.structuredContent.scope, 'alpha-independent-indexed-media');
  assert.equal(body.result.structuredContent.native_schema_supported, false);
  assert.equal(Buffer.from(body.result.structuredContent.bytes_base64, 'base64').toString('utf8'), 'indexed-media-bytes\n');
});
