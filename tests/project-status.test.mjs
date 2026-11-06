import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function runStatus() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['scripts/project-status.mjs', '--json'], { cwd: root, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`${error.message}\n${stderr}`));
      resolve(JSON.parse(stdout));
    });
  });
}

test('project status reports independent and native boundaries from evidence', async () => {
  const status = await runStatus();
  assert.equal(status.schema, 'alpha.recovery-status.v1');
  assert.equal(status.independent.totalRequestBranches, 128);
  assert.equal(status.independent.implementedRequestBranches, 87);
  assert.equal(status.independent.unsupportedRequestBranches, 41);
  assert.equal(status.native.state, 'ready-disposable');
  assert.equal(status.native.errorCode, '');
  assert.equal(status.native.isolatedSmoke, 'ready');
  assert.equal(status.native.customSeatbeltSmoke, 'unavailable');
  assert.equal(status.native.customSeatbeltErrorCode, 'SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY');
  assert.equal(status.native.realDataValidated, false);
  assert.equal(status.boundary.nativeSourceRecovered, false);
  assert.equal(status.boundary.realWechatDataValidated, false);
  assert.equal(status.boundary.syntheticFixturesAreNativeParity, false);
  assert.ok(status.independent.unsupportedByCategory['实时消息与写入'] >= 1);
});
