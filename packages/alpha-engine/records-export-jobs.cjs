'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

const FORMATS = new Set(['xlsx', 'csv', 'json']);
const CATEGORIES = new Set(['payments', 'revokes', 'calls']);
const MAX_SELECTED = 20000;
const MAX_JOBS = 64;

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
    kind: 'records'
  };
}

function safeRecordFileName(accountId, category, format) {
  const readable = category.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 64) || 'records';
  const suffix = crypto.createHash('sha256').update(`${accountId}\0${category}`).digest('hex').slice(0, 12);
  return `${readable}-${suffix}.${format}`;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (typeof request.accountId !== 'string' || !request.accountId.trim() || request.accountId.length > 256 || request.accountId.includes('\0')) fail('CHAT_EXPORT_REQUEST_INVALID');
  const format = typeof request.format === 'string' ? request.format.toLowerCase() : '';
  if (!FORMATS.has(format)) fail('RECORD_EXPORT_FORMAT_UNSUPPORTED');
  if (typeof request.outputDirectory !== 'string' || !path.isAbsolute(request.outputDirectory) || !request.outputDirectory.trim() || request.outputDirectory.length > 4096 || /[\u0000-\u001f\u007f]/.test(request.outputDirectory)) fail('CHAT_EXPORT_REQUEST_INVALID');
  if (!Array.isArray(request.categories) || request.categories.length < 1 || request.categories.length > CATEGORIES.size) fail('CHAT_EXPORT_REQUEST_INVALID');
  const seen = new Set();
  const categories = request.categories.map(selection => {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) fail('CHAT_EXPORT_REQUEST_INVALID');
    const category = selection.category;
    if (typeof category !== 'string' || !category) fail('CHAT_EXPORT_REQUEST_INVALID');
    if (!CATEGORIES.has(category)) fail('RECORD_EXPORT_CATEGORY_UNSUPPORTED');
    if (seen.has(category)) fail('CHAT_EXPORT_REQUEST_INVALID');
    seen.add(category);
    if (selection.selected !== undefined && typeof selection.selected !== 'boolean') fail('CHAT_EXPORT_REQUEST_INVALID');
    const selected = selection.selected === true;
    const recordIds = selection.recordIds === undefined ? [] : selection.recordIds;
    if (!Array.isArray(recordIds) || recordIds.length > MAX_SELECTED) fail('CHAT_EXPORT_REQUEST_INVALID');
    const ids = [];
    const idSet = new Set();
    for (const id of recordIds) {
      if (typeof id !== 'string' || !id || id.length > 2048 || id.includes('\0') || idSet.has(id)) fail('CHAT_EXPORT_REQUEST_INVALID');
      idSet.add(id); ids.push(id);
    }
    if (selected !== (ids.length > 0)) fail('CHAT_EXPORT_REQUEST_INVALID');
    return { category, recordIds: ids };
  });
  return { accountId: request.accountId.trim(), format, outputDirectory: path.resolve(request.outputDirectory), categories };
}

function createRecordExportJobs({ runExport, now = () => BigInt(Date.now()), maxJobs = MAX_JOBS } = {}) {
  if (typeof runExport !== 'function') throw new TypeError('runExport must be a function');
  const jobs = new Map();

  function stamp(job) { job.updatedAtUnixMs = now(); }
  function setState(job, state) { job.state = state; stamp(job); }

  async function run(job, request) {
    if (job.state !== 'queued') return;
    setState(job, 'running');
    for (const item of job.items) {
      if (job.cancelRequested) {
        item.state = 'canceled';
        continue;
      }
      item.state = 'running'; item.phase = 'reading'; stamp(job);
      const destinationPath = path.join(request.outputDirectory, safeRecordFileName(request.accountId, item.conversationId, request.format));
      try {
        const result = await runExport({
          accountId: request.accountId,
          category: item.conversationId,
          recordIds: item.recordIds,
          format: request.format,
          destinationPath,
          isCanceled: () => job.cancelRequested
        });
        if (job.cancelRequested) {
          item.state = 'canceled';
        } else {
          item.phase = 'writing';
          item.state = 'completed';
          item.messagesDone = BigInt(result.itemCount ?? 0);
          item.messagesTotal = item.messagesDone;
          item.path = result.destinationPath || destinationPath;
        }
      } catch (failure) {
        item.state = job.cancelRequested ? 'canceled' : 'failed';
        item.errorCode = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : 'RECORD_EXPORT_ITEM_FAILED';
      }
      stamp(job);
    }
    if (job.cancelRequested) setState(job, 'canceled');
    else if (job.items.some(item => item.state === 'failed')) setState(job, 'completed_with_errors');
    else setState(job, 'completed');
    job.finishedAtUnixMs = now();
    stamp(job);
  }

  function start(raw) {
    const request = validateRequest(raw);
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
      items: request.categories.map(({ category, recordIds }) => ({
        conversationId: category,
        name: category,
        state: 'pending',
        phase: 'reading',
        messagesDone: 0n,
        messagesTotal: undefined,
        mediaSaved: 0n,
        mediaFailed: 0n,
        path: '',
        mediaManifestPath: '',
        errorCode: '',
        unchanged: false,
        recordIds
      })),
      cancelRequested: false
    };
    jobs.set(jobId, { job, request });
    void run(job, request).catch(failure => {
      job.errorCode = /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : 'RECORD_EXPORT_FAILED';
      setState(job, 'failed');
      job.finishedAtUnixMs = now();
    });
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
    return {};
  }

  return { start, list, watch, cancel, safeRecordFileName, validateRequest };
}

module.exports = { createRecordExportJobs, safeRecordFileName, validateRequest, CATEGORIES, FORMATS, MAX_SELECTED };
