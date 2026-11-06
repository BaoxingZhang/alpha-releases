import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createFixture } from './data-bridge-fixture.mjs';

const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createPersonaProfileJobs } = require('../packages/alpha-engine/persona-profile-jobs.cjs');

const root = path.resolve(new URL('..', import.meta.url).pathname);
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-persona-profile-'));
  const fixture = await createFixture(path.join(directory, 'data'));
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let requestId = 0n;
  async function call(method, payload = {}) {
    const frame = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: method === 'hello' ? payload : { accountId: fixture.accountId, ...payload } });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(frame).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  }
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  return { fixture, call };
}

async function waitForTerminal(call, buildId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await call('watchPersonaProfile', { buildId });
    assert.equal(response.error, undefined, response.error?.code);
    const snapshot = response.watchPersonaProfile;
    if (snapshot.state !== 1) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('persona profile did not reach a terminal state');
}

test('persona profile wraps the shipped local data-analysis CLI with bounded evidence', async t => {
  const { fixture, call } = await setup(t);
  const started = await call('startPersonaProfile', { conversationId: fixture.conversationId, perspective: 1, pageSize: 100, maxPages: 10, maxMessages: 100 });
  assert.equal(started.error, undefined, started.error?.code);
  assert.equal(started.startPersonaProfile.perspective, 1);
  assert.equal(started.startPersonaProfile.profileVersion, 'alpha-persona-v2');
  const result = await waitForTerminal(call, started.startPersonaProfile.buildId);
  assert.equal(result.state, 2);
  assert.equal(result.profileVersion, 'alpha-persona-v2');
  assert.equal(result.sourceTruncated, false);
  assert.equal(result.sourceMessagesRead, 6n);
  assert.ok(result.sourceBytesRead > 0n);
  assert.ok(result.result);
  const profile = JSON.parse(new TextDecoder().decode(result.result.profileJson));
  assert.equal(profile.algorithm_version, 'alpha-persona-v2');
  assert.equal(profile.perspective, 'friend_clone');
  assert.equal(profile.scanned_messages, 6);
  assert.ok(profile.subject_messages > 0);
  assert.ok(profile.citable_message_ids.length > 0);
  assert.equal(result.result.profileDigest.length, 32);
  assert.equal(result.result.pageLimit, 10);
  assert.equal(result.result.messageLimit, 100);
  assert.equal((await call('cancelPersonaProfile', { buildId: started.startPersonaProfile.buildId })).cancelPersonaProfile.cancellationRequested, false);
  assert.equal((await call('watchPersonaProfile', { buildId: 'missing-persona-build' })).error?.code, 'PERSONA_PROFILE_NOT_FOUND');
});

test('persona profile self perspective and limits remain bound to the selected conversation', async t => {
  const { fixture, call } = await setup(t);
  const started = await call('startPersonaProfile', { conversationId: fixture.conversationId, perspective: 2, pageSize: 2, maxPages: 1, maxMessages: 2 });
  assert.equal(started.error, undefined, started.error?.code);
  const result = await waitForTerminal(call, started.startPersonaProfile.buildId);
  assert.equal(result.state, 2);
  assert.equal(result.sourceMessagesRead, 2n);
  assert.equal(result.sourceTruncated, true);
  const profile = JSON.parse(new TextDecoder().decode(result.result.profileJson));
  assert.equal(profile.perspective, 'self_reply');
  assert.equal(profile.scanned_messages, 2);
  assert.equal(profile.source_truncated, true);
  assert.equal((await call('startPersonaProfile', { conversationId: fixture.conversationId, perspective: 0 })).error?.code, 'PERSONA_PERSPECTIVE_INVALID');
  assert.equal((await call('startPersonaProfile', { accountId: 'other-account', conversationId: fixture.conversationId, perspective: 1 })).error?.code, 'ACCOUNT_NOT_FOUND');
});

test('persona cancellation reports cooperative running state before terminal cancellation', async () => {
  let release;
  const jobs = createPersonaProfileJobs({
    runProfile: async (_request, { isCanceled }) => {
      await new Promise(resolve => { release = resolve; });
      if (isCanceled()) throw new Error('PERSONA_PROFILE_CANCELED');
      throw new Error('PERSONA_PROFILE_TEST_UNEXPECTED');
    }
  });
  try {
    const started = jobs.start({ accountId: 'synthetic', perspective: 1, maxPages: 1, maxMessages: 1 });
    const cancellation = jobs.cancel(started.buildId);
    assert.deepEqual(cancellation, { buildId: started.buildId, cancellationRequested: true, state: 1 });
    assert.equal(jobs.watch(started.buildId).state, 1);
    release();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(resolve => setImmediate(resolve));
      if (jobs.watch(started.buildId).state !== 1) break;
    }
    assert.equal(jobs.watch(started.buildId).state, 3);
  } finally {
    release?.();
    await jobs.close();
  }
});
