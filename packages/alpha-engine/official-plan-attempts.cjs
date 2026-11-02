'use strict';

// Local audit trail for an official-plan execution request that the
// independent backend cannot execute.  This is intentionally separate from
// Alpha's OfficialScheduleRecord protobuf surface: it never claims that a
// remote scheduler, article service, or renderer job ran.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATE_VERSION = 1;
const STATE_FILE_NAME = 'official-plan-attempts.v1.json';
const MAX_ENTRIES = 500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]{0,18})$/u;
const MAX_INT64 = 9223372036854775807n;

function fail(code) { throw new Error(code); }
function account(value) {
  if (typeof value !== 'string' || !value || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) fail('OFFICIAL_PLAN_ATTEMPT_INVALID');
  return value;
}
function uuid(value, code = 'OFFICIAL_PLAN_ATTEMPT_INVALID') {
  if (typeof value !== 'string' || !UUID.test(value) || value === '00000000-0000-0000-0000-000000000000') fail(code);
  return value;
}
function decimal(value, code = 'OFFICIAL_PLAN_ATTEMPT_INVALID') {
  const text = typeof value === 'bigint' ? value.toString() : value;
  if (typeof text !== 'string' || !DECIMAL.test(text)) fail(code);
  const n = BigInt(text);
  if (n > MAX_INT64) fail(code);
  return text;
}
function stateDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.parse(directory).root === path.resolve(directory)) fail('ENGINE_STATE_PATH_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('ENGINE_STATE_PATH_INVALID');
  }
}
function validateRecord(value, fixedAccount) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID');
  const keys = ['attemptId', 'accountId', 'scheduleId', 'requestedAtUnixMs', 'updatedAtUnixMs', 'revision', 'archived', 'executionSupported', 'reasonCode', 'expectedPlanUpdatedAtUnixMs'];
  if (Object.keys(value).some(key => !keys.includes(key))) fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID');
  const accountId = account(value.accountId);
  if (fixedAccount && accountId !== fixedAccount) fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID');
  const record = {
    attemptId: uuid(value.attemptId, 'OFFICIAL_PLAN_ATTEMPT_STATE_INVALID'),
    accountId,
    scheduleId: uuid(value.scheduleId, 'OFFICIAL_PLAN_ATTEMPT_STATE_INVALID'),
    requestedAtUnixMs: decimal(value.requestedAtUnixMs, 'OFFICIAL_PLAN_ATTEMPT_STATE_INVALID'),
    updatedAtUnixMs: decimal(value.updatedAtUnixMs, 'OFFICIAL_PLAN_ATTEMPT_STATE_INVALID'),
    revision: decimal(value.revision, 'OFFICIAL_PLAN_ATTEMPT_STATE_INVALID'),
    archived: value.archived,
    executionSupported: value.executionSupported,
    reasonCode: value.reasonCode,
    expectedPlanUpdatedAtUnixMs: decimal(value.expectedPlanUpdatedAtUnixMs, 'OFFICIAL_PLAN_ATTEMPT_STATE_INVALID')
  };
  if (typeof record.archived !== 'boolean' || record.executionSupported !== false || record.reasonCode !== 'INDEPENDENT_OFFICIAL_EXECUTION_UNAVAILABLE' || BigInt(record.revision) < 1n || BigInt(record.updatedAtUnixMs) < BigInt(record.requestedAtUnixMs)) fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID');
  return record;
}
function readState(file, fixedAccount) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES || (stat.mode & 0o077) !== 0) fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID');
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(fd, 'utf8')); } catch { fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== STATE_VERSION || !Array.isArray(parsed.entries) || parsed.entries.length > MAX_ENTRIES) fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID');
    const entries = parsed.entries.map(record => validateRecord(record, fixedAccount));
    const ids = new Set();
    for (const record of entries) { if (ids.has(record.attemptId)) fail('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID'); ids.add(record.attemptId); }
    return { version: STATE_VERSION, entries };
  } catch (failure) {
    if (failure.code === 'ENOENT') return { version: STATE_VERSION, entries: [] };
    if (failure.message === 'OFFICIAL_PLAN_ATTEMPT_STATE_INVALID') throw failure;
    throw new Error('OFFICIAL_PLAN_ATTEMPT_STATE_INVALID');
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function writeState(file, state) {
  const directory = path.dirname(file); const temporary = path.join(directory, `.official-plan-attempts-${crypto.randomUUID()}.tmp`);
  let fd;
  try {
    const serialized = `${JSON.stringify(state)}\n`;
    if (Buffer.byteLength(serialized) > MAX_FILE_BYTES) fail('OFFICIAL_PLAN_ATTEMPT_LIMIT');
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, serialized); fs.fsyncSync(fd); fs.fchmodSync(fd, 0o600); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file); fs.chmodSync(file, 0o600);
  } finally { if (fd !== undefined) fs.closeSync(fd); try { fs.unlinkSync(temporary); } catch (failure) { if (failure.code !== 'ENOENT') throw failure; } }
}

function createOfficialPlanAttempts({ stateDir, accountId: fixedAccount, now = () => BigInt(Date.now()), getPlan } = {}) {
  stateDirectory(stateDir);
  const selectedAccount = fixedAccount === '' ? '' : account(fixedAccount);
  const file = path.join(stateDir, STATE_FILE_NAME);
  let state = readState(file, selectedAccount);
  let lastTimestamp = 0n;
  for (const record of state.entries) for (const field of ['requestedAtUnixMs', 'updatedAtUnixMs']) lastTimestamp = BigInt(record[field]) > lastTimestamp ? BigInt(record[field]) : lastTimestamp;
  let tail = Promise.resolve();
  const entries = () => state.entries.filter(record => record.accountId === selectedAccount);
  const checkAccount = value => { if (value !== undefined && value !== selectedAccount) fail('ACCOUNT_NOT_FOUND'); if (!selectedAccount) fail('ACCOUNT_NOT_FOUND'); return selectedAccount; };
  const timestamp = () => { let value = BigInt(now()); if (value < 0n) fail('OFFICIAL_PLAN_ATTEMPT_INVALID'); if (value <= lastTimestamp) value = lastTimestamp + 1n; lastTimestamp = value; return value.toString(); };
  const persist = async () => writeState(file, state);
  const serial = operation => { const result = tail.then(operation); tail = result.then(() => undefined, () => undefined); return result; };
  const find = attemptId => { uuid(attemptId, 'OFFICIAL_PLAN_ATTEMPT_INVALID'); const found = entries().find(record => record.attemptId === attemptId); if (!found) fail('OFFICIAL_PLAN_ATTEMPT_NOT_FOUND'); return found; };
  const revisionValue = value => { const text = decimal(value, 'OFFICIAL_PLAN_ATTEMPT_REVISION_INVALID'); if (BigInt(text) < 1n) fail('OFFICIAL_PLAN_ATTEMPT_REVISION_INVALID'); return BigInt(text); };
  const wire = record => ({ ...record, requestedAtUnixMs: BigInt(record.requestedAtUnixMs), updatedAtUnixMs: BigInt(record.updatedAtUnixMs), revision: BigInt(record.revision), expectedPlanUpdatedAtUnixMs: BigInt(record.expectedPlanUpdatedAtUnixMs) });
  return {
    async request({ accountId: requestAccount, scheduleId, expectedPlanUpdatedAtUnixMs = 0n } = {}) {
      return serial(async () => {
        checkAccount(requestAccount); uuid(scheduleId, 'OFFICIAL_PLAN_ATTEMPT_INVALID');
        const expected = BigInt(decimal(expectedPlanUpdatedAtUnixMs));
        if (typeof getPlan !== 'function') fail('OFFICIAL_PLAN_ATTEMPT_UNAVAILABLE');
        let plan;
        try { plan = await getPlan(scheduleId); } catch (failure) { throw failure; }
        if (!plan || plan.accountId !== selectedAccount) fail('OFFICIAL_SCHEDULE_PLAN_NOT_FOUND');
        if (expected !== 0n && BigInt(plan.updatedAtUnixMs) !== expected) fail('OFFICIAL_SCHEDULE_PLAN_CONFLICT');
        if (entries().length >= MAX_ENTRIES) fail('OFFICIAL_PLAN_ATTEMPT_LIMIT');
        const stamp = timestamp();
        const record = { attemptId: crypto.randomUUID(), accountId: selectedAccount, scheduleId, requestedAtUnixMs: stamp, updatedAtUnixMs: stamp, revision: '1', archived: false, executionSupported: false, reasonCode: 'INDEPENDENT_OFFICIAL_EXECUTION_UNAVAILABLE', expectedPlanUpdatedAtUnixMs: BigInt(plan.updatedAtUnixMs).toString() };
        state.entries.push(record); await persist(); return wire(record);
      });
    },
    list({ accountId: requestAccount, scheduleId, includeArchived = false, limit = 0 } = {}) {
      checkAccount(requestAccount); const effectiveLimit = limit === 0 ? 20 : limit;
      if (typeof includeArchived !== 'boolean' || !Number.isInteger(effectiveLimit) || effectiveLimit < 1 || effectiveLimit > 100) fail('OFFICIAL_PLAN_ATTEMPT_INVALID');
      if (scheduleId !== undefined) uuid(scheduleId, 'OFFICIAL_PLAN_ATTEMPT_INVALID');
      const records = entries().filter(record => (scheduleId === undefined || record.scheduleId === scheduleId) && (includeArchived || !record.archived)).sort((left, right) => BigInt(right.requestedAtUnixMs) > BigInt(left.requestedAtUnixMs) ? 1 : -1);
      return { records: records.slice(0, effectiveLimit).map(wire), truncated: records.length > effectiveLimit };
    },
    get({ accountId: requestAccount, attemptId } = {}) { checkAccount(requestAccount); return wire(find(attemptId)); },
    archive({ accountId: requestAccount, attemptId, expectedRevision, archived } = {}) {
      return serial(async () => { checkAccount(requestAccount); const record = find(attemptId); const revision = revisionValue(expectedRevision); if (BigInt(record.revision) !== revision) fail('OFFICIAL_PLAN_ATTEMPT_CONFLICT'); if (typeof archived !== 'boolean') fail('OFFICIAL_PLAN_ATTEMPT_INVALID'); record.archived = archived; record.revision = (revision + 1n).toString(); record.updatedAtUnixMs = timestamp(); await persist(); return wire(record); });
    },
    removeAccount(requestAccount = selectedAccount) { return serial(async () => { checkAccount(requestAccount); state.entries = state.entries.filter(record => record.accountId !== selectedAccount); await persist(); }); },
    async close() { await tail; },
    file
  };
}

module.exports = { createOfficialPlanAttempts, STATE_FILE_NAME };
