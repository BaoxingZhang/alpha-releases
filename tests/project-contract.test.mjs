import test from 'node:test';
import assert from 'node:assert/strict';
import { validateChangelogVersion, validatePackageLock } from '../scripts/project-contract.mjs';

const packageJson = { name: 'alpha-recovered-local', version: '0.3.5' };

test('project contract accepts the locked package identity', () => {
  assert.deepEqual(validatePackageLock(packageJson, {
    lockfileVersion: 3,
    packages: { '': { name: packageJson.name, version: packageJson.version } }
  }), []);
});

test('project contract rejects a stale package lock identity or lockfile format', () => {
  assert.deepEqual(validatePackageLock(packageJson, {
    lockfileVersion: 2,
    packages: { '': { name: packageJson.name, version: '0.3.4' } }
  }), [
    'package-lock.json lockfileVersion 2 must be 3',
    'package-lock.json root version 0.3.4 does not match package.json 0.3.5'
  ]);
});

test('project contract rejects a missing lock root package', () => {
  assert.deepEqual(validatePackageLock(packageJson, { lockfileVersion: 3, packages: {} }), [
    'package-lock.json: root package metadata is missing'
  ]);
});

test('project contract requires a changelog heading for the package version', () => {
  assert.deepEqual(validateChangelogVersion(packageJson, '# Changes\n\n## 0.3.5-recovery — current\n'), []);
  assert.deepEqual(validateChangelogVersion(packageJson, '# Changes\n\n## 0.3.4\n'), [
    'CHANGELOG.md: missing heading for package version 0.3.5'
  ]);
});
