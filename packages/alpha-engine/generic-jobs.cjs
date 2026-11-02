'use strict';

// The recovered Alpha protocol exposes a generic job surface in addition to
// the newer chat-export surface.  The independent backend only has verified
// local export jobs, so this adapter deliberately maps those snapshots to the
// generic wire shape.  It does not claim compatibility with native jobs,
// leases, remote notifications, or a durable event log.

const MAX_JOB_ID_BYTES = 128;
const MAX_REASON_BYTES = 128;
const TERMINAL = new Set(['canceled', 'completed', 'completed_with_errors', 'failed']);

const STATE_CODES = Object.freeze({
  queued: 1,
  running: 3,
  canceling: 8,
  canceled: 9,
  completed: 10,
  completed_with_errors: 11,
  failed: 12
});

const PHASE_CODES = Object.freeze({
  preparing: 1,
  processing: 5,
  rendering: 6,
  packaging: 7,
  finalizing: 8,
  waiting: 9
});

function fail(code) { throw new Error(code); }

function validText(value, max, code) {
  if (typeof value !== 'string' || value.length < 1 || Buffer.byteLength(value, 'utf8') > max || value.includes('\0')) fail(code);
  return value;
}

function asBigInt(value, fallback = 0n) {
  return typeof value === 'bigint' && value >= 0n ? value : fallback;
}

function stateCode(state) {
  return STATE_CODES[state] || 0;
}

function phaseCode(snapshot) {
  if (snapshot.state === 'queued') return PHASE_CODES.preparing;
  if (TERMINAL.has(snapshot.state)) return PHASE_CODES.finalizing;
  if (snapshot.state === 'canceling') return PHASE_CODES.waiting;
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  if (items.some(item => item?.phase === 'writing')) return PHASE_CODES.packaging;
  if (items.some(item => item?.phase === 'reading')) return PHASE_CODES.processing;
  return PHASE_CODES.processing;
}

function progress(snapshot, phase) {
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const total = BigInt(items.length);
  const completed = BigInt(items.filter(item => ['completed', 'failed', 'canceled'].includes(item?.state)).length);
  return { phase, completedItems: completed, totalItems: total, messageKey: 'INDEPENDENT_EXPORT_PROGRESS' };
}

// The export managers update updatedAtUnixMs for most transitions, but an
// observation can happen within the same millisecond as a child item update.
// Keep a bounded, deterministic fingerprint of the fields exposed in the
// generic progress event so that a cursor still advances when item progress
// changes without a timestamp tick.  Paths and directory names are omitted
// because they are artifacts, not generic job state.
function progressFingerprint(snapshot, phase) {
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  return JSON.stringify({
    state: snapshot.state,
    phase,
    errorCode: typeof snapshot.errorCode === 'string' ? snapshot.errorCode : '',
    items: items.map(item => ({
      state: item?.state ?? '',
      phase: item?.phase ?? '',
      messagesDone: typeof item?.messagesDone === 'bigint' ? item.messagesDone.toString() : '',
      messagesTotal: typeof item?.messagesTotal === 'bigint' ? item.messagesTotal.toString() : '',
      mediaSaved: typeof item?.mediaSaved === 'bigint' ? item.mediaSaved.toString() : '',
      mediaFailed: typeof item?.mediaFailed === 'bigint' ? item.mediaFailed.toString() : '',
      mediaFound: typeof item?.mediaFound === 'bigint' ? item.mediaFound.toString() : '',
      mediaSettled: typeof item?.mediaSettled === 'bigint' ? item.mediaSettled.toString() : '',
      errorCode: typeof item?.errorCode === 'string' ? item.errorCode : ''
    }))
  });
}

function errorFor(snapshot) {
  const itemError = Array.isArray(snapshot.items)
    ? snapshot.items.find(item => typeof item?.errorCode === 'string' && item.errorCode)
    : undefined;
  const code = typeof snapshot.errorCode === 'string' && snapshot.errorCode
    ? snapshot.errorCode
    : itemError?.errorCode;
  if (!code) return undefined;
  return {
    code,
    category: 'independent.job',
    retryable: false,
    userMessageKey: code,
    diagnosticId: ''
  };
}

function createGenericJobs({ chatExportJobs, momentExportJobs, recordExportJobs, now = () => BigInt(Date.now()) } = {}) {
  if (!chatExportJobs || typeof chatExportJobs.watch !== 'function' || typeof chatExportJobs.cancel !== 'function') throw new TypeError('chatExportJobs is required');
  if (momentExportJobs && (typeof momentExportJobs.watch !== 'function' || typeof momentExportJobs.cancel !== 'function')) throw new TypeError('momentExportJobs is invalid');
  if (!recordExportJobs || typeof recordExportJobs.watch !== 'function' || typeof recordExportJobs.cancel !== 'function') throw new TypeError('recordExportJobs is required');
  const observations = new Map();

  function read(manager, jobId) {
    try {
      return manager.watch(jobId);
    } catch (failure) {
      if (failure?.message === 'CHAT_EXPORT_JOB_NOT_FOUND' || failure?.message === 'JOB_NOT_FOUND') return null;
      throw failure;
    }
  }

  function locate(jobId) {
    const chat = read(chatExportJobs, jobId);
    if (chat) return { manager: chatExportJobs, snapshot: chat };
    if (momentExportJobs) {
      const moments = read(momentExportJobs, jobId);
      if (moments) return { manager: momentExportJobs, snapshot: moments };
    }
    const records = read(recordExportJobs, jobId);
    if (records) return { manager: recordExportJobs, snapshot: records };
    fail('JOB_NOT_FOUND');
  }

  function observe(snapshot) {
    const phase = phaseCode(snapshot);
    const currentState = stateCode(snapshot.state);
    const previous = observations.get(snapshot.jobId);
    const updatedAt = asBigInt(snapshot.updatedAtUnixMs, asBigInt(snapshot.createdAtUnixMs, previous?.updatedAt ?? now()));
    const fingerprint = progressFingerprint(snapshot, phase);
    const genericError = errorFor(snapshot);
    const changed = !previous || previous.state !== currentState || previous.phase !== phase || previous.updatedAt !== updatedAt || previous.fingerprint !== fingerprint;
    const eventSeq = changed ? (previous?.eventSeq ?? 0n) + 1n : previous.eventSeq;
    const previousState = previous?.state ?? 0;
    const record = { state: currentState, phase, eventSeq, updatedAt, fingerprint };
    observations.set(snapshot.jobId, record);
    const summary = {
      jobId: snapshot.jobId,
      kind: 1,
      state: currentState,
      phase,
      latestEventSeq: eventSeq,
      createdAtUnixMs: asBigInt(snapshot.createdAtUnixMs),
      updatedAtUnixMs: updatedAt,
      finishedAtUnixMs: asBigInt(snapshot.finishedAtUnixMs),
      ...(genericError ? { error: genericError } : {})
    };
    const event = {
      jobId: snapshot.jobId,
      eventSeq,
      createdAtUnixMs: updatedAt,
      stateChanged: {
        previous: previousState,
        current: currentState,
        phase,
        reasonCode: errorFor(snapshot)?.code || (snapshot.state === 'canceled' ? 'cancel_requested' : 'independent_snapshot')
      },
      progress: progress(snapshot, phase),
      ...(genericError ? { notice: { severity: 2, code: genericError.code, messageKey: genericError.code } } : {})
    };
    return { summary, event, done: TERMINAL.has(snapshot.state) };
  }

  function getJob(request) {
    const jobId = validText(request?.jobId, MAX_JOB_ID_BYTES, 'JOB_ID_INVALID');
    return observe(locate(jobId).snapshot).summary;
  }

  function watchJob(request) {
    const jobId = validText(request?.jobId, MAX_JOB_ID_BYTES, 'JOB_ID_INVALID');
    const afterEventSeq = request?.afterEventSeq === undefined ? 0n : request.afterEventSeq;
    if (typeof afterEventSeq !== 'bigint' || afterEventSeq < 0n || afterEventSeq > 18446744073709551615n) fail('JOB_CURSOR_INVALID');
    const observed = observe(locate(jobId).snapshot);
    return { events: observed.event.eventSeq > afterEventSeq ? [observed.event] : [], done: observed.done };
  }

  function cancelJob(request) {
    const jobId = validText(request?.jobId, MAX_JOB_ID_BYTES, 'JOB_ID_INVALID');
    if (request?.reasonCode !== undefined && (typeof request.reasonCode !== 'string' || Buffer.byteLength(request.reasonCode, 'utf8') > MAX_REASON_BYTES || request.reasonCode.includes('\0'))) fail('JOB_REASON_INVALID');
    const located = locate(jobId);
    // Existing local managers currently ignore a reason, but forward it so a
    // future manager can retain the generic cancellation audit without
    // changing this protocol adapter.
    located.manager.cancel(jobId, request?.reasonCode ?? '');
    return observe(locate(jobId).snapshot).summary;
  }

  return { getJob, watchJob, cancelJob };
}

module.exports = { createGenericJobs, MAX_JOB_ID_BYTES, MAX_REASON_BYTES };
