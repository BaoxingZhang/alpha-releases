import test from 'node:test';
import assert from 'node:assert/strict';
import backendMode from '../packages/alpha-desktop/backend-mode.cjs';
const { isIndependentBackendEnabled, isIndependentFixtureEnabled } = backendMode;

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
