import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createOfficialSchedulePlans, STATE_FILE_NAME } = require('../packages/alpha-engine/official-schedule-plans.cjs');

const accountId = 'synthetic-account';
const scheduleId = '11111111-1111-4111-8111-111111111111';
const secondScheduleId = '11111111-1111-4111-8111-111111111112';

function plan(overrides = {}) {
  return {
    scheduleId,
    accountId,
    officialAccountId: 'gh_alpha',
    materialBundleId: 'bundle-1',
    scope: 1,
    selected: [],
    formats: ['json'],
    downloadAssets: false,
    includeMedia: false,
    maxPages: 20,
    intervalSeconds: 3600n,
    nextRunUnixMs: 0n,
    enabled: true,
    createdAtUnixMs: 0n,
    updatedAtUnixMs: 0n,
    ...overrides
  };
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/official-plan-test-'));
  const stateDir = path.join(root, 'state');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const store = createOfficialSchedulePlans({ stateDir, accountId, now: () => 1700000000000n });
  t.after(async () => { await store.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, stateDir, store };
}

test('official plan metadata CRUD persists, filters disabled plans, and enforces CAS', async t => {
  const f = await fixture(t);
  const created = await f.store.save({ plan: plan(), mode: 1, expectedUpdatedAtUnixMs: 0n });
  assert.equal(created.accountId, accountId);
  assert.equal(created.updatedAtUnixMs, 1700000000000n);
  assert.equal((f.store.listPlans({ accountId })).plans.length, 1);
  assert.equal(f.store.getPlan({ accountId, scheduleId }).scheduleId, scheduleId);
  await assert.rejects(f.store.save({ plan: plan({ enabled: false }), mode: 2, expectedUpdatedAtUnixMs: created.updatedAtUnixMs - 1n }), /OFFICIAL_SCHEDULE_PLAN_CONFLICT/);
  const replaced = await f.store.save({ plan: plan({ enabled: false }), mode: 2, expectedUpdatedAtUnixMs: created.updatedAtUnixMs });
  assert.equal(replaced.createdAtUnixMs, created.createdAtUnixMs);
  assert.equal(f.store.listPlans({ accountId }).plans.length, 0);
  assert.equal(f.store.listPlans({ accountId, includeDisabled: true }).plans.length, 1);
  await assert.rejects(f.store.deletePlan({ accountId, scheduleId, expectedUpdatedAtUnixMs: created.updatedAtUnixMs }), /OFFICIAL_SCHEDULE_PLAN_CONFLICT/);
  const deleted = await f.store.deletePlan({ accountId, scheduleId, expectedUpdatedAtUnixMs: replaced.updatedAtUnixMs });
  assert.deepEqual(deleted, { accountId, scheduleId, deleted: true });
  assert.equal(f.store.listPlans({ accountId, includeDisabled: true }).plans.length, 0);
  const state = await fs.stat(path.join(f.stateDir, STATE_FILE_NAME));
  assert.equal(state.mode & 0o777, 0o600);
});

test('official plan metadata supports bounded listing and restart recovery', async t => {
  const f = await fixture(t);
  await f.store.save({ plan: plan(), mode: 1, expectedUpdatedAtUnixMs: 0n });
  await f.store.save({ plan: plan({ scheduleId: secondScheduleId }), mode: 1, expectedUpdatedAtUnixMs: 0n });
  const page = f.store.listPlans({ accountId, includeDisabled: true, limit: 1 });
  assert.equal(page.plans.length, 1);
  assert.equal(page.truncated, true);
  await f.store.close();
  const reopened = createOfficialSchedulePlans({ stateDir: f.stateDir, accountId, now: () => 1700000001000n });
  t.after(() => reopened.close());
  assert.equal(reopened.listPlans({ accountId, includeDisabled: true, limit: 100 }).plans.length, 2);
  await reopened.removeAccount(accountId);
  assert.equal(reopened.listPlans({ accountId, includeDisabled: true }).plans.length, 0);
});

test('official plan metadata rejects malformed URLs, formats, selection scope, and account access', async t => {
  const f = await fixture(t);
  await assert.rejects(f.store.save({ plan: plan({ selected: [{ sourceArticleId: 'a', canonicalUrl: 'file:///tmp/a' }], scope: 2 }), mode: 1, expectedUpdatedAtUnixMs: 0n }), /OFFICIAL_SCHEDULE_PLAN_INVALID/);
  await assert.rejects(f.store.save({ plan: plan({ formats: ['sql'] }), mode: 1, expectedUpdatedAtUnixMs: 0n }), /OFFICIAL_SCHEDULE_PLAN_INVALID/);
  await assert.rejects(f.store.save({ plan: plan({ scope: 1, selected: [{ sourceArticleId: 'a', canonicalUrl: 'https://example.com/a' }] }), mode: 1, expectedUpdatedAtUnixMs: 0n }), /OFFICIAL_SCHEDULE_PLAN_INVALID/);
  await assert.rejects(f.store.save({ plan: plan({ accountId: 'other-account' }), mode: 1, expectedUpdatedAtUnixMs: 0n }), /ACCOUNT_NOT_FOUND/);
  assert.throws(() => f.store.listPlans({ accountId: 'other-account' }), /ACCOUNT_NOT_FOUND/);
});
