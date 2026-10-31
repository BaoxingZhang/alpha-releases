import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { root, launchEnvironment, sandboxProfile } from '../scripts/environment.mjs';
const session = `smoke-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
fs.mkdirSync(runtime, { recursive: true });
const profile = sandboxProfile();
const quote = x => "'" + x.replaceAll("'", "'\\''") + "'";
const wrapper = path.join(runtime, 'electron-sandbox.sh');
fs.writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(profile)} ${quote(electronPath)} "$@"\n`, { mode: 0o755 });
const report = { testedAt: new Date().toISOString(), session, checks: {}, errors: [], windows: [], backend: null };
const logs = [];
let app;
try {
const projectProbe = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, '/bin/cat', path.join(root, 'package.json')], { encoding: 'utf8' });
report.checks.projectReadable = projectProbe.status === 0;
const probeDirectory = fs.mkdtempSync(path.join(os.homedir(), '.alpha-recovery-probe-'));
try {
  const outside = path.join(probeDirectory, 'marker.txt');
  fs.writeFileSync(outside, 'Non-sensitive recovery sandbox probe.');
  const fileProbe = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, '/bin/cat', outside], { encoding: 'utf8' });
  report.checks.personalFileReadDenied = fileProbe.status !== 0 && /not permitted|denied/i.test(fileProbe.stderr);
} finally { fs.rmSync(probeDirectory, { recursive: true, force: true }); }
const netProbe = spawnSync('/usr/bin/sandbox-exec', ['-f', profile, '/usr/bin/curl', '--noproxy', '*', '--connect-timeout', '2', '--max-time', '3', '--verbose', 'http://192.0.2.1:80'], { encoding: 'utf8', env: launchEnvironment(session) });
report.checks.remoteNetworkDenied = netProbe.status === 7 && /Operation not permitted/i.test(netProbe.stderr);
if (!report.checks.projectReadable || !report.checks.personalFileReadDenied || !report.checks.remoteNetworkDenied) throw new Error(`Sandbox preflight failed: ${JSON.stringify(report.checks)}`);
  app = await electron.launch({ executablePath: wrapper, args: ['--no-sandbox', path.join(root, 'dist/app')], cwd: root, env: launchEnvironment(session), timeout: 45000 });
  app.process().stdout?.on('data', x => logs.push(x.toString()));
  app.process().stderr?.on('data', x => logs.push(x.toString()));
  const watch = page => { page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); }); };
  app.windows().forEach(watch);
  app.on('window', watch);
  let page;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    page = app.windows().find(p => p.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(r => setTimeout(r, 250));
  }
  if (!page) throw new Error('Main renderer did not open within 45 seconds');
  await page.waitForFunction(() => document.body.innerText.trim().length > 20 && !!window.alpha, { timeout: 20000 });
  report.checks.mainRendererLoaded = true;
  report.app = await app.evaluate(({ app }) => ({ name: app.getName(), version: app.getVersion(), isPackaged: app.isPackaged, appPath: app.getAppPath(), userData: app.getPath('userData'), home: app.getPath('home'), electron: process.versions.electron }));
  report.checks.keychainDisabled = await app.evaluate(({ safeStorage }) => {
    if (safeStorage.isEncryptionAvailable()) return false;
    try { safeStorage.encryptString('non-sensitive-probe'); return false; } catch (e) { return e.message === 'RECOVERY_KEYCHAIN_DISABLED'; }
  });
  report.bridge = await page.evaluate(() => Object.keys(window.alpha));
  report.body = (await page.locator('body').innerText()).slice(0, 12000);
  report.windows = app.windows().map(p => p.url().startsWith('data:') ? '(splash data URL)' : p.url());
  await page.screenshot({ path: path.join(root, 'docs/local-run.png'), fullPage: true });
  const outcome = await page.evaluate(async () => {
    const results = {};
    for (const [key, read] of Object.entries({ backend: () => window.alpha.system.getBackendStatus(), update: () => window.alpha.system.getUpdateStatus(), accounts: () => window.alpha.accounts.list(), capabilities: () => window.alpha.license.capabilities() })) {
      try { results[key] = await Promise.race([read(), new Promise((_, reject) => setTimeout(() => reject(new Error('READ_TIMEOUT')), 12000))]); }
      catch (e) { results[key] = { error: e.message }; }
    }
    return results;
  });
  Object.assign(report, outcome);
  report.checks.backendReady = report.backend?.state === 'ready';
  report.checks.emptyAccounts = Array.isArray(report.accounts) ? report.accounts.length === 0 : null;
  if (!report.checks.keychainDisabled || report.errors.length) throw new Error('Renderer or isolation check failed');
} catch (e) {
  report.failure = e.stack;
  process.exitCode = 1;
} finally {
  if (app) { const stopTimer = setTimeout(() => app.process().kill('SIGKILL'), 8000); try { await app.close(); } catch (e) { report.closeError = e.message; } finally { clearTimeout(stopTimer); } }
  fs.writeFileSync(path.join(root, 'docs/local-run.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs/local-run.log'), logs.join(''));
  console.log(JSON.stringify({ checks: report.checks, backend: report.backend, failure: report.failure, report: 'docs/local-run.json' }, null, 2));
}
