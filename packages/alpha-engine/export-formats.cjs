'use strict';

// These formats are derived from the independent engine's verified message
// DTO.  They intentionally carry an explicit compatibility marker: the
// original Alpha/native formatters and their attachment manifests were not
// recovered, so these files must not be presented as byte-compatible exports.

const CHAT_DERIVED_FORMATS = new Set(['chatlab-json', 'chatlab-jsonl', 'sql', 'weclone']);
const CHAT_FORMAT_EXTENSIONS = Object.freeze({
  'chatlab-json': '.json',
  'chatlab-jsonl': '.jsonl',
  sql: '.sql',
  weclone: '.csv'
});

function jsonSafe(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

function derivedMessage(item) {
  return {
    id: item.id,
    accountId: item.accountId,
    conversationId: item.conversationId,
    localId: item.localId,
    serverId: item.serverId,
    localType: item.localType,
    sentAtUnixMs: item.sentAtUnixMs,
    sentAt: item.sentAt,
    senderId: item.senderId,
    direction: item.direction,
    kind: item.kind,
    text: item.text,
    contentDecodeStatus: item.contentDecodeStatus,
    refs: item.refs || [],
    ...(item.display ? { display: item.display } : {})
  };
}

function chatlabJson(meta, items) {
  return `${jsonSafe({
    version: 1,
    format: 'chatlab-json-derived',
    compatibility: 'alpha-independent-message-v1',
    accountId: meta.accountId,
    conversationId: meta.conversationId,
    itemCount: items.length,
    messages: items.map(derivedMessage)
  })}\n`;
}

function chatlabJsonl(meta, items) {
  const lines = [jsonSafe({
    format: 'chatlab-jsonl-derived',
    compatibility: 'alpha-independent-message-v1',
    recordType: 'meta',
    accountId: meta.accountId,
    conversationId: meta.conversationId,
    itemCount: items.length
  })];
  lines.push(...items.map(item => jsonSafe({
    format: 'chatlab-jsonl-derived',
    compatibility: 'alpha-independent-message-v1',
    recordType: 'message',
    ...derivedMessage(item)
  })));
  return `${lines.join('\n')}\n`;
}

function sqlQuote(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function conversationSql(meta, items) {
  const lines = [
    '-- Alpha independent derived export; no native Alpha/ChatLab compatibility is claimed.',
    '-- Compatibility marker: alpha-independent-message-v1',
    'BEGIN TRANSACTION;',
    'CREATE TABLE IF NOT EXISTS alpha_messages (id TEXT NOT NULL, account_id TEXT NOT NULL, conversation_id TEXT NOT NULL, local_id TEXT NOT NULL, server_id TEXT NOT NULL, local_type TEXT NOT NULL, sent_at_unix_ms TEXT NOT NULL, sent_at TEXT NOT NULL, sender_id TEXT NOT NULL, direction INTEGER NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL, content_decode_status TEXT NOT NULL, refs_json TEXT NOT NULL, display_json TEXT, PRIMARY KEY (id));'
  ];
  for (const item of items) {
    const message = derivedMessage(item);
    lines.push(`INSERT INTO alpha_messages (id, account_id, conversation_id, local_id, server_id, local_type, sent_at_unix_ms, sent_at, sender_id, direction, kind, text, content_decode_status, refs_json, display_json) VALUES (${[
      message.id, message.accountId, message.conversationId, message.localId, message.serverId, message.localType,
      message.sentAtUnixMs, message.sentAt, message.senderId, message.direction, message.kind, message.text,
      message.contentDecodeStatus, jsonSafe(message.refs), message.display ? jsonSafe(message.display) : null
    ].map(sqlQuote).join(', ')});`);
  }
  lines.push('COMMIT;', '');
  return lines.join('\n');
}

function csvCell(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function wecloneCsv(_meta, items) {
  const headers = ['conversation_id', 'message_id', 'sender_id', 'role', 'sent_at_unix_ms', 'sent_at', 'kind', 'content', 'content_decode_status', 'export_format', 'compatibility'];
  const rows = items.map(item => [
    item.conversationId, item.id, item.senderId, item.direction === 2 ? 'assistant' : item.direction === 1 ? 'user' : 'unknown',
    item.sentAtUnixMs, item.sentAt, item.kind, item.text, item.contentDecodeStatus, 'weclone-derived', 'alpha-independent-message-v1'
  ]);
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

function derivedConversationOutput(format, meta, items) {
  if (format === 'chatlab-json') return chatlabJson(meta, items);
  if (format === 'chatlab-jsonl') return chatlabJsonl(meta, items);
  if (format === 'sql') return conversationSql(meta, items);
  if (format === 'weclone') return wecloneCsv(meta, items);
  throw new Error('EXPORT_FORMAT_UNSUPPORTED');
}

module.exports = { CHAT_DERIVED_FORMATS, CHAT_FORMAT_EXTENSIONS, derivedConversationOutput };
