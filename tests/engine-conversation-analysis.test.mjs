import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFixture } from './data-bridge-fixture.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('conversation analysis aggregates verified message DTOs into the relationship report shape', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-conversation-analysis-'));
  const fixture = await createFixture(path.join(directory, 'data'));
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const input = EngineClientFrame.fromPartial({ requestId: ++id, [method]: { accountId: fixture.accountId, ...payload } });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(input).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  }
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.equal(hello.error, undefined);
  assert.ok(hello.hello.supportedMethodIds.includes(24));

  const response = await call('analyzeConversation', { conversationId: fixture.conversationId, maxMessages: 50, utcOffsetMinutes: 0 });
  assert.equal(response.error, undefined, response.error?.code);
  assert.equal(response.analyzeConversation.itemCount, 6);
  assert.equal(response.analyzeConversation.truncated, false);
  const report = JSON.parse(new TextDecoder().decode(response.analyzeConversation.reportJson));
  assert.equal(report.algorithm_version, 'alpha-independent-conversation-v1');
  assert.equal(report.total_messages, 6);
  assert.equal(report.scanned_messages, 6);
  assert.equal(report.sent_messages + report.received_messages + report.unknown_messages, 6);
  assert.equal(report.active_days, 1);
  assert.equal(report.active_hours.reduce((sum, value) => sum + value, 0), 6);
  assert.equal(report.message_types.text, 5);
  assert.equal(report.message_types.other, 1);
  assert.equal(report.initiative.mine + report.initiative.peer + report.initiative.unknown, 6);
  assert.equal(report.monthly_counts['2023-11'], 6);
  assert.ok(report.first_message && report.last_message);
  assert.deepEqual(report.top_terms, []);
  assert.deepEqual(report.journey.moments, []);
  assert.equal(report.response.mine_average_ms, null);
});

test('conversation analysis reports truncation at the explicit message bound', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-conversation-analysis-limit-'));
  const fixture = await createFixture(path.join(directory, 'data'));
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const input = EngineClientFrame.fromPartial({ requestId: ++id, [method]: { accountId: fixture.accountId, ...payload } });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(input).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  }
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  const response = await call('analyzeConversation', { conversationId: fixture.conversationId, maxMessages: 3 });
  assert.equal(response.error, undefined, response.error?.code);
  assert.equal(response.analyzeConversation.itemCount, 3);
  assert.equal(response.analyzeConversation.truncated, true);
  const report = JSON.parse(new TextDecoder().decode(response.analyzeConversation.reportJson));
  assert.equal(report.scanned_messages, 3);
  assert.equal(report.truncated, true);
  assert.equal(report.journey.truncated, true);
});

