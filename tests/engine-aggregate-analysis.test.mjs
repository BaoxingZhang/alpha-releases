import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixture } from './data-bridge-fixture.mjs';
import { createSearchFixture } from './search-fixture.mjs';
import { createAnalysisFixture } from './analysis-fixture.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createAggregateAnalysisJobs } = require('../packages/alpha-engine/aggregate-analysis-jobs.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

async function setupEngine(t, makeFixture) {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-aggregate-analysis-'));
  const fixture = await makeFixture(path.join(directory, 'data'));
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const input = EngineClientFrame.fromPartial({ requestId: ++id, [method]: method === 'hello' ? payload : { accountId: fixture.accountId, ...payload } });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(input).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  }
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  return { fixture, call };
}

async function waitForTerminal(call, analysisId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await call('watchAggregateAnalysis', { analysisId });
    assert.equal(response.error, undefined, response.error?.code);
    const snapshot = response.watchAggregateAnalysis;
    if (snapshot.state !== 1) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('aggregate analysis did not reach a terminal state');
}

test('aggregate group analysis is bounded, reports the conversation DTO and has terminal cancellation semantics', async t => {
  const { fixture, call } = await setupEngine(t, createFixture);
  const started = await call('startAggregateAnalysis', { scope: 2, conversationId: fixture.conversationId });
  assert.equal(started.error, undefined, started.error?.code);
  const job = started.startAggregateAnalysis;
  assert.match(job.analysisId, /^[0-9a-f-]{36}$/);
  assert.equal(job.conversationsTotal, 1);
  assert.ok(job.expiresAtUnixMs > BigInt(Date.now()));

  const completed = await waitForTerminal(call, job.analysisId);
  assert.equal(completed.state, 2);
  assert.equal(completed.conversationsDone, 1);
  assert.equal(completed.conversationsTotal, 1);
  assert.equal(completed.conversationsFailed, 0);
  const report = JSON.parse(new TextDecoder().decode(completed.reportJson));
  assert.equal(report.algorithm_version, 'alpha-aggregate-v1');
  assert.equal(report.scope, 'group_chat');
  assert.equal(report.total_messages, 6);
  assert.equal((await call('cancelAggregateAnalysis', { analysisId: job.analysisId })).cancelAggregateAnalysis.canceled, false);
  assert.equal((await call('watchAggregateAnalysis', { analysisId: 'missing-analysis-id' })).error?.code, 'ANALYSIS_NOT_FOUND');
  assert.equal((await call('watchAggregateAnalysis', { analysisId: '' })).error?.code, 'ANALYSIS_ID_INVALID');
});

test('aggregate annual analysis enforces full local-year bounds and counts all discoverable sessions', async t => {
  const { fixture, call } = await setupEngine(t, createSearchFixture);
  const fromUnixMs = BigInt(Date.UTC(2023, 0, 1));
  const toUnixMs = BigInt(Date.UTC(2024, 0, 1));
  const started = await call('startAggregateAnalysis', { scope: 3, fromUnixMs, toUnixMs, utcOffsetMinutes: 0 });
  assert.equal(started.error, undefined, started.error?.code);
  assert.equal(started.startAggregateAnalysis.conversationsTotal, 2);
  const completed = await waitForTerminal(call, started.startAggregateAnalysis.analysisId);
  assert.equal(completed.state, 2);
  assert.equal(completed.conversationsDone, 2);
  const report = JSON.parse(new TextDecoder().decode(completed.reportJson));
  assert.equal(report.algorithm_version, 'alpha-annual-v2');
  assert.equal(report.year, 2023);
  assert.equal(report.overview.total_messages, 9);
  assert.equal(report.conversations_with_messages, 2);

  const excluded = await call('startAggregateAnalysis', { scope: 3, fromUnixMs, toUnixMs, excludedConversationIds: [fixture.secondConversationId] });
  assert.equal(excluded.error, undefined, excluded.error?.code);
  assert.equal(excluded.startAggregateAnalysis.conversationsTotal, 1);
  const excludedReport = await waitForTerminal(call, excluded.startAggregateAnalysis.analysisId);
  assert.equal(excludedReport.state, 2);
  assert.equal(excludedReport.conversationsDone, 1);
  assert.equal(JSON.parse(new TextDecoder().decode(excludedReport.reportJson)).conversations_with_messages, 1);

  const dual = await call('startAggregateAnalysis', { scope: 4, conversationId: fixture.conversationId, fromUnixMs, toUnixMs });
  assert.equal(dual.error, undefined, dual.error?.code);
  const dualReport = await waitForTerminal(call, dual.startAggregateAnalysis.analysisId);
  assert.equal(dualReport.state, 2);
  const dualJson = JSON.parse(new TextDecoder().decode(dualReport.reportJson));
  assert.equal(dualJson.algorithm_version, 'alpha-dual-v1');
  assert.equal(dualJson.conversation_id, fixture.conversationId);

  const privateRun = await call('startAggregateAnalysis', { scope: 1, fromUnixMs, toUnixMs, excludedConversationIds: [fixture.secondConversationId] });
  assert.equal(privateRun.error, undefined, privateRun.error?.code);
  const privateReport = await waitForTerminal(call, privateRun.startAggregateAnalysis.analysisId);
  assert.equal(privateReport.state, 2);
  const privateJson = JSON.parse(new TextDecoder().decode(privateReport.reportJson));
  assert.equal(privateJson.algorithm_version, 'alpha-aggregate-v1');
  assert.equal(privateJson.scope, 'private_chats');

  assert.equal((await call('startAggregateAnalysis', { scope: 0, conversationId: fixture.conversationId })).error?.code, 'ANALYSIS_SCOPE_UNSUPPORTED');
  assert.equal((await call('startAggregateAnalysis', { scope: 1, conversationId: fixture.conversationId, fromUnixMs, toUnixMs })).error?.code, 'ANALYSIS_SCOPE_OPTIONS_INVALID');
  assert.equal((await call('startAggregateAnalysis', { scope: 2, conversationId: fixture.conversationId, fromUnixMs })).error?.code, 'ANALYSIS_SCOPE_OPTIONS_UNSUPPORTED');
  assert.equal((await call('startAggregateAnalysis', { scope: 3, fromUnixMs, toUnixMs: undefined })).error?.code, 'ANALYSIS_SCOPE_OPTIONS_INVALID');
  assert.equal((await call('startAggregateAnalysis', { scope: 3, fromUnixMs: fromUnixMs + 1n, toUnixMs })).error?.code, 'ANALYSIS_SCOPE_OPTIONS_INVALID');
  assert.equal((await call('startAggregateAnalysis', { scope: 3, fromUnixMs, toUnixMs, conversationId: fixture.conversationId })).error?.code, 'ANALYSIS_SCOPE_OPTIONS_INVALID');
});

test('aggregate mention analysis detects only explicit peer mention tokens', async t => {
  const { fixture, call } = await setupEngine(t, createAnalysisFixture);
  const started = await call('startAggregateAnalysis', { scope: 5, utcOffsetMinutes: 480 });
  assert.equal(started.error, undefined, started.error?.code);
  assert.equal(started.startAggregateAnalysis.conversationsTotal, 1);
  const completed = await waitForTerminal(call, started.startAggregateAnalysis.analysisId);
  assert.equal(completed.state, 2);
  const report = JSON.parse(new TextDecoder().decode(completed.reportJson));
  assert.equal(report.algorithm_version, 'alpha-mentions-v1');
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
  assert.equal(report.utc_offset_minutes, 480);
  assert.equal(report.conversations_analyzed, 1);
  assert.equal(report.mention_total, 1);
  assert.equal(report.mention_all_total, 1);
  assert.equal(report.items.length, 2);
  assert.equal(report.items.some(item => item.is_all), true);
  assert.equal(report.groups[0].conversation_id, fixture.groupConversationId);
});

test('aggregate footprint analysis reports private activity and bounded group mentions', async t => {
  const { fixture, call } = await setupEngine(t, createAnalysisFixture);
  const started = await call('startAggregateAnalysis', { scope: 6, utcOffsetMinutes: 0 });
  assert.equal(started.error, undefined, started.error?.code);
  assert.equal(started.startAggregateAnalysis.conversationsTotal, 2);
  const completed = await waitForTerminal(call, started.startAggregateAnalysis.analysisId);
  assert.equal(completed.state, 2);
  const report = JSON.parse(new TextDecoder().decode(completed.reportJson));
  assert.equal(report.algorithm_version, 'alpha-footprint-v1');
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
  assert.equal(report.private.conversations_analyzed, 2);
  assert.equal(report.private.sent_messages > 0, true);
  assert.equal(report.private.received_messages > 0, true);
  assert.equal(report.private.people.length, 2);
  assert.equal(report.sessions.length > 0, true);
  assert.equal(report.mentions.conversations_analyzed, 1);
  assert.equal(report.mentions.mention_total, 1);
  assert.equal(report.mentions.mention_all_total, 1);
  assert.equal(report.sessions.every(session => /^-?\d{1,20}$/.test(session.anchor_message_id)), true);
});

test('aggregate analysis job manager cancels running work and rejects malformed reports', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const jobs = createAggregateAnalysisJobs({ runAnalysis: async (_request, { isCanceled }) => {
    while (!isCanceled()) await gate;
    throw new Error('ANALYSIS_CANCELED');
  } });
  const started = jobs.start({ accountId: 'synthetic-account' }, 1);
  assert.equal(jobs.cancel(started.analysisId).canceled, true);
  release();
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (jobs.watch(started.analysisId).state !== 1) break;
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  assert.equal(jobs.watch(started.analysisId).state, 4);
  assert.equal(jobs.cancel(started.analysisId).canceled, false);
  const malformed = createAggregateAnalysisJobs({ runAnalysis: async () => ({ reportJson: 'not-bytes' }) });
  const malformedId = malformed.start({ accountId: 'synthetic-account' }, 0).analysisId;
  for (let attempt = 0; attempt < 20 && malformed.watch(malformedId).state === 1; attempt += 1) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(malformed.watch(malformedId).state, 3);
  assert.equal(malformed.watch(malformedId).errorCode, 'ANALYSIS_REPORT_INVALID');
  await jobs.close(); await malformed.close();
});
