import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { root, launchEnvironment } from '../scripts/environment.mjs';
import projectPackage from '../package.json' with { type: 'json' };
import projectIdentity from '../packages/alpha-desktop/project-identity.cjs';

const execFileAsync = promisify(execFile);
const independentIdentity = projectIdentity.readProjectIdentity(projectPackage).independent;
const defaultDmg = path.join(root, '.runtime', 'release-artifacts', `${independentIdentity.productName}.dmg`);
const session = `packaged-dmg-${Date.now()}`;
const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-packaged-dmg-smoke-'));
const runtimeRoot = path.join(temporaryRoot, 'runtime');
const mountRoot = path.join(temporaryRoot, 'mount');
const dmg = path.resolve(process.argv[2] || defaultDmg);
const report = { schema: 'alpha-recovered.packaged-dmg-smoke.v1', session, dmg, checks: {} };
let mountPoint;
let app;
let cleanupFailure;

function rememberCleanupFailure(error) {
  if (!cleanupFailure) cleanupFailure = error;
}

function fail(message) { throw new Error(message); }

function parseMountPoint(plist) {
  const match = plist.match(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/i);
  if (!match) fail('PACKAGED_DMG_MOUNT_POINT_MISSING');
  return match[1];
}

function isInside(parent, candidate) {
  const base = path.resolve(parent);
  const value = path.resolve(candidate);
  return value === base || value.startsWith(`${base}${path.sep}`);
}

async function exists(filename) {
  try { await fs.lstat(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function attach() {
  await fs.mkdir(mountRoot, { recursive: true, mode: 0o700 });
  const result = await execFileAsync('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-plist', '-mountrandom', mountRoot, dmg], { maxBuffer: 1024 * 1024 });
  mountPoint = parseMountPoint(result.stdout);
  const realMountRoot = await fs.realpath(mountRoot);
  const realMountPoint = await fs.realpath(mountPoint);
  if (!realMountPoint.startsWith(`${realMountRoot}${path.sep}`)) fail('PACKAGED_DMG_MOUNT_POINT_UNEXPECTED');
  return mountPoint;
}

async function detach() {
  if (!mountPoint) return;
  try { await execFileAsync('/usr/bin/hdiutil', ['detach', mountPoint], { maxBuffer: 256 * 1024 }); }
  finally { mountPoint = undefined; }
}

await fs.mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
try {
  assert.equal(process.platform, 'darwin', 'packaged DMG smoke requires macOS');
  assert.equal(process.arch, 'arm64', 'packaged DMG smoke requires arm64');
  assert.ok((await fs.stat(dmg)).isFile(), `DMG is missing: ${dmg}`);
  await attach();
  report.mountPoint = mountPoint;
  report.checks.readOnlyNoBrowseAttach = true;
  const appPath = path.join(mountPoint, `${independentIdentity.productName}.app`);
  const executablePath = path.join(appPath, 'Contents', 'MacOS', independentIdentity.executableName);
  const resourcesPath = path.join(appPath, 'Contents', 'Resources');
  const bundleRuntime = path.join(appPath, 'Contents', '.runtime');
  const bundleRuntimeBefore = await exists(bundleRuntime);
  report.bundleRuntimeBefore = bundleRuntimeBefore;
  assert.equal(bundleRuntimeBefore, false, 'DMG app bundle must not contain a writable runtime directory');
  assert.ok((await fs.stat(executablePath)).isFile(), 'mounted independent executable is missing');
  assert.ok((await fs.stat(resourcesPath)).isDirectory(), 'mounted independent resources are missing');
  const environment = launchEnvironment(session, { backend: 'independent' });
  for (const [key, suffix] of Object.entries({ HOME: 'home', TMPDIR: 'tmp', TMP: 'tmp', TEMP: 'tmp' })) {
    environment[key] = path.join(runtimeRoot, suffix);
    await fs.mkdir(environment[key], { recursive: true, mode: 0o700 });
  }
  environment.ALPHA_RECOVERY_SESSION = session;
  app = await electron.launch({ executablePath, args: ['--no-sandbox'], cwd: root, env: environment, timeout: 60000 });
  const main = await app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    home: app.getPath('home'),
    userData: app.getPath('userData'),
    appData: app.getPath('appData'),
    temp: app.getPath('temp')
  }));
  report.main = main;
  assert.equal(main.isPackaged, true);
  assert.equal(main.resourcesPath, resourcesPath);
  for (const [name, value] of Object.entries(main)) {
    if (['appPath', 'resourcesPath'].includes(name)) continue;
    if (typeof value === 'string') assert.equal(isInside(mountPoint, value), false, `${name} must be outside read-only DMG`);
  }
  report.checks.packagedRendererRuntimeOutsideMount = true;
  let page;
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    page = app.windows().find(candidate => candidate.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'mounted DMG renderer did not open');
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20, { timeout: 20000 });
  const backend = await page.evaluate(() => window.alpha.system.getBackendStatus());
  assert.equal(backend.state, 'ready');
  assert.ok(backend.components?.some(component => component.component === 'alpha-independent-engine'));
  report.backend = backend;
  report.checks.independentBackendReadyFromMountedDmg = true;
} finally {
  if (app) {
    const killTimer = setTimeout(() => { try { app.process().kill('SIGKILL'); } catch {} }, 8000);
    try { await app.close(); }
    catch (error) { rememberCleanupFailure(error); }
    finally { clearTimeout(killTimer); }
  }
  if (mountPoint) {
    try {
      const bundleRuntimeAfter = await exists(path.join(mountPoint, `${independentIdentity.productName}.app`, 'Contents', '.runtime'));
      report.bundleRuntimeAfter = bundleRuntimeAfter;
      assert.equal(bundleRuntimeAfter, false, 'mounted app bundle must not receive a runtime directory');
      if (Object.hasOwn(report, 'bundleRuntimeBefore')) assert.equal(bundleRuntimeAfter, report.bundleRuntimeBefore, 'mounted app bundle runtime must not change');
      report.checks.bundleRuntimeUnchanged = true;
    } catch (error) {
      rememberCleanupFailure(error);
    }
  }
  try {
    await detach();
  } catch (error) {
    report.detachError = error.message;
    rememberCleanupFailure(error);
  }
  try {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  } catch (error) {
    rememberCleanupFailure(error);
  }
  if (cleanupFailure) throw cleanupFailure;
}

console.log(JSON.stringify(report, null, 2));
