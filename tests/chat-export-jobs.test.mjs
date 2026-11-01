import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createSearchFixture } from './search-fixture.mjs';

const require = createRequire(import.meta.url);
const { createEngine, SUPPORTED } = require('../packages/alpha-engine/index.cjs');
const { createGenericJobs } = require('../packages/alpha-engine/generic-jobs.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

function ok(reply, method) {
  assert.equal(reply.error, undefined, reply.error?.code);
  assert.ok(reply[method]);
  return reply[method];
}

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/chat-export-jobs-'));
  const fixture = await createSearchFixture({ directory: path.join(directory, 'data') });
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  let sequence = 0n;
  async function call(method, payload = {}) {
    const request = EngineClientFrame.fromPartial({ requestId: ++sequence, [method]: { accountId: fixture.accountId, ...payload } });
    const decoded = EngineClientFrame.decode(EngineClientFrame.encode(request).finish());
    const response = await engine.dispatch(decoded);
    return EngineServerFrame.decode(EngineServerFrame.encode(response).finish());
  }
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  ok(await call('hello', { protocol: { major: 1, minor: 0 } }), 'hello');
  return { ...fixture, directory, call };
}

test('chat export jobs expose bounded in-memory status around verified read-only export', async t => {
  const f = await setup(t);
  const hello = ok(await f.call('hello', { protocol: { major: 1, minor: 0 } }), 'hello');
  for (const method of ['getChatExportCapabilities', 'startChatExport', 'listChatExports', 'watchChatExport', 'cancelChatExport', 'getJob', 'watchJob', 'cancelJob']) assert.ok(hello.supportedMethodIds.includes(SUPPORTED[method]), method);
  const capabilities = ok(await f.call('getChatExportCapabilities'), 'getChatExportCapabilities');
  assert.equal(capabilities.maxConversations, 500);
  assert.deepEqual(capabilities.mediaKinds, []);
  const outputDirectory = path.join(f.directory, 'jobs');
  const started = ok(await f.call('startChatExport', {
    conversationIds: [f.conversationId], format: 'json', outputDirectory, voiceTranscripts: false,
  }), 'startChatExport');
  assert.match(started.jobId, /^[0-9a-f-]{36}$/);
  const genericQueued = ok(await f.call('getJob', { jobId: started.jobId }), 'getJob');
  assert.equal(genericQueued.jobId, started.jobId);
  assert.equal(genericQueued.kind, 1);
  assert.ok(genericQueued.latestEventSeq >= 1n);
  const genericEvents = ok(await f.call('watchJob', { jobId: started.jobId, afterEventSeq: 0n }), 'watchJob');
  assert.equal(genericEvents.events.length, 1);
  assert.equal(genericEvents.events[0].jobId, started.jobId);
  assert.equal(genericEvents.events[0].progress.totalItems, 1n);
  const noNewGenericEvents = ok(await f.call('watchJob', { jobId: started.jobId, afterEventSeq: genericEvents.events[0].eventSeq }), 'watchJob');
  assert.equal(noNewGenericEvents.events.length, 0);
  let snapshot;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    snapshot = ok(await f.call('watchChatExport', { jobId: started.jobId }), 'watchChatExport');
    if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(snapshot.state)) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(snapshot.state, 'completed');
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].state, 'completed');
  assert.equal(snapshot.items[0].messagesDone, 6n);
  const genericCompleted = ok(await f.call('getJob', { jobId: started.jobId }), 'getJob');
  assert.equal(genericCompleted.state, 10);
  assert.equal(genericCompleted.phase, 8);
  assert.equal(genericCompleted.finishedAtUnixMs > 0n, true);
  const genericDoneEvents = ok(await f.call('watchJob', { jobId: started.jobId, afterEventSeq: genericEvents.events[0].eventSeq }), 'watchJob');
  assert.equal(genericDoneEvents.done, true);
  assert.equal(genericDoneEvents.events.length, 1);
  const exported = JSON.parse(await fs.readFile(snapshot.items[0].path, 'utf8'));
  assert.equal(exported.itemCount, 6);
  const listed = ok(await f.call('listChatExports'), 'listChatExports');
  assert.equal(listed.jobs.length, 1);
  assert.equal(listed.jobs[0].jobId, started.jobId);
});

test('chat export jobs reject unsupported filtering and unknown cancellation without writing output', async t => {
  const f = await setup(t);
  const outputDirectory = path.join(f.directory, 'jobs');
  const wrongAccount = await f.call('startChatExport', { accountId: 'other-account', conversationIds: [f.conversationId], format: 'json', outputDirectory });
  assert.equal(wrongAccount.error.code, 'ACCOUNT_NOT_FOUND');
  const wrongList = await f.call('listChatExports', { accountId: 'other-account' });
  assert.equal(wrongList.error.code, 'ACCOUNT_NOT_FOUND');
  const unsupported = await f.call('startChatExport', { conversationIds: [f.conversationId], format: 'json', outputDirectory, messageTypes: ['text'], voiceTranscripts: false });
  assert.equal(unsupported.error.code, 'CHAT_EXPORT_OPTION_UNSUPPORTED');
  const missing = await f.call('cancelChatExport', { jobId: 'missing-job' });
  assert.equal(missing.error.code, 'CHAT_EXPORT_JOB_NOT_FOUND');
  const missingGeneric = await f.call('getJob', { jobId: 'missing-job' });
  assert.equal(missingGeneric.error.code, 'JOB_NOT_FOUND');
  await assert.rejects(fs.access(outputDirectory));
});

test('chat export jobs can publish static HTML conversation files', async t => {
  const f = await setup(t);
  const outputDirectory = path.join(f.directory, 'html-jobs');
  const started = ok(await f.call('startChatExport', {
    conversationIds: [f.conversationId], format: 'html', outputDirectory, voiceTranscripts: false,
  }), 'startChatExport');
  let snapshot;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    snapshot = ok(await f.call('watchChatExport', { jobId: started.jobId }), 'watchChatExport');
    if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(snapshot.state)) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(snapshot.state, 'completed');
  assert.equal(snapshot.items[0].state, 'completed');
  const exported = await fs.readFile(snapshot.items[0].path, 'utf8');
  assert.match(exported, /^<!doctype html>/);
  assert.match(exported, /Content-Security-Policy/);
  assert.match(exported, /压缩维护 needle zstd 中文/);
});

test('chat export jobs can publish XLSX conversation files', async t => {
  const f = await setup(t);
  const outputDirectory = path.join(f.directory, 'xlsx-jobs');
  const started = ok(await f.call('startChatExport', {
    conversationIds: [f.conversationId], format: 'xlsx', outputDirectory, voiceTranscripts: false,
  }), 'startChatExport');
  let snapshot;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    snapshot = ok(await f.call('watchChatExport', { jobId: started.jobId }), 'watchChatExport');
    if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(snapshot.state)) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(snapshot.state, 'completed');
  assert.equal(snapshot.items[0].state, 'completed');
  const exported = await fs.readFile(snapshot.items[0].path);
  assert.equal(exported.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(exported.includes(Buffer.from('wxid_alpha')));
});

test('chat export jobs publish derived formats with their declared extensions', async t => {
  const f = await setup(t);
  for (const [format, extension] of [['chatlab-json', '.json'], ['chatlab-jsonl', '.jsonl'], ['sql', '.sql'], ['weclone', '.csv']]) {
    const outputDirectory = path.join(f.directory, `derived-${format}`);
    const started = ok(await f.call('startChatExport', {
      conversationIds: [f.conversationId], format, outputDirectory, voiceTranscripts: false,
    }), 'startChatExport');
    let snapshot;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      snapshot = ok(await f.call('watchChatExport', { jobId: started.jobId }), 'watchChatExport');
      if (['completed', 'completed_with_errors', 'failed', 'canceled'].includes(snapshot.state)) break;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    assert.equal(snapshot.state, 'completed');
    assert.match(snapshot.items[0].path, new RegExp(`${extension.replace('.', '\\.')}$`));
  }
});

test('generic job cursor advances for same-millisecond item progress and reaches cancel terminal state', () => {
  let snapshot = {
    jobId: 'job-1', state: 'running', createdAtUnixMs: 1n, updatedAtUnixMs: 2n,
    finishedAtUnixMs: 0n, items: [{ state: 'running', phase: 'reading', messagesDone: 0n, messagesTotal: 2n, mediaSaved: 0n, mediaFailed: 0n }]
  };
  const manager = {
    watch(jobId) {
      if (jobId !== snapshot.jobId) throw new Error('CHAT_EXPORT_JOB_NOT_FOUND');
      return { ...snapshot, items: snapshot.items.map(item => ({ ...item })) };
    },
    cancel(jobId) {
      if (jobId !== snapshot.jobId) throw new Error('CHAT_EXPORT_JOB_NOT_FOUND');
      snapshot = { ...snapshot, state: 'canceled', finishedAtUnixMs: 3n, updatedAtUnixMs: 2n };
    }
  };
  const missing = { watch: () => { throw new Error('CHAT_EXPORT_JOB_NOT_FOUND'); }, cancel: () => { throw new Error('CHAT_EXPORT_JOB_NOT_FOUND'); } };
  const generic = createGenericJobs({ chatExportJobs: manager, recordExportJobs: missing, now: () => 99n });
  const initial = generic.watchJob({ jobId: 'job-1', afterEventSeq: 0n });
  assert.equal(initial.events.length, 1);
  const firstSeq = initial.events[0].eventSeq;
  snapshot.items[0].messagesDone = 1n;
  const progressed = generic.watchJob({ jobId: 'job-1', afterEventSeq: firstSeq });
  assert.equal(progressed.events.length, 1);
  assert.equal(progressed.events[0].eventSeq, firstSeq + 1n);
  const unchanged = generic.watchJob({ jobId: 'job-1', afterEventSeq: progressed.events[0].eventSeq });
  assert.equal(unchanged.events.length, 0);
  const canceled = generic.cancelJob({ jobId: 'job-1', reasonCode: 'user_cancel' });
  assert.equal(canceled.state, 9);
  const done = generic.watchJob({ jobId: 'job-1', afterEventSeq: progressed.events[0].eventSeq });
  assert.equal(done.done, true);
  assert.equal(done.events.length, 1);
  assert.equal(done.events[0].stateChanged.current, 9);
  assert.throws(() => generic.watchJob({ jobId: 'job-1', afterEventSeq: 1 }), /JOB_CURSOR_INVALID/);
});
