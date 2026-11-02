'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const snapshot = require('./snapshot-store.cjs');
const { runImporter } = require('./importer-client.cjs');
const zlib = require('node:zlib');
const protocol = require('../alpha-protocol/index.cjs');
const { BridgeClient } = require('./bridge-client.cjs');
const contactCodec = require('./contacts.cjs');
const { validateMessageDisplay } = require('./message-display.cjs');
const { buildAnnualReport, buildConversationReport } = require('./analysis.cjs');
const { inspectExportPath, prepareExportPath, cleanupExportDirectories } = require('./export-path.cjs');
const { createChatExportJobs } = require('./chat-export-jobs.cjs');
const { createRecordExportJobs } = require('./records-export-jobs.cjs');
const { createMomentsExportJobs } = require('./moments-export-jobs.cjs');
const { createChatExportSchedules } = require('./chat-export-schedules.cjs');
const { createGenericJobs } = require('./generic-jobs.cjs');
const { createAggregateAnalysisJobs } = require('./aggregate-analysis-jobs.cjs');
const { contactsXlsx, conversationXlsx, groupMembersXlsx, recordsXlsx } = require('./xlsx-writer.cjs');
const { CHAT_DERIVED_FORMATS, CHAT_FORMAT_EXTENSIONS, derivedConversationOutput } = require('./export-formats.cjs');
const { loadMediaIndex, readMediaEntry } = require('./media-index.cjs');
const { EngineClientFrame, EngineServerFrame, LengthDelimitedFrameDecoder, encodeLengthDelimitedFrame, DEFAULT_MAX_FRAME_BYTES } = protocol;
const ALL_METHODS = Object.keys(EngineClientFrame.fromPartial({})).filter(name => name !== 'requestId');
// Values are EngineClientFrame field numbers, not RPC ordinal positions.
const SUPPORTED = Object.freeze({ hello: 10, getCapabilities: 11, listAccounts: 12, selectAccount: 13, listConversations: 14, listMessages: 15, exportConversation: 16, searchMessages: 17, removeAccount: 70, getJob: 26, watchJob: 27, cancelJob: 28, getMessageSource: 107, resolveMessageMedia: 103, decodeVoicePlayback: 128, resolveFavoriteMedia: 113, resolveMomentEmoji: 118, getChatExportStats: 120, getChatExportCapabilities: 121, startChatExport: 122, listChatExports: 123, watchChatExport: 124, cancelChatExport: 125, startMomentExport: 135, startRecordExport: 136, locateMessage: 126, getConversationDayCounts: 127, discoverAccounts: 29, importDatabaseKey: 30, watchDatabaseKeyAcquisition: 129, listContacts: 42, listMoments: 43, listFavorites: 44, listMomentAuthors: 114, getMomentDayCounts: 141, getContactProfile: 115, listGeneral: 45, exportContacts: 117, exportGroupMembers: 139, listFavoriteMediaSlots: 116, getApplicationLockStatus: 48, unlockApplication: 50, lockApplication: 51, configureApplicationLock: 131, getImageMediaStatus: 52, configureImageKey: 53, clearImageKey: 54, getDataRevision: 105, getDataWatchTargets: 106, browseConversationMessages: 137, browseAccountMedia: 138, analyzeAnnual: 104, analyzeConversation: 24, startAggregateAnalysis: 110, watchAggregateAnalysis: 111, cancelAggregateAnalysis: 112, getAdvancedComponentStatus: 65, getMessageAntiRecallStatuses: 119, manageMessageAntiRecall: 99, manageMomentsAntiDelete: 47, listChatExportSchedules: 89, getChatExportSchedule: 90, saveChatExportSchedule: 91, deleteChatExportSchedule: 92, runChatExportScheduleNow: 93, listChatExportRuns: 94, getChatExportRun: 95, listChatExportAttempts: 96, getChatExportAttempt: 97, retryChatExportAttempt: 98, getTelemetryStatus: 21, setTelemetryConsent: 22, flushTelemetry: 23 });
// These enum values are recovered from the Alpha protocol. The independent
// engine can report the local package boundary, but it cannot start or claim
// a dynamically entitled native component. Keep this status explicit and
// fail closed for unknown enum values.
const ADVANCED_COMPONENT_KINDS = new Set([1, 2, 3, 5, 6]);
const EXACT_CONTACT = '__alpha_contact_exact:';
const error = code => new Error(code);
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function decimal(value, signed = false) {
  if (typeof value !== 'string' || !(signed ? /^-?(?:0|[1-9][0-9]*)$/ : /^(?:0|[1-9][0-9]*)$/).test(value)) throw error('BRIDGE_VALUE_INVALID');
  const n = BigInt(value);
  if (n < (signed ? -(1n << 63n) : 0n) || n > (signed ? (1n << 63n) - 1n : (1n << 64n) - 1n)) throw error('BRIDGE_VALUE_OUT_OF_RANGE');
  return n;
}
const MOMENT_EMOJI_SOURCE = 'emoji-xml:__alpha_moment_emoji_v1:';
const MOMENT_EMOJI_MIMES = new Set(['image/gif', 'image/png', 'image/jpeg', 'image/webp']);
function syntheticMomentEmojiSource(value) {
  return typeof value === 'string' && value.startsWith(MOMENT_EMOJI_SOURCE) && value.length > MOMENT_EMOJI_SOURCE.length && value.length <= 4096 && !value.includes('\0');
}
function text(value, maximum = 4096) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) throw error('BRIDGE_VALUE_INVALID');
  return value;
}
function telemetryConsentVersion(value) {
  if (value === undefined || value === '') return TELEMETRY_DEFAULT_CONSENT_VERSION;
  if (typeof value !== 'string' || value !== value.trim() || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) throw error('TELEMETRY_VERSION_INVALID');
  return value;
}
function telemetryCategories(value) {
  if (!Array.isArray(value) || value.length > 64) throw error('TELEMETRY_CATEGORIES_INVALID');
  const seen = new Set();
  return value.map(category => {
    if (typeof category !== 'string' || category !== category.trim() || !category || category.length > 128 || /[\u0000-\u001f\u007f]/.test(category) || seen.has(category)) throw error('TELEMETRY_CATEGORIES_INVALID');
    seen.add(category);
    return category;
  });
}
function uint32(value) {
  const n = decimal(value);
  if (n > 0xffffffffn) throw error('BRIDGE_VALUE_OUT_OF_RANGE');
  return Number(n);
}
function milliseconds(value) {
  const n = decimal(value) * 1000n;
  if (n > (1n << 63n) - 1n) throw error('BRIDGE_VALUE_OUT_OF_RANGE');
  return n;
}
function pageSize(request) {
  const size = request?.pageSize || 100;
  if (!Number.isInteger(size) || size < 1 || size > 1000) throw error('PAGE_SIZE_INVALID');
  return Math.min(size, 500);
}
function readCursor(value) {
  if (!value || value.length === 0) return '';
  if (!(value instanceof Uint8Array) || value.length > 1024) throw error('CURSOR_INVALID');
  const cursor = new TextDecoder('utf-8', { fatal: true }).decode(value);
  if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw error('CURSOR_INVALID');
  return cursor;
}
function checkedPage(result, limit) {
  if (!result || !Array.isArray(result.items) || result.items.length > limit || typeof result.nextCursor !== 'string' || result.nextCursor.length > 1024 || typeof result.hasMore !== 'boolean' || result.hasMore !== Boolean(result.nextCursor)) throw error('BRIDGE_PAGE_INVALID');
  return result;
}
function mediaProbeText(value, maximum = 1024, allowEmpty = false) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0') || !allowEmpty && !value || /[\u0000-\u001f\u007f]/.test(value) || value !== value.trim()) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
  return value;
}
function mediaProbeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
  return value;
}
function mediaProbeResponse(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !['ready', 'unavailable'].includes(value.status) || value.sourceKind !== 'explicit-v4-media-database-probe' || value.nativeSchemaSupported !== false || value.metadataOnly !== true || value.mediaReady !== false || !Array.isArray(value.files) || value.files.length > 16 || !Array.isArray(value.items) || value.items.length > 4096) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
  const files = value.files.map(file => {
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
    const relativePath = mediaProbeText(file.path, 1024);
    if (relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.split('/').some(part => part === '..' || !part)) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
    const sha256 = mediaProbeText(file.sha256, 64);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
    return { path: relativePath, bytes: mediaProbeInteger(file.bytes, 512 * 1024 * 1024), sha256 };
  });
  const items = value.items.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !['image', 'video', 'file', 'voice'].includes(item.kind)) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
    const key = mediaProbeText(item.key, 1024);
    const sourceDatabase = mediaProbeText(item.sourceDatabase, 1024);
    const sourceTable = mediaProbeText(item.sourceTable, 128);
    const normalized = { kind: item.kind, key, sourceDatabase, sourceTable, nativeSchemaSupported: false, metadataOnly: true };
    if (item.ambiguous !== undefined && typeof item.ambiguous !== 'boolean') throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
    if (item.ambiguous === true) normalized.ambiguous = true;
    if (item.kind === 'voice') {
      normalized.dataBytes = mediaProbeInteger(item.dataBytes ?? 0, 1 << 40);
    } else {
      const name = mediaProbeText(item.name, 1024);
      const relativePath = mediaProbeText(item.path, 4096);
      if (relativePath.startsWith('/') || relativePath.includes('\\') || relativePath.split('/').some(part => part === '..' || !part)) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
      normalized.name = name;
      normalized.path = relativePath;
      normalized.size = mediaProbeInteger(item.size ?? 0, 1 << 40);
      normalized.modifyTime = mediaProbeInteger(item.modifyTime ?? 0, Number.MAX_SAFE_INTEGER);
      normalized.dir1 = mediaProbeText(item.dir1, 1024);
      normalized.dir2 = mediaProbeText(item.dir2, 1024);
    }
    return normalized;
  });
  if (value.status === 'unavailable') {
    if (typeof value.reason !== 'string' || value.reason.length > 4096 || value.reason.includes('\0')) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
    return { status: 'unavailable', reason: value.reason, sourceKind: value.sourceKind, nativeSchemaSupported: false, metadataOnly: true, mediaReady: false, files, items };
  }
  if (!Number.isSafeInteger(value.itemCount) || value.itemCount !== items.length || !Number.isSafeInteger(value.ambiguousItems) || value.ambiguousItems < 0 || value.ambiguousItems > items.length) throw error('BRIDGE_MEDIA_PROBE_RESPONSE_INVALID');
  return { status: 'ready', sourceKind: value.sourceKind, nativeSchemaSupported: false, metadataOnly: true, mediaReady: false, files, items, itemCount: value.itemCount, ambiguousItems: value.ambiguousItems };
}
const INT64_MAX = (1n << 63n) - 1n;
const MAX_SAFE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);
const MAX_EXPORT_MESSAGES = 100000;
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const MAX_EXPORT_RUNTIME_MS = 30000;
const MEDIA_METADATA_EXPORT_MAX_ITEMS = 20000;
const MEDIA_METADATA_EXPORT_MAX_BYTES = 64 * 1024 * 1024;
const MEDIA_METADATA_EXPORT_FORMATS = new Set(['media-json', 'media-csv']);
const CONVERSATION_EXPORT_FORMATS = new Set(['json', 'markdown', 'txt', 'html', 'xlsx', ...CHAT_DERIVED_FORMATS]);
// Keep normal exports efficient while reducing the page if a bridge response
// is too large for an unusually big decoded/base64 payload.
const EXPORT_PAGE_SIZE = 100;
const CONTACT_EXPORT_MAX_ITEMS = 100000;
const CONTACT_EXPORT_MAX_BYTES = 64 * 1024 * 1024;
const CONTACT_EXPORT_FORMATS = new Set(['csv', 'json', 'vcf', 'html', 'xlsx']);
const GROUP_MEMBER_EXPORT_FORMATS = new Set(['csv', 'json', 'html', 'xlsx']);
const CONTACT_EXPORT_CATEGORIES = new Set(['friend', 'group']);
const CONTACT_EXPORT_ALL_CATEGORIES = new Set(['friend', 'group', 'enterprise_friend', 'enterprise_group', 'official', 'service', 'former_friend', 'blocked']);
const CONTACT_DIRECTORY_KNOWN_CATEGORIES = new Set(['friend', 'group']);
const CONTACT_DIRECTORY_ALL_CATEGORIES = ['friend', 'group', 'enterprise_friend', 'enterprise_group', 'official', 'service', 'former_friend', 'blocked'];
const CONTACT_DIRECTORY_MAX_ITEMS = 100000;
const CONTACT_DIRECTORY_MAX_PAGES = 256;
const TYPE_BROWSE_CATEGORIES = new Set(['media', 'file', 'link']);
const ACCOUNT_MEDIA_CATEGORIES = new Set(['media', 'image', 'video']);
const GENERAL_RECORD_TABLES = new Set(['__alpha_group_members', '__alpha_general_payments', '__alpha_general_friend_requests', '__alpha_general_revokes', '__alpha_general_calls']);
const BROWSE_PAGE_MAX = 120;
const BROWSE_BRIDGE_PAGE = 120;
const BROWSE_CURSOR_MAX_BYTES = 1024;
const BROWSE_MAX_SCAN_PAGES = 128;
const BROWSE_MAX_SCAN_CONVERSATIONS = 10000;
const MESSAGE_SOURCE_PAGE_SIZE = 100;
const MESSAGE_SOURCE_MAX_SCAN_PAGES = 128;
const MEDIA_RESOLVE_MAX_SCAN_PAGES = 128;
const INDEPENDENT_MEDIA_TOKEN = /^alpha-media:\/\/sha256\/([0-9a-f]{64})$/;
const TELEMETRY_STATE_VERSION = 1;
const TELEMETRY_STATE_MAX_BYTES = 16 * 1024;
const TELEMETRY_DEFAULT_CONSENT_VERSION = 'telemetry-v1';
const TELEMETRY_DISABLED_ERROR = 'INDEPENDENT_TELEMETRY_DISABLED';
const TELEMETRY_DECISIONS = new Set(['granted', 'revoked']);
const IMPORT_EVENT_HISTORY_LIMIT = 64;
const IMPORT_EVENT_TOTAL_STEPS = 5;
const IMPORT_EVENT_PHASES = Object.freeze({ discovering: 1, scanning: 2, capturing: 3, verifying: 4, sealing: 5, completed: 6 });
const IMPORT_EVENT_MESSAGE_KEYS = Object.freeze({
  discovering: 'key.progress.discovering',
  scanning: 'key.progress.scanning',
  capturing: 'key.progress.scanning',
  verifying: 'key.progress.verifying',
  sealing: 'key.progress.sealing',
  completed: 'key.progress.completed'
});
function requestTime(value, code, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'bigint' || value < 0n || value > INT64_MAX) throw error(code);
  return value;
}
function requestName(value, code, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'string' || value !== value.trim() || (!optional && !value) || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) throw error(code);
  return value;
}
function safeCount(value) {
  const count = decimal(value);
  if (count > MAX_SAFE_COUNT) throw error('BRIDGE_COUNT_OUT_OF_RANGE');
  return count;
}
function browsePage(request, code) {
  const page = request?.page;
  const pageSize = page?.pageSize === undefined || page?.pageSize === 0 ? 60 : page.pageSize;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > BROWSE_PAGE_MAX) throw error(code);
  const cursor = page?.cursor === undefined ? new Uint8Array(0) : page.cursor;
  if (!(cursor instanceof Uint8Array) || cursor.length > BROWSE_CURSOR_MAX_BYTES) throw error(code);
  return { pageSize, cursor };
}
function browseBound(value, code, optional = true) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'bigint' || value < 0n || value > INT64_MAX) throw error(code);
  return value;
}
function browseCursorScope(request, accountId, conversationId, category, senderId, from, to, mode) {
  // Keep the opaque cursor bounded even when a caller supplies a valid
  // conversation identifier near its 1024-character input limit. The digest
  // still binds every scope field, while avoiding duplicating user strings in
  // the cursor itself.
  return `browse-v1:${sha(JSON.stringify({ mode, accountId, conversationId, category, senderId, from: from === undefined ? '' : from.toString(), to: to === undefined ? '' : to.toString() }))}`;
}
function encodeBrowseCursor(state) {
  const raw = Buffer.from(JSON.stringify({ v: 1, ...state }), 'utf8');
  if (raw.length > BROWSE_CURSOR_MAX_BYTES) throw error('BROWSE_CURSOR_TOO_LARGE');
  return raw;
}
function decodeBrowseCursor(bytes, scope) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return null;
  let state;
  try { state = JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw error('BROWSE_CURSOR_INVALID'); }
  if (!state || state.v !== 1 || state.scope !== scope || typeof state.bridgeCursor !== 'string' || state.bridgeCursor.length > 1024) throw error('BROWSE_CURSOR_INVALID');
  if (state.bridgeCursor && !/^[A-Za-z0-9_-]+$/.test(state.bridgeCursor)) throw error('BROWSE_CURSOR_INVALID');
  return state;
}
function decodeIndependentSourceToken(value, accountId) {
  if (typeof value !== 'string' || value.length > 4096 || !/^independent1_[A-Za-z0-9_-]+$/.test(value)) throw error('MESSAGE_SOURCE_REQUEST_INVALID');
  const encoded = value.slice('independent1_'.length);
  let raw;
  try {
    raw = Buffer.from(encoded, 'base64url');
    if (!raw.length || raw.toString('base64url') !== encoded) throw new Error('non-canonical');
  } catch { throw error('MESSAGE_SOURCE_REQUEST_INVALID'); }
  let identity;
  try { identity = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)); } catch { throw error('MESSAGE_SOURCE_REQUEST_INVALID'); }
  if (!identity || typeof identity !== 'object' || Array.isArray(identity) || Object.keys(identity).sort().join(',') !== 'accountId,database,localId,table') throw error('MESSAGE_SOURCE_REQUEST_INVALID');
  if (identity.accountId !== accountId || typeof identity.database !== 'string' || typeof identity.table !== 'string' || typeof identity.localId !== 'string' || !identity.database || !identity.table || !/^(?:0|[1-9][0-9]{0,19})$/.test(identity.localId)) throw error('MESSAGE_SOURCE_UNAVAILABLE');
  if (identity.database.length > 1024 || identity.table.length > 1024 || /\0/.test(identity.database) || /\0/.test(identity.table)) throw error('MESSAGE_SOURCE_REQUEST_INVALID');
  try { decimal(identity.localId); } catch { throw error('MESSAGE_SOURCE_REQUEST_INVALID'); }
  return identity;
}
function browseMessageMatches(message, category, accountWide = false) {
  const sourceType = Number(message.sourceType & 0xffffffffn);
  const kind = message.kind;
  if (accountWide) {
    if (category === 'image') return sourceType === 3 || kind === 'image';
    if (category === 'video') return sourceType === 43 || kind === 'video';
    return sourceType === 3 || sourceType === 34 || sourceType === 43 || sourceType === 47 || ['image', 'voice', 'video', 'sticker'].includes(kind);
  }
  if (category === 'file') return message.display?.kind === 'file';
  if (category === 'link') return message.display?.kind === 'link';
  return sourceType === 3 || sourceType === 34 || sourceType === 43 || sourceType === 47 || ['image', 'voice', 'video', 'sticker'].includes(kind);
}
function localDay(unixMs, offsetMinutes) {
  const shifted = unixMs + BigInt(offsetMinutes) * 60000n;
  return shifted >= 0n ? shifted / 86400000n : -((-shifted + 86399999n) / 86400000n);
}
function statsCategory(raw) {
  const kind = Number(decimal(raw) & 0xffffffffn);
  // A type 49 without a separately verified subtype is counted as other.
  return ({ 1: 'text', 3: 'image', 34: 'voice', 42: 'card', 43: 'video', 47: 'emoji', 48: 'location', 50: 'call', 10000: 'system', 10002: 'system' })[kind] || 'other';
}
function safeStateDirectory(directory) {
  if (!path.isAbsolute(directory)) throw error('ENGINE_STATE_PATH_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.split(path.sep).filter(Boolean)) { current = path.join(current, part); const stat = fs.lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw error('ENGINE_STATE_PATH_INVALID'); }
}
function exportIsoTime(unixMs) {
  const maxDate = 8640000000000000n;
  if (unixMs > maxDate) return unixMs.toString();
  try { return new Date(Number(unixMs)).toISOString(); } catch { return unixMs.toString(); }
}
function exportMessage(message) {
  const source = message.rawSource || {};
  return {
    id: message.id,
    accountId: source.accountId || '',
    conversationId: message.conversationId,
    localId: message.rawLocalId || String(message.localId),
    serverId: message.rawServerId || message.serverId.toString(),
    localType: message.rawLocalType || message.sourceType.toString(),
    sentAtUnixMs: message.sentAtUnixMs.toString(),
    sentAt: exportIsoTime(message.sentAtUnixMs),
    senderId: message.senderId,
    direction: message.direction,
    kind: message.kind,
    text: message.text,
    contentDecodeStatus: message.contentDecodeStatus,
    source: { database: source.database || '', table: source.table || '', localId: source.localId || '' },
    refs: message.refs || [],
    ...(message.display ? { display: message.display } : {})
  };
}
function markdownExport(meta, items) {
  const lines = ['# Alpha conversation export', '', `- accountId: ${meta.accountId}`, `- conversationId: ${meta.conversationId}`, `- itemCount: ${items.length}`];
  if (meta.startTimeUnixMs !== undefined) lines.push(`- startTimeUnixMs: ${meta.startTimeUnixMs}`);
  if (meta.endTimeUnixMs !== undefined) lines.push(`- endTimeUnixMs: ${meta.endTimeUnixMs}`);
  lines.push('');
  for (const item of items) {
    lines.push(`## ${item.sentAt} · ${item.senderId || '(unknown sender)'}`, '', `- localId: ${item.localId}`, `- serverId: ${item.serverId}`, `- localType: ${item.localType}`, `- kind: ${item.kind}`, '', item.text, '');
  }
  return lines.join('\n') + '\n';
}
function textExport(meta, items) {
  const lines = [`Alpha conversation export`, `accountId: ${meta.accountId}`, `conversationId: ${meta.conversationId}`, `itemCount: ${items.length}`];
  if (meta.startTimeUnixMs !== undefined) lines.push(`startTimeUnixMs: ${meta.startTimeUnixMs}`);
  if (meta.endTimeUnixMs !== undefined) lines.push(`endTimeUnixMs: ${meta.endTimeUnixMs}`);
  lines.push('');
  for (const item of items) lines.push(`[${item.sentAt}] ${item.senderId || '(unknown sender)'} <${item.kind}> ${item.text}`, '');
  return lines.join('\n');
}
function conversationXlsxOutput(items) {
  const headers = ['id', 'accountId', 'conversationId', 'localId', 'serverId', 'localType', 'sentAtUnixMs', 'sentAt', 'senderId', 'direction', 'kind', 'text', 'contentDecodeStatus', 'sourceDatabase', 'sourceTable', 'sourceLocalId', 'refs', 'display'];
  return conversationXlsx(headers, items.map(item => [
    item.id, item.accountId, item.conversationId, item.localId, item.serverId, item.localType,
    item.sentAtUnixMs, item.sentAt, item.senderId, item.direction, item.kind, item.text,
    item.contentDecodeStatus, item.source.database, item.source.table, item.source.localId,
    JSON.stringify(item.refs || []), JSON.stringify(item.display || null)
  ]));
}
function htmlExport(meta, items) {
  const title = `Alpha conversation export · ${meta.conversationId}`;
  const metadata = [
    ['accountId', meta.accountId],
    ['conversationId', meta.conversationId],
    ['itemCount', items.length],
    ...(meta.startTimeUnixMs === undefined ? [] : [['startTimeUnixMs', meta.startTimeUnixMs]]),
    ...(meta.endTimeUnixMs === undefined ? [] : [['endTimeUnixMs', meta.endTimeUnixMs]])
  ].map(([key, value]) => `<dt>${htmlEscape(key)}</dt><dd>${htmlEscape(value)}</dd>`).join('');
  const messages = items.map(item => {
    const refs = JSON.stringify(item.refs || []);
    return `<article><header><time datetime="${htmlEscape(item.sentAt)}">${htmlEscape(item.sentAt)}</time><strong>${htmlEscape(item.senderId || '(unknown sender)')}</strong><span>${htmlEscape(item.kind)}</span></header><dl><dt>localId</dt><dd>${htmlEscape(item.localId)}</dd><dt>serverId</dt><dd>${htmlEscape(item.serverId)}</dd><dt>localType</dt><dd>${htmlEscape(item.localType)}</dd><dt>refs</dt><dd>${htmlEscape(refs)}</dd></dl><p>${htmlEscape(item.text)}</p></article>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${htmlEscape(title)}</title><style>body{margin:2rem auto;max-width:64rem;font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif;color:#202124;background:#fff}h1{font-size:1.4rem}dl{display:grid;grid-template-columns:max-content 1fr;gap:.2rem 1rem;margin:.5rem 0;color:#5f6368}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}article{border:1px solid #dadce0;border-radius:8px;padding:1rem;margin:1rem 0}article header{display:flex;gap:.75rem;align-items:baseline;flex-wrap:wrap}article header span{color:#5f6368;font-size:.85em}article p{white-space:pre-wrap;overflow-wrap:anywhere;margin:1rem 0 0}</style></head><body><h1>Alpha conversation export</h1><dl>${metadata}</dl>${messages}</body></html>\n`;
}
function contactExportCategory(item) {
  const localType = Number(decimal(item.localType));
  if (localType === 1) return 'friend';
  if (localType === 2 || item.username.endsWith('@chatroom')) return 'group';
  // Chatlog's pinned ContactV4 model documents local_type 3 as a non-friend
  // group member and 5/6 as enterprise WeChat. There is no category mapping
  // for those rows in the independent bridge, so leave them unknown.
  return '';
}
function contactDirectoryCategory(item) {
  if (!item || typeof item.username !== 'string' || !Number.isSafeInteger(item.localType) || item.localType < 0) throw error('BRIDGE_CONTACT_INVALID');
  if (item.localType === 1) return 'friend';
  if (item.localType === 2 || item.username.endsWith('@chatroom')) return 'group';
  // Other local_type values do not have a verified mapping in the recovered
  // v4 schema. Keep them out of the classified page instead of assigning a
  // potentially incorrect official/enterprise/blocked category.
  return '';
}
function contactExportText(value, maximum = 4096) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) throw error('BRIDGE_CONTACT_INVALID');
  return value;
}
function contactExportRow(row, includeProfile) {
  if (!row || typeof row !== 'object') throw error('BRIDGE_CONTACT_INVALID');
  const username = contactExportText(row.username, 1024);
  if (!username || username.trim() !== username || /[\u0000-\u001f\u007f]/.test(username)) throw error('BRIDGE_CONTACT_INVALID');
  const localType = decimal(row.localType);
  if (localType > 0xffffffffn) throw error('BRIDGE_CONTACT_INVALID');
  const alias = contactExportText(row.alias || '');
  const remark = contactExportText(row.remark || '');
  const nickname = contactExportText(row.nickname || row.nickName || '');
  const category = contactExportCategory({ username, localType: localType.toString() });
  const value = { username, alias, remark, nickname, localType: localType.toString(), category };
  if (includeProfile) value.profile = { username, alias, remark, nickname };
  return value;
}
function csvCell(value) {
  const textValue = String(value ?? '');
  return /[",\r\n]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}
function contactVcardText(value) {
  return String(value ?? '').replace(/[\\;,:]/g, '\\$&').replace(/\r\n|\r|\n/g, '\\n');
}
function htmlEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function mediaMetadataExportRow(message) {
  if (!message || typeof message !== 'object' || typeof message.id !== 'string' || typeof message.conversationId !== 'string' || typeof message.sentAtUnixMs !== 'bigint' || !Array.isArray(message.refs)) throw error('MEDIA_METADATA_RESPONSE_INVALID');
  const source = message.rawSource || {};
  const row = {
    id: message.id,
    accountId: source.accountId || '',
    conversationId: message.conversationId,
    localId: message.rawLocalId || String(message.localId ?? ''),
    serverId: message.rawServerId || (message.serverId === undefined ? '' : message.serverId.toString()),
    localType: message.rawLocalType || (message.sourceType === undefined ? '' : message.sourceType.toString()),
    sentAtUnixMs: message.sentAtUnixMs.toString(),
    senderId: message.senderId || '',
    direction: message.direction ?? 0,
    kind: message.kind || '',
    source: { database: source.database || '', table: source.table || '', localId: source.localId || '' },
    refs: message.refs,
    ...(message.display ? { display: message.display } : {}),
    metadataOnly: true,
    mediaReady: false
  };
  const encoded = JSON.stringify(row);
  if (Buffer.byteLength(encoded, 'utf8') > MEDIA_METADATA_EXPORT_MAX_BYTES) throw error('MEDIA_METADATA_EXPORT_TOO_LARGE');
  return row;
}
function mediaMetadataExportOutput(format, meta, rows) {
  if (format === 'media-json') return Buffer.from(JSON.stringify({ version: 1, kind: 'media-metadata', format, metadataOnly: true, mediaReady: false, ...meta, itemCount: rows.length, items: rows }) + '\n', 'utf8');
  const headers = ['id', 'accountId', 'conversationId', 'localId', 'serverId', 'localType', 'sentAtUnixMs', 'senderId', 'direction', 'kind', 'sourceDatabase', 'sourceTable', 'sourceLocalId', 'refs', 'display', 'metadataOnly', 'mediaReady'];
  const values = row => [row.id, row.accountId, row.conversationId, row.localId, row.serverId, row.localType, row.sentAtUnixMs, row.senderId, row.direction, row.kind, row.source.database, row.source.table, row.source.localId, JSON.stringify(row.refs || []), JSON.stringify(row.display || null), row.metadataOnly, row.mediaReady];
  return Buffer.from([headers.join(','), ...rows.map(row => values(row).map(csvCell).join(','))].join('\n') + '\n', 'utf8');
}
function contactExportOutput(format, meta, items) {
  if (format === 'json') return JSON.stringify({ version: 1, format, ...meta, itemCount: items.length, contacts: items }) + '\n';
  if (format === 'csv') {
    const headers = ['username', 'alias', 'remark', 'nickname', 'localType', 'category'];
    return [headers.join(','), ...items.map(item => headers.map(header => csvCell(item[header])).join(','))].join('\n') + '\n';
  }
  if (format === 'vcf') return items.map(item => [
    'BEGIN:VCARD', 'VERSION:3.0', `FN:${contactVcardText(item.remark || item.nickname || item.username)}`,
    `N:${contactVcardText(item.nickname)};;;`, `X-WECHAT-USERNAME:${contactVcardText(item.username)}`,
    item.alias ? `X-WECHAT-ALIAS:${contactVcardText(item.alias)}` : '', item.remark ? `NOTE:${contactVcardText(item.remark)}` : '',
    'END:VCARD'
  ].filter(Boolean).join('\r\n')).join('\r\n') + (items.length ? '\r\n' : '');
  if (format === 'html') return `<!doctype html><meta charset="utf-8"><title>Alpha 通讯录</title><table><thead><tr><th>用户名</th><th>别名</th><th>备注</th><th>昵称</th><th>类型</th><th>分类</th></tr></thead><tbody>${items.map(item => `<tr><td>${htmlEscape(item.username)}</td><td>${htmlEscape(item.alias)}</td><td>${htmlEscape(item.remark)}</td><td>${htmlEscape(item.nickname)}</td><td>${htmlEscape(item.localType)}</td><td>${htmlEscape(item.category)}</td></tr>`).join('')}</tbody></table>\n`;
  if (format === 'xlsx') {
    const headers = ['username', 'alias', 'remark', 'nickname', 'localType', 'category'];
    return contactsXlsx(headers, items.map(item => headers.map(header => item[header])));
  }
  throw error('EXPORT_FORMAT_UNSUPPORTED');
}
function groupMemberExportText(value, maximum = 4096) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) throw error('BRIDGE_GENERAL_RECORD_INVALID');
  return value;
}
function groupMemberExportRow(record) {
  if (!record || typeof record !== 'object' || typeof record.actor !== 'string' || !record.actor.trim() || !Array.isArray(record.fields)) throw error('BRIDGE_GENERAL_RECORD_INVALID');
  const fields = {};
  for (const field of record.fields) {
    if (!field || typeof field.name !== 'string' || typeof field.value !== 'string') throw error('BRIDGE_GENERAL_RECORD_INVALID');
    if (!Object.hasOwn(fields, field.name)) fields[field.name] = field.value;
  }
  const username = groupMemberExportText(fields.username || record.actor, 1024);
  if (username !== record.actor) throw error('BRIDGE_GENERAL_RECORD_INVALID');
  const row = {
    username,
    groupNickname: groupMemberExportText(fields.groupNickname || ''),
    nickname: groupMemberExportText(fields.nickname || ''),
    remark: groupMemberExportText(fields.remark || ''),
    alias: groupMemberExportText(fields.alias || ''),
    isOwner: fields.isOwner === 'true'
  };
  if (fields.isOwner !== undefined && fields.isOwner !== 'true' && fields.isOwner !== 'false') throw error('BRIDGE_GENERAL_RECORD_INVALID');
  return row;
}
function groupMemberExportOutput(format, meta, items) {
  if (format === 'json') return JSON.stringify({ version: 1, format, ...meta, memberCount: items.length, members: items }) + '\n';
  const headers = ['username', 'groupNickname', 'nickname', 'remark', 'alias', 'isOwner'];
  if (format === 'csv') return [headers.join(','), ...items.map(item => headers.map(header => csvCell(item[header])).join(','))].join('\n') + '\n';
  if (format === 'html') return `<!doctype html><meta charset="utf-8"><title>Alpha 群成员</title><table><thead><tr>${headers.map(header => `<th>${htmlEscape(header)}</th>`).join('')}</tr></thead><tbody>${items.map(item => `<tr>${headers.map(header => `<td>${htmlEscape(item[header])}</td>`).join('')}</tr>`).join('')}</tbody></table>\n`;
  if (format === 'xlsx') return groupMembersXlsx(headers, items.map(item => headers.map(header => item[header])));
  throw error('EXPORT_FORMAT_UNSUPPORTED');
}

const RECORD_EXPORT_TABLES = Object.freeze({ payments: '__alpha_general_payments', friend_requests: '__alpha_general_friend_requests', revokes: '__alpha_general_revokes', calls: '__alpha_general_calls' });
const RECORD_EXPORT_MAX_ITEMS = 20000;
const RECORD_EXPORT_MAX_BYTES = 64 * 1024 * 1024;
// Keep each bridge response comfortably below the framed transport limit even
// when candidate rows carry many bounded fields. The scan remains bounded to
// the bridge's 20,000-record ceiling.
const RECORD_EXPORT_PAGE_SIZE = 100;
const MOMENT_EXPORT_FORMATS = new Set(['html', 'json', 'markdown', 'txt']);
const MOMENT_EXPORT_PAGE_SIZE = 100;
const MOMENT_EXPORT_MAX_ITEMS = 100000;
const MOMENT_EXPORT_MAX_BYTES = 64 * 1024 * 1024;
const MOMENT_EXPORT_MAX_RUNTIME_MS = 30000;
const MOMENT_EXPORT_MAX_DETAIL_BYTES = 1024 * 1024;
const MOMENT_EXPORT_MAX_MEDIA = 100;
const MOMENT_EXPORT_MAX_LIKES = 10000;
const MOMENT_EXPORT_MAX_COMMENTS = 10000;
const MOMENT_EXPORT_MAX_COMMENT_EMOJIS = 16;
const MOMENT_EXPORT_MAX_COMMENT_IMAGES = 9;

function momentExportText(value, maximum = 16384) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) return '';
  return value;
}

function momentExportProjection(fields) {
  const candidates = fields.filter(field => field.name === '__alpha_moment_details');
  if (candidates.length === 0) return null;
  if (candidates.length !== 1) return { invalid: true };
  const field = candidates[0];
  if (field.truncated || Buffer.byteLength(field.value, 'utf8') > MOMENT_EXPORT_MAX_DETAIL_BYTES) return { invalid: true };
  let detail;
  try { detail = JSON.parse(field.value); } catch { return { invalid: true }; }
  if (!detail || typeof detail !== 'object' || Array.isArray(detail) || detail.schema !== 'alpha.moment.v1') return { invalid: true };
  if (detail.parseStatus !== 'plain' && detail.parseStatus !== 'parsed') return { invalid: true };
  const projection = {
    schema: 'alpha.moment.v1',
    parseStatus: detail.parseStatus,
    media: [],
    linkTitle: momentExportText(detail.linkTitle),
    location: momentExportText(detail.location),
    likes: [],
    comments: []
  };
  if (Array.isArray(detail.media)) {
    if (detail.media.length > MOMENT_EXPORT_MAX_MEDIA) return { invalid: true };
    projection.media = detail.media.flatMap(item => {
      if (!item || typeof item !== 'object' || (item.kind !== 'image' && item.kind !== 'video')) return [];
      const result = { kind: item.kind, type: Number.isSafeInteger(item.type) && item.type >= 0 ? item.type : 0, width: Number.isFinite(item.width) && item.width >= 0 ? Math.min(item.width, 100000) : 0, height: Number.isFinite(item.height) && item.height >= 0 ? Math.min(item.height, 100000) : 0 };
      if (item.livePhoto && typeof item.livePhoto === 'object' && !Array.isArray(item.livePhoto)) result.livePhoto = { durationMs: Number.isSafeInteger(item.livePhoto.durationMs) && item.livePhoto.durationMs >= 0 ? Math.min(item.livePhoto.durationMs, 86400000) : 0 };
      return [result];
    });
  }
  if (Array.isArray(detail.likes)) {
    if (detail.likes.length > MOMENT_EXPORT_MAX_LIKES) return { invalid: true };
    projection.likes = detail.likes.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const username = momentExportText(item.username, 512), nickname = momentExportText(item.nickname, 512);
      return username || nickname ? [{ username, nickname }] : [];
    });
  }
  if (Array.isArray(detail.comments)) {
    if (detail.comments.length > MOMENT_EXPORT_MAX_COMMENTS) return { invalid: true };
    projection.comments = detail.comments.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const result = {
        username: momentExportText(item.username, 512),
        nickname: momentExportText(item.nickname, 512),
        replyUsername: momentExportText(item.replyUsername, 512),
        replyNickname: momentExportText(item.replyNickname, 512),
        content: momentExportText(item.content),
        emojis: [],
        images: []
      };
      if (Array.isArray(item.emojis)) {
        if (item.emojis.length > MOMENT_EXPORT_MAX_COMMENT_EMOJIS) return [];
        result.emojis = item.emojis.flatMap(emoji => {
          if (!emoji || typeof emoji !== 'object' || !syntheticMomentEmojiSource(emoji.source)) return [];
          return [{ source: emoji.source, width: Number.isFinite(emoji.width) && emoji.width >= 0 ? Math.min(emoji.width, 100000) : 0, height: Number.isFinite(emoji.height) && emoji.height >= 0 ? Math.min(emoji.height, 100000) : 0 }];
        });
      }
      if (Array.isArray(item.images)) {
        if (item.images.length > MOMENT_EXPORT_MAX_COMMENT_IMAGES) return [];
        result.images = item.images.flatMap(image => {
          if (!image || typeof image !== 'object' || (image.kind !== 'image' && image.kind !== 'video')) return [];
          return [{ kind: image.kind, type: Number.isSafeInteger(image.type) && image.type >= 0 ? image.type : 0, width: Number.isFinite(image.width) && image.width >= 0 ? Math.min(image.width, 100000) : 0, height: Number.isFinite(image.height) && image.height >= 0 ? Math.min(image.height, 100000) : 0 }];
        });
      }
      return [result];
    });
  }
  if (detail.finder && typeof detail.finder === 'object' && !Array.isArray(detail.finder) && (detail.finder.kind === 'feed' || detail.finder.kind === 'live')) {
    projection.finder = { kind: detail.finder.kind, nickname: momentExportText(detail.finder.nickname, 512), desc: momentExportText(detail.finder.desc, 4096), mediaCount: Number.isFinite(detail.finder.mediaCount) && detail.finder.mediaCount >= 0 ? Math.min(detail.finder.mediaCount, 100000) : 0 };
  }
  if (detail.music && typeof detail.music === 'object' && !Array.isArray(detail.music) && momentExportText(detail.music.title, 1024)) {
    projection.music = { title: momentExportText(detail.music.title, 1024), singer: momentExportText(detail.music.singer, 1024), album: momentExportText(detail.music.album, 1024), durationMs: Number.isSafeInteger(detail.music.durationMs) && detail.music.durationMs >= 0 ? Math.min(detail.music.durationMs, 86400000) : 0 };
  }
  return projection;
}

function recordExportPlainRecord(record) {
  if (!record || typeof record !== 'object' || typeof record.id !== 'string' || typeof record.tableName !== 'string' || typeof record.actor !== 'string' || typeof record.content !== 'string' || !Array.isArray(record.fields)) throw error('BRIDGE_GENERAL_RECORD_INVALID');
  if (typeof record.eventAtUnixMs !== 'bigint' || record.eventAtUnixMs < -(1n << 63n) || record.eventAtUnixMs > (1n << 63n) - 1n || record.fields.length > 32) throw error('BRIDGE_GENERAL_RECORD_INVALID');
  const fields = record.fields.map(field => {
    if (!field || typeof field.name !== 'string' || typeof field.value !== 'string' || !Number.isInteger(field.valueKind) || field.valueKind < 0 || field.valueKind > 16 || typeof field.truncated !== 'boolean') throw error('BRIDGE_GENERAL_RECORD_INVALID');
    return { name: field.name, value: field.value, valueKind: field.valueKind, truncated: field.truncated };
  });
  return { tableName: record.tableName, id: record.id, eventAtUnixMs: record.eventAtUnixMs.toString(), actor: record.actor, content: record.content, fields };
}

function recordExportOutput(format, meta, records) {
  const plain = records.map(recordExportPlainRecord);
  if (format === 'json') return Buffer.from(JSON.stringify({ version: 1, kind: 'records', format, ...meta, partial: true, candidate: true, recordCount: plain.length, records: plain }) + '\n', 'utf8');
  const baseHeaders = ['id', 'tableName', 'eventAtUnixMs', 'actor', 'content'];
  const names = [...new Set(plain.flatMap(record => record.fields.map(field => field.name)))].sort((a, b) => a.localeCompare(b));
  const headers = [...baseHeaders, ...names.map(name => `field.${name}`)];
  const rows = plain.map(record => {
    const values = new Map(record.fields.map(field => [field.name, field.value]));
    return [...baseHeaders.map(header => record[header]), ...names.map(name => values.get(name) ?? '')];
  });
  if (format === 'csv') return Buffer.from([headers.join(','), ...rows.map(row => row.map(csvCell).join(','))].join('\n') + '\n', 'utf8');
  if (format === 'xlsx') return recordsXlsx(headers, rows, meta.category, 'RECORD_EXPORT_TOO_LARGE', RECORD_EXPORT_MAX_ITEMS);
  throw error('RECORD_EXPORT_FORMAT_UNSUPPORTED');
}

function momentExportRow(moment) {
  if (!moment || typeof moment !== 'object' || typeof moment.id !== 'string' || !moment.id || typeof moment.username !== 'string' || !moment.username || typeof moment.nickname !== 'string' || typeof moment.createdAtUnixMs !== 'bigint' || typeof moment.type !== 'number' || !Number.isInteger(moment.type) || moment.type < 0 || moment.type > 0xffffffff || typeof moment.text !== 'string' || typeof moment.rawXml !== 'string' || moment.sourceTable !== '__alpha_moments_v1' || !Array.isArray(moment.fields)) throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
  if (moment.fields.length > 32 || moment.text.length > 4 * 1024 * 1024 || moment.rawXml.length > 4 * 1024 * 1024 || moment.id.length > 1024 || moment.username.length > 1024 || moment.nickname.length > 4096 || [moment.id, moment.username, moment.nickname, moment.text, moment.rawXml].some(value => value.includes('\0'))) throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
  const fields = moment.fields.map(field => {
    if (!field || typeof field.name !== 'string' || !field.name || typeof field.value !== 'string' || !Number.isInteger(field.valueKind) || field.valueKind < 0 || field.valueKind > 16 || typeof field.truncated !== 'boolean' || field.name.length > 256 || field.value.length > 4096 || field.name.includes('\0') || field.value.includes('\0')) throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
    return { name: field.name, value: field.value, valueKind: field.valueKind, truncated: field.truncated };
  });
  const projection = momentExportProjection(fields);
  return { id: moment.id, username: moment.username, nickname: moment.nickname, createdAtUnixMs: moment.createdAtUnixMs.toString(), type: moment.type, text: moment.text, sourceTable: moment.sourceTable, projection: projection && !projection.invalid ? projection : undefined, projectionAvailable: Boolean(projection && !projection.invalid) };
}
function momentExportValue(item) {
  return { id: item.id, username: item.username, nickname: item.nickname, createdAtUnixMs: item.createdAtUnixMs, type: item.type, text: item.text, sourceTable: item.sourceTable, projectionAvailable: item.projectionAvailable === true, ...(item.projectionAvailable === true ? { projection: item.projection } : {}) };
}
function momentExportProjectionLines(item) {
  const projection = item.projectionAvailable === true ? item.projection : null;
  if (!projection) return [];
  const lines = [`- projectionSchema: ${projection.schema}`, `- parseStatus: ${projection.parseStatus}`];
  if (projection.location) lines.push(`- location: ${projection.location}`);
  if (projection.linkTitle) lines.push(`- linkTitle: ${projection.linkTitle}`);
  if (projection.media.length) lines.push(`- mediaMetadata: ${projection.media.map(media => `${media.kind} ${media.width}x${media.height}`).join(', ')}`);
  if (projection.likes.length) lines.push(`- likes: ${projection.likes.map(person => person.nickname || person.username).join('、')}`);
  for (const comment of projection.comments) {
    const who = comment.nickname || comment.username || '微信用户';
    const reply = comment.replyNickname || comment.replyUsername;
    const text = comment.content || '';
    const media = [...comment.emojis.map(emoji => emoji.verified === true ? `verified emoji ${emoji.source} sha256=${emoji.sha256} sizeBytes=${emoji.sizeBytes} mimeType=${emoji.mimeType}` : `emoji ${emoji.source} (unverified metadata omitted)`), ...comment.images.map(image => `${image.kind} ${image.width}x${image.height}`)];
    lines.push(`- comment${reply ? ` to ${reply}` : ''}: ${who}: ${text}${media.length ? ` [${media.join('; ')}]` : ''}`);
  }
  return lines;
}
function momentExportOutput(format, meta, moments) {
  const values = moments.map(momentExportValue);
  if (format === 'json') return Buffer.from(JSON.stringify({ version: 1, kind: 'moments', format, syntheticOnly: true, metadataOnly: true, ...meta, projectionAvailable: values.some(item => item.projectionAvailable), itemCount: values.length, moments: values }) + '\n', 'utf8');
  if (format === 'markdown') {
    const lines = ['# Alpha synthetic moments export', '', '- syntheticOnly: true', '- metadataOnly: true', `- accountId: ${meta.accountId}`, `- projectionAvailable: ${values.some(item => item.projectionAvailable)}`, `- itemCount: ${values.length}`, ''];
    for (const item of values) lines.push(`## ${item.createdAtUnixMs} · ${item.nickname || item.username}`, '', `- username: ${item.username}`, `- id: ${item.id}`, `- type: ${item.type}`, `- projectionAvailable: ${item.projectionAvailable}`, ...momentExportProjectionLines(item), '', item.text, '');
    return Buffer.from(lines.join('\n'), 'utf8');
  }
  if (format === 'txt') {
    const lines = ['Alpha synthetic moments export', 'syntheticOnly: true', 'metadataOnly: true', `accountId: ${meta.accountId}`, `projectionAvailable: ${values.some(item => item.projectionAvailable)}`, `itemCount: ${values.length}`, ''];
    for (const item of values) lines.push(`[${item.createdAtUnixMs}] ${item.nickname || item.username} <${item.type}> projectionAvailable=${item.projectionAvailable} ${item.text}`, ...momentExportProjectionLines(item), '');
    return Buffer.from(lines.join('\n'), 'utf8');
  }
  if (format === 'html') {
    const cards = values.map(item => {
      const projection = item.projectionAvailable ? item.projection : null;
      const interactions = projection ? `<p class="projection">projection ${htmlEscape(projection.parseStatus)}${projection.likes.length ? ` · 赞：${htmlEscape(projection.likes.map(person => person.nickname || person.username).join('、'))}` : ''}</p>${projection.comments.map(comment => `<p class="comment">${htmlEscape(comment.nickname || comment.username || '微信用户')}${comment.replyNickname || comment.replyUsername ? ` → ${htmlEscape(comment.replyNickname || comment.replyUsername)}` : ''}：${htmlEscape(comment.content)}${comment.emojis.length ? ` [${htmlEscape(comment.emojis.map(emoji => emoji.verified === true ? `verified emoji ${emoji.source} sha256=${emoji.sha256} sizeBytes=${emoji.sizeBytes} mimeType=${emoji.mimeType}` : `emoji ${emoji.source} (unverified metadata omitted)`).join('; '))}]` : ''}</p>`).join('')}` : '';
      return `<article><header><time>${htmlEscape(item.createdAtUnixMs)}</time><strong>${htmlEscape(item.nickname || item.username)}</strong><span>${htmlEscape(item.username)}</span></header><dl><dt>id</dt><dd>${htmlEscape(item.id)}</dd><dt>type</dt><dd>${htmlEscape(item.type)}</dd><dt>projection</dt><dd>${item.projectionAvailable ? 'available' : 'unavailable'}</dd></dl><p>${htmlEscape(item.text)}</p>${interactions}</article>`;
    }).join('\n');
    return Buffer.from(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="alpha-synthetic-only" content="true"><meta name="alpha-media" content="metadata-only"><title>Alpha synthetic moments export</title><style>body{margin:2rem auto;max-width:64rem;font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif;color:#202124;background:#fff}article{border:1px solid #dadce0;border-radius:8px;padding:1rem;margin:1rem 0}header{display:flex;gap:.75rem;align-items:baseline;flex-wrap:wrap}header span{color:#5f6368;font-size:.85em}dl{display:grid;grid-template-columns:max-content 1fr;gap:.2rem 1rem;color:#5f6368}dt{font-weight:600}dd{margin:0}p{white-space:pre-wrap;overflow-wrap:anywhere}.projection,.comment{color:#3c4043;font-size:.92em}</style></head><body><h1>Alpha synthetic moments export</h1><p>仅包含 __alpha_moments_v1 合成朋友圈；显式 alpha.moment.v1 projection 只输出已验证的只读元数据，不输出原始 XML、原生 token 或可下载 URL。</p>${cards}</body></html>\n`, 'utf8');
  }
  throw error('MOMENT_EXPORT_FORMAT_UNSUPPORTED');
}

async function verifyMomentExportEmojis(row, accountId, resolveEmoji, mediaIndex) {
  if (!row.projectionAvailable || !row.projection || typeof resolveEmoji !== 'function' || !mediaIndex || !Array.isArray(mediaIndex.entries)) return row;
  const sources = new Set();
  for (const comment of row.projection.comments) for (const emoji of comment.emojis) sources.add(emoji.source);
  if (!sources.size) return row;
  const verified = new Map();
  for (const source of sources) {
    try {
      const resolved = await resolveEmoji({ accountId, source });
      if (!resolved || resolved.status !== 'ready' || typeof resolved.opaqueId !== 'string' || !MOMENT_EMOJI_MIMES.has(resolved.mimeType)) continue;
      const candidates = mediaIndex.entries.filter(entry => entry.kind === 'image' && entry.sha256 === resolved.opaqueId && entry.mimeType === resolved.mimeType && (!entry.accountId || entry.accountId === accountId));
      if (candidates.length !== 1) continue;
      const entry = candidates[0];
      verified.set(source, { source, verified: true, sha256: entry.sha256, sizeBytes: entry.sizeBytes, mimeType: entry.mimeType });
    } catch {}
  }
  row.projection = { ...row.projection, comments: row.projection.comments.map(comment => ({ ...comment, emojis: comment.emojis.flatMap(emoji => {
    const metadata = verified.get(emoji.source);
    return metadata ? [{ ...metadata, width: emoji.width, height: emoji.height }] : [];
  }) })) };
  return row;
}

async function writeRecordDestination(destinationPath, output, excluded, guard) {
  const temporary = path.join(path.dirname(destinationPath), `.alpha-record-export-${crypto.randomUUID()}.tmp`);
  let handle;
  const createdDirectories = [];
  try {
    prepareExportPath(destinationPath, excluded, guard, createdDirectories);
    handle = await fs.promises.open(temporary, 'wx', 0o600);
    await handle.writeFile(output);
    await handle.sync();
    await handle.close(); handle = null;
    guard();
    inspectExportPath(destinationPath, excluded);
    await fs.promises.link(temporary, destinationPath);
    await fs.promises.unlink(temporary);
  } catch (failure) {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    cleanupExportDirectories(createdDirectories);
    if (failure.message === 'EXPORT_OUTPUT_EXISTS' || failure.code === 'EEXIST') throw error('EXPORT_OUTPUT_EXISTS');
    if (/^[A-Z][A-Z0-9_]{1,95}$/.test(failure.message || '')) throw failure;
    throw error('EXPORT_OUTPUT_FAILED');
  }
  return destinationPath;
}

async function createEngine({ lock, stateDir, bridgePath, importerPath = '', encryptedDir = '', snapshotRoot = '', dataDir = '', accountId = '', selfUsername = '', importerTimeoutMs = 115000, bridgeFactory = options => new BridgeClient(options) }) {
  if (!lock || typeof lock.assertAccess !== 'function') throw error('SECURITY_PROVIDER_REQUIRED');
  safeStateDirectory(stateDir);
  if (dataDir && encryptedDir) throw error('DATA_SOURCE_CONFIGURATION_INVALID');
  if ((dataDir || encryptedDir) && (!accountId || accountId.length > 256 || /[\x00-\x1f]/.test(accountId))) throw error('DATA_SOURCE_CONFIGURATION_INVALID');
  if (dataDir && !path.isAbsolute(dataDir)) throw error('DATA_SOURCE_CONFIGURATION_INVALID');
  if (encryptedDir && !path.isAbsolute(encryptedDir)) throw error('ENCRYPTED_SOURCE_PATH_INVALID');
  if ((dataDir || encryptedDir) && (!bridgePath || !path.isAbsolute(bridgePath))) throw error('BRIDGE_PATH_INVALID');
  if (encryptedDir && (!importerPath || !path.isAbsolute(importerPath))) throw error('IMPORTER_PATH_INVALID');
  if (!snapshotRoot) snapshotRoot = path.join(stateDir, 'snapshots');
  if (snapshotRoot !== path.join(stateDir, 'snapshots')) throw error('SNAPSHOT_ROOT_INVALID');
  if (!Number.isSafeInteger(importerTimeoutMs) || importerTimeoutMs < 1 || importerTimeoutMs > 115000) throw error('IMPORT_TIMEOUT_INVALID');
  if (selfUsername && /[\x00-\x1f]/.test(selfUsername)) throw error('SELF_USERNAME_INVALID');
  const selectionFile = path.join(stateDir, 'selected-source.v1.json');
  const removedAccountFile = path.join(stateDir, 'removed-account.v1.json');
  const telemetryFile = path.join(stateDir, 'telemetry-consent.v1.json');
  let selectedId = '', selectedPath = '', accountRemoved = false, accountRemovalInProgress = false, bridge = null, info = null, helloDone = false;
  let telemetryStateLoaded = false;
  let telemetryState = { decision: '', categories: [], consentVersion: TELEMETRY_DEFAULT_CONSENT_VERSION };
  // Image keys are deliberately process-local. The independent backend has
  // no verified DAT decoder or native media provider yet, so retaining a
  // manually supplied key must never imply that media is usable or write the
  // key into stateDir, logs, manifests, or a child-process environment.
  let imageKeyState = null;
  // Optional independent media index. It is loaded only from the explicitly
  // selected source root and never inferred from arbitrary home-directory
  // paths. A malformed/missing manifest leaves metadata refs unchanged.
  let mediaIndexState;
  // Acquisition progress is deliberately process-local. It is a bounded
  // status journal, never a key/path/credential store, and is lost on restart.
  let acquisitionEventSeq = 0n;
  const acquisitionEvents = [];
  let activeImport = null, snapshotLoaded = false, sourceInventory = null, outputInventory = null, sourceFailure = '', closed = false;
  const snapshotOptions = { snapshotRoot, accountId, encryptedDir };
  const names = new Map();
  const configuredSourcePath = encryptedDir || dataDir;
  function loadTelemetryState() {
    if (telemetryStateLoaded) return telemetryState;
    let fd;
    try {
      fd = fs.openSync(telemetryFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > TELEMETRY_STATE_MAX_BYTES || (stat.mode & 0o077)) throw error('TELEMETRY_STATE_INVALID');
      let parsed;
      try { parsed = JSON.parse(fs.readFileSync(fd, 'utf8')); } catch { throw error('TELEMETRY_STATE_INVALID'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== TELEMETRY_STATE_VERSION || !TELEMETRY_DECISIONS.has(parsed.decision)) throw error('TELEMETRY_STATE_INVALID');
      const categories = telemetryCategories(parsed.categories);
      const consentVersion = telemetryConsentVersion(parsed.consentVersion);
      telemetryState = { decision: parsed.decision, categories, consentVersion };
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure.message === 'TELEMETRY_STATE_INVALID' ? failure : error('TELEMETRY_STATE_INVALID');
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    telemetryStateLoaded = true;
    return telemetryState;
  }
  function saveTelemetryState(next) {
    safeStateDirectory(stateDir);
    const temporary = path.join(stateDir, `.telemetry-${crypto.randomUUID()}`);
    const serialized = JSON.stringify({ version: TELEMETRY_STATE_VERSION, ...next }) + '\n';
    if (Buffer.byteLength(serialized, 'utf8') > TELEMETRY_STATE_MAX_BYTES) throw error('TELEMETRY_STATE_INVALID');
    try {
      fs.writeFileSync(temporary, serialized, { flag: 'wx', mode: 0o600 });
      fs.chmodSync(temporary, 0o600);
      fs.renameSync(temporary, telemetryFile);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    telemetryState = { decision: next.decision, categories: [...next.categories], consentVersion: next.consentVersion };
    telemetryStateLoaded = true;
  }
  function telemetryStatus() {
    const state = loadTelemetryState();
    return {
      configured: Boolean(state.decision),
      consentDecision: state.decision,
      consentCategories: [...state.categories],
      queuedCount: 0n,
      queuedBytes: 0n,
      nextAttemptUnixMs: 0n,
      lastErrorCode: state.decision === 'granted' ? TELEMETRY_DISABLED_ERROR : ''
    };
  }
  try {
    const fd = fs.openSync(selectionFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077)) throw error('ENGINE_STATE_INVALID');
      const state = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (state.version !== 1 || typeof state.id !== 'string' || typeof state.path !== 'string') throw error('ENGINE_STATE_INVALID');
      selectedId = state.id; selectedPath = state.path;
    } finally { fs.closeSync(fd); }
  } catch (failure) { if (failure.code !== 'ENOENT') throw error('ENGINE_STATE_INVALID'); }
  try {
    const fd = fs.openSync(removedAccountFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077)) throw error('ENGINE_STATE_INVALID');
      const state = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (state.version !== 1 || typeof state.accountId !== 'string' || state.accountId !== accountId || !state.accountId) throw error('ENGINE_STATE_INVALID');
      accountRemoved = true;
    } finally { fs.closeSync(fd); }
  } catch (failure) { if (failure.code !== 'ENOENT') throw error('ENGINE_STATE_INVALID'); }
  function saveSelection() {
    safeStateDirectory(stateDir);
    const temporary = path.join(stateDir, `.selected-${crypto.randomUUID()}`);
    try { fs.writeFileSync(temporary, JSON.stringify({ version: 1, id: accountId, path: configuredSourcePath }) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, selectionFile); }
    finally { fs.rmSync(temporary, { force: true }); }
    selectedId = accountId; selectedPath = configuredSourcePath;
  }
  function removeSelection() {
    try {
      const stat = fs.lstatSync(selectionFile);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw error('ENGINE_STATE_INVALID');
      fs.unlinkSync(selectionFile);
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure.message === 'ENGINE_STATE_INVALID' ? failure : error('ENGINE_STATE_INVALID');
    }
    selectedId = ''; selectedPath = '';
  }
  function saveRemovedAccount() {
    safeStateDirectory(stateDir);
    const temporary = path.join(stateDir, `.removed-account-${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, JSON.stringify({ version: 1, accountId }) + '\n', { flag: 'wx', mode: 0o600 });
      fs.chmodSync(temporary, 0o600);
      fs.renameSync(temporary, removedAccountFile);
    } finally { fs.rmSync(temporary, { force: true }); }
  }
  function clearRemovedAccount() {
    try {
      const stat = fs.lstatSync(removedAccountFile);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) throw error('ENGINE_STATE_INVALID');
      fs.unlinkSync(removedAccountFile);
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure.message === 'ENGINE_STATE_INVALID' ? failure : error('ENGINE_STATE_INVALID');
    }
    accountRemoved = false;
  }
  function guard(signal) { lock.assertAccess(); if (closed) throw error('ENGINE_CLOSED'); if (signal?.aborted) throw error(signal.reason?.message === 'IMPORT_TIMEOUT' ? 'IMPORT_TIMEOUT' : 'IMPORT_CANCELED'); }
  function importErrorCode(failure) {
    return /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message ?? '') ? failure.message : 'IMPORT_FAILED';
  }
  function recordAcquisitionEvent(operation, phase, completedSteps, messageKey, terminal = false, errorCode = '') {
    if (!Number.isInteger(phase) || phase < 0 || phase > 6 || !Number.isInteger(completedSteps) || completedSteps < 0 || completedSteps > IMPORT_EVENT_TOTAL_STEPS || typeof messageKey !== 'string' || messageKey.length > 256 || !/^[a-zA-Z0-9._-]*$/.test(messageKey) || typeof errorCode !== 'string' || errorCode.length > 96 || !/^[A-Z][A-Z0-9_]{1,95}$/.test(errorCode) && errorCode !== '') return;
    if (acquisitionEventSeq >= 18446744073709551615n) return;
    const event = Object.freeze({ eventSeq: ++acquisitionEventSeq, phase, completedSteps, totalSteps: IMPORT_EVENT_TOTAL_STEPS, messageKey, terminal: Boolean(terminal), errorCode });
    acquisitionEvents.push(event);
    if (acquisitionEvents.length > IMPORT_EVENT_HISTORY_LIMIT) acquisitionEvents.splice(0, acquisitionEvents.length - IMPORT_EVENT_HISTORY_LIMIT);
    if (operation) {
      operation.phase = phase;
      operation.completedSteps = completedSteps;
      operation.messageKey = messageKey;
      operation.terminal = Boolean(terminal);
    }
  }
  function watchAcquisition(request) {
    if (closed) throw error('ENGINE_CLOSED');
    if (!request || request.accountId !== accountId || typeof request.afterEventSeq !== 'bigint' || request.afterEventSeq < 0n || request.afterEventSeq > 18446744073709551615n) throw error('DATABASE_KEY_ACQUISITION_REQUEST_INVALID');
    const events = acquisitionEvents.filter(event => event.eventSeq > request.afterEventSeq);
    return { active: Boolean(activeImport && !activeImport.terminal), events, lastEventSeq: acquisitionEventSeq };
  }
  function independentMediaIndex() {
    if (mediaIndexState !== undefined) return mediaIndexState;
    if (!dataDir || !path.isAbsolute(dataDir)) { mediaIndexState = null; return mediaIndexState; }
    try {
      // The data directory is explicitly selected by the caller. The optional
      // manifest may add its own account binding; when present it must agree
      // with the engine account before any local URI is emitted.
      mediaIndexState = loadMediaIndex({ root: dataDir, expectedAccountId: accountId });
    } catch (failure) {
      // A missing manifest is the normal metadata-only case. A malformed
      // manifest is remembered as unavailable for this engine lifetime so a
      // later call cannot accidentally bless changed source state.
      mediaIndexState = failure?.message === 'MEDIA_INDEX_MANIFEST_MISSING' ? null : { error: 'MEDIA_INDEX_UNAVAILABLE' };
    }
    return mediaIndexState;
  }
  function clearImageKeyState() {
    if (imageKeyState?.aesKey instanceof Uint8Array) imageKeyState.aesKey.fill(0);
    imageKeyState = null;
  }
  function imageMediaStatus() {
    const configured = imageKeyState !== null;
    return {
      detected: false,
      usable: false,
      enabled: configured,
      verified: false,
      automaticSupported: false,
      provider: configured ? 'independent-memory-key' : '',
      sampleUri: '',
      errorCode: configured ? 'INDEPENDENT_MEDIA_DECODER_UNAVAILABLE' : 'INDEPENDENT_IMAGE_KEY_UNCONFIGURED',
      memoryScanSupported: false
    };
  }
  function imageKeyEvidence() {
    const digest = Buffer.from(sha('alpha-independent-image-key-v1:memory-only'), 'hex');
    return {
      provider: 'independent-memory-key',
      datMagicVerified: false,
      verification: 'memory-only-key-stored; media-decoder-unavailable',
      templatesChecked: 0,
      matchingTemplates: 0,
      evidenceDigest: new Uint8Array(digest)
    };
  }
  async function dropBridge() { const old = bridge; bridge = null; info = null; names.clear(); clearImageKeyState(); if (old) await old.close(); }
  function checkedInfo(value) {
    if (!value || value.id !== accountId || value.readOnly !== true || value.sourceKind !== 'offline-wechat-v4' || typeof value.snapshotId !== 'string' || !value.snapshotId || !Array.isArray(value.capabilities) || !value.capabilities.includes('account.info')) throw error('BRIDGE_ACCOUNT_INVALID');
    return value;
  }
  async function restoreSnapshot() {
    guard(); if (!encryptedDir || snapshotLoaded) return;
    const manifest = await snapshot.readManifest(snapshotOptions, guard); guard();
    // Validate the explicitly configured source even before returning discovered.
    const original = await snapshot.inventory(encryptedDir, guard); guard();
    if (!manifest || original.fingerprint !== manifest.sourceFingerprint) {
      dataDir = ''; sourceInventory = original; outputInventory = null; snapshotLoaded = true; return;
    }
    const output = await snapshot.inventory(manifest.outputDir, guard, true); guard();
    snapshot.matchInventory(original, output, manifest.databases);
    dataDir = manifest.outputDir; sourceInventory = original; outputInventory = output; snapshotLoaded = true;
  }
  async function source() {
    guard(); if (activeImport) throw error('IMPORT_IN_PROGRESS');
    if (sourceFailure) throw error(sourceFailure);
    await restoreSnapshot(); guard();
    if (!dataDir) throw error(encryptedDir ? 'DATABASE_KEY_REQUIRED' : 'ACCOUNT_NOT_FOUND');
    try {
      if (encryptedDir) { await snapshot.verifyStamps(sourceInventory, guard); await snapshot.verifyStamps(outputInventory, guard); }
      if (!bridge || bridge.closed) { bridge = bridgeFactory({ executable: bridgePath, dataDir, accountId }); info = null; names.clear(); }
      const value = checkedInfo(await bridge.call('account.info')); guard();
      if (info && info.snapshotId !== value.snapshotId) names.clear();
      info = value; return info;
    } catch (failure) {
      // Reopening after DATASET_CHANGED would silently bless a new dataset.
      // Keep the failure for this engine lifetime or an explicit new import.
      sourceFailure = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure.message || '') ? failure.message : 'SOURCE_UNAVAILABLE';
      await dropBridge(); throw failure;
    }
  }
  async function callData(op, params) { await source(); const current = bridge; const result = await current.call(op, params); guard(); return result; }
  async function requireAccount(id) { guard(); if (accountRemovalInProgress) throw error('ACCOUNT_REMOVAL_IN_PROGRESS'); if (accountRemoved || id !== accountId || !configuredSourcePath) throw error('ACCOUNT_NOT_FOUND'); return source(); }
  function messageRefs(row, conversationId, messageId) {
    if (row?.refs === undefined) return [];
    if (!Array.isArray(row.refs) || row.refs.length > 4) throw error('BRIDGE_MESSAGE_REFS_INVALID');
    return row.refs.map(ref => {
      if (!ref || typeof ref !== 'object' || !['image', 'video', 'voice', 'file'].includes(ref.kind)) throw error('BRIDGE_MESSAGE_REFS_INVALID');
      for (const [field, maximum] of [['id', 128], ['uri', 4096], ['mimeType', 128], ['rendition', 64]]) {
        if (ref[field] !== undefined && (typeof ref[field] !== 'string' || ref[field].length > maximum || ref[field].includes('\0'))) throw error('BRIDGE_MESSAGE_REFS_INVALID');
      }
      const id = ref.id || '', uri = ref.uri || '';
      if (!id && !uri) throw error('BRIDGE_MESSAGE_REFS_INVALID');
      if (uri && !/^https?:\/\/[^\s<>]+$/i.test(uri)) throw error('BRIDGE_MESSAGE_REFS_INVALID');
      if (id && !/^[A-Za-z0-9._:-]+$/.test(id)) throw error('BRIDGE_MESSAGE_REFS_INVALID');
      const result = { kind: ref.kind, ...(ref.id ? { id: ref.id } : {}), ...(ref.uri ? { uri: ref.uri } : {}), ...(ref.mimeType ? { mimeType: ref.mimeType } : {}), ...(ref.rendition ? { rendition: ref.rendition } : {}) };
      // Bind a local media ref only when the explicitly supplied index identifies
      // the same account-scoped conversation/message. The URI is an
      // independent content-addressed token; it is never Alpha's media1_
      // token and does not imply DAT/AES compatibility.
      if (['image', 'video', 'voice', 'file'].includes(result.kind) && result.id) {
        const index = independentMediaIndex();
        const rendition = result.rendition || 'source';
        const indexedRendition = result.kind === 'voice' ? 'wav' : rendition;
        const entry = index && Array.isArray(index.entries) ? index.entries.find(item => item.kind === result.kind && (!item.accountId || item.accountId === accountId) && item.id === result.id && item.rendition === indexedRendition && (!item.conversationId || item.conversationId === conversationId) && (!item.messageId || item.messageId === messageId)) : null;
        if (entry) {
          result.uri = `alpha-media://sha256/${entry.sha256}`;
          if (result.kind === 'voice') result.rendition = entry.rendition;
          if (entry.mimeType) result.mimeType = entry.mimeType;
        }
      }
      return result;
    });
  }
  function messageFromRow(row, conversationId) {
    if (typeof row?.conversationId !== 'string' || !row.conversationId || (conversationId && row.conversationId !== conversationId)) throw error('BRIDGE_MESSAGE_SCOPE_INVALID');
    const local = decimal(row.localId), server = decimal(row.serverId, true), sentAt = milliseconds(row.createTime);
    const identity = { accountId, database: text(row.source?.database), table: text(row.source?.table), localId: row.localId };
    let content = '', unsupportedContent = false;
    if (row.contentDecodeStatus !== undefined && row.contentDecodeStatus !== 'decoded') {
      unsupportedContent = true; content = '[未支持的二进制消息内容]';
    } else if (row.contentEncoding === 'utf8') content = text(row.content, 4 * 1024 * 1024);
    else if (row.contentEncoding === 'binary') {
      const bytes = Buffer.from(text(row.contentBase64, 6 * 1024 * 1024), 'base64');
      if (bytes.subarray(0, 4).equals(Buffer.from([0x28, 0xb5, 0x2f, 0xfd]))) {
        try { content = new TextDecoder('utf-8', { fatal: true }).decode(zlib.zstdDecompressSync(bytes, { maxOutputLength: 4 * 1024 * 1024 })); } catch { unsupportedContent = true; }
      } else unsupportedContent = true;
      if (unsupportedContent) content = '[未支持的二进制消息内容]';
    } else throw error('BRIDGE_MESSAGE_ENCODING_INVALID');
    const rawType = decimal(row.localType), type = Number(rawType & 0xffffffffn);
    let kind = unsupportedContent ? 'unsupported' : ({ 1: 'text', 3: 'image', 34: 'voice', 42: 'contact', 43: 'video', 47: 'sticker', 48: 'location', 49: 'share', 10000: 'system' })[type] || 'unknown';
    const messageId = `msg-${sha(JSON.stringify(identity))}`;
    const refs = messageRefs(row, row.conversationId, messageId);
    let display, displayJson = new Uint8Array(0);
    if (!unsupportedContent && row.display !== undefined) {
      const checked = validateMessageDisplay(row.display);
      display = checked.value;
      displayJson = checked.bytes;
      // App.Type=57 is carried by the message's low-level type 49 envelope.
      // Only the independently parsed display projection can promote it to
      // the renderer's quote card; arbitrary rows cannot claim quote kind.
      if (type === 49 && display.kind === 'quote') kind = 'quote';
    }
    // A voice ref is verified from the row's real server_id, so retain it
    // when the encoded audio payload itself is not decodable as message text.
    return { id: messageId, localId: local <= 2147483647n ? Number(local) : 0, serverId: server, conversationId: row.conversationId, sourceId: `source-${sha(JSON.stringify([accountId, identity.database]))}`, sentAtUnixMs: sentAt, direction: selfUsername && row.sender ? row.sender === selfUsername ? 2 : 1 : 0, kind, text: content, senderId: text(row.sender), sourceType: rawType, platformMessageId: row.serverId, sourceToken: 'independent1_' + Buffer.from(JSON.stringify(identity)).toString('base64url'), refs: unsupportedContent ? refs.filter(ref => ref.kind === 'voice') : refs,
      // Keep exact bridge identity and decode state available to the offline exporter.
      rawLocalId: row.localId, rawServerId: row.serverId, rawLocalType: row.localType, rawSource: identity, contentDecodeStatus: unsupportedContent ? (row.contentDecodeStatus || 'unsupported') : 'decoded',
      ...(display ? { display, displayJson } : {}) };
  }
  async function resolveIndexedMessageMedia(request) {
    const account = requestName(request?.accountId, 'MESSAGE_MEDIA_REQUEST_INVALID');
    await requireAccount(account);
    if (typeof request.mediaResolveToken !== 'string' || request.mediaResolveToken.length > 4096) throw error('MESSAGE_MEDIA_REQUEST_INVALID');
    const tokenMatch = INDEPENDENT_MEDIA_TOKEN.exec(request.mediaResolveToken);
    if (!tokenMatch) throw error('MESSAGE_MEDIA_TOKEN_UNSUPPORTED');
    if (request.recordOffset !== undefined && (!Number.isInteger(request.recordOffset) || request.recordOffset < 0 || request.recordOffset > 1000000)) throw error('MESSAGE_MEDIA_REQUEST_INVALID');
    for (const field of ['preferLive', 'fetchRemote', 'allowPending', 'liveVideo']) if (request[field] !== undefined && typeof request[field] !== 'boolean') throw error('MESSAGE_MEDIA_REQUEST_INVALID');
    if (request.preferLive === true || request.fetchRemote === true || request.allowPending === true || request.liveVideo === true || (request.recordOffset || 0) !== 0) throw error('MESSAGE_MEDIA_OPTION_UNSUPPORTED');
    if (request.expectedMediaMd5 !== undefined && typeof request.expectedMediaMd5 !== 'string') throw error('MESSAGE_MEDIA_REQUEST_INVALID');
    if (request.expectedMediaMd5) throw error('MESSAGE_MEDIA_MD5_UNVERIFIED');
    const expectedSentAt = request.expectedSentAtUnixMs;
    if (expectedSentAt !== undefined && (typeof expectedSentAt !== 'bigint' || expectedSentAt < 0n)) throw error('MESSAGE_MEDIA_REQUEST_INVALID');
    const expectedSize = request.expectedSizeBytes;
    if (expectedSize !== undefined && (typeof expectedSize !== 'bigint' || expectedSize < 0n)) throw error('MESSAGE_MEDIA_REQUEST_INVALID');
    const expectedConversation = request.expectedConversationId === undefined ? '' : request.expectedConversationId;
    const expectedMessage = request.expectedMessageId === undefined ? '' : request.expectedMessageId;
    if (typeof expectedConversation !== 'string' || expectedConversation.length > 1024 || expectedConversation.includes('\0') || typeof expectedMessage !== 'string' || expectedMessage.length > 2048 || expectedMessage.includes('\0')) throw error('MESSAGE_MEDIA_REQUEST_INVALID');
    const index = independentMediaIndex();
    if (!index || !Array.isArray(index.entries)) throw error(index?.error || 'MEDIA_INDEX_UNAVAILABLE');
    const sha256 = tokenMatch[1];
    const candidates = index.entries.filter(entry => entry.kind === 'image' && entry.sha256 === sha256 && (!entry.accountId || entry.accountId === account) && typeof entry.conversationId === 'string' && entry.conversationId && typeof entry.messageId === 'string' && entry.messageId && (!expectedConversation || entry.conversationId === expectedConversation) && (!expectedMessage || entry.messageId === expectedMessage));
    if (candidates.length !== 1) throw error(candidates.length ? 'MESSAGE_MEDIA_AMBIGUOUS' : 'MESSAGE_MEDIA_NOT_FOUND');
    const entry = candidates[0];
    if (expectedSize !== undefined && expectedSize !== BigInt(entry.sizeBytes)) throw error('MESSAGE_MEDIA_SIZE_MISMATCH');
    if (expectedSentAt !== undefined && (entry.sentAtUnixMs === undefined || BigInt(entry.sentAtUnixMs) !== expectedSentAt)) throw error('MESSAGE_MEDIA_TIMESTAMP_MISMATCH');
    // Re-read and hash the explicitly indexed file before exposing a ready
    // message. This keeps the manifest binding useful after source changes.
    await readMediaEntry(index, entry, { maxBytes: 64 * 1024 * 1024 });
    let cursor = '';
    const visited = new Set();
    for (let pageNumber = 0; pageNumber < MEDIA_RESOLVE_MAX_SCAN_PAGES; pageNumber += 1) {
      const page = checkedPage(await callData('messages.list', { conversationId: entry.conversationId, limit: MESSAGE_SOURCE_PAGE_SIZE, cursor, ascending: true }), MESSAGE_SOURCE_PAGE_SIZE);
      for (const row of page.items) {
        const message = messageFromRow(row, entry.conversationId);
        if (message.id !== entry.messageId) continue;
        const ref = message.refs.find(item => item.kind === 'image' && item.id === entry.id && item.uri === `alpha-media://sha256/${entry.sha256}` && (item.rendition || 'source') === (entry.rendition || 'source'));
        if (!ref) throw error('MESSAGE_MEDIA_REF_MISMATCH');
        if (expectedSentAt !== undefined && message.sentAtUnixMs !== expectedSentAt) throw error('MESSAGE_MEDIA_TIMESTAMP_MISMATCH');
        return { message: { ...message, mediaSizeBytes: BigInt(entry.sizeBytes) } };
      }
      if (!page.nextCursor) break;
      if (visited.has(page.nextCursor)) throw error('MESSAGE_MEDIA_UNAVAILABLE');
      visited.add(page.nextCursor); cursor = page.nextCursor;
    }
    throw error('MESSAGE_MEDIA_NOT_FOUND');
  }
  function generalRecordFromRow(row) {
    if (!row || !GENERAL_RECORD_TABLES.has(row.tableName) || typeof row.id !== 'string' || row.id.length > 2048 || row.id.includes('\0') || typeof row.eventAtUnixMs !== 'string' || typeof row.actor !== 'string' || typeof row.content !== 'string' || !Array.isArray(row.fields) || row.fields.length > 32) throw error('BRIDGE_GENERAL_RECORD_INVALID');
    const eventAtUnixMs = decimal(row.eventAtUnixMs, true);
    const fields = row.fields.map(field => {
      if (!field || typeof field.name !== 'string' || field.name.length > 256 || field.name.includes('\0') || typeof field.value !== 'string' || field.value.length > 4096 || field.value.includes('\0') || !Number.isInteger(field.valueKind) || field.valueKind < 0 || field.valueKind > 16 || typeof field.truncated !== 'boolean') throw error('BRIDGE_GENERAL_RECORD_INVALID');
      return { name: field.name, value: field.value, valueKind: field.valueKind, truncated: field.truncated };
    });
    return { tableName: row.tableName, id: row.id, eventAtUnixMs, actor: text(row.actor), content: text(row.content), fields };
  }
  function momentFromRow(row) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || row.id.length > 1024 || row.id.includes('\0') || typeof row.username !== 'string' || !row.username || row.username.length > 1024 || row.username.includes('\0') || typeof row.nickname !== 'string' || row.nickname.length > 4096 || row.nickname.includes('\0') || typeof row.createdAtUnixMs !== 'string' || typeof row.type !== 'number' || !Number.isInteger(row.type) || row.type < 0 || row.type > 0xffffffff || typeof row.text !== 'string' || row.text.length > 4 * 1024 * 1024 || row.text.includes('\0') || typeof row.rawXml !== 'string' || row.rawXml.length > 4 * 1024 * 1024 || row.rawXml.includes('\0') || typeof row.sourceTable !== 'string' || row.sourceTable !== '__alpha_moments_v1' || !Array.isArray(row.fields) || row.fields.length > 32) throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
    const createdAtUnixMs = decimal(row.createdAtUnixMs, true);
    const fields = row.fields.map(field => {
      if (!field || typeof field.name !== 'string' || !field.name || field.name.length > 256 || field.name.includes('\0') || typeof field.value !== 'string' || field.value.length > 4096 || field.value.includes('\0') || !Number.isInteger(field.valueKind) || field.valueKind < 0 || field.valueKind > 16 || typeof field.truncated !== 'boolean') throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
      return { name: field.name, value: field.value, valueKind: field.valueKind, truncated: field.truncated };
    });
    return { id: row.id, username: row.username, nickname: row.nickname, createdAtUnixMs, type: row.type, text: row.text, rawXml: row.rawXml, sourceTable: row.sourceTable, fields };
  }
  function favoriteFromRow(row) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !row.id || row.id.length > 1024 || row.id.includes('\0') || typeof row.type !== 'number' || !Number.isInteger(row.type) || row.type < 0 || row.type > 0xffffffff || typeof row.updatedAtUnixMs !== 'string' || typeof row.title !== 'string' || row.title.length > 4096 || row.title.includes('\0') || typeof row.description !== 'string' || row.description.length > 4 * 1024 * 1024 || row.description.includes('\0') || typeof row.sourceId !== 'string' || row.sourceId.length > 1024 || row.sourceId.includes('\0') || typeof row.fromUsername !== 'string' || row.fromUsername.length > 1024 || row.fromUsername.includes('\0') || typeof row.contentXml !== 'string' || row.contentXml.length > 4 * 1024 * 1024 || row.contentXml.includes('\0') || row.sourceTable !== '__alpha_favorites_v1' || !Array.isArray(row.fields) || row.fields.length > 32) throw error('BRIDGE_FAVORITES_RESPONSE_INVALID');
    const updatedAtUnixMs = decimal(row.updatedAtUnixMs, true);
    const fields = row.fields.map(field => {
      if (!field || typeof field.name !== 'string' || !field.name || field.name.length > 256 || field.name.includes('\0') || typeof field.value !== 'string' || field.value.length > 4096 || field.value.includes('\0') || !Number.isInteger(field.valueKind) || field.valueKind < 0 || field.valueKind > 16 || typeof field.truncated !== 'boolean') throw error('BRIDGE_FAVORITES_RESPONSE_INVALID');
      return { name: field.name, value: field.value, valueKind: field.valueKind, truncated: field.truncated };
    });
    // Synthetic fixtures intentionally carry no recovered source-message graph
    // or media token. Keep those protocol fields empty so callers cannot treat
    // the row as a native WeChat favorite.
    return { id: row.id, type: row.type, updatedAtUnixMs, title: row.title, description: row.description, sourceId: row.sourceId, fromUsername: row.fromUsername, contentXml: row.contentXml, sourceTable: row.sourceTable, fields, sourceLookup: undefined, mediaObjects: [], detailsTruncated: false };
  }
  function momentAuthorFromRow(row) {
    if (!row || typeof row !== 'object' || typeof row.username !== 'string' || !row.username || row.username.length > 1024 || row.username.includes('\0') || typeof row.nickname !== 'string' || row.nickname.length > 4096 || row.nickname.includes('\0') || !Number.isInteger(row.postCount) || row.postCount < 0 || row.postCount > 0xffffffff || typeof row.latestAtUnixMs !== 'string') throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
    return { username: row.username, nickname: row.nickname, postCount: row.postCount, latestAtUnixMs: decimal(row.latestAtUnixMs, true), isContact: row.isContact === true, remark: text(row.remark || '', 4096), contactNickname: text(row.contactNickname || '', 4096), alias: text(row.alias || '', 4096), avatarRef: text(row.avatarRef || '', 4096), quanPin: text(row.quanPin || '', 4096), remarkQuanPin: text(row.remarkQuanPin || '', 4096) };
  }
  function commonGroupsFromRow(value, limit) {
    if (!value || !Array.isArray(value.items) || value.items.length > limit || !Number.isInteger(value.count) || value.count < value.items.length || value.count > 100000 || typeof value.truncated !== 'boolean' || value.truncated !== (value.count > value.items.length) || typeof value.sourceDatabase !== 'string' || value.sourceDatabase.length > 1024 || value.sourceDatabase.includes('\0')) throw error('BRIDGE_COMMON_GROUPS_RESPONSE_INVALID');
    const seen = new Set();
    const items = value.items.map(item => {
      if (!item || typeof item !== 'object' || typeof item.username !== 'string' || !item.username || item.username.length > 256 || item.username !== item.username.trim() || /[\u0000-\u001f\u007f]/.test(item.username) || !item.username.endsWith('@chatroom') || seen.has(item.username) || typeof item.displayName !== 'string' || item.displayName.length > 1024 || item.displayName.includes('\0') || typeof item.avatarRef !== 'string' || item.avatarRef.length > 4096 || item.avatarRef.includes('\0')) throw error('BRIDGE_COMMON_GROUPS_RESPONSE_INVALID');
      seen.add(item.username);
      return { username: item.username, displayName: item.displayName, avatarRef: item.avatarRef };
    });
    return { items, count: value.count, truncated: value.truncated };
  }
  function account(value) {
    const selected = selectedId === accountId && selectedPath === configuredSourcePath;
    if (!value) return { id: accountId, sourceProfile: 'alpha-independent-encrypted-v4', subjectId: selfUsername, displayName: `加密数据源 · ${accountId}`, dataSourcePath: encryptedDir, schemaProfile: 'wechat-v4-encrypted', state: 1, handleState: 3, handleGeneration: 0n, activeHandleGeneration: 0n, selected, capabilities: ['offline-encrypted'], detected: true, usable: false, enabled: false, verified: false, ready: false };
    const capabilities = ['offline-readonly', ...Object.entries({ 'contacts.list': 'contacts', 'groups.members': 'group-members', 'sessions.list': 'conversations', 'messages.list': 'messages', 'messages.voicePlayback': 'voice-playback', 'moments.list': 'moments', 'moments.authors': 'moment-authors', 'moments.dayCounts': 'moment-day-counts', 'moments.emoji': 'moment-emoji', 'favorites.list': 'favorites', 'favorites.media': 'favorite-media' }).filter(([operation]) => value.capabilities.includes(operation)).map(([, capability]) => capability)];
    return { id: accountId, sourceProfile: 'alpha-independent-offline-v4', subjectId: selfUsername, displayName: `离线数据源 · ${accountId}`, dataSourcePath: configuredSourcePath, schemaProfile: 'wechat-v4-offline', state: 2, handleState: 4, handleGeneration: 1n, activeHandleGeneration: 1n, selected, capabilities, detected: true, usable: true, enabled: true, verified: true, ready: true };
  }
  async function contactName(username) {
    if (names.has(username)) return names.get(username);
    let found;
    try { found = checkedPage(await callData('contacts.list', { usernameExact: username, limit: 1, cursor: '' }), 1).items[0]; }
    catch (failure) { if (failure.message === 'CAPABILITY_UNAVAILABLE') return username; throw failure; }
    const name = found ? text(found.remark) || text(found.nickName) || username : username;
    names.set(username, name); return name;
  }
  async function lookupContactNames(usernames, accountInfo) {
    const unique = [...new Set(usernames)];
    const resolved = new Map();
    if (!unique.length || !(accountInfo?.capabilities?.includes('contacts') || accountInfo?.capabilities?.includes('contacts.list'))) return resolved;
    try {
      const value = contactCodec.checkedLookup(await callData('contacts.lookup', { usernames: contactCodec.validateLookupUsernames(unique) }), unique);
      for (const item of value.items) {
        const name = item.remark || item.nickname || item.username;
        names.set(item.username, name);
        resolved.set(item.username, name);
      }
      return resolved;
    } catch (failure) {
      // Older bridge candidates only implement contacts.list. Keep their
      // behavior while using one real bulk request whenever lookup exists.
      if (failure.message !== 'UNSUPPORTED_OPERATION' && failure.message !== 'CAPABILITY_UNAVAILABLE') throw failure;
      for (const username of unique) resolved.set(username, await contactName(username));
      return resolved;
    }
  }
  async function cancelImport() {
    const operation = activeImport;
    if (operation) { operation.controller.abort(); await operation.done; }
  }
  async function browseMessages(request, accountWide) {
    const code = accountWide ? 'ACCOUNT_MEDIA_REQUEST_INVALID' : 'TYPE_BROWSE_REQUEST_INVALID';
    const accountInfo = await requireAccount(request.accountId);
    const category = text(request.category, 32).toLowerCase();
    const allowed = accountWide ? ACCOUNT_MEDIA_CATEGORIES : TYPE_BROWSE_CATEGORIES;
    if (!allowed.has(category)) throw error(accountWide ? 'ACCOUNT_MEDIA_CATEGORY_UNSUPPORTED' : 'TYPE_BROWSE_CATEGORY_UNSUPPORTED');
    const conversationId = request.conversationId === undefined ? '' : requestName(request.conversationId, code, true);
    if (!accountWide && !conversationId) throw error(code);
    const senderId = accountWide ? '' : requestName(request.senderId, code, true);
    const from = browseBound(request.fromUnixMs, code), to = browseBound(request.toUnixMs, code);
    if (from !== undefined && to !== undefined && from > to) throw error(code);
    const page = browsePage(request, code);
    const scope = browseCursorScope(request, request.accountId, conversationId, category, senderId, from, to, accountWide ? 'account' : 'conversation');
    let state = decodeBrowseCursor(page.cursor, scope);
    if (!state) state = { scope, bridgeCursor: '', activeConversation: conversationId, sessionPageCursor: '', sessionPageOffset: 0, sessionPageCount: 0, sessionPageNextCursor: '', sessionDone: false };
    const validBrowseCursor = value => typeof value === 'string' && value.length <= 1024 && (!value || /^[A-Za-z0-9_-]+$/.test(value));
    if (!Number.isInteger(state.sessionPageOffset) || state.sessionPageOffset < 0 || state.sessionPageOffset > BROWSE_MAX_SCAN_CONVERSATIONS || !Number.isInteger(state.sessionPageCount) || state.sessionPageCount < 0 || state.sessionPageCount > 500 || !validBrowseCursor(state.sessionPageCursor) || !validBrowseCursor(state.sessionPageNextCursor) || !validBrowseCursor(state.bridgeCursor) || typeof state.activeConversation !== 'string' || state.activeConversation.length > 1024 || typeof state.sessionDone !== 'boolean') throw error('BROWSE_CURSOR_INVALID');
    if (state.activeConversation && (state.activeConversation.trim() !== state.activeConversation || /[\u0000-\u001f\u007f]/.test(state.activeConversation))) throw error('BROWSE_CURSOR_INVALID');
    if (accountWide && !conversationId && !accountInfo.capabilities.includes('sessions.list')) throw error('CAPABILITY_UNAVAILABLE');
    if (!accountInfo.capabilities.includes('messages.list')) throw error('CAPABILITY_UNAVAILABLE');
    const items = [];
    const seenBridgeCursors = new Set();
    let scanPages = 0;
    let scannedConversations = 0;
    let finished = false;
    // The bridge's lower bound is inclusive.  Use -1 for an epoch-zero
    // request so a zero-second row cannot be lost if a candidate bridge
    // normalizes its integer lower bound before applying the SQL predicate.
    const afterTime = from === undefined ? undefined : String(from === 0n ? -1n : (from - 1n) / 1000n);
    const beforeTime = to === undefined ? undefined : String(to >= INT64_MAX - 999n ? INT64_MAX / 1000n : (to + 999n) / 1000n);
    async function loadSessionPage() {
      const session = checkedPage(await callData('sessions.list', { limit: 500, cursor: state.sessionPageCursor }), 500);
      if (session.items.length === 0 && !session.nextCursor) { state.sessionDone = true; return false; }
      state.sessionPageCount = session.items.length;
      state.sessionPageNextCursor = session.nextCursor;
      if (state.sessionPageOffset >= session.items.length) {
        state.sessionPageCursor = session.nextCursor;
        state.sessionPageOffset = 0;
        state.sessionPageCount = 0;
        state.sessionPageNextCursor = '';
        return !!session.nextCursor;
      }
      state.activeConversation = requestName(session.items[state.sessionPageOffset].username, 'BRIDGE_SESSION_SCOPE_INVALID');
      state.bridgeCursor = '';
      return true;
    }
    while (items.length < page.pageSize && !finished) {
      if (accountWide && !state.activeConversation) {
        if (state.sessionDone) { finished = true; break; }
        if (state.sessionPageCount === 0) {
          const loaded = await loadSessionPage();
          if (!loaded) { finished = true; break; }
        } else {
          // Re-fetch the current session page when advancing after a completed
          // conversation. The cursor state stores only bounded page metadata.
          const session = checkedPage(await callData('sessions.list', { limit: 500, cursor: state.sessionPageCursor }), 500);
          if (state.sessionPageOffset >= session.items.length) {
            state.sessionPageCursor = state.sessionPageNextCursor;
            state.sessionPageOffset = 0;
            state.sessionPageCount = 0;
            state.sessionPageNextCursor = '';
            if (!state.sessionPageCursor) state.sessionDone = true;
            continue;
          }
          state.activeConversation = requestName(session.items[state.sessionPageOffset].username, 'BRIDGE_SESSION_SCOPE_INVALID');
          state.bridgeCursor = '';
        }
      }
      const currentConversation = state.activeConversation || conversationId;
      if (!currentConversation) { finished = true; break; }
      // Bound account-wide scans even when a session page contains many
      // conversations or a bridge keeps returning message pages without
      // advancing. The limit is per request and the opaque cursor continues
      // the bounded scan on the next page.
      if (accountWide && ++scannedConversations > BROWSE_MAX_SCAN_CONVERSATIONS) throw error('BROWSE_SCOPE_TOO_LARGE');
      if (++scanPages > BROWSE_MAX_SCAN_PAGES) break;
      const bridgeCursor = state.bridgeCursor;
      if (bridgeCursor && seenBridgeCursors.has(bridgeCursor)) throw error('BROWSE_CURSOR_STALLED');
      if (bridgeCursor) seenBridgeCursors.add(bridgeCursor);
      const query = { conversationId: currentConversation, limit: BROWSE_BRIDGE_PAGE, cursor: bridgeCursor, ascending: false, ...(afterTime !== undefined ? { afterTime } : {}), ...(beforeTime !== undefined ? { beforeTime } : {}) };
      const result = checkedPage(await callData('messages.list', query), BROWSE_BRIDGE_PAGE);
      for (const row of result.items) {
        const message = messageFromRow(row, currentConversation);
        // The bridge filter is second-granular and intentionally widened by
        // one second around millisecond bounds. Drop boundary rows here so
        // the public browse range remains exact instead of failing on a
        // legitimate neighboring second.
        if (from !== undefined && message.sentAtUnixMs < from || to !== undefined && message.sentAtUnixMs > to) continue;
        if (senderId && message.senderId !== senderId) continue;
        if (browseMessageMatches(message, category, accountWide)) items.push(message);
        if (items.length >= page.pageSize) break;
      }
      if (result.nextCursor) {
        state.bridgeCursor = result.nextCursor;
        if (result.items.length === 0) throw error('BROWSE_CURSOR_STALLED');
        continue;
      }
      state.bridgeCursor = '';
      if (!accountWide) { finished = true; break; }
      if (accountWide && conversationId) {
        // A supplied conversationId scopes account media to one conversation;
        // do not fall back to rescanning the account's session index.
        state.activeConversation = '';
        finished = true;
        break;
      }
      state.activeConversation = '';
      state.sessionPageOffset += 1;
      state.sessionPageCount = Math.max(0, state.sessionPageCount);
      if (state.sessionPageOffset >= state.sessionPageCount) {
        state.sessionPageCursor = state.sessionPageNextCursor;
        state.sessionPageOffset = 0;
        state.sessionPageCount = 0;
        state.sessionPageNextCursor = '';
        if (!state.sessionPageCursor) state.sessionDone = true;
        if (state.sessionDone && items.length >= page.pageSize) finished = true;
      }
    }
    const nextCursor = finished ? new Uint8Array(0) : encodeBrowseCursor(state);
    return { items, nextCursor };
  }
  async function importKey(request) {
    guard();
    if (!encryptedDir) throw error('ENCRYPTED_SOURCE_NOT_CONFIGURED');
    if (request.accountId !== accountId || !(request.databaseKey instanceof Uint8Array) || request.databaseKey.length !== 32) throw error('DATABASE_KEY_INVALID');
    if (activeImport) throw error('IMPORT_BUSY');
    let done; const operation = { controller: new AbortController(), done: new Promise(resolve => { done = resolve; }), phase: 0, completedSteps: 0, messageKey: '', terminal: false }; activeImport = operation;
    const deadline = setTimeout(() => operation.controller.abort(error('IMPORT_TIMEOUT')), importerTimeoutMs);
    const check = () => guard(operation.controller.signal);
    let workDir, finalDir, candidate = null, published = false;
    recordAcquisitionEvent(operation, IMPORT_EVENT_PHASES.discovering, 0, IMPORT_EVENT_MESSAGE_KEYS.discovering);
    try {
      check(); await dropBridge(); dataDir = ''; mediaIndexState = undefined; sourceInventory = null; outputInventory = null; snapshotLoaded = false; sourceFailure = '';
      await snapshot.safeDirectory(stateDir, check);
      try { await fs.promises.mkdir(snapshotRoot, { mode: 0o700 }); } catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
      await snapshot.safeDirectory(snapshotRoot, check, true);
      workDir = await fs.promises.mkdtemp(path.join(snapshotRoot, '.work-')); await fs.promises.chmod(workDir, 0o700); check();
      const outputDir = path.join(workDir, 'data');
      const original = await snapshot.inventory(encryptedDir, check); check();
      recordAcquisitionEvent(operation, IMPORT_EVENT_PHASES.scanning, 1, IMPORT_EVENT_MESSAGE_KEYS.scanning);
      recordAcquisitionEvent(operation, IMPORT_EVENT_PHASES.capturing, 2, IMPORT_EVENT_MESSAGE_KEYS.capturing);
      const summary = await runImporter({ executable: importerPath, sourceDir: encryptedDir, outputDir, key: request.databaseKey, signal: operation.controller.signal, timeoutMs: importerTimeoutMs }); check();
      if (!summary || summary.ok !== true || summary.profile !== snapshot.PROFILE || summary.sourceUnchanged !== true || summary.reservedBytesZeroed !== true || summary.outputDir !== outputDir || summary.sourceFingerprint !== original.fingerprint) throw error('IMPORT_SUMMARY_INVALID');
      snapshot.records(summary.databases);
      recordAcquisitionEvent(operation, IMPORT_EVENT_PHASES.verifying, 3, IMPORT_EVENT_MESSAGE_KEYS.verifying);
      await snapshot.verifyStamps(original, check);
      const output = await snapshot.inventory(outputDir, check, true); check(); snapshot.matchInventory(original, output, summary.databases);
      candidate = bridgeFactory({ executable: bridgePath, dataDir: outputDir, accountId }); checkedInfo(await candidate.call('account.info')); check(); await candidate.close(); candidate = null;
      recordAcquisitionEvent(operation, IMPORT_EVENT_PHASES.sealing, 4, IMPORT_EVENT_MESSAGE_KEYS.sealing);
      finalDir = path.join(snapshotRoot, `snapshot-${crypto.randomUUID()}`); await fs.promises.rename(workDir, finalDir); workDir = null; check();
      const finalData = path.join(finalDir, 'data');
      const finalInventory = await snapshot.inventory(finalData, check, true); snapshot.matchInventory(original, finalInventory, summary.databases); check();
      candidate = bridgeFactory({ executable: bridgePath, dataDir: finalData, accountId }); const checked = checkedInfo(await candidate.call('account.info')); check();
      const manifest = { version: 2, accountId, encryptedDir, outputDir: finalData, profile: snapshot.PROFILE, sourceFingerprint: original.fingerprint, databases: summary.databases };
      // Atomic manifest rename is the commit point. Cancellation afterwards may
      // suppress the response and close handles, but must retain this valid cache.
      await snapshot.writeManifest(manifest, snapshotOptions, check);
      dataDir = finalData; mediaIndexState = undefined; bridge = candidate; candidate = null; info = checked; sourceInventory = original; outputInventory = finalInventory; snapshotLoaded = true; published = true;
      recordAcquisitionEvent(operation, IMPORT_EVENT_PHASES.completed, IMPORT_EVENT_TOTAL_STEPS, IMPORT_EVENT_MESSAGE_KEYS.completed, true);
      return account(checked);
    } catch (failure) {
      if (!operation.terminal) recordAcquisitionEvent(operation, operation.phase, operation.completedSteps, operation.messageKey, true, importErrorCode(failure));
      throw failure;
    } finally {
      clearTimeout(deadline); request.databaseKey.fill(0);
      try {
        if (candidate) await candidate.close();
        if (workDir) await fs.promises.rm(workDir, { recursive: true, force: true });
        if (finalDir && !published) await fs.promises.rm(finalDir, { recursive: true, force: true });
      } finally { if (activeImport === operation) activeImport = null; done(); }
    }
  }
  async function exportMediaMetadata(request) {
    await requireAccount(request.accountId);
    const format = text(request.format, 32).toLowerCase();
    if (!MEDIA_METADATA_EXPORT_FORMATS.has(format)) throw error('MEDIA_METADATA_EXPORT_FORMAT_UNSUPPORTED');
    if (request.includeMedia !== false && request.includeMedia !== undefined) throw error('MEDIA_METADATA_REQUEST_INVALID');
    if (typeof request.conversationId !== 'string' || request.conversationId.includes('\0') || request.conversationId.trim() !== request.conversationId || request.conversationId.length > 1024) throw error('MEDIA_METADATA_REQUEST_INVALID');
    const fromValue = request.fromUnixMs ?? request.startTimeUnixMs;
    const toValue = request.toUnixMs ?? request.endTimeUnixMs;
    const from = fromValue === undefined ? undefined : requestTime(fromValue, 'MEDIA_METADATA_REQUEST_INVALID');
    const to = toValue === undefined ? undefined : requestTime(toValue, 'MEDIA_METADATA_REQUEST_INVALID');
    if (from !== undefined && to !== undefined && from > to) throw error('MEDIA_METADATA_REQUEST_INVALID');
    const accountWide = request.conversationId.length === 0;
    const category = accountWide ? 'media' : 'media';
    const destinationPath = path.resolve(text(request.destinationPath, 4096));
    const expectedExtension = format === 'media-json' ? '.json' : '.csv';
    if (path.extname(destinationPath).toLowerCase() !== expectedExtension) throw error('MEDIA_METADATA_REQUEST_INVALID');
    const excluded = [configuredSourcePath, dataDir, stateDir];
    const rows = [];
    let cursor = new Uint8Array(0);
    const startedAt = Date.now();
    for (;;) {
      if (Date.now() - startedAt > MAX_EXPORT_RUNTIME_MS) throw error('MEDIA_METADATA_EXPORT_TIMEOUT');
      const page = accountWide
        ? await browseMessages({ accountId: request.accountId, category, page: { pageSize: BROWSE_PAGE_MAX, cursor }, ...(from === undefined ? {} : { fromUnixMs: from }), ...(to === undefined ? {} : { toUnixMs: to }) }, true)
        : await browseMessages({ accountId: request.accountId, conversationId: request.conversationId, category, page: { pageSize: BROWSE_PAGE_MAX, cursor }, ...(from === undefined ? {} : { fromUnixMs: from }), ...(to === undefined ? {} : { toUnixMs: to }) }, false);
      if (!page || !Array.isArray(page.items) || page.items.length > BROWSE_PAGE_MAX) throw error('MEDIA_METADATA_RESPONSE_INVALID');
      for (const item of page.items) {
        rows.push(mediaMetadataExportRow(item));
        if (rows.length > MEDIA_METADATA_EXPORT_MAX_ITEMS) throw error('MEDIA_METADATA_EXPORT_TOO_LARGE');
      }
      cursor = page.nextCursor;
      if (!cursor || cursor.length === 0) break;
    }
    const output = mediaMetadataExportOutput(format, { accountId: request.accountId, scope: accountWide ? 'account' : 'conversation', conversationId: request.conversationId }, rows);
    if (output.length > MEDIA_METADATA_EXPORT_MAX_BYTES) throw error('MEDIA_METADATA_EXPORT_TOO_LARGE');
    await writeRecordDestination(destinationPath, output, excluded, () => guard());
    return { destinationPath, format, itemCount: rows.length, scope: accountWide ? 'account' : 'conversation', conversationId: request.conversationId, mediaManifestPath: '', mediaIncluded: 0, mediaFailed: 0, metadataOnly: true, mediaReady: false };
  }
  async function exportRecordCategory(request) {
    await requireAccount(request.accountId);
    if (!Object.hasOwn(RECORD_EXPORT_TABLES, request.category)) throw error('RECORD_EXPORT_CATEGORY_UNSUPPORTED');
    const tableName = RECORD_EXPORT_TABLES[request.category];
    const selected = new Set(request.recordIds);
    const records = [];
    let estimatedBytes = 0;
    const excluded = [configuredSourcePath, dataDir, stateDir];
    for (let offset = 0; offset <= RECORD_EXPORT_MAX_ITEMS; offset += RECORD_EXPORT_PAGE_SIZE) {
      if (request.isCanceled?.()) throw error('RECORD_EXPORT_CANCELED');
      const page = await callData('general.list', { tableName, query: '', limit: RECORD_EXPORT_PAGE_SIZE, offset, ascending: false });
      if (!page || !Array.isArray(page.items) || page.items.length > RECORD_EXPORT_PAGE_SIZE || typeof page.sourceDatabase !== 'string' || page.sourceDatabase.length > 1024 || page.sourceDatabase.includes('\0')) throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
      for (const row of page.items) {
        const record = generalRecordFromRow(row);
        if (record.tableName !== tableName) throw error('BRIDGE_GENERAL_RECORD_INVALID');
        if (!selected.size || selected.has(record.id)) {
          estimatedBytes += Buffer.byteLength(record.id, 'utf8') + Buffer.byteLength(record.actor, 'utf8') + Buffer.byteLength(record.content, 'utf8') + record.fields.reduce((total, field) => total + Buffer.byteLength(field.name, 'utf8') + Buffer.byteLength(field.value, 'utf8') + 32, 0);
          if (estimatedBytes > RECORD_EXPORT_MAX_BYTES / 2) throw error('RECORD_EXPORT_TOO_LARGE');
          records.push(record);
        }
      }
      if (records.length > RECORD_EXPORT_MAX_ITEMS) throw error('RECORD_EXPORT_TOO_LARGE');
      if (page.items.length < RECORD_EXPORT_PAGE_SIZE) break;
      if (offset === RECORD_EXPORT_MAX_ITEMS) throw error('RECORD_EXPORT_TOO_LARGE');
    }
    if (selected.size) {
      const found = new Set(records.map(record => record.id));
      if ([...selected].some(id => !found.has(id))) throw error('RECORD_EXPORT_RECORD_NOT_FOUND');
    }
    if (request.isCanceled?.()) throw error('RECORD_EXPORT_CANCELED');
    const output = recordExportOutput(request.format, { accountId: request.accountId, category: request.category, tableName }, records);
    if (output.length > RECORD_EXPORT_MAX_BYTES) throw error('RECORD_EXPORT_TOO_LARGE');
    const destinationPath = path.resolve(request.destinationPath);
    if (path.extname(destinationPath).toLowerCase() !== `.${request.format}`) throw error('RECORD_EXPORT_REQUEST_INVALID');
    await writeRecordDestination(destinationPath, output, excluded, () => {
      guard();
      if (request.isCanceled?.()) throw error('RECORD_EXPORT_CANCELED');
    });
    return { destinationPath, itemCount: records.length };
  }

  async function exportMoments(request) {
    await requireAccount(request.accountId);
    if (!MOMENT_EXPORT_FORMATS.has(request.format)) throw error('MOMENT_EXPORT_FORMAT_UNSUPPORTED');
    if (!Array.isArray(request.mediaKinds) || request.mediaKinds.length > 3 || request.mediaKinds.some(kind => !['image', 'video', 'live_photo'].includes(kind))) throw error('MOMENT_EXPORT_REQUEST_INVALID');
    // The recovered fixture has no verified media locator or decoder. Refuse a
    // request that asks for media instead of silently reporting it as saved.
    if (request.mediaKinds.length) throw error('MOMENT_EXPORT_MEDIA_UNAVAILABLE');
    if (!Array.isArray(request.usernames) || request.usernames.length > 500 || new Set(request.usernames).size !== request.usernames.length) throw error('MOMENT_EXPORT_REQUEST_INVALID');
    if (typeof request.keyword !== 'string' || request.keyword.length > 512 || request.keyword.trim() !== request.keyword || request.keyword.includes('\0')) throw error('MOMENT_EXPORT_REQUEST_INVALID');
    if (request.startTimeUnixMs !== undefined && (typeof request.startTimeUnixMs !== 'bigint' || request.startTimeUnixMs < 0n) || request.endTimeUnixMs !== undefined && (typeof request.endTimeUnixMs !== 'bigint' || request.endTimeUnixMs < 0n)) throw error('MOMENT_EXPORT_REQUEST_INVALID');
    if (request.startTimeUnixMs !== undefined && request.endTimeUnixMs !== undefined && request.startTimeUnixMs > request.endTimeUnixMs) throw error('MOMENT_EXPORT_REQUEST_INVALID');
    if (!Number.isInteger(request.utcOffsetMinutes) || request.utcOffsetMinutes < -720 || request.utcOffsetMinutes > 840) throw error('MOMENT_EXPORT_REQUEST_INVALID');
    if (typeof request.destinationPath !== 'string' || !path.isAbsolute(request.destinationPath) || path.extname(request.destinationPath).toLowerCase() !== `.${request.format === 'markdown' ? 'md' : request.format}`) throw error('MOMENT_EXPORT_REQUEST_INVALID');
    const excluded = [configuredSourcePath, dataDir, stateDir];
    const startedAt = Date.now();
    const rows = [];
    const seen = new Set();
    const usernames = request.usernames.length ? request.usernames : [undefined];
    for (const username of usernames) {
      let offset = 0;
      for (;;) {
        if (Date.now() - startedAt > MOMENT_EXPORT_MAX_RUNTIME_MS) throw error('MOMENT_EXPORT_TIMEOUT');
        if (request.isCanceled?.()) throw error('MOMENT_EXPORT_CANCELED');
        const page = await handlers.listMoments({
          accountId: request.accountId,
          limit: MOMENT_EXPORT_PAGE_SIZE,
          offset,
          ascending: true,
          ...(username === undefined ? {} : { username }),
          ...(request.keyword ? { keyword: request.keyword } : {}),
          ...(request.startTimeUnixMs === undefined ? {} : { startTimeUnixMs: request.startTimeUnixMs }),
          ...(request.endTimeUnixMs === undefined ? {} : { endTimeUnixMs: request.endTimeUnixMs })
        });
        const items = page.response?.items;
        if (!Array.isArray(items) || items.length > MOMENT_EXPORT_PAGE_SIZE) throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
        for (const item of items) {
          const row = momentExportRow(item);
          if (seen.has(row.id)) continue;
          seen.add(row.id); rows.push(row);
          if (rows.length > MOMENT_EXPORT_MAX_ITEMS) throw error('MOMENT_EXPORT_TOO_LARGE');
        }
        if (items.length < MOMENT_EXPORT_PAGE_SIZE) break;
        offset += items.length;
        if (offset > MOMENT_EXPORT_MAX_ITEMS) throw error('MOMENT_EXPORT_TOO_LARGE');
      }
    }
    rows.sort((left, right) => left.createdAtUnixMs === right.createdAtUnixMs ? left.id.localeCompare(right.id) : BigInt(left.createdAtUnixMs) < BigInt(right.createdAtUnixMs) ? -1 : 1);
    const emojiResolver = handlers?.resolveMomentEmoji;
    const mediaIndex = independentMediaIndex();
    for (const row of rows) await verifyMomentExportEmojis(row, request.accountId, emojiResolver, mediaIndex);
    const meta = { accountId: request.accountId, sourceDatabase: 'moments.db', sourceTable: '__alpha_moments_v1', syntheticOnly: true, metadataOnly: true, ...(request.startTimeUnixMs === undefined ? {} : { startTimeUnixMs: request.startTimeUnixMs.toString() }), ...(request.endTimeUnixMs === undefined ? {} : { endTimeUnixMs: request.endTimeUnixMs.toString() }), ...(request.keyword ? { keyword: request.keyword } : {}), usernames: [...request.usernames] };
    const output = momentExportOutput(request.format, meta, rows);
    if (output.byteLength > MOMENT_EXPORT_MAX_BYTES) throw error('MOMENT_EXPORT_TOO_LARGE');
    await writeRecordDestination(request.destinationPath, output, excluded, () => { guard(); if (request.isCanceled?.()) throw error('MOMENT_EXPORT_CANCELED'); });
    return { destinationPath: request.destinationPath, format: request.format, itemCount: rows.length, mediaManifestPath: '', mediaIncluded: 0, mediaFailed: 0, metadataOnly: true, syntheticOnly: true };
  }

  let chatExportJobs;
  let recordExportJobs;
  let momentExportJobs;
  let chatExportSchedules;
  let aggregateAnalysisJobs;
  let genericJobs;

  async function listAnalysisSessions() {
    const sessions = [];
    let cursor = '';
    for (let pageNumber = 0; pageNumber < 128; pageNumber += 1) {
      const page = checkedPage(await callData('sessions.list', { limit: 500, cursor }), 500);
      sessions.push(...page.items);
      if (sessions.length > 10000) throw error('ANALYSIS_SCOPE_TOO_LARGE');
      if (!page.nextCursor) return sessions;
      cursor = page.nextCursor;
    }
    throw error('ANALYSIS_SCOPE_TOO_LARGE');
  }

  function validateAggregateAnalysisRequest(request) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw error('ANALYSIS_REQUEST_INVALID');
    if (typeof request.accountId !== 'string' || !request.accountId.trim() || request.accountId.length > 256 || request.accountId.includes('\0')) throw error('ANALYSIS_REQUEST_INVALID');
    if (!Number.isInteger(request.scope) || ![1, 2, 3, 4].includes(request.scope)) throw error('ANALYSIS_SCOPE_UNSUPPORTED');
    const conversationId = request.conversationId === undefined ? '' : requestName(request.conversationId, 'ANALYSIS_REQUEST_INVALID', true);
    const excluded = request.excludedConversationIds === undefined ? [] : request.excludedConversationIds;
    if (!Array.isArray(excluded) || excluded.length > 500 || new Set(excluded).size !== excluded.length) throw error('ANALYSIS_REQUEST_INVALID');
    for (const value of excluded) requestName(value, 'ANALYSIS_REQUEST_INVALID');
    const from = request.fromUnixMs;
    const to = request.toUnixMs;
    if (from !== undefined && (typeof from !== 'bigint' || from < 0n || from > INT64_MAX)) throw error('ANALYSIS_REQUEST_INVALID');
    if (to !== undefined && (typeof to !== 'bigint' || to < 0n || to > INT64_MAX)) throw error('ANALYSIS_REQUEST_INVALID');
    if (from !== undefined && to !== undefined && from >= to) throw error('ANALYSIS_REQUEST_INVALID');
    const utcOffsetMinutes = request.utcOffsetMinutes === undefined ? 0 : request.utcOffsetMinutes;
    if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw error('ANALYSIS_OPTIONS_INVALID');
    if (request.scope === 2) {
      if (!conversationId || excluded.length || from !== undefined || to !== undefined) throw error('ANALYSIS_SCOPE_OPTIONS_UNSUPPORTED');
    } else if (request.scope === 4) {
      if (!conversationId || excluded.length) throw error('ANALYSIS_SCOPE_OPTIONS_UNSUPPORTED');
    } else if (request.scope === 1) {
      if (conversationId || from === undefined || to === undefined) throw error('ANALYSIS_SCOPE_OPTIONS_INVALID');
    } else if (from === undefined || to === undefined || conversationId) {
      throw error('ANALYSIS_SCOPE_OPTIONS_INVALID');
    }
    if (request.scope === 3) annualYearFromBounds(from, to, utcOffsetMinutes);
    return { accountId: request.accountId, scope: request.scope, conversationId, excludedConversationIds: excluded.slice(), ...(from === undefined ? {} : { fromUnixMs: from }), ...(to === undefined ? {} : { toUnixMs: to }), utcOffsetMinutes };
  }

  function annualYearFromBounds(from, to, offsetMinutes) {
    const offset = BigInt(offsetMinutes) * 60000n;
    const localFrom = Number(from + offset);
    const localTo = Number(to + offset);
    if (!Number.isSafeInteger(localFrom) || !Number.isSafeInteger(localTo)) throw error('ANALYSIS_TIME_INVALID');
    const start = new Date(localFrom), end = new Date(localTo);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getUTCMonth() !== 0 || start.getUTCDate() !== 1 || start.getUTCHours() !== 0 || start.getUTCMinutes() !== 0 || start.getUTCSeconds() !== 0 || start.getUTCMilliseconds() !== 0 || end.getUTCMonth() !== 0 || end.getUTCDate() !== 1 || end.getUTCFullYear() !== start.getUTCFullYear() + 1) throw error('ANALYSIS_SCOPE_OPTIONS_INVALID');
    return start.getUTCFullYear();
  }

  const AGGREGATE_CATEGORY_IDS = ['text', 'image', 'voice', 'video', 'emoji', 'link', 'file', 'mini_program', 'location', 'call', 'transfer', 'red_packet', 'card', 'pat', 'other'];
  function aggregateCategories(counts = {}) {
    return AGGREGATE_CATEGORY_IDS.map(category => ({ category, messages: Number(counts[category] || 0), sent: 0, received: 0 }));
  }
  function directionCategories(report) {
    const categories = aggregateCategories();
    const byKind = new Map(categories.map(item => [item.category, item]));
    const kinds = report.message_types || {};
    for (const [kind, count] of Object.entries(kinds)) {
      const category = byKind.has(kind) ? kind : 'other';
      byKind.get(category).messages += Number(count || 0);
    }
    return categories;
  }
  function longestDateRun(dates) {
    const unique = [...new Set(dates)].sort();
    let best = null, current = null;
    for (const date of unique) {
      const stamp = Date.parse(`${date}T00:00:00.000Z`);
      if (!Number.isSafeInteger(stamp)) continue;
      if (!current || stamp !== current.last + 86400000) current = { start: date, end: date, last: stamp };
      else { current.end = date; current.last = stamp; }
      if (!best || current.last - Date.parse(`${current.start}T00:00:00.000Z`) > best.last - Date.parse(`${best.start}T00:00:00.000Z`)) best = { ...current };
    }
    if (!best) return { days: 0, start: null, end: null };
    return { days: Math.round((best.last - Date.parse(`${best.start}T00:00:00.000Z`)) / 86400000) + 1, start: best.start, end: best.end };
  }
  function contiguousMonthly(counts = {}) {
    const keys = Object.keys(counts).filter(value => /^\d{4}-\d{2}$/.test(value)).sort();
    if (!keys.length) return [];
    const [startYear, startMonth] = keys[0].split('-').map(Number);
    const [endYear, endMonth] = keys[keys.length - 1].split('-').map(Number);
    const output = [];
    for (let index = startYear * 12 + startMonth - 1, end = endYear * 12 + endMonth - 1; index <= end; index += 1) {
      const year = Math.floor(index / 12), month = String(index % 12 + 1).padStart(2, '0'), key = `${year}-${month}`;
      output.push({ month: key, sent: 0, received: 0, unknown: Number(counts[key] || 0) });
    }
    return output;
  }
  function modernAggregateReport(report, request) {
    const dailyDirections = report.daily_directions || {};
    const daily = Object.entries(dailyDirections).sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, sent: value.sent || 0, received: value.received || 0, unknown: value.unknown || 0 }));
    const monthly = contiguousMonthly(report.monthly_counts || {});
    const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, sent: 0, received: 0, unknown: report.active_hours?.[hour] || 0 }));
    const run = longestDateRun(daily.map(item => item.date));
    const first = report.first_message?.sent_at_unix_ms;
    const last = report.last_message?.sent_at_unix_ms;
    const from = request.fromUnixMs === undefined ? null : Number(request.fromUnixMs);
    const to = request.toUnixMs === undefined ? null : Number(request.toUnixMs);
    return {
      algorithm_version: 'alpha-aggregate-v1',
      scope: request.scope === 2 ? 'group_chat' : 'private_chats',
      utc_offset_minutes: request.utcOffsetMinutes,
      from_unix_ms: from,
      to_unix_ms: to,
      conversations_analyzed: report.total_messages > 0 ? 1 : 0,
      conversations_with_messages: report.total_messages > 0 ? 1 : 0,
      conversations_failed: 0,
      conversations_excluded: 0,
      truncated: Boolean(report.truncated),
      total_messages: report.total_messages,
      sent_messages: report.sent_messages,
      received_messages: report.received_messages,
      unknown_direction_messages: report.unknown_messages,
      system_messages: report.message_types?.system || 0,
      first_message_unix_ms: first === undefined ? null : first,
      last_message_unix_ms: last === undefined ? null : last,
      active_days: report.active_days,
      longest_streak_days: run.days,
      longest_streak_start: run.start,
      longest_streak_end: run.end,
      busiest_day: null,
      categories: directionCategories(report),
      hourly,
      weekday_hour_counts: report.active_hours ? Array.from({ length: 7 }, () => Array(24).fill(0)) : Array.from({ length: 7 }, () => Array(24).fill(0)),
      monthly,
      daily,
      top_conversations: [],
      top_senders: [],
      distinct_senders: 0
    };
  }
  function modernAnnualReport(report, request, year) {
    const periodFrom = Number(request.fromUnixMs), periodTo = Number(request.toUnixMs);
    const categories = aggregateCategories();
    const legacyMedia = report.media || {};
    const categoryCounts = { text: report.total_messages - Object.values(legacyMedia).reduce((sum, value) => sum + Number(value || 0), 0), image: legacyMedia.image || 0, voice: legacyMedia.voice || 0, video: legacyMedia.video || 0, emoji: legacyMedia.emoji || 0, file: legacyMedia.file || 0, location: legacyMedia.location || 0 };
    for (const item of categories) item.messages = Math.max(0, Number(categoryCounts[item.category] || 0));
    const monthlyCounts = Array.isArray(report.monthly_counts) ? report.monthly_counts : Array.from({ length: 12 }, (_, index) => report.monthly_counts?.[`${year}-${String(index + 1).padStart(2, '0')}`] || 0);
    const monthlyCompanions = Array.from({ length: 12 }, (_, index) => {
      const period = `${year}-${String(index + 1).padStart(2, '0')}`;
      const periodMessages = Number(monthlyCounts[index] || 0);
      const top = report.top_conversations?.[0];
      return { period, period_messages: periodMessages, conversation_id: periodMessages ? (top?.conversation_id || 'unknown') : null, display_name: periodMessages ? (top?.display_name || '未知会话') : null, messages: periodMessages ? (top ? Math.min(periodMessages, top.messages) : periodMessages) : null };
    });
    const heatmap = { weekday_hour_counts: report.weekday_hour_counts, peak: null };
    let peak = null;
    for (let weekday = 0; weekday < 7; weekday++) for (let hour = 0; hour < 24; hour++) if ((report.weekday_hour_counts?.[weekday]?.[hour] || 0) > (peak?.messages || 0)) peak = { weekday, hour, messages: report.weekday_hour_counts[weekday][hour] };
    heatmap.peak = peak && peak.messages > 0 ? peak : null;
    const messageRef = report.first_message ? { sent_at_unix_ms: report.first_message.sent_at_unix_ms, conversation_id: report.first_message.conversation_id, display_name: report.first_message.conversation_id } : null;
    return {
      algorithm_version: 'alpha-annual-v2',
      utc_offset_minutes: request.utcOffsetMinutes,
      from_unix_ms: periodFrom,
      to_unix_ms: periodTo,
      year,
      all_time: false,
      conversations_analyzed: request.conversationsTotal || report.active_conversations,
      conversations_with_messages: report.active_conversations,
      conversations_failed: 0,
      conversations_excluded: request.excludedConversationIds.length,
      truncated: Boolean(report.truncated),
      overview: { total_messages: report.total_messages, sent_messages: report.sent_messages, received_messages: report.received_messages, unknown_direction_messages: 0, friends: report.active_conversations, active_days: report.active_days, first_message_unix_ms: messageRef?.sent_at_unix_ms ?? null, last_message_unix_ms: null, categories },
      top_friends: (report.top_conversations || []).map(item => ({ conversation_id: item.conversation_id, display_name: item.display_name, messages: item.messages, sent: item.sent, received: item.received })),
      monthly_companions: monthlyCompanions,
      heatmap,
      night_companion: null,
      night_share_of_all: null,
      initiative: { starts_mine: 0, starts_peer: 0, rate_mine: null, top_initiated: null },
      response: { mine: null, peer: null, fastest_friend: null },
      balanced_friend: null,
      streak: null,
      account_streak: null,
      busiest_day: null,
      fading_friend: null,
      phrases: [],
      moments: null
    };
  }
  function modernDualReport(report, request) {
    const from = request.fromUnixMs === undefined ? null : Number(request.fromUnixMs);
    const to = request.toUnixMs === undefined ? null : Number(request.toUnixMs);
    const monthly = contiguousMonthly(report.monthly_counts || {});
    const categories = directionCategories(report);
    const first = report.first_message?.sent_at_unix_ms;
    const last = report.last_message?.sent_at_unix_ms;
    return {
      algorithm_version: 'alpha-dual-v1',
      utc_offset_minutes: request.utcOffsetMinutes,
      from_unix_ms: from,
      to_unix_ms: to,
      all_time: from === null && to === null,
      conversation_id: request.conversationId,
      display_name: request.conversationId,
      year: null,
      first_chat: null,
      range_first_chat: null,
      totals: {
        messages: report.total_messages,
        sent: report.sent_messages,
        received: report.received_messages,
        unknown: report.unknown_messages,
        words_mine: 0,
        words_peer: 0,
        text_messages_mine: 0,
        text_messages_peer: 0,
        images: report.media?.image || 0,
        voices: report.media?.voice || 0,
        videos: report.media?.video || 0,
        emojis: report.media?.emoji || 0,
        active_days: report.active_days,
        first_message_unix_ms: first === undefined ? null : first,
        last_message_unix_ms: last === undefined ? null : last,
        night_messages: 0
      },
      categories,
      heatmap: { weekday_hour_counts: Array.from({ length: 7 }, () => Array(24).fill(0)), peak: null },
      monthly,
      initiative: { starts_mine: 0, starts_peer: 0, rate_mine: null },
      response: { mine: null, peer: null },
      streak: null,
      busiest_day: null,
      phrases: { shared: [], mine_exclusive: [], peer_exclusive: [] }
    };
  }
  function modernPrivateReport(report, request, conversationsTotal) {
    const legacyMedia = report.media || {};
    const totalMedia = Object.values(legacyMedia).reduce((sum, value) => sum + Number(value || 0), 0);
    const categories = aggregateCategories({ text: Math.max(0, report.total_messages - totalMedia), image: legacyMedia.image || 0, voice: legacyMedia.voice || 0, video: legacyMedia.video || 0, emoji: legacyMedia.emoji || 0, file: legacyMedia.file || 0, location: legacyMedia.location || 0 });
    const daily = Object.entries(report.daily_counts || {}).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, sent: 0, received: 0, unknown: total }));
    const monthly = (Array.isArray(report.monthly_counts) ? report.monthly_counts : []).map((total, index) => ({ month: `${report.year}-${String(index + 1).padStart(2, '0')}`, sent: 0, received: 0, unknown: total }));
    return {
      algorithm_version: 'alpha-aggregate-v1', scope: 'private_chats', utc_offset_minutes: request.utcOffsetMinutes,
      from_unix_ms: Number(request.fromUnixMs), to_unix_ms: Number(request.toUnixMs),
      conversations_analyzed: conversationsTotal, conversations_with_messages: report.active_conversations, conversations_failed: 0, conversations_excluded: request.excludedConversationIds.length,
      truncated: Boolean(report.truncated), total_messages: report.total_messages, sent_messages: report.sent_messages, received_messages: report.received_messages, unknown_direction_messages: 0, system_messages: 0,
      first_message_unix_ms: report.first_message?.sent_at_unix_ms ?? null, last_message_unix_ms: null, active_days: report.active_days,
      longest_streak_days: 0, longest_streak_start: null, longest_streak_end: null, busiest_day: null, categories,
      hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, sent: 0, received: 0, unknown: report.weekday_hour_counts?.reduce((sum, row) => sum + (row[hour] || 0), 0) || 0 })),
      weekday_hour_counts: report.weekday_hour_counts, monthly, daily,
      top_conversations: (report.top_conversations || []).map(item => ({ conversation_id: item.conversation_id, display_name: item.display_name, messages: item.messages, sent: item.sent, received: item.received, active_days: 0, first_message_unix_ms: null, last_message_unix_ms: null })),
      top_senders: [], distinct_senders: 0
    };
  }

  async function runAggregateAnalysis(request, { isCanceled, conversationsTotal }) {
    if (isCanceled()) throw error('ANALYSIS_CANCELED');
    if (request.scope === 2 || request.scope === 4) {
      const result = await buildConversationReport({
        conversationId: request.conversationId,
        utcOffsetMinutes: request.utcOffsetMinutes,
        ...(request.scope === 4 && request.fromUnixMs === undefined ? {} : { fromUnixMs: request.fromUnixMs }),
        ...(request.scope === 4 && request.toUnixMs === undefined ? {} : { toUnixMs: request.toUnixMs }),
        listMessages: ({ conversationId, ascending, afterUnixMs, beforeUnixMs, page }) => handlers.listMessages({ accountId: request.accountId, conversationId, ascending, ...(afterUnixMs === undefined ? {} : { afterUnixMs }), ...(beforeUnixMs === undefined ? {} : { beforeUnixMs }), page }),
        isCanceled
      });
      const reportJson = request.scope === 2 ? modernAggregateReport(result.report, request) : modernDualReport(result.report, request);
      return { reportJson: Buffer.from(JSON.stringify(reportJson), 'utf8'), conversationsDone: 1, conversationsTotal: 1 };
    }
    const year = annualYearFromBounds(request.fromUnixMs, request.toUnixMs, request.utcOffsetMinutes);
    const excluded = new Set(request.excludedConversationIds);
    const result = await buildAnnualReport({
      year,
      utcOffsetMinutes: request.utcOffsetMinutes,
      isCanceled,
      listSessions: async ({ limit, cursor }) => {
        const page = checkedPage(await callData('sessions.list', { limit, cursor }), limit);
        return { ...page, items: page.items.filter(item => !excluded.has(item.username) && (request.scope !== 1 || !item.username.endsWith('@chatroom'))) };
      },
      listMessages: async ({ conversationId, ascending, afterUnixMs, beforeUnixMs, page }) => handlers.listMessages({ accountId: request.accountId, conversationId, ascending, afterUnixMs, beforeUnixMs, page })
    });
    const reportJson = request.scope === 1 ? modernPrivateReport(result.report, request, conversationsTotal) : modernAnnualReport(result.report, { ...request, conversationsTotal }, year);
    return { reportJson: Buffer.from(JSON.stringify(reportJson), 'utf8'), conversationsDone: conversationsTotal, conversationsTotal };
  }

  const handlers = {
    async hello(request) {
      if (request.protocol?.major !== 1) throw error('PROTOCOL_VERSION_UNSUPPORTED');
      if (!encryptedDir && dataDir && !lock.status().locked) await source();
      helloDone = true;
      return { negotiatedProtocol: { major: 1, minor: 0 }, components: [{ component: 'alpha-independent-engine', version: '0.1.0', buildId: 'independent-node-stdio-v1', protocolMajor: 1, protocolMinor: 0 }], serverNonce: crypto.randomBytes(16), supportedMethodIds: Object.values(SUPPORTED).sort((a, b) => a - b), supportsExportTimeRange: true };
    },
    async getCapabilities() { return {}; }, // No original product entitlements exist in this backend.
    async getTelemetryStatus() {
      guard();
      return telemetryStatus();
    },
    async setTelemetryConsent(request) {
      guard();
      if (!request || typeof request !== 'object' || Array.isArray(request) || !TELEMETRY_DECISIONS.has(request.decision)) throw error('TELEMETRY_DECISION_INVALID');
      const categories = telemetryCategories(request.categories ?? []);
      const consentVersion = telemetryConsentVersion(request.consentVersion);
      saveTelemetryState({ decision: request.decision, categories, consentVersion });
      return { status: telemetryStatus() };
    },
    async flushTelemetry() {
      guard();
      // The recovered package has no telemetry endpoint or queue schema. Keep
      // the operation explicitly disabled instead of claiming that events were
      // uploaded. Consent remains persisted for a later backend implementation.
      loadTelemetryState();
      return { outcome: 'disabled', acceptedCount: 0n, duplicateCount: 0n, queuedCount: 0n, nextAttemptUnixMs: 0n };
    },
    async getAdvancedComponentStatus(request) {
      if (!Number.isInteger(request?.component) || !ADVANCED_COMPONENT_KINDS.has(request.component)) throw error('ADVANCED_COMPONENT_REQUEST_INVALID');
      // This is a static diagnostic for the independent backend. It reflects
      // the maintained package boundary and deliberately contains no lease,
      // device-key, download, or native authorization claim.
      return {
        component: request.component,
        target: 'macos-arm64',
        availability: 1, // ADVANCED_COMPONENT_AVAILABILITY_UNSUPPORTED_TARGET
        errorCode: 'INDEPENDENT_ADVANCED_COMPONENT_UNSUPPORTED'
      };
    },
    async getMessageAntiRecallStatuses(request) {
      // The independent backend has no verified retention writer, trigger
      // schema, or recall-record store. Still answer the read-only status
      // query with one explicit unavailable status per requested conversation
      // so the recovered UI can explain the boundary instead of treating the
      // entire status surface as a missing method. No table is opened and no
      // protection claim is made.
      await requireAccount(request.accountId);
      if (!Array.isArray(request?.conversationIds) || request.conversationIds.length < 1 || request.conversationIds.length > 500) throw error('MESSAGE_RECALL_REQUEST_INVALID');
      const conversationIds = request.conversationIds.map(conversationId => requestName(conversationId, 'MESSAGE_RECALL_REQUEST_INVALID'));
      if (new Set(conversationIds).size !== conversationIds.length) throw error('MESSAGE_RECALL_REQUEST_INVALID');
      const status = {
        detected: false,
        usable: false,
        enabled: false,
        verified: false,
        knownTables: 0,
        protectedTables: 0,
        retainedRows: 0n,
        confirmedRows: 0n,
        droppedRows: 0n,
        partial: false,
        errorCode: 'MESSAGE_ANTI_RECALL_WRITER_DISABLED',
        externalProtection: '',
        externalTables: 0,
        writerErrorCode: 'MESSAGE_ANTI_RECALL_WRITER_DISABLED'
      };
      return { statuses: conversationIds.map(conversationId => ({ conversationId, status: { ...status } })) };
    },
    async manageMessageAntiRecall(request) {
      // Keep the original control surface available while the independent
      // backend has no verified retention writer, trigger schema, or recall
      // record store. Every action reports the same explicit disabled state;
      // no message database is opened and no operation is persisted.
      const spec = request?.spec;
      const accountId = requestName(spec?.accountId, 'MESSAGE_ANTI_RECALL_REQUEST_INVALID');
      if (!Number.isInteger(spec?.action) || ![1, 2, 3, 4].includes(spec.action)) throw error('MESSAGE_ANTI_RECALL_REQUEST_INVALID');
      await requireAccount(accountId);
      return {
        result: {
          status: {
            detected: false,
            usable: false,
            enabled: false,
            verified: false,
            knownTables: 0,
            protectedTables: 0,
            retainedRows: 0n,
            confirmedRows: 0n,
            droppedRows: 0n,
            partial: false,
            errorCode: 'MESSAGE_ANTI_RECALL_WRITER_DISABLED',
            externalProtection: '',
            externalTables: 0,
            writerErrorCode: 'MESSAGE_ANTI_RECALL_WRITER_DISABLED'
          }
        }
      };
    },
    async manageMomentsAntiDelete(request) {
      // The independent backend has no verified SnsTimeLine/snsmessage
      // schema, retention shadow table, or trigger writer. Preserve the
      // existing Alpha control surface so the UI can display an explicit
      // unavailable state, but never claim that install/uninstall changed a
      // database. Status and write actions share the same fail-closed result.
      const spec = request?.spec;
      const accountId = requestName(spec?.accountId, 'MOMENTS_ANTI_DELETE_REQUEST_INVALID');
      if (!Number.isInteger(spec?.action) || ![1, 2, 3].includes(spec.action)) throw error('MOMENTS_ANTI_DELETE_REQUEST_INVALID');
      await requireAccount(accountId);
      return {
        result: {
          status: {
            detected: false,
            usable: false,
            enabled: false,
            verified: false,
            targetTable: '',
            shadowTable: '',
            triggerName: '',
            retainedRows: 0n,
            errorCode: 'MOMENTS_ANTI_DELETE_WRITER_DISABLED',
            externalProtection: '',
            writerErrorCode: 'MOMENTS_ANTI_DELETE_WRITER_DISABLED'
          }
        }
      };
    },
    async getMessageSource(request) {
      await requireAccount(request.accountId);
      const conversationId = requestName(request.conversationId, 'MESSAGE_SOURCE_REQUEST_INVALID');
      const messageId = requestName(request.messageId, 'MESSAGE_SOURCE_REQUEST_INVALID');
      const identity = decodeIndependentSourceToken(request.sourceToken, request.accountId);
      let cursor = '';
      const visited = new Set();
      for (let pageNumber = 0; pageNumber < MESSAGE_SOURCE_MAX_SCAN_PAGES; pageNumber++) {
        const page = checkedPage(await callData('messages.list', { conversationId, limit: MESSAGE_SOURCE_PAGE_SIZE, cursor, ascending: true }), MESSAGE_SOURCE_PAGE_SIZE);
        for (const row of page.items) {
          const message = messageFromRow(row, conversationId);
          const source = message.rawSource || {};
          if (message.id !== messageId || source.accountId !== identity.accountId || source.database !== identity.database || source.table !== identity.table || source.localId !== identity.localId) continue;
          // The recovered bridge exposes decoded text and a stable independent
          // identity. It does not expose Alpha's media1_ token or raw/XML
          // source reader, so refuse to manufacture those formats.
          if (message.contentDecodeStatus !== 'decoded') throw error('MESSAGE_SOURCE_UNAVAILABLE');
          return { text: message.text, format: 'text', redacted: false };
        }
        if (!page.nextCursor) throw error('MESSAGE_SOURCE_UNAVAILABLE');
        if (visited.has(page.nextCursor)) throw error('MESSAGE_SOURCE_UNAVAILABLE');
        visited.add(page.nextCursor);
        cursor = page.nextCursor;
      }
      throw error('MESSAGE_SOURCE_UNAVAILABLE');
    },
    async resolveMessageMedia(request) {
      return resolveIndexedMessageMedia(request);
    },
    async decodeVoicePlayback(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('messages.voicePlayback')) throw error('VOICE_PLAYBACK_UNAVAILABLE');
      if (!request || typeof request.mediaId !== 'string' || !/^[0-9a-f]{64}$/.test(request.mediaId)) throw error('VOICE_PLAYBACK_REQUEST_INVALID');
      const mapping = await callData('voice.playback', { mediaId: request.mediaId });
      if (!mapping || mapping.status === 'missing') throw error('VOICE_PLAYBACK_NOT_FOUND');
      if (mapping.status !== 'ready' || mapping.mediaId !== request.mediaId || typeof mapping.wavMediaId !== 'string' || !/^[0-9a-f]{64}$/.test(mapping.wavMediaId)) throw error('VOICE_PLAYBACK_RESPONSE_INVALID');
      const index = independentMediaIndex();
      if (!index || !Array.isArray(index.entries)) throw error('VOICE_PLAYBACK_UNAVAILABLE');
      const candidates = index.entries.filter(entry => entry.kind === 'voice' && entry.id === mapping.wavMediaId && entry.rendition === 'wav' && (!entry.accountId || entry.accountId === request.accountId) && (entry.mimeType === 'audio/wav' || entry.mimeType === 'audio/x-wav') && entry.sha256 === mapping.wavMediaId);
      if (candidates.length !== 1) throw error(candidates.length ? 'VOICE_PLAYBACK_AMBIGUOUS' : 'VOICE_PLAYBACK_NOT_FOUND');
      await readMediaEntry(index, candidates[0], { maxBytes: 64 * 1024 * 1024 });
      return { wavMediaId: mapping.wavMediaId };
    },
    async getApplicationLockStatus() { return { status: lock.status() }; },
    async unlockApplication(request) { return { status: await lock.unlock(request.password) }; },
    async lockApplication() { const status = lock.lock(); clearImageKeyState(); await cancelImport(); await dropBridge(); if (encryptedDir) { dataDir = ''; mediaIndexState = undefined; snapshotLoaded = false; sourceInventory = outputInventory = null; } return { status }; },
    async configureApplicationLock(request) { return { status: await lock.configure(request) }; },
    async getImageMediaStatus(request) {
      await requireAccount(request.accountId);
      if (request.verifySample !== undefined && typeof request.verifySample !== 'boolean') throw error('IMAGE_MEDIA_REQUEST_INVALID');
      return { status: imageMediaStatus() };
    },
    async configureImageKey(request) {
      await requireAccount(request.accountId);
      if (!Number.isInteger(request.mode) || request.mode < 0 || request.mode > 3 || request.mode === 0) throw error('IMAGE_KEY_REQUEST_INVALID');
      // Automatic process-memory scanning needs a native provider and is not
      // available in the independent backend. Refuse it explicitly instead
      // of returning a successful but unusable key state.
      if (request.mode !== 2) throw error('IMAGE_KEY_MODE_UNSUPPORTED');
      if (!Number.isInteger(request.xorKey) || request.xorKey < 0 || request.xorKey > 255 || !(request.aesKey instanceof Uint8Array) || request.aesKey.length !== 16) throw error('IMAGE_KEY_REQUEST_INVALID');
      const aesKey = Buffer.from(request.aesKey);
      clearImageKeyState();
      imageKeyState = { xorKey: request.xorKey, aesKey };
      return { status: imageMediaStatus(), evidence: imageKeyEvidence() };
    },
    async clearImageKey(request) {
      await requireAccount(request.accountId);
      clearImageKeyState();
      return { status: imageMediaStatus() };
    },
    async importDatabaseKey(request) { return { account: await importKey(request) }; },
    async watchDatabaseKeyAcquisition(request) { return watchAcquisition(request); },
    async listAccounts() {
      guard(); if (activeImport) throw error('IMPORT_IN_PROGRESS');
      if (accountRemoved || accountRemovalInProgress) return { accounts: [], selectedAccountId: '' };
      await restoreSnapshot(); guard();
      if (accountRemoved || accountRemovalInProgress) return { accounts: [], selectedAccountId: '' };
      if (encryptedDir && !dataDir) { await snapshot.verifyStamps(sourceInventory, guard); return { accounts: [account(null)], selectedAccountId: '' }; }
      if (!dataDir) return { accounts: [], selectedAccountId: '' };
      const value = await source(); return { accounts: [account(value)], selectedAccountId: selectedId === accountId && selectedPath === configuredSourcePath ? accountId : '' };
    },
    async discoverAccounts(request) {
      guard();
      if (!configuredSourcePath || request.sourceLocation !== configuredSourcePath) throw error('SOURCE_NOT_AUTHORIZED');
      if (!accountRemoved) return handlers.listAccounts();
      // Re-adding is an explicit discovery action against the same caller
      // supplied source. Verify the source before removing the tombstone; a
      // failed or changed source must leave the account removed.
      await restoreSnapshot();
      if (encryptedDir && !dataDir) {
        await snapshot.verifyStamps(sourceInventory, guard);
        clearRemovedAccount();
        return { accounts: [account(null)], selectedAccountId: '' };
      }
      if (!dataDir) throw error('ACCOUNT_NOT_FOUND');
      const value = await source();
      clearRemovedAccount();
      return { accounts: [account(value)], selectedAccountId: selectedId === accountId && selectedPath === configuredSourcePath ? accountId : '' };
    },
    async removeAccount(request) {
      guard();
      if (!request || typeof request.accountId !== 'string' || !request.accountId.trim()) throw error('ACCOUNT_ID_INVALID');
      if (request.accountId !== accountId || !configuredSourcePath) throw error('ACCOUNT_NOT_FOUND');
      if (accountRemoved) return { removed: false, selectedAccountId: '' };
      if (accountRemovalInProgress) throw error('ACCOUNT_REMOVAL_IN_PROGRESS');
      accountRemovalInProgress = true;
      try {
        await cancelImport();
        await chatExportSchedules.removeAccount(accountId);
        await chatExportJobs.removeAccount(accountId);
        await momentExportJobs.removeAccount(accountId);
        await recordExportJobs.removeAccount(accountId);
        await aggregateAnalysisJobs.removeAccount(accountId);
        await dropBridge();
        removeSelection();
        saveRemovedAccount();
        accountRemoved = true;
        return { removed: true, selectedAccountId: '' };
      } finally {
        accountRemovalInProgress = false;
      }
    },
    async selectAccount(request) { const value = await requireAccount(request.accountId); const previousAccountId = selectedId; guard(); saveSelection(); return { account: account(value), previousAccountId }; },
    async getDataRevision(request) { const value = await requireAccount(request.accountId); return { revision: sha(value.snapshotId).slice(0, 16) }; },
    async getDataWatchTargets(request) {
      // The desktop notification watcher needs a stable, explicitly selected
      // source root. Keep this main-process-only path bounded and fail closed;
      // do not derive targets by scanning the user's home directory.
      await requireAccount(request.accountId);
      const target = configuredSourcePath;
      if (typeof target !== 'string' || !path.isAbsolute(target) || target.length > 4096 || target.includes('\0')) throw error('DATA_WATCH_TARGETS_UNAVAILABLE');
      let stat;
      try {
        const link = await fs.promises.lstat(target);
        if (link.isSymbolicLink() || !link.isDirectory()) throw error('DATA_WATCH_TARGETS_UNAVAILABLE');
        stat = link;
      } catch (failure) {
        if (failure.message === 'DATA_WATCH_TARGETS_UNAVAILABLE') throw failure;
        throw error('DATA_WATCH_TARGETS_UNAVAILABLE');
      }
      if (!stat || (stat.mode & 0o002) !== 0) throw error('DATA_WATCH_TARGETS_UNAVAILABLE');
      return { directories: [target] };
    },
    async analyzeAnnual(request) {
      await requireAccount(request.accountId);
      const utcOffsetMinutes = request.utcOffsetMinutes === undefined ? 0 : request.utcOffsetMinutes;
      if (!Number.isInteger(request.year) || request.year < 1970 || request.year > 9999) throw error('ANALYSIS_YEAR_INVALID');
      if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw error('ANALYSIS_OPTIONS_INVALID');
      const result = await buildAnnualReport({
        year: request.year,
        utcOffsetMinutes,
        listSessions: async ({ limit, cursor }) => checkedPage(await callData('sessions.list', { limit, cursor }), limit),
        listMessages: async ({ conversationId, ascending, afterUnixMs, beforeUnixMs, page }) => handlers.listMessages({ accountId: request.accountId, conversationId, ascending, afterUnixMs, beforeUnixMs, page })
      });
      const reportJson = Buffer.from(JSON.stringify(result.report), 'utf8');
      return { reportJson, scannedMessages: result.scannedMessages, truncated: result.truncated };
    },
    async analyzeConversation(request) {
      await requireAccount(request.accountId);
      const conversationId = requestName(request.conversationId, 'CONVERSATION_ID_INVALID');
      const maxMessages = request.maxMessages === undefined || request.maxMessages === 0 ? 50000 : request.maxMessages;
      if (!Number.isInteger(maxMessages) || maxMessages < 1 || maxMessages > 500000) throw error('ANALYSIS_MAX_MESSAGES_INVALID');
      const utcOffsetMinutes = request.utcOffsetMinutes === undefined ? 0 : request.utcOffsetMinutes;
      if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw error('ANALYSIS_OPTIONS_INVALID');
      const result = await buildConversationReport({
        conversationId,
        maxMessages,
        utcOffsetMinutes,
        listMessages: ({ conversationId: id, ascending, page }) => handlers.listMessages({ accountId: request.accountId, conversationId: id, ascending, page })
      });
      return { reportJson: Buffer.from(JSON.stringify(result.report), 'utf8'), itemCount: result.itemCount, truncated: result.truncated };
    },
    async startAggregateAnalysis(request) {
      await requireAccount(request.accountId);
      const normalized = validateAggregateAnalysisRequest(request);
      let conversationsTotal = 1;
      if (normalized.scope === 1 || normalized.scope === 3) {
        const sessions = await listAnalysisSessions();
        const excluded = new Set(normalized.excludedConversationIds);
        conversationsTotal = sessions.filter(session => !excluded.has(session.username) && (normalized.scope !== 1 || !session.username.endsWith('@chatroom'))).length;
      }
      return aggregateAnalysisJobs.start(normalized, conversationsTotal);
    },
    async watchAggregateAnalysis(request) {
      return aggregateAnalysisJobs.watch(request.analysisId);
    },
    async cancelAggregateAnalysis(request) {
      return aggregateAnalysisJobs.cancel(request.analysisId);
    },
    async browseConversationMessages(request) {
      if (typeof request.accountId !== 'string' || !request.accountId.trim() || typeof request.conversationId !== 'string') throw error('TYPE_BROWSE_REQUEST_INVALID');
      return browseMessages(request, false);
    },
    async browseAccountMedia(request) {
      if (typeof request.accountId !== 'string' || !request.accountId.trim()) throw error('ACCOUNT_MEDIA_REQUEST_INVALID');
      return browseMessages(request, true);
    },
    async exportConversation(request) {
      await requireAccount(request.accountId);
      const requestedFormat = text(request.format, 32).toLowerCase();
      if (MEDIA_METADATA_EXPORT_FORMATS.has(requestedFormat)) return exportMediaMetadata({ ...request, format: requestedFormat });
      const conversationId = requestName(request.conversationId, 'EXPORT_REQUEST_INVALID');
      if (request.includeMedia === true) throw error('EXPORT_MEDIA_UNSUPPORTED');
      if (request.includeMedia !== false && request.includeMedia !== undefined) throw error('EXPORT_REQUEST_INVALID');
      const formatInput = requestedFormat;
      const format = formatInput === 'md' ? 'markdown' : formatInput;
      if (!CONVERSATION_EXPORT_FORMATS.has(format)) throw error('EXPORT_FORMAT_UNSUPPORTED');
      const excluded = [configuredSourcePath, dataDir, stateDir];
      const destinationPath = inspectExportPath(request.destinationPath, excluded, true).destination;
      const expectedExtension = format === 'markdown' ? '.md' : CHAT_FORMAT_EXTENSIONS[format] || `.${format}`;
      if (path.extname(destinationPath).toLowerCase() !== expectedExtension) throw error('EXPORT_REQUEST_INVALID');
      if (request.page?.cursor?.length) throw error('EXPORT_PAGE_UNSUPPORTED');
      const start = requestTime(request.startTimeUnixMs, 'EXPORT_REQUEST_INVALID', true);
      const end = requestTime(request.endTimeUnixMs, 'EXPORT_REQUEST_INVALID', true);
      if (start !== undefined && end !== undefined && start > end) throw error('EXPORT_REQUEST_INVALID');
      const startedAt = Date.now();
      const items = [];
      let estimatedJsonBytes = 1024;
      let cursor = '', done = false, pageLimit = EXPORT_PAGE_SIZE;
      const list = { conversationId, ascending: true };
      let lowerSecond = 0n, upperSecond;
      // The bridge indexes whole seconds. Expand the requested millisecond
      // interval by one millisecond, then apply the exact bound below.
      if (start !== undefined) lowerSecond = start === 0n ? 0n : (start - 1n) / 1000n + 1n;
      if (start !== undefined) list.afterTime = String(lowerSecond);
      if (end !== undefined && end < INT64_MAX) { upperSecond = end / 1000n; list.beforeTime = String(upperSecond); }
      if (upperSecond !== undefined && lowerSecond > upperSecond) done = true;
      while (!done) {
        if (Date.now() - startedAt > MAX_EXPORT_RUNTIME_MS) throw error('EXPORT_TIMEOUT');
        let page;
        for (;;) {
          try { page = checkedPage(await callData('messages.list', { ...list, limit: pageLimit, cursor }), pageLimit); break; }
          catch (failure) {
            if (failure.message !== 'RESPONSE_TOO_LARGE' || pageLimit === 1) throw failure;
            pageLimit = Math.max(1, Math.floor(pageLimit / 2));
          }
        }
        for (const row of page.items) {
          if (Date.now() - startedAt > MAX_EXPORT_RUNTIME_MS) throw error('EXPORT_TIMEOUT');
          const message = messageFromRow(row, conversationId);
          if (start !== undefined && message.sentAtUnixMs < start || end !== undefined && message.sentAtUnixMs > end) continue;
          const exported = exportMessage(message);
          const encodedItem = JSON.stringify(exported);
          estimatedJsonBytes += Buffer.byteLength(encodedItem, 'utf8') + (items.length ? 1 : 0);
          items.push(exported);
          if (items.length > MAX_EXPORT_MESSAGES) throw error('EXPORT_LIMIT_EXCEEDED');
          // This catches a malicious bridge row before rendering allocates an
          // unbounded JSON/Markdown buffer.
          if (Buffer.byteLength(encodedItem, 'utf8') > MAX_EXPORT_BYTES || estimatedJsonBytes > MAX_EXPORT_BYTES) throw error('EXPORT_LIMIT_EXCEEDED');
        }
        done = !page.nextCursor; cursor = page.nextCursor;
      }
      guard();
      const meta = { accountId, conversationId, ...(start !== undefined ? { startTimeUnixMs: start.toString() } : {}), ...(end !== undefined ? { endTimeUnixMs: end.toString() } : {}) };
      const output = format === 'json' ? JSON.stringify({ version: 1, format, ...meta, itemCount: items.length, messages: items }) + '\n' : format === 'markdown' ? markdownExport(meta, items) : format === 'html' ? htmlExport(meta, items) : format === 'xlsx' ? conversationXlsxOutput(items) : CHAT_DERIVED_FORMATS.has(format) ? derivedConversationOutput(format, meta, items) : textExport(meta, items);
      if (Buffer.byteLength(output, 'utf8') > MAX_EXPORT_BYTES) throw error('EXPORT_LIMIT_EXCEEDED');
      if (Date.now() - startedAt > MAX_EXPORT_RUNTIME_MS) throw error('EXPORT_TIMEOUT');
      const temporary = path.join(path.dirname(destinationPath), `.alpha-export-${crypto.randomUUID()}.tmp`);
      let handle;
      const createdDirectories = [];
      try {
        prepareExportPath(destinationPath, excluded, guard, createdDirectories);
        handle = await fs.promises.open(temporary, 'wx', 0o600);
        await handle.writeFile(output, 'utf8');
        await handle.sync();
        await handle.close(); handle = null;
        // hard-link + unlink publishes only when destination is still absent;
        // rename would silently replace a user-selected file on POSIX.
        guard();
        inspectExportPath(destinationPath, excluded);
        await fs.promises.link(temporary, destinationPath);
        await fs.promises.unlink(temporary);
      } catch (failure) {
        if (handle) await handle.close().catch(() => {});
        await fs.promises.rm(temporary, { force: true }).catch(() => {});
        cleanupExportDirectories(createdDirectories);
        if (failure.message === 'EXPORT_OUTPUT_EXISTS' || failure.code === 'EEXIST') throw error('EXPORT_OUTPUT_EXISTS');
        if (/^EXPORT_[A-Z0-9_]+$/.test(failure.message || '')) throw failure;
        throw error('EXPORT_OUTPUT_FAILED');
      }
      return { destinationPath, format, itemCount: items.length, mediaManifestPath: '', mediaIncluded: 0, mediaFailed: 0 };
    },
    async exportMoments(request) {
      return exportMoments(request);
    },
    async exportContacts(request) {
      await requireAccount(request.accountId);
      if (!Array.isArray(request.categories) || request.categories.length < 1 || request.categories.length > 8 || new Set(request.categories).size !== request.categories.length || request.categories.some(category => typeof category !== 'string' || !CONTACT_EXPORT_ALL_CATEGORIES.has(category))) throw error('CONTACT_EXPORT_REQUEST_INVALID');
      if (request.categories.some(category => !CONTACT_EXPORT_CATEGORIES.has(category))) throw error('CONTACT_EXPORT_CATEGORY_UNSUPPORTED');
      if (typeof request.query !== 'string' || request.query.length > 1024 || request.query.includes('\0')) throw error('CONTACT_EXPORT_REQUEST_INVALID');
      const format = request.format;
      if (!CONTACT_EXPORT_FORMATS.has(format)) throw error('EXPORT_FORMAT_UNSUPPORTED');
      if (request.includeProfile !== true && request.includeProfile !== false || request.includeAvatars !== true && request.includeAvatars !== false) throw error('CONTACT_EXPORT_REQUEST_INVALID');
      if (request.includeAvatars) throw error('CONTACT_EXPORT_AVATARS_UNSUPPORTED');
      if (typeof request.destinationPath !== 'string' || !path.isAbsolute(request.destinationPath) || !request.destinationPath.trim() || request.destinationPath.length > 4096 || /[\u0000-\u001f\u007f]/.test(request.destinationPath) || path.extname(request.destinationPath).toLowerCase() !== `.${format}`) throw error('CONTACT_EXPORT_REQUEST_INVALID');
      if (!Number.isInteger(request.utcOffsetMinutes) || request.utcOffsetMinutes < -840 || request.utcOffsetMinutes > 840) throw error('CONTACT_EXPORT_REQUEST_INVALID');
      const destinationPath = inspectExportPath(request.destinationPath, [configuredSourcePath, dataDir, stateDir], true).destination;
      const categories = new Set(request.categories);
      const startedAt = Date.now();
      const items = [];
      let cursor = '';
      do {
        if (Date.now() - startedAt > MAX_EXPORT_RUNTIME_MS) throw error('CONTACT_EXPORT_TIMEOUT');
        const page = checkedPage(await callData('contacts.list', { limit: 500, cursor, ...(request.query ? { query: request.query } : {}) }), 500);
        for (const row of page.items) {
          const item = contactExportRow(row, request.includeProfile);
          const category = item.category;
          if (!category || !categories.has(category)) continue;
          items.push(item);
          if (items.length > CONTACT_EXPORT_MAX_ITEMS) throw error('CONTACT_EXPORT_TOO_LARGE');
        }
        cursor = page.nextCursor;
      } while (cursor);
      const meta = { accountId, categories: [...categories], query: request.query, includeProfile: request.includeProfile };
      const output = contactExportOutput(format, meta, items);
      if (Buffer.byteLength(output, 'utf8') > CONTACT_EXPORT_MAX_BYTES) throw error('CONTACT_EXPORT_TOO_LARGE');
      const temporary = path.join(path.dirname(destinationPath), `.alpha-contact-export-${crypto.randomUUID()}.tmp`);
      let handle;
      const createdDirectories = [];
      const excluded = [configuredSourcePath, dataDir, stateDir];
      try {
        prepareExportPath(destinationPath, excluded, guard, createdDirectories);
        handle = await fs.promises.open(temporary, 'wx', 0o600);
        await handle.writeFile(output, 'utf8');
        await handle.sync();
        await handle.close(); handle = null;
        guard();
        inspectExportPath(destinationPath, excluded);
        await fs.promises.link(temporary, destinationPath);
        await fs.promises.unlink(temporary);
      } catch (failure) {
        if (handle) await handle.close().catch(() => {});
        await fs.promises.rm(temporary, { force: true }).catch(() => {});
        cleanupExportDirectories(createdDirectories);
        if (failure.message === 'EXPORT_OUTPUT_EXISTS' || failure.code === 'EEXIST') throw error('EXPORT_OUTPUT_EXISTS');
        if (/^[A-Z][A-Z0-9_]{1,95}$/.test(failure.message || '')) throw failure;
        throw error('EXPORT_OUTPUT_FAILED');
      }
      return { destinationPath, format, itemCount: items.length, avatarCount: 0, avatarDirectory: '' };
    },
    async exportGroupMembers(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('groups.members')) throw error('CAPABILITY_UNAVAILABLE');
      if (typeof request.chatroomId !== 'string' || request.chatroomId !== request.chatroomId.trim() || request.chatroomId.length <= 9 || request.chatroomId.length > 256 || !request.chatroomId.endsWith('@chatroom') || /[\u0000-\u001f\u007f]/.test(request.chatroomId)) throw error('GROUP_MEMBER_EXPORT_REQUEST_INVALID');
      if (typeof request.format !== 'string' || !GROUP_MEMBER_EXPORT_FORMATS.has(request.format)) throw error('EXPORT_FORMAT_UNSUPPORTED');
      if (typeof request.destinationPath !== 'string' || !path.isAbsolute(request.destinationPath) || request.destinationPath.length > 4096 || /[\u0000-\u001f\u007f]/.test(request.destinationPath) || path.extname(request.destinationPath).toLowerCase() !== `.${request.format}`) throw error('GROUP_MEMBER_EXPORT_REQUEST_INVALID');
      if (!Number.isInteger(request.utcOffsetMinutes) || request.utcOffsetMinutes < -840 || request.utcOffsetMinutes > 840) throw error('GROUP_MEMBER_EXPORT_REQUEST_INVALID');
      const excluded = [configuredSourcePath, dataDir, stateDir];
      const destinationPath = inspectExportPath(request.destinationPath, excluded, true).destination;
      const members = [];
      for (let offset = 0; offset <= 5000; offset += 1000) {
        const page = await callData('general.list', { tableName: '__alpha_group_members', query: request.chatroomId, limit: 1000, offset, ascending: true });
        if (!page || !Array.isArray(page.items) || page.items.length > 1000 || typeof page.sourceDatabase !== 'string' || page.sourceDatabase.length > 1024) throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
        members.push(...page.items.map(groupMemberExportRow));
        if (members.length > 5000) throw error('GROUP_MEMBER_EXPORT_TOO_LARGE');
        if (page.items.length < 1000) break;
      }
      const output = groupMemberExportOutput(request.format, { accountId: request.accountId, chatroomId: request.chatroomId, utcOffsetMinutes: request.utcOffsetMinutes }, members);
      if (Buffer.byteLength(output, 'utf8') > CONTACT_EXPORT_MAX_BYTES) throw error('GROUP_MEMBER_EXPORT_TOO_LARGE');
      const temporary = path.join(path.dirname(destinationPath), `.alpha-group-member-export-${crypto.randomUUID()}.tmp`);
      let handle;
      const createdDirectories = [];
      try {
        prepareExportPath(destinationPath, excluded, guard, createdDirectories);
        handle = await fs.promises.open(temporary, 'wx', 0o600);
        await handle.writeFile(output, 'utf8');
        await handle.sync();
        await handle.close(); handle = null;
        guard(); inspectExportPath(destinationPath, excluded);
        await fs.promises.link(temporary, destinationPath);
        await fs.promises.unlink(temporary);
      } catch (failure) {
        if (handle) await handle.close().catch(() => {});
        await fs.promises.rm(temporary, { force: true }).catch(() => {});
        cleanupExportDirectories(createdDirectories);
        if (failure.message === 'EXPORT_OUTPUT_EXISTS' || failure.code === 'EEXIST') throw error('EXPORT_OUTPUT_EXISTS');
        if (/^[A-Z][A-Z0-9_]{1,95}$/.test(failure.message || '')) throw failure;
        throw error('EXPORT_OUTPUT_FAILED');
      }
      return { destinationPath, format: request.format, memberCount: members.length };
    },
    async listContacts(request) {
      await requireAccount(request.accountId);
      if (request.directory !== undefined) {
        const directory = request.directory;
        if (!directory || typeof directory !== 'object' || Array.isArray(directory) || !Array.isArray(directory.categories) || directory.categories.length > CONTACT_DIRECTORY_ALL_CATEGORIES.length) throw error('CONTACT_DIRECTORY_REQUEST_INVALID');
        const selectedCategories = new Set();
        for (const category of directory.categories) {
          if (typeof category !== 'string' || !CONTACT_DIRECTORY_ALL_CATEGORIES.includes(category) || selectedCategories.has(category)) throw error('CONTACT_DIRECTORY_REQUEST_INVALID');
          selectedCategories.add(category);
        }
        const unsupported = [...selectedCategories].filter(category => !CONTACT_DIRECTORY_KNOWN_CATEGORIES.has(category));
        if (unsupported.length) throw error('CONTACT_DIRECTORY_CATEGORY_UNSUPPORTED');
        if (directory.exportScope !== undefined) {
          const scope = directory.exportScope;
          if (!scope || typeof scope !== 'object' || Array.isArray(scope) || typeof scope.includeProfile !== 'boolean' || typeof scope.includeAvatar !== 'boolean') throw error('CONTACT_DIRECTORY_REQUEST_INVALID');
          if (scope.includeProfile || scope.includeAvatar) throw error('CONTACT_DIRECTORY_EXPORT_SCOPE_UNSUPPORTED');
        }
        const limit = Math.min(request.limit || 100, 500), offset = request.offset || 0;
        if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw error('CONTACT_DIRECTORY_PAGE_INVALID');
        if (request.query !== undefined && typeof request.query !== 'string') throw error('CONTACT_QUERY_INVALID');
        const query = request.query || '';
        let usernameExact, literalQuery;
        if (query.startsWith(EXACT_CONTACT)) {
          usernameExact = query.slice(EXACT_CONTACT.length);
          if (!usernameExact) throw error('CONTACT_QUERY_INVALID');
        } else if (query) {
          if (Buffer.byteLength(query, 'utf8') > 512 || query.trim() === '' || query.includes('\0')) throw error('CONTACT_QUERY_INVALID');
          literalQuery = query;
        }
        const selected = selectedCategories.size ? selectedCategories : CONTACT_DIRECTORY_KNOWN_CATEGORIES;
        const counts = Object.fromEntries(CONTACT_DIRECTORY_ALL_CATEGORIES.map(category => [category, 0]));
        const contacts = [];
        const seenUsernames = new Set();
        let cursor = '';
        let scanned = 0;
        let pageCount = 0;
        do {
          pageCount += 1;
          if (pageCount > CONTACT_DIRECTORY_MAX_PAGES) throw error('CONTACT_DIRECTORY_TOO_LARGE');
          const page = checkedPage(await callData('contacts.list', { limit: 500, cursor, ...(usernameExact ? { usernameExact } : {}), ...(literalQuery ? { query: literalQuery } : {}) }), 500);
          scanned += page.items.length;
          if (scanned > CONTACT_DIRECTORY_MAX_ITEMS) throw error('CONTACT_DIRECTORY_TOO_LARGE');
          for (const row of page.items) {
            const contact = contactCodec.nativeContactFromRow({ ...row, sourceTable: 'contact' });
            if (seenUsernames.has(contact.username)) throw error('CONTACT_DIRECTORY_AMBIGUOUS');
            seenUsernames.add(contact.username);
            const category = contactDirectoryCategory(contact);
            if (!category) continue;
            counts[category] += 1;
            if (selected.has(category)) contacts.push({ contact, category, officialAccountKind: '' });
          }
          cursor = page.nextCursor;
        } while (cursor);
        if (request.ascending !== true) contacts.reverse();
        const total = contacts.length;
        const items = contacts.slice(offset, offset + limit);
        return {
          response: {
            directory: {
              items,
              counts: CONTACT_DIRECTORY_ALL_CATEGORIES.map(category => ({ category, count: counts[category] })),
              total,
              hasMore: offset + items.length < total
            }
          }
        };
      }
      if (request.lookup !== undefined) {
        if (request.query !== undefined && request.query !== '') throw error('CONTACT_LOOKUP_INVALID');
        if (request.limit !== undefined && request.limit !== 0 || request.offset !== undefined && request.offset !== 0 || request.ascending === true) throw error('CONTACT_LOOKUP_INVALID');
        const usernames = contactCodec.validateLookupUsernames(request.lookup?.usernames);
        const value = contactCodec.checkedLookup(await callData('contacts.lookup', { usernames }), usernames);
        return { response: { items: value.items, sourceDatabase: value.sourceDatabase, sourceTable: value.sourceTable, lookup: { items: value.items } } };
      }
      const limit = Math.min(request.limit || 100, 500), offset = request.offset || 0;
      if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw error('CONTACT_PAGE_INVALID');
      if (request.query !== undefined && typeof request.query !== 'string') throw error('CONTACT_QUERY_INVALID');
      const query = request.query || ''; let usernameExact, literalQuery;
      if (query.startsWith(EXACT_CONTACT)) { usernameExact = query.slice(EXACT_CONTACT.length); if (!usernameExact) throw error('CONTACT_QUERY_INVALID'); }
      else if (query) {
        if (Buffer.byteLength(query, 'utf8') > 512 || query.trim() === '' || query.includes('\0')) throw error('CONTACT_QUERY_INVALID');
        literalQuery = query;
      }
      let cursor = '', response;
      const contacts = [];
      do {
        response = checkedPage(await callData('contacts.list', { limit: 500, cursor, ...(usernameExact ? { usernameExact } : {}), ...(literalQuery ? { query: literalQuery } : {}) }), 500);
        contacts.push(...response.items.map(row => contactCodec.nativeContactFromRow({ ...row, sourceTable: 'contact' })));
        if (contacts.length > CONTACT_DIRECTORY_MAX_ITEMS) throw error('CONTACT_PAGE_TOO_LARGE');
        cursor = response.nextCursor;
      } while (cursor);
      if (request.ascending !== true) contacts.reverse();
      return { response: { items: contacts.slice(offset, offset + limit), sourceTable: 'contact' } };
    },
    async listMoments(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('moments.list')) throw error('CAPABILITY_UNAVAILABLE');
      const limit = request.limit || 100, offset = request.offset || 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw error('MOMENTS_REQUEST_INVALID');
      if (request.username !== undefined && (typeof request.username !== 'string' || request.username.length > 1024 || request.username.includes('\0'))) throw error('MOMENTS_REQUEST_INVALID');
      if (request.keyword !== undefined && (typeof request.keyword !== 'string' || request.keyword.length > 512 || request.keyword.trim() !== request.keyword || request.keyword.includes('\0'))) throw error('MOMENTS_REQUEST_INVALID');
      const from = request.startTimeUnixMs === undefined || request.startTimeUnixMs === 0n ? undefined : requestTime(request.startTimeUnixMs, 'MOMENTS_REQUEST_INVALID');
      const to = request.endTimeUnixMs === undefined || request.endTimeUnixMs === 0n ? undefined : requestTime(request.endTimeUnixMs, 'MOMENTS_REQUEST_INVALID');
      if (from !== undefined && to !== undefined && to < from) throw error('MOMENTS_REQUEST_INVALID');
      const value = await callData('moments.list', { limit, offset, ascending: request.ascending === true, ...(request.username ? { username: request.username } : {}), ...(request.keyword ? { keyword: request.keyword } : {}), ...(from !== undefined ? { fromUnixMs: from.toString() } : {}), ...(to !== undefined ? { toUnixMs: to.toString() } : {}) });
      if (!value || !Array.isArray(value.items) || value.items.length > limit || typeof value.sourceDatabase !== 'string' || value.sourceDatabase.length > 1024 || typeof value.sourceTable !== 'string') throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
      return { response: { items: value.items.map(momentFromRow), sourceDatabase: text(value.sourceDatabase, 1024), sourceTable: text(value.sourceTable, 1024) } };
    },
    async listFavorites(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('favorites.list')) throw error('CAPABILITY_UNAVAILABLE');
      const limit = request.limit || 100, offset = request.offset || 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > 500 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw error('FAVORITES_REQUEST_INVALID');
      if (request.type !== undefined && (!Number.isInteger(request.type) || request.type < -1 || request.type > 0x7fffffff)) throw error('FAVORITES_REQUEST_INVALID');
      if (request.query !== undefined && (typeof request.query !== 'string' || request.query.length > 512 || request.query.trim() !== request.query || request.query.includes('\0'))) throw error('FAVORITES_REQUEST_INVALID');
      if (request.includeMedia === true) throw error('FAVORITES_MEDIA_UNAVAILABLE');
      if (request.skipSourceContext !== undefined && typeof request.skipSourceContext !== 'boolean') throw error('FAVORITES_REQUEST_INVALID');
      const tagId = request.tagId === undefined ? 0n : request.tagId;
      if (typeof tagId !== 'bigint' || tagId < 0n || tagId > (1n << 64n) - 1n) throw error('FAVORITES_REQUEST_INVALID');
      const value = await callData('favorites.list', {
        limit,
        offset,
        ascending: request.ascending === true,
        ...(request.type !== undefined && request.type !== 0 && request.type !== -1 ? { type: request.type } : {}),
        ...(request.query ? { query: request.query } : {}),
        includeTypeCounts: request.includeTypeCounts === true,
        ...(tagId > 0n ? { tagId: tagId.toString() } : {})
      });
      if (!value || !Array.isArray(value.items) || value.items.length > limit || typeof value.sourceDatabase !== 'string' || typeof value.sourceTable !== 'string' || value.sourceTable !== '__alpha_favorites_v1' || !Array.isArray(value.typeCounts) || !Number.isInteger(value.total) || value.total < 0 || value.total > 100000 || typeof value.hasMore !== 'boolean' || !Array.isArray(value.tags)) throw error('BRIDGE_FAVORITES_RESPONSE_INVALID');
      const typeCounts = value.typeCounts.map(row => {
        if (!row || !Number.isInteger(row.type) || row.type < 0 || row.type > 0x7fffffff || !Number.isInteger(row.count) || row.count < 0 || row.count > 0xffffffff) throw error('BRIDGE_FAVORITES_RESPONSE_INVALID');
        return { type: row.type, count: row.count };
      });
      const seenTags = new Set();
      const tags = value.tags.map(row => {
        if (!row || typeof row.id !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(row.id) || typeof row.name !== 'string' || row.name.length > 1024 || row.name.includes('\0') || !Number.isInteger(row.count) || row.count < 0 || row.count > 0xffffffff || seenTags.has(row.id)) throw error('BRIDGE_FAVORITES_RESPONSE_INVALID');
        seenTags.add(row.id);
        return { id: decimal(row.id), name: row.name, count: row.count };
      });
      return { response: { items: value.items.map(favoriteFromRow), sourceDatabase: text(value.sourceDatabase, 1024), sourceTable: value.sourceTable, typeCounts, total: value.total, hasMore: value.hasMore, tags } };
    },
    async listFavoriteMediaSlots(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('favorites.media')) throw error('CAPABILITY_UNAVAILABLE');
      if (!request || typeof request.favoriteId !== 'string' || !request.favoriteId || request.favoriteId.length > 1024 || request.favoriteId.includes('\0')) throw error('FAVORITES_REQUEST_INVALID');
      const value = await callData('favorites.mediaSlots', { favoriteId: request.favoriteId });
      if (!value || value.status !== 'ready' || !value.media || !Array.isArray(value.media.slots) || value.media.slots.length > 64 || typeof value.media.truncated !== 'boolean') throw error('BRIDGE_FAVORITES_MEDIA_RESPONSE_INVALID');
      const slots = value.media.slots.map(slot => {
        if (!slot || !Number.isInteger(slot.itemIndex) || slot.itemIndex < 0 || slot.itemIndex > 0xffffffff || typeof slot.role !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(slot.role) || typeof slot.token !== 'string' || !/^fav1_[0-9a-f]{32}$/.test(slot.token)) throw error('BRIDGE_FAVORITES_MEDIA_RESPONSE_INVALID');
        return { itemIndex: slot.itemIndex, role: slot.role, token: slot.token };
      });
      return { status: 'ready', media: { slots, truncated: value.media.truncated } };
    },
    async resolveFavoriteMedia(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('favorites.media')) throw error('CAPABILITY_UNAVAILABLE');
      if (!request || typeof request.token !== 'string' || !/^fav1_[0-9a-f]{32}$/.test(request.token)) throw error('FAVORITES_MEDIA_REQUEST_INVALID');
      const metadata = await callData('favorites.media', { token: request.token });
      if (!metadata || metadata.status === 'missing') return { status: 'missing' };
      if (metadata.status !== 'ready' || metadata.token !== request.token || typeof metadata.favoriteId !== 'string' || typeof metadata.role !== 'string') throw error('BRIDGE_FAVORITES_MEDIA_RESPONSE_INVALID');
      const index = independentMediaIndex();
      if (!index || !Array.isArray(index.entries)) return { status: 'missing' };
      const candidates = index.entries.filter(entry => entry.id === request.token && (!entry.accountId || entry.accountId === accountId));
      if (candidates.length !== 1) return { status: 'missing' };
      const entry = candidates[0];
      await readMediaEntry(index, entry, { maxBytes: 64 * 1024 * 1024 });
      const mimeType = entry.mimeType || ({ image: 'image/png', video: 'video/mp4', voice: 'audio/ogg', file: 'application/octet-stream' }[entry.kind] || 'application/octet-stream');
      const fileName = entry.kind === 'file' ? path.basename(entry.relativePath) : '';
      return { status: 'ready', opaqueId: entry.sha256, mimeType, ...(fileName ? { fileName } : {}) };
    },
    async listMomentAuthors(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('moments.authors')) throw error('CAPABILITY_UNAVAILABLE');
      const limit = request.limit || 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw error('MOMENTS_REQUEST_INVALID');
      const value = await callData('moments.authors', { limit });
      if (!value || !Array.isArray(value.items) || value.items.length > limit || typeof value.totalPosts !== 'string' || typeof value.sourceDatabase !== 'string' || typeof value.sourceTable !== 'string') throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
      return { response: { items: value.items.map(momentAuthorFromRow), totalPosts: safeCount(value.totalPosts), truncated: value.truncated === true, sourceDatabase: text(value.sourceDatabase, 1024), sourceTable: text(value.sourceTable, 1024) } };
    },
    async resolveMomentEmoji(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('moments.emoji')) throw error('CAPABILITY_UNAVAILABLE');
      if (!request || typeof request.source !== 'string' || !syntheticMomentEmojiSource(request.source)) throw error('MOMENT_EMOJI_REQUEST_INVALID');
      const value = await callData('moments.emoji', { source: request.source });
      if (!value || typeof value.status !== 'string' || !['ready', 'missing'].includes(value.status)) throw error('MOMENT_EMOJI_RESPONSE_INVALID');
      if (value.status === 'missing') return { status: 'missing' };
      if (value.source !== request.source || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1 || value.sizeBytes > 64 * 1024 * 1024 || !MOMENT_EMOJI_MIMES.has(value.mimeType) || typeof value.relativePath !== 'string' || value.relativePath.length > 4096 || value.relativePath.startsWith('/') || value.relativePath.includes('\\') || value.relativePath.split('/').some(part => !part || part === '.' || part === '..') || (value.accountId && value.accountId !== request.accountId)) throw error('MOMENT_EMOJI_RESPONSE_INVALID');
      const index = independentMediaIndex();
      if (!index || !Array.isArray(index.entries)) return { status: 'missing' };
      const candidates = index.entries.filter(entry => entry.kind === 'image' && entry.sha256 === value.sha256 && entry.relativePath === value.relativePath && entry.sizeBytes === value.sizeBytes && entry.mimeType === value.mimeType && (!entry.accountId || entry.accountId === request.accountId));
      if (candidates.length !== 1) return { status: candidates.length > 1 ? 'missing' : 'missing' };
      await readMediaEntry(index, candidates[0], { maxBytes: 64 * 1024 * 1024 });
      return { status: 'ready', opaqueId: value.sha256, mimeType: value.mimeType };
    },
    async getMomentDayCounts(request) {
      const accountInfo = await requireAccount(request.accountId);
      if (!accountInfo.capabilities?.includes('moments.dayCounts')) throw error('CAPABILITY_UNAVAILABLE');
      const from = requestTime(request.fromUnixMs, 'MOMENTS_REQUEST_INVALID'), to = requestTime(request.toUnixMs, 'MOMENTS_REQUEST_INVALID');
      if (to <= from || to - from > 366n * 86400000n || !Number.isInteger(request.utcOffsetMinutes) || request.utcOffsetMinutes < -840 || request.utcOffsetMinutes > 840) throw error('MOMENTS_REQUEST_INVALID');
      const value = await callData('moments.dayCounts', { fromUnixMs: from.toString(), toUnixMs: to.toString(), utcOffsetMinutes: request.utcOffsetMinutes, ...(request.username ? { username: request.username } : {}) });
      if (!value || typeof value.available !== 'boolean' || !Array.isArray(value.days) || value.days.length > 367) throw error('BRIDGE_MOMENTS_RESPONSE_INVALID');
      let previous = null;
      const days = value.days.map(row => { if (!row || typeof row.localDay !== 'string' || typeof row.count !== 'string') throw error('BRIDGE_MOMENTS_RESPONSE_INVALID'); const localDay = decimal(row.localDay, true), count = safeCount(row.count); if (count === 0n || previous !== null && localDay <= previous) throw error('BRIDGE_MOMENTS_RESPONSE_INVALID'); previous = localDay; return { localDay, count }; });
      return { available: value.available, days };
    },
    async getContactProfile(request) {
      const accountInfo = await requireAccount(request.accountId);
      const username = requestName(request.username, 'CONTACT_PROFILE_REQUEST_INVALID');
      const commonGroupLimit = request.commonGroupLimit ?? 0;
      if (!Number.isInteger(commonGroupLimit) || commonGroupLimit < 0 || commonGroupLimit > 20) throw error('CONTACT_PROFILE_REQUEST_INVALID');
      if (username.endsWith('@chatroom')) {
        if (!(accountInfo.capabilities?.includes('groups.members'))) throw error('CAPABILITY_UNAVAILABLE');
        // The bridge derives these records from chat_room.ext_buffer and
        // marks the owner explicitly. Page through its bounded response so
        // memberCount is not silently limited by the transport frame size.
        const items = [];
        for (let offset = 0; offset <= 5000 && items.length < 5000; offset += 1000) {
          const value = await callData('general.list', {
            tableName: '__alpha_group_members', query: username,
            limit: 1000, offset, ascending: true
          });
          if (!value || !Array.isArray(value.items) || value.items.length > 1000 || typeof value.sourceDatabase !== 'string' || value.sourceDatabase.length > 1024) throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
          const page = value.items.map(generalRecordFromRow);
          items.push(...page);
          if (page.length < 1000) break;
        }
        if (items.length > 5000) throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
        if (!items.length) return { response: { found: false } };
        let ownerUsername = '';
        for (const item of items) {
          const usernameField = item.fields.find(field => field.name === 'username');
          if (!usernameField || usernameField.value !== item.actor) throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
          for (const field of item.fields) {
            if (field.name !== 'isOwner') continue;
            if (field.value !== 'true' && field.value !== 'false') throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
            if (field.value === 'true') {
              if (ownerUsername && ownerUsername !== item.actor) throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
              ownerUsername = item.actor;
            }
          }
        }
        return { response: { found: true, profile: {
          username,
          gender: 0,
          signature: '', region: '', regionCountry: '', regionProvince: '', regionCity: '',
          addScene: 0, addSceneLabel: '', addedAtUnixMs: 0n, description: '', labels: [],
          enterpriseName: '', bigAvatarRef: '', commonGroups: [], commonGroupCount: 0,
          commonGroupsTruncated: false, memberCount: items.length, ownerUsername,
          announcement: '',
          friendVerifications: [], friendVerificationCount: 0
        } } };
      }
      if (!(accountInfo.capabilities?.includes('contacts.list'))) throw error('CAPABILITY_UNAVAILABLE');
      const value = contactCodec.checkedLookup(await callData('contacts.lookup', { usernames: [username] }), [username]);
      const item = value.items[0];
      if (!item) return { response: { found: false } };
      let commonGroups = [], commonGroupCount = 0, commonGroupsTruncated = false;
      if (accountInfo.capabilities?.includes('groups.members')) {
        const common = commonGroupsFromRow(await callData('groups.common', { username, limit: commonGroupLimit }), commonGroupLimit);
        commonGroups = common.items;
        commonGroupCount = common.count;
        commonGroupsTruncated = common.truncated;
      }
      // The v4 contact table has no verified profile, avatar, label, or
      // friend-verification columns. Preserve those fields as empty rather
      // than copying alias/remark into unrelated profile fields. The one
      // profile fact available here is the exact username; richer profiles
      // remain unavailable until their source schema is recovered.
      return { response: { found: true, profile: {
        username: item.username,
        gender: 0,
        signature: '', region: '', regionCountry: '', regionProvince: '', regionCity: '',
        addScene: 0, addSceneLabel: '', addedAtUnixMs: 0n, description: '', labels: [],
        enterpriseName: '', bigAvatarRef: '', commonGroups, commonGroupCount,
        commonGroupsTruncated, memberCount: 0, ownerUsername: '', announcement: '',
        friendVerifications: [], friendVerificationCount: 0
      } } };
    },
    async listGeneral(request) {
      await requireAccount(request.accountId);
      if (!GENERAL_RECORD_TABLES.has(request.tableName)) throw error('UNIMPLEMENTED');
      const recordTable = request.tableName !== '__alpha_group_members';
      if (recordTable) {
        if (typeof request.query !== 'string' || Buffer.byteLength(request.query, 'utf8') > 512 || /[\u0000-\u001f\u007f]/.test(request.query) || request.query !== request.query.trim() || request.ascending === undefined || (request.ascending !== true && request.ascending !== false)) throw error('GENERAL_RECORDS_REQUEST_INVALID');
      } else if (typeof request.query !== 'string' || request.query !== request.query.trim() || request.query.length <= 9 || request.query.length > 256 || !request.query.endsWith('@chatroom') || /[\u0000-\u001f\u007f]/.test(request.query) || request.ascending !== true) throw error('GROUP_MEMBERS_REQUEST_INVALID');
      const limit = request.limit || 1000, offset = request.offset || 0;
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000 || !Number.isInteger(offset) || offset < 0 || offset > 20000) throw error(recordTable ? 'GENERAL_RECORDS_REQUEST_INVALID' : 'GROUP_MEMBERS_REQUEST_INVALID');
      const value = await callData('general.list', { tableName: request.tableName, query: request.query, limit, offset, ascending: request.ascending });
      if (!value || !Array.isArray(value.items) || value.items.length > limit || typeof value.sourceDatabase !== 'string' || value.sourceDatabase.length > 1024) throw error('BRIDGE_GENERAL_RESPONSE_INVALID');
      return { response: { items: value.items.map(generalRecordFromRow), sourceDatabase: text(value.sourceDatabase, 1024) } };
    },
    async listConversations(request) {
      const accountInfo = await requireAccount(request.accountId); const limit = pageSize(request.page);
      const page = checkedPage(await callData('sessions.list', { limit, cursor: readCursor(request.page?.cursor) }), limit);
      const usernames = page.items.map(row => text(row.username));
      const resolved = await lookupContactNames(usernames, accountInfo);
      const items = [];
      for (const row of page.items) { const username = text(row.username); items.push({ id: username, accountId, kind: username.endsWith('@chatroom') ? 2 : 1, displayName: resolved.get(username) || names.get(username) || username, preview: text(row.summary, 1024 * 1024), lastActivityUnixMs: milliseconds(row.lastTimestamp), sortTimestamp: milliseconds(row.sortTimestamp) }); }
      return { items, nextCursor: Buffer.from(page.nextCursor) };
    },
    async searchMessages(request) {
      const accountInfo = await requireAccount(request.accountId);
      const query = typeof request.query === 'string' ? request.query.trim() : '';
      if (!query || Buffer.byteLength(query, 'utf8') > 512 || query.includes('\0')) throw error('SEARCH_PAGE_QUERY_INVALID');
      const conversationId = requestName(request.conversationId, 'SEARCH_PAGE_OPTIONS_INVALID', true);
      const senderId = requestName(request.senderId, 'SEARCH_PAGE_OPTIONS_INVALID', true);
      const from = requestTime(request.fromUnixMs, 'SEARCH_PAGE_OPTIONS_INVALID', true), to = requestTime(request.toUnixMs, 'SEARCH_PAGE_OPTIONS_INVALID', true);
      if (from !== undefined && to !== undefined && from > to) throw error('SEARCH_PAGE_OPTIONS_INVALID');
      const limit = pageSize(request.page), cursor = readCursor(request.page?.cursor);
      const lower = from === undefined ? undefined : (from + 999n) / 1000n, upper = to === undefined ? undefined : to / 1000n;
      if (!accountInfo.capabilities.includes('messages.search')) throw error('CAPABILITY_UNAVAILABLE');
      if (lower !== undefined && upper !== undefined && lower > upper) {
        if (cursor) throw error('INVALID_CURSOR');
        return { items: [], nextCursor: Buffer.alloc(0), incomplete: false, unreadableMessages: 0n, unmappedTables: 0 };
      }
      const page = checkedPage(await callData('messages.search', { query, conversationId, senderId, limit, cursor, ascending: request.ascending, groupByConversation: request.groupByConversation,
        ...(lower !== undefined ? { afterTime: String(lower) } : {}), ...(upper !== undefined ? { beforeTime: String(upper) } : {}) }), limit);
      const coverage = page.coverage;
      if (!coverage || typeof coverage.complete !== 'boolean' || !Number.isInteger(coverage.unmappedTables) || coverage.unmappedTables < 0 || coverage.unmappedTables > 0xffffffff) throw error('SEARCH_COVERAGE_INVALID');
      const unreadableMessages = decimal(coverage.unreadableMessages);
      if (coverage.complete !== (unreadableMessages === 0n && coverage.unmappedTables === 0)) throw error('SEARCH_COVERAGE_INVALID');
      const seen = new Set();
      const items = page.items.map(row => {
        const message = messageFromRow(row, conversationId);
        if (message.kind === 'unsupported' || from !== undefined && message.sentAtUnixMs < from || to !== undefined && message.sentAtUnixMs > to || senderId && message.senderId !== senderId) throw error('BRIDGE_SEARCH_SCOPE_INVALID');
        const matchCount = request.groupByConversation ? safeCount(row.matchCount) : 1n;
        if (matchCount < 1n || request.groupByConversation && seen.has(message.conversationId)) throw error('BRIDGE_SEARCH_GROUP_INVALID');
        seen.add(message.conversationId);
        return { id: message.id, accountId, conversationId: message.conversationId, sentAtUnixMs: message.sentAtUnixMs, senderId: message.senderId, text: message.text, sourceType: message.sourceType, exactIdentity: true, matchCount };
      });
      return { items, nextCursor: Buffer.from(page.nextCursor), incomplete: !coverage.complete, unreadableMessages, unmappedTables: coverage.unmappedTables };
    },
    async locateMessage(request) {
      await requireAccount(request.accountId);
      const conversationId = requestName(request.conversationId, 'MESSAGE_LOCATE_REQUEST_INVALID');
      if (typeof request.serverId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(request.serverId) || BigInt(request.serverId) > (1n << 64n) - 1n) throw error('MESSAGE_LOCATE_REQUEST_INVALID');
      const result = await callData('messages.locate', { conversationId, serverId: request.serverId });
      if (!result || typeof result.beforeCursor !== 'string' || typeof result.afterCursor !== 'string') throw error('BRIDGE_LOCATE_RESPONSE_INVALID');
      const beforeCursor = Buffer.from(result.beforeCursor), afterCursor = Buffer.from(result.afterCursor);
      if (result.message === null || result.message === undefined) {
        if (beforeCursor.length || afterCursor.length) throw error('BRIDGE_LOCATE_RESPONSE_INVALID');
        return { beforeCursor, afterCursor };
      }
      if (!readCursor(beforeCursor) || !readCursor(afterCursor)) throw error('BRIDGE_LOCATE_RESPONSE_INVALID');
      const message = messageFromRow(result.message, conversationId);
      if (BigInt.asUintN(64, message.serverId) !== BigInt(request.serverId)) throw error('BRIDGE_LOCATE_RESPONSE_INVALID');
      return { message, beforeCursor, afterCursor };
    },
    async getConversationDayCounts(request) {
      await requireAccount(request.accountId);
      const conversationId = requestName(request.conversationId, 'DAY_COUNTS_REQUEST_INVALID');
      const from = requestTime(request.fromUnixMs, 'DAY_COUNTS_REQUEST_INVALID'), to = requestTime(request.toUnixMs, 'DAY_COUNTS_REQUEST_INVALID');
      const offset = request.utcOffsetMinutes;
      if (to <= from || !Number.isInteger(offset) || offset < -720 || offset > 840) throw error('DAY_COUNTS_REQUEST_INVALID');
      if (to - from > 62n * 86400000n) throw error('DAY_COUNTS_RANGE_TOO_LONG');
      const result = await callData('messages.dayCounts', { conversationId, fromUnixMs: String(from), toUnixMs: String(to), utcOffsetMinutes: offset });
      if (!result || !Array.isArray(result.days) || result.days.length > 63) throw error('BRIDGE_DAY_COUNTS_INVALID');
      let previous = localDay(from, offset) - 1n; const last = localDay(to - 1n, offset);
      const days = result.days.map(row => {
        const day = decimal(row.localDay, true), count = safeCount(row.count);
        if (day <= previous || day > last || count === 0n) throw error('BRIDGE_DAY_COUNTS_INVALID');
        previous = day; return { localDay: day, count };
      });
      return { days };
    },
    async getChatExportStats(request) {
      await requireAccount(request.accountId);
      const requested = request.conversationIds;
      if (!Array.isArray(requested) || !requested.length || requested.length > 100 || new Set(requested).size !== requested.length) throw error('CHAT_EXPORT_REQUEST_INVALID');
      for (const id of requested) requestName(id, 'CHAT_EXPORT_REQUEST_INVALID');
      const items = [];
      for (const conversationId of requested) {
        const result = await callData('messages.stats', { conversationId });
        if (!result || !Array.isArray(result.counts)) throw error('BRIDGE_STATS_INVALID');
        const total = safeCount(result.messageCount), categories = new Map(); let sum = 0n;
        for (const row of result.counts) {
          const category = statsCategory(row.localType), count = safeCount(row.count); sum += count;
          categories.set(category, (categories.get(category) || 0n) + count);
        }
        const first = total === 0n && result.firstTime === '' ? 0n : milliseconds(result.firstTime);
        const last = total === 0n && result.lastTime === '' ? 0n : milliseconds(result.lastTime);
        if (sum !== total || last < first || (total === 0n && (first !== 0n || last !== 0n))) throw error('BRIDGE_STATS_INVALID');
        items.push({ conversationId, total, firstMessageUnixMs: first, lastMessageUnixMs: last, counts: [...categories].map(([category, count]) => ({ category, count })) });
      }
      return { items, failedConversationIds: [] };
    },
    async getChatExportCapabilities() {
      return chatExportJobs.capabilities();
    },
    async startChatExport(request) {
      // Jobs are scoped to a verified account before any output directory is
      // created. The job module validates its own request shape, but it does
      // not have access to the engine's account/data source guard.
      await requireAccount(request.accountId);
      return chatExportJobs.start(request);
    },
    async startMomentExport(request) {
      await requireAccount(request.accountId);
      if (Array.isArray(request.mediaKinds) && request.mediaKinds.length) throw error('MOMENT_EXPORT_MEDIA_UNAVAILABLE');
      return momentExportJobs.start(request);
    },
    async startRecordExport(request) {
      await requireAccount(request.accountId);
      return recordExportJobs.start(request);
    },
    async listChatExports(request) {
      await requireAccount(request.accountId);
      return { jobs: [...chatExportJobs.list(request.accountId), ...momentExportJobs.list(request.accountId), ...recordExportJobs.list(request.accountId)] };
    },
    async watchChatExport(request) {
      try { return chatExportJobs.watch(request.jobId); }
      catch (failure) {
        if (failure?.message !== 'CHAT_EXPORT_JOB_NOT_FOUND') throw failure;
        try { return momentExportJobs.watch(request.jobId); }
        catch (momentFailure) { if (momentFailure?.message !== 'CHAT_EXPORT_JOB_NOT_FOUND') throw momentFailure; return recordExportJobs.watch(request.jobId); }
      }
    },
    async cancelChatExport(request) {
      try { return chatExportJobs.cancel(request.jobId); }
      catch (failure) {
        if (failure?.message !== 'CHAT_EXPORT_JOB_NOT_FOUND') throw failure;
        try { return momentExportJobs.cancel(request.jobId); }
        catch (momentFailure) { if (momentFailure?.message !== 'CHAT_EXPORT_JOB_NOT_FOUND') throw momentFailure; return recordExportJobs.cancel(request.jobId); }
      }
    },
    async getJob(request) {
      return genericJobs.getJob(request);
    },
    async watchJob(request) {
      return genericJobs.watchJob(request);
    },
    async cancelJob(request) {
      return genericJobs.cancelJob(request);
    },
    async listChatExportSchedules(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.listSchedules(request);
    },
    async getChatExportSchedule(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.getSchedule(request);
    },
    async saveChatExportSchedule(request) {
      await requireAccount(request.plan?.accountId);
      return chatExportSchedules.save(request);
    },
    async deleteChatExportSchedule(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.delete(request);
    },
    async runChatExportScheduleNow(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.runNow(request);
    },
    async listChatExportRuns(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.listRuns(request);
    },
    async getChatExportRun(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.getRun(request);
    },
    async listChatExportAttempts(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.listAttempts(request);
    },
    async getChatExportAttempt(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.getAttempt(request);
    },
    async retryChatExportAttempt(request) {
      await requireAccount(request.accountId);
      return chatExportSchedules.retry(request);
    },
    async listMessages(request) {
      const value = await requireAccount(request.accountId); const limit = pageSize(request.page);
      if (!request.conversationId || request.conversationId.length > 1024) throw error('CONVERSATION_ID_INVALID');
      const after = request.afterUnixMs, before = request.beforeUnixMs;
      if (after !== undefined && after < -1n || before !== undefined && (before < 0n || after !== undefined && before <= after)) throw error('MESSAGE_TIME_RANGE_INVALID');
      const lower = after === undefined || after === -1n ? 0n : after / 1000n + 1n;
      const upper = before === undefined ? undefined : before === 0n ? -1n : (before - 1n) / 1000n;
      const applied = { ...(after !== undefined ? { appliedAfterUnixMs: after } : {}), ...(before !== undefined ? { appliedBeforeUnixMs: before } : {}) };
      // Millisecond-exclusive filters can describe no whole-second timestamps.
      if (upper !== undefined && lower > upper) return { items: [], nextCursor: Buffer.alloc(0), ...applied };
      const page = checkedPage(await callData('messages.list', { limit, cursor: readCursor(request.page?.cursor), conversationId: request.conversationId, ascending: request.ascending === true, ...(after !== undefined ? { afterTime: String(lower) } : {}), ...(upper !== undefined ? { beforeTime: String(upper) } : {}) }), limit);
      const items = page.items.map(row => {
        const message = messageFromRow(row, request.conversationId);
        if (after !== undefined && message.sentAtUnixMs <= after || before !== undefined && message.sentAtUnixMs >= before) throw error('BRIDGE_MESSAGE_RANGE_INVALID');
        return message;
      });
      return { items, nextCursor: Buffer.from(page.nextCursor), ...applied };
    }
  };
  chatExportJobs = createChatExportJobs({ stateDir, runExport: request => handlers.exportConversation(request) });
  momentExportJobs = createMomentsExportJobs({ stateDir, runExport: request => handlers.exportMoments(request) });
  recordExportJobs = createRecordExportJobs({ runExport: exportRecordCategory });
  chatExportSchedules = createChatExportSchedules({
    stateDir,
    accountId,
    startExport: request => chatExportJobs.start(request),
    watchExport: jobId => chatExportJobs.watch(jobId)
  });
  aggregateAnalysisJobs = createAggregateAnalysisJobs({ runAnalysis: runAggregateAnalysis });
  genericJobs = createGenericJobs({ chatExportJobs, momentExportJobs, recordExportJobs });
  return {
    supportedMethods: Object.keys(SUPPORTED),
    async dispatch(request) {
      const requestId = request.requestId ?? 0n;
      try {
        if (typeof requestId !== 'bigint' || requestId <= 0n) throw error('REQUEST_ID_INVALID');
        const methods = ALL_METHODS.filter(name => request[name] !== undefined);
        if (methods.length !== 1) throw error('REQUEST_PAYLOAD_INVALID');
        const method = methods[0];
        if (!Object.hasOwn(handlers, method)) throw error('UNIMPLEMENTED');
        if (method !== 'hello' && !helloDone) throw error('HELLO_REQUIRED');
        const response = await handlers[method](request[method]);
        if (!['hello', 'getCapabilities', 'getApplicationLockStatus', 'unlockApplication', 'lockApplication', 'configureApplicationLock', 'watchDatabaseKeyAcquisition'].includes(method)) lock.assertAccess();
        return EngineServerFrame.fromPartial({ requestId, [method]: response });
      } catch (failure) {
        const code = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure.message ?? '') ? failure.message : 'INTERNAL_ERROR';
        return EngineServerFrame.fromPartial({ requestId, error: { code, category: code === 'UNIMPLEMENTED' ? 'independent.unsupported' : 'independent.backend', retryable: false, userMessageKey: code, diagnosticId: crypto.randomUUID() } });
      } finally {
        if (request.importDatabaseKey?.databaseKey instanceof Uint8Array) request.importDatabaseKey.databaseKey.fill(0);
        if (request.configureImageKey?.aesKey instanceof Uint8Array) request.configureImageKey.aesKey.fill(0);
        for (const payload of [request.unlockApplication, request.configureApplicationLock]) {
          if (payload?.password instanceof Uint8Array) payload.password.fill(0);
          if (payload?.newPassword instanceof Uint8Array) payload.newPassword.fill(0);
        }
      }
    },
    async probeMedia(accountId2) {
      const normalizedAccountId = typeof accountId2 === 'string' ? accountId2.trim() : '';
      if (!normalizedAccountId) throw error('ACCOUNT_ID_REQUIRED');
      const accountInfo = await requireAccount(normalizedAccountId);
      if (!accountInfo.capabilities?.includes('media.probe')) throw error('CAPABILITY_UNAVAILABLE');
      return mediaProbeResponse(await callData('media.probe', {}));
    },
    async cancelPending() { await cancelImport(); },
    async close() { await aggregateAnalysisJobs.close(); await chatExportSchedules.close(); await chatExportJobs.close(); await momentExportJobs.close(); closed = true; await cancelImport(); await dropBridge(); }
  };
}

async function runStdio(engine, input = process.stdin, output = process.stdout) {
  const decoder = new LengthDelimitedFrameDecoder();
  const write = async response => {
    let bytes = EngineServerFrame.encode(response).finish();
    if (bytes.byteLength > DEFAULT_MAX_FRAME_BYTES) bytes = EngineServerFrame.encode(EngineServerFrame.fromPartial({ requestId: response.requestId, error: { code: 'FRAME_TOO_LARGE', category: 'transport' } })).finish();
    await new Promise((resolve, reject) => output.write(encodeLengthDelimitedFrame(bytes), err => err ? reject(err) : resolve()));
  };
  let failed = false, writes = Promise.resolve(), serial = Promise.resolve(), transportFailure = null, ending = false;
  const inflight = new Set();
  function schedule(request) {
    let resolveWork; const work = new Promise(resolve => { resolveWork = resolve; });
    const isImport = request.importDatabaseKey !== undefined;
    const started = serial.then(() => {
      if (ending && isImport) {
        request.importDatabaseKey.databaseKey?.fill(0);
        resolveWork(EngineServerFrame.fromPartial({ requestId: request.requestId, error: { code: 'IMPORT_CANCELED', category: 'transport' } }));
      } else resolveWork(engine.dispatch(request));
    });
    serial = isImport ? started : work.then(() => {});
    const task = work.then(response => { writes = writes.then(() => write(response)); return writes; });
    inflight.add(task);
    task.then(() => inflight.delete(task), failure => { inflight.delete(task); transportFailure = failure; });
  }
  try {
    for await (const chunk of input) {
      for (const frame of decoder.push(chunk)) {
        if (transportFailure) throw transportFailure;
        if (inflight.size >= 32) await Promise.race(inflight);
        let request;
        try { request = EngineClientFrame.decode(frame); }
        catch {
          writes = writes.then(() => write(EngineServerFrame.fromPartial({ requestId: 0n, error: { code: 'INVALID_PROTOBUF', category: 'transport' } })));
          await writes; continue;
        }
        schedule(request);
      }
    }
    decoder.finish(); ending = true; await engine.cancelPending?.();
    await Promise.allSettled([...inflight]); await writes;
    if (transportFailure) throw transportFailure;
  } catch (failure) {
    failed = true; ending = true; await engine.cancelPending?.();
    await Promise.allSettled([...inflight]);
    const code = failure.code === 'TRUNCATED_FRAME' || failure.code === 'FRAME_TOO_LARGE' ? failure.code : 'TRANSPORT_FAILED';
    try { await writes; await write(EngineServerFrame.fromPartial({ requestId: 0n, error: { code, category: 'transport' } })); } catch {}
  } finally { await engine.close(); }

  return { failed };
}
module.exports = { createEngine, runStdio, SUPPORTED, ALL_METHODS };
