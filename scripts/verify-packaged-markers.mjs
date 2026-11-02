import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const artifacts = path.join(root, '.runtime', 'release-artifacts');
const markerRelativePath = 'Contents/Resources/alpha-backend-mode.json';
const updateMarkerRelativePath = 'Contents/Resources/alpha-update-mode.json';

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

async function readJson(filename, code) {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8'));
  } catch {
    fail(code, filename);
  }
}

async function verifyFlavor({ appName, backend, bundleIdentifier }) {
  const appPath = path.join(artifacts, `${appName}.app`);
  const manifestPath = `${appPath}.manifest.json`;
  const markerPath = path.join(appPath, markerRelativePath);
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const manifest = await readJson(manifestPath, 'PACKAGED_MANIFEST_INVALID');
  if (manifest.schema !== 'alpha-recovered.macos-app.v1' || manifest.backendMode !== backend || manifest.productName !== appName) {
    fail('PACKAGED_MANIFEST_FLAVOR_MISMATCH', appName);
  }
  const marker = await readJson(markerPath, 'PACKAGED_MARKER_INVALID');
  if (marker.schema !== 'alpha.recovered.backend-mode.v1' || marker.backend !== backend) {
    fail('PACKAGED_MARKER_FLAVOR_MISMATCH', appName);
  }
  if (!Array.isArray(manifest.files) || !manifest.files.some(file => file.path === markerRelativePath && file.mode === '644')) {
    fail('PACKAGED_MARKER_MISSING_FROM_MANIFEST', appName);
  }
  let updateMode;
  if (backend === 'independent') {
    const updateMarkerPath = path.join(appPath, updateMarkerRelativePath);
    const updateMarker = await readJson(updateMarkerPath, 'PACKAGED_UPDATE_MARKER_INVALID');
    if (updateMarker.schema !== 'alpha.recovered.update-mode.v1' || !['disabled', 'configured'].includes(updateMarker.mode)) {
      fail('PACKAGED_UPDATE_MARKER_INVALID', appName);
    }
    if (!manifest.files.some(file => file.path === updateMarkerRelativePath && file.mode === '644')) {
      fail('PACKAGED_UPDATE_MARKER_MISSING_FROM_MANIFEST', appName);
    }
    updateMode = { path: updateMarkerRelativePath, mode: updateMarker.mode, reason: updateMarker.reason ?? null };
  }
  const plist = await fs.readFile(plistPath, 'utf8').catch(() => fail('PACKAGED_PLIST_MISSING', appName));
  for (const value of [appName, bundleIdentifier]) if (!plist.includes(`<string>${value}</string>`)) fail('PACKAGED_IDENTITY_MISMATCH', `${appName}:${value}`);
  return { appName, backend, marker: markerRelativePath, ...(updateMode ? { updateMode } : {}), manifest: path.relative(root, manifestPath).split(path.sep).join('/'), fileCount: manifest.fileCount, artifactDigest: manifest.artifactDigest };
}

const results = await Promise.all([
  verifyFlavor({ appName: 'Alpha Recovered', backend: 'original', bundleIdentifier: 'local.alpha.recovered' }),
  verifyFlavor({ appName: 'Alpha Recovered Independent', backend: 'independent', bundleIdentifier: 'local.alpha.recovered.independent' })
]);
console.log(JSON.stringify({ schema: 'alpha-recovered.packaged-markers.v1', flavors: results }, null, 2));
