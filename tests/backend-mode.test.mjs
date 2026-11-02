import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import backendMode from '../packages/alpha-desktop/backend-mode.cjs';
const { isIndependentBackendEnabled, isIndependentFixtureEnabled, PACKAGED_MODE_FILE, readPackagedBackendMode, applyPackagedBackendMode } = backendMode;

test('backend selection requires an explicit packaged opt-in', () => {
  assert.equal(isIndependentBackendEnabled({ isPackaged: false }, { ALPHA_RECOVERY_BACKEND: 'independent' }), true);
  assert.equal(isIndependentBackendEnabled({ isPackaged: true }, { ALPHA_RECOVERY_BACKEND: 'independent' }), false);
  assert.equal(isIndependentBackendEnabled({ isPackaged: true }, { ALPHA_RECOVERY_BACKEND: 'independent', ALPHA_INDEPENDENT_PACKAGED: '1' }), true);
  assert.equal(isIndependentBackendEnabled({ isPackaged: true }, { ALPHA_RECOVERY_BACKEND: 'original', ALPHA_INDEPENDENT_PACKAGED: '1' }), false);
});

test('fixture mode remains an explicit independent-only opt-in', () => {
  assert.equal(isIndependentFixtureEnabled({ isPackaged: false }, { ALPHA_RECOVERY_BACKEND: 'independent', ALPHA_INDEPENDENT_AGENT: 'fixture' }), true);
  assert.equal(isIndependentFixtureEnabled({ isPackaged: true }, { ALPHA_RECOVERY_BACKEND: 'independent', ALPHA_INDEPENDENT_AGENT: 'fixture' }), false);
  assert.equal(isIndependentFixtureEnabled({ isPackaged: true }, { ALPHA_RECOVERY_BACKEND: 'independent', ALPHA_INDEPENDENT_PACKAGED: '1', ALPHA_INDEPENDENT_AGENT: 'fixture' }), true);
});

test('packaged backend marker selects an explicit app flavor and rejects malformed markers', async () => {
  const resources = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-backend-mode-'));
  try {
    assert.equal(readPackagedBackendMode(resources), '');
    await fs.writeFile(path.join(resources, PACKAGED_MODE_FILE), JSON.stringify({ schema: 'alpha.recovered.backend-mode.v1', backend: 'independent' }));
    assert.equal(readPackagedBackendMode(resources), 'independent');
    const independentEnvironment = { ALPHA_RECOVERY_BACKEND: 'original', ALPHA_INDEPENDENT_PACKAGED: 'stale' };
    assert.equal(applyPackagedBackendMode(resources, independentEnvironment), 'independent');
    assert.deepEqual(independentEnvironment, { ALPHA_RECOVERY_BACKEND: 'independent', ALPHA_INDEPENDENT_PACKAGED: '1' });
    await fs.writeFile(path.join(resources, PACKAGED_MODE_FILE), JSON.stringify({ schema: 'alpha.recovered.backend-mode.v1', backend: 'original' }));
    const originalEnvironment = { ALPHA_RECOVERY_BACKEND: 'independent', ALPHA_INDEPENDENT_PACKAGED: '1' };
    assert.equal(applyPackagedBackendMode(resources, originalEnvironment), 'original');
    assert.deepEqual(originalEnvironment, { ALPHA_RECOVERY_BACKEND: 'original' });
    await fs.writeFile(path.join(resources, PACKAGED_MODE_FILE), JSON.stringify({ schema: 'wrong', backend: 'independent' }));
    assert.equal(readPackagedBackendMode(resources), '');
  } finally {
    await fs.rm(resources, { recursive: true, force: true });
  }
});
