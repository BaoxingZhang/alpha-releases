import test from 'node:test';
import assert from 'node:assert/strict';
import { collectDoctorReport, nodeVersionSupported } from '../scripts/doctor.mjs';

test('doctor accepts the pinned Node baseline', () => {
  assert.equal(nodeVersionSupported('v24.15.0'), true);
  assert.equal(nodeVersionSupported('24.21.0'), true);
  assert.equal(nodeVersionSupported('v24.14.9'), false);
  assert.equal(nodeVersionSupported('v25.0.0'), false);
});

test('doctor reports prerequisites without reading a data directory', async () => {
  const files = new Set([
    '/repo/package.json',
    '/repo/package-lock.json',
    '/repo/vendor/runtime',
    '/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron',
    '/repo/node_modules/esbuild/bin/esbuild'
  ]);
  const fsApi = { stat: async target => {
    if (!files.has(target)) throw new Error('missing');
    return {
      isFile: () => !target.endsWith('/runtime'),
      isDirectory: () => target.endsWith('/runtime')
    };
  } };
  const report = await collectDoctorReport({ root: '/repo', nodeVersion: 'v24.21.0', platform: 'darwin', arch: 'arm64', fsApi });
  assert.equal(report.schema, 'alpha-recovery-doctor.v1');
  assert.equal(report.status, 'ready');
  assert.equal(report.dataAccess, 'none');
  assert.ok(report.checks.every(check => check.ok));
});

test('doctor blocks an unsupported host or missing setup artifact', async () => {
  const fsApi = { stat: async () => { throw new Error('missing'); } };
  const report = await collectDoctorReport({ root: '/repo', nodeVersion: 'v23.0.0', platform: 'linux', arch: 'x64', fsApi });
  assert.equal(report.status, 'blocked');
  assert.ok(report.checks.some(check => check.id === 'node' && !check.ok));
  assert.ok(report.checks.some(check => check.id === 'platform' && !check.ok));
});
