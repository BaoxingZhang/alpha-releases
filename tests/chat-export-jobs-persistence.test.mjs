import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createChatExportJobs, STATE_FILE } = require('../packages/alpha-engine/chat-export-jobs.cjs');

const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

async function make(t) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/chat-export-jobs-persist-'));
  const stateDir = path.join(root, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  // A newly opened job manager normalizes its durable snapshot through an
  // atomic background write. Test cleanup can run before that write finishes,
  // so retry removal briefly instead of leaving a state directory behind or
  // turning a successful lifecycle assertion into an ENOTEMPTY failure.
  t.after(async () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        await fs.rm(root, { recursive: true, force: true });
        return;
      } catch (failure) {
        if (!['ENOTEMPTY', 'EINVAL', 'EBUSY'].includes(failure?.code) || attempt === 49) throw failure;
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    }
  });
  return { root, stateDir };
}

test('chat export job history survives engine restart', async t => {
  const f = await make(t);
  const output = path.join(f.root, 'out');
  const jobs = createChatExportJobs({
    stateDir: f.stateDir,
    runExport: async ({ conversationId, destinationPath }) => ({ itemCount: 2, destinationPath: path.join(output, `${conversationId}.json`) })
  });
  const { jobId } = jobs.start({ accountId, conversationIds: ['wxid_alpha'], format: 'json', outputDirectory: output });
  for (let i = 0; i < 100; i += 1) {
    if (['completed', 'failed', 'completed_with_errors', 'canceled'].includes(jobs.watch(jobId).state)) break;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.equal(jobs.watch(jobId).state, 'completed');
  await jobs.close();
  const reopened = createChatExportJobs({ stateDir: f.stateDir, runExport: async () => ({ itemCount: 0, destinationPath: '' }) });
  t.after(async () => reopened.close());
  const listed = reopened.list(accountId);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].jobId, jobId);
  assert.equal(listed[0].items[0].messagesDone, 2n);
  await reopened.close();
});

test('restart converts an in-flight persisted job into an explicit failed record', async t => {
  const f = await make(t);
  const now = '1700000000000';
  await fs.writeFile(path.join(f.stateDir, STATE_FILE), JSON.stringify({
    version: 1,
    jobs: [{
      jobId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', accountId, state: 'running', format: 'json', directory: f.root,
      createdAtUnixMs: now, updatedAtUnixMs: now,
      items: [{ conversationId: 'wxid_alpha', name: 'wxid_alpha', state: 'running', phase: 'reading', messagesDone: '0', messagesTotal: '0', mediaSaved: '0', mediaFailed: '0', path: '', mediaManifestPath: '', errorCode: '', unchanged: false, mediaFound: '0', mediaSettled: '0', mediaIndexing: false }]
    }]
  }) + '\n', { mode: 0o600 });
  const jobs = createChatExportJobs({ stateDir: f.stateDir, runExport: async () => ({ itemCount: 0, destinationPath: '' }) });
  t.after(async () => jobs.close());
  const snapshot = jobs.watch('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(snapshot.state, 'failed');
  assert.equal(snapshot.errorCode, 'CHAT_EXPORT_PROCESS_RESTARTED');
  assert.equal(snapshot.items[0].state, 'failed');
  assert.equal(snapshot.items[0].errorCode, 'CHAT_EXPORT_PROCESS_RESTARTED');
  await jobs.close();
});

test('restart preserves a durable terminal job error code', async t => {
  const f = await make(t);
  await fs.writeFile(path.join(f.stateDir, STATE_FILE), JSON.stringify({
    version: 1,
    jobs: [{
      jobId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', accountId, state: 'failed', format: 'json', directory: f.root,
      createdAtUnixMs: '1700000000000', updatedAtUnixMs: '1700000000001', finishedAtUnixMs: '1700000000001', errorCode: 'CHAT_EXPORT_ITEM_FAILED',
      items: [{ conversationId: 'wxid_alpha', name: 'wxid_alpha', state: 'failed', phase: 'reading', messagesDone: '0', messagesTotal: '0', mediaSaved: '0', mediaFailed: '0', path: '', mediaManifestPath: '', errorCode: 'CHAT_EXPORT_ITEM_FAILED', unchanged: false, mediaFound: '0', mediaSettled: '0', mediaIndexing: false }]
    }]
  }) + '\n', { mode: 0o600 });
  const jobs = createChatExportJobs({ stateDir: f.stateDir, runExport: async () => ({ itemCount: 0, destinationPath: '' }) });
  t.after(async () => jobs.close());
  assert.equal(jobs.watch('dddddddd-dddd-4ddd-8ddd-dddddddddddd').errorCode, 'CHAT_EXPORT_ITEM_FAILED');
  await jobs.close();
});

test('rejects duplicate chat job ids in durable state', async t => {
  const f = await make(t);
  const job = { jobId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', accountId, state: 'completed', format: 'json', directory: f.root, createdAtUnixMs: '1700000000000', updatedAtUnixMs: '1700000000000', items: [{ conversationId: 'wxid_alpha', name: 'wxid_alpha', state: 'completed', phase: 'writing', messagesDone: '0', mediaSaved: '0', mediaFailed: '0', path: '', mediaManifestPath: '', errorCode: '', unchanged: false, mediaIndexing: false }] };
  await fs.writeFile(path.join(f.stateDir, STATE_FILE), JSON.stringify({ version: 1, jobs: [job, { ...job }] }) + '\n', { mode: 0o600 });
  assert.throws(() => createChatExportJobs({ stateDir: f.stateDir, runExport: async () => ({ itemCount: 0 }) }), /CHAT_EXPORT_STATE_INVALID/);
});
