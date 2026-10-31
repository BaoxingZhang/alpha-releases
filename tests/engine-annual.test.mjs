import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearchFixture } from './search-fixture.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('annual analysis aggregates verified message rows and preserves explicit unsupported sections', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-annual-'));
  const fixture = await createSearchFixture({ directory: path.join(directory, 'data') });
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
  assert.ok(hello.hello.supportedMethodIds.includes(104));
  const response = await call('analyzeAnnual', { year: 2023, utcOffsetMinutes: 0 });
  assert.equal(response.error, undefined, response.error?.code);
  const result = response.analyzeAnnual;
  // The fixture deliberately contains one archived message table that is not
  // present in SessionTable; annual analysis scopes to discoverable sessions
  // and reports the resulting bounded scan truthfully.
  assert.equal(result.scannedMessages, 9);
  assert.equal(result.truncated, false);
  const report = JSON.parse(new TextDecoder().decode(result.reportJson));
  assert.equal(report.year, 2023);
  assert.equal(report.total_messages, 9);
  assert.equal(report.active_conversations, 2);
  assert.equal(report.sent_messages + report.received_messages, 9);
  assert.equal(report.top_terms.length, 0);
  assert.equal(report.moments, undefined);
  assert.equal(report.monthly_counts.reduce((a, b) => a + b, 0), 9);
  assert.ok(report.first_message && report.first_message.conversation_id);
});

test('annual analysis rejects unsupported year and offset before reading data', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-annual-invalid-'));
  const fixture = await createSearchFixture({ directory: path.join(directory, 'data') });
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload) {
    const input = EngineClientFrame.fromPartial({ requestId: ++id, [method]: method === 'hello' ? payload : { accountId: fixture.accountId, ...payload } });
    return EngineServerFrame.decode(EngineServerFrame.encode(await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(input).finish()))).finish());
  }
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  assert.equal((await call('analyzeAnnual', { year: 1969, utcOffsetMinutes: 0 })).error?.code, 'ANALYSIS_YEAR_INVALID');
  assert.equal((await call('analyzeAnnual', { year: 2023, utcOffsetMinutes: 841 })).error?.code, 'ANALYSIS_OPTIONS_INVALID');
});
