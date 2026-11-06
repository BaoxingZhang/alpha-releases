'use strict';

const crypto = require('node:crypto');

const STATES = Object.freeze({ running: 1, completed: 2, canceled: 3, failed: 4 });
const MAX_JOBS = 8;
const MAX_PROFILE_BYTES = 512 * 1024;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const PROFILE_VERSION = 'alpha-persona-v2';

function fail(code) { throw new Error(code); }
function errorCode(failure, fallback) {
  return /^[A-Z][A-Z0-9_]{1,95}$/.test(failure?.message || '') ? failure.message : fallback;
}

function cloneJob(job) {
  const value = {
    buildId: job.buildId,
    state: job.state,
    perspective: job.perspective,
    profileVersion: PROFILE_VERSION,
    pagesRead: job.pagesRead,
    sourceMessagesRead: BigInt(job.sourceMessagesRead),
    sourceBytesRead: BigInt(job.sourceBytesRead),
    sourceTruncated: job.sourceTruncated,
    expiresAtUnixMs: BigInt(job.expiresAtUnixMs)
  };
  if (job.state === STATES.completed) {
    value.result = {
      profileJson: job.profileJson.slice(),
      profileDigest: job.profileDigest.slice(),
      pagesRead: job.pagesRead,
      sourceMessagesRead: BigInt(job.sourceMessagesRead),
      sourceBytesRead: BigInt(job.sourceBytesRead),
      sourceTruncated: job.sourceTruncated,
      pageLimit: job.pageLimit,
      messageLimit: job.messageLimit
    };
  }
  return value;
}

function createPersonaProfileJobs({ runProfile, now = () => BigInt(Date.now()), ttlMs = DEFAULT_TTL_MS, maxJobs = MAX_JOBS } = {}) {
  if (typeof runProfile !== 'function') throw new TypeError('runProfile must be a function');
  if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > 24 * 60 * 60 * 1000) throw new TypeError('ttlMs must be bounded');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > MAX_JOBS) throw new TypeError('maxJobs must be bounded');
  const jobs = new Map();
  const active = new Set();
  let closed = false;

  function evict() {
    const timestamp = now();
    for (const [id, job] of jobs) if (job.expiresAtUnixMs <= timestamp && !active.has(job.promise)) jobs.delete(id);
    if (jobs.size < maxJobs) return;
    for (const [id, job] of jobs) {
      if (job.state !== STATES.running && !active.has(job.promise)) jobs.delete(id);
      if (jobs.size < maxJobs) break;
    }
  }

  async function run(job, request) {
    try {
      const result = await runProfile(request, { isCanceled: () => job.cancelRequested });
      if (job.cancelRequested) {
        job.state = STATES.canceled;
        job.errorCode = 'PERSONA_PROFILE_CANCELED';
        return;
      }
      if (!result || !(result.profileJson instanceof Uint8Array) || !(result.profileDigest instanceof Uint8Array) || result.profileDigest.length !== 32) fail('PERSONA_PROFILE_RESULT_INVALID');
      if (result.profileJson.length < 1 || result.profileJson.length > MAX_PROFILE_BYTES) fail('PERSONA_PROFILE_TOO_LARGE');
      if (!Number.isSafeInteger(result.pagesRead) || result.pagesRead < 0 || !Number.isSafeInteger(result.pageLimit) || result.pageLimit < 1 || result.pageLimit > 1000 || !Number.isSafeInteger(result.messageLimit) || result.messageLimit < 1 || result.messageLimit > 100000) fail('PERSONA_PROFILE_RESULT_INVALID');
      if (typeof result.sourceMessagesRead !== 'bigint' || result.sourceMessagesRead < 0n || typeof result.sourceBytesRead !== 'bigint' || result.sourceBytesRead < 0n || typeof result.sourceTruncated !== 'boolean') fail('PERSONA_PROFILE_RESULT_INVALID');
      job.profileJson = result.profileJson.slice();
      job.profileDigest = result.profileDigest.slice();
      job.pagesRead = result.pagesRead;
      job.sourceMessagesRead = result.sourceMessagesRead;
      job.sourceBytesRead = result.sourceBytesRead;
      job.sourceTruncated = result.sourceTruncated;
      job.pageLimit = result.pageLimit;
      job.messageLimit = result.messageLimit;
      job.state = STATES.completed;
    } catch (failure) {
      job.errorCode = errorCode(failure, job.cancelRequested ? 'PERSONA_PROFILE_CANCELED' : 'PERSONA_PROFILE_FAILED');
      job.state = job.cancelRequested || job.errorCode === 'PERSONA_PROFILE_CANCELED' ? STATES.canceled : STATES.failed;
    }
  }

  function start(request) {
    if (closed) fail('PERSONA_PROFILE_ENGINE_CLOSED');
    if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.accountId !== 'string' || !request.accountId.trim()) fail('PERSONA_PROFILE_REQUEST_INVALID');
    if (![1, 2].includes(request.perspective)) fail('PERSONA_PERSPECTIVE_INVALID');
    evict();
    if (jobs.size >= maxJobs) fail('PERSONA_PROFILE_TOO_MANY_BUILDS');
    const expiresAtUnixMs = now() + BigInt(ttlMs);
    const buildId = `persona-${crypto.randomUUID()}`;
    const job = { buildId, accountId: request.accountId, perspective: request.perspective, state: STATES.running, pagesRead: 0, sourceMessagesRead: 0n, sourceBytesRead: 0n, sourceTruncated: false, pageLimit: request.maxPages, messageLimit: request.maxMessages, profileJson: new Uint8Array(0), profileDigest: new Uint8Array(0), errorCode: '', cancelRequested: false, expiresAtUnixMs, promise: null };
    jobs.set(buildId, job);
    job.promise = run(job, request);
    active.add(job.promise);
    job.promise.finally(() => active.delete(job.promise)).catch(() => {});
    return { buildId, perspective: request.perspective, profileVersion: PROFILE_VERSION, expiresAtUnixMs };
  }

  function find(buildId) {
    if (typeof buildId !== 'string' || !/^[A-Za-z0-9._-]{1,256}$/.test(buildId)) fail('PERSONA_BUILD_ID_INVALID');
    evict();
    const job = jobs.get(buildId);
    if (!job) fail('PERSONA_PROFILE_NOT_FOUND');
    return job;
  }

  return {
    start,
    watch: buildId => cloneJob(find(buildId)),
    cancel(buildId) {
      const job = find(buildId);
      if (job.state !== STATES.running) return { buildId: job.buildId, cancellationRequested: false, state: job.state };
      job.cancelRequested = true;
      // Cancellation is cooperative: the worker may still be terminating (or
      // the child analysis process may still be draining). Report the current
      // running state until the job reaches its terminal canceled state so the
      // response cannot claim completion before watch observes it.
      return { buildId: job.buildId, cancellationRequested: true, state: job.state };
    },
    async removeAccount(accountId) {
      for (const job of jobs.values()) if (job.accountId === accountId && job.state === STATES.running) job.cancelRequested = true;
      await Promise.allSettled([...active]);
      for (const [id, job] of jobs) if (job.accountId === accountId) jobs.delete(id);
    },
    close: async () => {
      closed = true;
      for (const job of jobs.values()) if (job.state === STATES.running) job.cancelRequested = true;
      await Promise.allSettled([...active]);
    },
    states: STATES
  };
}

module.exports = { createPersonaProfileJobs, PERSONA_PROFILE_STATES: STATES, PROFILE_VERSION, MAX_PROFILE_BYTES };
