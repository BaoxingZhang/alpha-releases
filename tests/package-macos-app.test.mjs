import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildFileManifest, manifestDigest, rewriteElectronInfoPlist } from '../scripts/package-macos-app.mjs';

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
