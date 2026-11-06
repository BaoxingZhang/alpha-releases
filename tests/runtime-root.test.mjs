import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { recoverySession, resolveRuntimeRoot } from '../packages/alpha-desktop/runtime-root.cjs';

test('runtime root keeps development sessions inside the project runtime tree', () => {
  const project = '/tmp/alpha-recovered-project';
  assert.equal(
    resolveRuntimeRoot({ packaged: false, project, session: 'dev-1' }),
    path.join(project, '.runtime', 'dev-1')
  );
});

test('runtime root moves packaged sessions below writable userData', () => {
  const project = '/readonly/Alpha Recovered.app/Contents';
  const userData = '/Users/test/Library/Application Support/Alpha Recovered';
  assert.equal(
    resolveRuntimeRoot({ packaged: true, project, userData, session: 'dmg-1' }),
    path.join(userData, 'recovery-runtime', 'dmg-1')
  );
});

test('runtime root rejects malformed paths and session traversal', () => {
  assert.equal(recoverySession(undefined), 'manual');
  assert.throws(() => recoverySession('../escape'), /RECOVERY_SESSION_INVALID/);
  assert.throws(() => resolveRuntimeRoot({ packaged: false, project: 'relative', session: 'ok' }), /RECOVERY_PROJECT_INVALID/);
  assert.throws(() => resolveRuntimeRoot({ packaged: true, project: '/project', session: 'ok' }), /RECOVERY_USER_DATA_INVALID/);
  assert.throws(() => resolveRuntimeRoot({ packaged: true, project: '/project', userData: '/user', session: 'a/b' }), /RECOVERY_SESSION_INVALID/);
});
