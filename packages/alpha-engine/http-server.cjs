'use strict';

// A small HTTP/MCP adapter for the independent engine. It keeps
// the original Alpha gateway disabled and exposes only methods whose data
// comes from the verified independent protobuf DTOs.  It is intentionally
// dependency-free so it can be embedded by the independent CLI later.
const http = require('node:http');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { EngineClientFrame, EngineServerFrame } = require('../alpha-protocol/index.cjs');

const MAX_BODY_BYTES = 1024 * 1024;
const PRINTABLE_TOKEN = /^[\x21-\x7e]{32,256}$/;
// Conversation export only writes a new file through the engine's bounded,
// non-overwriting exporter. It does not mutate the source database, but it is
// kept separate from the ordinary DTO reads so the route remains explicit.
const ALLOWED_METHODS = new Set(['listAccounts', 'listConversations', 'listMessages', 'searchMessages', 'listContacts', 'getContactProfile', 'listGeneral', 'getConversationDayCounts', 'exportConversation']);
const MCP_SCAN_MAX_PAGES = 128;
const MCP_SCAN_MAX_ITEMS = 10000;

class HttpAdapterError extends Error {
  constructor(code, status = 400, message = code) {
    super(message); this.code = code; this.status = status;
  }
}

function json(res, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-length': body.length, ...headers });
  res.end(body);
}
function empty(res, status, headers = {}) { res.writeHead(status, headers); res.end(); }
function fail(res, error) {
  const e = error instanceof HttpAdapterError ? error : new HttpAdapterError('HTTP_API_UPSTREAM_FAILED', 502);
  json(res, e.status, { error: { code: e.code, message: e.message } });
}
function parseToken(value) {
  if (typeof value !== 'string' || !PRINTABLE_TOKEN.test(value)) throw new HttpAdapterError('HTTP_API_TOKEN_INVALID', 400);
  return value;
}
// Compare credentials after reducing both values to a fixed-size digest. The
// adapter is local-only, but this avoids exposing a byte-by-byte timing oracle
// when a client can issue repeated requests against the configured token.
function tokenMatches(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string') return false;
  const left = crypto.createHash('sha256').update(provided, 'utf8').digest();
  const right = crypto.createHash('sha256').update(expected, 'utf8').digest();
  return crypto.timingSafeEqual(left, right);
}
function bearer(req, url) {
  const header = typeof req.headers.authorization === 'string' && /^Bearer ([\x21-\x7e]+)$/.exec(req.headers.authorization);
  const query = url.searchParams.get('access_token');
  if (header && query !== null) throw new HttpAdapterError('HTTP_API_AUTH_AMBIGUOUS', 401);
  return header?.[1] ?? query ?? '';
}
function oneAlias(params, names, code) {
  const present = names.filter(name => params[name] !== undefined && params[name] !== '');
  if (present.length > 1) throw new HttpAdapterError(code, 400);
  return present.length ? params[present[0]] : undefined;
}
function text(value, max, code) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) throw new HttpAdapterError(code, 400);
  return value;
}
function integer(value, min, max, code) {
  if (value === undefined || value === '') return undefined;
  if (!/^-?\d+$/.test(String(value))) throw new HttpAdapterError(code, 400);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new HttpAdapterError(code, 400);
  return n;
}
function int64(value, code) {
  if (value === undefined || value === '') return undefined;
  if (!/^-?\d{1,19}$/.test(String(value))) throw new HttpAdapterError(code, 400);
  try { return BigInt(value); } catch { throw new HttpAdapterError(code, 400); }
}
function boolean(value, code) {
  if (value === undefined) return undefined;
  if (value === true || value === false) return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HttpAdapterError(code, 400);
}
function cursor(value, code) {
  if (value === undefined || value === '') return new Uint8Array(0);
  // Protobuf JSON emits standard Base64 (including `=` padding), while the
  // independent API may also be called with the unpadded base64url form.
  // Accept both encodings, but validate the alphabet/padding before handing
  // the value to Node's permissive Base64 decoder.
  if (typeof value !== 'string' || value.length > 2048 || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(value)) throw new HttpAdapterError(code, 400);
  const padding = (value.match(/=+$/) || [''])[0].length;
  const core = padding ? value.slice(0, -padding) : value;
  if (core.length % 4 === 1 || (padding && value.length % 4 !== 0) || (core.includes('+') && core.includes('-')) || (core.includes('/') && core.includes('_'))) throw new HttpAdapterError(code, 400);
  try {
    const base64 = core.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (core.length % 4)) % 4);
    const raw = Buffer.from(base64, 'base64');
    return new Uint8Array(raw);
  } catch { throw new HttpAdapterError(code, 400); }
}
function cursorString(value) {
  if (!(value instanceof Uint8Array) || value.length === 0) return undefined;
  return Buffer.from(value).toString('base64url');
}
function snakeKey(key) { return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`); }
function snakeKeys(value) {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [snakeKey(key), snakeKeys(child)]));
}
function responseJson(frame, method) {
  const value = EngineServerFrame.toJSON(frame);
  if (value.error) throw new HttpAdapterError(value.error.code || 'HTTP_API_UPSTREAM_FAILED', 400, value.error.message || value.error.code);
  return value[method] ?? {};
}
function accountId(params) { return oneAlias(params, ['account', 'account_id'], 'HTTP_API_ACCOUNT_AMBIGUOUS'); }
function conversationId(params) { return oneAlias(params, ['username', 'talker', 'session_id', 'conversation_id'], 'HTTP_API_CONVERSATION_AMBIGUOUS'); }

function toolDefinitions() {
  const string = { type: 'string' };
  return [
    { name: 'wechat.core.get_status', description: '返回独立离线后端的状态摘要', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.core.list_accounts', description: '列出已验证的离线账号', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.core.get_account_info', description: '返回一个已验证账号的非敏感状态字段', inputSchema: { type: 'object', properties: { account_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.list_contacts', description: '分页读取已验证联系人字段', inputSchema: { type: 'object', properties: { account_id: string, keyword: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.list_directory', description: '按已验证的好友和群聊分类读取通讯录目录', inputSchema: { type: 'object', properties: { account_id: string, categories: { type: 'array', items: { type: 'string', enum: ['friend', 'group'] }, maxItems: 2, uniqueItems: true }, query: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.resolve_contact', description: '按联系人或群名称做有界字面量查询', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.get_contact_profile', description: '返回已验证联系人的存在性和有限群信息', inputSchema: { type: 'object', required: ['username'], properties: { account_id: string, username: string, common_group_limit: { type: 'integer', minimum: 0, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.get_group_members', description: '读取已验证群成员字段', inputSchema: { type: 'object', required: ['chatroom_id'], properties: { account_id: string, chatroom_id: string, limit: { type: 'integer', minimum: 1, maximum: 1000 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.list_sessions', description: '分页读取已验证会话', inputSchema: { type: 'object', properties: { account_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.resolve_session', description: '按会话名称或 ID 做有界字面量查询', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_messages', description: '读取指定会话的已验证消息 DTO', inputSchema: { type: 'object', required: ['username'], properties: { account_id: string, username: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string, ascending: { type: 'boolean' }, after_unix_ms: string, before_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.search_messages', description: '在已验证消息范围内做字面量搜索', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, username: string, sender_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.list_search_senders', description: '在有界搜索结果中统计发送人分布', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, username: string, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_message_around', description: '读取指定消息前后的有界上下文', inputSchema: { type: 'object', required: ['username', 'anchor_id'], properties: { account_id: string, username: string, anchor_id: string, before: { type: 'integer', minimum: 0, maximum: 50 }, after: { type: 'integer', minimum: 0, maximum: 50 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_message_anchor', description: '读取会话第一条消息或指定日期的第一条消息', inputSchema: { type: 'object', required: ['username', 'kind'], properties: { account_id: string, username: string, kind: { type: 'string', enum: ['first', 'day'] }, date: { type: 'string' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_daily_message_counts', description: '读取指定会话某月的每日消息数', inputSchema: { type: 'object', required: ['username', 'month'], properties: { account_id: string, username: string, month: { type: 'string' }, utc_offset_minutes: { type: 'integer', minimum: -720, maximum: 840 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_message_raw', description: '读取一条已验证消息的原始 DTO 字段（不含数据库密钥和未验证 XML）', inputSchema: { type: 'object', required: ['username'], properties: { account_id: string, username: string, message_id: string, server_id: string, local_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.export_conversation', description: '将已验证会话导出到本机新文件', inputSchema: { type: 'object', required: ['username', 'format', 'destination_path'], properties: { account_id: string, username: string, format: { type: 'string', enum: ['json', 'markdown', 'html', 'txt'] }, destination_path: string, include_media: { type: 'boolean', const: false }, start_time_unix_ms: string, end_time_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.export_media_metadata', description: '将已验证媒体消息的元数据导出到本机新文件；不读取、解密或播放媒体文件', inputSchema: { type: 'object', required: ['format', 'destination_path'], properties: { account_id: string, username: string, format: { type: 'string', enum: ['media-json', 'media-csv'] }, destination_path: string, start_time_unix_ms: string, end_time_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha.messages.search_page', description: '读取独立后端的跨会话搜索页', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, username: string, sender_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } }
  ];
}

function createReadOnlyHttpServer({ engine, token, host = '127.0.0.1', port = 0, maxBodyBytes = MAX_BODY_BYTES } = {}) {
  if (!engine || typeof engine.dispatch !== 'function') throw new TypeError('HTTP_ENGINE_REQUIRED');
  parseToken(token);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError('HTTP_PORT_INVALID');
  if (host !== '127.0.0.1' && host !== 'localhost') throw new TypeError('HTTP_HOST_INVALID');
  if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1024 || maxBodyBytes > MAX_BODY_BYTES) throw new TypeError('HTTP_BODY_LIMIT_INVALID');
  let nextRequestId = 1n;
  let server;
  let actualPort = port;
  let helloPromise;

  async function call(method, payload = {}) {
    if (!ALLOWED_METHODS.has(method)) throw new HttpAdapterError('HTTP_API_METHOD_UNSUPPORTED', 501);
    const request = EngineClientFrame.fromPartial({ requestId: nextRequestId++, [method]: payload });
    const reply = await engine.dispatch(request);
    return responseJson(reply, method);
  }
  async function ensureHello() {
    if (!helloPromise) helloPromise = callHello();
    return helloPromise;
  }
  async function callHello() {
    const request = EngineClientFrame.fromPartial({ requestId: nextRequestId++, hello: { protocol: { major: 1, minor: 0 } } });
    const reply = await engine.dispatch(request);
    return responseJson(reply, 'hello');
  }
  async function readBody(req) {
    return await new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', chunk => { size += chunk.length; if (size > maxBodyBytes) { reject(new HttpAdapterError('HTTP_API_BODY_TOO_LARGE', 413)); req.destroy(); return; } chunks.push(chunk); });
      req.on('end', () => { if (!chunks.length) return resolve({}); try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw 0; resolve(parsed); } catch { reject(new HttpAdapterError('HTTP_API_BODY_INVALID', 400)); } });
      req.on('error', reject);
    });
  }
  async function selectedAccount(params) {
    const explicit = accountId(params);
    if (explicit) return text(explicit, 256, 'HTTP_API_ACCOUNT_INVALID');
    const listed = await call('listAccounts');
    const accounts = listed.accounts || [];
    if (accounts.length !== 1) throw new HttpAdapterError(accounts.length ? 'HTTP_API_ACCOUNT_REQUIRED' : 'ENGINE_NOT_READY', accounts.length ? 400 : 503);
    return accounts[0].accountId || accounts[0].id || '';
  }
  function page(params, maximum = 500) {
    const limit = integer(params.limit, 1, maximum, 'HTTP_API_LIMIT_INVALID') ?? 100;
    return { pageSize: limit, cursor: cursor(params.cursor, 'HTTP_API_CURSOR_INVALID') };
  }
  async function route(pathname, params, method = 'GET') {
    if (pathname === '/api/v1/accounts') return snakeKeys(await call('listAccounts'));
    if (pathname === '/api/v1/exports/formats') return { formats: ['json', 'markdown', 'html', 'txt', 'media-json', 'media-csv', 'group-members-csv', 'group-members-json', 'group-members-html', 'group-members-xlsx'] };
    if (pathname === '/api/v1/exports') {
      if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const account = await selectedAccount(params);
      const conversation = text(oneAlias(params, ['conversation_id', 'conversationId', 'username', 'talker'], 'HTTP_API_CONVERSATION_AMBIGUOUS'), 1024, 'HTTP_API_CONVERSATION_INVALID');
      if (!conversation) throw new HttpAdapterError('HTTP_API_CONVERSATION_REQUIRED', 400);
      const destination = text(params.destination_path ?? params.destinationPath, 4096, 'HTTP_API_DESTINATION_INVALID');
      if (!destination) throw new HttpAdapterError('HTTP_API_DESTINATION_REQUIRED', 400);
      const format = text(params.format, 32, 'HTTP_API_FORMAT_INVALID');
      if (!format) throw new HttpAdapterError('HTTP_API_FORMAT_REQUIRED', 400);
      if (!['json', 'md', 'markdown', 'html', 'txt'].includes(format.toLowerCase())) throw new HttpAdapterError('HTTP_API_FORMAT_UNSUPPORTED', 400);
      const includeMedia = boolean(params.include_media ?? params.includeMedia, 'HTTP_API_INCLUDE_MEDIA_INVALID');
      const start = int64(params.start_time_unix_ms ?? params.startTimeUnixMs, 'HTTP_API_TIME_INVALID');
      const end = int64(params.end_time_unix_ms ?? params.endTimeUnixMs, 'HTTP_API_TIME_INVALID');
      const response = await call('exportConversation', {
        accountId: account,
        conversationId: conversation,
        format,
        destinationPath: destination,
        ...(includeMedia !== undefined ? { includeMedia } : {}),
        ...(start !== undefined ? { startTimeUnixMs: start } : {}),
        ...(end !== undefined ? { endTimeUnixMs: end } : {})
      });
      return snakeKeys(response);
    }
    if (pathname === '/api/v1/media-metadata') {
      if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const account = await selectedAccount(params);
      const conversation = oneAlias(params, ['conversation_id', 'conversationId', 'username', 'talker'], 'HTTP_API_CONVERSATION_AMBIGUOUS');
      const destination = text(params.destination_path ?? params.destinationPath, 4096, 'HTTP_API_DESTINATION_INVALID');
      if (!destination) throw new HttpAdapterError('HTTP_API_DESTINATION_REQUIRED', 400);
      const format = text(params.format, 32, 'HTTP_API_FORMAT_INVALID');
      if (!format) throw new HttpAdapterError('HTTP_API_FORMAT_REQUIRED', 400);
      if (!['media-json', 'media-csv'].includes(format.toLowerCase())) throw new HttpAdapterError('HTTP_API_FORMAT_UNSUPPORTED', 400);
      const response = await call('exportConversation', {
        accountId: account,
        conversationId: conversation === undefined ? '' : text(conversation, 1024, 'HTTP_API_CONVERSATION_INVALID'),
        format: format.toLowerCase(),
        destinationPath: destination,
        includeMedia: false,
        ...(int64(params.start_time_unix_ms ?? params.startTimeUnixMs, 'HTTP_API_TIME_INVALID') === undefined ? {} : { startTimeUnixMs: int64(params.start_time_unix_ms ?? params.startTimeUnixMs, 'HTTP_API_TIME_INVALID') }),
        ...(int64(params.end_time_unix_ms ?? params.endTimeUnixMs, 'HTTP_API_TIME_INVALID') === undefined ? {} : { endTimeUnixMs: int64(params.end_time_unix_ms ?? params.endTimeUnixMs, 'HTTP_API_TIME_INVALID') })
      });
      return snakeKeys(response);
    }
    const account = await selectedAccount(params);
    if (pathname === '/api/v1/sessions') return snakeKeys(await call('listConversations', { accountId: account, page: page(params, 500) }));
    const sessionMatch = /^\/api\/v1\/sessions\/([^/]+)\/messages$/.exec(pathname);
    if (sessionMatch) params.username = decodeURIComponent(sessionMatch[1]);
    if (pathname === '/api/v1/messages' || sessionMatch) {
      const conversation = text(conversationId(params), 1024, 'HTTP_API_CONVERSATION_INVALID');
      if (!conversation) throw new HttpAdapterError('HTTP_API_CONVERSATION_REQUIRED', 400);
      const p = page(params, 500);
      return snakeKeys(await call('listMessages', { accountId: account, conversationId: conversation, page: p, ascending: params.ascending === undefined ? true : params.ascending === true || params.ascending === 'true', ...(int64(params.after_unix_ms, 'HTTP_API_TIME_INVALID') !== undefined ? { afterUnixMs: int64(params.after_unix_ms, 'HTTP_API_TIME_INVALID') } : {}), ...(int64(params.before_unix_ms, 'HTTP_API_TIME_INVALID') !== undefined ? { beforeUnixMs: int64(params.before_unix_ms, 'HTTP_API_TIME_INVALID') } : {}) }));
    }
    if (pathname === '/api/v1/search') {
      const query = text(params.query ?? params.keyword, 1024, 'HTTP_API_QUERY_INVALID');
      if (!query) throw new HttpAdapterError('HTTP_API_QUERY_REQUIRED', 400);
      const conversation = text(oneAlias(params, ['username', 'talker', 'conversation_id'], 'HTTP_API_CONVERSATION_AMBIGUOUS'), 1024, 'HTTP_API_CONVERSATION_INVALID');
      const sender = text(params.sender_id, 256, 'HTTP_API_SENDER_INVALID');
      return snakeKeys(await call('searchMessages', { accountId: account, query, ...(conversation ? { conversationId: conversation } : {}), ...(sender ? { senderId: sender } : {}), page: page(params, 500), ascending: params.ascending === true || params.ascending === 'true', groupByConversation: params.group_by_conversation === true || params.group_by_conversation === 'true' }));
    }
    if (pathname === '/api/v1/contacts') {
      const response = await call('listContacts', { accountId: account, ascending: true, query: text(params.query ?? params.keyword, 1024, 'HTTP_API_QUERY_INVALID') || '', limit: integer(params.limit, 1, 500, 'HTTP_API_LIMIT_INVALID') ?? 100, offset: integer(params.offset, 0, 100000, 'HTTP_API_OFFSET_INVALID') ?? 0 });
      return snakeKeys(response.response || response);
    }
    if (pathname === '/api/v1/contact-directory') {
      const rawCategories = params.categories === undefined || params.categories === '' ? [] : String(params.categories).split(',').filter(Boolean);
      if (rawCategories.length > 2 || rawCategories.some(category => !['friend', 'group'].includes(category)) || new Set(rawCategories).size !== rawCategories.length) throw new HttpAdapterError('HTTP_API_DIRECTORY_CATEGORY_INVALID', 400);
      const response = await call('listContacts', { accountId: account, ascending: true, query: text(params.query ?? params.keyword, 1024, 'HTTP_API_QUERY_INVALID') || '', limit: integer(params.limit, 1, 500, 'HTTP_API_LIMIT_INVALID') ?? 100, offset: integer(params.offset, 0, 100000, 'HTTP_API_OFFSET_INVALID') ?? 0, directory: { categories: rawCategories } });
      return snakeKeys(response.response || response);
    }
    if (pathname === '/api/v1/group-members') {
      const room = text(oneAlias(params, ['chatroom_id', 'chatroomId', 'username'], 'HTTP_API_CONVERSATION_AMBIGUOUS'), 256, 'HTTP_API_CHATROOM_INVALID');
      if (!room || !room.endsWith('@chatroom')) throw new HttpAdapterError('HTTP_API_CHATROOM_INVALID', 400);
      const response = await call('listGeneral', { accountId: account, tableName: '__alpha_group_members', query: room, limit: integer(params.limit, 1, 1000, 'HTTP_API_LIMIT_INVALID') ?? 100, offset: integer(params.offset, 0, 100000, 'HTTP_API_OFFSET_INVALID') ?? 0, ascending: true });
      const pageResponse = response.response || {};
      return { items: (pageResponse.items || []).map(item => { const fields = Object.fromEntries((item.fields || []).map(field => [field.name, field.value])); return { username: item.actor, group_nickname: fields.groupNickname || '', nickname: fields.nickname || '', remark: fields.remark || '', alias: fields.alias || '', ...(fields.isOwner === 'true' ? { is_owner: true } : {}) }; }), source_database: pageResponse.sourceDatabase || '', source_table: pageResponse.sourceTable || '' };
    }
    throw new HttpAdapterError('HTTP_API_ROUTE_NOT_FOUND', 404);
  }
  function mcpDate(value, code) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpAdapterError(code, 400);
    const [year, month, day] = value.split('-').map(Number);
    const millis = Date.UTC(year, month - 1, day);
    const check = new Date(millis);
    if (!Number.isFinite(millis) || check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new HttpAdapterError(code, 400);
    return BigInt(millis);
  }
  function mcpMonth(value, code) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) throw new HttpAdapterError(code, 400);
    const [year, month] = value.split('-').map(Number);
    if (month < 1 || month > 12) throw new HttpAdapterError(code, 400);
    const start = BigInt(Date.UTC(year, month - 1, 1));
    const end = BigInt(Date.UTC(year, month, 1));
    if (!Number.isFinite(Number(start)) || !Number.isFinite(Number(end))) throw new HttpAdapterError(code, 400);
    return { start, end };
  }
  function mcpLimit(value, fallback, maximum, code, minimum = 1) {
    return integer(value, minimum, maximum, code) ?? fallback;
  }
  function mcpMessage(item, includeConversation = false) {
    if (!item || typeof item !== 'object') throw new HttpAdapterError('MCP_MESSAGE_INVALID', 502);
    const sentAt = typeof item.sentAtUnixMs === 'string' ? item.sentAtUnixMs : item.sent_at_unix_ms;
    let time = sentAt || '';
    try { const n = BigInt(sentAt); if (n >= -8640000000000000n && n <= 8640000000000000n) time = new Date(Number(n)).toISOString(); } catch { /* preserve the verified decimal string */ }
    return {
      id: item.id || '',
      ...(includeConversation && (item.conversationId || item.conversation_id) ? { conversation_id: item.conversationId || item.conversation_id } : {}),
      time,
      sender: item.senderId || item.sender_id || '',
      sender_id: item.senderId || item.sender_id || '',
      from_me: item.direction === 2 || item.direction === 'MESSAGE_DIRECTION_OUTBOUND' || item.direction === 'outbound',
      type: item.kind || 'unknown',
      text: item.text || ''
    };
  }
  async function mcpAllMessages(account, username) {
    const items = []; let next = new Uint8Array(0);
    for (let pageNumber = 0; pageNumber < MCP_SCAN_MAX_PAGES; pageNumber += 1) {
      const value = await call('listMessages', { accountId: account, conversationId: username, page: { pageSize: 500, cursor: next }, ascending: true });
      if (!Array.isArray(value.items) || value.items.length > 500) throw new HttpAdapterError('MCP_MESSAGE_PAGE_INVALID', 502);
      items.push(...value.items);
      if (items.length > MCP_SCAN_MAX_ITEMS) throw new HttpAdapterError('MCP_SCAN_LIMIT', 413);
      if (!value.nextCursor) return items;
      next = cursor(value.nextCursor, 'MCP_CURSOR_INVALID');
    }
    throw new HttpAdapterError('MCP_SCAN_LIMIT', 413);
  }
  async function mcpFindMessage(account, username, predicate) {
    let next = new Uint8Array(0); let scanned = 0; let found;
    for (let pageNumber = 0; pageNumber < MCP_SCAN_MAX_PAGES; pageNumber += 1) {
      const value = await call('listMessages', { accountId: account, conversationId: username, page: { pageSize: 500, cursor: next }, ascending: true });
      if (!Array.isArray(value.items) || value.items.length > 500) throw new HttpAdapterError('MCP_MESSAGE_PAGE_INVALID', 502);
      scanned += value.items.length;
      for (const item of value.items) {
        if (!predicate(item)) continue;
        if (found) throw new HttpAdapterError('MCP_MESSAGE_IDENTIFIER_AMBIGUOUS', 409);
        found = item;
      }
      if (scanned > MCP_SCAN_MAX_ITEMS) throw new HttpAdapterError('MCP_SCAN_LIMIT', 413);
      if (!value.nextCursor) return found;
      next = cursor(value.nextCursor, 'MCP_CURSOR_INVALID');
    }
    throw new HttpAdapterError('MCP_SCAN_LIMIT', 413);
  }
  async function mcpAllSearch(params, account) {
    const items = []; let next = '';
    for (let pageNumber = 0; pageNumber < MCP_SCAN_MAX_PAGES; pageNumber += 1) {
      const value = await route('/api/v1/search', { ...params, account_id: account, limit: 500, ...(next ? { cursor: next } : {}) });
      if (!Array.isArray(value.items) || value.items.length > 500) throw new HttpAdapterError('MCP_SEARCH_PAGE_INVALID', 502);
      items.push(...value.items);
      if (items.length > MCP_SCAN_MAX_ITEMS) throw new HttpAdapterError('MCP_SCAN_LIMIT', 413);
      if (!value.next_cursor) return items;
      next = value.next_cursor;
    }
    throw new HttpAdapterError('MCP_SCAN_LIMIT', 413);
  }
  async function mcpCallInternal(rpc) {
    if (!rpc || rpc.jsonrpc !== '2.0' || (rpc.id === undefined && rpc.method !== 'notifications/initialized')) throw new HttpAdapterError('MCP_REQUEST_INVALID', 400);
    if (rpc.method === 'notifications/initialized') return null;
    if (rpc.method === 'ping') return { jsonrpc: '2.0', id: rpc.id, result: {} };
    if (rpc.method === 'initialize') return { jsonrpc: '2.0', id: rpc.id, result: { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'alpha-independent-readonly', version: '0.1.0' } } };
    if (rpc.method === 'tools/list') return { jsonrpc: '2.0', id: rpc.id, result: { tools: toolDefinitions() } };
    if (rpc.method !== 'tools/call' || typeof rpc.params?.name !== 'string') throw new HttpAdapterError('MCP_METHOD_UNSUPPORTED', 400);
    if (rpc.params.arguments !== undefined && (!rpc.params.arguments || typeof rpc.params.arguments !== 'object' || Array.isArray(rpc.params.arguments))) throw new HttpAdapterError('MCP_ARGUMENTS_INVALID', 400);
    const args = rpc.params.arguments || {};
    const name = rpc.params.name;
    const allowedArguments = {
      'wechat.core.get_status': [], 'wechat.core.list_accounts': [], 'wechat.core.get_account_info': ['account_id'],
      'wechat.contacts.list_contacts': ['account_id', 'keyword', 'limit', 'offset'], 'wechat.contacts.list_directory': ['account_id', 'categories', 'query', 'limit', 'offset'], 'wechat.contacts.resolve_contact': ['account_id', 'query', 'limit'], 'wechat.contacts.get_contact_profile': ['account_id', 'username', 'common_group_limit'],
      'wechat.contacts.get_group_members': ['account_id', 'chatroom_id', 'limit', 'offset'], 'wechat.chat.list_sessions': ['account_id', 'limit', 'cursor'],
      'wechat.chat.resolve_session': ['account_id', 'query', 'limit'], 'wechat.chat.get_messages': ['account_id', 'username', 'limit', 'cursor', 'ascending', 'after_unix_ms', 'before_unix_ms'],
      'wechat.chat.search_messages': ['account_id', 'query', 'username', 'sender_id', 'limit', 'cursor'], 'alpha.messages.search_page': ['account_id', 'query', 'username', 'sender_id', 'limit', 'cursor'],
      'wechat.chat.list_search_senders': ['account_id', 'query', 'username', 'limit'], 'wechat.chat.get_message_around': ['account_id', 'username', 'anchor_id', 'before', 'after'],
      'wechat.chat.get_message_anchor': ['account_id', 'username', 'kind', 'date'], 'wechat.chat.get_daily_message_counts': ['account_id', 'username', 'month', 'utc_offset_minutes'], 'wechat.chat.get_message_raw': ['account_id', 'username', 'message_id', 'server_id', 'local_id'], 'wechat.chat.export_conversation': ['account_id', 'username', 'format', 'destination_path', 'include_media', 'start_time_unix_ms', 'end_time_unix_ms'], 'wechat.chat.export_media_metadata': ['account_id', 'username', 'format', 'destination_path', 'start_time_unix_ms', 'end_time_unix_ms']
    };
    if (Object.hasOwn(allowedArguments, name) && Object.keys(args).some(key => !allowedArguments[name].includes(key))) throw new HttpAdapterError('MCP_ARGUMENTS_INVALID', 400);
    let pathName, params = { ...args };
    if (name === 'wechat.core.get_status') {
      const accounts = snakeKeys(await call('listAccounts'));
      const rows = Array.isArray(accounts.accounts) ? accounts.accounts : [];
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: { status: rows.length ? 'ready' : 'empty', account_count: rows.length, selected_account_id: accounts.selected_account_id || '' }, content: [{ type: 'text', text: JSON.stringify({ status: rows.length ? 'ready' : 'empty', account_count: rows.length, selected_account_id: accounts.selected_account_id || '' }) }] } };
    } else if (name === 'wechat.core.get_account_info') {
      const accounts = snakeKeys(await call('listAccounts'));
      const rows = Array.isArray(accounts.accounts) ? accounts.accounts : [];
      const wanted = text(args.account_id, 256, 'MCP_ACCOUNT_INVALID');
      const row = wanted ? rows.find(item => item.account_id === wanted || item.id === wanted) : rows.length === 1 ? rows[0] : undefined;
      if (!row) throw new HttpAdapterError(rows.length ? 'HTTP_API_ACCOUNT_REQUIRED' : 'ENGINE_NOT_READY', rows.length ? 400 : 503);
      const result = { id: row.id || row.account_id || '', display_name: row.display_name || '', state: row.state || '', ready: row.ready === true, verified: row.verified === true, capabilities: Array.isArray(row.capabilities) ? row.capabilities : [] };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } else if (name === 'wechat.core.list_accounts') pathName = '/api/v1/accounts';
    else if (name === 'wechat.contacts.list_contacts') pathName = '/api/v1/contacts';
    else if (name === 'wechat.contacts.list_directory') {
      pathName = '/api/v1/contact-directory';
      if (args.categories !== undefined && (!Array.isArray(args.categories) || args.categories.length > 2 || new Set(args.categories).size !== args.categories.length || args.categories.some(category => !['friend', 'group'].includes(category)))) throw new HttpAdapterError('MCP_DIRECTORY_CATEGORY_INVALID', 400);
      params.categories = Array.isArray(args.categories) ? args.categories.join(',') : '';
      params.query = args.query;
    }
    else if (name === 'wechat.contacts.resolve_contact') { pathName = '/api/v1/contacts'; params.query = args.query; params.limit = mcpLimit(args.limit, 20, 20, 'MCP_LIMIT_INVALID'); }
    else if (name === 'wechat.contacts.get_contact_profile') {
      const account = await selectedAccount(params);
      const username = text(args.username, 1024, 'MCP_CONTACT_PROFILE_INVALID');
      const commonGroupLimit = mcpLimit(args.common_group_limit, 20, 20, 'MCP_LIMIT_INVALID', 0);
      const value = snakeKeys(await call('getContactProfile', { accountId: account, username, commonGroupLimit }));
      const response = value.response || {};
      const result = { username, found: response.found === true, ...(response.profile ? { profile: response.profile } : {}) };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'wechat.contacts.get_group_members') { pathName = '/api/v1/group-members'; params.chatroom_id = args.chatroom_id; }
    else if (name === 'wechat.chat.list_sessions') pathName = '/api/v1/sessions';
    else if (name === 'wechat.chat.resolve_session') pathName = '/api/v1/sessions';
    else if (name === 'wechat.chat.get_messages') { pathName = '/api/v1/messages'; params.username = args.username; params.after_unix_ms = args.after_unix_ms; params.before_unix_ms = args.before_unix_ms; }
    else if (name === 'wechat.chat.search_messages' || name === 'alpha.messages.search_page') { pathName = '/api/v1/search'; params.query = args.query; params.username = args.username; }
    else if (name === 'wechat.chat.list_search_senders') {
      const account = await selectedAccount(params);
      const items = await mcpAllSearch({ query: text(args.query, 1024, 'MCP_QUERY_INVALID'), ...(args.username ? { username: text(args.username, 1024, 'MCP_CONVERSATION_INVALID') } : {}) }, account);
      const counts = new Map();
      for (const item of items) { const sender = item.sender_id || ''; if (sender) counts.set(sender, (counts.get(sender) || 0) + 1); }
      const result = { senders: [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, mcpLimit(args.limit, 20, 20, 'MCP_LIMIT_INVALID')).map(([sender_id, count]) => ({ sender_id, count })), total_matches: items.length, complete: true };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } else if (name === 'wechat.chat.get_message_around') {
      const account = await selectedAccount(params); const username = text(args.username, 1024, 'MCP_CONVERSATION_INVALID'); const anchorId = text(args.anchor_id, 1024, 'MCP_ANCHOR_INVALID');
      const before = mcpLimit(args.before, 50, 50, 'MCP_LIMIT_INVALID', 0), after = mcpLimit(args.after, 50, 50, 'MCP_LIMIT_INVALID', 0);
      const all = await mcpAllMessages(account, username); const index = all.findIndex(item => item.id === anchorId || item.serverId === anchorId || item.localId?.toString() === anchorId);
      if (index < 0) throw new HttpAdapterError('MCP_MESSAGE_NOT_FOUND', 404);
      const result = { username, before: all.slice(Math.max(0, index - before), index).map(item => mcpMessage(item)), anchor: mcpMessage(all[index], true), after: all.slice(index + 1, index + 1 + after).map(item => mcpMessage(item)) };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } else if (name === 'wechat.chat.get_message_anchor') {
      const account = await selectedAccount(params); const username = text(args.username, 1024, 'MCP_CONVERSATION_INVALID'); const kind = text(args.kind, 16, 'MCP_ANCHOR_KIND_INVALID');
      if (!['first', 'day'].includes(kind)) throw new HttpAdapterError('MCP_ANCHOR_KIND_INVALID', 400);
      let query = { account_id: account, username, limit: 1, ascending: 'true' };
      if (kind === 'day') { const start = mcpDate(args.date, 'MCP_DATE_INVALID'); query.after_unix_ms = (start - 1n).toString(); query.before_unix_ms = (start + 86400000n).toString(); }
      const value = await route('/api/v1/messages', query); const result = { username, kind, date: args.date || '', message: value.items?.[0] ? mcpMessage(value.items[0], true) : null };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } else if (name === 'wechat.chat.get_daily_message_counts') {
      const account = await selectedAccount(params); const username = text(args.username, 1024, 'MCP_CONVERSATION_INVALID'); const range = mcpMonth(args.month, 'MCP_MONTH_INVALID');
      const offset = integer(args.utc_offset_minutes, -720, 840, 'MCP_UTC_OFFSET_INVALID') ?? 0;
      const value = await call('getConversationDayCounts', { accountId: account, conversationId: username, fromUnixMs: range.start, toUnixMs: range.end, utcOffsetMinutes: offset });
      const result = { username, month: args.month, utc_offset_minutes: offset, days: (value.days || []).map(day => ({ date: day.localDay?.toString?.() || '', count: day.count?.toString?.() || '0' })) };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } else if (name === 'wechat.chat.get_message_raw') {
      const account = await selectedAccount(params);
      const username = text(args.username, 1024, 'MCP_CONVERSATION_INVALID');
      const identifiers = ['message_id', 'server_id', 'local_id'].filter(key => args[key] !== undefined && args[key] !== '');
      if (identifiers.length !== 1) throw new HttpAdapterError(identifiers.length ? 'MCP_MESSAGE_IDENTIFIER_AMBIGUOUS' : 'MCP_MESSAGE_IDENTIFIER_REQUIRED', 400);
      const identifier = text(args[identifiers[0]], 1024, 'MCP_MESSAGE_IDENTIFIER_INVALID');
      const item = await mcpFindMessage(account, username, candidate => {
        if (identifiers[0] === 'message_id') return candidate.id === identifier;
        if (identifiers[0] === 'server_id') return String(candidate.serverId ?? candidate.server_id ?? '') === identifier;
        return String(candidate.localId ?? candidate.local_id ?? '') === identifier;
      });
      if (!item) throw new HttpAdapterError('MCP_MESSAGE_NOT_FOUND', 404);
      const raw = snakeKeys({ ...item, conversationId: item.conversationId || username });
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: { username, raw }, content: [{ type: 'text', text: JSON.stringify({ username, raw }) }] } };
    } else if (name === 'wechat.chat.export_conversation') {
      pathName = '/api/v1/exports';
      params = {
        ...(args.account_id !== undefined ? { account_id: args.account_id } : {}),
        conversation_id: args.username,
        format: args.format,
        destination_path: args.destination_path,
        ...(args.include_media !== undefined ? { include_media: args.include_media } : {}),
        ...(args.start_time_unix_ms !== undefined ? { start_time_unix_ms: args.start_time_unix_ms } : {}),
        ...(args.end_time_unix_ms !== undefined ? { end_time_unix_ms: args.end_time_unix_ms } : {})
      };
    } else if (name === 'wechat.chat.export_media_metadata') {
      pathName = '/api/v1/media-metadata';
      params = {
        ...(args.account_id !== undefined ? { account_id: args.account_id } : {}),
        ...(args.username !== undefined ? { conversation_id: args.username } : {}),
        format: args.format,
        destination_path: args.destination_path,
        ...(args.start_time_unix_ms !== undefined ? { start_time_unix_ms: args.start_time_unix_ms } : {}),
        ...(args.end_time_unix_ms !== undefined ? { end_time_unix_ms: args.end_time_unix_ms } : {})
      };
    }
    else return { jsonrpc: '2.0', id: rpc.id, result: { isError: true, structuredContent: { code: 'MCP_TOOL_NOT_FOUND', message: 'MCP_TOOL_NOT_FOUND' }, content: [{ type: 'text', text: JSON.stringify({ code: 'MCP_TOOL_NOT_FOUND', message: 'MCP_TOOL_NOT_FOUND' }) }] } };
    try {
      let result = await route(pathName, params, ['wechat.chat.export_conversation', 'wechat.chat.export_media_metadata'].includes(name) ? 'POST' : 'GET');
      if (name === 'wechat.contacts.resolve_contact') {
        result = { items: (result.items || []).map(item => ({ username: item.username, display_name: item.remark || item.nickname || item.alias || item.username, kind: item.username?.endsWith('@chatroom') ? 'group' : 'contact' })) };
      } else if (name === 'wechat.chat.resolve_session') {
        const query = String(args.query || '').toLocaleLowerCase();
        result = { items: (result.items || []).filter(item => [item.id, item.display_name, item.preview].some(value => String(value || '').toLocaleLowerCase().includes(query))).slice(0, mcpLimit(args.limit, 20, 20, 'MCP_LIMIT_INVALID')) };
      }
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    catch (error) { const e = error instanceof HttpAdapterError ? error : new HttpAdapterError('HTTP_API_UPSTREAM_FAILED', 502); return { jsonrpc: '2.0', id: rpc.id, result: { isError: true, structuredContent: { code: e.code, message: e.message }, content: [{ type: 'text', text: JSON.stringify({ code: e.code, message: e.message }) }] } }; }
  }
  async function mcpCall(rpc) {
    try { return await mcpCallInternal(rpc); }
    catch (error) {
      const e = error instanceof HttpAdapterError ? error : new HttpAdapterError('HTTP_API_UPSTREAM_FAILED', 502);
      return { jsonrpc: '2.0', id: rpc?.id ?? null, result: { isError: true, structuredContent: { code: e.code, message: e.message }, content: [{ type: 'text', text: JSON.stringify({ code: e.code, message: e.message }) }] } };
    }
  }
  async function handle(req, res) {
    const url = new URL(req.url || '/', `http://${req.headers.host || '127.0.0.1'}`);
    try {
      if (req.headers.origin) throw new HttpAdapterError('HTTP_API_ORIGIN_DENIED', 403);
      const expectedHost = `${host === 'localhost' ? 'localhost' : '127.0.0.1'}:${actualPort}`;
      if (req.headers.host !== expectedHost && req.headers.host !== `localhost:${actualPort}` && req.headers.host !== `127.0.0.1:${actualPort}`) throw new HttpAdapterError('HTTP_API_HOST_DENIED', 403);
      if (url.pathname === '/health' || url.pathname === '/api/v1/health') { if (req.method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405); return json(res, 200, { status: 'ok', service: 'alpha-independent-readonly' }); }
      if (!['GET', 'POST'].includes(req.method)) throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      if (!tokenMatches(bearer(req, url), token)) throw new HttpAdapterError('HTTP_API_UNAUTHORIZED', 401);
      await ensureHello();
      if (url.pathname === '/mcp') {
        if (req.method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
        const rpc = await readBody(req); const reply = await mcpCall(rpc); return reply === null ? empty(res, 202) : json(res, 200, reply);
      }
      const body = req.method === 'POST' ? await readBody(req) : {};
      const params = Object.fromEntries(url.searchParams.entries());
      for (const [key, value] of Object.entries(body)) { if (params[key] !== undefined) throw new HttpAdapterError('HTTP_API_BODY_INVALID', 400); params[key] = value; }
      const result = await route(url.pathname, params, req.method);
      return json(res, 200, result);
    } catch (error) { return fail(res, error); }
  }
  return {
    async start() { if (server) return { host, port: actualPort }; server = http.createServer((req, res) => { handle(req, res).catch(error => fail(res, error)); }); server.requestTimeout = 30000; server.headersTimeout = 10000; await new Promise((resolve, reject) => { server.once('error', reject); server.listen({ host, port }, () => { server.removeListener('error', reject); actualPort = server.address().port; resolve(); }); }); return { host, port: actualPort }; },
    async close() { if (!server) return; const current = server; server = null; await new Promise(resolve => current.close(() => resolve())); },
    address() { return server?.address() ?? null; },
    call
  };
}

module.exports = { createReadOnlyHttpServer, HttpAdapterError, MAX_BODY_BYTES, toolDefinitions };
