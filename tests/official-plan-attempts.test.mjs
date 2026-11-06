import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createOfficialPlanAttempts } from '../packages/alpha-engine/official-plan-attempts.cjs';

const accountId = 'synthetic-account';
const scheduleId = '11111111-1111-4111-8111-111111111111';

async function fixture(t) {
  const base = path.join(process.cwd(), '.runtime/official-attempt-test-');
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  const root = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const plans = new Map([[scheduleId, { accountId, scheduleId, updatedAtUnixMs: 42n }]]);
  const store = createOfficialPlanAttempts({ stateDir: root, accountId, now: () => 1700000000000n, getPlan: id => {
    const plan = plans.get(id);
    if (!plan) throw new Error('OFFICIAL_SCHEDULE_PLAN_NOT_FOUND');
    return plan;
  } });
  t.after(() => store.close());
  return { root, store };
}

test('official plan attempts record blocked local requests with CAS archive', async t => {
  const { root, store } = await fixture(t);
  const created = await store.request({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 42n });
  assert.equal(created.accountId, accountId);
  assert.equal(created.scheduleId, scheduleId);
  assert.equal(created.executionSupported, false);
  assert.equal(created.reasonCode, 'INDEPENDENT_OFFICIAL_EXECUTION_UNAVAILABLE');
  assert.equal(created.expectedPlanUpdatedAtUnixMs, 42n);
  assert.equal(created.cancelRequested, false);
  assert.equal(created.cancelConfirmed, false);
  assert.equal((await fs.stat(path.join(root, 'official-plan-attempts.v1.json'))).mode & 0o077, 0);
  assert.deepEqual((await store.list({ accountId })).records.map(item => item.attemptId), [created.attemptId]);
  const archived = await store.archive({ accountId, attemptId: created.attemptId, expectedRevision: created.revision, archived: true });
  assert.equal(archived.archived, true);
  assert.equal(archived.revision, 2n);
  assert.deepEqual((await store.list({ accountId })).records, []);
  assert.equal((await store.list({ accountId, includeArchived: true })).records.length, 1);
  await assert.rejects(store.archive({ accountId, attemptId: created.attemptId, expectedRevision: 1n, archived: false }), /OFFICIAL_PLAN_ATTEMPT_CONFLICT/);
});

test('official plan attempt cancellation is persisted with revision CAS', async t => {
  const { store } = await fixture(t);
  const created = await store.request({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 42n });
  const canceled = await store.cancel({ accountId, attemptId: created.attemptId, expectedRevision: created.revision });
  assert.equal(canceled.cancelRequested, true);
  assert.equal(canceled.cancelConfirmed, true);
  assert.equal(canceled.archived, false);
  assert.equal(canceled.revision, 2n);
  assert.equal((await store.get({ accountId, attemptId: created.attemptId })).cancelConfirmed, true);
  await assert.rejects(store.cancel({ accountId, attemptId: created.attemptId, expectedRevision: 1n }), /OFFICIAL_PLAN_ATTEMPT_CONFLICT/);
});

test('official plan attempts validate plan revision and account isolation', async t => {
  const { store } = await fixture(t);
  await assert.rejects(store.request({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 41n }), /OFFICIAL_SCHEDULE_PLAN_CONFLICT/);
  await assert.rejects(store.request({ accountId: 'other-account', scheduleId }), /ACCOUNT_NOT_FOUND/);
  await assert.rejects(store.request({ accountId, scheduleId: '22222222-2222-4222-8222-222222222222' }), /OFFICIAL_SCHEDULE_PLAN_NOT_FOUND/);
});

test('official plan attempt requestIfAbsent serializes duplicate pending requests', async t => {
  const { store } = await fixture(t);
  const [first, second] = await Promise.all([
    store.requestIfAbsent({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 42n }),
    store.requestIfAbsent({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 42n })
  ]);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.record.attemptId, second.record.attemptId);
  assert.equal((await store.list({ accountId, scheduleId })).records.length, 1);
});

test('official plan attempt requestIfAbsent allows a new request after cancel or archive', async t => {
  const { store } = await fixture(t);
  const first = (await store.requestIfAbsent({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 42n })).record;
  const canceled = await store.cancel({ accountId, attemptId: first.attemptId, expectedRevision: first.revision });
  const second = (await store.requestIfAbsent({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 42n })).record;
  assert.notEqual(second.attemptId, first.attemptId);
  assert.equal(second.cancelRequested, false);
  const archived = await store.archive({ accountId, attemptId: second.attemptId, expectedRevision: second.revision, archived: true });
  const third = (await store.requestIfAbsent({ accountId, scheduleId, expectedPlanUpdatedAtUnixMs: 42n })).record;
  assert.notEqual(third.attemptId, second.attemptId);
  assert.equal(archived.archived, true);
  assert.equal(canceled.cancelConfirmed, true);
  const active = (await store.list({ accountId, scheduleId })).records;
  assert.equal(active.length, 2);
  assert.deepEqual(new Set(active.map(record => record.attemptId)), new Set([first.attemptId, third.attemptId]));
});
