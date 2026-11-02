import test from 'node:test';
import assert from 'node:assert/strict';
import { auditNativeAbi } from '../scripts/audit-native-abi.mjs';

test('native ABI audit records only shipped exports without invoking unknown functions', { skip: process.platform !== 'darwin' || process.arch !== 'arm64' }, () => {
  const result = auditNativeAbi();
  assert.equal(result.schema, 'alpha-recovered.native-abi-audit.v1');
  assert.equal(result.status, 'passed');
  assert.equal(result.platform, 'darwin-arm64');
  assert.equal(result.nativeFilesModified, false);
  assert.equal(result.unknownAbiCallExecuted, false);
  assert.deepEqual(result.targets.map(target => target.exports), [
    ['_alpha_native_get_api'],
    ['_alpha_moments_project_row_v1', '_alpha_sqlite_readonly_get_api']
  ]);
  for (const target of result.targets) {
    assert.equal(target.architecture, 'arm64');
    assert.equal(target.codesign.verified, true);
    assert.equal(target.unknownAbiCallExecuted, false);
  }
});
