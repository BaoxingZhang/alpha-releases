import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('bounded WeChat2 Chatlog probe remains explicit failed evidence', async () => {
  const evidence = JSON.parse(await fs.readFile(path.join(root, 'docs/chatlog-wechat2-live-key-probe.json'), 'utf8'));
  assert.equal(evidence.schema, 'alpha-recovered.chatlog-wechat2-live-key-probe.v1');
  assert.equal(evidence.observedDate, '2026-11-05');
  assert.equal(evidence.realWeChatProcess, true);
  assert.equal(evidence.target.label, 'WeChat2 main process');
  assert.equal(evidence.target.pid, 57027);
  assert.equal(evidence.databaseContentsRead, false);
  assert.equal(evidence.nativeFilesModified, false);
  assert.equal(evidence.keyMaterialEmitted, false);
  assert.equal(evidence.probeCompleted, true);
  assert.equal(evidence.durationSecondsBound, 120);
  assert.equal(evidence.result.status, 'failed');
  assert.equal(evidence.result.errorCode, 'CHATLOG_KEY_NOT_ACQUIRED');
  assert.equal(evidence.result.exitCode, 0);
  assert.equal(evidence.result.stdoutBytes, 0);
  assert.equal(evidence.result.stderrBytes, 525);
  assert.equal(evidence.result.has64HexOutput, false);
  assert.equal(evidence.result.rawOutputPersisted, false);
  assert.equal(evidence.result.keyValuesPersisted, false);
  assert.equal(evidence.result.temporaryConfigRemoved, true);
  assert.equal(evidence.latestRetry.result.errorCode, 'CHATLOG_KEY_PROBE_TIMEOUT');
  assert.equal(evidence.latestRetry.durationSecondsBound, 125);
  assert.equal(evidence.latestRetry.keyMaterialEmitted, false);
  assert.equal(evidence.latestRetry.databaseContentsRead, false);
  assert.ok(!JSON.stringify(evidence).includes('/Users/'));
  assert.ok(!JSON.stringify(evidence).match(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/iu));
});
