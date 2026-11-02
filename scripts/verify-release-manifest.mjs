import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DEFAULT_MANIFEST = path.join(root, '.runtime', 'release-manifest.json');

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function safeRelativePath(value) {
  if (typeof value !== 'string' || !value || path.posix.isAbsolute(value) || value.includes('\\')) fail('RELEASE_MANIFEST_PATH_INVALID', String(value));
  const normalized = path.posix.normalize(value);
  if (normalized !== value || normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) fail('RELEASE_MANIFEST_PATH_INVALID', value);
  return value;
}

function digestFiles(files) {
  return crypto.createHash('sha256')
    .update(files
      .slice()
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(file => `${file.path}\0${file.bytes}\0${file.sha256}\0${file.mode}\n`)
      .join(''))
    .digest('hex');
}

async function inspectFile(relativePath) {
  const absolute = path.join(root, relativePath);
  const stat = await fs.lstat(absolute).catch(error => {
    if (error.code === 'ENOENT') fail('RELEASE_MANIFEST_FILE_MISSING', relativePath);
    throw error;
  });
  if (stat.isSymbolicLink()) fail('RELEASE_MANIFEST_SYMLINK_REJECTED', relativePath);
  if (!stat.isFile()) fail('RELEASE_MANIFEST_ENTRY_INVALID', relativePath);
  const bytes = await fs.readFile(absolute);
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  return { bytes: bytes.byteLength, sha256, mode: (stat.mode & 0o777).toString(8) };
}

export async function verifyReleaseManifest(manifestPath = DEFAULT_MANIFEST) {
  const filename = path.resolve(manifestPath);
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch (error) { fail('RELEASE_MANIFEST_INVALID', error.code === 'ENOENT' ? filename : error.message); }
  if (!manifest || manifest.schema !== 'alpha-recovered.release-manifest.v1' || !Array.isArray(manifest.artifacts)) fail('RELEASE_MANIFEST_INVALID');
  if (manifest.target?.platform !== 'darwin' || manifest.target?.arch !== 'arm64') fail('RELEASE_MANIFEST_TARGET_INVALID');
  if (manifest.artifactCount !== manifest.artifacts.length) fail('RELEASE_MANIFEST_COUNT_MISMATCH');
  const seen = new Set();
  const checked = [];
  for (const entry of manifest.artifacts) {
    if (!entry || typeof entry !== 'object' || typeof entry.artifact !== 'string') fail('RELEASE_MANIFEST_ENTRY_INVALID');
    const relativePath = safeRelativePath(entry.path);
    if (seen.has(relativePath)) fail('RELEASE_MANIFEST_DUPLICATE_PATH', relativePath);
    seen.add(relativePath);
    if (!Number.isInteger(entry.bytes) || entry.bytes < 0 || !/^[0-9a-f]{64}$/.test(entry.sha256 ?? '') || !/^[0-7]{3,4}$/.test(entry.mode ?? '')) fail('RELEASE_MANIFEST_ENTRY_INVALID', relativePath);
    const actual = await inspectFile(relativePath);
    if (actual.bytes !== entry.bytes) fail('RELEASE_MANIFEST_FILE_SIZE_MISMATCH', relativePath);
    if (actual.sha256 !== entry.sha256) fail('RELEASE_MANIFEST_FILE_HASH_MISMATCH', relativePath);
    if (actual.mode !== entry.mode) fail('RELEASE_MANIFEST_FILE_MODE_MISMATCH', relativePath);
    checked.push({ ...entry });
  }
  if (!/^[0-9a-f]{64}$/.test(manifest.artifactDigest ?? '') || digestFiles(checked) !== manifest.artifactDigest) fail('RELEASE_MANIFEST_DIGEST_MISMATCH');
  return { manifestPath: filename, artifactCount: checked.length, artifactDigest: manifest.artifactDigest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let manifest = DEFAULT_MANIFEST;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--manifest' && args.length) manifest = args.shift();
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  const result = await verifyReleaseManifest(manifest);
  console.log(`Release manifest verified: ${result.manifestPath}`);
  console.log(`Artifacts: ${result.artifactCount}; digest: ${result.artifactDigest}`);
}
