import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createReadOnlyHttpServer } = require('../packages/alpha-engine/http-server.cjs');
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
import { createSearchFixture } from './search-fixture.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

function fakeEngine() {
  let calls = 0;
  const analysisId = '00000000-0000-4000-8000-000000000001';
  return {
    get calls() { return calls; },
    async dispatch(request) {
      calls += 1;
      if (request.hello) return EngineServerFrame.fromPartial({ requestId: request.requestId, hello: { negotiatedProtocol: { major: 1, minor: 0 }, components: [], serverNonce: new Uint8Array(0), supportedMethodIds: [] } });
      if (request.listAccounts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listAccounts: { accounts: [{ id: 'acct-1', accountId: 'acct-1', subjectId: 'wxid_self', displayName: '测试账号', capabilities: ['messages', 'contacts', 'groups.members'], ready: true, verified: true }], selectedAccountId: 'acct-1' } });
      if (request.listConversations) return EngineServerFrame.fromPartial({ requestId: request.requestId, listConversations: { items: [{ id: 'wxid_peer', accountId: 'acct-1', kind: 1, displayName: '联系人', lastActivityUnixMs: 1700000000000n, preview: '你好' }], nextCursor: new Uint8Array([1, 2]), totalCount: 1 } });
      if (request.listMessages) return EngineServerFrame.fromPartial({ requestId: request.requestId, listMessages: { items: [{ id: 'msg-1', conversationId: 'wxid_peer', sentAtUnixMs: 1700000000000n, senderId: 'wxid_self', text: '你好', localId: 1, serverId: 2n }], nextCursor: new Uint8Array(0), appliedAfterUnixMs: 0n } });
      if (request.searchMessages) return EngineServerFrame.fromPartial({ requestId: request.requestId, searchMessages: { items: [{ id: 'msg-1', conversationId: 'wxid_peer', sentAtUnixMs: 1700000000000n, senderId: 'wxid_self', text: '你好', sourceType: 1n }], nextCursor: new Uint8Array(0) } });
      if (request.listContacts?.directory) return EngineServerFrame.fromPartial({ requestId: request.requestId, listContacts: { response: { directory: { items: [{ contact: { username: 'wxid_peer', alias: 'peer', remark: '联系人', nickname: '联系人', localType: 1 }, category: 'friend', officialAccountKind: '' }], counts: [{ category: 'friend', count: 1 }, { category: 'group', count: 0 }], total: 1, hasMore: false } } } });
      if (request.listContacts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listContacts: { response: { items: [{ username: 'wxid_peer', alias: 'peer', remark: '联系人', nickname: '联系人', localType: 1 }], nextCursor: '', totalCount: 1 } } });
      if (request.listGeneral) return EngineServerFrame.fromPartial({ requestId: request.requestId, listGeneral: { response: { items: [{ actor: 'wxid_peer', fields: [{ name: 'groupNickname', value: '群昵称' }, { name: 'isOwner', value: 'true' }] }], sourceDatabase: 'contact/contact.db', sourceTable: 'chat_room' } } });
      if (request.startAggregateAnalysis) return EngineServerFrame.fromPartial({ requestId: request.requestId, startAggregateAnalysis: { analysisId, conversationsTotal: 1, expiresAtUnixMs: BigInt(Date.now() + 600000) } });
      if (request.watchAggregateAnalysis) return EngineServerFrame.fromPartial({ requestId: request.requestId, watchAggregateAnalysis: { analysisId, state: 2, conversationsDone: 1, conversationsTotal: 1, conversationsFailed: 0, reportJson: new Uint8Array(Buffer.from(JSON.stringify({ algorithm_version: 'alpha-aggregate-v1', scope: 'group_chat', total_messages: 1 }), 'utf8')) } });
      if (request.cancelAggregateAnalysis) return EngineServerFrame.fromPartial({ requestId: request.requestId, cancelAggregateAnalysis: { canceled: false } });
      if (request.exportConversation) return EngineServerFrame.fromPartial({ requestId: request.requestId, exportConversation: { destinationPath: request.exportConversation.destinationPath, format: request.exportConversation.format, itemCount: 1, mediaManifestPath: '', mediaIncluded: 0, mediaFailed: 0 } });
      throw new Error('unexpected method');
    }
  };
}

function richMcpEngine() {
  return {
    async dispatch(request) {
      if (request.hello) return EngineServerFrame.fromPartial({ requestId: request.requestId, hello: { negotiatedProtocol: { major: 1, minor: 0 }, components: [], serverNonce: new Uint8Array(0), supportedMethodIds: [] } });
      if (request.listAccounts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listAccounts: { accounts: [{ id: 'acct-1', accountId: 'acct-1', displayName: '测试账号', ready: true, verified: true }], selectedAccountId: 'acct-1' } });
      if (request.listContacts?.directory) return EngineServerFrame.fromPartial({ requestId: request.requestId, listContacts: { response: { directory: { items: [{ contact: { username: 'wxid_peer', alias: 'peer', remark: '张三', nickname: '张三', localType: 1 }, category: 'friend', officialAccountKind: '' }], counts: [{ category: 'friend', count: 1 }, { category: 'group', count: 0 }], total: 1, hasMore: false } } } });
      if (request.listContacts) return EngineServerFrame.fromPartial({ requestId: request.requestId, listContacts: { response: { items: [{ username: 'wxid_peer', alias: 'peer', remark: '张三', nickname: '张三', localType: 1 }], nextCursor: '', totalCount: 1 } } });
      if (request.getContactProfile) return EngineServerFrame.fromPartial({ requestId: request.requestId, getContactProfile: { response: { found: true, profile: { username: 'wxid_peer', gender: 0, commonGroups: [{ username: 'room@chatroom', displayName: '群聊' }], commonGroupCount: 1, commonGroupsTruncated: false } } } });
      if (request.listConversations) return EngineServerFrame.fromPartial({ requestId: request.requestId, listConversations: { items: [{ id: 'wxid_peer', accountId: 'acct-1', kind: 1, displayName: '张三', lastActivityUnixMs: 1700000002000n, preview: '第二条' }], nextCursor: new Uint8Array(0), totalCount: 1 } });
      if (request.listMessages) return EngineServerFrame.fromPartial({ requestId: request.requestId, listMessages: { items: [
        { id: 'msg-1', conversationId: 'wxid_peer', sentAtUnixMs: 1700000000000n, senderId: 'wxid_peer', direction: 1, kind: 'text', text: '第一条', localId: 1, serverId: 1n },
        { id: 'msg-2', conversationId: 'wxid_peer', sentAtUnixMs: 1700000001000n, senderId: 'wxid_self', direction: 2, kind: 'text', text: '第二条', localId: 2, serverId: 2n },
        { id: 'msg-3', conversationId: 'wxid_peer', sentAtUnixMs: 1700000002000n, senderId: 'wxid_peer', direction: 1, kind: 'text', text: '第三条', localId: 3, serverId: 3n }
      ], nextCursor: new Uint8Array(0) } });
      if (request.searchMessages) return EngineServerFrame.fromPartial({ requestId: request.requestId, searchMessages: { items: [
        { id: 'msg-1', conversationId: 'wxid_peer', sentAtUnixMs: 1700000000000n, senderId: 'wxid_peer', direction: 1, kind: 'text', text: '第一条', sourceType: 1n },
        { id: 'msg-2', conversationId: 'wxid_peer', sentAtUnixMs: 1700000001000n, senderId: 'wxid_self', direction: 2, kind: 'text', text: '第二条', sourceType: 1n }
      ], nextCursor: new Uint8Array(0) } });
      if (request.getConversationDayCounts) return EngineServerFrame.fromPartial({ requestId: request.requestId, getConversationDayCounts: { days: [{ localDay: 19675n, count: 2n }] } });
      throw new Error('unexpected method');
    }
  };
}

async function request(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const body = response.status === 202 ? null : await response.json();
  return { response, body };
}

test('independent HTTP adapter exposes verified DTO and export routes with token and host gates', async t => {
  const token = 'x'.repeat(32);
  const engine = fakeEngine();
  const service = createReadOnlyHttpServer({ engine, token });
  const address = await service.start();
  const base = `http://${address.host}:${address.port}`;
  t.after(() => service.close());

  let result = await request(base, '/health');
  assert.equal(result.response.status, 200);
  assert.equal(result.body.service, 'alpha-independent-readonly');
  result = await request(base, '/api/v1/accounts');
  assert.equal(result.response.status, 401);
  result = await request(base, '/api/v1/accounts', { headers: { Authorization: `Bearer ${'z'.repeat(32)}` } });
  assert.equal(result.response.status, 401);
  result = await request(base, '/api/v1/accounts', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.accounts[0].id, 'acct-1');
  result = await request(base, '/api/v1/sessions?limit=20', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items[0].id, 'wxid_peer');
  assert.equal(result.body.next_cursor, 'AQI=');
  // The response uses standard Base64 padding.  The next request must accept
  // that cursor as well as the API's unpadded base64url representation.
  result = await request(base, '/api/v1/sessions?cursor=AQI%3D&limit=20', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  result = await request(base, '/api/v1/sessions?cursor=AQI&limit=20', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  result = await request(base, '/api/v1/sessions?cursor=A%3D%3D%3D&limit=20', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 400);
  result = await request(base, '/api/v1/messages?username=wxid_peer&limit=20', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items[0].server_id, '2');
  result = await request(base, '/api/v1/search?query=%E4%BD%A0%E5%A5%BD', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items[0].conversation_id, 'wxid_peer');
  result = await request(base, '/api/v1/contacts?keyword=%E8%81%94%E7%B3%BB%E4%BA%BA', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items[0].username, 'wxid_peer');
  result = await request(base, '/api/v1/group-members?chatroom_id=room%40chatroom', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.items[0].is_owner, true);
  result = await request(base, '/api/v1/records?category=friend_requests', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.category, 'friend_requests');
  assert.equal(result.body.table_name, '__alpha_general_friend_requests');
  assert.equal(result.body.partial, true);
  assert.equal(result.body.candidate, true);
  result = await request(base, '/api/v1/analysis', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: 'acct-1', scope: 2, conversation_id: 'wxid_peer' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.conversations_total, 1);
  result = await request(base, '/api/v1/analysis/00000000-0000-4000-8000-000000000001', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.state, 'AGGREGATE_ANALYSIS_STATE_COMPLETED');
  assert.equal(result.body.report.algorithm_version, 'alpha-aggregate-v1');
  result = await request(base, '/api/v1/analysis/00000000-0000-4000-8000-000000000001/cancel', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.canceled, false);
  result = await request(base, '/api/v1/analysis', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: 'acct-1', scope: 5 }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'HTTP_API_ANALYSIS_SCOPE_INVALID');
  result = await request(base, '/api/v1/records?category=moments', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'HTTP_API_RECORD_CATEGORY_INVALID');
  result = await request(base, '/api/v1/exports', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: 'acct-1', conversation_id: 'wxid_peer', format: 'json', destination_path: '/tmp/alpha-http-export.json', include_media: false, start_time_unix_ms: '1700000000000' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.destination_path, '/tmp/alpha-http-export.json');
  assert.equal(result.body.item_count, 1);
  result = await request(base, '/api/v1/exports', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 405);
  result = await request(base, '/api/v1/exports', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: 'acct-1', conversation_id: 'wxid_peer', format: 'xlsx', destination_path: '/tmp/alpha-http-export.xlsx' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.format, 'xlsx');
  result = await request(base, '/api/v1/exports', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: 'acct-1', conversation_id: 'wxid_peer', format: 'sql', destination_path: '/tmp/alpha-http-export.sql' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.format, 'sql');
  result = await request(base, '/api/v1/media-metadata', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: 'acct-1', format: 'media-json', destination_path: '/tmp/alpha-http-media.json' }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.destination_path, '/tmp/alpha-http-media.json');
  result = await request(base, '/api/v1/media-metadata', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ account_id: 'acct-1', format: 'json', destination_path: '/tmp/alpha-http-media.json' }) });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, 'HTTP_API_FORMAT_UNSUPPORTED');
  result = await request(base, '/api/v1/messages?username=wxid_peer', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } });
  assert.equal(result.response.status, 403);
  assert.ok(engine.calls >= 7);
});

test('MCP adapter lists and calls only the explicit read-only tools', async t => {
  const token = 'y'.repeat(32);
  const service = createReadOnlyHttpServer({ engine: fakeEngine(), token });
  const address = await service.start();
  t.after(() => service.close());
  const base = `http://${address.host}:${address.port}`;
  const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  let result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.tools.length, 24);
  assert.ok(result.body.result.tools.some(tool => tool.name === 'wechat.chat.get_messages'));
  assert.ok(result.body.result.tools.some(tool => tool.name === 'alpha.analysis.start'));
  const recordsTool = result.body.result.tools.find(tool => tool.name === 'wechat.forensics.list_records');
  assert.deepEqual(recordsTool.inputSchema.properties.category.enum, ['payments', 'friend_requests', 'revokes', 'calls']);
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'wechat.core.list_accounts', arguments: {} } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.accounts[0].id, 'acct-1');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'wechat.chat.send_text', arguments: {} } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.isError, true);
  assert.equal(result.body.result.structuredContent.code, 'MCP_TOOL_NOT_FOUND');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'wechat.core.get_status', arguments: { unexpected: true } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.isError, true);
  assert.equal(result.body.result.structuredContent.code, 'MCP_ARGUMENTS_INVALID');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'wechat.contacts.list_directory', arguments: { categories: ['friend'] } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.directory.items[0].category, 'friend');
  result = await request(base, '/api/v1/contact-directory?categories=friend', { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.directory.items[0].category, 'friend');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'wechat.chat.export_conversation', arguments: { username: 'wxid_peer', format: 'json', destination_path: '/tmp/alpha-mcp-export.json', include_media: false } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.destination_path, '/tmp/alpha-mcp-export.json');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 61, method: 'tools/call', params: { name: 'wechat.chat.export_media_metadata', arguments: { format: 'media-csv', destination_path: '/tmp/alpha-mcp-media.csv' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.destination_path, '/tmp/alpha-mcp-media.csv');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'wechat.chat.get_message_raw', arguments: { username: 'wxid_peer', message_id: 'msg-1' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.raw.id, 'msg-1');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'wechat.chat.get_message_raw', arguments: { username: 'wxid_peer' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.isError, true);
  assert.equal(result.body.result.structuredContent.code, 'MCP_MESSAGE_IDENTIFIER_REQUIRED');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'wechat.forensics.list_records', arguments: { category: 'payments' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.category, 'payments');
  assert.equal(result.body.result.structuredContent.partial, true);
  assert.equal(Object.hasOwn(result.body.result.structuredContent, 'total_count'), false);
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 91, method: 'tools/call', params: { name: 'wechat.forensics.list_records', arguments: { category: 'friend_requests' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.category, 'friend_requests');
  assert.equal(result.body.result.structuredContent.table_name, '__alpha_general_friend_requests');
  assert.equal(result.body.result.structuredContent.partial, true);
  assert.equal(result.body.result.structuredContent.candidate, true);
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 92, method: 'tools/call', params: { name: 'alpha.analysis.start', arguments: { scope: 2, conversation_id: 'wxid_peer' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.conversations_total, 1);
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 93, method: 'tools/call', params: { name: 'alpha.analysis.watch', arguments: { analysis_id: '00000000-0000-4000-8000-000000000001' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.state, 'AGGREGATE_ANALYSIS_STATE_COMPLETED');
  assert.equal(result.body.result.structuredContent.report.algorithm_version, 'alpha-aggregate-v1');
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 94, method: 'tools/call', params: { name: 'alpha.analysis.cancel', arguments: { analysis_id: '00000000-0000-4000-8000-000000000001' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.structuredContent.canceled, false);
  result = await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'wechat.forensics.list_records', arguments: { category: 'payments', query: 'needle' } } }) });
  assert.equal(result.response.status, 200);
  assert.equal(result.body.result.isError, true);
  assert.equal(result.body.result.structuredContent.code, 'MCP_ARGUMENTS_INVALID');
});

test('MCP adapter exposes bounded resolver, context, anchor and day-count helpers', async t => {
  const token = 'z'.repeat(32);
  const service = createReadOnlyHttpServer({ engine: richMcpEngine(), token });
  const address = await service.start();
  t.after(() => service.close());
  const base = `http://${address.host}:${address.port}`;
  const headers = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const invoke = async (id, name, args) => (await request(base, '/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } }) })).body.result;
  let result = await invoke(1, 'wechat.core.get_status', {});
  assert.equal(result.structuredContent.status, 'ready');
  result = await invoke(2, 'wechat.contacts.resolve_contact', { query: '张三' });
  assert.equal(result.structuredContent.items[0].username, 'wxid_peer');
  result = await invoke(3, 'wechat.contacts.get_contact_profile', { username: 'wxid_peer', common_group_limit: 1 });
  assert.equal(result.structuredContent.found, true);
  assert.equal(result.structuredContent.profile.common_groups[0].username, 'room@chatroom');
  result = await invoke(4, 'wechat.chat.resolve_session', { query: '张三' });
  assert.equal(result.structuredContent.items[0].id, 'wxid_peer');
  result = await invoke(5, 'wechat.chat.list_search_senders', { query: '条' });
  assert.deepEqual(result.structuredContent.senders, [{ sender_id: 'wxid_peer', count: 1 }, { sender_id: 'wxid_self', count: 1 }]);
  result = await invoke(6, 'wechat.chat.get_message_around', { username: 'wxid_peer', anchor_id: 'msg-2', before: 1, after: 1 });
  assert.equal(result.structuredContent.before[0].id, 'msg-1');
  assert.equal(result.structuredContent.anchor.from_me, true);
  assert.equal(result.structuredContent.after[0].id, 'msg-3');
  result = await invoke(7, 'wechat.chat.get_message_anchor', { username: 'wxid_peer', kind: 'first' });
  assert.equal(result.structuredContent.message.id, 'msg-1');
  result = await invoke(8, 'wechat.chat.get_message_anchor', { username: 'wxid_peer', kind: 'day', date: '2023-11-14' });
  assert.equal(result.structuredContent.message.id, 'msg-1');
  result = await invoke(9, 'wechat.chat.get_daily_message_counts', { username: 'wxid_peer', month: '2023-11', utc_offset_minutes: 0 });
  assert.equal(result.structuredContent.days[0].count, '2');
});

test('HTTP conversation export reaches the real independent engine and publishes a file', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/http-export-'));
  const fixture = await createSearchFixture({ directory: path.join(directory, 'data') });
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  const service = createReadOnlyHttpServer({ engine, token: 'r'.repeat(32) });
  const address = await service.start();
  t.after(async () => {
    await service.close();
    await engine.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  const destinationPath = path.join(directory, 'exports', 'conversation.json');
  const response = await request(`http://${address.host}:${address.port}`, '/api/v1/exports', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'r'.repeat(32)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: fixture.accountId, conversation_id: fixture.conversationId, format: 'json', destination_path: destinationPath })
  });
  assert.equal(response.response.status, 200);
  assert.equal(response.body.destination_path, destinationPath);
  assert.equal(response.body.item_count, 6);
  const document = JSON.parse(await fs.readFile(destinationPath, 'utf8'));
  assert.equal(document.itemCount, 6);
  assert.equal(document.messages[1].localId, '9007199254740993');
  const mcpDestination = path.join(directory, 'exports', 'conversation-mcp.json');
  const mcpResponse = await request(`http://${address.host}:${address.port}`, '/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'r'.repeat(32)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'wechat.chat.export_conversation', arguments: { account_id: fixture.accountId, username: fixture.conversationId, format: 'json', destination_path: mcpDestination } } })
  });
  assert.equal(mcpResponse.response.status, 200);
  assert.equal(mcpResponse.body.result.structuredContent.item_count, 6);
  assert.equal(JSON.parse(await fs.readFile(mcpDestination, 'utf8')).itemCount, 6);
  const rawResponse = await request(`http://${address.host}:${address.port}`, '/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'r'.repeat(32)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'wechat.chat.get_message_raw', arguments: { account_id: fixture.accountId, username: fixture.conversationId, server_id: fixture.uniqueServerId } } })
  });
  assert.equal(rawResponse.response.status, 200);
  assert.equal(rawResponse.body.result.structuredContent.raw.server_id, fixture.uniqueServerId);
  assert.equal(rawResponse.body.result.structuredContent.raw.source_token.startsWith('independent1_'), true);
  const analysisStart = await request(`http://${address.host}:${address.port}`, '/api/v1/analysis', {
    method: 'POST',
    headers: { Authorization: `Bearer ${'r'.repeat(32)}`, 'content-type': 'application/json' },
    body: JSON.stringify({ account_id: fixture.accountId, scope: 2, conversation_id: fixture.conversationId })
  });
  assert.equal(analysisStart.response.status, 200);
  assert.equal(analysisStart.body.conversations_total, 1);
  let analysisWatch;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    analysisWatch = await request(`http://${address.host}:${address.port}`, `/api/v1/analysis/${analysisStart.body.analysis_id}`, { headers: { Authorization: `Bearer ${'r'.repeat(32)}` } });
    assert.equal(analysisWatch.response.status, 200);
    if (analysisWatch.body.state !== 'AGGREGATE_ANALYSIS_STATE_RUNNING') break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(analysisWatch.body.state, 'AGGREGATE_ANALYSIS_STATE_COMPLETED');
  assert.equal(analysisWatch.body.report.algorithm_version, 'alpha-aggregate-v1');
});
