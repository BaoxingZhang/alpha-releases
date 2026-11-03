'use strict';

// Small, deterministic annual report builder for the independent read-only
// backend. It consumes normalized message DTOs, so it does not guess any
// SQLite schema or infer fields from opaque payloads.
const MAX_MESSAGES = 500000;
const MAX_MENTION_ITEMS = 200;
const MAX_FOOTPRINT_SESSIONS = 2000;

function localParts(unixMs, offsetMinutes) {
  const shifted = unixMs + BigInt(offsetMinutes) * 60000n;
  const value = Number(shifted);
  if (!Number.isSafeInteger(value)) throw new Error('ANALYSIS_TIME_INVALID');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('ANALYSIS_TIME_INVALID');
  return {
    date: date.toISOString().slice(0, 10),
    hour: date.getUTCHours(),
    weekday: date.getUTCDay()
  };
}

function category(message) {
  const sourceType = typeof message.sourceType === 'bigint' ? Number(message.sourceType & 0xffffffffn) : -1;
  if (message.display?.kind === 'file') return 'file';
  return ({ text: 'text', image: 'image', voice: 'voice', video: 'video', sticker: 'emoji', location: 'location', card: 'other', system: 'system' })[message.kind]
    || ({ 1: 'text', 3: 'image', 34: 'voice', 43: 'video', 47: 'emoji', 48: 'location', 10000: 'system', 10002: 'system' })[sourceType]
    || 'other';
}

function emptyHeatmap() { return Array.from({ length: 7 }, () => Array(24).fill(0)); }

/**
 * Build the legacy `annualReportFromWire$1` JSON shape used by Alpha 0.3.5.
 * The implementation intentionally reports only facts available from the
 * verified messages.list/session.list DTOs. NLP phrases, moments and reply
 * timing are left empty rather than guessed.
 */
async function buildAnnualReport({ listSessions, listMessages, year, utcOffsetMinutes = 0, isCanceled = () => false }) {
  if (!Number.isInteger(year) || year < 1970 || year > 9999) throw new Error('ANALYSIS_YEAR_INVALID');
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw new Error('ANALYSIS_OPTIONS_INVALID');
  const start = BigInt(Date.UTC(year, 0, 1)) - BigInt(utcOffsetMinutes) * 60000n;
  const end = BigInt(Date.UTC(year + 1, 0, 1)) - BigInt(utcOffsetMinutes) * 60000n;
  const sessions = [];
  let sessionCursor = '';
  do {
    const page = await listSessions({ limit: 500, cursor: sessionCursor });
    if (!page || !Array.isArray(page.items) || typeof page.nextCursor !== 'string') throw new Error('BRIDGE_PAGE_INVALID');
    sessions.push(...page.items);
    sessionCursor = page.nextCursor;
  } while (sessionCursor);

  const byConversation = new Map();
  const daily = new Map(), monthly = Array(12).fill(0), heatmap = emptyHeatmap();
  const media = { image: 0, voice: 0, video: 0, emoji: 0, file: 0, location: 0 };
  let scanned = 0, truncated = false, first = null;
  for (const session of sessions) {
    if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
    const conversationId = typeof session.username === 'string' ? session.username : '';
    if (!conversationId) continue;
    let cursor = '';
    do {
      if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
      if (scanned >= MAX_MESSAGES) { truncated = true; break; }
      const page = await listMessages({ conversationId, ascending: true, afterUnixMs: start > -1n ? start - 1n : undefined, beforeUnixMs: end, page: { pageSize: Math.min(500, MAX_MESSAGES - scanned), cursor: cursor ? Buffer.from(cursor) : new Uint8Array(0) } });
      if (!page || !Array.isArray(page.items) || !(page.nextCursor instanceof Uint8Array)) throw new Error('BRIDGE_PAGE_INVALID');
      for (const message of page.items) {
        if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
        if (scanned >= MAX_MESSAGES) { truncated = true; break; }
        // listMessages applies the millisecond bounds, but keep this check at
        // the aggregation boundary so alternate adapters cannot widen scope.
        if (message.sentAtUnixMs < start || message.sentAtUnixMs >= end) continue;
        scanned += 1;
        const parts = localParts(message.sentAtUnixMs, utcOffsetMinutes);
        const row = byConversation.get(conversationId) || { messages: 0, sent: 0, received: 0, kind: conversationId.endsWith('@chatroom') ? 2 : 1 };
        row.messages += 1;
        if (message.direction === 2) row.sent += 1;
        else if (message.direction === 1) row.received += 1;
        byConversation.set(conversationId, row);
        daily.set(parts.date, (daily.get(parts.date) || 0) + 1);
        monthly[Number(parts.date.slice(5, 7)) - 1] += 1;
        heatmap[parts.weekday][parts.hour] += 1;
        const kind = category(message); if (Object.hasOwn(media, kind)) media[kind] += 1;
        if (!first || message.sentAtUnixMs < first.sentAtUnixMs) first = message;
      }
      cursor = page.nextCursor.length ? new TextDecoder('utf-8', { fatal: true }).decode(page.nextCursor) : '';
    } while (cursor && !truncated);
    if (truncated) break;
  }
  const top = [...byConversation.entries()].sort((a, b) => b[1].messages - a[1].messages || a[0].localeCompare(b[0])).slice(0, 10)
    .map(([conversationId, row]) => ({ conversation_id: conversationId, display_name: conversationId, kind: row.kind, messages: row.messages, sent: row.sent, received: row.received }));
  const busiest = [...daily.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const messageRef = message => message ? { sent_at_unix_ms: Number(message.sentAtUnixMs), conversation_id: message.conversationId, display_name: message.conversationId } : null;
  const report = {
    year, utc_offset_minutes: utcOffsetMinutes, scanned_messages: scanned, truncated,
    total_messages: scanned,
    sent_messages: [...byConversation.values()].reduce((sum, row) => sum + row.sent, 0),
    received_messages: [...byConversation.values()].reduce((sum, row) => sum + row.received, 0),
    active_days: daily.size, active_conversations: byConversation.size,
    top_conversations: top,
    weekday_hour_counts: heatmap,
    daily_counts: Object.fromEntries([...daily.entries()].sort(([a], [b]) => a.localeCompare(b))),
    monthly_counts: monthly,
    top_terms: [],
    media,
    ...(busiest ? { busiest_day: { date: busiest[0], messages: busiest[1] } } : {}),
    ...(first ? { first_message: messageRef(first) } : {})
  };
  return { report, scannedMessages: scanned, truncated };
}

const RELATIONSHIP_MEDIA_KEYS = ['image', 'voice', 'video', 'emoji', 'file', 'location'];
const RELATIONSHIP_TYPE_KEYS = ['text', 'image', 'voice', 'video', 'emoji', 'file', 'location', 'system', 'other'];

function sideOf(message) {
  return message?.direction === 2 ? 'mine' : message?.direction === 1 ? 'peer' : 'unknown';
}

function emptyCounts(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function messageRef(message) {
  if (!message) return null;
  const value = Number(message.sentAtUnixMs);
  if (!Number.isSafeInteger(value)) throw new Error('ANALYSIS_TIME_INVALID');
  return {
    ...(typeof message.id === 'string' && message.id ? { id: message.id } : {}),
    sent_at_unix_ms: value,
    conversation_id: typeof message.conversationId === 'string' ? message.conversationId : '',
    sender_id: typeof message.senderId === 'string' ? message.senderId : '',
    direction: Number.isInteger(message.direction) ? message.direction : 0,
    kind: typeof message.kind === 'string' ? message.kind : 'unknown'
  };
}

function localDateNumber(date) {
  const value = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isNaN(value) ? null : value;
}

/**
 * Build the relationship-report JSON consumed by Alpha's renderer. This is a
 * deliberately bounded adapter over the verified messages.list DTO. It does
 * not read SQLite tables directly or invent NLP, moments, or reply semantics.
 */
async function buildConversationReport({ listMessages, conversationId, maxMessages = 50000, utcOffsetMinutes = 0, fromUnixMs, toUnixMs, isCanceled = () => false }) {
  if (typeof conversationId !== 'string' || !conversationId || conversationId.length > 1024) throw new Error('CONVERSATION_ID_INVALID');
  if (!Number.isInteger(maxMessages) || maxMessages < 1 || maxMessages > MAX_MESSAGES) throw new Error('ANALYSIS_MAX_MESSAGES_INVALID');
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw new Error('ANALYSIS_OPTIONS_INVALID');
  if (fromUnixMs !== undefined && (typeof fromUnixMs !== 'bigint' || fromUnixMs < 0n)) throw new Error('ANALYSIS_OPTIONS_INVALID');
  if (toUnixMs !== undefined && (typeof toUnixMs !== 'bigint' || toUnixMs < 0n || fromUnixMs !== undefined && toUnixMs <= fromUnixMs)) throw new Error('ANALYSIS_OPTIONS_INVALID');
  if (typeof listMessages !== 'function') throw new Error('ANALYSIS_HANDLER_INVALID');

  const activeHours = Array(24).fill(0);
  const sideHours = { mine: Array(24).fill(0), peer: Array(24).fill(0), unknown: Array(24).fill(0) };
  const media = emptyCounts(RELATIONSHIP_MEDIA_KEYS);
  const sideMedia = { mine: emptyCounts(RELATIONSHIP_MEDIA_KEYS), peer: emptyCounts(RELATIONSHIP_MEDIA_KEYS), unknown: emptyCounts(RELATIONSHIP_MEDIA_KEYS) };
  const messageTypes = emptyCounts(RELATIONSHIP_TYPE_KEYS);
  const monthlyCounts = {};
  const dailyCounts = {};
  const dailyDirections = {};
  const activeDates = new Set();
  const dates = [];
  let first = null, last = null, previous = null;
  let scanned = 0;
  let truncated = false;
  const initiative = { mine: 0, peer: 0, unknown: 0 };
  const sessionStarters = { mine: 0, peer: 0, unknown: 0 };
  let cursor = new Uint8Array(0);
  const seenCursors = new Set();

  for (;;) {
    if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
    const page = await listMessages({
      conversationId,
      ascending: true,
      ...(fromUnixMs === undefined ? {} : { afterUnixMs: fromUnixMs - 1n }),
      ...(toUnixMs === undefined ? {} : { beforeUnixMs: toUnixMs }),
      page: { pageSize: Math.min(500, maxMessages - scanned), cursor }
    });
    if (!page || !Array.isArray(page.items) || !(page.nextCursor instanceof Uint8Array)) throw new Error('BRIDGE_PAGE_INVALID');
    let items = page.items;
    if (items.length > maxMessages - scanned) {
      // A bridge must respect pageSize; process only the requested bound and
      // mark the result truncated if it returned more rows than requested.
      items = items.slice(0, maxMessages - scanned);
      truncated = true;
    }
    for (const message of items) {
      if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
      if (!message || typeof message.sentAtUnixMs !== 'bigint') throw new Error('BRIDGE_MESSAGE_INVALID');
      if (typeof message.conversationId !== 'string' || message.conversationId !== conversationId) throw new Error('BRIDGE_MESSAGE_SCOPE_INVALID');
      if (fromUnixMs !== undefined && message.sentAtUnixMs < fromUnixMs || toUnixMs !== undefined && message.sentAtUnixMs >= toUnixMs) continue;
      if (scanned >= maxMessages) { truncated = true; break; }
      const parts = localParts(message.sentAtUnixMs, utcOffsetMinutes);
      const side = sideOf(message);
      const kind = category(message);
      const date = parts.date;
      scanned += 1;
      activeDates.add(date); dates.push(date);
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
      const dailyDirection = dailyDirections[date] || { sent: 0, received: 0, unknown: 0 };
      if (side === 'mine') dailyDirection.sent += 1;
      else if (side === 'peer') dailyDirection.received += 1;
      else dailyDirection.unknown += 1;
      dailyDirections[date] = dailyDirection;
      activeHours[parts.hour] += 1;
      sideHours[side][parts.hour] += 1;
      initiative[side] += 1;
      if (Object.hasOwn(messageTypes, kind)) messageTypes[kind] += 1;
      else messageTypes.other += 1;
      if (Object.hasOwn(media, kind)) { media[kind] += 1; sideMedia[side][kind] += 1; }
      const month = date.slice(0, 7); monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
      if (!first || message.sentAtUnixMs < first.sentAtUnixMs) first = message;
      if (!last || message.sentAtUnixMs > last.sentAtUnixMs) last = message;
      if (!previous || message.sentAtUnixMs - previous.sentAtUnixMs > 30n * 60n * 1000n) sessionStarters[side] += 1;
      previous = message;
    }
    if (truncated || scanned >= maxMessages) {
      if (!truncated && page.nextCursor.length > 0) truncated = true;
      break;
    }
    if (page.nextCursor.length === 0) break;
    const cursorKey = Buffer.from(page.nextCursor).toString('base64url');
    if (seenCursors.has(cursorKey)) throw new Error('BRIDGE_CURSOR_STALLED');
    seenCursors.add(cursorKey);
    cursor = page.nextCursor;
  }

  dates.sort();
  let longestDailyStreak = 0, streak = 0, previousDate = null;
  for (const date of [...new Set(dates)]) {
    const current = localDateNumber(date);
    if (current === null) continue;
    if (previousDate !== null && current - previousDate === 86400000) streak += 1;
    else streak = 1;
    longestDailyStreak = Math.max(longestDailyStreak, streak);
    previousDate = current;
  }
  const firstSide = sideOf(first);
  const report = {
    algorithm_version: 'alpha-independent-conversation-v1',
    scanned_messages: scanned,
    total_messages: scanned,
    sent_messages: initiative.mine,
    received_messages: initiative.peer,
    unknown_messages: initiative.unknown,
    truncated,
    journey: { truncated, moments: [] },
    first_opener: first ? firstSide : null,
    active_days: activeDates.size,
    longest_daily_streak: longestDailyStreak,
    total_words: null,
    initiative,
    session_starters: sessionStarters,
    response: { mine_average_ms: null, peer_average_ms: null, fastest_ms: null, mine_count: null, peer_count: null },
    media,
    message_types: messageTypes,
    active_hours: activeHours,
    mine_active_hours: sideHours.mine,
    peer_active_hours: sideHours.peer,
    unknown_active_hours: sideHours.unknown,
    mine_media: sideMedia.mine,
    peer_media: sideMedia.peer,
    unknown_media: sideMedia.unknown,
    monthly_counts: Object.fromEntries(Object.entries(monthlyCounts).sort(([a], [b]) => a.localeCompare(b))),
    daily_counts: dailyCounts,
    daily_directions: Object.fromEntries(Object.entries(dailyDirections).sort(([a], [b]) => a.localeCompare(b))),
    top_terms: [],
    shared_terms: [],
    mine_exclusive_terms: [],
    peer_exclusive_terms: [],
    ...(first ? { first_message: messageRef(first) } : {}),
    ...(last ? { last_message: messageRef(last) } : {})
  };
  return { report, itemCount: scanned, scannedMessages: scanned, truncated };
}

function rangeBounds(fromUnixMs, toUnixMs) {
  if (fromUnixMs !== undefined && (typeof fromUnixMs !== 'bigint' || fromUnixMs < 0n)) throw new Error('ANALYSIS_OPTIONS_INVALID');
  if (toUnixMs !== undefined && (typeof toUnixMs !== 'bigint' || toUnixMs < 0n || fromUnixMs !== undefined && toUnixMs <= fromUnixMs)) throw new Error('ANALYSIS_OPTIONS_INVALID');
  return { fromUnixMs, toUnixMs };
}

function reportMilliseconds(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('ANALYSIS_TIME_INVALID');
  return number;
}

function reportServerId(message) {
  if (typeof message?.serverId !== 'bigint' || message.serverId === 0n) return null;
  const value = message.serverId.toString();
  return /^-?\d{1,20}$/.test(value) ? value : null;
}

function reportAnchorId(message) {
  const value = typeof message?.rawLocalId === 'string' ? message.rawLocalId : Number.isSafeInteger(message?.localId) ? String(message.localId) : '';
  if (!/^-?\d{1,20}$/.test(value)) throw new Error('BRIDGE_MESSAGE_ID_INVALID');
  return value;
}

function messageSide(message) {
  return message?.direction === 2 ? 'mine' : message?.direction === 1 ? 'peer' : 'unknown';
}

function addDirection(target, side) {
  if (side === 'mine') target.sent += 1;
  else if (side === 'peer') target.received += 1;
  else target.unknown += 1;
}

function delaySummary(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return { count: values.length, average_ms: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length), fastest_ms: sorted[0], slowest_ms: sorted[sorted.length - 1] };
}

function localDateAndHour(unixMs, offsetMinutes) {
  return localParts(BigInt(unixMs), offsetMinutes);
}

function explicitMentionKind(text, selfUsername) {
  if (typeof text !== 'string' || !text || text.length > 4 * 1024 * 1024) return null;
  // We only recognize markers present in the independently decoded text. A
  // display name, XML atuserlist, or arbitrary "@我" text is intentionally not
  // treated as a mention because it cannot identify the target safely.
  if (/(?:^|\s)@(所有人|all)(?=\s|$|[，。,.!?！？:：;；])/iu.test(text)) return 'all';
  if (typeof selfUsername === 'string' && selfUsername && selfUsername.length <= 256) {
    const escaped = selfUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?:^|\\s)@${escaped}(?=\\s|$|[，。,.!?！？:：;；])`, 'u').test(text)) return 'self';
  }
  return null;
}

async function collectMessages({ listSessions, listMessages, fromUnixMs, toUnixMs, excludedConversationIds = [], isCanceled = () => false, onConversation }) {
  if (typeof listSessions !== 'function' || typeof listMessages !== 'function') throw new Error('ANALYSIS_HANDLER_INVALID');
  const { fromUnixMs: from, toUnixMs: to } = rangeBounds(fromUnixMs, toUnixMs);
  const sessions = [];
  let sessionCursor = '';
  do {
    if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
    const page = await listSessions({ limit: 500, cursor: sessionCursor });
    if (!page || !Array.isArray(page.items) || typeof page.nextCursor !== 'string') throw new Error('BRIDGE_PAGE_INVALID');
    sessions.push(...page.items);
    if (sessions.length > 10000) throw new Error('ANALYSIS_SCOPE_TOO_LARGE');
    sessionCursor = page.nextCursor;
  } while (sessionCursor);

  let scanned = 0;
  let selectedCount = 0;
  let selectedGroupCount = 0;
  let selectedPrivateCount = 0;
  let truncated = false;
  for (const session of sessions) {
    if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
    const conversationId = typeof session?.username === 'string' ? session.username : '';
    if (!conversationId || excludedConversationIds.includes(conversationId)) continue;
    selectedCount += 1;
    if (conversationId.endsWith('@chatroom')) selectedGroupCount += 1;
    else selectedPrivateCount += 1;
    const messages = [];
    let cursor = new Uint8Array(0);
    const seenCursors = new Set();
    for (;;) {
      if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
      if (scanned >= MAX_MESSAGES) { truncated = true; break; }
      const page = await listMessages({ conversationId, ascending: true, ...(from === undefined ? {} : { afterUnixMs: from - 1n }), ...(to === undefined ? {} : { beforeUnixMs: to }), page: { pageSize: Math.min(500, MAX_MESSAGES - scanned), cursor } });
      if (!page || !Array.isArray(page.items) || !(page.nextCursor instanceof Uint8Array)) throw new Error('BRIDGE_PAGE_INVALID');
      for (const message of page.items) {
        if (isCanceled()) throw new Error('ANALYSIS_CANCELED');
        if (!message || typeof message.sentAtUnixMs !== 'bigint' || message.conversationId !== conversationId) throw new Error('BRIDGE_MESSAGE_SCOPE_INVALID');
        if (from !== undefined && message.sentAtUnixMs < from || to !== undefined && message.sentAtUnixMs >= to) continue;
        if (scanned >= MAX_MESSAGES) { truncated = true; break; }
        scanned += 1;
        messages.push(message);
      }
      if (truncated || page.nextCursor.length === 0) break;
      const key = Buffer.from(page.nextCursor).toString('base64url');
      if (seenCursors.has(key)) throw new Error('BRIDGE_CURSOR_STALLED');
      seenCursors.add(key); cursor = page.nextCursor;
    }
    if (messages.length && typeof onConversation === 'function') await onConversation({ conversationId, displayName: typeof session.displayName === 'string' && session.displayName ? session.displayName : conversationId, messages });
    if (truncated) break;
  }
  return { scanned, truncated, sessionCount: sessions.length, selectedCount, selectedGroupCount, selectedPrivateCount };
}

function mentionReportMeta(report) {
  return { ...report, complete: false, native_schema_supported: false, provenance: 'alpha-independent-verified-message-text', mention_detection: 'explicit-text-token-v1' };
}

async function buildMentionReport({ listSessions, listMessages, selfUsername = '', fromUnixMs, toUnixMs, excludedConversationIds = [], utcOffsetMinutes = 0, isCanceled = () => false }) {
  const { fromUnixMs: from, toUnixMs: to } = rangeBounds(fromUnixMs, toUnixMs);
  if (excludedConversationIds.length) throw new Error('ANALYSIS_OPTIONS_INVALID');
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw new Error('ANALYSIS_OPTIONS_INVALID');
  const groups = new Map(), items = [];
  let conversationsAnalyzed = 0;
  const result = await collectMessages({ listSessions, listMessages, fromUnixMs: from, toUnixMs: to, isCanceled, onConversation: async ({ conversationId, displayName, messages }) => {
    if (!conversationId.endsWith('@chatroom')) return;
    conversationsAnalyzed += 1;
    for (const message of messages) {
      if (messageSide(message) !== 'peer') continue;
      const kind = explicitMentionKind(message.text, selfUsername);
      if (!kind) continue;
      const row = groups.get(conversationId) || { conversation_id: conversationId, display_name: displayName, mentions: 0, mentions_all: 0, latest_unix_ms: 0 };
      if (kind === 'all') row.mentions_all += 1;
      else row.mentions += 1;
      row.latest_unix_ms = Math.max(row.latest_unix_ms, reportMilliseconds(message.sentAtUnixMs));
      groups.set(conversationId, row);
      if (items.length < MAX_MENTION_ITEMS) items.push({ conversation_id: conversationId, message_id: reportAnchorId(message), sent_at_unix_ms: reportMilliseconds(message.sentAtUnixMs), sender_id: typeof message.senderId === 'string' ? message.senderId : '', is_all: kind === 'all' });
    }
  } });
  items.sort((a, b) => b.sent_at_unix_ms - a.sent_at_unix_ms || a.message_id.localeCompare(b.message_id));
  const groupRows = [...groups.values()].sort((a, b) => b.latest_unix_ms - a.latest_unix_ms || a.conversation_id.localeCompare(b.conversation_id));
  const mentionTotal = groupRows.reduce((sum, row) => sum + row.mentions, 0), mentionAllTotal = groupRows.reduce((sum, row) => sum + row.mentions_all, 0);
  return mentionReportMeta({ algorithm_version: 'alpha-mentions-v1', utc_offset_minutes: utcOffsetMinutes, from_unix_ms: from === undefined ? null : reportMilliseconds(from), to_unix_ms: to === undefined ? null : reportMilliseconds(to), conversations_analyzed: result.selectedGroupCount, conversations_with_mentions: groupRows.length, conversations_failed: 0, truncated: false, independent_truncated: result.truncated, mention_total: mentionTotal, mention_all_total: mentionAllTotal, groups: groupRows, items, items_truncated: mentionTotal + mentionAllTotal > items.length });
}

function footprintSessionFromMessages(conversationId, messages) {
  if (!messages.length) return [];
  const output = [];
  let current = null;
  for (const message of messages) {
    const sentAtUnixMs = reportMilliseconds(message.sentAtUnixMs);
    const side = messageSide(message);
    if (!current || sentAtUnixMs - current.end_unix_ms > 30 * 60 * 1000) {
      current = { conversation_id: conversationId, start_unix_ms: sentAtUnixMs, end_unix_ms: sentAtUnixMs, received: 0, sent: 0, unknown: 0, first_received_unix_ms: null, first_reply_unix_ms: null, opener: side, anchor_message_id: reportAnchorId(message), anchor_server_id: reportServerId(message) };
      output.push(current);
    }
    current.end_unix_ms = sentAtUnixMs;
    if (side === 'mine') current.sent += 1;
    else if (side === 'peer') { current.received += 1; if (current.first_received_unix_ms === null) current.first_received_unix_ms = sentAtUnixMs; }
    else current.unknown += 1;
    if (current.first_received_unix_ms !== null && current.first_reply_unix_ms === null && side === 'mine' && sentAtUnixMs >= current.first_received_unix_ms) current.first_reply_unix_ms = sentAtUnixMs;
  }
  return output;
}

async function buildFootprintReport({ listSessions, listMessages, selfUsername = '', fromUnixMs, toUnixMs, excludedConversationIds = [], utcOffsetMinutes = 0, isCanceled = () => false }) {
  const { fromUnixMs: from, toUnixMs: to } = rangeBounds(fromUnixMs, toUnixMs);
  if (!Number.isInteger(utcOffsetMinutes) || utcOffsetMinutes < -720 || utcOffsetMinutes > 840) throw new Error('ANALYSIS_OPTIONS_INVALID');
  const privatePeople = new Map(), sessions = [], daily = new Map(), hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, sent: 0, received: 0, unknown: 0 }));
  const myReplies = [], peerReplies = [], mentionGroups = new Map(), mentionItems = [];
  let conversationsAnalyzed = 0, groupConversationsAnalyzed = 0;
  const result = await collectMessages({ listSessions, listMessages, fromUnixMs: from, toUnixMs: to, excludedConversationIds, isCanceled, onConversation: async ({ conversationId, displayName, messages }) => {
    conversationsAnalyzed += 1;
    if (conversationId.endsWith('@chatroom')) groupConversationsAnalyzed += 1;
    for (const message of messages) {
      const kind = explicitMentionKind(message.text, selfUsername);
      if (conversationId.endsWith('@chatroom')) {
        if (kind && messageSide(message) === 'peer') {
          const row = mentionGroups.get(conversationId) || { conversation_id: conversationId, display_name: displayName, mentions: 0, mentions_all: 0, latest_unix_ms: 0 };
          if (kind === 'all') row.mentions_all += 1; else row.mentions += 1;
          row.latest_unix_ms = Math.max(row.latest_unix_ms, reportMilliseconds(message.sentAtUnixMs)); mentionGroups.set(conversationId, row);
          if (mentionItems.length < MAX_MENTION_ITEMS) mentionItems.push({ conversation_id: conversationId, message_id: reportAnchorId(message), server_id: reportServerId(message), sent_at_unix_ms: reportMilliseconds(message.sentAtUnixMs), sender_id: typeof message.senderId === 'string' ? message.senderId : '', is_all: kind === 'all' });
        }
        continue;
      }
      const parts = localDateAndHour(message.sentAtUnixMs, utcOffsetMinutes), date = parts.date, side = messageSide(message);
      const day = daily.get(date) || { date, sent: 0, received: 0, unknown: 0 }; addDirection(day, side); daily.set(date, day); addDirection(hourly[parts.hour], side);
    }
    if (!conversationId.endsWith('@chatroom')) {
      const privateSessions = footprintSessionFromMessages(conversationId, messages);
      const person = privatePeople.get(conversationId) || { conversation_id: conversationId, display_name: displayName, sent: 0, received: 0, unknown: 0, first_unix_ms: 0, last_unix_ms: 0, active_days: new Set(), sessions: 0, replied_sessions: 0, opened_mine: 0, opened_peer: 0, my_reply_values: [], peer_reply_values: [] };
      for (const message of messages) { const side = messageSide(message); if (side === 'mine') person.sent += 1; else if (side === 'peer') person.received += 1; else person.unknown += 1; const stamp = reportMilliseconds(message.sentAtUnixMs); person.first_unix_ms = person.first_unix_ms === 0 ? stamp : Math.min(person.first_unix_ms, stamp); person.last_unix_ms = Math.max(person.last_unix_ms, stamp); person.active_days.add(localDateAndHour(message.sentAtUnixMs, utcOffsetMinutes).date); }
      person.sessions += privateSessions.length;
      for (const session of privateSessions) {
        if (session.opener === 'mine') person.opened_mine += 1; else if (session.opener === 'peer') person.opened_peer += 1;
        if (session.received > 0 && session.sent > 0) person.replied_sessions += 1;
        if (session.opener === 'mine' && session.first_received_unix_ms !== null) { const value = session.first_received_unix_ms - session.start_unix_ms; person.peer_reply_values.push(value); peerReplies.push(value); }
        if (session.opener === 'peer' && session.first_received_unix_ms !== null && session.first_reply_unix_ms !== null) { const value = session.first_reply_unix_ms - session.first_received_unix_ms; person.my_reply_values.push(value); myReplies.push(value); }
      }
      sessions.push(...privateSessions);
      privatePeople.set(conversationId, person);
    }
  } });
  sessions.sort((a, b) => b.start_unix_ms - a.start_unix_ms || a.conversation_id.localeCompare(b.conversation_id));
  const sessionsTruncated = sessions.length > MAX_FOOTPRINT_SESSIONS;
  const limitedSessions = sessions.slice(0, MAX_FOOTPRINT_SESSIONS);
  const allPeople = [...privatePeople.values()].map(person => ({ conversation_id: person.conversation_id, display_name: person.display_name, sent: person.sent, received: person.received, unknown: person.unknown, first_unix_ms: person.first_unix_ms, last_unix_ms: person.last_unix_ms, active_days: person.active_days.size, sessions: person.sessions, replied_sessions: person.replied_sessions, opened_mine: person.opened_mine, opened_peer: person.opened_peer, my_reply: delaySummary(person.my_reply_values), peer_reply: delaySummary(person.peer_reply_values) })).sort((a, b) => b.last_unix_ms - a.last_unix_ms || a.conversation_id.localeCompare(b.conversation_id));
  const people = allPeople.slice(0, 20000);
  mentionItems.sort((a, b) => b.sent_at_unix_ms - a.sent_at_unix_ms || a.message_id.localeCompare(b.message_id));
  const mentionRows = [...mentionGroups.values()].sort((a, b) => b.latest_unix_ms - a.latest_unix_ms || a.conversation_id.localeCompare(b.conversation_id));
  const mentionTotal = mentionRows.reduce((sum, row) => sum + row.mentions, 0), mentionAllTotal = mentionRows.reduce((sum, row) => sum + row.mentions_all, 0);
  return mentionReportMeta({ algorithm_version: 'alpha-footprint-v1', utc_offset_minutes: utcOffsetMinutes, from_unix_ms: from === undefined ? null : reportMilliseconds(from), to_unix_ms: to === undefined ? null : reportMilliseconds(to), truncated: false, independent_truncated: result.truncated, private: { conversations_analyzed: result.selectedPrivateCount, conversations_failed: 0, conversations_excluded: excludedConversationIds.length, inbound_people: allPeople.filter(person => person.received > 0).length, replied_people: allPeople.filter(person => person.received > 0 && person.sent > 0).length, outbound_people: allPeople.filter(person => person.sent > 0).length, sent_messages: allPeople.reduce((sum, person) => sum + person.sent, 0), received_messages: allPeople.reduce((sum, person) => sum + person.received, 0), unknown_messages: allPeople.reduce((sum, person) => sum + person.unknown, 0), sessions: sessions.length, replied_sessions: sessions.filter(session => session.received > 0 && session.sent > 0).length, opened_mine: sessions.filter(session => session.opener === 'mine').length, opened_peer: sessions.filter(session => session.opener === 'peer').length, opened_unknown: sessions.filter(session => session.opener === 'unknown').length, my_reply: delaySummary(myReplies), peer_reply: delaySummary(peerReplies), people, hourly, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)) }, sessions: limitedSessions, sessions_truncated: sessionsTruncated, mentions: { conversations_analyzed: result.selectedGroupCount, conversations_with_mentions: mentionRows.length, conversations_failed: 0, mention_total: mentionTotal, mention_all_total: mentionAllTotal, groups: mentionRows.slice(0, 20000), items: mentionItems, items_truncated: mentionTotal + mentionAllTotal > mentionItems.length } });
}

module.exports = { buildAnnualReport, buildConversationReport, buildMentionReport, buildFootprintReport, MAX_MESSAGES };
