import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { root, launchEnvironment, sandboxProfile } from '../scripts/environment.mjs';
import { createFixture } from './data-bridge-fixture.mjs';
const session = `independent-smoke-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
fs.mkdirSync(runtime, { recursive: true });
const fixture = await createFixture(path.join(runtime, 'fixture'));
const quote = x => "'" + x.replaceAll("'", "'\\''") + "'";
const wrapper = path.join(runtime, 'electron-sandbox.sh');
fs.writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(sandboxProfile())} ${quote(electronPath)} "$@"\n`, { mode: 0o755 });
function snapshot(directory) {
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter(x => x.isFile()).map(x => {
    const file = path.join(x.parentPath, x.name);
    return [path.relative(directory, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
  }));
}
const before = snapshot(fixture.directory);
function descendants(pid) {
  const children = spawnSync('/usr/bin/pgrep', ['-P', String(pid)], { encoding: 'utf8' }).stdout.trim().split(/\s+/).filter(x => /^\d+$/.test(x)).map(Number);
  return children.flatMap(child => [{ pid: child, executable: spawnSync('/bin/ps', ['-p', String(child), '-o', 'comm='], { encoding: 'utf8' }).stdout.trim() }, ...descendants(child)]);
}
const report = { testedAt: new Date().toISOString(), session, fixture, realUserDataAccessed: false, checks: {}, rendererErrors: [], logs: [] };
let app, page;
try {
  app = await electron.launch({ executablePath: wrapper, args: ['--no-sandbox', path.join(root, 'dist/app')], cwd: root, env: launchEnvironment(session, { backend: 'independent', dataDir: fixture.directory, accountId: fixture.accountId }), timeout: 45000 });
  app.process().stdout?.on('data', x => report.logs.push(x.toString()));
  app.process().stderr?.on('data', x => report.logs.push(x.toString()));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    page = app.windows().find(p => p.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(page, 'Main renderer must open');
  page.on('pageerror', e => report.rendererErrors.push(e.message));
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20);
  report.backend = await page.evaluate(() => window.alpha.system.getBackendStatus());
  assert.equal(report.backend.state, 'ready');
  assert.ok(report.backend.components.some(c => c.component === 'alpha-independent-engine'));
  report.checks.independentBackendReady = true;
  report.accounts = await page.evaluate(() => window.alpha.accounts.list());
  assert.equal(report.accounts.length, 1);
  assert.equal(report.accounts[0].id, fixture.accountId);
  assert.equal(report.accounts[0].handleState, 'open');
  report.capabilities = await page.evaluate(() => window.alpha.license.capabilities());
  assert.equal(report.capabilities, null, 'No original entitlement is forged');
  const read = await page.evaluate(async ({ accountId, conversationId }) => ({
    contacts: await window.alpha.data.contacts(accountId, '', 100, 0),
    conversations: await window.alpha.conversations.list(accountId, 100),
    messages: await window.alpha.messages.list(accountId, conversationId, 100, true)
  }), fixture);
  report.read = read;
  assert.ok(JSON.stringify(read.contacts).includes('合成联系人甲'));
  assert.ok(JSON.stringify(read.messages).includes('first source'));
  report.checks.realSqliteThroughDesktopIpc = true;
  report.ownedChildProcesses = descendants(app.process().pid);
  assert.ok(report.ownedChildProcesses.some(x => x.executable.endsWith('/alpha-data-bridge')));
  assert.equal(report.ownedChildProcesses.some(x => /\/(?:vendor\/runtime|build\/runtime-bundle)\/bin\/alpha-/.test(x.executable)), false);
  report.checks.noOriginalAlphaChildObserved = true;
  // Walk the actual onboarding controls; no localStorage or query-cache injection.
  await page.getByRole('checkbox', { name: '我已了解，开始连接本地数据' }).click();
  const connect = page.locator('.setup-footer').getByRole('button', { name: '打开数据副本', exact: true });
  await connect.click({ timeout: 20000 });
  await page.locator('.setup-footer').getByRole('button', { name: '暂时跳过', exact: true }).click({ timeout: 20000 });
  await page.locator('.setup-footer').getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '进入 Alpha', exact: true }).click();
  await page.locator('main[data-surface="workspace"]').waitFor();
  report.checks.originalOnboardingCompleted = true;
  await page.getByText('合成联系人甲', { exact: true }).first().click({ timeout: 15000 });
  await page.getByText('first source', { exact: true }).first().waitFor({ timeout: 15000 });
  report.checks.messageRendered = true;
  await page.screenshot({ path: path.join(root, 'docs/independent-run.png'), fullPage: true });
  // Use real security IPC and demonstrate that the same data operation is denied.
  report.lock = await page.evaluate(async ({ accountId, conversationId }) => {
    const password = 'Synthetic-smoke-password-123';
    const configured = await window.alpha.security.configureApplicationLock({ action: 'enable_password', newPassword: password });
    const locked = await window.alpha.security.lockApplication();
    let denied = '';
    try { await window.alpha.messages.list(accountId, conversationId, 100, true); }
    catch (e) { denied = e.message; }
    const unlocked = await window.alpha.security.unlockApplication(password);
    const messages = await window.alpha.messages.list(accountId, conversationId, 100, true);
    return { configured, locked, denied, unlocked, resumedCount: messages.length };
  }, fixture);
  assert.match(report.lock.denied, /APP_LOCK_LOCKED/);
  assert.equal(report.lock.locked.locked, true);
  assert.equal(report.lock.unlocked.locked, false);
  report.checks.lockEnforcesReadAccess = true;
  assert.deepEqual(snapshot(fixture.directory), before, 'Source snapshot must remain byte-identical');
  report.checks.sourceUnchanged = true;
  assert.deepEqual(report.rendererErrors, []);
} catch (e) {
  report.failure = e.stack;
  if (page) {
    report.bodyAtFailure = await page.locator('body').innerText().catch(() => '');
    await page.screenshot({ path: path.join(root, 'docs/independent-run-failure.png'), fullPage: true }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (app) {
    const timer = setTimeout(() => app.process().kill('SIGKILL'), 8000);
    try { await app.close(); } catch (e) { report.closeError = e.message; } finally { clearTimeout(timer); }
  }
  const logs = report.logs.join(''); delete report.logs;
  fs.writeFileSync(path.join(root, 'docs/independent-run.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs/independent-run.log'), logs);
  console.log(JSON.stringify({ checks: report.checks, failure: report.failure, report: 'docs/independent-run.json' }, null, 2));
}
