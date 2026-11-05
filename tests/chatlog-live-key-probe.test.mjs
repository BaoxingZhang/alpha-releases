import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('bounded Chatlog live key probe remains explicit failed evidence', async () => {
  const evidence = JSON.parse(await fs.readFile(path.join(root, 'docs/chatlog-live-key-probe.json'), 'utf8'));
  assert.equal(evidence.schema, 'alpha-recovered.chatlog-live-key-probe.v1');
  assert.equal(evidence.observedDate, '2026-11-05');
  assert.equal(evidence.realWeChatProcess, true);
  assert.equal(evidence.databaseContentsRead, false);
  assert.equal(evidence.nativeFilesModified, false);
  assert.equal(evidence.keyMaterialEmitted, false);
  assert.equal(evidence.probeCompleted, true);
  assert.equal(evidence.durationSecondsBound, 120);
  assert.equal(evidence.result.status, 'failed');
  assert.equal(evidence.result.errorCode, 'CHATLOG_KEY_NOT_ACQUIRED');
  assert.equal(evidence.result.rawOutputPersisted, false);
  assert.equal(evidence.result.keyValuesPersisted, false);
  assert.ok(!JSON.stringify(evidence).includes('/Users/'));
});
