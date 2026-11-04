import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { readProjectIdentity } = require('../packages/alpha-desktop/project-identity.cjs');
const DEFAULT_OUTPUT = path.join(root, '.runtime', 'release-manifest.json');
const ARTIFACTS = [
  ['app', 'dist/app'],
  ['runtime-bundle', 'build/runtime-bundle'],
  ['agent', 'workers/agent/dist'],
  // The independent packaged flavor is assembled from this tree before it is
  // copied into Resources/independent. Keep it in the top-level release
  // manifest so a source archive records the exact backend inputs as well as
  // the regular app and native runtime artifacts.
  ['independent-resources', 'build/packaged-resources/independent']
];

function fail(message) { throw new Error(message); }

async function hashFile(file) {
  const digest = crypto.createHash('sha256');
  const bytes = await fs.readFile(file);
  digest.update(bytes);
  return { bytes: bytes.byteLength, sha256: digest.digest('hex') };
}

async function collectFiles(label, relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  const files = [];
  async function walk(directory, relativeDirectory) {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') fail(`RELEASE_ARTIFACT_MISSING:${relativeRoot}`); throw error; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      const relative = path.posix.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) fail(`RELEASE_SYMLINK_REJECTED:${path.posix.join(relativeRoot, relative)}`);
      if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) {
        const stat = await fs.stat(absolute);
        const hash = await hashFile(absolute);
        files.push({ artifact: label, path: path.posix.join(relativeRoot, relative), bytes: hash.bytes, sha256: hash.sha256, mode: (stat.mode & 0o777).toString(8) });
      } else fail(`RELEASE_ENTRY_UNSUPPORTED:${path.posix.join(relativeRoot, relative)}`);
    }
  }
  await walk(absoluteRoot, '');
  return files;
}

async function gitCommit() {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, maxBuffer: 4096 });
    const value = result.stdout.trim();
    return /^[0-9a-f]{40}$/.test(value) ? value : '';
  } catch { return ''; }
}

async function gitWorkingTreeDirty() {
  try {
    const result = await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=no'], { cwd: root, maxBuffer: 64 * 1024 });
    return result.stdout.trim().length > 0;
  } catch {
    // A manifest can still be useful in a source archive without git metadata.
    // Keep the absence of a repository explicit instead of claiming a clean tree.
    return null;
  }
}

export async function buildReleaseManifest({ packagePath = path.join(root, 'package.json'), provenancePath = path.join(root, 'docs/native-runtime-provenance.json') } = {}) {
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'));
  const identity = readProjectIdentity(packageJson);
  const provenance = JSON.parse(await fs.readFile(provenancePath, 'utf8'));
  if (typeof packageJson.version !== 'string' || !packageJson.version) fail('RELEASE_PACKAGE_VERSION_INVALID');
  const files = (await Promise.all(ARTIFACTS.map(([label, relativeRoot]) => collectFiles(label, relativeRoot)))).flat();
  files.sort((a, b) => a.path.localeCompare(b.path));
  const artifactDigest = crypto.createHash('sha256').update(files.map(file => `${file.path}\0${file.bytes}\0${file.sha256}\0${file.mode}\n`).join('')).digest('hex');
  return {
    schema: 'alpha-recovered.release-manifest.v1',
    version: packageJson.version,
    productName: identity.productName,
    identity: {
      productName: identity.productName,
      bundleIdentifier: identity.bundleIdentifier,
      executableName: identity.executableName,
      independent: identity.independent
    },
    gitCommit: await gitCommit(),
    gitWorkingTreeDirty: await gitWorkingTreeDirty(),
    target: { platform: 'darwin', arch: 'arm64', nativeRecompiled: false, projectSigned: false },
    source: {
      sourceDmgSha256: typeof provenance.source_dmg_sha256 === 'string' ? provenance.source_dmg_sha256 : '',
      originalNativeArtifactsModified: provenance.verification?.all_file_hashes_equal_to_source !== true
    },
    artifactDigest,
    artifactCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    artifacts: files
  };
}

export async function writeReleaseManifest(output = DEFAULT_OUTPUT, options = {}) {
  const destination = path.resolve(output);
  const manifest = await buildReleaseManifest(options);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  return { destination, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let output = DEFAULT_OUTPUT;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--output' && args.length) output = args.shift();
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  const result = await writeReleaseManifest(output);
  console.log(`Release manifest written: ${result.destination}`);
  console.log(`Artifact digest: ${result.manifest.artifactDigest}`);
}
