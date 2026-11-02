'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const FORMATS = new Set(['html', 'json', 'markdown', 'txt']);
const MAX_AUTHORS = 500;
const MAX_JOBS = 64;
const STATE_FILE = 'moments-export-jobs.v1.json';
const MAX_STATE_BYTES = 16 * 1024 * 1024;
const JOB_STATES = new Set(['queued', 'running', 'canceling', 'completed', 'completed_with_errors', 'failed', 'canceled']);
const ITEM_STATES = new Set(['pending', 'running', 'completed', 'failed', 'canceled']);

function fail(code) { throw new Error(code); }
function jsonSafe(value) { return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item); }
function wireInteger(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,18})$/.test(value)) fail('MOMENT_EXPORT_STATE_INVALID');
  return BigInt(value);
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
    items: job.items.map(item => ({ ...item })),
    ...(job.errorCode ? { errorCode: job.errorCode } : {}),
    kind: 'moments'
  };
}
function restoreJob(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.jobId !== 'string' || !raw.jobId || typeof raw.accountId !== 'string' || !raw.accountId || !JOB_STATES.has(raw.state) || !FORMATS.has(raw.format) || typeof raw.directory !== 'string' || !path.isAbsolute(raw.directory) || !Array.isArray(raw.items) || raw.items.length !== 1) fail('MOMENT_EXPORT_STATE_INVALID');
  const item = raw.items[0];
  if (!item || item.conversationId !== 'moments' || typeof item.name !== 'string' || !ITEM_STATES.has(item.state) || typeof item.phase !== 'string' || typeof item.path !== 'string' || typeof item.errorCode !== 'string') fail('MOMENT_EXPORT_STATE_INVALID');
  const job = {
    jobId: raw.jobId,
    accountId: raw.accountId,
    state: raw.state,
    format: raw.format,
    directory: raw.directory,
    createdAtUnixMs: wireInteger(raw.createdAtUnixMs),
    updatedAtUnixMs: wireInteger(raw.updatedAtUnixMs),
    ...(raw.finishedAtUnixMs === undefined ? {} : { finishedAtUnixMs: wireInteger(raw.finishedAtUnixMs) }),
    items: [{ ...item, messagesDone: wireInteger(item.messagesDone), ...(item.messagesTotal === undefined ? {} : { messagesTotal: wireInteger(item.messagesTotal) }), mediaSaved: wireInteger(item.mediaSaved), mediaFailed: wireInteger(item.mediaFailed) }]
  };
  if (['queued', 'running', 'canceling'].includes(job.state)) {
    job.state = 'failed';
    job.errorCode = 'MOMENT_EXPORT_PROCESS_RESTARTED';
    job.finishedAtUnixMs = job.updatedAtUnixMs;
    if (['pending', 'running'].includes(job.items[0].state)) {
      job.items[0].state = 'failed';
      job.items[0].errorCode = 'MOMENT_EXPORT_PROCESS_RESTARTED';
    }
  }
  return job;
}
function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('MOMENT_EXPORT_REQUEST_INVALID');
  if (typeof request.accountId !== 'string' || !request.accountId.trim() || request.accountId.length > 256 || request.accountId.includes('\0')) fail('MOMENT_EXPORT_REQUEST_INVALID');
  const format = typeof request.format === 'string' ? request.format.toLowerCase() : '';
  if (!FORMATS.has(format)) fail('MOMENT_EXPORT_FORMAT_UNSUPPORTED');
  if (typeof request.outputDirectory !== 'string' || !path.isAbsolute(request.outputDirectory) || !request.outputDirectory.trim() || request.outputDirectory.length > 4096 || /[\u0000-\u001f\u007f]/.test(request.outputDirectory)) fail('MOMENT_EXPORT_REQUEST_INVALID');
  if (!Array.isArray(request.usernames) || request.usernames.length > MAX_AUTHORS) fail('MOMENT_EXPORT_REQUEST_INVALID');
  const seen = new Set();
  const usernames = request.usernames.map(username => {
    if (typeof username !== 'string' || !username || username.length > 256 || username.includes('\0') || seen.has(username)) fail('MOMENT_EXPORT_REQUEST_INVALID');
    seen.add(username);
    return username;
  });
  if (typeof request.keyword !== 'string' || request.keyword.length > 512 || request.keyword.includes('\0') || request.keyword.trim() !== request.keyword) fail('MOMENT_EXPORT_REQUEST_INVALID');
  for (const field of ['startTimeUnixMs', 'endTimeUnixMs']) if (request[field] !== undefined && (typeof request[field] !== 'bigint' || request[field] < 0n)) fail('MOMENT_EXPORT_REQUEST_INVALID');
  if (request.startTimeUnixMs !== undefined && request.endTimeUnixMs !== undefined && request.startTimeUnixMs > request.endTimeUnixMs) fail('MOMENT_EXPORT_REQUEST_INVALID');
  if (!Array.isArray(request.mediaKinds) || request.mediaKinds.length > 3 || request.mediaKinds.some(kind => typeof kind !== 'string' || !['image', 'video', 'live_photo'].includes(kind) || request.mediaKinds.indexOf(kind) !== request.mediaKinds.lastIndexOf(kind))) fail('MOMENT_EXPORT_REQUEST_INVALID');
  if (!Number.isInteger(request.utcOffsetMinutes) || request.utcOffsetMinutes < -720 || request.utcOffsetMinutes > 840) fail('MOMENT_EXPORT_REQUEST_INVALID');
  return { accountId: request.accountId.trim(), format, outputDirectory: path.resolve(request.outputDirectory), usernames, keyword: request.keyword, ...(request.startTimeUnixMs === undefined ? {} : { startTimeUnixMs: request.startTimeUnixMs }), ...(request.endTimeUnixMs === undefined ? {} : { endTimeUnixMs: request.endTimeUnixMs }), mediaKinds: [...request.mediaKinds], utcOffsetMinutes: request.utcOffsetMinutes };
}
function safeMomentFileName(accountId, format) {
  const suffix = crypto.createHash('sha256').update(`${accountId}\0moments`).digest('hex').slice(0, 12);
  return `moments-${suffix}.${format === 'markdown' ? 'md' : format}`;
}
function createMomentsExportJobs({ runExport, now = () => BigInt(Date.now()), maxJobs = MAX_JOBS, stateDir = '' } = {}) {
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
      const temporary = path.join(stateDir, `.moments-export-jobs-${crypto.randomUUID()}.tmp`);
      try {
        await fs.promises.writeFile(temporary, jsonSafe(snapshot) + '\n', { flag: 'wx', mode: 0o600 });
        await fs.promises.chmod(temporary, 0o600);
        await fs.promises.rename(temporary, path.join(stateDir, STATE_FILE));
      } finally { await fs.promises.rm(temporary, { force: true }).catch(() => {}); }
    });
    return writeQueue;
  }
  function load() {
    if (!stateDir) return;
    try {
      const fd = fs.openSync(path.join(stateDir, STATE_FILE), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > MAX_STATE_BYTES || (stat.mode & 0o077)) fail('MOMENT_EXPORT_STATE_INVALID');
        const parsed = JSON.parse(fs.readFileSync(fd, 'utf8'));
        if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.jobs) || parsed.jobs.length > maxJobs) fail('MOMENT_EXPORT_STATE_INVALID');
        for (const raw of parsed.jobs) { const job = restoreJob(raw); jobs.set(job.jobId, { job, request: null }); }
      } finally { fs.closeSync(fd); }
    } catch (failure) { if (failure.code !== 'ENOENT') throw failure.message === 'MOMENT_EXPORT_STATE_INVALID' ? failure : new Error('MOMENT_EXPORT_STATE_INVALID'); }
    void persist().catch(() => {});
  }
  load();
  function stamp(job) { job.updatedAtUnixMs = now(); }
  function setState(job, state) { job.state = state; stamp(job); }
  async function run(job, request) {
    if (job.state !== 'queued') return;
    setState(job, 'running');
    await persist();
    const item = job.items[0];
    if (job.cancelRequested) { item.state = 'canceled'; setState(job, 'canceled'); job.finishedAtUnixMs = now(); await persist(); return; }
    item.state = 'running'; item.phase = 'reading'; stamp(job); await persist();
    const destinationPath = path.join(request.outputDirectory, safeMomentFileName(request.accountId, request.format));
    try {
      const result = await runExport({ ...request, destinationPath, isCanceled: () => Boolean(job.cancelRequested) });
      if (job.cancelRequested) { item.state = 'canceled'; item.errorCode = 'MOMENT_EXPORT_CANCELED'; }
      else { item.phase = 'writing'; item.state = 'completed'; item.messagesDone = BigInt(result.itemCount ?? 0); item.messagesTotal = item.messagesDone; item.path = result.destinationPath || destinationPath; item.mediaSaved = BigInt(result.mediaIncluded ?? 0); item.mediaFailed = BigInt(result.mediaFailed ?? 0); }
    } catch (failure) { item.state = job.cancelRequested ? 'canceled' : 'failed'; item.errorCode = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : 'MOMENT_EXPORT_ITEM_FAILED'; }
    stamp(job); await persist();
    if (job.cancelRequested) setState(job, 'canceled'); else if (item.state === 'failed') setState(job, 'completed_with_errors'); else setState(job, 'completed');
    job.finishedAtUnixMs = now(); stamp(job); await persist();
  }
  function start(raw) {
    if (closed) fail('MOMENT_EXPORT_ENGINE_CLOSED');
    const request = validateRequest(raw);
    if (jobs.size >= maxJobs) {
      const terminal = [...jobs.entries()].filter(([, entry]) => ['completed', 'completed_with_errors', 'failed', 'canceled'].includes(entry.job.state)).sort((a, b) => Number(a[1].job.updatedAtUnixMs - b[1].job.updatedAtUnixMs));
      while (jobs.size >= maxJobs && terminal.length) jobs.delete(terminal.shift()[0]);
    }
    if (jobs.size >= maxJobs) fail('MOMENT_EXPORT_TOO_MANY_JOBS');
    const jobId = crypto.randomUUID();
    const timestamp = now();
    const job = { jobId, accountId: request.accountId, state: 'queued', format: request.format, directory: request.outputDirectory, createdAtUnixMs: timestamp, updatedAtUnixMs: timestamp, items: [{ conversationId: 'moments', name: '朋友圈', state: 'pending', phase: 'reading', messagesDone: 0n, messagesTotal: undefined, mediaSaved: 0n, mediaFailed: 0n, path: '', mediaManifestPath: '', errorCode: '', unchanged: false, mediaFound: undefined, mediaSettled: undefined, mediaIndexing: false }], cancelRequested: false };
    jobs.set(jobId, { job, request });
    void persist().catch(() => {});
    const execution = run(job, request).catch(failure => { job.errorCode = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : 'MOMENT_EXPORT_FAILED'; setState(job, 'failed'); job.finishedAtUnixMs = now(); void persist().catch(() => {}); });
    active.add(execution); execution.finally(() => active.delete(execution)).catch(() => {});
    return { jobId };
  }
  function list(accountId) { if (typeof accountId !== 'string' || !accountId.trim()) fail('MOMENT_EXPORT_REQUEST_INVALID'); return [...jobs.values()].filter(entry => entry.job.accountId === accountId).map(entry => cloneJob(entry.job)); }
  function watch(jobId) { if (typeof jobId !== 'string' || !jobId || !jobs.has(jobId)) fail('CHAT_EXPORT_JOB_NOT_FOUND'); return cloneJob(jobs.get(jobId).job); }
  function cancel(jobId) { if (typeof jobId !== 'string' || !jobId || !jobs.has(jobId)) fail('CHAT_EXPORT_JOB_NOT_FOUND'); const job = jobs.get(jobId).job; if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(job.state)) return {}; job.cancelRequested = true; if (job.state === 'running') setState(job, 'canceling'); else stamp(job); void persist().catch(() => {}); return {}; }
  async function removeAccount(accountId) {
    if (typeof accountId !== 'string' || !accountId.trim()) fail('MOMENT_EXPORT_REQUEST_INVALID');
    const entries = [...jobs.values()].filter(entry => entry.job.accountId === accountId);
    for (const entry of entries) {
      entry.job.cancelRequested = true;
      if (entry.job.state === 'running') setState(entry.job, 'canceling');
    }
    await Promise.allSettled([...active]);
    for (const entry of entries) jobs.delete(entry.job.jobId);
    await persist();
  }
  return { start, list, watch, cancel, removeAccount, close: async () => { closed = true; await Promise.allSettled([...active]); await writeQueue; } };
}
module.exports = { createMomentsExportJobs, safeMomentFileName, validateRequest, FORMATS, MAX_AUTHORS, STATE_FILE };
