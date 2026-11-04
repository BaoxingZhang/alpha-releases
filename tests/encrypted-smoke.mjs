import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root, launchEnvironment, sandboxProfile } from '../scripts/environment.mjs';
import { normalizeRunLog } from '../scripts/normalize-run-log.mjs';
import { createEncryptedFixture, cleanupEncryptedFixtureHelper } from './encrypted-fixture.mjs';
const session = `encrypted-smoke-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
fs.mkdirSync(runtime, { recursive: true });
const fixture = await createEncryptedFixture({ directory: path.join(runtime, 'fixture') });
await cleanupEncryptedFixtureHelper();
const quote = x => "'" + x.replaceAll("'", "'\\''") + "'";
const wrapper = path.join(runtime, 'electron-sandbox.sh');
fs.writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(sandboxProfile())} ${quote(electronPath)} "$@"\n`, { mode: 0o755 });
const environment = launchEnvironment(session, { backend: 'independent', encryptedDir: fixture.sourceDir, accountId: fixture.expected.accountId });
const report = { testedAt: new Date().toISOString(), session, sourceKind: 'synthetic SQLCipher4 encrypted fixture', realUserDataAccessed: false, checks: {}, rendererErrors: [] };
const logs = [];
let app, page, pausedImporter;
function ownImporter() {
  const result = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,comm='], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  const rows = result.stdout.split('\n').flatMap(line => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/);
    return match ? [{ pid: Number(match[1]), parent: Number(match[2]), executable: match[3] }] : [];
  });
  const owned = new Set([app.process().pid]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (owned.has(row.parent) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; }
  }
  return rows.find(row => owned.has(row.pid) && row.executable === path.join(root, 'build/candidates/alpha-snapshot-import'))?.pid;
}
async function open() {
  app = await electron.launch({ executablePath: wrapper, args: ['--no-sandbox', path.join(root, 'dist/app')], cwd: root, env: environment, timeout: 45000 });
  app.process().stdout?.on('data', x => logs.push(x.toString()));
  app.process().stderr?.on('data', x => logs.push(x.toString()));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    page = app.windows().find(p => p.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(page);
  page.on('pageerror', e => report.rendererErrors.push(e.message));
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20);
}
async function close() {
  if (!app) return;
  const closing = app; app = undefined; page = undefined;
  const timer = setTimeout(() => closing.process().kill('SIGKILL'), 8000);
  try { await closing.close(); } finally { clearTimeout(timer); }
}
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
try {
  await open();
  report.backend = await page.evaluate(() => window.alpha.system.getBackendStatus());
  assert.equal(report.backend.state, 'ready');
  report.initialAccounts = await page.evaluate(() => window.alpha.accounts.list());
  assert.equal(report.initialAccounts.length, 1);
  assert.equal(report.initialAccounts[0].state, 'discovered');
  assert.equal(report.initialAccounts[0].handleState, 'waiting_for_key');
  report.checks.waitingForKeyBeforeImport = true;
  await page.getByRole('checkbox', { name: '我已了解，开始连接本地数据' }).click();
  const field = page.getByPlaceholder('64 位十六进制密钥');
  await field.waitFor({ state: 'visible' });
  await field.fill('ff'.repeat(32));
  await page.locator('.setup-footer').getByRole('button', { name: '验证并连接', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: '密钥不匹配' }).waitFor({ timeout: 30000 });
  const afterFailure = await page.evaluate(() => window.alpha.accounts.list());
  assert.equal(afterFailure[0].handleState, 'waiting_for_key');
  assert.equal(afterFailure[0].state, 'discovered');
  report.checks.wrongKeyRejectedWithoutReady = true;
  await field.fill(fixture.keyHex);
  await page.locator('.setup-footer').getByRole('button', { name: '验证并连接', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '暂时跳过', exact: true }).click({ timeout: 40000 });
  await page.locator('.setup-footer').getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '进入 Alpha', exact: true }).click();
  await page.locator('main[data-surface="workspace"]').waitFor();
  await page.getByText('合成联系人甲', { exact: true }).first().click();
  await page.getByText('first source', { exact: true }).first().waitFor();
  report.checks.manualKeyOnboardingToMessages = true;
  report.accounts = await page.evaluate(() => window.alpha.accounts.list());
  assert.equal(report.accounts[0].handleState, 'open');
  assert.equal(report.accounts[0].selected, true);
  report.messages = await page.evaluate(({ accountId, conversationId }) => window.alpha.messages.list(accountId, conversationId, 100, true), fixture.expected);
  assert.equal(report.messages.length, fixture.expected.messageCount);
  await page.screenshot({ path: path.join(root, 'docs/encrypted-run.png'), fullPage: true });
  const state = path.join(runtime, 'userData/independent');
  const manifest = JSON.parse(fs.readFileSync(path.join(state, 'snapshots/manifest.v1.json'), 'utf8'));
  report.importedFiles = fixture.manifest.files.map(item => {
    assert.equal(sha(path.join(fixture.sourceDir, item.relativePath)), item.ciphertextSha256);
    const output = path.join(manifest.outputDir, item.relativePath);
    assert.equal(sha(output), item.plaintextSha256);
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
    return { path: item.relativePath, pages: item.pageCount, sourceSha256: item.ciphertextSha256, outputSha256: item.plaintextSha256 };
  });
  report.checks.sourceUnchangedAndPlaintextMatches = true;
  // Pause only this app's real Go importer so the desktop queue must answer
  // status/lock before decryption can complete. Engine cleanup kills the paused
  // child after its termination grace period and removes its private work tree.
  const password = 'Synthetic encrypted smoke password';
  await page.evaluate(password => window.alpha.security.configureApplicationLock({ action: 'enable_password', newPassword: password }), password);
  const importing = page.evaluate(({ accountId, keyHex }) => window.alpha.accounts.importDatabaseKey(accountId, keyHex).then(() => ({ ready: true }), e => ({ error: e.message })), { accountId: fixture.expected.accountId, keyHex: fixture.keyHex });
  const importDeadline = Date.now() + 5000;
  while (Date.now() < importDeadline) {
    const pid = ownImporter();
    if (pid) { try { process.kill(pid, 'SIGSTOP'); pausedImporter = pid; break; } catch (e) { if (e.code !== 'ESRCH') throw e; } }
    await new Promise(r => setTimeout(r, 5));
  }
  assert.ok(pausedImporter, 'The real owned importer must be paused while still running');
  const status = await Promise.race([
    page.evaluate(() => window.alpha.security.getApplicationLockStatus()),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DESKTOP_STATUS_QUEUED_BEHIND_IMPORT')), 1500))
  ]);
  assert.equal(status.locked, false);
  const lockStarted = Date.now();
  const locked = await Promise.race([
    page.evaluate(() => window.alpha.security.lockApplication()),
    new Promise((_, reject) => setTimeout(() => reject(new Error('DESKTOP_LOCK_QUEUED_BEHIND_IMPORT')), 3500))
  ]);
  assert.equal(locked.locked, true);
  const canceled = await importing;
  assert.match(canceled.error || '', /APP_LOCK_LOCKED|IMPORT_CANCELED/);
  assert.equal(fs.readdirSync(path.join(state, 'snapshots')).some(name => name.startsWith('.work-')), false);
  assert.throws(() => process.kill(pausedImporter, 0), { code: 'ESRCH' });
  pausedImporter = undefined;
  report.importCancellation = { elapsedMs: Date.now() - lockStarted, error: canceled.error, childExited: true, workDirectoryRemoved: true };
  report.checks.desktopLockCancelsRunningImport = true;
  await page.evaluate(password => window.alpha.security.unlockApplication(password), password);
  await page.evaluate(password => window.alpha.security.configureApplicationLock({ action: 'disable', password }), password);
  const afterCancellation = await page.evaluate(({ accountId, conversationId }) => window.alpha.messages.list(accountId, conversationId, 100, true), fixture.expected);
  assert.deepEqual(afterCancellation, report.messages);
  report.checks.priorSnapshotSurvivesCanceledReimport = true;
  await close();
  // Completed onboarding is persisted by the real UI. Restart must reuse the
  // validated snapshot without re-supplying a database key.
  await open();
  await page.locator('main[data-surface="workspace"]').waitFor();
  const reused = await page.evaluate(({ accountId, conversationId }) => window.alpha.messages.list(accountId, conversationId, 100, true), fixture.expected);
  assert.deepEqual(reused, report.messages);
  report.checks.restartReusesVerifiedSnapshot = true;
  await close();
  let inspected = 0;
  for (const entry of fs.readdirSync(path.join(runtime, 'userData'), { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name), bytes = fs.readFileSync(file);
    assert.equal(bytes.includes(Buffer.from(fixture.keyHex)), false, 'Database key hex must not be persisted');
    assert.equal(bytes.includes(Buffer.from(fixture.keyHex, 'hex')), false, 'Database key bytes must not be persisted');
    inspected++;
  }
  assert.equal(logs.join('').includes(fixture.keyHex), false);
  report.checks.noDatabaseKeyFoundInPersistedAppDataOrLogs = true;
  report.appFilesInspected = inspected;
  assert.deepEqual(report.rendererErrors, []);
} catch (e) {
  report.failure = e.stack;
  if (page) report.bodyAtFailure = await page.locator('body').innerText().catch(() => '');
  process.exitCode = 1;
} finally {
  if (pausedImporter) { try { process.kill(pausedImporter, 'SIGCONT'); } catch {} }
  await close().catch(e => { report.closeError = e.message; });
  fs.writeFileSync(path.join(root, 'docs/encrypted-run.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs/encrypted-run.log'), normalizeRunLog(logs.join('')));
  console.log(JSON.stringify({ checks: report.checks, failure: report.failure, report: 'docs/encrypted-run.json' }, null, 2));
}
