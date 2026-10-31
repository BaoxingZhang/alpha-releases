'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const snapshot = require('./snapshot-store.cjs');
const { runImporter } = require('./importer-client.cjs');
const zlib = require('node:zlib');
const protocol = require('../alpha-protocol/index.cjs');
const { BridgeClient } = require('./bridge-client.cjs');
const { EngineClientFrame, EngineServerFrame, LengthDelimitedFrameDecoder, encodeLengthDelimitedFrame, DEFAULT_MAX_FRAME_BYTES } = protocol;
const ALL_METHODS = Object.keys(EngineClientFrame.fromPartial({})).filter(name => name !== 'requestId');
// Values are EngineClientFrame field numbers, not RPC ordinal positions.
const SUPPORTED = Object.freeze({ hello: 10, getCapabilities: 11, listAccounts: 12, selectAccount: 13, listConversations: 14, listMessages: 15, searchMessages: 17, getChatExportStats: 120, locateMessage: 126, getConversationDayCounts: 127, discoverAccounts: 29, importDatabaseKey: 30, listContacts: 42, getApplicationLockStatus: 48, unlockApplication: 50, lockApplication: 51, configureApplicationLock: 131, getDataRevision: 105 });
const EXACT_CONTACT = '__alpha_contact_exact:';
const error = code => new Error(code);
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
function decimal(value, signed = false) {
  if (typeof value !== 'string' || !(signed ? /^-?(?:0|[1-9][0-9]*)$/ : /^(?:0|[1-9][0-9]*)$/).test(value)) throw error('BRIDGE_VALUE_INVALID');
  const n = BigInt(value);
  if (n < (signed ? -(1n << 63n) : 0n) || n > (signed ? (1n << 63n) - 1n : (1n << 64n) - 1n)) throw error('BRIDGE_VALUE_OUT_OF_RANGE');
  return n;
}
function text(value, maximum = 4096) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) throw error('BRIDGE_VALUE_INVALID');
  return value;
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
const INT64_MAX = (1n << 63n) - 1n;
const MAX_SAFE_COUNT = BigInt(Number.MAX_SAFE_INTEGER);
function requestTime(value, code, optional = false) {
  if (optional && value === undefined) return undefined;
  if (typeof value !== 'bigint' || value < 0n || value > INT64_MAX) throw error(code);
  return value;
}
function requestName(value, code, optional = false) {
  if (typeof value !== 'string' || value !== value.trim() || (!optional && !value) || value.length > 1024 || /[\u0000-\u001f\u007f]/.test(value)) throw error(code);
  return value;
}
function safeCount(value) {
  const count = decimal(value);
  if (count > MAX_SAFE_COUNT) throw error('BRIDGE_COUNT_OUT_OF_RANGE');
  return count;
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
  let selectedId = '', selectedPath = '', bridge = null, info = null, helloDone = false;
  let activeImport = null, snapshotLoaded = false, sourceInventory = null, outputInventory = null, sourceFailure = '', closed = false;
  const snapshotOptions = { snapshotRoot, accountId, encryptedDir };
  const names = new Map();
  const configuredSourcePath = encryptedDir || dataDir;
  try {
    const fd = fs.openSync(selectionFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd); if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077)) throw error('ENGINE_STATE_INVALID');
      const state = JSON.parse(fs.readFileSync(fd, 'utf8'));
      if (state.version !== 1 || typeof state.id !== 'string' || typeof state.path !== 'string') throw error('ENGINE_STATE_INVALID');
      selectedId = state.id; selectedPath = state.path;
    } finally { fs.closeSync(fd); }
  } catch (failure) { if (failure.code !== 'ENOENT') throw error('ENGINE_STATE_INVALID'); }
  function saveSelection() {
    safeStateDirectory(stateDir);
    const temporary = path.join(stateDir, `.selected-${crypto.randomUUID()}`);
    try { fs.writeFileSync(temporary, JSON.stringify({ version: 1, id: accountId, path: configuredSourcePath }) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, selectionFile); }
    finally { fs.rmSync(temporary, { force: true }); }
    selectedId = accountId; selectedPath = configuredSourcePath;
  }
  function guard(signal) { lock.assertAccess(); if (closed) throw error('ENGINE_CLOSED'); if (signal?.aborted) throw error(signal.reason?.message === 'IMPORT_TIMEOUT' ? 'IMPORT_TIMEOUT' : 'IMPORT_CANCELED'); }
  async function dropBridge() { const old = bridge; bridge = null; info = null; names.clear(); if (old) await old.close(); }
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
  async function requireAccount(id) { guard(); if (id !== accountId || !configuredSourcePath) throw error('ACCOUNT_NOT_FOUND'); return source(); }
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
    const kind = unsupportedContent ? 'unsupported' : ({ 1: 'text', 3: 'image', 34: 'voice', 42: 'contact', 43: 'video', 47: 'sticker', 48: 'location', 49: 'share', 10000: 'system' })[type] || 'unknown';
    return { id: `msg-${sha(JSON.stringify(identity))}`, localId: local <= 2147483647n ? Number(local) : 0, serverId: server, conversationId: row.conversationId, sourceId: `source-${sha(JSON.stringify([accountId, identity.database]))}`, sentAtUnixMs: sentAt, direction: selfUsername && row.sender ? row.sender === selfUsername ? 2 : 1 : 0, kind, text: content, senderId: text(row.sender), sourceType: rawType, platformMessageId: row.serverId, sourceToken: 'independent1_' + Buffer.from(JSON.stringify(identity)).toString('base64url'), refs: [] };
  }
  function account(value) {
    const selected = selectedId === accountId && selectedPath === configuredSourcePath;
    if (!value) return { id: accountId, sourceProfile: 'alpha-independent-encrypted-v4', subjectId: selfUsername, displayName: `加密数据源 · ${accountId}`, dataSourcePath: encryptedDir, schemaProfile: 'wechat-v4-encrypted', state: 1, handleState: 3, handleGeneration: 0n, activeHandleGeneration: 0n, selected, capabilities: ['offline-encrypted'], detected: true, usable: false, enabled: false, verified: false, ready: false };
    const capabilities = ['offline-readonly', ...Object.entries({ 'contacts.list': 'contacts', 'sessions.list': 'conversations', 'messages.list': 'messages' }).filter(([operation]) => value.capabilities.includes(operation)).map(([, capability]) => capability)];
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
  async function cancelImport() {
    const operation = activeImport;
    if (operation) { operation.controller.abort(); await operation.done; }
  }
  async function importKey(request) {
    guard();
    if (!encryptedDir) throw error('ENCRYPTED_SOURCE_NOT_CONFIGURED');
    if (request.accountId !== accountId || !(request.databaseKey instanceof Uint8Array) || request.databaseKey.length !== 32) throw error('DATABASE_KEY_INVALID');
    if (activeImport) throw error('IMPORT_BUSY');
    let done; const operation = { controller: new AbortController(), done: new Promise(resolve => { done = resolve; }) }; activeImport = operation;
    const deadline = setTimeout(() => operation.controller.abort(error('IMPORT_TIMEOUT')), importerTimeoutMs);
    const check = () => guard(operation.controller.signal);
    let workDir, finalDir, candidate = null, published = false;
    try {
      check(); await dropBridge(); dataDir = ''; sourceInventory = null; outputInventory = null; snapshotLoaded = false; sourceFailure = '';
      await snapshot.safeDirectory(stateDir, check);
      try { await fs.promises.mkdir(snapshotRoot, { mode: 0o700 }); } catch (failure) { if (failure.code !== 'EEXIST') throw failure; }
      await snapshot.safeDirectory(snapshotRoot, check, true);
      workDir = await fs.promises.mkdtemp(path.join(snapshotRoot, '.work-')); await fs.promises.chmod(workDir, 0o700); check();
      const outputDir = path.join(workDir, 'data');
      const original = await snapshot.inventory(encryptedDir, check); check();
      const summary = await runImporter({ executable: importerPath, sourceDir: encryptedDir, outputDir, key: request.databaseKey, signal: operation.controller.signal, timeoutMs: importerTimeoutMs }); check();
      if (!summary || summary.ok !== true || summary.profile !== snapshot.PROFILE || summary.sourceUnchanged !== true || summary.reservedBytesZeroed !== true || summary.outputDir !== outputDir || summary.sourceFingerprint !== original.fingerprint) throw error('IMPORT_SUMMARY_INVALID');
      snapshot.records(summary.databases);
      await snapshot.verifyStamps(original, check);
      const output = await snapshot.inventory(outputDir, check, true); check(); snapshot.matchInventory(original, output, summary.databases);
      candidate = bridgeFactory({ executable: bridgePath, dataDir: outputDir, accountId }); checkedInfo(await candidate.call('account.info')); check(); await candidate.close(); candidate = null;
      finalDir = path.join(snapshotRoot, `snapshot-${crypto.randomUUID()}`); await fs.promises.rename(workDir, finalDir); workDir = null; check();
      const finalData = path.join(finalDir, 'data');
      const finalInventory = await snapshot.inventory(finalData, check, true); snapshot.matchInventory(original, finalInventory, summary.databases); check();
      candidate = bridgeFactory({ executable: bridgePath, dataDir: finalData, accountId }); const checked = checkedInfo(await candidate.call('account.info')); check();
      const manifest = { version: 2, accountId, encryptedDir, outputDir: finalData, profile: snapshot.PROFILE, sourceFingerprint: original.fingerprint, databases: summary.databases };
      // Atomic manifest rename is the commit point. Cancellation afterwards may
      // suppress the response and close handles, but must retain this valid cache.
      await snapshot.writeManifest(manifest, snapshotOptions, check);
      dataDir = finalData; bridge = candidate; candidate = null; info = checked; sourceInventory = original; outputInventory = finalInventory; snapshotLoaded = true; published = true;
      return account(checked);
    } finally {
      clearTimeout(deadline); request.databaseKey.fill(0);
      try {
        if (candidate) await candidate.close();
        if (workDir) await fs.promises.rm(workDir, { recursive: true, force: true });
        if (finalDir && !published) await fs.promises.rm(finalDir, { recursive: true, force: true });
      } finally { if (activeImport === operation) activeImport = null; done(); }
    }
  }
  const handlers = {
    async hello(request) {
      if (request.protocol?.major !== 1) throw error('PROTOCOL_VERSION_UNSUPPORTED');
      if (!encryptedDir && dataDir && !lock.status().locked) await source();
      helloDone = true;
      return { negotiatedProtocol: { major: 1, minor: 0 }, components: [{ component: 'alpha-independent-engine', version: '0.1.0', buildId: 'independent-node-stdio-v1', protocolMajor: 1, protocolMinor: 0 }], serverNonce: crypto.randomBytes(16), supportedMethodIds: Object.values(SUPPORTED).sort((a, b) => a - b), supportsExportTimeRange: false };
    },
    async getCapabilities() { return {}; }, // No original product entitlements exist in this backend.
    async getApplicationLockStatus() { return { status: lock.status() }; },
    async unlockApplication(request) { return { status: await lock.unlock(request.password) }; },
    async lockApplication() { const status = lock.lock(); await cancelImport(); await dropBridge(); if (encryptedDir) { dataDir = ''; snapshotLoaded = false; sourceInventory = outputInventory = null; } return { status }; },
    async configureApplicationLock(request) { return { status: await lock.configure(request) }; },
    async importDatabaseKey(request) { return { account: await importKey(request) }; },
    async listAccounts() {
      guard(); if (activeImport) throw error('IMPORT_IN_PROGRESS');
      await restoreSnapshot(); guard();
      if (encryptedDir && !dataDir) { await snapshot.verifyStamps(sourceInventory, guard); return { accounts: [account(null)], selectedAccountId: '' }; }
      if (!dataDir) return { accounts: [], selectedAccountId: '' };
      const value = await source(); return { accounts: [account(value)], selectedAccountId: selectedId === accountId && selectedPath === configuredSourcePath ? accountId : '' };
    },
    async discoverAccounts(request) { guard(); if (!configuredSourcePath || request.sourceLocation !== configuredSourcePath) throw error('SOURCE_NOT_AUTHORIZED'); return handlers.listAccounts(); },
    async selectAccount(request) { const value = await requireAccount(request.accountId); const previousAccountId = selectedId; guard(); saveSelection(); return { account: account(value), previousAccountId }; },
    async getDataRevision(request) { const value = await requireAccount(request.accountId); return { revision: sha(value.snapshotId).slice(0, 16) }; },
    async listContacts(request) {
      await requireAccount(request.accountId);
      if (request.directory || request.lookup || request.ascending !== true) throw error('UNIMPLEMENTED');
      const limit = Math.min(request.limit || 100, 500), offset = request.offset || 0;
      if (!Number.isInteger(limit) || limit < 1 || !Number.isInteger(offset) || offset < 0 || offset > 100000) throw error('CONTACT_PAGE_INVALID');
      const query = request.query || ''; let usernameExact;
      if (query.startsWith(EXACT_CONTACT)) { usernameExact = query.slice(EXACT_CONTACT.length); if (!usernameExact) throw error('CONTACT_QUERY_INVALID'); }
      else if (query) throw error('UNIMPLEMENTED');
      let cursor = '', skipped = 0, response;
      do {
        const count = skipped < offset ? Math.min(500, offset - skipped) : limit;
        response = checkedPage(await callData('contacts.list', { limit: count, cursor, ...(usernameExact ? { usernameExact } : {}) }), count);
        if (skipped >= offset) break;
        skipped += response.items.length; cursor = response.nextCursor;
        if (!cursor) { response = { items: [] }; break; }
      } while (true);
      return { response: { items: response.items.map(row => ({ username: text(row.username), displayName: text(row.remark) || text(row.nickName) || text(row.username), alias: text(row.alias), remark: text(row.remark), nickname: text(row.nickName), localType: uint32(row.localType), flags: 0n, sourceTable: 'contact', fields: [] })), sourceTable: 'contact' } };
    },
    async listConversations(request) {
      await requireAccount(request.accountId); const limit = pageSize(request.page);
      const page = checkedPage(await callData('sessions.list', { limit, cursor: readCursor(request.page?.cursor) }), limit);
      const items = [];
      for (const row of page.items) { const username = text(row.username); items.push({ id: username, accountId, kind: username.endsWith('@chatroom') ? 2 : 1, displayName: await contactName(username), preview: text(row.summary, 1024 * 1024), lastActivityUnixMs: milliseconds(row.lastTimestamp), sortTimestamp: milliseconds(row.sortTimestamp) }); }
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
        if (!['hello', 'getCapabilities', 'getApplicationLockStatus', 'unlockApplication', 'lockApplication', 'configureApplicationLock'].includes(method)) lock.assertAccess();
        return EngineServerFrame.fromPartial({ requestId, [method]: response });
      } catch (failure) {
        const code = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure.message ?? '') ? failure.message : 'INTERNAL_ERROR';
        return EngineServerFrame.fromPartial({ requestId, error: { code, category: code === 'UNIMPLEMENTED' ? 'independent.unsupported' : 'independent.backend', retryable: false, userMessageKey: code, diagnosticId: crypto.randomUUID() } });
      } finally {
        if (request.importDatabaseKey?.databaseKey instanceof Uint8Array) request.importDatabaseKey.databaseKey.fill(0);
        for (const payload of [request.unlockApplication, request.configureApplicationLock]) {
          if (payload?.password instanceof Uint8Array) payload.password.fill(0);
          if (payload?.newPassword instanceof Uint8Array) payload.newPassword.fill(0);
        }
      }
    },
    async cancelPending() { await cancelImport(); },
    async close() { closed = true; await cancelImport(); await dropBridge(); }
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
