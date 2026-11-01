import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChatExportSchedules } = require('../packages/alpha-engine/chat-export-schedules.cjs');
const accountId = '11111111-1111-4111-8111-111111111110';
const scheduleId = '11111111-1111-4111-8111-111111111111';

function plan(directory, overrides = {}) {
  return {
    accountId, scheduleId, conversationId: 'wxid_alpha', formats: ['json'], includeMedia: false,
    intervalSeconds: 3600, lookbackSeconds: 0, nextRunUnixMs: '2000000000000', enabled: true,
    createdAtUnixMs: '0', updatedAtUnixMs: '0', conversationIds: ['wxid_alpha'],
    options: { outputDirectory: directory, outputLayout: 'job-folder', conflictPolicy: '', displayNamePreference: '', xlsxColumns: [], avatars: false, messageTypes: [], mediaKinds: [], voiceTranscripts: false, rangeMode: 'lookback' },
    ...overrides
  };
}

async function make(t, options = {}) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/schedule-test-'));
  const stateDir = path.join(root, 'state');
  const output = path.join(root, 'exports');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  let clock = options.clock === undefined ? 1700000000000n : BigInt(options.clock);
  const jobs = new Map();
  const store = createChatExportSchedules({ stateDir, accountId, now: () => clock, scheduler: options.scheduler ?? false, startExport: async () => { const id = `job-${jobs.size + 1}`; jobs.set(id, { state: 'completed', items: [{ state: 'completed', path: path.join(output, 'file.json') }] }); return { jobId: id }; }, watchExport: async id => jobs.get(id) });
  t.after(async () => { await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { store, root, stateDir, output, clock: () => clock, advance: value => { clock = BigInt(value); } };
}

test('schedule plan persists with omitted optional fields and CAS', async t => {
  const f = await make(t);
  const created = await f.store.save({ plan: plan(f.output, { options: undefined }), mode: 1, expectedUpdatedAtUnixMs: 0n });
  assert.equal(created.options, null);
  assert.equal(created.stopAtUnixMs, undefined);
  assert.equal(created.lastSuccessUnixMs, undefined);
  assert.equal((await f.store.listSchedules({ accountId, includeDisabled: true, limit: 100 })).plans.length, 1);
  await f.store.close();
  const reopened = createChatExportSchedules({ stateDir: f.stateDir, accountId, startExport: async () => ({ jobId: 'unused' }), watchExport: async () => ({ state: 'failed', items: [] }) });
  assert.equal(reopened.listSchedules({ accountId, includeDisabled: true, limit: 100 }).plans[0].scheduleId, scheduleId);
  await reopened.close();
  await assert.rejects(f.store.save({ plan: plan(f.output, { updatedAtUnixMs: created.updatedAtUnixMs, options: { outputDirectory: f.output, outputLayout: 'job-folder', conflictPolicy: '', displayNamePreference: '', xlsxColumns: [], avatars: false, messageTypes: [], mediaKinds: [], voiceTranscripts: false, rangeMode: 'lookback' } }), mode: 'replace', expectedUpdatedAtUnixMs: 1n }), /CHAT_EXPORT_SCHEDULE_CONFLICT/);
});

test('schedule rejects multi-format and relative destinations', async t => {
  const f = await make(t);
  await assert.rejects(f.store.save({ plan: plan(f.output, { formats: ['json', 'html'] }), mode: 'create', expectedUpdatedAtUnixMs: 0n }), /CHAT_EXPORT_SCHEDULE_INVALID/);
  await assert.rejects(f.store.save({ plan: plan('relative/path'), mode: 'create', expectedUpdatedAtUnixMs: 0n }), /CHAT_EXPORT_SCHEDULE_INVALID/);
  const xlsx = await f.store.save({ plan: plan(f.output, { formats: ['xlsx'] }), mode: 'create', expectedUpdatedAtUnixMs: 0n });
  assert.deepEqual(xlsx.formats, ['xlsx']);
});

test('run-now submits verified single export and records history', async t => {
  const f = await make(t);
  const created = await f.store.save({ plan: plan(f.output), mode: 'create', expectedUpdatedAtUnixMs: 0n });
  const result = await f.store.runNow({ accountId, scheduleId, expectedUpdatedAtUnixMs: created.updatedAtUnixMs });
  assert.equal(result.outcome, 'requested');
  await new Promise(resolve => setTimeout(resolve, 20));
  const runs = f.store.listRuns({ accountId, scheduleId, limit: 100 });
  assert.equal(runs.records.length, 1);
  assert.equal(runs.records[0].state, 'completed');
  const attempts = f.store.listAttempts({ accountId, scheduleId, limit: 100 });
  assert.equal(attempts.records[0].state, 'submitted');
});

test('run-now fails closed for persisted file conflict semantics', async t => {
  const f = await make(t);
  const created = await f.store.save({ plan: plan(f.output, { options: { ...plan(f.output).options, outputLayout: 'fixed', conflictPolicy: 'overwrite' } }), mode: 'create', expectedUpdatedAtUnixMs: 0n });
  const result = await f.store.runNow({ accountId, scheduleId, expectedUpdatedAtUnixMs: created.updatedAtUnixMs });
  assert.equal(result.outcome, 'requested');
  await new Promise(resolve => setTimeout(resolve, 20));
  const attempts = f.store.listAttempts({ accountId, scheduleId, limit: 100 });
  assert.equal(attempts.records[0].state, 'failed');
  assert.equal(attempts.records[0].reasonCode, 'start_failed');
});

test('bounded scheduler runs one overdue plan and advances the next boundary', async t => {
  const f = await make(t, { clock: 1700000000000n });
  const created = await f.store.save({ plan: plan(f.output, { nextRunUnixMs: '1699996400000' }), mode: 'create', expectedUpdatedAtUnixMs: 0n });
  const result = await f.store.schedulerTick();
  assert.deepEqual(result, { plansStarted: 1, conversationsStarted: 1, truncated: false });
  await new Promise(resolve => setTimeout(resolve, 20));
  const runs = f.store.listRuns({ accountId, scheduleId, limit: 100 });
  assert.equal(runs.records.length, 1);
  assert.equal(runs.records[0].state, 'completed');
  const current = f.store.getSchedule({ accountId, scheduleId });
  assert.ok(current.nextRunUnixMs > 1700000000000n);
  // A second tick cannot duplicate the run while the plan is no longer due.
  assert.deepEqual(await f.store.schedulerTick(), { plansStarted: 0, conversationsStarted: 0, truncated: false });
  assert.equal(created.scheduleId, scheduleId);
});

test('restart resumes an overdue persisted plan without replaying a backlog', async t => {
  const f = await make(t, { clock: 1700000000000n });
  await f.store.save({ plan: plan(f.output, { nextRunUnixMs: '1690000000000' }), mode: 'create', expectedUpdatedAtUnixMs: 0n });
  await f.store.close();
  const reopened = createChatExportSchedules({
    stateDir: f.stateDir,
    accountId,
    scheduler: false,
    now: () => 1700000000000n,
    startExport: async () => ({ jobId: 'restart-job' }),
    watchExport: async () => ({ state: 'completed', items: [{ state: 'completed', path: path.join(f.output, 'restart.json') }] })
  });
  t.after(async () => { await reopened.close(); });
  const first = await reopened.schedulerTick();
  assert.equal(first.plansStarted, 1);
  await new Promise(resolve => setTimeout(resolve, 20));
  const second = await reopened.schedulerTick();
  assert.equal(second.plansStarted, 0);
  assert.equal(reopened.listRuns({ accountId, scheduleId, limit: 100 }).records.length, 1);
});
