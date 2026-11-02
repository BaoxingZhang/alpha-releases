import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { root, launchEnvironment } from '../scripts/environment.mjs';

// This is a separate native-runtime smoke. The normal test:smoke command wraps
// Electron in the project's Seatbelt profile; that profile intentionally
// rejects the original security host's peer-image check. This command does not
// use that wrapper. It still uses a disposable project runtime and empty HOME,
// never discovers a personal WeChat directory, and does not alter native files.
if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('NATIVE_SMOKE_REQUIRES_MACOS_ARM64');
}

const session = `native-smoke-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
const reportPath = path.join(runtime, 'native-smoke.json');
const logs = [];
const report = {
  schema: 'alpha-recovered.native-smoke.v1',
  session,
  isolation: {
    customSeatbelt: false,
    electronNoSandbox: true,
    temporaryHome: true,
    explicitProjectRuntime: true,
    realWeChatData: false,
    nativeFilesModified: false
  },
  checks: {},
  errors: []
};
let app;

async function runtimeDigest() {
  const runtimeRoot = path.join(root, 'vendor', 'runtime');
  const files = [];
  async function visit(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const metadata = await fs.lstat(absolute);
        if (metadata.isSymbolicLink() || metadata.nlink !== 1) throw new Error('NATIVE_SMOKE_RUNTIME_FILE_INVALID');
        const bytes = await fs.readFile(absolute);
        files.push({ path: path.relative(runtimeRoot, absolute), mode: metadata.mode & 0o7777, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length });
      } else throw new Error('NATIVE_SMOKE_RUNTIME_ENTRY_INVALID');
    }
  }
  await visit(runtimeRoot);
  const aggregate = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  return { aggregate, files };
}

await fs.mkdir(path.join(runtime, 'home'), { recursive: true, mode: 0o700 });
const nativeBefore = await runtimeDigest();
report.nativeRuntimeBefore = { aggregate: nativeBefore.aggregate, fileCount: nativeBefore.files.length };
const environment = launchEnvironment(session);
const disposablePaths = {
  HOME: path.join(runtime, 'home'),
  USERPROFILE: path.join(runtime, 'user-profile'),
  XDG_CONFIG_HOME: path.join(runtime, 'xdg-config'),
  XDG_DATA_HOME: path.join(runtime, 'xdg-data'),
  XDG_CACHE_HOME: path.join(runtime, 'xdg-cache'),
  TMPDIR: path.join(runtime, 'tmp')
};
Object.assign(environment, disposablePaths, { TMP: disposablePaths.TMPDIR, TEMP: disposablePaths.TMPDIR });
await Promise.all(Object.values(disposablePaths).map(directory => fs.mkdir(directory, { recursive: true, mode: 0o700 })));
report.environmentPaths = { ...disposablePaths, TMP: disposablePaths.TMPDIR, TEMP: disposablePaths.TMPDIR };

try {
  app = await electron.launch({
    executablePath: electronPath,
    args: ['--no-sandbox', path.join(root, 'dist/app')],
    cwd: root,
    env: environment,
    timeout: 45000
  });
  app.process().stdout?.on('data', chunk => logs.push(chunk.toString()));
  app.process().stderr?.on('data', chunk => logs.push(chunk.toString()));

  const main = await app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    userData: app.getPath('userData'),
    home: app.getPath('home'),
    electron: process.versions.electron
  }));
  report.main = main;
  assert.equal(main.isPackaged, false);
  assert.equal(main.appPath, path.join(root, 'dist/app'));
  assert.equal(main.userData, path.join(runtime, 'userData'));
  assert.equal(main.home, path.join(runtime, 'home'));
  report.checks.disposableElectronPaths = true;

  const deadline = Date.now() + 45000;
  let page;
  while (Date.now() < deadline) {
    page = app.windows().find(candidate => candidate.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'native renderer did not open');
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20, { timeout: 20000 });
  report.checks.rendererLoaded = true;

  const outcome = await page.evaluate(async () => {
    const read = async (fn) => Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('NATIVE_SMOKE_READ_TIMEOUT')), 15000))
    ]);
    const result = {};
    for (const [key, fn] of Object.entries({
      backend: () => window.alpha.system.getBackendStatus(),
      accounts: () => window.alpha.accounts.list(),
      capabilities: () => window.alpha.license.capabilities()
    })) {
      try {
        result[key] = await read(fn);
      } catch (error) {
        result[key] = { error: error instanceof Error ? error.message : String(error) };
      }
    }
    return result;
  });
  Object.assign(report, outcome);
  assert.equal(report.backend?.state, 'ready');
  assert.ok(Array.isArray(report.backend?.components));
  assert.ok(report.backend.components.some(component => component.component === 'engine'));
  assert.ok(report.backend.components.some(component => component.component === 'native-host'));
  assert.ok(Array.isArray(report.accounts));
  assert.equal(report.accounts.length, 0);
  report.checks.nativeBackendReady = true;
  report.checks.emptyDisposableAccounts = true;
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  if (app) {
    const closeTimer = setTimeout(() => app.process().kill('SIGKILL'), 8000);
    try {
      await app.close();
    } catch (error) {
      report.closeError = error instanceof Error ? error.message : String(error);
    } finally {
      clearTimeout(closeTimer);
    }
  }
  const nativeAfter = await runtimeDigest();
  report.nativeRuntimeAfter = { aggregate: nativeAfter.aggregate, fileCount: nativeAfter.files.length };
  report.isolation.nativeFilesModified = nativeBefore.aggregate !== nativeAfter.aggregate;
  if (report.isolation.nativeFilesModified) process.exitCode = 1;
  report.logs = logs.join('').slice(-8192);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}
