'use strict';

// Independent local metadata store for the recovered OfficialSchedulePlan
// surface.  It deliberately stores plans only; article discovery, remote
// downloads, execution records, and scheduler runs remain unsupported.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STATE_VERSION = 1;
const STATE_FILE_NAME = 'official-schedule-plans.v1.json';
const MAX_PLANS = 100;
const MAX_PLAN_BYTES = 65536;
const FORMATS = new Set(['json', 'markdown', 'chatlab-json', 'chatlab-jsonl', 'html', 'txt', 'xlsx']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]{0,18})$/u;
const MAX_INT64 = 9223372036854775807n;
const encoder = new TextEncoder();

function fail(code) { throw new Error(code); }

function accountId(value) {
  if (typeof value !== 'string' || !value || value.length > 256 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  return value;
}

function uuid(value, code = 'OFFICIAL_SCHEDULE_PLAN_INVALID') {
  if (typeof value !== 'string' || !UUID.test(value) || value === '00000000-0000-0000-0000-000000000000') fail(code);
  return value;
}

function decimal(value) {
  const text = typeof value === 'bigint' ? value.toString() : value;
  if (typeof text !== 'string' || !DECIMAL.test(text)) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  const number = BigInt(text);
  if (number > MAX_INT64) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  return text;
}

function positiveInteger(value, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  return value;
}

function text(value, maximum) {
  if (typeof value !== 'string' || !value || value.trim() !== value || encoder.encode(value).length > maximum || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  return value;
}

function validateArticle(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['sourceArticleId', 'canonicalUrl'].includes(key))) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  const sourceArticleId = text(value.sourceArticleId, 256);
  const canonicalUrl = text(value.canonicalUrl, 4096);
  let parsed;
  try { parsed = new URL(canonicalUrl); } catch { fail('OFFICIAL_SCHEDULE_PLAN_INVALID'); }
  if (!/^https?:\/\//u.test(canonicalUrl) || !['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  return { sourceArticleId, canonicalUrl };
}

function validatePlan(value, expectedAccountId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  const allowed = new Set(['scheduleId', 'accountId', 'officialAccountId', 'materialBundleId', 'scope', 'selected', 'formats', 'downloadAssets', 'includeMedia', 'maxPages', 'intervalSeconds', 'nextRunUnixMs', 'enabled', 'createdAtUnixMs', 'updatedAtUnixMs']);
  if (Object.keys(value).some(key => !allowed.has(key))) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  const planAccount = accountId(value.accountId);
  if (expectedAccountId !== undefined && planAccount !== expectedAccountId) fail('ACCOUNT_NOT_FOUND');
  const officialAccountId = text(value.officialAccountId, 256);
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(officialAccountId) || officialAccountId.startsWith('//')) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  if (typeof value.materialBundleId !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value.materialBundleId)) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  if (value.scope !== 1 && value.scope !== 2) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  if (!Array.isArray(value.selected) || value.selected.length > 1000 || (value.scope === 1 ? value.selected.length !== 0 : value.selected.length < 1)) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  const selected = value.selected.map(validateArticle);
  if (!Array.isArray(value.formats) || value.formats.length < 1 || value.formats.length > 7 || new Set(value.formats).size !== value.formats.length || value.formats.some(format => typeof format !== 'string' || !FORMATS.has(format))) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  for (const field of ['downloadAssets', 'includeMedia', 'enabled']) if (typeof value[field] !== 'boolean') fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  const plan = {
    scheduleId: uuid(value.scheduleId),
    accountId: planAccount,
    officialAccountId,
    materialBundleId: value.materialBundleId,
    scope: value.scope,
    selected,
    formats: [...value.formats],
    downloadAssets: value.downloadAssets,
    includeMedia: value.includeMedia,
    maxPages: positiveInteger(value.maxPages, 1, 200),
    intervalSeconds: decimal(value.intervalSeconds),
    nextRunUnixMs: decimal(value.nextRunUnixMs),
    enabled: value.enabled,
    createdAtUnixMs: decimal(value.createdAtUnixMs),
    updatedAtUnixMs: decimal(value.updatedAtUnixMs)
  };
  if (BigInt(plan.intervalSeconds) < 60n || BigInt(plan.intervalSeconds) > 2678400n || BigInt(plan.updatedAtUnixMs) < BigInt(plan.createdAtUnixMs)) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  if (encoder.encode(JSON.stringify(plan)).length > MAX_PLAN_BYTES) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
  return plan;
}

function toWirePlan(plan) {
  return {
    ...plan,
    intervalSeconds: BigInt(plan.intervalSeconds),
    nextRunUnixMs: BigInt(plan.nextRunUnixMs),
    createdAtUnixMs: BigInt(plan.createdAtUnixMs),
    updatedAtUnixMs: BigInt(plan.updatedAtUnixMs)
  };
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

function readState(file, fixedAccount) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || (stat.mode & 0o077) !== 0) fail('OFFICIAL_SCHEDULE_PLAN_STATE_INVALID');
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(fd, 'utf8')); } catch { fail('OFFICIAL_SCHEDULE_PLAN_STATE_INVALID'); }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || parsed.version !== STATE_VERSION || !Array.isArray(parsed.entries) || parsed.entries.length > MAX_PLANS * 16) fail('OFFICIAL_SCHEDULE_PLAN_STATE_INVALID');
    const entries = parsed.entries.map(entry => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || Object.keys(entry).sort().join(',') !== 'generation,plan' || typeof entry.generation !== 'string') fail('OFFICIAL_SCHEDULE_PLAN_STATE_INVALID');
      uuid(entry.generation, 'OFFICIAL_SCHEDULE_PLAN_STATE_INVALID');
      // The state directory is bound to one selected account. Reject entries
      // for another account instead of silently retaining data that could be
      // exposed after a future account switch or state-directory reuse.
      return { generation: entry.generation, plan: validatePlan(entry.plan, fixedAccount) };
    });
    const seen = new Set();
    for (const entry of entries) {
      const key = `${entry.plan.accountId}:${entry.plan.scheduleId}`;
      if (seen.has(key)) fail('OFFICIAL_SCHEDULE_PLAN_STATE_INVALID');
      seen.add(key);
    }
    return { version: STATE_VERSION, entries };
  } catch (failure) {
    if (failure.code === 'ENOENT') return { version: STATE_VERSION, entries: [] };
    if (failure.message === 'OFFICIAL_SCHEDULE_PLAN_STATE_INVALID') throw failure;
    throw new Error('OFFICIAL_SCHEDULE_PLAN_STATE_INVALID');
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function writeState(file, state) {
  const directory = path.dirname(file);
  const serialized = `${JSON.stringify(state)}\n`;
  const temporary = path.join(directory, `.official-schedule-plans-${crypto.randomUUID()}.tmp`);
  let fd;
  try {
    fd = fs.openSync(temporary, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    fs.writeFileSync(fd, serialized, 'utf8');
    fs.fsyncSync(fd);
    fs.fchmodSync(fd, 0o600);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
    // Keep the state file private even when a umask or an older file existed.
    fs.chmodSync(file, 0o600);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
  }
}

function createOfficialSchedulePlans({ stateDir, accountId: fixedAccount, now = () => BigInt(Date.now()) } = {}) {
  stateDirectory(stateDir);
  // The engine also constructs all stateful adapters before an account is
  // discovered. Keep that no-source mode constructible; dispatch still
  // rejects plan operations through the engine's account guard.
  const selectedAccount = fixedAccount === '' ? '' : accountId(fixedAccount);
  const file = path.join(stateDir, STATE_FILE_NAME);
  let state = readState(file, selectedAccount);
  let lastTimestamp = 0n;
  for (const entry of state.entries) for (const field of ['createdAtUnixMs', 'updatedAtUnixMs']) lastTimestamp = BigInt(entry.plan[field]) > lastTimestamp ? BigInt(entry.plan[field]) : lastTimestamp;
  let tail = Promise.resolve();
  const entries = () => state.entries.filter(entry => entry.plan.accountId === selectedAccount);
  const checkAccount = value => { if (value !== undefined && value !== selectedAccount) fail('ACCOUNT_NOT_FOUND'); return selectedAccount; };
  const timestamp = () => { let value = BigInt(now()); if (value < 0n) fail('OFFICIAL_SCHEDULE_PLAN_INVALID'); if (value <= lastTimestamp) value = lastTimestamp + 1n; lastTimestamp = value; return value.toString(); };
  const persist = async () => writeState(file, state);
  const serial = operation => { const result = tail.then(operation); tail = result.then(() => undefined, () => undefined); return result; };
  const find = scheduleId => { uuid(scheduleId, 'OFFICIAL_SCHEDULE_PLAN_INVALID'); const found = entries().find(entry => entry.plan.scheduleId === scheduleId); if (!found) fail('OFFICIAL_SCHEDULE_PLAN_NOT_FOUND'); return found; };
  const cas = (entry, expected) => { if (typeof expected !== 'bigint' || expected <= 0n || BigInt(entry.plan.updatedAtUnixMs) !== expected) fail('OFFICIAL_SCHEDULE_PLAN_CONFLICT'); };
  return {
    listPlans({ accountId: requestAccount, includeDisabled = false, limit = 0 } = {}) {
      checkAccount(requestAccount);
      const effectiveLimit = limit === 0 ? 20 : limit;
      if (typeof includeDisabled !== 'boolean' || !Number.isInteger(effectiveLimit) || effectiveLimit < 1 || effectiveLimit > 100) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
      const plans = entries().filter(entry => includeDisabled || entry.plan.enabled).sort((left, right) => Number(BigInt(right.plan.updatedAtUnixMs) - BigInt(left.plan.updatedAtUnixMs)));
      return { plans: plans.slice(0, effectiveLimit).map(entry => toWirePlan(entry.plan)), truncated: plans.length > effectiveLimit };
    },
    getPlan({ accountId: requestAccount, scheduleId } = {}) { checkAccount(requestAccount); return toWirePlan(find(scheduleId).plan); },
    save(raw = {}) {
      return serial(async () => {
        if (!raw || typeof raw !== 'object' || ![1, 2].includes(raw.mode) || typeof raw.expectedUpdatedAtUnixMs !== 'bigint' || raw.expectedUpdatedAtUnixMs < 0n) fail('OFFICIAL_SCHEDULE_PLAN_INVALID');
        const input = validatePlan(raw.plan, selectedAccount);
        const existing = entries().find(entry => entry.plan.scheduleId === input.scheduleId);
        if (raw.mode === 1) {
          if (raw.expectedUpdatedAtUnixMs !== 0n || existing) fail('OFFICIAL_SCHEDULE_PLAN_CONFLICT');
          if (entries().length >= MAX_PLANS) fail('OFFICIAL_SCHEDULE_PLAN_LIMIT');
          const stamp = timestamp();
          input.createdAtUnixMs = stamp; input.updatedAtUnixMs = stamp;
          const entry = { generation: crypto.randomUUID(), plan: input };
          state.entries.push(entry); await persist(); return toWirePlan(input);
        }
        if (!existing) fail('OFFICIAL_SCHEDULE_PLAN_NOT_FOUND');
        cas(existing, raw.expectedUpdatedAtUnixMs);
        input.createdAtUnixMs = existing.plan.createdAtUnixMs; input.updatedAtUnixMs = timestamp();
        existing.plan = input; existing.generation = crypto.randomUUID();
        await persist(); return toWirePlan(input);
      });
    },
    deletePlan({ accountId: requestAccount, scheduleId, expectedUpdatedAtUnixMs } = {}) {
      return serial(async () => {
        checkAccount(requestAccount); const entry = find(scheduleId); cas(entry, expectedUpdatedAtUnixMs);
        state.entries = state.entries.filter(candidate => candidate !== entry); await persist();
        return { accountId: selectedAccount, scheduleId, deleted: true };
      });
    },
    removeAccount(requestAccount = selectedAccount) {
      return serial(async () => { checkAccount(requestAccount); state.entries = state.entries.filter(entry => entry.plan.accountId !== selectedAccount); await persist(); });
    },
    async close() { await tail; },
    file
  };
}

module.exports = { createOfficialSchedulePlans, validatePlan, toWirePlan, FORMATS, STATE_FILE_NAME };
