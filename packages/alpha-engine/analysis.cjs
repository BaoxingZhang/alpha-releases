'use strict';

// Small, deterministic annual report builder for the independent read-only
// backend. It consumes normalized message DTOs, so it does not guess any
// SQLite schema or infer fields from opaque payloads.
const MAX_MESSAGES = 500000;

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

module.exports = { buildAnnualReport, buildConversationReport, MAX_MESSAGES };
