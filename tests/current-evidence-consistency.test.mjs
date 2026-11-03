import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCurrentEvidenceRefresh } from '../scripts/current-evidence-consistency.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

async function loadCurrentEvidence() {
  return JSON.parse(await fs.readFile(path.join(root, 'docs/independent-validation-current.json'), 'utf8'));
}

test('current evidence refresh joins recorded source, release, and packaged flavor evidence', async () => {
  const evidence = await loadCurrentEvidence();
  assert.deepEqual(validateCurrentEvidenceRefresh(evidence), []);
});

test('current evidence refresh reports stale release and flavor joins without reading runtime artifacts', async () => {
  const evidence = await loadCurrentEvidence();
  evidence.validation.currentEvidenceRefresh.releaseManifest.artifactDigest = '0'.repeat(64);
  evidence.validation.currentEvidenceRefresh.packagedFlavors.independent.fileCount++;
  const errors = validateCurrentEvidenceRefresh(evidence);
  assert.ok(errors.some(error => error.includes('releaseManifest.artifactDigest')));
  assert.ok(errors.some(error => error.includes('packagedFlavors.independent.fileCount')));
});

test('current evidence refresh rejects malformed snapshot metadata', async () => {
  const evidence = await loadCurrentEvidence();
  evidence.validation.currentEvidenceRefresh.observedAt = 'current';
  evidence.validation.currentEvidenceRefresh.commands = [];
  const errors = validateCurrentEvidenceRefresh(evidence);
  assert.ok(errors.some(error => error.includes('observedAt')));
  assert.ok(errors.some(error => error.includes('commands')));
});

