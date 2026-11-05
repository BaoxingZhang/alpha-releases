import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { buildFileManifest, createDmgWithRetry, isHdiutilResourceBusy, manifestDigest, rewriteElectronInfoPlist } from '../scripts/package-macos-app.mjs';
import updateMode from '../packages/alpha-desktop/update-mode.cjs';
const { readIndependentUpdateMode } = updateMode;

test('macOS app packaging rewrites identity while retaining Electron executable', () => {
  const source = `<?xml version="1.0"?><plist><dict>
<key>CFBundleDisplayName</key>
\t<string>Electron</string>
<key>CFBundleExecutable</key>
\t<string>Electron</string>
<key>CFBundleIdentifier</key>
\t<string>com.github.Electron</string>
<key>CFBundleName</key>
\t<string>Electron</string>
</dict></plist>`;
  const result = rewriteElectronInfoPlist(source);
  assert.match(result, /CFBundleDisplayName<\/key>\s*<string>Alpha Recovered<\/string>/);
  assert.match(result, /CFBundleName<\/key>\s*<string>Alpha Recovered<\/string>/);
  assert.match(result, /CFBundleIdentifier<\/key>\s*<string>local\.alpha\.recovered<\/string>/);
  assert.match(result, /CFBundleExecutable<\/key>\s*<string>Electron<\/string>/);
});

test('DMG packaging identifies transient hdiutil resource contention for bounded retry', () => {
  assert.equal(isHdiutilResourceBusy({ stderr: 'hdiutil: create failed - Resource busy\n' }), true);
  assert.equal(isHdiutilResourceBusy({ message: 'Command failed: hdiutil create' }), false);
  assert.equal(isHdiutilResourceBusy(new Error('Resource busy')), true);
});

test('DMG packaging retries only transient resource contention', async () => {
  const calls = [];
  const sleeps = [];
  const result = await createDmgWithRetry(['create'], {
    delaysMs: [1, 2],
    sleep: async delay => sleeps.push(delay),
    execute: async (...args) => {
      calls.push(args);
      if (calls.length < 3) throw { stderr: 'hdiutil: create failed - Resource busy\\n' };
      return { stdout: '', stderr: '' };
    }
  });
  assert.equal(result.stdout, '');
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [1, 2]);
});

test('independent app flavor gets a distinct display name and bundle identifier', () => {
  const source = '<key>CFBundleDisplayName</key>\n\t<string>Electron</string>\n<key>CFBundleName</key>\n\t<string>Electron</string>\n<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>';
  const result = rewriteElectronInfoPlist(source, { appName: 'Alpha Recovered Independent', bundleIdentifier: 'local.alpha.recovered.independent' });
  assert.match(result, /CFBundleDisplayName<\/key>\s*<string>Alpha Recovered Independent<\/string>/);
  assert.match(result, /CFBundleName<\/key>\s*<string>Alpha Recovered Independent<\/string>/);
  assert.match(result, /CFBundleIdentifier<\/key>\s*<string>local\.alpha\.recovered\.independent<\/string>/);
});

test('macOS identity values are XML escaped before writing Info.plist', async () => {
  const source = '<key>CFBundleDisplayName</key>\n\t<string>Electron</string>\n'
    + '<key>CFBundleName</key>\n\t<string>Electron</string>\n'
    + '<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>\n'
    + '<key>CFBundleExecutable</key>\n\t<string>Electron</string>';
  const result = rewriteElectronInfoPlist(source, { appName: 'A & B <test>', bundleIdentifier: 'local.a', executableName: 'AB', strictExecutable: true });
  assert.match(result, /<string>A &amp; B &lt;test&gt;<\/string>/);
  if (process.platform === 'darwin') {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const filename = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-plist-')), 'Info.plist');
    try {
      await fs.writeFile(filename, result);
      await promisify(execFile)('/usr/bin/plutil', ['-lint', filename]);
    } finally {
      await fs.rm(path.dirname(filename), { recursive: true, force: true });
    }
  }
});

test('generated app can opt into Electron packaged mode with its recovered executable', () => {
  const source = '<key>CFBundleDisplayName</key>\n\t<string>Electron</string>\n'
    + '<key>CFBundleName</key>\n\t<string>Electron</string>\n'
    + '<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>\n'
    + '<key>CFBundleExecutable</key>\n\t<string>Electron</string>';
  const result = rewriteElectronInfoPlist(source, { executableName: 'AlphaRecoveredIndependent' });
  assert.match(result, /CFBundleExecutable<\/key>\s*<string>AlphaRecoveredIndependent<\/string>/);
});

test('packaging can stamp the project version into both macOS bundle version fields', () => {
  const source = '<key>CFBundleDisplayName</key>\n\t<string>Electron</string>\n'
    + '<key>CFBundleName</key>\n\t<string>Electron</string>\n'
    + '<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>\n'
    + '<key>CFBundleShortVersionString</key>\n\t<string>44.10.1</string>\n'
    + '<key>CFBundleVersion</key>\n\t<string>44.10.1</string>';
  const result = rewriteElectronInfoPlist(source, { appVersion: '1.2.3' });
  assert.match(result, /CFBundleShortVersionString<\/key>\s*<string>1\.2\.3<\/string>/);
  assert.match(result, /CFBundleVersion<\/key>\s*<string>1\.2\.3<\/string>/);
});

test('packaging rejects a template without CFBundleExecutable when strict mode is enabled', () => {
  assert.throws(() => rewriteElectronInfoPlist(
    '<key>CFBundleDisplayName</key>\n\t<string>Electron</string>\n'
      + '<key>CFBundleName</key>\n\t<string>Electron</string>\n'
      + '<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>',
    { executableName: 'AlphaRecovered', strictExecutable: true }
  ), /MACOS_APP_INFO_PLIST_EXECUTABLE_MISSING/);
});

test('independent update mode fails closed until the project ships its own policy', async () => {
  const projectConfig = JSON.parse(await fs.readFile(path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'provenance', 'independent-update-mode.json'), 'utf8'));
  assert.equal(updateMode.normalizeIndependentUpdateMode(projectConfig).mode, 'disabled');
  const resources = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-update-mode-'));
  try {
    assert.equal(readIndependentUpdateMode(resources).mode, 'disabled');
    await fs.writeFile(path.join(resources, 'alpha-update-mode.json'), JSON.stringify({ schema: 'alpha.recovered.update-mode.v1', mode: 'disabled', reason: 'test' }));
    assert.equal(readIndependentUpdateMode(resources).reason, 'test');
    await fs.writeFile(path.join(resources, 'alpha-update-mode.json'), JSON.stringify({ schema: 'alpha.recovered.update-mode.v1', mode: 'configured', config: { publicKey: 'key', policyUrl: 'https://updates.example.invalid/policy.json', channel: 'stable' } }));
    assert.equal(readIndependentUpdateMode(resources).mode, 'configured');
    await fs.writeFile(path.join(resources, 'alpha-update-mode.json'), '{"schema":"wrong","mode":"configured"}');
    assert.equal(readIndependentUpdateMode(resources).mode, 'disabled');
  } finally {
    await fs.rm(resources, { recursive: true, force: true });
  }
});

test('macOS app file manifests are deterministic and reject symlinks', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-macos-app-manifest-'));
  try {
    await fs.mkdir(path.join(directory, 'Contents', 'MacOS'), { recursive: true });
    await fs.writeFile(path.join(directory, 'Contents', 'MacOS', 'Electron'), 'binary', { mode: 0o755 });
    await fs.writeFile(path.join(directory, 'Contents', 'Info.plist'), 'plist');
    const files = await buildFileManifest(directory);
    assert.deepEqual(files.map(file => file.path), ['Contents/Info.plist', 'Contents/MacOS/Electron']);
    assert.match(manifestDigest(files), /^[a-f0-9]{64}$/);
    await fs.symlink(path.join(directory, 'Contents', 'MacOS', 'Electron'), path.join(directory, 'Contents', 'MacOS', 'link'));
    await assert.rejects(() => buildFileManifest(directory), /MACOS_APP_SYMLINK_REJECTED/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('generated app payloads keep the recovered protobuf runtime closure', async () => {
  const app = path.join(path.dirname(path.dirname(new URL(import.meta.url).pathname)), 'dist', 'app');
  const main = path.join(app, 'out', 'main', 'index.js');
  const independentProtocol = path.join(app, 'independent', 'packages', 'alpha-protocol', 'index.cjs');
  const mainRequire = createRequire(main);
  const independentRequire = createRequire(independentProtocol);
  const mainWire = mainRequire.resolve('@bufbuild/protobuf/wire');
  const independentWire = independentRequire.resolve('@bufbuild/protobuf/wire');
  assert.equal(mainWire, path.join(app, 'node_modules', '@bufbuild', 'protobuf', 'dist', 'commonjs', 'wire', 'index.js'));
  assert.equal(independentWire, path.join(app, 'independent', 'node_modules', '@bufbuild', 'protobuf', 'dist', 'commonjs', 'wire', 'index.js'));
});
