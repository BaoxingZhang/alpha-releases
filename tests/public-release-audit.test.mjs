import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { auditPublicTree } from '../scripts/audit-public-release.mjs';

const execFileAsync = promisify(execFile);
const script = path.resolve(new URL('../scripts/audit-public-release.mjs', import.meta.url).pathname);

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-public-release-audit-'));
  await fs.mkdir(path.join(root, 'docs/private-evidence'), { recursive: true });
  await fs.mkdir(path.join(root, 'provenance'), { recursive: true });
  return root;
}

test('public release audit reports paths and credentials without retaining their values', async t => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bearer = 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef';
  const privateKey = '-----BEGIN PRIVATE KEY-----';
  await fs.writeFile(path.join(root, 'docs', 'report.md'), [
    'artifact path: /Users/alice/project/docs/report.md',
    `header: ${bearer}`,
    privateKey
  ].join('\n'));
  const report = await auditPublicTree({ root });
  assert.equal(report.status, 'failed');
  assert.equal(report.enforcement, 'report');
  assert.equal(report.findingCount, 3);
  assert.ok(report.findings.some(finding => finding.rule === 'user-home-path'));
  assert.ok(report.findings.some(finding => finding.rule === 'bearer-token'));
  assert.ok(report.findings.some(finding => finding.rule === 'private-key-block'));
  assert.doesNotMatch(JSON.stringify(report), /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcdef/);
  assert.doesNotMatch(JSON.stringify(report), /\/Users\/alice/);
  assert.deepEqual(report.scanRoots, ['docs', 'provenance']);
});

test('private evidence can be excluded and the report is written atomically', async t => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'docs', 'private-evidence', 'rea.json'), '{"path":"/Users/alice/private"}\n');
  await fs.writeFile(path.join(root, 'docs', 'public.md'), 'sourceDmgSha256: 53bb2ba02edf784e77629f80b7330d9b5653cbcbd8e5527849267c5a6f209004\n');
  const reportPath = path.join(root, 'audit.json');
  const result = await execFileAsync(process.execPath, [script, '--root', root, '--exclude', 'docs/private-evidence', '--report', reportPath, '--json']);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'passed');
  assert.equal(report.findingCount, 0);
  assert.deepEqual(report.excluded, ['docs/private-evidence']);
  assert.deepEqual(JSON.parse(await fs.readFile(reportPath, 'utf8')), report);
  assert.doesNotMatch(result.stdout, /\/Users\/alice/);
});

test('report mode does not fail current evidence, while strict mode does', async t => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'provenance', 'paths.json'), '{"path":"/private/var/folders/example"}\n');
  const reportOnly = await execFileAsync(process.execPath, [script, '--root', root, '--json']);
  assert.equal(JSON.parse(reportOnly.stdout).status, 'failed');
  await assert.rejects(
    () => execFileAsync(process.execPath, [script, '--root', root, '--strict', '--json']),
    error => error.code === 1 && JSON.parse(error.stdout).enforcement === 'strict'
  );
});

test('documentation placeholders and ordinary hashes are not credentials', async t => {
  const root = await fixture();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'docs', 'examples.md'), [
    'Use /Users/<user>/project only as a documentation placeholder.',
    'ALPHA_INDEPENDENT_HTTP_TOKEN="$(openssl rand -hex 32)"',
    'passwordConfigured: true',
    'sourceDmgSha256: 53bb2ba02edf784e77629f80b7330d9b5653cbcbd8e5527849267c5a6f209004'
  ].join('\n'));
  const report = await auditPublicTree({ root });
  assert.equal(report.status, 'passed');
  assert.equal(report.findingCount, 0);
});
