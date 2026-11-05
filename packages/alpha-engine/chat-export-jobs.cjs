'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { CHAT_FORMAT_EXTENSIONS } = require('./export-formats.cjs');

const FORMATS = new Set(['json', 'markdown', 'txt', 'html', 'xlsx', ...Object.keys(CHAT_FORMAT_EXTENSIONS)]);
const MAX_CONVERSATIONS = 500;
const MAX_JOBS = 64;
const STATE_FILE = 'chat-export-jobs.v1.json';
const MAX_STATE_BYTES = 16 * 1024 * 1024;
const JOB_STATES = new Set(['queued', 'running', 'canceling', 'completed', 'completed_with_errors', 'failed', 'canceled']);
const ITEM_STATES = new Set(['pending', 'running', 'completed', 'failed', 'canceled']);

function fail(code) { throw new Error(code); }

function cloneItem(item) {
  return { ...item };
}

function cloneJob(job) {
  return {
    jobId: job.jobId,
    accountId: job.accountId,
    state: job.state,
    format: job.format,
    directory: job.directory,
    createdAtUnixMs: job.createdAtUnixMs,
    updatedAtUnixMs: job.updatedAtUnixMs,
    ...(job.finishedAtUnixMs === undefined ? {} : { finishedAtUnixMs: job.finishedAtUnixMs }),
    items: job.items.map(cloneItem),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    kind: 'chat',
  };
}

function jsonSafe(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
}

function wireInteger(value, field) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,18})$/.test(value)) fail('CHAT_EXPORT_STATE_INVALID');
  try { return BigInt(value); } catch { fail('CHAT_EXPORT_STATE_INVALID'); }
}

function restoreJob(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.jobId !== 'string' || !raw.jobId || typeof raw.accountId !== 'string' || !raw.accountId || !JOB_STATES.has(raw.state) || !FORMATS.has(raw.format) || typeof raw.directory !== 'string' || !path.isAbsolute(raw.directory) || !Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > MAX_CONVERSATIONS || (raw.errorCode !== undefined && (typeof raw.errorCode !== 'string' || !/^[A-Z][A-Z0-9_]{1,95}$/.test(raw.errorCode)))) fail('CHAT_EXPORT_STATE_INVALID');
  const job = {
    jobId: raw.jobId,
    accountId: raw.accountId,
    state: raw.state,
    format: raw.format,
    directory: raw.directory,
    createdAtUnixMs: wireInteger(raw.createdAtUnixMs, 'createdAtUnixMs'),
    updatedAtUnixMs: wireInteger(raw.updatedAtUnixMs, 'updatedAtUnixMs'),
    ...(raw.finishedAtUnixMs === undefined ? {} : { finishedAtUnixMs: wireInteger(raw.finishedAtUnixMs, 'finishedAtUnixMs') }),
    ...(raw.errorCode ? { errorCode: raw.errorCode } : {}),
    items: raw.items.map(item => {
      if (!item || typeof item !== 'object' || typeof item.conversationId !== 'string' || !item.conversationId || !ITEM_STATES.has(item.state) || typeof item.phase !== 'string' || typeof item.path !== 'string' || typeof item.errorCode !== 'string') fail('CHAT_EXPORT_STATE_INVALID');
      const result = { ...item };
      for (const field of ['messagesDone', 'mediaSaved', 'mediaFailed']) result[field] = wireInteger(item[field], field);
      for (const field of ['messagesTotal', 'mediaFound', 'mediaSettled']) if (item[field] !== undefined) result[field] = wireInteger(item[field], field);
      if (typeof result.unchanged !== 'boolean' || typeof result.mediaIndexing !== 'boolean') fail('CHAT_EXPORT_STATE_INVALID');
      return result;
    }),
  };
  // An in-flight child process cannot be safely resumed after the engine has
  // restarted. Keep its durable history, but make the interruption explicit
  // and retryable instead of presenting a permanently running job.
  if (['queued', 'running', 'canceling'].includes(job.state)) {
    job.state = 'failed';
    job.errorCode = 'CHAT_EXPORT_PROCESS_RESTARTED';
    job.finishedAtUnixMs = job.updatedAtUnixMs;
    for (const item of job.items) if (['pending', 'running'].includes(item.state)) {
      item.state = 'failed';
      item.errorCode = 'CHAT_EXPORT_PROCESS_RESTARTED';
    }
  }
  return job;
}

function safeConversationFileName(conversationId, format) {
  const extension = (CHAT_FORMAT_EXTENSIONS[format] || (format === 'markdown' ? '.md' : `.${format}`)).slice(1);
  const readable = conversationId.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 96);
  const suffix = crypto.createHash('sha256').update(conversationId).digest('hex').slice(0, 12);
  return `${readable || 'conversation'}-${suffix}.${extension}`;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (typeof request.accountId !== 'string' || !request.accountId.trim() || request.accountId.length > 256 || request.accountId.includes('\0')) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (!Array.isArray(request.conversationIds) || request.conversationIds.length < 1 || request.conversationIds.length > MAX_CONVERSATIONS) fail('CHAT_EXPORT_REQUEST_INVALID');
  const conversationIds = [];
  const seen = new Set();
  for (const value of request.conversationIds) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1024 || value.includes('\0') || seen.has(value)) fail('CHAT_EXPORT_REQUEST_INVALID');
    seen.add(value);
    conversationIds.push(value);
  }
  const format = typeof request.format === 'string' ? request.format.toLowerCase() : '';
  if (!FORMATS.has(format)) fail('CHAT_EXPORT_FORMAT_UNSUPPORTED');
  if (typeof request.outputDirectory !== 'string' || !path.isAbsolute(request.outputDirectory) || !request.outputDirectory.trim() || request.outputDirectory.length > 4096 || request.outputDirectory.includes('\0')) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (request.startTimeUnixMs !== undefined && (typeof request.startTimeUnixMs !== 'bigint' || request.startTimeUnixMs < 0n)) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (request.endTimeUnixMs !== undefined && (typeof request.endTimeUnixMs !== 'bigint' || request.endTimeUnixMs < 0n)) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (request.startTimeUnixMs !== undefined && request.endTimeUnixMs !== undefined && request.startTimeUnixMs > request.endTimeUnixMs) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (request.messageTypes?.length || request.mediaKinds?.length || request.voiceTranscripts === true || request.outputLayout === 'fixed' || request.conflictPolicy || request.displayNamePreference || request.xlsxColumns?.length || request.avatars === true || request.cdnFillMissing === true) fail('CHAT_EXPORT_OPTION_UNSUPPORTED');
  if (request.outputLayout !== undefined && request.outputLayout !== '' && request.outputLayout !== 'job-folder') fail('CHAT_EXPORT_OPTION_UNSUPPORTED');
  if (request.voiceTranscripts !== undefined && request.voiceTranscripts !== false) fail('CHAT_EXPORT_OPTION_UNSUPPORTED');
  if (request.avatars !== undefined && request.avatars !== false) fail('CHAT_EXPORT_OPTION_UNSUPPORTED');
  if (request.cdnFillMissing !== undefined && request.cdnFillMissing !== false) fail('CHAT_EXPORT_OPTION_UNSUPPORTED');
  return { accountId: request.accountId, conversationIds, format, outputDirectory: path.resolve(request.outputDirectory), ...(request.startTimeUnixMs === undefined ? {} : { startTimeUnixMs: request.startTimeUnixMs }), ...(request.endTimeUnixMs === undefined ? {} : { endTimeUnixMs: request.endTimeUnixMs }) };
}

function createChatExportJobs({ runExport, now = () => BigInt(Date.now()), maxJobs = MAX_JOBS, stateDir = '' } = {}) {
  if (typeof runExport !== 'function') throw new TypeError('runExport must be a function');
  if (stateDir && (!path.isAbsolute(stateDir) || path.normalize(stateDir) !== stateDir)) throw new TypeError('stateDir must be a clean absolute path');
  const jobs = new Map();
  let writeQueue = Promise.resolve();
  let closed = false;
  const active = new Set();

  function persist() {
    if (!stateDir) return writeQueue;
    const snapshot = { version: 1, jobs: [...jobs.values()].map(entry => cloneJob(entry.job)) };
    writeQueue = writeQueue.then(async () => {
      const temporary = path.join(stateDir, `.chat-export-jobs-${crypto.randomUUID()}.tmp`);
      try {
        await require('node:fs').promises.writeFile(temporary, jsonSafe(snapshot) + '\n', { flag: 'wx', mode: 0o600 });
        await require('node:fs').promises.chmod(temporary, 0o600);
        await require('node:fs').promises.rename(temporary, path.join(stateDir, STATE_FILE));
      } finally {
        await require('node:fs').promises.rm(temporary, { force: true }).catch(() => {});
      }
    });
    return writeQueue;
  }

  function load() {
    if (!stateDir) return;
    let rewrite = false;
    const fs = require('node:fs');
    try {
      const fd = fs.openSync(path.join(stateDir, STATE_FILE), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > MAX_STATE_BYTES || (stat.mode & 0o077)) fail('CHAT_EXPORT_STATE_INVALID');
        const parsed = JSON.parse(fs.readFileSync(fd, 'utf8'));
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.jobs) || parsed.jobs.length > maxJobs) fail('CHAT_EXPORT_STATE_INVALID');
        const seenJobIds = new Set();
        for (const raw of parsed.jobs) {
          // Only rewrite durable state when restoreJob has to mark an
          // in-flight job as interrupted.  A fresh engine with no state file
          // must not enqueue an unnecessary write: callers commonly remove
          // their temporary state directory during teardown before close()
          // runs, and that write would race recursive cleanup.
          if (['queued', 'running', 'canceling'].includes(raw?.state)) rewrite = true;
          const job = restoreJob(raw);
          if (seenJobIds.has(job.jobId)) fail('CHAT_EXPORT_STATE_INVALID');
          seenJobIds.add(job.jobId);
          if (job.accountId === '') fail('CHAT_EXPORT_STATE_INVALID');
          jobs.set(job.jobId, { job, request: null });
        }
      } finally { fs.closeSync(fd); }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure.message === 'CHAT_EXPORT_STATE_INVALID' ? failure : new Error('CHAT_EXPORT_STATE_INVALID');
    }
    if (rewrite) void persist().catch(() => {});
  }
  load();

  function stamp(job) { job.updatedAtUnixMs = now(); }
  function setState(job, state) { job.state = state; stamp(job); }

  async function run(job, request) {
    if (job.state !== 'queued') return;
    setState(job, 'running');
    await persist();
    for (const item of job.items) {
      if (job.cancelRequested) {
        item.state = 'canceled';
        continue;
      }
      item.state = 'running'; item.phase = 'reading'; stamp(job);
      await persist();
      const destinationPath = path.join(request.outputDirectory, safeConversationFileName(item.conversationId, request.format));
      try {
        const result = await runExport({
          accountId: request.accountId,
          conversationId: item.conversationId,
          format: request.format,
          destinationPath,
          includeMedia: false,
          ...(request.startTimeUnixMs === undefined ? {} : { startTimeUnixMs: request.startTimeUnixMs }),
          ...(request.endTimeUnixMs === undefined ? {} : { endTimeUnixMs: request.endTimeUnixMs }),
        });
        item.phase = 'writing';
        item.state = 'completed';
        item.messagesDone = BigInt(result.itemCount ?? 0);
        item.messagesTotal = item.messagesDone;
        item.path = result.destinationPath || destinationPath;
      } catch (failure) {
        item.state = job.cancelRequested ? 'canceled' : 'failed';
        item.errorCode = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : 'CHAT_EXPORT_ITEM_FAILED';
      }
      stamp(job);
      await persist();
    }
    if (job.cancelRequested) setState(job, 'canceled');
    else if (job.items.some(item => item.state === 'failed')) setState(job, 'completed_with_errors');
    else setState(job, 'completed');
    job.finishedAtUnixMs = now();
    stamp(job);
    await persist();
  }

  function start(raw) {
    if (closed) fail('CHAT_EXPORT_ENGINE_CLOSED');
    const request = validateRequest(raw);
    if (jobs.size >= maxJobs) {
      // Keep durable terminal history bounded while allowing a long-lived
      // engine to continue accepting new work. Active jobs are never evicted.
      const terminal = [...jobs.entries()]
        .filter(([, entry]) => ['completed', 'completed_with_errors', 'failed', 'canceled'].includes(entry.job.state))
        .sort((a, b) => Number(a[1].job.updatedAtUnixMs - b[1].job.updatedAtUnixMs));
      while (jobs.size >= maxJobs && terminal.length) jobs.delete(terminal.shift()[0]);
    }
    if (jobs.size >= maxJobs) fail('CHAT_EXPORT_TOO_MANY_JOBS');
    const jobId = crypto.randomUUID();
    const timestamp = now();
    const job = {
      jobId,
      accountId: request.accountId,
      state: 'queued',
      format: request.format,
      directory: request.outputDirectory,
      createdAtUnixMs: timestamp,
      updatedAtUnixMs: timestamp,
      items: request.conversationIds.map(conversationId => ({ conversationId, name: conversationId, state: 'pending', phase: 'reading', messagesDone: 0n, messagesTotal: undefined, mediaSaved: 0n, mediaFailed: 0n, path: '', mediaManifestPath: '', errorCode: '', unchanged: false, mediaFound: undefined, mediaSettled: undefined, mediaIndexing: false })),
      cancelRequested: false,
    };
    jobs.set(jobId, { job, request });
    void persist().catch(() => {});
    const execution = run(job, request).catch(failure => {
      job.errorCode = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : 'CHAT_EXPORT_FAILED';
      setState(job, 'failed');
      job.finishedAtUnixMs = now();
      void persist().catch(() => {});
    });
    active.add(execution);
    execution.finally(() => active.delete(execution)).catch(() => {});
    return { jobId };
  }

  function list(accountId) {
    if (typeof accountId !== 'string' || !accountId.trim()) fail('CHAT_EXPORT_REQUEST_INVALID');
    return [...jobs.values()].filter(entry => entry.job.accountId === accountId).map(entry => cloneJob(entry.job));
  }

  function watch(jobId) {
    if (typeof jobId !== 'string' || !jobId || !jobs.has(jobId)) fail('CHAT_EXPORT_JOB_NOT_FOUND');
    return cloneJob(jobs.get(jobId).job);
  }

  function cancel(jobId) {
    if (typeof jobId !== 'string' || !jobId || !jobs.has(jobId)) fail('CHAT_EXPORT_JOB_NOT_FOUND');
    const job = jobs.get(jobId).job;
    if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(job.state)) return {};
    job.cancelRequested = true;
    if (job.state === 'running') setState(job, 'canceling');
    else stamp(job);
    void persist().catch(() => {});
    return {};
  }

  async function removeAccount(accountId) {
    if (typeof accountId !== 'string' || !accountId.trim()) fail('CHAT_EXPORT_REQUEST_INVALID');
    const entries = [...jobs.values()].filter(entry => entry.job.accountId === accountId);
    for (const entry of entries) {
      entry.job.cancelRequested = true;
      if (entry.job.state === 'running') setState(entry.job, 'canceling');
    }
    await Promise.allSettled([...active]);
    for (const entry of entries) jobs.delete(entry.job.jobId);
    await persist();
  }

  return {
    capabilities: () => ({ messageTypes: [], mediaKinds: [], voiceTranscripts: false, maxConversations: MAX_CONVERSATIONS, options: [], xlsxColumns: [] }),
    start,
    list,
    watch,
    cancel,
    removeAccount,
    close: async () => { closed = true; await Promise.allSettled([...active]); await writeQueue; },
  };
}

module.exports = { createChatExportJobs, safeConversationFileName, validateRequest, MAX_CONVERSATIONS, STATE_FILE };
