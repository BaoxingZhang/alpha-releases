import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, launchEnvironment } from '../scripts/environment.mjs';
import projectPackage from '../package.json' with { type: 'json' };
import projectIdentity from '../packages/alpha-desktop/project-identity.cjs';

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('PACKAGED_NATIVE_SMOKE_REQUIRES_MACOS_ARM64');

const identity = projectIdentity.readProjectIdentity(projectPackage);
const appPath = path.join(root, '.runtime', 'release-artifacts', `${identity.productName}.app`);
const executablePath = path.join(appPath, 'Contents', 'MacOS', identity.executableName);
const resourcesPath = path.join(appPath, 'Contents', 'Resources');
const session = `packaged-native-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
const packagedRuntime = path.join(appPath, 'Contents', '.runtime', session);
const report = {
  schema: 'alpha-recovered.packaged-native-smoke.v1',
  session,
  isolation: { customSeatbelt: false, electronNoSandbox: true, temporaryHome: true, realWeChatData: false, nativeFilesModified: false },
  checks: {}
};
let app;

await fs.mkdir(path.join(runtime, 'home'), { recursive: true, mode: 0o700 });
const environment = launchEnvironment(session);
for (const [key, suffix] of Object.entries({ HOME: 'home', USERPROFILE: 'user-profile', XDG_CONFIG_HOME: 'xdg-config', XDG_DATA_HOME: 'xdg-data', XDG_CACHE_HOME: 'xdg-cache', TMPDIR: 'tmp' })) {
  environment[key] = path.join(runtime, suffix);
  await fs.mkdir(environment[key], { recursive: true, mode: 0o700 });
}
environment.TMP = environment.TMPDIR;
environment.TEMP = environment.TMPDIR;

try {
  assert.ok((await fs.stat(executablePath)).isFile(), 'packaged native executable is missing');
  assert.ok((await fs.stat(path.join(resourcesPath, 'app'))).isDirectory(), 'packaged app resources are missing');
  app = await electron.launch({ executablePath, args: ['--no-sandbox'], cwd: root, env: environment, timeout: 45000 });
  const main = await app.evaluate(({ app }) => ({ isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath, userData: app.getPath('userData'), home: app.getPath('home') }));
  report.main = main;
  assert.equal(main.isPackaged, true);
  assert.equal(main.appPath, path.join(resourcesPath, 'app'));
  assert.equal(main.resourcesPath, resourcesPath);
  assert.equal(main.home, path.join(packagedRuntime, 'home'));
  report.checks.electronPackagedMode = true;
  const deadline = Date.now() + 45000;
  let page;
  while (Date.now() < deadline) {
    page = app.windows().find(candidate => candidate.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'packaged native renderer did not open');
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20, { timeout: 20000 });
  report.checks.rendererLoaded = true;
  const backend = await page.evaluate(() => window.alpha.system.getBackendStatus());
  report.backend = backend;
  assert.equal(backend.state, 'ready');
  assert.ok(backend.components?.some(component => component.component === 'engine'));
  assert.ok(backend.components?.some(component => component.component === 'native-host'));
  report.checks.nativeBackendReady = true;
  const accounts = await page.evaluate(() => window.alpha.accounts.list());
  assert.deepEqual(accounts, []);
  report.accounts = { count: accounts.length, meaning: 'temporary userData had no configured account; this is not a real-data query' };
  report.checks.emptyDisposableAccounts = true;
} finally {
  if (app) {
    const closeTimer = setTimeout(() => app.process().kill('SIGKILL'), 8000);
    try { await app.close(); } finally { clearTimeout(closeTimer); }
  }
  await fs.rm(runtime, { recursive: true, force: true });
  await fs.rm(packagedRuntime, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
