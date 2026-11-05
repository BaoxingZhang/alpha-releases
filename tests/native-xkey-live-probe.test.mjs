import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('native xkey live probe remains an explicit failed read-only observation', async () => {
  const evidence = JSON.parse(await fs.readFile(path.join(root, 'docs/native-xkey-live-probe.json'), 'utf8'));
  assert.equal(evidence.schema, 'alpha-recovered.native-xkey-live-probe.v1');
  assert.equal(evidence.realWeChatData, true);
  assert.equal(evidence.databaseContentsRead, false);
  assert.equal(evidence.nativeFilesModified, false);
  assert.equal(evidence.authorizationPromptShown, false);
  assert.equal(evidence.databaseKeyAcquired, false);
  assert.equal(evidence.readyOpen, false);
  assert.equal(evidence.targets.length, 3);
  for (const target of evidence.targets) {
    assert.equal(target.result.status, 'failed');
    assert.equal(target.result.errorCode, 'NATIVE_WECHAT_CAPTURE_TARGET_NOT_FOUND');
    assert.ok(!JSON.stringify(target).includes('/Users/'));
    assert.match(target.databaseAccount, /^<[^>]+>$/);
  }
});
