'use strict';

// Independent scheduled chat exports.  This store deliberately owns the
// schedule/run/attempt records instead of pretending that the recovered
// native scheduler is available.  It only submits formats/options supported
// by the verified independent single-export path.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const { safeConversationFileName } = require('./chat-export-jobs.cjs');
const { CHAT_FORMAT_EXTENSIONS } = require('./export-formats.cjs');

const FILE_NAME = 'chat-export-schedules.v1.json';
const MAX_PLANS = 1000;
const MAX_HISTORY = 10000;
// The scheduler is intentionally conservative. A single engine process only
// prepares a bounded number of plans per tick; each plan may still contain the
// existing 500 conversation limit. This keeps a malformed or very large state
// file from creating an unbounded burst after restart.
const MAX_SCHEDULER_PLANS_PER_TICK = 16;
const MAX_SCHEDULER_POLL_MS = 60 * 1000;
const MIN_SCHEDULER_POLL_MS = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const UUID_ZERO = '00000000-0000-0000-0000-000000000000';
const FORMATS = new Set(['json', 'markdown', 'txt', 'html', 'xlsx', ...Object.keys(CHAT_FORMAT_EXTENSIONS)]);
const RUN_STATES = new Set(['queued', 'leasing', 'starting', 'running', 'waiting_tool', 'waiting_approval', 'waiting_input', 'checkpointing', 'retry_wait', 'cancel_requested', 'canceled', 'completed', 'completed_with_errors', 'failed']);
const ATTEMPT_STATES = new Set(['queued', 'preparing', 'submitted', 'failed', 'skipped']);
const ATTEMPT_REASONS = new Set(['account_unavailable', 'plan_invalid', 'snapshot_failed', 'storage_unavailable', 'preparation_timeout', 'schedule_disabled', 'schedule_deleted', 'schedule_owner_changed', 'no_new_messages', 'destination_unavailable', 'start_failed']);

function fail(code) { throw new Error(code); }
function clone(value) { return value === undefined ? value : JSON.parse(JSON.stringify(value)); }
function isUuid(value) { return typeof value === 'string' && UUID.test(value) && value !== UUID_ZERO; }
function isText(value, max = 4096, required = true) { return typeof value === 'string' && value.length <= max && (!required || value.trim() !== '') && !value.includes('\0'); }
function nonNegativeInt(value, max = Number.MAX_SAFE_INTEGER) { return Number.isSafeInteger(value) && value >= 0 && value <= max; }
function wireTime(value, required = true) {
  if (typeof value === 'bigint') value = value.toString();
  return typeof value === 'string' && /^(?:0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= 9223372036854775807n && (!required || value !== '');
}
function safeNumber(value, max) {
  if (typeof value === 'bigint') { if (value < 0n || value > BigInt(max)) fail('CHAT_EXPORT_SCHEDULE_INVALID'); return Number(value); }
  return value;
}

function validateOptions(value) {
  if (value === null || value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const keys = ['outputDirectory', 'outputLayout', 'conflictPolicy', 'displayNamePreference', 'xlsxColumns', 'avatars', 'messageTypes', 'mediaKinds', 'voiceTranscripts', 'rangeMode'];
  if (Object.keys(value).some(key => !keys.includes(key))) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (!isText(value.outputDirectory, 4096) || !path.isAbsolute(value.outputDirectory)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const outputLayout = value.outputLayout || 'job-folder';
  if (!['job-folder', 'fixed'].includes(outputLayout)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const conflictPolicy = value.conflictPolicy === '' ? '' : value.conflictPolicy;
  if (conflictPolicy !== '' && !['keep-copies', 'overwrite', 'incremental'].includes(conflictPolicy)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (outputLayout !== 'fixed' && conflictPolicy !== '') fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (!['', 'remark', 'group-nickname', 'nickname'].includes(value.displayNamePreference)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  for (const name of ['xlsxColumns', 'messageTypes', 'mediaKinds']) {
    if (!Array.isArray(value[name]) || new Set(value[name]).size !== value[name].length || value[name].some(item => typeof item !== 'string' || item.length > 128)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  }
  if (value.avatars !== true && value.avatars !== false) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (value.voiceTranscripts !== true && value.voiceTranscripts !== false) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (!['lookback', 'since-last-success'].includes(value.rangeMode)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  // The renderer/native schema allows these fields.  They remain persisted so
  // an exported plan can be read back exactly, but the independent runner
  // fails closed when they request unavailable capabilities.
  return {
    outputDirectory: value.outputDirectory,
    outputLayout,
    conflictPolicy,
    displayNamePreference: value.displayNamePreference,
    xlsxColumns: [...value.xlsxColumns],
    avatars: value.avatars,
    messageTypes: [...value.messageTypes],
    mediaKinds: [...value.mediaKinds],
    voiceTranscripts: value.voiceTranscripts,
    rangeMode: value.rangeMode
  };
}

function validatePlan(raw, accountId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const keys = ['accountId', 'scheduleId', 'conversationId', 'formats', 'includeMedia', 'intervalSeconds', 'lookbackSeconds', 'nextRunUnixMs', 'enabled', 'createdAtUnixMs', 'updatedAtUnixMs', 'conversationIds', 'options', 'stopAtUnixMs', 'maxRuns', 'successCount', 'lastSuccessUnixMs'];
  if (Object.keys(raw).some(key => !keys.includes(key))) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (raw.accountId !== accountId || !isUuid(raw.accountId) || !isUuid(raw.scheduleId)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (!isText(raw.conversationId, 1024)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (!Array.isArray(raw.formats) || raw.formats.length !== 1 || new Set(raw.formats).size !== raw.formats.length || raw.formats.some(format => typeof format !== 'string' || !FORMATS.has(format))) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const conversationIds = raw.conversationIds === undefined || raw.conversationIds === null || Array.isArray(raw.conversationIds) && raw.conversationIds.length === 0 ? [raw.conversationId] : raw.conversationIds;
  if (!Array.isArray(conversationIds) || conversationIds.length < 1 || conversationIds.length > 500 || new Set(conversationIds).size !== conversationIds.length || conversationIds[0] !== raw.conversationId || conversationIds.some(id => !isText(id, 1024))) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  for (const name of ['includeMedia', 'enabled']) if (raw[name] !== true && raw[name] !== false) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const intervalSeconds = safeNumber(raw.intervalSeconds, 2678400), lookbackSeconds = safeNumber(raw.lookbackSeconds, 31622400);
  if (!nonNegativeInt(intervalSeconds, 2678400) || intervalSeconds < 60 || !nonNegativeInt(lookbackSeconds, 31622400) || !wireTime(raw.nextRunUnixMs) || !wireTime(raw.createdAtUnixMs) || !wireTime(raw.updatedAtUnixMs)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (raw.stopAtUnixMs !== undefined && raw.stopAtUnixMs !== null && !wireTime(raw.stopAtUnixMs)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  if (raw.lastSuccessUnixMs !== undefined && raw.lastSuccessUnixMs !== null && !wireTime(raw.lastSuccessUnixMs)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const maxRuns = raw.maxRuns === undefined ? 0 : raw.maxRuns;
  const successCount = raw.successCount === undefined ? 0 : raw.successCount;
  if (!nonNegativeInt(maxRuns, 100000) || !nonNegativeInt(successCount, 0xffffffff)) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  const options = validateOptions(raw.options);
  if (!options && conversationIds.length > 1) fail('CHAT_EXPORT_SCHEDULE_INVALID');
  return {
    accountId: raw.accountId,
    scheduleId: raw.scheduleId,
    conversationId: raw.conversationId,
    formats: [...raw.formats],
    includeMedia: raw.includeMedia,
    intervalSeconds,
    lookbackSeconds,
    nextRunUnixMs: typeof raw.nextRunUnixMs === 'bigint' ? raw.nextRunUnixMs.toString() : raw.nextRunUnixMs,
    enabled: raw.enabled,
    createdAtUnixMs: typeof raw.createdAtUnixMs === 'bigint' ? raw.createdAtUnixMs.toString() : raw.createdAtUnixMs,
    updatedAtUnixMs: typeof raw.updatedAtUnixMs === 'bigint' ? raw.updatedAtUnixMs.toString() : raw.updatedAtUnixMs,
    conversationIds: [...conversationIds],
    options,
    stopAtUnixMs: raw.stopAtUnixMs === undefined || raw.stopAtUnixMs === null ? null : typeof raw.stopAtUnixMs === 'bigint' ? raw.stopAtUnixMs.toString() : raw.stopAtUnixMs,
    maxRuns,
    successCount,
    lastSuccessUnixMs: raw.lastSuccessUnixMs === undefined || raw.lastSuccessUnixMs === null ? null : typeof raw.lastSuccessUnixMs === 'bigint' ? raw.lastSuccessUnixMs.toString() : raw.lastSuccessUnixMs
  };
}

function jsonSafe(value) {
  return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? `${item}` : item);
}
function parseState(value) {
  if (!value || typeof value !== 'object' || value.version !== 1 || !Array.isArray(value.plans) || !Array.isArray(value.runs) || !Array.isArray(value.attempts)) fail('ENGINE_STATE_INVALID');
  return { version: 1, plans: value.plans, runs: value.runs, attempts: value.attempts };
}
function toWirePlan(plan) {
  const copy = {
    ...clone(plan),
    intervalSeconds: BigInt(plan.intervalSeconds),
    lookbackSeconds: BigInt(plan.lookbackSeconds),
    nextRunUnixMs: BigInt(plan.nextRunUnixMs),
    createdAtUnixMs: BigInt(plan.createdAtUnixMs),
    updatedAtUnixMs: BigInt(plan.updatedAtUnixMs),
    ...(plan.stopAtUnixMs === null ? {} : { stopAtUnixMs: BigInt(plan.stopAtUnixMs) }),
    ...(plan.lastSuccessUnixMs === null ? {} : { lastSuccessUnixMs: BigInt(plan.lastSuccessUnixMs) })
  };
  if (plan.stopAtUnixMs === null) delete copy.stopAtUnixMs;
  if (plan.lastSuccessUnixMs === null) delete copy.lastSuccessUnixMs;
  return copy;
}
function toWireRun(run) {
  const copy = clone(run); delete copy._jobId; delete copy._occurrenceUnixMs; delete copy._endTimeUnixMs;
  copy.createdAtUnixMs = BigInt(copy.createdAtUnixMs); copy.updatedAtUnixMs = BigInt(copy.updatedAtUnixMs); if (copy.finishedAtUnixMs !== undefined) copy.finishedAtUnixMs = BigInt(copy.finishedAtUnixMs); return copy;
}
function toWireAttempt(attempt) {
  const copy = clone(attempt); delete copy._jobId; delete copy._occurrenceUnixMs; delete copy._startTimeUnixMs; delete copy._endTimeUnixMs;
  copy.occurrenceUnixMs = BigInt(copy.occurrenceUnixMs); copy.revision = BigInt(copy.revision); copy.createdAtUnixMs = BigInt(copy.createdAtUnixMs); copy.updatedAtUnixMs = BigInt(copy.updatedAtUnixMs); return copy;
}

function createChatExportSchedules({ stateDir, accountId, startExport, watchExport, now = () => BigInt(Date.now()), scheduler = true, schedulerPollMs = 1000, setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout } = {}) {
  if (!path.isAbsolute(stateDir) || typeof accountId !== 'string' || typeof startExport !== 'function' || typeof watchExport !== 'function') throw new TypeError('schedule store options invalid');
  if (typeof scheduler !== 'boolean' || typeof setTimeoutFn !== 'function' || typeof clearTimeoutFn !== 'function') throw new TypeError('schedule timer options invalid');
  if (!Number.isSafeInteger(schedulerPollMs) || schedulerPollMs < MIN_SCHEDULER_POLL_MS || schedulerPollMs > MAX_SCHEDULER_POLL_MS) throw new TypeError('schedule timer interval invalid');
  const file = path.join(stateDir, FILE_NAME);
  let state = { version: 1, plans: [], runs: [], attempts: [] };
  let writeQueue = Promise.resolve();
  let lastTimestamp = 0n;
  let stateNeedsPersist = false;
  let schedulerTimer = null;
  let schedulerClosed = false;
  let schedulerTickPromise = Promise.resolve();
  const running = new Set();
  const activeExecutions = new Set();
  const load = () => {
    try {
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 32 * 1024 * 1024 || (stat.mode & 0o077)) fail('ENGINE_STATE_INVALID');
        const loaded = parseState(JSON.parse(fs.readFileSync(fd, 'utf8')));
        // Reuse the request validator to normalize omitted optional fields and
        // reject malformed persisted plans before any BigInt conversion.
        loaded.plans = loaded.plans.map(plan => validatePlan(plan, plan.accountId));
        for (const run of loaded.runs) {
          if (!isText(run.accountId, 256) || !isUuid(run.scheduleId) || !isUuid(run.runId) || !isText(run.conversationId, 1024) || !RUN_STATES.has(run.state) || !wireTime(run.createdAtUnixMs) || !wireTime(run.updatedAtUnixMs) || (run.finishedAtUnixMs !== undefined && !wireTime(run.finishedAtUnixMs)) || !nonNegativeInt(run.artifactCount, 0xffffffff)) fail('ENGINE_STATE_INVALID');
        }
        for (const attempt of loaded.attempts) {
          if (!isText(attempt.accountId, 256) || !isUuid(attempt.scheduleId) || !isUuid(attempt.attemptId) || !isText(attempt.conversationId, 1024) || !wireTime(attempt.occurrenceUnixMs) || !ATTEMPT_STATES.has(attempt.state) || (attempt.reasonCode && !ATTEMPT_REASONS.has(attempt.reasonCode)) || (attempt.runId && !isUuid(attempt.runId)) || !nonNegativeInt(attempt.preparationCount, 0xffffffff) || !wireTime(attempt.revision) || !wireTime(attempt.createdAtUnixMs) || !wireTime(attempt.updatedAtUnixMs) || (attempt.state === 'failed' || attempt.state === 'skipped') !== Boolean(attempt.reasonCode) || (attempt.state === 'submitted') !== Boolean(attempt.runId) || BigInt(attempt.updatedAtUnixMs) < BigInt(attempt.createdAtUnixMs)) fail('ENGINE_STATE_INVALID');
        }
        state = loaded;
        // The single-run job registry is process-local.  If a process exited
        // while a scheduled run was being prepared, expose an explicit
        // retryable failure after restart instead of leaving an eternal
        // pending record that the independent backend cannot resume safely.
        let recoveredAtValue = BigInt(now());
        for (const row of [...loaded.plans, ...loaded.runs, ...loaded.attempts]) for (const field of ['createdAtUnixMs', 'updatedAtUnixMs', 'finishedAtUnixMs']) if (row[field] !== undefined && wireTime(row[field]) && BigInt(row[field]) >= recoveredAtValue) recoveredAtValue = BigInt(row[field]) + 1n;
        const recoveredAt = String(recoveredAtValue);
        for (const run of state.runs) {
          if (!['canceled', 'completed', 'completed_with_errors', 'failed'].includes(run.state)) {
            run.state = 'failed'; run.updatedAtUnixMs = recoveredAt; run.finishedAtUnixMs = recoveredAt;
            stateNeedsPersist = true;
          }
        }
        for (const attempt of state.attempts) {
          if (['queued', 'preparing', 'submitted'].includes(attempt.state)) {
            attempt.state = 'failed'; attempt.reasonCode = 'storage_unavailable'; attempt.runId = ''; attempt.updatedAtUnixMs = recoveredAt; attempt.revision = String(BigInt(attempt.revision) + 1n);
            stateNeedsPersist = true;
          }
        }
      }
      finally { fs.closeSync(fd); }
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure.message && /^ENGINE_STATE_INVALID$/.test(failure.message) ? failure : new Error('ENGINE_STATE_INVALID');
    }
  };
  load();
  for (const row of [...state.plans, ...state.runs, ...state.attempts]) {
    for (const field of ['createdAtUnixMs', 'updatedAtUnixMs', 'finishedAtUnixMs']) if (row[field] !== undefined && wireTime(row[field])) lastTimestamp = lastTimestamp > BigInt(row[field]) ? lastTimestamp : BigInt(row[field]);
  }
  function accountPlans() { return state.plans.filter(plan => plan.accountId === accountId); }
  function findPlan(id) { const plan = state.plans.find(item => item.accountId === accountId && item.scheduleId === id); if (!plan) fail('CHAT_EXPORT_SCHEDULE_NOT_FOUND'); return plan; }
  function findRun(id) { const run = state.runs.find(item => item.accountId === accountId && item.runId === id); if (!run) fail('CHAT_EXPORT_RUN_NOT_FOUND'); return run; }
  function findAttempt(id) { const attempt = state.attempts.find(item => item.accountId === accountId && item.attemptId === id); if (!attempt) fail('CHAT_EXPORT_ATTEMPT_NOT_FOUND'); return attempt; }
  function persist() {
    const snapshot = clone(state);
    writeQueue = writeQueue.then(async () => {
      const temporary = path.join(stateDir, `.chat-export-schedules-${crypto.randomUUID()}.tmp`);
      try { await fsp.writeFile(temporary, jsonSafe(snapshot) + '\n', { flag: 'wx', mode: 0o600 }); await fsp.chmod(temporary, 0o600); await fsp.rename(temporary, file); }
      finally { await fsp.rm(temporary, { force: true }).catch(() => {}); }
    });
    return writeQueue;
  }
  // Persist recovery transitions before a timer can submit a new run. The
  // queue serializes this write with all later scheduler mutations.
  if (stateNeedsPersist) void persist().catch(() => {});
  function timestamp() { let value = BigInt(now()); if (value <= lastTimestamp) value = lastTimestamp + 1n; lastTimestamp = value; return String(value); }
  function cas(plan, expected) { if (typeof expected !== 'bigint' || expected <= 0n || BigInt(plan.updatedAtUnixMs) !== expected) fail('CHAT_EXPORT_SCHEDULE_CONFLICT'); }
  function trimHistory() { if (state.runs.length > MAX_HISTORY) state.runs.splice(0, state.runs.length - MAX_HISTORY); if (state.attempts.length > MAX_HISTORY) state.attempts.splice(0, state.attempts.length - MAX_HISTORY); }
  function scheduleDue(plan, at) { return plan.maxRuns > 0 && plan.successCount >= plan.maxRuns || plan.stopAtUnixMs !== null && BigInt(plan.stopAtUnixMs) <= at; }
  function pendingFor(plan) {
    return state.runs.some(run => run.accountId === accountId && run.scheduleId === plan.scheduleId && ['queued', 'starting', 'running', 'waiting_tool', 'waiting_approval', 'waiting_input', 'checkpointing', 'retry_wait', 'cancel_requested'].includes(run.state));
  }
  function nextOccurrence(plan, at) {
    let next = BigInt(plan.nextRunUnixMs);
    const interval = BigInt(plan.intervalSeconds) * 1000n;
    if (interval <= 0n) return at;
    // The occurrence is the persisted scheduled boundary. Move the plan to
    // the first boundary after `at` so a long offline gap produces one bounded
    // catch-up run instead of replaying an unbounded backlog.
    const occurrence = next > 0n ? next : at;
    let following = occurrence + interval;
    let jumps = 0;
    while (following <= at && jumps++ < 1024) following += interval;
    if (following <= at) following = at + interval;
    plan.nextRunUnixMs = String(following);
    return occurrence;
  }
  function clonePlan(plan) { return clone(plan); }
  function runRecord(plan, conversationId, occurrence) {
    const stamp = timestamp();
    return { accountId, scheduleId: plan.scheduleId, runId: crypto.randomUUID(), conversationId, state: 'queued', createdAtUnixMs: stamp, updatedAtUnixMs: stamp, finishedAtUnixMs: undefined, artifactCount: 0, _jobId: '' , _occurrenceUnixMs: occurrence };
  }
  function attemptRecord(plan, conversationId, occurrence) {
    const stamp = timestamp();
    return { accountId, scheduleId: plan.scheduleId, attemptId: crypto.randomUUID(), conversationId, occurrenceUnixMs: occurrence, state: 'queued', reasonCode: '', runId: '', preparationCount: 0, revision: '1', createdAtUnixMs: stamp, updatedAtUnixMs: stamp, exportCenter: false, _startTimeUnixMs: '', _endTimeUnixMs: occurrence };
  }
  function setRun(run, stateName, patch = {}) { run.state = stateName; Object.assign(run, patch); run.updatedAtUnixMs = timestamp(); if (['canceled', 'completed', 'completed_with_errors', 'failed'].includes(stateName)) run.finishedAtUnixMs = run.updatedAtUnixMs; }
  function setAttempt(attempt, stateName, reason = '', runId = '') { attempt.state = stateName; attempt.reasonCode = reason; attempt.runId = runId; attempt.updatedAtUnixMs = timestamp(); attempt.revision = String(BigInt(attempt.revision) + 1n); }
  function unsupported(plan) {
    // Persist the full Alpha plan shape for truthful read-back, but only run
    // options whose file semantics are verified by the independent exporter.
    // Fixed destinations and conflict policies would otherwise be silently
    // treated as per-run folders.
    return plan.includeMedia || plan.formats.some(format => !FORMATS.has(format)) || plan.options && (
      plan.options.outputLayout !== 'job-folder' || plan.options.conflictPolicy !== '' ||
      plan.options.messageTypes.length || plan.options.mediaKinds.length || plan.options.voiceTranscripts ||
      plan.options.avatars || plan.options.xlsxColumns.length || plan.options.displayNamePreference
    );
  }
  async function execute(run, attempt, plan) {
    running.add(run.runId);
    setAttempt(attempt, 'preparing'); setRun(run, 'starting'); await persist();
    if (unsupported(plan)) {
      setAttempt(attempt, 'failed', 'start_failed'); setRun(run, 'failed'); await persist(); running.delete(run.runId); return;
    }
    const format = plan.formats[0];
    // Classic plans may omit options. Keep their fallback artifacts beside
    // the private state directory so exportConversation's stateDir exclusion
    // cannot accidentally publish into private application state.
    const root = plan.options?.outputDirectory || path.resolve(stateDir, '..', 'chat-export-artifacts');
    const outputDirectory = path.join(root, `run-${run.runId}`);
    const end = BigInt(attempt._endTimeUnixMs || attempt.occurrenceUnixMs);
    const lookback = BigInt(plan.lookbackSeconds) * 1000n;
    let start = plan.options?.rangeMode === 'since-last-success' && plan.lastSuccessUnixMs !== null ? BigInt(plan.lastSuccessUnixMs) : lookback > 0n ? end > lookback ? end - lookback : 0n : undefined;
    if (start !== undefined && start >= end) start = undefined;
    try {
      const started = await startExport({ accountId, conversationIds: [run.conversationId], format, outputDirectory, voiceTranscripts: false, includeMedia: false, ...(start === undefined ? {} : { startTimeUnixMs: start }), endTimeUnixMs: end });
      run._jobId = started.jobId; attempt.runId = run.runId; setAttempt(attempt, 'submitted', '', run.runId); setRun(run, 'running'); await persist();
      for (;;) {
        const job = await watchExport(started.jobId);
        if (!job || !['completed', 'completed_with_errors', 'failed', 'canceled'].includes(job.state)) { await new Promise(resolve => setTimeout(resolve, 10)); continue; }
        const item = job.items?.[0];
        const artifacts = item?.state === 'completed' && item.path ? 1 : 0;
        const terminal = job.state === 'completed' ? 'completed' : job.state === 'completed_with_errors' ? 'completed_with_errors' : job.state === 'canceled' ? 'canceled' : 'failed';
        run.artifactCount = artifacts; setRun(run, terminal); setAttempt(attempt, terminal === 'failed' ? 'failed' : 'submitted', terminal === 'failed' ? 'start_failed' : '', run.runId);
        if (terminal === 'completed') {
          plan.successCount += 1; plan.lastSuccessUnixMs = run._occurrenceUnixMs;
          // Automatic ticks advance nextRunUnixMs before launching work. Do
          // not let completion of a late catch-up run move it backwards to
          // occurrence+interval and immediately schedule a duplicate.
          const completionBoundary = BigInt(run._occurrenceUnixMs) + BigInt(plan.intervalSeconds) * 1000n;
          if (BigInt(plan.nextRunUnixMs) < completionBoundary) plan.nextRunUnixMs = String(completionBoundary);
          plan.updatedAtUnixMs = timestamp();
        }
        await persist(); break;
      }
    } catch (failure) {
      const reason = failure?.message === 'EXPORT_OUTPUT_EXISTS' ? 'destination_unavailable' : 'start_failed';
      setAttempt(attempt, 'failed', ATTEMPT_REASONS.has(reason) ? reason : 'start_failed'); setRun(run, 'failed'); await persist();
    } finally { running.delete(run.runId); }
  }
  function launchExecute(run, attempt, plan) {
    const promise = execute(run, attempt, plan);
    activeExecutions.add(promise);
    promise.finally(() => activeExecutions.delete(promise)).catch(() => {});
    return promise;
  }
  function records(request = {}, kind) {
    if (request.accountId !== undefined && request.accountId !== accountId) fail('ACCOUNT_NOT_FOUND');
    const scheduleId = request.scheduleId || '';
    if (scheduleId && !isUuid(scheduleId)) fail(kind === 'run' ? 'CHAT_EXPORT_SCHEDULE_INVALID' : 'CHAT_EXPORT_HISTORY_INVALID');
    const rows = state[kind].filter(row => row.accountId === accountId && (!scheduleId || row.scheduleId === scheduleId)).sort((a, b) => Number(BigInt(b.updatedAtUnixMs) - BigInt(a.updatedAtUnixMs)));
    const limit = request.limit || 100; if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('CHAT_EXPORT_HISTORY_INVALID');
    const truncated = rows.length > limit; return { records: rows.slice(0, limit).map(row => { const copy = clone(row); delete copy._jobId; delete copy._occurrenceUnixMs; delete copy._startTimeUnixMs; delete copy._endTimeUnixMs; return copy; }), truncated };
  }
  async function save(raw) {
    const mode = raw?.mode === 1 ? 'create' : raw?.mode === 2 ? 'replace' : raw?.mode;
    if (!raw || !raw.plan || !['create', 'replace'].includes(mode) || typeof raw.expectedUpdatedAtUnixMs !== 'bigint') fail('CHAT_EXPORT_SCHEDULE_INVALID');
    const input = validatePlan(raw.plan, accountId); const existing = state.plans.find(plan => plan.accountId === accountId && plan.scheduleId === input.scheduleId);
    if (mode === 'create') { if (raw.expectedUpdatedAtUnixMs !== 0n || existing) fail('CHAT_EXPORT_SCHEDULE_CONFLICT'); if (state.plans.length >= MAX_PLANS) fail('CHAT_EXPORT_TOO_MANY_SCHEDULES'); const nowValue = timestamp(); input.createdAtUnixMs = nowValue; input.updatedAtUnixMs = nowValue; input.successCount = 0; input.lastSuccessUnixMs = null; state.plans.push(input); await persist(); return clonePlan(input); }
    if (!existing) fail('CHAT_EXPORT_SCHEDULE_NOT_FOUND'); cas(existing, raw.expectedUpdatedAtUnixMs); input.createdAtUnixMs = existing.createdAtUnixMs; input.updatedAtUnixMs = timestamp(); input.successCount = existing.successCount; input.lastSuccessUnixMs = existing.lastSuccessUnixMs; Object.assign(existing, input); await persist(); return clonePlan(existing);
  }
  async function runNow(raw) {
    if (!raw || !isUuid(raw.accountId) || raw.accountId !== accountId || !isUuid(raw.scheduleId) || typeof raw.expectedUpdatedAtUnixMs !== 'bigint') fail('CHAT_EXPORT_SCHEDULE_INVALID');
    const plan = findPlan(raw.scheduleId); cas(plan, raw.expectedUpdatedAtUnixMs); const nowValue = BigInt(timestamp());
    const pending = pendingFor(plan);
    // This is an explicit user-triggered run. A plan whose next scheduled
    // time is already in the past must still be runnable; only a disabled or
    // exhausted plan is treated as already due.
    if (!plan.enabled || scheduleDue(plan, nowValue)) return { plan: clonePlan(plan), outcome: !plan.enabled ? 'disabled' : 'already_due' };
    if (pending) return { plan: clonePlan(plan), outcome: 'already_pending' };
    const occurrence = timestamp();
    const runs = [];
    for (const conversationId of plan.conversationIds) { const run = runRecord(plan, conversationId, occurrence); const attempt = attemptRecord(plan, conversationId, occurrence); run._endTimeUnixMs = occurrence; attempt._endTimeUnixMs = occurrence; state.runs.push(run); state.attempts.push(attempt); runs.push([run, attempt]); }
    plan.nextRunUnixMs = String(nowValue + BigInt(plan.intervalSeconds) * 1000n); plan.updatedAtUnixMs = timestamp(); trimHistory(); await persist();
    for (const [run, attempt] of runs) {
      void launchExecute(run, attempt, plan);
    }
    return { plan: clonePlan(plan), outcome: 'requested' };
  }
  async function runDueSchedules(at = BigInt(now())) {
    if (typeof at !== 'bigint' || at < 0n) fail('CHAT_EXPORT_SCHEDULE_INVALID');
    const due = accountPlans().filter(plan => plan.enabled && !scheduleDue(plan, at) && BigInt(plan.nextRunUnixMs) <= at && !pendingFor(plan)).slice(0, MAX_SCHEDULER_PLANS_PER_TICK);
    if (!due.length) return { plansStarted: 0, conversationsStarted: 0, truncated: accountPlans().some(plan => plan.enabled && !scheduleDue(plan, at) && BigInt(plan.nextRunUnixMs) <= at && !pendingFor(plan)) };
    let conversationsStarted = 0;
    for (const plan of due) {
      const occurrence = nextOccurrence(plan, at);
      const occurrenceWire = String(occurrence);
      const runs = [];
      for (const conversationId of plan.conversationIds) {
        const run = runRecord(plan, conversationId, occurrenceWire);
        const attempt = attemptRecord(plan, conversationId, occurrenceWire);
        run._endTimeUnixMs = occurrenceWire;
        attempt._endTimeUnixMs = occurrenceWire;
        state.runs.push(run); state.attempts.push(attempt); runs.push([run, attempt]);
        conversationsStarted += 1;
      }
      plan.updatedAtUnixMs = timestamp();
      trimHistory();
      // Make the plan's next boundary durable before executing any child job.
      await persist();
      for (const [run, attempt] of runs) void launchExecute(run, attempt, plan);
    }
    return { plansStarted: due.length, conversationsStarted, truncated: due.length === MAX_SCHEDULER_PLANS_PER_TICK };
  }
  function scheduleNextTick() {
    if (!scheduler || schedulerClosed) return;
    if (schedulerTimer !== null) clearTimeoutFn(schedulerTimer);
    const at = BigInt(now());
    let delay = schedulerPollMs;
    for (const plan of accountPlans()) {
      if (!plan.enabled || scheduleDue(plan, at)) continue;
      const delta = BigInt(plan.nextRunUnixMs) - at;
      if (delta <= 0n) { delay = MIN_SCHEDULER_POLL_MS; break; }
      const bounded = delta > BigInt(MAX_SCHEDULER_POLL_MS) ? MAX_SCHEDULER_POLL_MS : Number(delta);
      delay = Math.min(delay, Math.max(MIN_SCHEDULER_POLL_MS, bounded));
    }
    schedulerTimer = setTimeoutFn(() => {
      schedulerTimer = null;
      schedulerTickPromise = schedulerTickPromise.then(() => runDueSchedules()).catch(() => {}).finally(scheduleNextTick);
    }, delay);
    // Timers must never keep a CLI/test process alive by themselves.
    schedulerTimer?.unref?.();
  }
  function schedulerTick(at) {
    schedulerTickPromise = schedulerTickPromise.then(() => runDueSchedules(at));
    return schedulerTickPromise;
  }
  async function removeAccount(id) {
    if (id !== accountId) fail('ACCOUNT_NOT_FOUND');
    schedulerClosed = true;
    if (schedulerTimer !== null) { clearTimeoutFn(schedulerTimer); schedulerTimer = null; }
    await schedulerTickPromise;
    await Promise.allSettled([...activeExecutions]);
    state = { version: 1, plans: [], runs: [], attempts: [] };
    await persist();
    schedulerClosed = false;
    if (scheduler) scheduleNextTick();
  }
  async function retry(raw) {
    if (!raw || !isUuid(raw.accountId) || raw.accountId !== accountId || !isUuid(raw.attemptId) || typeof raw.expectedRevision !== 'bigint' || raw.expectedRevision <= 0n) fail('CHAT_EXPORT_ATTEMPT_INVALID');
    const attempt = findAttempt(raw.attemptId); if (BigInt(attempt.revision) !== raw.expectedRevision) fail('CHAT_EXPORT_ATTEMPT_CONFLICT'); if (attempt.state !== 'failed') fail('CHAT_EXPORT_ATTEMPT_NOT_RETRYABLE');
    const plan = findPlan(attempt.scheduleId); if (!plan.enabled) { setAttempt(attempt, 'skipped', 'schedule_disabled'); await persist(); return clone(attempt); }
    const run = attempt.runId ? state.runs.find(item => item.accountId === accountId && item.runId === attempt.runId) : null;
    const target = run || runRecord(plan, attempt.conversationId, attempt.occurrenceUnixMs); if (!run) state.runs.push(target); setRun(target, 'queued'); attempt._endTimeUnixMs = attempt.occurrenceUnixMs; setAttempt(attempt, 'queued'); await persist(); void launchExecute(target, attempt, plan); return clone(attempt);
  }
  if (scheduler) scheduleNextTick();
  return {
    listSchedules: ({ accountId: id, includeDisabled = false, limit = 100 } = {}) => { if (id !== undefined && id !== accountId) fail('ACCOUNT_NOT_FOUND'); if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail('CHAT_EXPORT_SCHEDULE_INVALID'); const plans = accountPlans().filter(plan => includeDisabled || plan.enabled); return { plans: plans.slice(0, limit).map(toWirePlan), truncated: plans.length > limit }; },
    getSchedule: ({ accountId: id, scheduleId } = {}) => { if (id !== undefined && id !== accountId) fail('ACCOUNT_NOT_FOUND'); return toWirePlan(findPlan(scheduleId)); },
    save: async raw => toWirePlan(await save(raw)),
    delete: async ({ accountId: id, scheduleId, expectedUpdatedAtUnixMs } = {}) => { if (id !== accountId || !isUuid(scheduleId) || typeof expectedUpdatedAtUnixMs !== 'bigint') fail('CHAT_EXPORT_SCHEDULE_INVALID'); const plan = findPlan(scheduleId); cas(plan, expectedUpdatedAtUnixMs); state.plans = state.plans.filter(item => item !== plan); for (const attempt of state.attempts.filter(item => item.scheduleId === scheduleId && ['queued', 'preparing'].includes(item.state))) setAttempt(attempt, 'skipped', 'schedule_deleted'); await persist(); return { accountId, scheduleId, deleted: true }; },
    runNow: async raw => { const result = await runNow(raw); return { plan: toWirePlan(result.plan), outcome: result.outcome }; },
    listRuns: request => { const result = records(request, 'runs'); return { records: result.records.map(row => toWireRun(row)), truncated: result.truncated }; },
    getRun: ({ accountId: id, runId } = {}) => { if (id !== accountId || !isUuid(runId)) fail('CHAT_EXPORT_HISTORY_INVALID'); return toWireRun(findRun(runId)); },
    listAttempts: request => { const result = records(request, 'attempts'); return { records: result.records.map(row => toWireAttempt(row)), truncated: result.truncated }; },
    getAttempt: ({ accountId: id, attemptId } = {}) => { if (id !== accountId || !isUuid(attemptId)) fail('CHAT_EXPORT_ATTEMPT_INVALID'); return toWireAttempt(findAttempt(attemptId)); },
    retry: async raw => toWireAttempt(await retry(raw)),
    removeAccount,
    schedulerTick,
    close: async () => { schedulerClosed = true; if (schedulerTimer !== null) { clearTimeoutFn(schedulerTimer); schedulerTimer = null; } await schedulerTickPromise; await Promise.allSettled([...activeExecutions]); await writeQueue; }
  };
}

module.exports = { createChatExportSchedules, validatePlan, validateOptions, toWirePlan, toWireRun, toWireAttempt, FORMATS, MAX_SCHEDULER_PLANS_PER_TICK };
