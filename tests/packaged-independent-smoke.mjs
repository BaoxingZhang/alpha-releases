import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createFixture } from './data-bridge-fixture.mjs';
import { root, launchEnvironment } from '../scripts/environment.mjs';

// This smoke starts the generated .app binary itself. Passing an unpacked
// Resources/app path to Electron exercises the development branch, so this
// test also asserts app.isPackaged and the packaged Resources path before it
// reads the disposable fixture through the renderer IPC surface.
const appPath = path.join(root, '.runtime', 'release-artifacts', 'Alpha Recovered Independent.app');
const executablePath = path.join(appPath, 'Contents', 'MacOS', 'AlphaRecoveredIndependent');
const resourcesPath = path.join(appPath, 'Contents', 'Resources');
const session = `packaged-independent-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
const packagedRuntime = path.join(appPath, 'Contents', '.runtime', session);
const report = { schema: 'alpha-recovered.packaged-independent-smoke.v1', session, checks: {} };
let app;

await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
try {
  const executableStat = await fs.stat(executablePath).catch(() => null);
  assert.ok(executableStat?.isFile(), 'generated independent executable is missing');
  const marker = JSON.parse(await fs.readFile(path.join(resourcesPath, 'alpha-backend-mode.json'), 'utf8'));
  assert.deepEqual(marker, { schema: 'alpha.recovered.backend-mode.v1', backend: 'independent' });
  report.checks.independentPackagedMarker = true;

  const fixture = await createFixture(path.join(runtime, 'fixture'));
  const environment = launchEnvironment(session, {
    backend: 'independent',
    dataDir: fixture.directory,
    accountId: fixture.accountId
  });
  app = await electron.launch({
    executablePath,
    args: ['--no-sandbox'],
    cwd: root,
    env: environment,
    timeout: 45000
  });
  const main = await app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  }));
  report.main = main;
  assert.equal(main.isPackaged, true);
  assert.equal(main.resourcesPath, resourcesPath);
  assert.equal(main.appPath, path.join(resourcesPath, 'app'));
  report.checks.electronPackagedMode = true;

  const deadline = Date.now() + 30000;
  let page;
  while (Date.now() < deadline) {
    page = app.windows().find(candidate => candidate.url().endsWith('/out/renderer/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'packaged renderer did not open');
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20);
  report.checks.packagedRendererLoaded = true;

  const backend = await page.evaluate(() => window.alpha.system.getBackendStatus());
  assert.equal(backend.state, 'ready');
  assert.ok(backend.components.some(component => component.component === 'alpha-independent-engine'));
  report.backend = backend;
  report.checks.independentBackendReady = true;

  const accountResult = await page.evaluate(async ({ accountId, conversationId }) => {
    const accounts = await window.alpha.accounts.list();
    const messages = await window.alpha.messages.list(accountId, conversationId, 100, true);
    return { accounts, messages };
  }, { accountId: fixture.accountId, conversationId: fixture.conversationId });
  assert.equal(accountResult.accounts.length, 1);
  assert.equal(accountResult.accounts[0].id, fixture.accountId);
  assert.ok(accountResult.messages.some(message => message.text === 'first source'));
  report.accounts = accountResult.accounts;
  report.messageCount = accountResult.messages.length;
  report.checks.fixtureReadThroughRendererIpc = true;
} finally {
  if (app) {
    const closeTimer = setTimeout(() => app.process().kill('SIGKILL'), 8000);
    try { await app.close(); } finally { clearTimeout(closeTimer); }
  }
  await fs.rm(runtime, { recursive: true, force: true });
  await fs.rm(packagedRuntime, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
