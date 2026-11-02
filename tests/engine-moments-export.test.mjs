import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createEngine } from '../packages/alpha-engine/index.cjs';
import { createSecurity } from '../packages/alpha-security/index.cjs';
import { createMomentsFixture, installMomentEmojiFixture } from './moments-fixture.mjs';

const require = createRequire(import.meta.url);
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('synthetic moments export writes bounded JSON/Markdown/TXT/HTML and preserves filters', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-moments-export-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createMomentsFixture(dataDir);
  const stateDir = path.join(outer, 'state');
  const outputDirectory = path.join(outer, 'exports');
  await fs.mkdir(stateDir, { mode: 0o700 });
  await fs.mkdir(outputDirectory, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let requestId = 0n;
  async function call(method, payload = {}) {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: { accountId: fixture.accountId, ...payload } });
    const result = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(result).finish());
  }
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.ok(hello.hello.supportedMethodIds.includes(135));
  const formats = ['json', 'markdown', 'txt', 'html'];
  for (const format of formats) {
    const started = await call('startMomentExport', { format, outputDirectory, usernames: ['wxid_a'], keyword: 'again', mediaKinds: [], utcOffsetMinutes: 0 });
    assert.equal(started.error, undefined, started.error?.code);
    const jobId = started.startMomentExport.jobId;
    let snapshot;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const watched = await call('watchChatExport', { jobId });
      assert.equal(watched.error, undefined, watched.error?.code);
      snapshot = watched.watchChatExport;
      if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(snapshot.state)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(snapshot.state, 'completed');
    assert.equal(snapshot.kind, 'moments');
    assert.equal(snapshot.items[0].messagesDone, 1n);
    const output = await fs.readFile(snapshot.items[0].path, 'utf8');
    assert.match(output, /again/);
    assert.doesNotMatch(output, /hello/);
    if (format === 'json') {
      const parsed = JSON.parse(output);
      assert.equal(parsed.syntheticOnly, true);
      assert.equal(parsed.metadataOnly, true);
      assert.equal(parsed.itemCount, 1);
      assert.equal(parsed.moments[0].sourceTable, '__alpha_moments_v1');
    }
    assert.equal((await call('listChatExports')).listChatExports.jobs.some(job => job.jobId === jobId && job.kind === 'moments'), true);
  }
  const rejected = await call('startMomentExport', { format: 'json', outputDirectory, usernames: [], keyword: '', mediaKinds: ['image'], utcOffsetMinutes: 0 });
  assert.equal(rejected.error.code, 'MOMENT_EXPORT_MEDIA_UNAVAILABLE');
});

test('synthetic moments export rejects unsafe ranges and paths before a job starts', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-moments-export-invalid-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createMomentsFixture(dataDir);
  const stateDir = path.join(outer, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let requestId = 0n;
  async function call(payload) {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, startMomentExport: { accountId: fixture.accountId, ...payload } });
    const result = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(result).finish());
  }
  async function watch(jobId) {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, watchChatExport: { jobId } });
    const result = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(result).finish());
  }
  {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, hello: { protocol: { major: 1, minor: 0 } } });
    const result = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    assert.equal(EngineServerFrame.decode(EngineServerFrame.encode(result).finish()).error, undefined);
  }
  assert.equal((await call({ format: 'json', outputDirectory: path.join(outer, 'out'), usernames: [], keyword: '', startTimeUnixMs: 20n, endTimeUnixMs: 10n, mediaKinds: [], utcOffsetMinutes: 0 })).error.code, 'MOMENT_EXPORT_REQUEST_INVALID');
  const unsafe = await call({ format: 'json', outputDirectory: dataDir, usernames: [], keyword: '', mediaKinds: [], utcOffsetMinutes: 0 });
  assert.equal(unsafe.error, undefined);
  let unsafeSnapshot;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    unsafeSnapshot = await watch(unsafe.startMomentExport.jobId);
    if (unsafeSnapshot.watchChatExport.items[0].errorCode) break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(unsafeSnapshot.watchChatExport.items[0].errorCode, 'EXPORT_DESTINATION_INVALID');
});

test('synthetic moments export includes only bounded projection metadata and verified emoji metadata', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-moments-export-projection-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createMomentsFixture(dataDir);
  await installMomentEmojiFixture(dataDir, fixture.accountId);
  const stateDir = path.join(outer, 'state');
  const outputDirectory = path.join(outer, 'exports');
  await fs.mkdir(stateDir, { mode: 0o700 });
  await fs.mkdir(outputDirectory, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let requestId = 0n;
  async function call(method, payload = {}) {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: { accountId: fixture.accountId, ...payload } });
    const result = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(result).finish());
  }
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.equal(hello.error, undefined);
  for (const format of ['json', 'markdown', 'txt', 'html']) {
    const destinationPath = path.join(outputDirectory, `projection.${format === 'markdown' ? 'md' : format}`);
    const started = await call('startMomentExport', { format, destinationPath, outputDirectory, usernames: ['wxid_a'], keyword: '', mediaKinds: [], utcOffsetMinutes: 0 });
    assert.equal(started.error, undefined, started.error?.code);
    let snapshot;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      snapshot = (await call('watchChatExport', { jobId: started.startMomentExport.jobId })).watchChatExport;
      if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(snapshot.state)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(snapshot.state, 'completed');
    const output = await fs.readFile(snapshot.items[0].path, 'utf8');
    assert.doesNotMatch(output, /<msg>|rawXml|__alpha_moment_details/);
    if (format === 'json') {
      const parsed = JSON.parse(output);
      assert.equal(parsed.projectionAvailable, true);
      const item = parsed.moments.find(moment => moment.id === 'm1');
      assert.equal(item.projectionAvailable, true);
      assert.equal(item.projection.schema, 'alpha.moment.v1');
      assert.equal(item.projection.comments[0].content, '[动画表情]');
      assert.equal(item.projection.comments[0].emojis[0].verified, true);
      assert.match(item.projection.comments[0].emojis[0].sha256, /^[a-f0-9]{64}$/);
      assert.equal(item.projection.comments[0].emojis[0].mimeType, 'image/png');
      assert.equal(item.projection.comments[0].emojis[0].sizeBytes > 0, true);
      assert.equal(Object.hasOwn(item, 'rawXml'), false);
      assert.equal(Object.hasOwn(item, 'fields'), false);
    } else {
      assert.match(output, /projectionAvailable: true|projection available|projection.*plain/);
      assert.match(output, /verified emoji/);
    }
  }
});
