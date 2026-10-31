'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const protocol = require('../alpha-protocol/index.cjs');
const { BridgeClient } = require('./bridge-client.cjs');
const { EngineClientFrame, EngineServerFrame, LengthDelimitedFrameDecoder, encodeLengthDelimitedFrame, DEFAULT_MAX_FRAME_BYTES } = protocol;
const ALL_METHODS = Object.keys(EngineClientFrame.fromPartial({})).filter(name => name !== 'requestId');
// Values are EngineClientFrame field numbers, not RPC ordinal positions.
const SUPPORTED = Object.freeze({ hello: 10, getCapabilities: 11, listAccounts: 12, selectAccount: 13, listConversations: 14, listMessages: 15, discoverAccounts: 29, listContacts: 42, getApplicationLockStatus: 48, unlockApplication: 50, lockApplication: 51, configureApplicationLock: 131, getDataRevision: 105 });
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
function safeStateDirectory(directory) {
  if (!path.isAbsolute(directory)) throw error('ENGINE_STATE_PATH_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.split(path.sep).filter(Boolean)) { current = path.join(current, part); const stat = fs.lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) throw error('ENGINE_STATE_PATH_INVALID'); }
}

async function createEngine({ lock, stateDir, bridgePath, dataDir = '', accountId = '', selfUsername = '', bridgeFactory = options => new BridgeClient(options) }) {
  if (!lock || typeof lock.assertAccess !== 'function') throw error('SECURITY_PROVIDER_REQUIRED');
  safeStateDirectory(stateDir);
  if (dataDir && (!path.isAbsolute(dataDir) || !accountId || accountId.length > 256 || /[\x00-\x1f]/.test(accountId))) throw error('DATA_SOURCE_CONFIGURATION_INVALID');
  if (dataDir && (!bridgePath || !path.isAbsolute(bridgePath))) throw error('BRIDGE_PATH_INVALID');
  if (selfUsername && /[\x00-\x1f]/.test(selfUsername)) throw error('SELF_USERNAME_INVALID');
  const selectionFile = path.join(stateDir, 'selected-source.v1.json');
  let selectedId = '', selectedPath = '', bridge = null, info = null, helloDone = false;
  const names = new Map();
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
    try { fs.writeFileSync(temporary, JSON.stringify({ version: 1, id: accountId, path: dataDir }) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, selectionFile); }
    finally { fs.rmSync(temporary, { force: true }); }
    selectedId = accountId; selectedPath = dataDir;
  }
  async function source() {
    lock.assertAccess();
    if (!dataDir) throw error('ACCOUNT_NOT_FOUND');
    if (!bridge || bridge.closed) { bridge = bridgeFactory({ executable: bridgePath, dataDir, accountId }); info = null; names.clear(); }
    // This is also the Go process's immutable-snapshot verification barrier.
    // Never answer ready/revision solely from cached metadata after a file changed.
    const value = await bridge.call('account.info'); lock.assertAccess();
    if (!value || value.id !== accountId || value.readOnly !== true || value.sourceKind !== 'offline-wechat-v4' || typeof value.snapshotId !== 'string' || !value.snapshotId || !Array.isArray(value.capabilities) || !value.capabilities.includes('account.info')) throw error('BRIDGE_ACCOUNT_INVALID');
    if (info && info.snapshotId !== value.snapshotId) names.clear();
    info = value;
    return info;
  }
  async function callData(op, params) { await source(); const result = await bridge.call(op, params); lock.assertAccess(); return result; }
  async function requireAccount(id) { lock.assertAccess(); if (id !== accountId || !dataDir) throw error('ACCOUNT_NOT_FOUND'); return source(); }
  function account(value) {
    const selected = selectedId === accountId && selectedPath === dataDir;
    const capabilities = ['offline-readonly', ...Object.entries({ 'contacts.list': 'contacts', 'sessions.list': 'conversations', 'messages.list': 'messages' }).filter(([operation]) => value.capabilities.includes(operation)).map(([, capability]) => capability)];
    return { id: accountId, sourceProfile: 'alpha-independent-offline-v4', subjectId: selfUsername, displayName: `离线数据源 · ${accountId}`, dataSourcePath: dataDir, schemaProfile: 'wechat-v4-offline', state: 2, handleState: 4, handleGeneration: 1n, activeHandleGeneration: 1n, selected, capabilities, detected: true, usable: true, enabled: true, verified: true, ready: true };
  }
  async function contactName(username) {
    if (names.has(username)) return names.get(username);
    let found;
    try { found = checkedPage(await callData('contacts.list', { usernameExact: username, limit: 1, cursor: '' }), 1).items[0]; }
    catch (failure) { if (failure.message === 'CAPABILITY_UNAVAILABLE') return username; throw failure; }
    const name = found ? text(found.remark) || text(found.nickName) || username : username;
    names.set(username, name); return name;
  }
  const handlers = {
    async hello(request) {
      if (request.protocol?.major !== 1) throw error('PROTOCOL_VERSION_UNSUPPORTED');
      if (dataDir && !lock.status().locked) await source();
      helloDone = true;
      return { negotiatedProtocol: { major: 1, minor: 0 }, components: [{ component: 'alpha-independent-engine', version: '0.1.0', buildId: 'independent-node-stdio-v1', protocolMajor: 1, protocolMinor: 0 }], serverNonce: crypto.randomBytes(16), supportedMethodIds: Object.values(SUPPORTED).sort((a, b) => a - b), supportsExportTimeRange: false };
    },
    async getCapabilities() { return {}; }, // No original product entitlements exist in this backend.
    async getApplicationLockStatus() { return { status: lock.status() }; },
    async unlockApplication(request) { return { status: await lock.unlock(request.password) }; },
    async lockApplication() { const status = lock.lock(); if (bridge) await bridge.close(); bridge = null; info = null; names.clear(); return { status }; },
    async configureApplicationLock(request) { return { status: await lock.configure(request) }; },
    async listAccounts() { lock.assertAccess(); if (!dataDir) return { accounts: [], selectedAccountId: '' }; const value = await source(); return { accounts: [account(value)], selectedAccountId: selectedId === accountId && selectedPath === dataDir ? accountId : '' }; },
    async discoverAccounts(request) { lock.assertAccess(); if (!dataDir || request.sourceLocation !== dataDir) throw error('SOURCE_NOT_AUTHORIZED'); return handlers.listAccounts(); },
    async selectAccount(request) { const value = await requireAccount(request.accountId); const previousAccountId = selectedId; lock.assertAccess(); saveSelection(); return { account: account(value), previousAccountId }; },
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
    async listMessages(request) {
      const value = await requireAccount(request.accountId); const limit = pageSize(request.page);
      if (!request.conversationId || request.conversationId.length > 1024) throw error('CONVERSATION_ID_INVALID');
      const after = request.afterUnixMs, before = request.beforeUnixMs;
      if (after !== undefined && after < 0n || before !== undefined && (before < 0n || after !== undefined && before <= after)) throw error('MESSAGE_TIME_RANGE_INVALID');
      const lower = after === undefined ? 0n : after / 1000n + 1n;
      const upper = before === undefined ? undefined : before === 0n ? -1n : (before - 1n) / 1000n;
      const applied = { ...(after !== undefined ? { appliedAfterUnixMs: after } : {}), ...(before !== undefined ? { appliedBeforeUnixMs: before } : {}) };
      // Millisecond-exclusive filters can describe no whole-second timestamps.
      if (upper !== undefined && lower > upper) return { items: [], nextCursor: Buffer.alloc(0), ...applied };
      const page = checkedPage(await callData('messages.list', { limit, cursor: readCursor(request.page?.cursor), conversationId: request.conversationId, ascending: request.ascending === true, ...(after !== undefined ? { afterTime: String(lower) } : {}), ...(upper !== undefined ? { beforeTime: String(upper) } : {}) }), limit);
      const items = page.items.map(row => {
        if (row.conversationId !== request.conversationId) throw error('BRIDGE_MESSAGE_SCOPE_INVALID');
        const local = decimal(row.localId), server = decimal(row.serverId, true), sentAt = milliseconds(row.createTime);
        if (after !== undefined && sentAt <= after || before !== undefined && sentAt >= before) throw error('BRIDGE_MESSAGE_RANGE_INVALID');
        const identity = { accountId, database: text(row.source?.database), table: text(row.source?.table), localId: row.localId };
        let content = '', unsupportedContent = false;
        if (row.contentEncoding === 'utf8') content = text(row.content, 4 * 1024 * 1024);
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
        for (const payload of [request.unlockApplication, request.configureApplicationLock]) {
          if (payload?.password instanceof Uint8Array) payload.password.fill(0);
          if (payload?.newPassword instanceof Uint8Array) payload.newPassword.fill(0);
        }
      }
    },
    async close() { if (bridge) await bridge.close(); bridge = null; info = null; names.clear(); }
  };
}

async function runStdio(engine, input = process.stdin, output = process.stdout) {
  const decoder = new LengthDelimitedFrameDecoder();
  const write = async response => {
    let bytes = EngineServerFrame.encode(response).finish();
    if (bytes.byteLength > DEFAULT_MAX_FRAME_BYTES) bytes = EngineServerFrame.encode(EngineServerFrame.fromPartial({ requestId: response.requestId, error: { code: 'FRAME_TOO_LARGE', category: 'transport' } })).finish();
    await new Promise((resolve, reject) => output.write(encodeLengthDelimitedFrame(bytes), err => err ? reject(err) : resolve()));
  };
  let failed = false;
  try {
    for await (const chunk of input) {
      for (const frame of decoder.push(chunk)) {
        let request;
        try { request = EngineClientFrame.decode(frame); }
        catch { await write(EngineServerFrame.fromPartial({ requestId: 0n, error: { code: 'INVALID_PROTOBUF', category: 'transport' } })); continue; }
        await write(await engine.dispatch(request));
      }
    }
    decoder.finish();
  } catch (failure) {
    failed = true;
    const code = failure.code === 'TRUNCATED_FRAME' || failure.code === 'FRAME_TOO_LARGE' ? failure.code : 'TRANSPORT_FAILED';
    try { await write(EngineServerFrame.fromPartial({ requestId: 0n, error: { code, category: 'transport' } })); } catch {}
  } finally { await engine.close(); }
  return { failed };
}
module.exports = { createEngine, runStdio, SUPPORTED, ALL_METHODS };
