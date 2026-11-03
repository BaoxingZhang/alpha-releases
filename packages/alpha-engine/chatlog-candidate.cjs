'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_STARTUP_TIMEOUT_MS = 10000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;
const MAX_QUERY_BYTES = 4096;
const ALLOWED_PATHS = new Set(['/health', '/api/v1/chatlog', '/api/v1/contact', '/api/v1/chatroom', '/api/v1/session']);
const CANDIDATE_MESSAGE_MAX_BYTES = 4 * 1024 * 1024;
const CANDIDATE_ITEM_MAX = 1000;

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanAbsolute(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value || value === path.parse(value).root) throw failure(code);
  return value;
}

function regularExecutable(value) {
  const filename = cleanAbsolute(value, 'CHATLOG_CANDIDATE_BINARY_INVALID');
  let stat;
  try { stat = fs.lstatSync(filename); } catch { throw failure('CHATLOG_CANDIDATE_BINARY_INVALID'); }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111) === 0) throw failure('CHATLOG_CANDIDATE_BINARY_INVALID');
  return filename;
}

function regularDirectory(value, code) {
  const directory = cleanAbsolute(value, code);
  let current = path.parse(directory).root;
  const relative = directory.slice(current.length);
  for (const part of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch { throw failure(code); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure(code);
  }
  return directory;
}

function preparedWorkDirectory(directory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const supported = /^(?:contact|session|hardlink|message(?:_[0-9]+)?|media(?:_[0-9]+)?)\.db$/;
  if (!entries.some(entry => entry.isFile() && supported.test(entry.name))) throw failure('CHATLOG_CANDIDATE_WORK_DIR_UNPREPARED');
  if (entries.some(entry => entry.isSymbolicLink())) throw failure('CHATLOG_CANDIDATE_WORK_DIR_INVALID');
  return directory;
}

function validVersion(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 32) throw failure('CHATLOG_CANDIDATE_VERSION_INVALID');
  return value;
}

function validPlatform(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,32}$/.test(value)) throw failure('CHATLOG_CANDIDATE_PLATFORM_INVALID');
  return value;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function candidateString(value, maximum, code) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\u0000')) throw failure(code);
  return value;
}

function candidateBoolean(value, code) {
  if (typeof value !== 'boolean') throw failure(code);
  return value;
}

function candidateInteger(value, code) {
  if (!Number.isSafeInteger(value)) throw failure(code);
  return value;
}

function candidateTime(value) {
  if (typeof value !== 'string' || value.length > 128 || value.includes('\u0000')) throw failure('CHATLOG_CANDIDATE_TIME_INVALID');
  const parsed = Date.parse(value);
  if (!Number.isSafeInteger(parsed)) throw failure('CHATLOG_CANDIDATE_TIME_INVALID');
  return String(parsed);
}

function candidateKind(type, subType) {
  const kinds = new Map([[1, 'text'], [3, 'image'], [34, 'voice'], [42, 'contact'], [43, 'video'], [47, 'sticker'], [48, 'location'], [49, 'share'], [10000, 'system']]);
  if (!Number.isSafeInteger(type) || type < 0 || type > 1000000 || !Number.isSafeInteger(subType) || subType < 0 || subType > 1000000) throw failure('CHATLOG_CANDIDATE_MESSAGE_TYPE_INVALID');
  return kinds.get(type) || 'unknown';
}

function normalizeChatlogMessage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('CHATLOG_CANDIDATE_MESSAGE_INVALID');
  const seq = candidateInteger(value.seq, 'CHATLOG_CANDIDATE_MESSAGE_ID_INVALID');
  if (seq < 0) throw failure('CHATLOG_CANDIDATE_MESSAGE_ID_INVALID');
  const type = candidateInteger(value.type, 'CHATLOG_CANDIDATE_MESSAGE_TYPE_INVALID');
  const subType = candidateInteger(value.subType, 'CHATLOG_CANDIDATE_MESSAGE_TYPE_INVALID');
  const talker = candidateString(value.talker, 1024, 'CHATLOG_CANDIDATE_CONVERSATION_INVALID');
  const sender = candidateString(value.sender, 1024, 'CHATLOG_CANDIDATE_SENDER_INVALID');
  const content = candidateString(value.content, CANDIDATE_MESSAGE_MAX_BYTES, 'CHATLOG_CANDIDATE_MESSAGE_CONTENT_INVALID');
  const talkerName = candidateString(value.talkerName, 4096, 'CHATLOG_CANDIDATE_MESSAGE_INVALID');
  const senderName = candidateString(value.senderName, 4096, 'CHATLOG_CANDIDATE_MESSAGE_INVALID');
  const time = candidateTime(value.time);
  const isChatRoom = candidateBoolean(value.isChatRoom, 'CHATLOG_CANDIDATE_MESSAGE_INVALID');
  const isSelf = candidateBoolean(value.isSelf, 'CHATLOG_CANDIDATE_MESSAGE_INVALID');
  return {
    schema: 'alpha-independent-chatlog-candidate-message.v1',
    scope: 'alpha-independent-chatlog-candidate',
    candidate: true,
    complete: false,
    native_schema_supported: false,
    source_kind: 'chatlog-http-v1',
    id: `chatlog-seq:${seq}`,
    sequence: String(seq),
    conversation_id: talker,
    conversation_name: talkerName,
    sender_id: sender,
    sender_name: senderName,
    sent_at_unix_ms: time,
    kind: candidateKind(type, subType),
    text: content,
    type,
    sub_type: subType,
    is_chat_room: isChatRoom,
    is_self: isSelf
  };
}

function normalizeChatlogItems(value, mapper, code) {
  if (!Array.isArray(value) || value.length > CANDIDATE_ITEM_MAX) throw failure(code);
  return value.map(mapper);
}

function normalizeChatlogContact(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('CHATLOG_CANDIDATE_CONTACT_INVALID');
  return {
    username: candidateString(value.userName, 1024, 'CHATLOG_CANDIDATE_CONTACT_INVALID'),
    alias: candidateString(value.alias, 4096, 'CHATLOG_CANDIDATE_CONTACT_INVALID'),
    remark: candidateString(value.remark, 4096, 'CHATLOG_CANDIDATE_CONTACT_INVALID'),
    nickname: candidateString(value.nickName, 4096, 'CHATLOG_CANDIDATE_CONTACT_INVALID'),
    is_friend: candidateBoolean(value.isFriend, 'CHATLOG_CANDIDATE_CONTACT_INVALID')
  };
}

function normalizeChatlogSession(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('CHATLOG_CANDIDATE_SESSION_INVALID');
  return {
    username: candidateString(value.userName, 1024, 'CHATLOG_CANDIDATE_SESSION_INVALID'),
    nickname: candidateString(value.nickName, 4096, 'CHATLOG_CANDIDATE_SESSION_INVALID'),
    content: candidateString(value.content, CANDIDATE_MESSAGE_MAX_BYTES, 'CHATLOG_CANDIDATE_SESSION_INVALID'),
    last_at_unix_ms: candidateTime(value.nTime),
    order: candidateInteger(value.nOrder, 'CHATLOG_CANDIDATE_SESSION_INVALID')
  };
}

function normalizeChatlogEnvelope(value, kind) {
  if (!['message', 'contact', 'session'].includes(kind)) throw failure('CHATLOG_CANDIDATE_KIND_INVALID');
  const key = kind === 'contact' ? 'contacts' : kind === 'session' ? 'sessions' : 'items';
  const mapper = kind === 'contact' ? normalizeChatlogContact : kind === 'session' ? normalizeChatlogSession : normalizeChatlogMessage;
  const items = normalizeChatlogItems(kind === 'message' ? value : value?.items, mapper, `CHATLOG_CANDIDATE_${kind.toUpperCase()}_LIST_INVALID`);
  return { schema: `alpha-independent-chatlog-candidate-${kind}s.v1`, scope: 'alpha-independent-chatlog-candidate', candidate: true, complete: false, native_schema_supported: false, source_kind: 'chatlog-http-v1', [key]: items };
}

function candidateQueryString(value, maximum, code) {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\u0000') || /[\u0000-\u001f\u007f]/.test(value)) throw failure(code);
  return value;
}

function candidatePaging(value, code, maximum = 1000000000) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw failure(code);
  return String(value);
}

function candidateQuery(pathname, values) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') query.set(key, value);
  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

function candidateHttpResult(result) {
  if (!result || result.status !== 200) throw failure('CHATLOG_CANDIDATE_HTTP_STATUS');
  return result.json;
}

async function reserveLoopbackPort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0 }, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => server.close(() => resolve()));
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw failure('CHATLOG_CANDIDATE_PORT_INVALID');
  return port;
}

async function readBody(response, maxBytes) {
  const advertised = Number(response.headers.get('content-length'));
  if (Number.isSafeInteger(advertised) && advertised > maxBytes) throw failure('CHATLOG_CANDIDATE_RESPONSE_TOO_LARGE');
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      total += chunk.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw failure('CHATLOG_CANDIDATE_RESPONSE_TOO_LARGE');
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

class ChatlogCandidate {
  constructor({ child, port, configDirectory, responseLimitBytes, requestTimeoutMs }) {
    this.child = child;
    this.port = port;
    this.baseUrl = `http://127.0.0.1:${port}`;
    this.responseLimitBytes = responseLimitBytes;
    this.requestTimeoutMs = requestTimeoutMs;
    this.configDirectory = configDirectory;
    this.closed = false;
    this.exit = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  }

  async request(requestPath, options = {}) {
    if (this.closed) throw failure('CHATLOG_CANDIDATE_CLOSED');
    if (typeof requestPath !== 'string' || requestPath.length === 0 || requestPath.length > 8192 || !requestPath.startsWith('/') || requestPath.includes('\u0000')) throw failure('CHATLOG_CANDIDATE_PATH_INVALID');
    const method = options.method === undefined ? 'GET' : options.method;
    if (method !== 'GET') throw failure('CHATLOG_CANDIDATE_METHOD_UNSUPPORTED');
    let parsed;
    try { parsed = new URL(requestPath, this.baseUrl); } catch { throw failure('CHATLOG_CANDIDATE_PATH_INVALID'); }
    if (parsed.origin !== this.baseUrl || parsed.username || parsed.password || !ALLOWED_PATHS.has(parsed.pathname) || Buffer.byteLength(parsed.search, 'utf8') > MAX_QUERY_BYTES) throw failure('CHATLOG_CANDIDATE_PATH_UNSUPPORTED');
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs === undefined ? this.requestTimeoutMs : options.timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw failure('CHATLOG_CANDIDATE_TIMEOUT_INVALID');
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let response;
      try {
        response = await fetch(parsed, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { accept: 'application/json, text/plain' } });
      } catch (error) {
        if (controller.signal.aborted) throw failure('CHATLOG_CANDIDATE_REQUEST_TIMEOUT');
        throw failure('CHATLOG_CANDIDATE_REQUEST_FAILED', error?.message || 'request failed');
      }
      if (response.status >= 300 && response.status < 400) {
        if (response.body) await response.body.cancel().catch(() => {});
        throw failure('CHATLOG_CANDIDATE_REDIRECT_DENIED');
      }
      try {
        const body = await readBody(response, this.responseLimitBytes);
        return { status: response.status, headers: Object.fromEntries(response.headers.entries()), body };
      } catch (error) {
        if (controller.signal.aborted) throw failure('CHATLOG_CANDIDATE_REQUEST_TIMEOUT');
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async json(requestPath, options = {}) {
    const result = await this.request(requestPath, options);
    try {
      return { ...result, json: JSON.parse(result.body.toString('utf8')) };
    } catch {
      throw failure('CHATLOG_CANDIDATE_JSON_INVALID');
    }
  }

  async readContacts(options = {}) {
    const keyword = options.keyword === undefined ? '' : candidateQueryString(options.keyword, 1024, 'CHATLOG_CANDIDATE_QUERY_INVALID');
    const limit = candidatePaging(options.limit, 'CHATLOG_CANDIDATE_LIMIT_INVALID', CANDIDATE_ITEM_MAX);
    const offset = candidatePaging(options.offset, 'CHATLOG_CANDIDATE_OFFSET_INVALID');
    const value = candidateHttpResult(await this.json(candidateQuery('/api/v1/contact', { keyword, limit, offset, format: 'json' })));
    return normalizeChatlogEnvelope(value, 'contact');
  }

  async readSessions(options = {}) {
    const keyword = options.keyword === undefined ? '' : candidateQueryString(options.keyword, 1024, 'CHATLOG_CANDIDATE_QUERY_INVALID');
    const limit = candidatePaging(options.limit, 'CHATLOG_CANDIDATE_LIMIT_INVALID', CANDIDATE_ITEM_MAX);
    const offset = candidatePaging(options.offset, 'CHATLOG_CANDIDATE_OFFSET_INVALID');
    const value = candidateHttpResult(await this.json(candidateQuery('/api/v1/session', { keyword, limit, offset, format: 'json' })));
    return normalizeChatlogEnvelope(value, 'session');
  }

  async readMessages(options = {}) {
    const values = {};
    for (const key of ['time', 'talker', 'sender', 'keyword']) if (options[key] !== undefined) values[key] = candidateQueryString(options[key], 4096, 'CHATLOG_CANDIDATE_QUERY_INVALID');
    values.limit = candidatePaging(options.limit, 'CHATLOG_CANDIDATE_LIMIT_INVALID', CANDIDATE_ITEM_MAX);
    values.offset = candidatePaging(options.offset, 'CHATLOG_CANDIDATE_OFFSET_INVALID');
    values.format = 'json';
    const value = candidateHttpResult(await this.json(candidateQuery('/api/v1/chatlog', values)));
    return normalizeChatlogEnvelope(value, 'message');
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.child.exitCode === null && this.child.signalCode === null) {
      try { this.child.kill('SIGTERM'); } catch {}
      await Promise.race([this.exit, sleep(1000)]);
      if (this.child.exitCode === null && this.child.signalCode === null) {
        try { this.child.kill('SIGKILL'); } catch {}
        await this.exit;
      }
    } else await this.exit;
    await fsp.rm(this.configDirectory, { recursive: true, force: true }).catch(() => {});
  }
}

async function createChatlogCandidate(options = {}) {
  const binary = regularExecutable(options.binaryPath);
  const workDir = preparedWorkDirectory(regularDirectory(options.workDir, 'CHATLOG_CANDIDATE_WORK_DIR_INVALID'));
  const platform = validPlatform(options.platform === undefined ? 'darwin' : options.platform);
  const version = validVersion(options.version === undefined ? 4 : options.version);
  const startupTimeoutMs = options.startupTimeoutMs === undefined ? DEFAULT_STARTUP_TIMEOUT_MS : options.startupTimeoutMs;
  const requestTimeoutMs = options.requestTimeoutMs === undefined ? DEFAULT_REQUEST_TIMEOUT_MS : options.requestTimeoutMs;
  const responseLimitBytes = options.responseLimitBytes === undefined ? DEFAULT_RESPONSE_LIMIT_BYTES : options.responseLimitBytes;
  for (const [value, code, minimum, maximum] of [[startupTimeoutMs, 'CHATLOG_CANDIDATE_TIMEOUT_INVALID', 500, 120000], [requestTimeoutMs, 'CHATLOG_CANDIDATE_TIMEOUT_INVALID', 100, 120000], [responseLimitBytes, 'CHATLOG_CANDIDATE_RESPONSE_LIMIT_INVALID', 1024, 64 * 1024 * 1024]]) {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw failure(code);
  }
  const configDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), 'alpha-chatlog-candidate-'));
  const port = await reserveLoopbackPort();
  const address = `127.0.0.1:${port}`;
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    LANG: process.env.LANG || 'C.UTF-8',
    HOME: configDirectory,
    USERPROFILE: configDirectory,
    CHATLOG_DIR: configDirectory
  };
  let child;
  try {
    // Chatlog's server command insists on a non-empty data_key even when it
    // only opens an already-decrypted work directory. Pass a fixed, non-secret
    // sentinel solely to satisfy that CLI guard; no caller key is accepted,
    // forwarded, logged, or retained by this wrapper.
    await fsp.writeFile(path.join(configDirectory, 'chatlog-server.json'), JSON.stringify({ data_key: 'independent-workdir', work_dir: workDir, http_addr: address }) + '\n', { mode: 0o600 });
    const args = ['server', '--addr', address, '--platform', platform, '--version', String(version), '--work-dir', workDir, '--data-key', 'independent-workdir'];
    // The wrapper intentionally does not accept or forward a database key and
    // never enables Chatlog's auto-decrypt mode. Callers must prepare an
    // already-decrypted work directory and, when the candidate binary insists
    // on a service configuration, provide that configuration through its
    // private CHATLOG_DIR outside this adapter's API.
    child = spawn(binary, args, { cwd: configDirectory, env, stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });
    const started = new Promise((resolve, reject) => {
      child.once('error', () => reject(failure('CHATLOG_CANDIDATE_START_FAILED')));
      child.once('spawn', resolve);
    });
    await started;
    const candidate = new ChatlogCandidate({ child, port, configDirectory, responseLimitBytes, requestTimeoutMs });
    const deadline = Date.now() + startupTimeoutMs;
    try {
      while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null) throw failure('CHATLOG_CANDIDATE_EXITED');
        try {
          const response = await candidate.request('/health', { timeoutMs: Math.min(1000, Math.max(100, deadline - Date.now())) });
          if (response.status === 200) return candidate;
        } catch (error) {
          if (error.code === 'CHATLOG_CANDIDATE_RESPONSE_TOO_LARGE') throw error;
        }
        await sleep(50);
      }
      throw failure('CHATLOG_CANDIDATE_START_TIMEOUT');
    } catch (error) {
      await candidate.close();
      throw error;
    }
  } catch (error) {
    if (child && child.exitCode === null && child.signalCode === null) {
      try { child.kill('SIGKILL'); } catch {}
    }
    await fsp.rm(configDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

module.exports = {
  ChatlogCandidate,
  createChatlogCandidate,
  ALLOWED_PATHS,
  normalizeChatlogMessage,
  normalizeChatlogContact,
  normalizeChatlogSession,
  normalizeChatlogEnvelope
};
