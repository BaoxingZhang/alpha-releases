import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { discoverSources, parse } from '../scripts/discover-v4-sources.mjs';

async function fixture(t) {
  const home = await fs.mkdtemp(path.join(process.cwd(), '.runtime/discover-v4-'));
  t.after(() => fs.rm(home, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  return home;
}

async function writeDb(root, directory, name, sidecar = false) {
  const target = path.join(root, 'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/account/db_storage', directory);
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(target, name), 'secret message bytes', { mode: 0o600 });
  if (sidecar) await fs.writeFile(path.join(target, `${name}-wal`), 'active sidecar', { mode: 0o600 });
}

test('discovers fixed standard roots without reading database contents', async t => {
  const home = await fixture(t);
  await writeDb(home, 'contact', 'contact.db', true);
  await writeDb(home, 'session', 'session.db');
  await writeDb(home, 'message', 'message_0.db');
  await writeDb(home, 'message', 'media_0.db');
  await fs.mkdir(path.join(home, 'Library/Containers/not-a-wechat-app/Data/Documents'), { recursive: true });
  await fs.writeFile(path.join(home, 'Library/Containers/not-a-wechat-app/Data/Documents/secret.txt'), 'do not inspect');

  const report = await discoverSources({ home });
  assert.equal(report.status, 'candidate');
  assert.equal(report.read_only, true);
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
  assert.equal(report.roots.length, 1);
  const candidate = report.roots[0].candidates[0];
  assert.deepEqual(candidate.marker_kinds, ['contact', 'media', 'message', 'session']);
  assert.equal(candidate.active_sidecar_count, 1);
  assert.equal(candidate.status, 'active-sidecars');
  assert.match(candidate.relative_path, /<redacted-[0-9a-f]{16}>/);
  assert.doesNotMatch(JSON.stringify(report), /secret message bytes|do not inspect/);
  assert.equal(JSON.stringify(report).includes(home), false);
});

test('rejects a symlinked fixed root and never follows it', async t => {
  const home = await fixture(t);
  const outside = await fs.mkdtemp(path.join(process.cwd(), '.runtime/discover-v4-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  await fs.mkdir(path.join(outside, 'Data/Documents/xwechat_files/account'), { recursive: true });
  await fs.mkdir(path.join(home, 'Library/Containers'), { recursive: true });
  await fs.symlink(outside, path.join(home, 'Library/Containers/com.tencent.xinWeChat2'));

  const report = await discoverSources({ home });
  const rejected = report.roots.find(root => root.relative_root.includes('com.tencent.xinWeChat2'));
  assert.equal(rejected?.status, 'rejected');
  assert.equal(rejected?.code, 'V4_DISCOVERY_ROOT_SYMLINK_OR_NON_DIRECTORY');
});

test('bounds discovery traversal and rejects arbitrary root options', async t => {
  const home = await fixture(t);
  const root = path.join(home, 'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files');
  await fs.mkdir(root, { recursive: true });
  await Promise.all([...Array(10)].map((_, index) => fs.mkdir(path.join(root, `account-${index}`), { recursive: true })));
  const report = await discoverSources({ home, limits: { maxRoots: 8, maxEntries: 3, maxDepth: 8, maxReports: 64, maxReportBytes: 512 * 1024 } });
  assert.equal(report.roots[0].status, 'truncated');
  assert.equal(report.roots[0].truncated, true);
  assert.throws(() => parse(['--root', home]), error => error?.code === 'V4_DISCOVERY_USAGE');
});

test('show-path is explicit human-only output and never enters JSON reports', async t => {
  const home = await fixture(t);
  await writeDb(home, 'contact', 'contact.db');
  await writeDb(home, 'session', 'session.db');
  await writeDb(home, 'message', 'message_0.db');
  const report = await discoverSources({ home, includePaths: true });
  const candidate = report.roots[0].candidates[0];
  assert.equal(candidate.absolute_path.endsWith('/db_storage'), true);
  assert.equal(candidate.relative_path.includes(candidate.absolute_path), false);
  assert.throws(() => parse(['--json', '--show-path']), error => error?.code === 'V4_DISCOVERY_PATH_OUTPUT_REQUIRES_HUMAN_MODE');
  assert.throws(() => parse(['--show-path', '--show-path']), error => error?.code === 'V4_DISCOVERY_USAGE');
});
