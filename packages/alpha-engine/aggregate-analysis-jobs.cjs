'use strict';

const crypto = require('node:crypto');

const STATES = Object.freeze({ running: 1, completed: 2, failed: 3, canceled: 4 });
const MAX_JOBS = 32;
const MAX_REPORT_BYTES = 64 * 1024 * 1024;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function fail(code) { throw new Error(code); }
function errorCode(failure, fallback) {
  return /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : fallback;
}
function cloneJob(job) {
  return {
    analysisId: job.analysisId,
    state: job.state,
    conversationsDone: job.conversationsDone,
    conversationsTotal: job.conversationsTotal,
    conversationsFailed: job.conversationsFailed,
    reportJson: job.reportJson.slice(),
    errorCode: job.errorCode
  };
}

function createAggregateAnalysisJobs({ runAnalysis, now = () => BigInt(Date.now()), ttlMs = DEFAULT_TTL_MS, maxJobs = MAX_JOBS } = {}) {
  if (typeof runAnalysis !== 'function') throw new TypeError('runAnalysis must be a function');
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 24 * 60 * 60 * 1000) throw new TypeError('ttlMs must be bounded');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > MAX_JOBS) throw new TypeError('maxJobs must be bounded');
  const jobs = new Map();
  const active = new Set();
  let closed = false;

  function evict() {
    const timestamp = now();
    for (const [id, job] of jobs) {
      if (job.expiresAtUnixMs <= timestamp && !active.has(job.promise)) jobs.delete(id);
    }
    if (jobs.size < maxJobs) return;
    for (const [id, job] of jobs) {
      if (job.state !== STATES.running && !active.has(job.promise)) jobs.delete(id);
      if (jobs.size < maxJobs) break;
    }
  }

  async function run(job, request) {
    try {
      const result = await runAnalysis(request, {
        isCanceled: () => job.cancelRequested,
        conversationsTotal: job.conversationsTotal
      });
      if (job.cancelRequested) {
        job.state = STATES.canceled;
        job.errorCode = 'ANALYSIS_CANCELED';
        return;
      }
      if (!(result?.reportJson instanceof Uint8Array)) fail('ANALYSIS_REPORT_INVALID');
      const bytes = result.reportJson;
      if (bytes.length > MAX_REPORT_BYTES) fail('ANALYSIS_REPORT_TOO_LARGE');
      job.reportJson = bytes.slice();
      const done = result.conversationsDone === undefined ? job.conversationsTotal : result.conversationsDone;
      const failed = result.conversationsFailed === undefined ? 0 : result.conversationsFailed;
      if (!Number.isInteger(done) || done < 0 || done > job.conversationsTotal || !Number.isInteger(failed) || failed < 0 || failed > job.conversationsTotal || done + failed > job.conversationsTotal) fail('ANALYSIS_PROGRESS_INVALID');
      job.conversationsDone = done;
      job.conversationsFailed = failed;
      job.state = STATES.completed;
    } catch (failure) {
      job.errorCode = errorCode(failure, job.cancelRequested ? 'ANALYSIS_CANCELED' : 'ANALYSIS_FAILED');
      job.state = job.cancelRequested || job.errorCode === 'ANALYSIS_CANCELED' ? STATES.canceled : STATES.failed;
    }
  }

  function start(request, conversationsTotal = 0) {
    if (closed) fail('ANALYSIS_ENGINE_CLOSED');
    if (!request || typeof request !== 'object' || Array.isArray(request)) fail('ANALYSIS_REQUEST_INVALID');
    if (typeof request.accountId !== 'string' || !request.accountId.trim() || request.accountId.length > 256 || request.accountId.includes('\0')) fail('ANALYSIS_REQUEST_INVALID');
    if (!Number.isInteger(conversationsTotal) || conversationsTotal < 0 || conversationsTotal > 10000) fail('ANALYSIS_REQUEST_INVALID');
    evict();
    if (jobs.size >= maxJobs) fail('ANALYSIS_TOO_MANY_JOBS');
    const timestamp = now();
    const analysisId = crypto.randomUUID();
    const job = {
      analysisId,
      accountId: request.accountId,
      state: STATES.running,
      conversationsDone: 0,
      conversationsTotal,
      conversationsFailed: 0,
      reportJson: new Uint8Array(0),
      errorCode: '',
      cancelRequested: false,
      expiresAtUnixMs: timestamp + BigInt(ttlMs),
      promise: null
    };
    jobs.set(analysisId, job);
    job.promise = run(job, request);
    active.add(job.promise);
    job.promise.finally(() => active.delete(job.promise)).catch(() => {});
    return { analysisId, conversationsTotal, expiresAtUnixMs: job.expiresAtUnixMs };
  }

  function find(analysisId) {
    if (typeof analysisId !== 'string' || !analysisId || analysisId.length > 128) fail('ANALYSIS_ID_INVALID');
    evict();
    const job = jobs.get(analysisId);
    if (!job) fail('ANALYSIS_NOT_FOUND');
    return job;
  }

  function watch(analysisId) { return cloneJob(find(analysisId)); }

  function cancel(analysisId) {
    const job = find(analysisId);
    if (job.state !== STATES.running) return { canceled: false };
    job.cancelRequested = true;
    return { canceled: true };
  }

  return {
    start,
    watch,
    cancel,
    close: async () => {
      closed = true;
      for (const job of jobs.values()) if (job.state === STATES.running) job.cancelRequested = true;
      await Promise.allSettled([...active]);
    },
    states: STATES
  };
}

module.exports = { createAggregateAnalysisJobs, AGGREGATE_ANALYSIS_STATES: STATES, MAX_REPORT_BYTES };
