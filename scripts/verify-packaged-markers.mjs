import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { readProjectIdentity, flavorIdentity } = require('../packages/alpha-desktop/project-identity.cjs');
const identity = readProjectIdentity(JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')));
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

function decodeXmlText(value, appName) {
  const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(value) || /[<>]/.test(value)) {
    fail('PACKAGED_PLIST_XML_INVALID', appName);
  }
  const decoded = value.replace(/&(amp|lt|gt|quot|apos);/g, (_whole, name) => {
    return entities[name] ?? whole;
  });
  return decoded;
}

export function parsePlistIdentity(plist, appName = 'unknown') {
  if (typeof plist !== 'string') fail('PACKAGED_PLIST_XML_INVALID', appName);
  const values = {};
  for (const [field, key] of [
    ['productName', 'CFBundleDisplayName'],
    ['bundleIdentifier', 'CFBundleIdentifier'],
    ['executableName', 'CFBundleExecutable']
  ]) {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...plist.matchAll(new RegExp(`<key>${escapedKey}</key>\\s*<string>([\\s\\S]*?)</string>`, 'g'))];
    if (matches.length !== 1) fail('PACKAGED_PLIST_IDENTITY_KEY_INVALID', `${appName}:${key}`);
    values[field] = decodeXmlText(matches[0][1], appName);
  }
  return values;
}

async function verifyFlavor({ productName, backend, bundleIdentifier, executableName }) {
  const appName = productName;
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
  const executableRelativePath = `Contents/MacOS/${executableName}`;
  if (!Array.isArray(manifest.files) || !manifest.files.some(file => file.path === markerRelativePath && file.mode === '644')) {
    fail('PACKAGED_MARKER_MISSING_FROM_MANIFEST', appName);
  }
  if (!manifest.files.some(file => file.path === executableRelativePath && file.mode && Number.parseInt(file.mode, 8) & 0o111)) {
    fail('PACKAGED_EXECUTABLE_MISSING_FROM_MANIFEST', appName);
  }
  if (manifest.files.some(file => file.path === 'Contents/MacOS/Electron')) {
    fail('PACKAGED_TEMPLATE_EXECUTABLE_RETAINED', appName);
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
  const plistIdentity = parsePlistIdentity(plist, appName);
  if (plistIdentity.productName !== appName || plistIdentity.bundleIdentifier !== bundleIdentifier || plistIdentity.executableName !== executableName) {
    fail('PACKAGED_IDENTITY_MISMATCH', appName);
  }
  return { appName, backend, marker: markerRelativePath, executable: executableRelativePath, ...(updateMode ? { updateMode } : {}), manifest: path.relative(root, manifestPath).split(path.sep).join('/'), fileCount: manifest.fileCount, artifactDigest: manifest.artifactDigest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const results = await Promise.all([
    verifyFlavor({ ...flavorIdentity(identity, 'original'), backend: 'original' }),
    verifyFlavor({ ...flavorIdentity(identity, 'independent'), backend: 'independent' })
  ]);
  console.log(JSON.stringify({ schema: 'alpha-recovered.packaged-markers.v1', flavors: results }, null, 2));
}
