import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFavoritesFixture } from './favorites-fixture.mjs';

const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

async function waitForTerminal(call, jobId) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const reply = await call('watchChatExport', { jobId });
    const snapshot = reply.watchChatExport;
    if (['canceled', 'completed', 'completed_with_errors', 'failed'].includes(snapshot.state)) return snapshot;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('favorites export did not finish');
}

async function createHarness(t) {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-favorites-export-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFavoritesFixture(dataDir);
  // Include values that must be filtered from the bounded field projection.
  await execute('/usr/bin/python3', ['-c', [
    'import sqlite3,sys,json',
    'db=sqlite3.connect(sys.argv[1]+"/favorite.db")',
    'db.execute("UPDATE __alpha_favorites_v1 SET description=?, fields_json=? WHERE id=?", ("说明 https://example.invalid/embedded", json.dumps([{"name":"kind","value":"text","valueKind":1,"truncated":False},{"name":"downloadUrl","value":"https://example.invalid/file","valueKind":1,"truncated":False},{"name":"opaqueToken","value":"fav1_0123456789abcdef0123456789abcdef","valueKind":1,"truncated":False}]), "f1"))',
    'db.commit();db.close()'
  ].join('\n'), dataDir]);
  const stateDir = path.join(outer, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let requestId = 0n;
  const call = async (method, payload = {}) => {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: { accountId: fixture.accountId, ...payload } });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  };
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  return { outer, fixture, call };
}

test('startRecordExport exports synthetic favorites as metadata-only JSON/CSV/XLSX', async t => {
  const { outer, fixture, call } = await createHarness(t);
  for (const format of ['json', 'csv', 'xlsx']) {
    const started = await call('startRecordExport', {
      format,
      outputDirectory: path.join(outer, `out-${format}`),
      categories: [{ category: 'favorites' }]
    });
    assert.equal(started.error, undefined, started.error?.code);
    const snapshot = await waitForTerminal(call, started.startRecordExport.jobId);
    assert.equal(snapshot.state, 'completed');
    assert.equal(snapshot.items[0].conversationId, 'favorites');
    assert.equal(snapshot.items[0].messagesDone, 3n);
    const output = await fs.readFile(snapshot.items[0].path);
    if (format === 'json') {
      const parsed = JSON.parse(output);
      assert.equal(parsed.kind, 'favorites');
      assert.equal(parsed.syntheticOnly, true);
      assert.equal(parsed.nativeSchemaSupported, false);
      assert.equal(parsed.metadataOnly, true);
      assert.equal(parsed.itemCount, 3);
      const first = parsed.favorites.find(row => row.id === 'f1');
      assert.equal(first.sourceTable, '__alpha_favorites_v1');
      assert.equal(first.description, '');
      assert.deepEqual(first.fields.map(field => field.name), ['kind']);
      assert.equal(Object.hasOwn(first, 'contentXml'), false);
      assert.doesNotMatch(output.toString('utf8'), /<msg>|fav1_0123456789abcdef0123456789abcdef|https:\/\/example\.invalid/);
    } else if (format === 'csv') {
      const text = output.toString('utf8');
      assert.match(text, /^id,type,updatedAtUnixMs,/);
      assert.match(text, /syntheticOnly/);
      assert.doesNotMatch(text, /contentXml|fav1_0123456789abcdef0123456789abcdef|https:\/\/example\.invalid/);
    } else {
      assert.equal(output.subarray(0, 2).toString('hex'), '504b');
    }
  }
  const selected = await call('startRecordExport', {
    format: 'json',
    outputDirectory: path.join(outer, 'selected'),
    categories: [{ category: 'favorites', selected: true, recordIds: ['f2'] }]
  });
  assert.equal(selected.error, undefined, selected.error?.code);
  const selectedSnapshot = await waitForTerminal(call, selected.startRecordExport.jobId);
  assert.equal(selectedSnapshot.state, 'completed');
  const selectedPayload = JSON.parse(await fs.readFile(selectedSnapshot.items[0].path, 'utf8'));
  assert.deepEqual(selectedPayload.favorites.map(row => row.id), ['f2']);
});

test('favorites export rejects missing selected records without writing output', async t => {
  const { outer, call } = await createHarness(t);
  const started = await call('startRecordExport', {
    format: 'json',
    outputDirectory: path.join(outer, 'missing'),
    categories: [{ category: 'favorites', selected: true, recordIds: ['missing'] }]
  });
  assert.equal(started.error, undefined, started.error?.code);
  const snapshot = await waitForTerminal(call, started.startRecordExport.jobId);
  assert.equal(snapshot.state, 'completed_with_errors');
  assert.equal(snapshot.items[0].errorCode, 'RECORD_EXPORT_RECORD_NOT_FOUND');
});
