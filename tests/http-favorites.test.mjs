import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createReadOnlyHttpServer } = require('../packages/alpha-engine/http-server.cjs');

function favoritesEngine() {
  const calls = [];
  return {
    calls,
    async dispatch(request) {
      if (request.hello) return EngineServerFrame.fromPartial({ requestId: request.requestId, hello: { negotiatedProtocol: { major: 1, minor: 0 }, components: [], serverNonce: new Uint8Array(0), supportedMethodIds: [] } });
      if (request.listAccounts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listAccounts: { accounts: [{ id: 'acct-favorites', accountId: 'acct-favorites', displayName: '合成收藏账号', capabilities: ['favorites'], ready: true, verified: true }], selectedAccountId: 'acct-favorites' } });
      if (request.listFavorites) {
        calls.push(request.listFavorites);
        return EngineServerFrame.fromPartial({ requestId: request.requestId, listFavorites: { response: {
          items: [{ id: 'favorite-1', type: 1, updatedAtUnixMs: 1700000000000n, title: '合成收藏', description: '仅用于独立 fixture', sourceId: 'source-1', fromUsername: 'wxid_peer', contentXml: '<msg/>', sourceTable: '__alpha_favorites_v1', fields: [], mediaObjects: [], detailsTruncated: false }],
          sourceDatabase: 'favorite.db', sourceTable: '__alpha_favorites_v1', typeCounts: [{ type: 1, count: 1 }], total: 1, hasMore: false, tags: [{ id: 7n, name: '工作', count: 1 }]
        } } });
      }
      if (request.listFavoriteMediaSlots) {
        calls.push(request.listFavoriteMediaSlots);
        return EngineServerFrame.fromPartial({ requestId: request.requestId, listFavoriteMediaSlots: { status: 'ready', media: { slots: [{ itemIndex: 0, role: 'source', token: 'fav1_0123456789abcdef0123456789abcdef' }], truncated: false } } });
      }
      if (request.resolveFavoriteMedia) {
        return EngineServerFrame.fromPartial({ requestId: request.requestId, resolveFavoriteMedia: { status: 'ready', opaqueId: 'a'.repeat(64), mimeType: 'image/png' } });
      }
      throw new Error('unexpected method');
    }
  };
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = await response.json();
  return { response, body };
}

test('HTTP adapter exposes synthetic favorites as a bounded read-only route', async t => {
  const token = 'f'.repeat(32);
  const engine = favoritesEngine();
  const service = createReadOnlyHttpServer({ engine, token });
  const address = await service.start();
  const base = `http://${address.host}:${address.port}`;
  t.after(() => service.close());
  const headers = { Authorization: `Bearer ${token}` };

  let result = await request(base, '/api/v1/favorites?account_id=acct-favorites&query=%E5%90%88%E6%88%90%E6%94%B6%E8%97%8F&tag_id=7&include_type_counts=true', { headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.synthetic_only, true);
  assert.equal(result.body.native_schema_supported, false);
  assert.equal(result.body.media_supported, false);
  assert.equal(result.body.schema, '__alpha_favorites_v1');
  assert.equal(result.body.source_database, 'favorite.db');
  assert.equal(result.body.items[0].id, 'favorite-1');
  assert.equal(result.body.tags[0].id, '7');
  assert.equal(engine.calls[0].tagId, 7n);
  assert.equal(engine.calls[0].includeTypeCounts, true);

  result = await request(base, '/api/v1/favorites?account_id=acct-favorites&include_media=true', { headers });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'HTTP_API_FAVORITES_MEDIA_UNAVAILABLE');

  result = await request(base, '/api/v1/favorites?account_id=acct-favorites&tag_id=01', { headers });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'HTTP_API_FAVORITES_TAG_INVALID');
});

test('HTTP and MCP adapters expose synthetic favorite media slots and resolution', async t => {
  const token = 'm'.repeat(32);
  const service = createReadOnlyHttpServer({ engine: favoritesEngine(), token });
  const address = await service.start();
  const base = `http://${address.host}:${address.port}`;
  t.after(() => service.close());
  const headers = { Authorization: `Bearer ${token}` };
  let result = await request(base, '/api/v1/favorites/favorite-1/media?account_id=acct-favorites', { headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.synthetic_only, true);
  assert.equal(result.body.schema, '__alpha_favorite_media_v1');
  assert.equal(result.body.slots[0].token, 'fav1_0123456789abcdef0123456789abcdef');
  result = await request(base, '/api/v1/favorites/media/fav1_0123456789abcdef0123456789abcdef?account_id=acct-favorites', { headers });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.status, 'ready');
  assert.equal(result.body.opaque_id, 'a'.repeat(64));
  const mcp = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'alpha-independent.favorites.list_media_slots', arguments: { account_id: 'acct-favorites', favorite_id: 'favorite-1' } } }) });
  const mcpBody = await mcp.json();
  assert.equal(mcp.status, 200);
  assert.equal(mcpBody.result.structuredContent.synthetic_only, true);
  assert.equal(mcpBody.result.structuredContent.media.slots[0].token, 'fav1_0123456789abcdef0123456789abcdef');
});
