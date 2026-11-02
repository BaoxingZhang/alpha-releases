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
const MAX_ANALYSIS_REPORT_BYTES = 64 * 1024 * 1024;
const PRINTABLE_TOKEN = /^[\x21-\x7e]{32,256}$/;
// Conversation export only writes a new file through the engine's bounded,
// non-overwriting exporter. It does not mutate the source database, but it is
// kept separate from the ordinary DTO reads so the route remains explicit.
const ALLOWED_METHODS = new Set(['listAccounts', 'listConversations', 'listMessages', 'searchMessages', 'listContacts', 'listMoments', 'listFavorites', 'listFavoriteMediaSlots', 'resolveFavoriteMedia', 'listMomentAuthors', 'getMomentDayCounts', 'getContactProfile', 'listGeneral', 'listMessageRecallRecords', 'getConversationDayCounts', 'getChatExportStats', 'getChatExportCapabilities', 'exportConversation', 'startMomentExport', 'watchChatExport', 'cancelChatExport', 'startAggregateAnalysis', 'watchAggregateAnalysis', 'cancelAggregateAnalysis', 'locateMessage', 'getMessageSource', 'decodeVoicePlayback', 'analyzeAnnual', 'analyzeConversation', 'browseConversationMessages', 'browseAccountMedia', 'listChatExportSchedules', 'getChatExportSchedule', 'saveChatExportSchedule', 'deleteChatExportSchedule', 'runChatExportScheduleNow', 'listChatExportRuns', 'getChatExportRun', 'listChatExportAttempts', 'getChatExportAttempt', 'retryChatExportAttempt', 'getDataRevision', 'getDataWatchTargets']);
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
function independentSourceToken(value, code) {
  const token = text(value, 4096, code);
  if (token === undefined || !/^independent1_[A-Za-z0-9_-]+$/.test(token)) throw new HttpAdapterError(code, 400);
  const encoded = token.slice('independent1_'.length);
  try {
    if (!encoded || encoded.length % 4 === 1 || Buffer.from(encoded, 'base64url').toString('base64url') !== encoded) throw new Error('non-canonical');
  } catch { throw new HttpAdapterError(code, 400); }
  return token;
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
function base64Bytes(value, code) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_ANALYSIS_REPORT_BYTES / 3) * 4 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new HttpAdapterError(code, 502);
  const padding = (value.match(/=+$/) || [''])[0].length;
  if (padding && value.indexOf('=') < value.length - padding) throw new HttpAdapterError(code, 502);
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > MAX_ANALYSIS_REPORT_BYTES) throw new HttpAdapterError(code, 502);
  return bytes;
}
function aggregateSnapshot(value) {
  const snapshot = snakeKeys(value || {});
  const encoded = value?.reportJson ?? value?.report_json ?? '';
  delete snapshot.report_json;
  if (!encoded) return snapshot;
  let report;
  try { report = JSON.parse(base64Bytes(encoded, 'HTTP_API_ANALYSIS_REPORT_INVALID').toString('utf8')); }
  catch (failure) { if (failure instanceof HttpAdapterError) throw failure; throw new HttpAdapterError('HTTP_API_ANALYSIS_REPORT_INVALID', 502); }
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new HttpAdapterError('HTTP_API_ANALYSIS_REPORT_INVALID', 502);
  snapshot.report = report;
  return snapshot;
}
function independentAnalysisSnapshot(value, kind, coverage) {
  const snapshot = aggregateSnapshot(value);
  const report = snapshot.report;
  if (!report || typeof report !== 'object' || Array.isArray(report)) throw new HttpAdapterError('HTTP_API_ANALYSIS_REPORT_INVALID', 502);
  return {
    ...snapshot,
    analysis_kind: kind,
    scope: 'alpha-independent-verified-dto',
    coverage,
    complete: false,
    native_schema_supported: false,
    algorithm_version: report.algorithm_version || `alpha-independent-${kind}-v1`
  };
}
function snakeKey(key) { return key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`); }
function snakeKeys(value) {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [snakeKey(key), snakeKeys(child)]));
}
function exportCapabilitiesJson(value) {
  const result = snakeKeys(value || {});
  // Proto3 omits empty repeated fields in JSON. Keep the independent adapter
  // contract stable so callers can distinguish an empty supported set from a
  // missing capability field.
  for (const field of ['message_types', 'media_kinds', 'options', 'xlsx_columns']) if (!Array.isArray(result[field])) result[field] = [];
  return result;
}
function sourceDiagnostics(value) {
  return {
    ...snakeKeys(value || {}),
    scope: 'alpha-independent-source-diagnostics',
    complete: false,
    native_schema_supported: false
  };
}
function responseJson(frame, method) {
  const value = EngineServerFrame.toJSON(frame);
  if (value.error) throw new HttpAdapterError(value.error.code || 'HTTP_API_UPSTREAM_FAILED', 400, value.error.message || value.error.code);
  return value[method] ?? {};
}
function accountId(params) { return oneAlias(params, ['account', 'account_id'], 'HTTP_API_ACCOUNT_AMBIGUOUS'); }
function conversationId(params) { return oneAlias(params, ['username', 'talker', 'session_id', 'conversation_id'], 'HTTP_API_CONVERSATION_AMBIGUOUS'); }
const SCHEDULE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function scheduleUuid(value, code) {
  const normalized = text(value, 64, code);
  if (!normalized || !SCHEDULE_UUID.test(normalized) || normalized === '00000000-0000-0000-0000-000000000000') throw new HttpAdapterError(code, 400);
  return normalized;
}
function scheduleUint(value, code, required = false) {
  if (value === undefined || value === '') {
    if (required) throw new HttpAdapterError(code, 400);
    return undefined;
  }
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'bigint' || !/^(?:0|[1-9][0-9]{0,18})$/.test(String(value))) throw new HttpAdapterError(code, 400);
  try {
    const result = BigInt(String(value));
    if (result > 9223372036854775807n) throw new Error('too large');
    return result;
  } catch { throw new HttpAdapterError(code, 400); }
}
function scheduleStringArray(value, max, code) {
  if (!Array.isArray(value) || value.length > max || new Set(value).size !== value.length || value.some(item => typeof item !== 'string' || !item || item.length > 1024 || item.includes('\0'))) throw new HttpAdapterError(code, 400);
  return [...value];
}
function scheduleOptions(raw, code = 'HTTP_API_SCHEDULE_OPTIONS_INVALID') {
  if (raw === undefined || raw === null) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpAdapterError(code, 400);
  const value = {
    outputDirectory: text(raw.output_directory ?? raw.outputDirectory, 4096, code) || '',
    outputLayout: text(raw.output_layout ?? raw.outputLayout, 64, code) || '',
    conflictPolicy: text(raw.conflict_policy ?? raw.conflictPolicy, 64, code) || '',
    displayNamePreference: text(raw.display_name_preference ?? raw.displayNamePreference, 64, code) || '',
    xlsxColumns: raw.xlsx_columns ?? raw.xlsxColumns ?? [],
    avatars: raw.avatars === undefined ? false : raw.avatars,
    messageTypes: raw.message_types ?? raw.messageTypes ?? [],
    mediaKinds: raw.media_kinds ?? raw.mediaKinds ?? [],
    voiceTranscripts: raw.voice_transcripts ?? raw.voiceTranscripts ?? false,
    rangeMode: text(raw.range_mode ?? raw.rangeMode, 64, code) || ''
  };
  for (const [field, max] of [['xlsxColumns', 128], ['messageTypes', 128], ['mediaKinds', 128]]) value[field] = scheduleStringArray(value[field], max === 128 ? 64 : 64, code);
  for (const field of ['avatars', 'voiceTranscripts']) if (typeof value[field] !== 'boolean') throw new HttpAdapterError(code, 400);
  if (Object.values(value).some(item => item === undefined)) throw new HttpAdapterError(code, 400);
  return value;
}
function schedulePlan(raw, account, code = 'HTTP_API_SCHEDULE_INVALID') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HttpAdapterError(code, 400);
  const accountValue = raw.account_id ?? raw.accountId ?? account;
  if (accountValue !== account) throw new HttpAdapterError('HTTP_API_ACCOUNT_INVALID', 400);
  const scheduleId = scheduleUuid(raw.schedule_id ?? raw.scheduleId, code);
  const conversationIdValue = text(raw.conversation_id ?? raw.conversationId, 1024, code);
  if (!conversationIdValue) throw new HttpAdapterError(code, 400);
  const formats = scheduleStringArray(raw.formats, 1, code);
  if (!formats.length) throw new HttpAdapterError(code, 400);
  const conversationIds = raw.conversation_ids ?? raw.conversationIds;
  const plan = {
    accountId: account,
    scheduleId,
    conversationId: conversationIdValue,
    formats,
    includeMedia: raw.include_media ?? raw.includeMedia ?? false,
    intervalSeconds: scheduleUint(raw.interval_seconds ?? raw.intervalSeconds, code, true),
    lookbackSeconds: scheduleUint(raw.lookback_seconds ?? raw.lookbackSeconds, code, true),
    nextRunUnixMs: scheduleUint(raw.next_run_unix_ms ?? raw.nextRunUnixMs, code, true),
    enabled: raw.enabled,
    conversationIds: conversationIds === undefined ? [] : scheduleStringArray(conversationIds, 500, code),
    ...(raw.options === undefined ? {} : { options: scheduleOptions(raw.options, code) }),
    ...(raw.stop_at_unix_ms ?? raw.stopAtUnixMs) === undefined ? {} : { stopAtUnixMs: scheduleUint(raw.stop_at_unix_ms ?? raw.stopAtUnixMs, code) },
    ...(raw.max_runs ?? raw.maxRuns) === undefined ? {} : { maxRuns: integer(raw.max_runs ?? raw.maxRuns, 0, 100000, code) },
    ...(raw.created_at_unix_ms ?? raw.createdAtUnixMs) === undefined ? {} : { createdAtUnixMs: scheduleUint(raw.created_at_unix_ms ?? raw.createdAtUnixMs, code) },
    ...(raw.updated_at_unix_ms ?? raw.updatedAtUnixMs) === undefined ? {} : { updatedAtUnixMs: scheduleUint(raw.updated_at_unix_ms ?? raw.updatedAtUnixMs, code) },
    ...(raw.success_count ?? raw.successCount) === undefined ? {} : { successCount: integer(raw.success_count ?? raw.successCount, 0, 0xffffffff, code) },
    ...(raw.last_success_unix_ms ?? raw.lastSuccessUnixMs) === undefined ? {} : { lastSuccessUnixMs: scheduleUint(raw.last_success_unix_ms ?? raw.lastSuccessUnixMs, code) }
  };
  if (typeof plan.includeMedia !== 'boolean' || typeof plan.enabled !== 'boolean') throw new HttpAdapterError(code, 400);
  return plan;
}
function scheduleScope(value) {
  return { ...snakeKeys(value || {}), scope: 'alpha-independent-scheduled-export', complete: false, native_schema_supported: false };
}
function schedulePathId(pathValue, code) {
  let decoded;
  try { decoded = decodeURIComponent(pathValue); } catch { throw new HttpAdapterError(code, 400); }
  return scheduleUuid(decoded, code);
}

function toolDefinitions() {
  const string = { type: 'string' };
  return [
    { name: 'wechat.core.get_status', description: '返回独立离线后端的状态摘要', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.core.list_tools', description: '列出当前独立适配器声明的只读工具，可按 package 前缀过滤；不代表原 Alpha/native 完整工具目录', inputSchema: { type: 'object', properties: { package: { type: 'string', maxLength: 64, pattern: '^[A-Za-z][A-Za-z0-9_-]*(?:\\.[A-Za-z][A-Za-z0-9_-]*)*$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.core.list_accounts', description: '列出已验证的离线账号', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.core.get_account_info', description: '返回一个已验证账号的非敏感状态字段', inputSchema: { type: 'object', properties: { account_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.list_contacts', description: '分页读取已验证联系人字段', inputSchema: { type: 'object', properties: { account_id: string, keyword: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.list_directory', description: '按已验证的好友和群聊分类读取通讯录目录', inputSchema: { type: 'object', properties: { account_id: string, categories: { type: 'array', items: { type: 'string', enum: ['friend', 'group'] }, maxItems: 2, uniqueItems: true }, query: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.resolve_contact', description: '按联系人或群名称做有界字面量查询', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.get_contact_profile', description: '返回已验证联系人的存在性和有限群信息', inputSchema: { type: 'object', required: ['username'], properties: { account_id: string, username: string, common_group_limit: { type: 'integer', minimum: 0, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.contacts.get_group_members', description: '读取已验证群成员字段', inputSchema: { type: 'object', required: ['chatroom_id'], properties: { account_id: string, chatroom_id: string, limit: { type: 'integer', minimum: 1, maximum: 1000 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.groups.list_pinned_messages', description: '读取显式 __alpha_group_pins_v1 synthetic fixture 的群置顶元数据；不兼容原生群置顶 schema 或 writer', inputSchema: { type: 'object', required: ['chatroom_id'], properties: { account_id: string, chatroom_id: string, limit: { type: 'integer', minimum: 1, maximum: 1000 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.list_sessions', description: '分页读取已验证会话', inputSchema: { type: 'object', properties: { account_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.resolve_session', description: '按会话名称或 ID 做有界字面量查询', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_messages', description: '读取指定会话的已验证消息 DTO', inputSchema: { type: 'object', required: ['username'], properties: { account_id: string, username: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string, ascending: { type: 'boolean' }, after_unix_ms: string, before_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.search_messages', description: '在已验证消息范围内做字面量搜索', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, username: string, sender_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.list_search_senders', description: '在有界搜索结果中统计发送人分布', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, username: string, limit: { type: 'integer', minimum: 1, maximum: 20 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_message_around', description: '读取指定消息前后的有界上下文', inputSchema: { type: 'object', required: ['username', 'anchor_id'], properties: { account_id: string, username: string, anchor_id: string, before: { type: 'integer', minimum: 0, maximum: 50 }, after: { type: 'integer', minimum: 0, maximum: 50 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_message_anchor', description: '读取会话第一条消息或指定日期的第一条消息', inputSchema: { type: 'object', required: ['username', 'kind'], properties: { account_id: string, username: string, kind: { type: 'string', enum: ['first', 'day'] }, date: { type: 'string' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_daily_message_counts', description: '读取指定会话某月的每日消息数', inputSchema: { type: 'object', required: ['username', 'month'], properties: { account_id: string, username: string, month: { type: 'string' }, utc_offset_minutes: { type: 'integer', minimum: -720, maximum: 840 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.moments.list_timeline', description: '读取独立 moments.db synthetic fixture 的朋友圈时间线；不兼容真实微信 SnsTimeLine/snsmessage schema', inputSchema: { type: 'object', properties: { account_id: string, username: string, keyword: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, offset: { type: 'integer', minimum: 0 }, ascending: { type: 'boolean' }, from_unix_ms: string, to_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.moments.list_users', description: '按作者聚合独立 moments.db synthetic fixture；不补真实微信联系人资料', inputSchema: { type: 'object', properties: { account_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.moments.day_counts', description: '读取独立 moments.db synthetic fixture 的本地日计数；日期区间为半开区间且不兼容真实微信朋友圈 schema', inputSchema: { type: 'object', required: ['from_date', 'to_date'], properties: { account_id: string, username: string, from_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, to_date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, utc_offset_minutes: { type: 'integer', minimum: -840, maximum: 840 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.moments.start_export', description: '启动独立 moments.db synthetic fixture 的 metadata-only 导出任务；不兼容真实朋友圈媒体或原生导出格式', inputSchema: { type: 'object', required: ['format', 'output_directory'], properties: { account_id: string, format: { type: 'string', enum: ['json', 'markdown', 'html', 'txt'] }, output_directory: string, usernames: { type: 'array', items: string, maxItems: 500, uniqueItems: true }, keyword: string, start_time_unix_ms: string, end_time_unix_ms: string, media_kinds: { type: 'array', items: { type: 'string', enum: ['image', 'video', 'live_photo'] }, maxItems: 3, uniqueItems: true }, utc_offset_minutes: { type: 'integer', minimum: -720, maximum: 840 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.moments.watch_export', description: '读取独立 synthetic moments 导出任务状态；任务结果只包含 metadata-only synthetic 文件', inputSchema: { type: 'object', required: ['job_id'], properties: { account_id: string, job_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.moments.cancel_export', description: '取消仍在运行的独立 synthetic moments 导出任务', inputSchema: { type: 'object', required: ['job_id'], properties: { account_id: string, job_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.favorites.list_items', description: '读取独立 favorite.db synthetic fixture 的收藏列表；不兼容真实微信收藏库 schema 或媒体 token', inputSchema: { type: 'object', properties: { account_id: string, type: { type: 'integer', minimum: -1, maximum: 2147483647 }, query: { type: 'string', maxLength: 512 }, tag_id: { type: 'string', pattern: '^(?:0|[1-9][0-9]*)$' }, limit: { type: 'integer', minimum: 1, maximum: 500 }, offset: { type: 'integer', minimum: 0 }, ascending: { type: 'boolean' }, include_type_counts: { type: 'boolean' }, include_media: { type: 'boolean', const: false }, skip_source_context: { type: 'boolean' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.favorites.list_media_slots', description: '读取独立 __alpha_favorite_media_v1 合成表中的收藏媒体槽位；不兼容真实微信收藏媒体 schema', inputSchema: { type: 'object', required: ['favorite_id'], properties: { account_id: string, favorite_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.favorites.resolve_media', description: '解析独立收藏媒体 token 并校验本地 media-index；只返回合成内容地址结果', inputSchema: { type: 'object', required: ['token'], properties: { account_id: string, token: { type: 'string', pattern: '^fav1_[0-9a-f]{32}$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha.chat.export_capabilities', description: '返回独立后端已验证的只读会话导出能力；不代表原 Alpha/native formatter 兼容', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha.chat.export_stats', description: '返回指定已验证会话的消息总数、类别计数及首末时间；统计来自独立 DTO', inputSchema: { type: 'object', required: ['conversation_ids'], properties: { account_id: string, conversation_ids: { type: 'array', minItems: 1, maxItems: 100, items: string, uniqueItems: true }, refresh: { type: 'boolean' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.list', description: '列出独立本地定时导出计划；不兼容官方 Alpha 计划服务', inputSchema: { type: 'object', properties: { account_id: string, include_disabled: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.get', description: '读取独立本地定时导出计划；不兼容官方 Alpha 计划服务', inputSchema: { type: 'object', required: ['schedule_id'], properties: { account_id: string, schedule_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.save', description: '创建或替换独立本地定时导出计划，使用更新版本 CAS；不兼容官方 Alpha 计划服务', inputSchema: { type: 'object', required: ['mode', 'plan'], properties: { account_id: string, mode: { type: 'string', enum: ['create', 'replace'] }, expected_updated_at_unix_ms: string, plan: { type: 'object' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.delete', description: '按更新版本删除独立本地定时导出计划；不兼容官方 Alpha 计划服务', inputSchema: { type: 'object', required: ['schedule_id', 'expected_updated_at_unix_ms'], properties: { account_id: string, schedule_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' }, expected_updated_at_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.run_now', description: '立即运行独立本地定时导出计划；沿用本地引擎重入检查', inputSchema: { type: 'object', required: ['schedule_id', 'expected_updated_at_unix_ms'], properties: { account_id: string, schedule_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' }, expected_updated_at_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.list_runs', description: '列出独立本地定时导出运行记录；不兼容官方 Alpha 历史语义', inputSchema: { type: 'object', properties: { account_id: string, schedule_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.get_run', description: '读取独立本地定时导出运行记录；不兼容官方 Alpha 历史语义', inputSchema: { type: 'object', required: ['run_id'], properties: { account_id: string, run_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.list_attempts', description: '列出独立本地定时导出尝试记录；不兼容官方 Alpha 历史语义', inputSchema: { type: 'object', properties: { account_id: string, schedule_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' }, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.get_attempt', description: '读取独立本地定时导出尝试记录；不兼容官方 Alpha 历史语义', inputSchema: { type: 'object', required: ['attempt_id'], properties: { account_id: string, attempt_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.schedules.retry_attempt', description: '按尝试版本重试独立本地定时导出；不兼容官方 Alpha 历史语义', inputSchema: { type: 'object', required: ['attempt_id', 'expected_revision'], properties: { account_id: string, attempt_id: { type: 'string', pattern: '^[0-9a-f-]{36}$' }, expected_revision: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.source.get_revision', description: '返回显式离线数据源的稳定 revision；不扫描用户目录或声称 native schema 兼容', inputSchema: { type: 'object', properties: { account_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.source.get_watch_targets', description: '返回显式离线数据源的目录 watcher 目标；路径和权限由独立引擎校验', inputSchema: { type: 'object', properties: { account_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.get_message_raw', description: '读取一条已验证消息的原始 DTO 字段（不含数据库密钥和未验证 XML）', inputSchema: { type: 'object', required: ['username'], properties: { account_id: string, username: string, message_id: string, server_id: string, local_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha.analysis.start', description: '启动已验证消息 DTO 的有界聚合分析任务；仅支持 scope 1–4，报告为独立算法结果', inputSchema: { type: 'object', required: ['scope'], properties: { account_id: string, scope: { type: 'integer', enum: [1, 2, 3, 4] }, conversation_id: string, excluded_conversation_ids: { type: 'array', items: string, maxItems: 500, uniqueItems: true }, from_unix_ms: string, to_unix_ms: string, utc_offset_minutes: { type: 'integer', minimum: -720, maximum: 840 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha.analysis.watch', description: '读取有界聚合分析任务状态；完成时返回已验证的独立报告 JSON', inputSchema: { type: 'object', required: ['analysis_id'], properties: { account_id: string, analysis_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha.analysis.cancel', description: '取消仍在运行的有界聚合分析任务', inputSchema: { type: 'object', required: ['analysis_id'], properties: { account_id: string, analysis_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.analytics.analyze_annual', description: '生成基于可发现会话和已验证消息 DTO 的年度基础统计；不兼容官方 wechat.analytics wrapped schema', inputSchema: { type: 'object', required: ['year'], properties: { account_id: string, year: { type: 'integer', minimum: 1970, maximum: 9999 }, utc_offset_minutes: { type: 'integer', minimum: -720, maximum: 840 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.analytics.analyze_conversation', description: '生成指定会话的关系基础统计；不兼容官方 wechat.analytics wrapped schema，NLP/朋友圈等字段保持空或 null', inputSchema: { type: 'object', required: ['conversation_id'], properties: { account_id: string, conversation_id: string, max_messages: { type: 'integer', minimum: 1, maximum: 500000 }, utc_offset_minutes: { type: 'integer', minimum: -720, maximum: 840 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.messages.get_source', description: '读取独立 source token 对应的已验证消息解码文本；不兼容原生 media1_ raw/XML source 或媒体文件', inputSchema: { type: 'object', required: ['conversation_id', 'message_id', 'source_token'], properties: { account_id: string, conversation_id: string, message_id: string, source_token: { type: 'string', pattern: '^independent1_[A-Za-z0-9_-]+$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.media.browse_conversation', description: '浏览指定会话的媒体/文件/链接消息元数据；不读取、解密、下载或播放媒体，不生成原生 media1 token', inputSchema: { type: 'object', required: ['conversation_id', 'category'], properties: { account_id: string, conversation_id: string, category: { type: 'string', enum: ['media', 'file', 'link'] }, sender_id: string, from_unix_ms: string, to_unix_ms: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.media.browse_account', description: '按账号可发现会话浏览媒体/图片/视频消息元数据；不读取、解密、下载或播放媒体，不生成原生 media1 token', inputSchema: { type: 'object', required: ['category'], properties: { account_id: string, category: { type: 'string', enum: ['media', 'image', 'video'] }, conversation_id: string, from_unix_ms: string, to_unix_ms: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.media.probe', description: '读取显式 v4 hardlink.db/media_*.db 的有界媒体元数据；不读取媒体字节、不播放、不生成 Alpha media1 token，结果始终 metadata-only', inputSchema: { type: 'object', properties: { account_id: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.media.decode_voice_playback', description: '解析独立 __alpha_voice_playback_v1 synthetic 映射并校验自有 WAV media-index；不兼容真实 VoiceInfo/SILK/native media cache', inputSchema: { type: 'object', required: ['media_id'], properties: { account_id: string, media_id: { type: 'string', pattern: '^[0-9a-f]{64}$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.mobile.get_overview', description: '组合返回已验证账号状态和会话摘要；不兼容官方 wechat.mobile.get_overview/native mobile snapshot schema', inputSchema: { type: 'object', properties: { account_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.export_conversation', description: '将已验证会话导出到本机新文件；ChatLab/SQL/WeClone 为独立后端的派生格式', inputSchema: { type: 'object', required: ['username', 'format', 'destination_path'], properties: { account_id: string, username: string, format: { type: 'string', enum: ['json', 'markdown', 'html', 'txt', 'xlsx', 'chatlab-json', 'chatlab-jsonl', 'sql', 'weclone'] }, destination_path: string, include_media: { type: 'boolean', const: false }, start_time_unix_ms: string, end_time_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.chat.export_media_metadata', description: '将已验证媒体消息的元数据导出到本机新文件；不读取、解密或播放媒体文件', inputSchema: { type: 'object', required: ['format', 'destination_path'], properties: { account_id: string, username: string, format: { type: 'string', enum: ['media-json', 'media-csv'] }, destination_path: string, start_time_unix_ms: string, end_time_unix_ms: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha.messages.search_page', description: '读取独立后端的跨会话搜索页', inputSchema: { type: 'object', required: ['query'], properties: { account_id: string, query: string, username: string, sender_id: string, limit: { type: 'integer', minimum: 1, maximum: 500 }, cursor: string }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.messages.resolve_search_hit', description: '按会话和 server_id 定位独立后端已验证消息；不兼容官方 alpha.messages.resolve_search_hit schema', inputSchema: { type: 'object', required: ['server_id'], oneOf: [{ required: ['conversation_id'] }, { required: ['username'] }], properties: { account_id: string, conversation_id: string, username: string, server_id: { type: 'string', pattern: '^[1-9][0-9]{0,19}$' } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.records.list_candidates', description: '读取从已验证消息 XML 派生的 partial/candidate 记录；不兼容原生 Alpha 记录库 schema', inputSchema: { type: 'object', required: ['category'], properties: { account_id: string, category: { type: 'string', enum: ['payments', 'friend_requests', 'revokes', 'calls'] }, query: string, ascending: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 1000 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'alpha-independent.records.list_recall_candidates', description: '分页读取从 __alpha_general_revokes 消息 XML 派生的撤回候选；不兼容原生 recall store，也不提供 writer', inputSchema: { type: 'object', required: ['conversation_id'], properties: { account_id: string, conversation_id: string, cursor: string, limit: { type: 'integer', minimum: 1, maximum: 100 } }, additionalProperties: false }, outputSchema: { type: 'object' } },
    { name: 'wechat.forensics.list_records', description: '读取已验证消息 XML 推导的 partial/candidate 记录（支付、好友申请、撤回、通话）；支持有界字面量查询及升降序分页', inputSchema: { type: 'object', required: ['category'], properties: { account_id: string, category: { type: 'string', enum: ['payments', 'friend_requests', 'revokes', 'calls'] }, query: string, ascending: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 1000 }, offset: { type: 'integer', minimum: 0 } }, additionalProperties: false }, outputSchema: { type: 'object' } }
  ];
}

// The official list_tools contract is a read-only catalog. Keep local file
// exporters and moments export jobs out of that catalog even though they are
// explicitly exposed by tools/list as independent adapter capabilities.
const LIST_TOOLS_EXCLUDED = new Set([
  'wechat.chat.export_conversation',
  'wechat.chat.export_media_metadata',
  'alpha-independent.moments.start_export',
  'alpha-independent.moments.watch_export',
  'alpha-independent.moments.cancel_export'
]);
function listToolsCatalog(packageName) {
  const prefix = packageName ? `${packageName}.` : '';
  return toolDefinitions()
    .filter(tool => !LIST_TOOLS_EXCLUDED.has(tool.name))
    .filter(tool => !packageName || tool.name.startsWith(prefix));
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
    if (pathname === '/api/v1/exports/formats') return { formats: ['json', 'markdown', 'html', 'txt', 'xlsx', 'chatlab-json', 'chatlab-jsonl', 'sql', 'weclone', 'media-json', 'media-csv', 'group-members-csv', 'group-members-json', 'group-members-html', 'group-members-xlsx'] };
    if (pathname === '/api/v1/exports') {
      if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const account = await selectedAccount(params);
      const conversation = text(oneAlias(params, ['conversation_id', 'conversationId', 'username', 'talker'], 'HTTP_API_CONVERSATION_AMBIGUOUS'), 1024, 'HTTP_API_CONVERSATION_INVALID');
      if (!conversation) throw new HttpAdapterError('HTTP_API_CONVERSATION_REQUIRED', 400);
      const destination = text(params.destination_path ?? params.destinationPath, 4096, 'HTTP_API_DESTINATION_INVALID');
      if (!destination) throw new HttpAdapterError('HTTP_API_DESTINATION_REQUIRED', 400);
      const format = text(params.format, 32, 'HTTP_API_FORMAT_INVALID');
      if (!format) throw new HttpAdapterError('HTTP_API_FORMAT_REQUIRED', 400);
      if (!['json', 'md', 'markdown', 'html', 'txt', 'xlsx', 'chatlab-json', 'chatlab-jsonl', 'sql', 'weclone'].includes(format.toLowerCase())) throw new HttpAdapterError('HTTP_API_FORMAT_UNSUPPORTED', 400);
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
    if (pathname === '/api/v1/export-capabilities') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      return exportCapabilitiesJson(await call('getChatExportCapabilities'));
    }
    if (pathname === '/api/v1/independent/source/revision') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      return sourceDiagnostics(await call('getDataRevision', { accountId: await selectedAccount(params) }));
    }
    if (pathname === '/api/v1/independent/source/watch-targets') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      return sourceDiagnostics(await call('getDataWatchTargets', { accountId: await selectedAccount(params) }));
    }
    // Scheduled exports are exposed only under the independent namespace.
    // These routes operate on the local, bounded schedule store and retain
    // the engine's CAS/retry checks; they are not aliases for Alpha's remote
    // schedule service.
    if (pathname === '/api/v1/independent/export-schedules') {
      const account = await selectedAccount(params);
      if (method === 'GET') {
        const includeDisabled = boolean(params.include_disabled ?? params.includeDisabled, 'HTTP_API_SCHEDULE_INCLUDE_DISABLED_INVALID') ?? false;
        const limit = integer(params.limit, 1, 100, 'HTTP_API_SCHEDULE_LIMIT_INVALID') ?? 100;
        return scheduleScope(await call('listChatExportSchedules', { accountId: account, includeDisabled, limit }));
      }
      if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const source = params.plan && typeof params.plan === 'object' ? params.plan : params;
      const modeValue = params.mode;
      const mode = modeValue === 'create' || modeValue === 1 ? 1 : modeValue === 'replace' || modeValue === 2 ? 2 : 0;
      if (!mode) throw new HttpAdapterError('HTTP_API_SCHEDULE_MODE_INVALID', 400);
      const expected = scheduleUint(params.expected_updated_at_unix_ms ?? params.expectedUpdatedAtUnixMs ?? 0, 'HTTP_API_SCHEDULE_REVISION_INVALID');
      return scheduleScope(await call('saveChatExportSchedule', { plan: schedulePlan(source, account), mode, expectedUpdatedAtUnixMs: expected ?? 0n }));
    }
    const scheduleMatch = /^\/api\/v1\/independent\/export-schedules\/([^/]+)$/.exec(pathname);
    if (scheduleMatch) {
      const scheduleId = schedulePathId(scheduleMatch[1], 'HTTP_API_SCHEDULE_ID_INVALID');
      const account = await selectedAccount(params);
      if (method === 'GET') return scheduleScope(await call('getChatExportSchedule', { accountId: account, scheduleId }));
      if (method === 'DELETE') {
        const expected = scheduleUint(params.expected_updated_at_unix_ms ?? params.expectedUpdatedAtUnixMs, 'HTTP_API_SCHEDULE_REVISION_INVALID', true);
        return scheduleScope(await call('deleteChatExportSchedule', { accountId: account, scheduleId, expectedUpdatedAtUnixMs: expected }));
      }
      if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const action = text(params.action, 32, 'HTTP_API_SCHEDULE_ACTION_INVALID');
      const expected = scheduleUint(params.expected_updated_at_unix_ms ?? params.expectedUpdatedAtUnixMs, 'HTTP_API_SCHEDULE_REVISION_INVALID', true);
      if (action === 'delete') return scheduleScope(await call('deleteChatExportSchedule', { accountId: account, scheduleId, expectedUpdatedAtUnixMs: expected }));
      if (action === 'run-now' || action === 'run_now') return scheduleScope(await call('runChatExportScheduleNow', { accountId: account, scheduleId, expectedUpdatedAtUnixMs: expected }));
      throw new HttpAdapterError('HTTP_API_SCHEDULE_ACTION_INVALID', 400);
    }
    const scheduleRunsMatch = /^\/api\/v1\/independent\/export-schedules\/([^/]+)\/(runs|attempts)$/.exec(pathname);
    if (pathname === '/api/v1/independent/export-runs' || pathname === '/api/v1/independent/export-attempts') {
      const account = await selectedAccount(params);
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const scheduleId = params.schedule_id ?? params.scheduleId;
      const limit = integer(params.limit, 1, 100, 'HTTP_API_HISTORY_LIMIT_INVALID') ?? 100;
      const methodName = pathname.endsWith('export-runs') ? 'listChatExportRuns' : 'listChatExportAttempts';
      return scheduleScope(await call(methodName, { accountId: account, ...(scheduleId === undefined || scheduleId === '' ? {} : { scheduleId: schedulePathId(scheduleId, 'HTTP_API_SCHEDULE_ID_INVALID') }), limit }));
    }
    if (scheduleRunsMatch) {
      const scheduleId = schedulePathId(scheduleRunsMatch[1], 'HTTP_API_SCHEDULE_ID_INVALID');
      const account = await selectedAccount(params);
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const limit = integer(params.limit, 1, 100, 'HTTP_API_HISTORY_LIMIT_INVALID') ?? 100;
      const methodName = scheduleRunsMatch[2] === 'runs' ? 'listChatExportRuns' : 'listChatExportAttempts';
      return scheduleScope(await call(methodName, { accountId: account, scheduleId, limit }));
    }
    const runMatch = /^\/api\/v1\/independent\/export-runs\/([^/]+)$/.exec(pathname);
    if (runMatch) {
      const runId = schedulePathId(runMatch[1], 'HTTP_API_RUN_ID_INVALID');
      const account = await selectedAccount(params);
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      return scheduleScope(await call('getChatExportRun', { accountId: account, runId }));
    }
    const attemptMatch = /^\/api\/v1\/independent\/export-attempts\/([^/]+)(\/retry)?$/.exec(pathname);
    if (attemptMatch) {
      const attemptId = schedulePathId(attemptMatch[1], 'HTTP_API_ATTEMPT_ID_INVALID');
      const account = await selectedAccount(params);
      if (attemptMatch[2]) {
        if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
        const expected = scheduleUint(params.expected_revision ?? params.expectedRevision, 'HTTP_API_ATTEMPT_REVISION_INVALID', true);
        return scheduleScope(await call('retryChatExportAttempt', { accountId: account, attemptId, expectedRevision: expected }));
      }
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      return scheduleScope(await call('getChatExportAttempt', { accountId: account, attemptId }));
    }
    const account = await selectedAccount(params);
    if (pathname === '/api/v1/export-stats') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const raw = params.conversation_ids ?? params.conversationIds ?? params.conversation_id ?? params.conversationId;
      if (raw === undefined || raw === '') throw new HttpAdapterError('HTTP_API_CONVERSATIONS_REQUIRED', 400);
      const conversationIds = (Array.isArray(raw) ? raw : String(raw).split(',')).map(value => text(value, 1024, 'HTTP_API_CONVERSATION_INVALID'));
      if (!conversationIds.length || conversationIds.some(value => !value) || conversationIds.length > 100 || new Set(conversationIds).size !== conversationIds.length) throw new HttpAdapterError('HTTP_API_CONVERSATIONS_INVALID', 400);
      const refresh = boolean(params.refresh, 'HTTP_API_REFRESH_INVALID');
      return snakeKeys(await call('getChatExportStats', { accountId: account, conversationIds, ...(refresh === undefined ? {} : { refresh }) }));
    }
    if (pathname === '/api/v1/analysis') {
      if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const scope = integer(params.scope, 1, 4, 'HTTP_API_ANALYSIS_SCOPE_INVALID');
      if (scope === undefined) throw new HttpAdapterError('HTTP_API_ANALYSIS_SCOPE_REQUIRED', 400);
      const conversation = text(oneAlias(params, ['conversation_id', 'conversationId'], 'HTTP_API_ANALYSIS_CONVERSATION_AMBIGUOUS'), 1024, 'HTTP_API_ANALYSIS_CONVERSATION_INVALID');
      const excludedValue = params.excluded_conversation_ids ?? params.excludedConversationIds;
      const excluded = excludedValue === undefined ? [] : excludedValue;
      if (!Array.isArray(excluded) || excluded.length > 500 || new Set(excluded).size !== excluded.length || excluded.some(value => typeof value !== 'string' || !value.length || value.length > 1024 || value.includes('\0'))) throw new HttpAdapterError('HTTP_API_ANALYSIS_EXCLUDED_INVALID', 400);
      const from = int64(params.from_unix_ms ?? params.fromUnixMs, 'HTTP_API_ANALYSIS_TIME_INVALID');
      const to = int64(params.to_unix_ms ?? params.toUnixMs, 'HTTP_API_ANALYSIS_TIME_INVALID');
      if (from !== undefined && from < 0n || to !== undefined && to < 0n || from !== undefined && to !== undefined && from >= to) throw new HttpAdapterError('HTTP_API_ANALYSIS_TIME_INVALID', 400);
      const utcOffset = integer(params.utc_offset_minutes ?? params.utcOffsetMinutes, -720, 840, 'HTTP_API_ANALYSIS_OFFSET_INVALID');
      const response = await call('startAggregateAnalysis', { accountId: account, scope, conversationId: conversation || '', excludedConversationIds: excluded, ...(from === undefined ? {} : { fromUnixMs: from }), ...(to === undefined ? {} : { toUnixMs: to }), ...(utcOffset === undefined ? {} : { utcOffsetMinutes: utcOffset }) });
      return snakeKeys(response);
    }
    if (pathname === '/api/v1/independent/message-source') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const conversation = text(oneAlias(params, ['conversation_id', 'conversationId', 'username', 'talker'], 'HTTP_API_CONVERSATION_AMBIGUOUS'), 1024, 'HTTP_API_MESSAGE_SOURCE_CONVERSATION_INVALID');
      if (!conversation) throw new HttpAdapterError('HTTP_API_MESSAGE_SOURCE_CONVERSATION_REQUIRED', 400);
      const message = text(params.message_id ?? params.messageId, 2048, 'HTTP_API_MESSAGE_SOURCE_MESSAGE_INVALID');
      if (!message) throw new HttpAdapterError('HTTP_API_MESSAGE_SOURCE_MESSAGE_REQUIRED', 400);
      const sourceToken = independentSourceToken(params.source_token ?? params.sourceToken, 'HTTP_API_MESSAGE_SOURCE_TOKEN_INVALID');
      if (!sourceToken) throw new HttpAdapterError('HTTP_API_MESSAGE_SOURCE_TOKEN_REQUIRED', 400);
      if (!/^independent1_[A-Za-z0-9_-]+$/.test(sourceToken)) throw new HttpAdapterError('HTTP_API_MESSAGE_SOURCE_TOKEN_INVALID', 400);
      const response = await call('getMessageSource', { accountId: account, conversationId: conversation, messageId: message, sourceToken });
      return snakeKeys({ ...response, conversationId: conversation, messageId: message, scope: 'verified-message-text', complete: false, nativeSchemaSupported: false, rawAvailable: false, mediaReady: false });
    }
    if (pathname === '/api/v1/independent/media/probe') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      if (typeof engine.probeMedia !== 'function') throw new HttpAdapterError('HTTP_API_MEDIA_PROBE_UNSUPPORTED', 501);
      const response = await engine.probeMedia(await selectedAccount(params));
      return snakeKeys({ ...response, scope: 'explicit-v4-media-database-probe', complete: response.status === 'ready', mediaReady: false, metadataOnly: true, nativeSchemaSupported: false });
    }
    if (pathname === '/api/v1/independent/media/voice-playback') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const mediaId = text(params.media_id ?? params.mediaId, 64, 'HTTP_API_VOICE_MEDIA_ID_INVALID');
      if (!mediaId || !/^[0-9a-f]{64}$/.test(mediaId)) throw new HttpAdapterError('HTTP_API_VOICE_MEDIA_ID_INVALID', 400);
      const response = await call('decodeVoicePlayback', { accountId: account, mediaId });
      return snakeKeys({ ...response, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_voice_playback_v1', scope: 'synthetic-voice-playback', mediaReady: true });
    }
    const momentExportMatch = /^\/api\/v1\/independent\/moments\/exports\/([^/]+)(\/cancel)?$/.exec(pathname);
    if (pathname === '/api/v1/independent/moments/exports') {
      if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const outputDirectory = text(params.output_directory ?? params.outputDirectory, 4096, 'HTTP_API_OUTPUT_DIRECTORY_INVALID');
      if (!outputDirectory) throw new HttpAdapterError('HTTP_API_OUTPUT_DIRECTORY_REQUIRED', 400);
      const format = text(params.format, 32, 'HTTP_API_FORMAT_INVALID')?.toLowerCase();
      if (!format) throw new HttpAdapterError('HTTP_API_FORMAT_REQUIRED', 400);
      if (!['json', 'markdown', 'html', 'txt'].includes(format)) throw new HttpAdapterError('HTTP_API_FORMAT_UNSUPPORTED', 400);
      const usernames = params.usernames === undefined ? [] : params.usernames;
      if (!Array.isArray(usernames) || usernames.length > 500 || new Set(usernames).size !== usernames.length || usernames.some(value => typeof value !== 'string' || !value || value.length > 256 || value.includes('\0'))) throw new HttpAdapterError('HTTP_API_MOMENTS_AUTHORS_INVALID', 400);
      const keyword = text(params.keyword ?? '', 512, 'HTTP_API_MOMENTS_KEYWORD_INVALID');
      if (keyword.trim() !== keyword) throw new HttpAdapterError('HTTP_API_MOMENTS_KEYWORD_INVALID', 400);
      const mediaKinds = params.media_kinds ?? params.mediaKinds ?? [];
      if (!Array.isArray(mediaKinds) || mediaKinds.length > 3 || new Set(mediaKinds).size !== mediaKinds.length || mediaKinds.some(value => !['image', 'video', 'live_photo'].includes(value))) throw new HttpAdapterError('HTTP_API_MOMENTS_MEDIA_KINDS_INVALID', 400);
      if (mediaKinds.length) throw new HttpAdapterError('HTTP_API_MOMENTS_MEDIA_UNAVAILABLE', 400);
      const start = int64(params.start_time_unix_ms ?? params.startTimeUnixMs, 'HTTP_API_MOMENTS_TIME_INVALID');
      const end = int64(params.end_time_unix_ms ?? params.endTimeUnixMs, 'HTTP_API_MOMENTS_TIME_INVALID');
      if (start !== undefined && start < 0n || end !== undefined && end < 0n || start !== undefined && end !== undefined && start > end) throw new HttpAdapterError('HTTP_API_MOMENTS_TIME_INVALID', 400);
      const utcOffset = integer(params.utc_offset_minutes ?? params.utcOffsetMinutes, -720, 840, 'HTTP_API_MOMENTS_OFFSET_INVALID') ?? 0;
      const account = await selectedAccount(params);
      const response = await call('startMomentExport', { accountId: account, format, outputDirectory, usernames, keyword, mediaKinds, utcOffsetMinutes: utcOffset, ...(start === undefined ? {} : { startTimeUnixMs: start }), ...(end === undefined ? {} : { endTimeUnixMs: end }) });
      return snakeKeys({ ...response, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_moments_v1', sourceDatabase: 'moments.db', sourceTable: '__alpha_moments_v1' });
    }
    if (momentExportMatch) {
      let jobId;
      try { jobId = decodeURIComponent(momentExportMatch[1]); } catch { throw new HttpAdapterError('HTTP_API_MOMENTS_JOB_INVALID', 400); }
      jobId = text(jobId, 128, 'HTTP_API_MOMENTS_JOB_INVALID');
      if (!jobId) throw new HttpAdapterError('HTTP_API_MOMENTS_JOB_REQUIRED', 400);
      const account = await selectedAccount(params);
      if (momentExportMatch[2]) {
        if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
        const response = await call('cancelChatExport', { accountId: account, jobId });
        return snakeKeys({ ...response, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_moments_v1', sourceDatabase: 'moments.db', sourceTable: '__alpha_moments_v1' });
      }
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const response = await call('watchChatExport', { accountId: account, jobId });
      return snakeKeys({ ...response, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_moments_v1', sourceDatabase: 'moments.db', sourceTable: '__alpha_moments_v1' });
    }
    if (pathname === '/api/v1/sns/timeline') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const username = text(oneAlias(params, ['username', 'author', 'author_id'], 'HTTP_API_MOMENTS_AUTHOR_AMBIGUOUS'), 1024, 'HTTP_API_MOMENTS_AUTHOR_INVALID');
      const keyword = text(params.keyword ?? params.query, 512, 'HTTP_API_MOMENTS_KEYWORD_INVALID');
      if (keyword !== undefined && keyword.trim() !== keyword) throw new HttpAdapterError('HTTP_API_MOMENTS_KEYWORD_INVALID', 400);
      const from = int64(params.from_unix_ms ?? params.fromUnixMs, 'HTTP_API_MOMENTS_TIME_INVALID');
      const to = int64(params.to_unix_ms ?? params.toUnixMs, 'HTTP_API_MOMENTS_TIME_INVALID');
      if (from !== undefined && from < 0n || to !== undefined && to < 0n || from !== undefined && to !== undefined && to < from) throw new HttpAdapterError('HTTP_API_MOMENTS_TIME_INVALID', 400);
      const ascending = boolean(params.ascending, 'HTTP_API_MOMENTS_ORDER_INVALID');
      const response = await call('listMoments', {
        accountId: account,
        limit: integer(params.limit, 1, 500, 'HTTP_API_LIMIT_INVALID') ?? 100,
        offset: integer(params.offset, 0, 100000, 'HTTP_API_OFFSET_INVALID') ?? 0,
        ...(ascending === undefined ? {} : { ascending }),
        ...(username === undefined ? {} : { username }),
        ...(keyword === undefined ? {} : { keyword }),
        ...(from === undefined ? {} : { startTimeUnixMs: from }),
        ...(to === undefined ? {} : { endTimeUnixMs: to })
      });
      const page = response.response || response;
      return snakeKeys({ ...page, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_moments_v1', sourceDatabase: page.sourceDatabase || 'moments.db', sourceTable: page.sourceTable || '__alpha_moments_v1' });
    }
    if (pathname === '/api/v1/sns/usernames') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const response = await call('listMomentAuthors', { accountId: account, limit: integer(params.limit, 1, 500, 'HTTP_API_LIMIT_INVALID') ?? 100 });
      const page = response.response || response;
      return snakeKeys({ ...page, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_moments_v1', sourceDatabase: page.sourceDatabase || 'moments.db', sourceTable: page.sourceTable || '__alpha_moments_v1' });
    }
    if (pathname === '/api/v1/sns/day-counts') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const fromDate = text(params.from_date ?? params.fromDate, 10, 'HTTP_API_MOMENTS_DATE_INVALID');
      const toDate = text(params.to_date ?? params.toDate, 10, 'HTTP_API_MOMENTS_DATE_INVALID');
      if (!fromDate || !toDate) throw new HttpAdapterError('HTTP_API_MOMENTS_DATE_REQUIRED', 400);
      const from = mcpDate(fromDate, 'HTTP_API_MOMENTS_DATE_INVALID');
      const to = mcpDate(toDate, 'HTTP_API_MOMENTS_DATE_INVALID');
      const username = text(oneAlias(params, ['username', 'author', 'author_id'], 'HTTP_API_MOMENTS_AUTHOR_AMBIGUOUS'), 1024, 'HTTP_API_MOMENTS_AUTHOR_INVALID');
      const utcOffset = integer(params.utc_offset_minutes ?? params.utcOffsetMinutes, -840, 840, 'HTTP_API_MOMENTS_OFFSET_INVALID') ?? 0;
      if (to <= from || to - from > 366n * 86400000n) throw new HttpAdapterError('HTTP_API_MOMENTS_DATE_RANGE_INVALID', 400);
      const offsetMillis = BigInt(utcOffset) * 60000n;
      const fromUtc = from - offsetMillis;
      const toUtc = to - offsetMillis;
      if (fromUtc < 0n || toUtc <= fromUtc) throw new HttpAdapterError('HTTP_API_MOMENTS_DATE_RANGE_INVALID', 400);
      const response = await call('getMomentDayCounts', { accountId: account, fromUnixMs: fromUtc, toUnixMs: toUtc, utcOffsetMinutes: utcOffset, ...(username === undefined ? {} : { username }) });
      const page = response.response || response;
      return snakeKeys({ ...page, fromDate, toDate, utcOffsetMinutes: utcOffset, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_moments_v1', sourceDatabase: 'moments.db', sourceTable: '__alpha_moments_v1' });
    }
    const favoriteSlotsMatch = /^\/api\/v1\/favorites\/([^/]+)\/media$/.exec(pathname);
    if (favoriteSlotsMatch) {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      let favoriteId; try { favoriteId = decodeURIComponent(favoriteSlotsMatch[1]); } catch { throw new HttpAdapterError('HTTP_API_FAVORITES_ID_INVALID', 400); }
      favoriteId = text(favoriteId, 1024, 'HTTP_API_FAVORITES_ID_INVALID');
      const response = await call('listFavoriteMediaSlots', { accountId: account, favoriteId });
      const page = response.media || response;
      return snakeKeys({ ...page, status: response.status || 'ready', syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_favorite_media_v1', sourceDatabase: 'favorite.db', sourceTable: '__alpha_favorite_media_v1' });
    }
    const favoriteMediaMatch = /^\/api\/v1\/favorites\/media\/([^/]+)$/.exec(pathname);
    if (favoriteMediaMatch) {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      let token; try { token = decodeURIComponent(favoriteMediaMatch[1]); } catch { throw new HttpAdapterError('HTTP_API_FAVORITES_TOKEN_INVALID', 400); }
      if (!/^fav1_[0-9a-f]{32}$/.test(token)) throw new HttpAdapterError('HTTP_API_FAVORITES_TOKEN_INVALID', 400);
      const response = await call('resolveFavoriteMedia', { accountId: account, token });
      return snakeKeys({ ...response, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_favorite_media_v1', sourceDatabase: 'favorite.db', sourceTable: '__alpha_favorite_media_v1', mediaIndex: true });
    }
    if (pathname === '/api/v1/favorites') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const type = integer(params.type, -1, 0x7fffffff, 'HTTP_API_FAVORITES_TYPE_INVALID');
      const query = text(params.query ?? params.keyword, 512, 'HTTP_API_FAVORITES_QUERY_INVALID');
      if (query !== undefined && query.trim() !== query) throw new HttpAdapterError('HTTP_API_FAVORITES_QUERY_INVALID', 400);
      const limit = integer(params.limit, 1, 500, 'HTTP_API_LIMIT_INVALID') ?? 100;
      const offset = integer(params.offset, 0, 100000, 'HTTP_API_OFFSET_INVALID') ?? 0;
      const ascending = boolean(params.ascending, 'HTTP_API_FAVORITES_ORDER_INVALID');
      const includeTypeCounts = boolean(params.include_type_counts ?? params.includeTypeCounts, 'HTTP_API_FAVORITES_COUNTS_INVALID');
      const includeMedia = boolean(params.include_media ?? params.includeMedia, 'HTTP_API_FAVORITES_MEDIA_INVALID');
      if (includeMedia === true) throw new HttpAdapterError('HTTP_API_FAVORITES_MEDIA_UNAVAILABLE', 400);
      const skipSourceContext = boolean(params.skip_source_context ?? params.skipSourceContext, 'HTTP_API_FAVORITES_SOURCE_INVALID');
      const rawTagId = params.tag_id ?? params.tagId;
      let tagId;
      if (rawTagId !== undefined && rawTagId !== '') {
        if (typeof rawTagId === 'number' && (!Number.isSafeInteger(rawTagId) || rawTagId < 0)) throw new HttpAdapterError('HTTP_API_FAVORITES_TAG_INVALID', 400);
        if (typeof rawTagId !== 'string' && typeof rawTagId !== 'number' || !/^(?:0|[1-9][0-9]*)$/.test(String(rawTagId)) || String(rawTagId).length > 20) throw new HttpAdapterError('HTTP_API_FAVORITES_TAG_INVALID', 400);
        try { tagId = BigInt(String(rawTagId)); } catch { throw new HttpAdapterError('HTTP_API_FAVORITES_TAG_INVALID', 400); }
        if (tagId > (1n << 64n) - 1n) throw new HttpAdapterError('HTTP_API_FAVORITES_TAG_INVALID', 400);
      }
      const response = await call('listFavorites', {
        accountId: account,
        limit,
        offset,
        ...(type === undefined ? {} : { type }),
        ...(query === undefined ? {} : { query }),
        ...(ascending === undefined ? {} : { ascending }),
        ...(includeTypeCounts === undefined ? {} : { includeTypeCounts }),
        ...(tagId === undefined ? {} : { tagId }),
        ...(skipSourceContext === undefined ? {} : { skipSourceContext })
      });
      const page = response.response || response;
      return snakeKeys({ ...page, syntheticOnly: true, nativeSchemaSupported: false, schema: '__alpha_favorites_v1', mediaSupported: false, sourceDatabase: page.sourceDatabase || 'favorite.db', sourceTable: page.sourceTable || '__alpha_favorites_v1' });
    }
    const analysisWatch = /^\/api\/v1\/analysis\/([^/]+)(\/cancel)?$/.exec(pathname);
    if (analysisWatch) {
      let analysisId;
      try { analysisId = decodeURIComponent(analysisWatch[1]); } catch { throw new HttpAdapterError('HTTP_API_ANALYSIS_ID_INVALID', 400); }
      analysisId = text(analysisId, 128, 'HTTP_API_ANALYSIS_ID_INVALID');
      if (!analysisId) throw new HttpAdapterError('HTTP_API_ANALYSIS_ID_INVALID', 400);
      if (analysisWatch[2]) {
        if (method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
        const response = await call('cancelAggregateAnalysis', { analysisId });
        return { canceled: response.canceled === true };
      }
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      return aggregateSnapshot(await call('watchAggregateAnalysis', { analysisId }));
    }
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
    if (pathname === '/api/v1/independent/group-pins') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const room = text(oneAlias(params, ['chatroom_id', 'chatroomId', 'username'], 'HTTP_API_CONVERSATION_AMBIGUOUS'), 256, 'HTTP_API_CHATROOM_INVALID');
      if (!room || !room.endsWith('@chatroom')) throw new HttpAdapterError('HTTP_API_CHATROOM_INVALID', 400);
      const response = await call('listGeneral', { accountId: account, tableName: '__alpha_group_pins', query: room, limit: integer(params.limit, 1, 1000, 'HTTP_API_LIMIT_INVALID') ?? 100, offset: integer(params.offset, 0, 100000, 'HTTP_API_OFFSET_INVALID') ?? 0, ascending: true });
      const pageResponse = response.response || {};
      const items = (pageResponse.items || []).map(item => {
        const fields = Object.fromEntries((item.fields || []).map(field => [field.name, field.value]));
        return {
          id: item.id || '',
          seq: fields.seq || '',
          sender_id: fields.senderId || item.actor || '',
          server_id: fields.serverId || '',
          local_type: fields.localType || '',
          preview: fields.preview || item.content || '',
          pinned_by: fields.pinnedBy || ''
        };
      });
      return {
        chatroom_id: room,
        items,
        source_database: pageResponse.sourceDatabase || '',
        source_table: '__alpha_group_pins_v1',
        schema: '__alpha_group_pins_v1',
        synthetic_only: true,
        native_schema_supported: false,
        complete: false,
        writer: false
      };
    }
    if (pathname === '/api/v1/records' || pathname === '/api/v1/independent/records') {
      if (pathname === '/api/v1/independent/records' && method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const category = text(params.category, 32, 'HTTP_API_RECORD_CATEGORY_INVALID');
      const tables = { payments: '__alpha_general_payments', friend_requests: '__alpha_general_friend_requests', revokes: '__alpha_general_revokes', calls: '__alpha_general_calls' };
      if (!Object.hasOwn(tables, category)) throw new HttpAdapterError('HTTP_API_RECORD_CATEGORY_INVALID', 400);
      const query = text(params.query ?? '', 512, 'HTTP_API_RECORD_QUERY_INVALID');
      if (Buffer.byteLength(query, 'utf8') > 512 || query !== query.trim() || /[\u0000-\u001f\u007f]/.test(query)) throw new HttpAdapterError('HTTP_API_RECORD_QUERY_INVALID', 400);
      const ascending = boolean(params.ascending, 'HTTP_API_RECORD_ORDER_INVALID') ?? false;
      const response = await call('listGeneral', { accountId: account, tableName: tables[category], query, limit: integer(params.limit, 1, 1000, 'HTTP_API_LIMIT_INVALID') ?? 100, offset: integer(params.offset, 0, 20000, 'HTTP_API_OFFSET_INVALID') ?? 0, ascending });
      const page = response.response || response;
      return snakeKeys({ category, tableName: tables[category], query, ascending, partial: true, candidate: true, ...(pathname === '/api/v1/independent/records' ? { scope: 'alpha-independent-message-derived-candidates', nativeSchemaSupported: false } : {}), items: page.items || [], sourceDatabase: page.sourceDatabase || '', sourceTable: page.sourceTable || '', ...(page.totalCount !== undefined ? { totalCount: page.totalCount } : {}) });
    }
    if (pathname === '/api/v1/independent/recall-records') {
      if (method !== 'GET') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      const account = await selectedAccount(params);
      const conversation = text(oneAlias(params, ['conversation_id', 'conversationId', 'username', 'talker'], 'HTTP_API_CONVERSATION_AMBIGUOUS'), 1024, 'HTTP_API_MESSAGE_RECALL_CONVERSATION_INVALID');
      if (!conversation) throw new HttpAdapterError('HTTP_API_MESSAGE_RECALL_CONVERSATION_REQUIRED', 400);
      const rawCursor = params.cursor ?? '';
      const recallCursor = text(rawCursor, 1024, 'HTTP_API_MESSAGE_RECALL_CURSOR_INVALID');
      if (!/^[A-Za-z0-9_-]*$/.test(recallCursor)) throw new HttpAdapterError('HTTP_API_MESSAGE_RECALL_CURSOR_INVALID', 400);
      const limit = integer(params.limit, 1, 100, 'HTTP_API_LIMIT_INVALID') ?? 20;
      const response = await call('listMessageRecallRecords', { accountId: account, conversationId: conversation, cursor: recallCursor, limit });
      return snakeKeys({ ...response, scope: 'alpha-independent-message-derived-candidates', partial: true, candidate: true, nativeSchemaSupported: false, nativeRecallStore: false, writer: false, sourceTable: '__alpha_general_revokes' });
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
      'wechat.core.get_status': [], 'wechat.core.list_tools': ['package'], 'wechat.core.list_accounts': [], 'wechat.core.get_account_info': ['account_id'],
      'wechat.contacts.list_contacts': ['account_id', 'keyword', 'limit', 'offset'], 'wechat.contacts.list_directory': ['account_id', 'categories', 'query', 'limit', 'offset'], 'wechat.contacts.resolve_contact': ['account_id', 'query', 'limit'], 'wechat.contacts.get_contact_profile': ['account_id', 'username', 'common_group_limit'],
      'wechat.contacts.get_group_members': ['account_id', 'chatroom_id', 'limit', 'offset'], 'alpha-independent.groups.list_pinned_messages': ['account_id', 'chatroom_id', 'limit', 'offset'], 'wechat.chat.list_sessions': ['account_id', 'limit', 'cursor'],
      'wechat.chat.resolve_session': ['account_id', 'query', 'limit'], 'wechat.chat.get_messages': ['account_id', 'username', 'limit', 'cursor', 'ascending', 'after_unix_ms', 'before_unix_ms'],
      'wechat.chat.search_messages': ['account_id', 'query', 'username', 'sender_id', 'limit', 'cursor'], 'alpha.messages.search_page': ['account_id', 'query', 'username', 'sender_id', 'limit', 'cursor'], 'alpha-independent.messages.resolve_search_hit': ['account_id', 'conversation_id', 'username', 'server_id'], 'alpha-independent.messages.get_source': ['account_id', 'conversation_id', 'message_id', 'source_token'], 'alpha.analysis.start': ['account_id', 'scope', 'conversation_id', 'excluded_conversation_ids', 'from_unix_ms', 'to_unix_ms', 'utc_offset_minutes'], 'alpha.analysis.watch': ['account_id', 'analysis_id'], 'alpha.analysis.cancel': ['account_id', 'analysis_id'], 'alpha-independent.analytics.analyze_annual': ['account_id', 'year', 'utc_offset_minutes'], 'alpha-independent.analytics.analyze_conversation': ['account_id', 'conversation_id', 'max_messages', 'utc_offset_minutes'], 'alpha-independent.media.browse_conversation': ['account_id', 'conversation_id', 'category', 'sender_id', 'from_unix_ms', 'to_unix_ms', 'limit', 'cursor'], 'alpha-independent.media.browse_account': ['account_id', 'category', 'conversation_id', 'from_unix_ms', 'to_unix_ms', 'limit', 'cursor'], 'alpha-independent.media.probe': ['account_id'], 'alpha-independent.media.decode_voice_playback': ['account_id', 'media_id'], 'alpha-independent.mobile.get_overview': ['account_id', 'limit', 'cursor'], 'wechat.forensics.list_records': ['account_id', 'category', 'query', 'ascending', 'limit', 'offset'],
      'alpha-independent.records.list_candidates': ['account_id', 'category', 'query', 'ascending', 'limit', 'offset'], 'alpha-independent.records.list_recall_candidates': ['account_id', 'conversation_id', 'cursor', 'limit'],
      'wechat.chat.list_search_senders': ['account_id', 'query', 'username', 'limit'], 'wechat.chat.get_message_around': ['account_id', 'username', 'anchor_id', 'before', 'after'],
      'wechat.chat.get_message_anchor': ['account_id', 'username', 'kind', 'date'], 'wechat.chat.get_daily_message_counts': ['account_id', 'username', 'month', 'utc_offset_minutes'], 'alpha-independent.source.get_revision': ['account_id'], 'alpha-independent.source.get_watch_targets': ['account_id'], 'alpha-independent.moments.list_timeline': ['account_id', 'username', 'keyword', 'limit', 'offset', 'ascending', 'from_unix_ms', 'to_unix_ms'], 'alpha-independent.moments.list_users': ['account_id', 'limit'], 'alpha-independent.moments.day_counts': ['account_id', 'username', 'from_date', 'to_date', 'utc_offset_minutes'], 'alpha-independent.moments.start_export': ['account_id', 'format', 'output_directory', 'usernames', 'keyword', 'start_time_unix_ms', 'end_time_unix_ms', 'media_kinds', 'utc_offset_minutes'], 'alpha-independent.moments.watch_export': ['account_id', 'job_id'], 'alpha-independent.moments.cancel_export': ['account_id', 'job_id'], 'alpha-independent.favorites.list_items': ['account_id', 'type', 'query', 'tag_id', 'limit', 'offset', 'ascending', 'include_type_counts', 'include_media', 'skip_source_context'], 'alpha-independent.favorites.list_media_slots': ['account_id', 'favorite_id'], 'alpha-independent.favorites.resolve_media': ['account_id', 'token'], 'alpha-independent.schedules.list': ['account_id', 'include_disabled', 'limit'], 'alpha-independent.schedules.get': ['account_id', 'schedule_id'], 'alpha-independent.schedules.save': ['account_id', 'mode', 'expected_updated_at_unix_ms', 'plan'], 'alpha-independent.schedules.delete': ['account_id', 'schedule_id', 'expected_updated_at_unix_ms'], 'alpha-independent.schedules.run_now': ['account_id', 'schedule_id', 'expected_updated_at_unix_ms'], 'alpha-independent.schedules.list_runs': ['account_id', 'schedule_id', 'limit'], 'alpha-independent.schedules.get_run': ['account_id', 'run_id'], 'alpha-independent.schedules.list_attempts': ['account_id', 'schedule_id', 'limit'], 'alpha-independent.schedules.get_attempt': ['account_id', 'attempt_id'], 'alpha-independent.schedules.retry_attempt': ['account_id', 'attempt_id', 'expected_revision'], 'alpha.chat.export_capabilities': [], 'alpha.chat.export_stats': ['account_id', 'conversation_ids', 'refresh'], 'wechat.chat.get_message_raw': ['account_id', 'username', 'message_id', 'server_id', 'local_id'], 'wechat.chat.export_conversation': ['account_id', 'username', 'format', 'destination_path', 'include_media', 'start_time_unix_ms', 'end_time_unix_ms'], 'wechat.chat.export_media_metadata': ['account_id', 'username', 'format', 'destination_path', 'start_time_unix_ms', 'end_time_unix_ms']
    };
    if (Object.hasOwn(allowedArguments, name) && Object.keys(args).some(key => !allowedArguments[name].includes(key))) throw new HttpAdapterError('MCP_ARGUMENTS_INVALID', 400);
    let pathName, params = { ...args };
    if (name === 'wechat.core.list_tools') {
      const packageName = text(args.package, 64, 'MCP_PACKAGE_INVALID');
      if (packageName !== undefined && !/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/.test(packageName)) throw new HttpAdapterError('MCP_PACKAGE_INVALID', 400);
      const tools = listToolsCatalog(packageName);
      const result = {
        package: packageName || '',
        tools,
        count: tools.length,
        complete: false,
        scope: 'alpha-independent-readonly-adapter',
        native_schema_supported: false
      };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } else if (name === 'wechat.core.get_status') {
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
    else if (name === 'alpha-independent.groups.list_pinned_messages') { pathName = '/api/v1/independent/group-pins'; params.chatroom_id = args.chatroom_id; }
    else if (name === 'wechat.chat.list_sessions') pathName = '/api/v1/sessions';
    else if (name === 'wechat.chat.resolve_session') pathName = '/api/v1/sessions';
    else if (name === 'wechat.chat.get_messages') { pathName = '/api/v1/messages'; params.username = args.username; params.after_unix_ms = args.after_unix_ms; params.before_unix_ms = args.before_unix_ms; }
    else if (name === 'wechat.chat.search_messages' || name === 'alpha.messages.search_page') { pathName = '/api/v1/search'; params.query = args.query; params.username = args.username; }
    else if (name === 'alpha-independent.messages.resolve_search_hit') {
      const account = await selectedAccount(params);
      const conversation = oneAlias(args, ['conversation_id', 'username'], 'MCP_CONVERSATION_AMBIGUOUS');
      const conversationId = text(conversation, 1024, 'MCP_CONVERSATION_INVALID');
      if (!conversationId) throw new HttpAdapterError('MCP_CONVERSATION_REQUIRED', 400);
      const serverId = text(args.server_id, 20, 'MCP_SERVER_ID_INVALID');
      if (!serverId || !/^[1-9][0-9]{0,19}$/.test(serverId) || BigInt(serverId) > (1n << 64n) - 1n) throw new HttpAdapterError('MCP_SERVER_ID_INVALID', 400);
      const value = snakeKeys(await call('locateMessage', { accountId: account, conversationId, serverId }));
      const result = {
        message: value.message ? mcpMessage(value.message, true) : null,
        before_cursor: value.before_cursor || '',
        after_cursor: value.after_cursor || '',
        exact_identity: Boolean(value.message),
        synthetic_only: false,
        native_schema_supported: false
      };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'alpha-independent.messages.get_source') {
      const account = await selectedAccount(params);
      const conversationId = text(args.conversation_id, 1024, 'MCP_MESSAGE_SOURCE_CONVERSATION_INVALID');
      if (!conversationId) throw new HttpAdapterError('MCP_MESSAGE_SOURCE_CONVERSATION_REQUIRED', 400);
      const messageId = text(args.message_id, 2048, 'MCP_MESSAGE_SOURCE_MESSAGE_INVALID');
      if (!messageId) throw new HttpAdapterError('MCP_MESSAGE_SOURCE_MESSAGE_REQUIRED', 400);
      const sourceToken = independentSourceToken(args.source_token, 'MCP_MESSAGE_SOURCE_TOKEN_INVALID');
      if (!sourceToken) throw new HttpAdapterError('MCP_MESSAGE_SOURCE_TOKEN_REQUIRED', 400);
      if (!/^independent1_[A-Za-z0-9_-]+$/.test(sourceToken)) throw new HttpAdapterError('MCP_MESSAGE_SOURCE_TOKEN_INVALID', 400);
      const value = snakeKeys(await call('getMessageSource', { accountId: account, conversationId, messageId, sourceToken }));
      const result = { ...value, conversation_id: conversationId, message_id: messageId, scope: 'verified-message-text', complete: false, native_schema_supported: false, raw_available: false, media_ready: false };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'alpha-independent.analytics.analyze_annual') {
      const account = await selectedAccount(params);
      const year = integer(args.year, 1970, 9999, 'MCP_ANALYSIS_YEAR_INVALID');
      if (year === undefined) throw new HttpAdapterError('MCP_ANALYSIS_YEAR_REQUIRED', 400);
      const utcOffsetMinutes = integer(args.utc_offset_minutes, -720, 840, 'MCP_ANALYSIS_OFFSET_INVALID') ?? 0;
      const value = snakeKeys(await call('analyzeAnnual', { accountId: account, year, utcOffsetMinutes }));
      const result = independentAnalysisSnapshot(value, 'annual', 'discoverable-sessions');
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'alpha-independent.analytics.analyze_conversation') {
      const account = await selectedAccount(params);
      const conversationId = text(args.conversation_id, 1024, 'MCP_ANALYSIS_CONVERSATION_INVALID');
      if (!conversationId) throw new HttpAdapterError('MCP_ANALYSIS_CONVERSATION_REQUIRED', 400);
      const maxMessages = mcpLimit(args.max_messages, 50000, 500000, 'MCP_ANALYSIS_MAX_MESSAGES_INVALID');
      const utcOffsetMinutes = integer(args.utc_offset_minutes, -720, 840, 'MCP_ANALYSIS_OFFSET_INVALID') ?? 0;
      const value = snakeKeys(await call('analyzeConversation', { accountId: account, conversationId, maxMessages, utcOffsetMinutes }));
      const result = independentAnalysisSnapshot(value, 'conversation', 'verified-conversation-messages');
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'alpha-independent.media.decode_voice_playback') {
      const account = await selectedAccount(params);
      const mediaId = text(args.media_id, 64, 'MCP_VOICE_MEDIA_ID_INVALID');
      if (!mediaId || !/^[0-9a-f]{64}$/.test(mediaId)) throw new HttpAdapterError('MCP_VOICE_MEDIA_ID_INVALID', 400);
      const value = snakeKeys(await call('decodeVoicePlayback', { accountId: account, mediaId }));
      const result = { ...value, synthetic_only: true, native_schema_supported: false, schema: '__alpha_voice_playback_v1', scope: 'synthetic-voice-playback', media_ready: true };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'alpha-independent.media.probe') {
      const account = await selectedAccount(params);
      if (typeof engine.probeMedia !== 'function') throw new HttpAdapterError('HTTP_API_MEDIA_PROBE_UNSUPPORTED', 501);
      const value = snakeKeys(await engine.probeMedia(account));
      const result = { ...value, scope: 'explicit-v4-media-database-probe', complete: value.status === 'ready', media_ready: false, metadata_only: true, native_schema_supported: false };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'alpha-independent.mobile.get_overview') {
      const account = await selectedAccount(params);
      const listed = snakeKeys(await call('listAccounts'));
      const accounts = Array.isArray(listed.accounts) ? listed.accounts : [];
      const row = accounts.find(item => item.account_id === account || item.id === account);
      if (!row) throw new HttpAdapterError('HTTP_API_ACCOUNT_REQUIRED', accounts.length ? 400 : 503);
      const sessions = await route('/api/v1/sessions', {
        account_id: account,
        limit: mcpLimit(args.limit, 20, 500, 'MCP_LIMIT_INVALID'),
        ...(args.cursor === undefined ? {} : { cursor: args.cursor })
      });
      const accountInfo = {
        id: row.id || row.account_id || '',
        display_name: row.display_name || '',
        state: row.state || '',
        ready: row.ready === true,
        verified: row.verified === true,
        capabilities: Array.isArray(row.capabilities) ? row.capabilities : []
      };
      const items = Array.isArray(sessions.items) ? sessions.items.map(item => ({
        id: item.id || '',
        ...(item.display_name ? { display_name: item.display_name } : {}),
        ...(item.kind !== undefined ? { kind: item.kind } : {}),
        ...(item.last_activity_unix_ms !== undefined ? { last_activity_unix_ms: item.last_activity_unix_ms } : {}),
        ...(item.preview ? { preview: item.preview } : {})
      })) : [];
      const overview = {
        scope: 'alpha-independent-verified-dto',
        complete: false,
        native_schema_supported: false,
        coverage: 'verified-account-and-session-dto',
        account: accountInfo,
        sessions: {
          items,
          has_more: Boolean(sessions.next_cursor),
          ...(sessions.next_cursor ? { next_cursor: sessions.next_cursor } : {}),
          ...(sessions.total_count !== undefined ? { total_count: sessions.total_count } : {})
        }
      };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: overview, content: [{ type: 'text', text: JSON.stringify(overview) }] } };
    }
    else if (name === 'alpha-independent.media.browse_conversation' || name === 'alpha-independent.media.browse_account') {
      const account = await selectedAccount(params);
      const accountWide = name.endsWith('browse_account');
      const categories = accountWide ? ['media', 'image', 'video'] : ['media', 'file', 'link'];
      const category = text(args.category, 16, 'MCP_MEDIA_CATEGORY_INVALID');
      if (!category || !categories.includes(category)) throw new HttpAdapterError('MCP_MEDIA_CATEGORY_INVALID', 400);
      const conversationId = text(args.conversation_id, 1024, 'MCP_MEDIA_CONVERSATION_INVALID');
      if (!accountWide && !conversationId) throw new HttpAdapterError('MCP_MEDIA_CONVERSATION_REQUIRED', 400);
      const senderId = accountWide ? undefined : text(args.sender_id, 1024, 'MCP_MEDIA_SENDER_INVALID');
      const from = int64(args.from_unix_ms, 'MCP_MEDIA_TIME_INVALID');
      const to = int64(args.to_unix_ms, 'MCP_MEDIA_TIME_INVALID');
      if (from !== undefined && from < 0n || to !== undefined && to < 0n || from !== undefined && to !== undefined && from > to) throw new HttpAdapterError('MCP_MEDIA_TIME_INVALID', 400);
      const request = { accountId: account, category, page: page(args, 500), ...(conversationId ? { conversationId } : {}), ...(senderId ? { senderId } : {}), ...(from === undefined ? {} : { fromUnixMs: from }), ...(to === undefined ? {} : { toUnixMs: to }) };
      const method = accountWide ? 'browseAccountMedia' : 'browseConversationMessages';
      const value = snakeKeys(await call(method, request));
      const result = { ...value, category, scope: accountWide ? 'discoverable-sessions' : 'conversation', complete: false, media_ready: false, native_schema_supported: false };
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    else if (name === 'alpha-independent.moments.list_timeline') pathName = '/api/v1/sns/timeline';
    else if (name === 'alpha-independent.moments.list_users') pathName = '/api/v1/sns/usernames';
    else if (name === 'alpha-independent.moments.day_counts') pathName = '/api/v1/sns/day-counts';
    else if (name === 'alpha-independent.moments.start_export') { pathName = '/api/v1/independent/moments/exports'; params.output_directory = args.output_directory; params.usernames = args.usernames; params.keyword = args.keyword; params.start_time_unix_ms = args.start_time_unix_ms; params.end_time_unix_ms = args.end_time_unix_ms; params.media_kinds = args.media_kinds; params.utc_offset_minutes = args.utc_offset_minutes; }
    else if (name === 'alpha-independent.moments.watch_export' || name === 'alpha-independent.moments.cancel_export') { const jobId = text(args.job_id, 128, 'MCP_MOMENTS_JOB_INVALID'); if (!jobId) throw new HttpAdapterError('MCP_MOMENTS_JOB_REQUIRED', 400); pathName = `/api/v1/independent/moments/exports/${encodeURIComponent(jobId)}${name === 'alpha-independent.moments.cancel_export' ? '/cancel' : ''}`; }
    else if (name === 'alpha-independent.favorites.list_items') pathName = '/api/v1/favorites';
    else if (name === 'alpha-independent.favorites.list_media_slots') { const account = await selectedAccount(params); const favoriteId = text(args.favorite_id, 1024, 'MCP_FAVORITE_ID_INVALID'); const value = snakeKeys(await call('listFavoriteMediaSlots', { accountId: account, favoriteId })); return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: { ...value, synthetic_only: true, native_schema_supported: false, schema: '__alpha_favorite_media_v1' }, content: [{ type: 'text', text: JSON.stringify(value) }] } }; }
    else if (name === 'alpha-independent.favorites.resolve_media') { const account = await selectedAccount(params); const token = text(args.token, 37, 'MCP_FAVORITE_TOKEN_INVALID'); if (!/^fav1_[0-9a-f]{32}$/.test(token)) throw new HttpAdapterError('MCP_FAVORITE_TOKEN_INVALID', 400); const value = snakeKeys(await call('resolveFavoriteMedia', { accountId: account, token })); const result = { ...value, synthetic_only: true, native_schema_supported: false, schema: '__alpha_favorite_media_v1' }; return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } }; }
    else if (name === 'alpha-independent.schedules.list') pathName = '/api/v1/independent/export-schedules';
    else if (name === 'alpha-independent.schedules.get') pathName = `/api/v1/independent/export-schedules/${encodeURIComponent(schedulePathId(args.schedule_id, 'MCP_SCHEDULE_ID_INVALID'))}`;
    else if (name === 'alpha-independent.schedules.save') {
      pathName = '/api/v1/independent/export-schedules';
      params.mode = args.mode;
      params.plan = args.plan;
      params.expected_updated_at_unix_ms = args.expected_updated_at_unix_ms;
    }
    else if (name === 'alpha-independent.schedules.delete' || name === 'alpha-independent.schedules.run_now') {
      const scheduleId = schedulePathId(args.schedule_id, 'MCP_SCHEDULE_ID_INVALID');
      pathName = `/api/v1/independent/export-schedules/${encodeURIComponent(scheduleId)}`;
      params.action = name.endsWith('.delete') ? 'delete' : 'run-now';
      params.expected_updated_at_unix_ms = args.expected_updated_at_unix_ms;
    }
    else if (name === 'alpha-independent.schedules.list_runs' || name === 'alpha-independent.schedules.list_attempts') {
      const scheduleId = args.schedule_id === undefined ? undefined : schedulePathId(args.schedule_id, 'MCP_SCHEDULE_ID_INVALID');
      pathName = scheduleId ? `/api/v1/independent/export-schedules/${encodeURIComponent(scheduleId)}/${name.endsWith('list_runs') ? 'runs' : 'attempts'}` : `/api/v1/independent/${name.endsWith('list_runs') ? 'export-runs' : 'export-attempts'}`;
    }
    else if (name === 'alpha-independent.schedules.get_run') pathName = `/api/v1/independent/export-runs/${encodeURIComponent(schedulePathId(args.run_id, 'MCP_RUN_ID_INVALID'))}`;
    else if (name === 'alpha-independent.schedules.get_attempt') pathName = `/api/v1/independent/export-attempts/${encodeURIComponent(schedulePathId(args.attempt_id, 'MCP_ATTEMPT_ID_INVALID'))}`;
    else if (name === 'alpha-independent.schedules.retry_attempt') {
      pathName = `/api/v1/independent/export-attempts/${encodeURIComponent(schedulePathId(args.attempt_id, 'MCP_ATTEMPT_ID_INVALID'))}/retry`;
      params.expected_revision = args.expected_revision;
    }
    else if (name === 'alpha-independent.source.get_revision') pathName = '/api/v1/independent/source/revision';
    else if (name === 'alpha-independent.source.get_watch_targets') pathName = '/api/v1/independent/source/watch-targets';
    else if (name === 'alpha.analysis.start') { pathName = '/api/v1/analysis'; }
    else if (name === 'alpha.analysis.watch' || name === 'alpha.analysis.cancel') {
      const analysisId = text(args.analysis_id, 128, 'MCP_ANALYSIS_ID_INVALID');
      if (!analysisId) throw new HttpAdapterError('MCP_ANALYSIS_ID_INVALID', 400);
      pathName = `/api/v1/analysis/${encodeURIComponent(analysisId)}${name === 'alpha.analysis.cancel' ? '/cancel' : ''}`;
    }
    else if (name === 'alpha-independent.records.list_recall_candidates') {
      pathName = '/api/v1/independent/recall-records';
      params.conversation_id = args.conversation_id;
      params.cursor = args.cursor;
      params.limit = args.limit;
    }
    else if (name === 'alpha-independent.records.list_candidates' || name === 'wechat.forensics.list_records') {
      const account = await selectedAccount(params);
      const category = text(args.category, 32, 'MCP_RECORD_CATEGORY_INVALID');
      const tables = { payments: '__alpha_general_payments', friend_requests: '__alpha_general_friend_requests', revokes: '__alpha_general_revokes', calls: '__alpha_general_calls' };
      if (!Object.hasOwn(tables, category)) throw new HttpAdapterError('MCP_RECORD_CATEGORY_INVALID', 400);
      const query = text(args.query ?? '', 512, 'MCP_RECORD_QUERY_INVALID');
      if (Buffer.byteLength(query, 'utf8') > 512 || query !== query.trim() || /[\u0000-\u001f\u007f]/.test(query)) throw new HttpAdapterError('MCP_RECORD_QUERY_INVALID', 400);
      const limit = mcpLimit(args.limit, 100, 1000, 'MCP_LIMIT_INVALID');
      const offset = integer(args.offset, 0, 20000, 'MCP_OFFSET_INVALID') ?? 0;
      const ascending = boolean(args.ascending, 'MCP_RECORD_ORDER_INVALID') ?? false;
      const response = await call('listGeneral', { accountId: account, tableName: tables[category], query, limit, offset, ascending });
      const page = snakeKeys(response.response || response);
      const result = { category, table_name: tables[category], query, ascending, partial: true, candidate: true, scope: name.startsWith('alpha-independent.') ? 'alpha-independent-message-derived-candidates' : undefined, native_schema_supported: name.startsWith('alpha-independent.') ? false : undefined, items: page.items || [], source_database: page.source_database || '', source_table: page.source_table || '' };
      if (result.scope === undefined) delete result.scope;
      if (result.native_schema_supported === undefined) delete result.native_schema_supported;
      if (page.total_count !== undefined || page.total !== undefined) result.total_count = page.total_count ?? page.total;
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
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
    } else if (name === 'alpha.chat.export_capabilities') {
      const result = exportCapabilitiesJson(await call('getChatExportCapabilities'));
      return { jsonrpc: '2.0', id: rpc.id, result: { structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } else if (name === 'alpha.chat.export_stats') {
      const account = await selectedAccount(params);
      if (!Array.isArray(args.conversation_ids) || args.conversation_ids.length < 1 || args.conversation_ids.length > 100 || new Set(args.conversation_ids).size !== args.conversation_ids.length || args.conversation_ids.some(value => typeof value !== 'string' || !value.length || value.length > 1024 || value.includes('\0'))) throw new HttpAdapterError('MCP_CONVERSATIONS_INVALID', 400);
      const refresh = args.refresh === undefined ? undefined : boolean(args.refresh, 'MCP_REFRESH_INVALID');
      const result = snakeKeys(await call('getChatExportStats', { accountId: account, conversationIds: args.conversation_ids, ...(refresh === undefined ? {} : { refresh }) }));
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
      let result = await route(pathName, params, ['wechat.chat.export_conversation', 'wechat.chat.export_media_metadata', 'alpha.analysis.start', 'alpha.analysis.cancel', 'alpha-independent.moments.start_export', 'alpha-independent.moments.cancel_export', 'alpha-independent.schedules.save', 'alpha-independent.schedules.delete', 'alpha-independent.schedules.run_now', 'alpha-independent.schedules.retry_attempt'].includes(name) ? 'POST' : 'GET');
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
      if (!['GET', 'POST', 'DELETE'].includes(req.method)) throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
      if (!tokenMatches(bearer(req, url), token)) throw new HttpAdapterError('HTTP_API_UNAUTHORIZED', 401);
      await ensureHello();
      if (url.pathname === '/mcp') {
        if (req.method !== 'POST') throw new HttpAdapterError('HTTP_API_METHOD_INVALID', 405);
        const rpc = await readBody(req); const reply = await mcpCall(rpc); return reply === null ? empty(res, 202) : json(res, 200, reply);
      }
      const body = req.method === 'POST' || req.method === 'DELETE' ? await readBody(req) : {};
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
