import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createMomentsExportJobs, STATE_FILE } = require('../packages/alpha-engine/moments-export-jobs.cjs');
const accountId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
test('rejects duplicate moments job ids in durable state', async t => {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/moments-export-jobs-persist-'));
  const stateDir = path.join(root, 'state'); await fs.mkdir(stateDir, { mode: 0o700 }); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const job = { jobId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', accountId, state: 'completed', format: 'json', directory: root, createdAtUnixMs: '1700000000000', updatedAtUnixMs: '1700000000000', items: [{ conversationId: 'moments', name: '朋友圈', state: 'completed', phase: 'writing', messagesDone: '0', mediaSaved: '0', mediaFailed: '0', path: '', mediaManifestPath: '', errorCode: '' }] };
  await fs.writeFile(path.join(stateDir, STATE_FILE), JSON.stringify({ version: 1, jobs: [job, { ...job }] }) + '\n', { mode: 0o600 });
  assert.throws(() => createMomentsExportJobs({ stateDir, runExport: async () => ({ itemCount: 0 }) }), /MOMENT_EXPORT_STATE_INVALID/);
});
