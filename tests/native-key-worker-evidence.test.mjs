import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('native key worker evidence remains bound to shipped artifacts and fail-closed scope', async () => {
  const evidence = JSON.parse(await fs.readFile(path.join(root, 'docs/native-key-worker-evidence.json'), 'utf8'));
  assert.equal(evidence.artifacts.length, 3);
  for (const artifact of evidence.artifacts) {
    const bytes = await fs.readFile(path.join(root, artifact.path));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), artifact.sha256, artifact.path);
    assert.equal(artifact.architecture, 'arm64');
    assert.equal(artifact.format, 'mach-o');
  }
  assert.equal(evidence.observedKeyWorkerInterface, 'alpha.key.transport.v1.KeyWorkerCallRequest');
  assert.ok(evidence.observedOperations.includes('resolve_image_key'));
  assert.ok(evidence.observedRequestTypes.includes('StartKeyAcquisitionRequest'));
  assert.ok(evidence.observedSecurityTypes.includes('SecretIngestTicket'));
  assert.ok(evidence.observedErrorStrings.includes('KEY_PROVIDER_AUTH_FAILED'));
  assert.ok(evidence.observedEnvironmentNames.includes('ALPHA_XKEY_AUTH_NONCE'));
  assert.equal(evidence.scope.staticOnly, true);
  assert.equal(evidence.scope.executed, false);
  assert.equal(evidence.scope.keyRead, false);
  assert.equal(evidence.scope.activeDatabaseRead, false);
  assert.equal(evidence.scope.nativeVaultReady, false);
  assert.ok(evidence.limitations.length >= 4);
});
