import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_OUTPUT = path.join(root, '.runtime', 'recovery-bundles', 'alpha-recovered-source.tar.gz');
const TOP_LEVEL_EXCLUDES = new Set(['.git', '.alpha', '.runtime', 'node_modules', 'dist', 'build']);

function fail(message) { throw new Error(message); }

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function excluded(relative, includeVendorRuntime) {
  const normalized = relative.split(path.sep).join('/');
  const first = normalized.split('/')[0];
  if (TOP_LEVEL_EXCLUDES.has(first) || /(^|\/)\.git(?:\/|$)/.test(normalized)) return true;
  if (normalized === 'workers/agent/dist' || normalized.startsWith('workers/agent/dist/')) return true;
  if (/^docs\/.*\.(?:png|log)$/i.test(normalized)) return true;
  if (!includeVendorRuntime && (normalized === 'vendor/runtime' || normalized.startsWith('vendor/runtime/'))) {
    if (normalized === 'vendor/runtime') return false;
    return !/^vendor\/runtime\/(?:manifests|policies|resources)(?:\/|$)/.test(normalized)
      && !/^vendor\/runtime\/bin\/[^/]+\.(?:LICENSE|README)$/i.test(normalized);
  }
  return false;
}

async function collectFiles({ includeVendorRuntime }) {
  const files = [];
  async function visit(directory, relativeDirectory = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => compareText(a.name, b.name));
    for (const entry of entries) {
      const relative = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
      if (excluded(relative, includeVendorRuntime)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail(`RECOVERY_BUNDLE_SYMLINK_REJECTED:${relative}`);
      if (entry.isDirectory()) await visit(absolute, relative);
      else if (entry.isFile()) files.push(relative);
      else fail(`RECOVERY_BUNDLE_ENTRY_UNSUPPORTED:${relative}`);
    }
  }
  await visit(root);
  if (!files.includes('README.md') || !files.includes('MAINTENANCE.md') || !files.includes('package-lock.json')) fail('RECOVERY_BUNDLE_REQUIRED_SOURCE_MISSING');
  return files.sort(compareText);
}

async function sha256File(filename) {
  const digest = crypto.createHash('sha256');
  const stream = (await import('node:fs')).createReadStream(filename);
  for await (const chunk of stream) digest.update(chunk);
  return digest.digest('hex');
}

async function gitCommit() {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, maxBuffer: 4096 });
    const value = result.stdout.trim();
    return /^[0-9a-f]{40}$/.test(value) ? value : '';
  } catch { return ''; }
}

async function sourceDmgSha256() {
  try {
    const provenance = JSON.parse(await fs.readFile(path.join(root, 'docs/native-runtime-provenance.json'), 'utf8'));
    return typeof provenance.source_dmg_sha256 === 'string' ? provenance.source_dmg_sha256 : '';
  } catch { return ''; }
}

async function artifactManifestDigest() {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(root, '.runtime/release-manifest.json'), 'utf8'));
    return typeof manifest.artifactDigest === 'string' ? manifest.artifactDigest : '';
  } catch { return ''; }
}

async function stageReproducibleFiles(files, directory) {
  const epoch = new Date(0);
  for (const relative of files) {
    const source = path.join(root, relative);
    const destination = path.join(directory, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.copyFile(source, destination);
    const stat = await fs.stat(source);
    await fs.chmod(destination, stat.mode & 0o777);
    // Git checkout times, user ownership, and filesystem metadata vary across
    // machines. Normalize the regular-file timestamp before archiving; tar
    // ownership and compression metadata are normalized in the command below.
    await fs.utimes(destination, epoch, epoch);
  }
}

export async function buildRecoveryBundle({ output = DEFAULT_OUTPUT, includeVendorRuntime = false } = {}) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail('RECOVERY_BUNDLE_TARGET_UNSUPPORTED');
  const destination = path.resolve(output);
  if (!destination.startsWith(`${path.join(root, '.runtime')}${path.sep}`) && !destination.startsWith(`${path.join(root, 'build')}${path.sep}`)) {
    fail('RECOVERY_BUNDLE_OUTPUT_MUST_BE_PROJECT_GENERATED_DIR');
  }
  const files = await collectFiles({ includeVendorRuntime });
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.rm(destination, { force: true });
  const staging = await fs.mkdtemp(path.join(root, '.runtime', 'recovery-bundle-stage-'));
  try {
    await stageReproducibleFiles(files, staging);
    await execFileAsync('/usr/bin/tar', [
      '-czf', destination,
      // ustar keeps the normalized mtime in its fixed header and avoids
      // libarchive's non-deterministic pax ctime extension. Current source
      // paths are bounded below ustar's 100-byte name limit.
      '--format', 'ustar',
      '--options', 'gzip:!timestamp',
      '--no-acls', '--no-xattrs', '--no-mac-metadata', '--no-fflags',
      '--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root',
      '-C', staging, '--', ...files
    ], { cwd: root, maxBuffer: 4096 });
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
  const entries = [];
  for (const relative of files) {
    const stat = await fs.stat(path.join(root, relative));
    entries.push({ path: relative, bytes: stat.size, sha256: await sha256File(path.join(root, relative)) });
  }
  const archiveStat = await fs.stat(destination);
  const manifest = {
    schema: 'alpha-recovered.source-bundle.v1',
    createdAt: new Date().toISOString(),
    gitCommit: await gitCommit(),
    sourceDmgSha256: await sourceDmgSha256(),
    artifactManifestDigest: await artifactManifestDigest(),
    target: { platform: process.platform, arch: process.arch },
    nativeRecompiled: false,
    projectSigned: false,
    includesVendorRuntime: includeVendorRuntime,
    archive: { path: path.relative(root, destination).split(path.sep).join('/'), bytes: archiveStat.size, sha256: await sha256File(destination) },
    fileCount: entries.length,
    files: entries
  };
  const manifestPath = `${destination}.manifest.json`;
  const temporary = `${manifestPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, manifestPath);
  return { destination, manifestPath, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  let output = DEFAULT_OUTPUT;
  let includeVendorRuntime = false;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--output' && args.length) output = args.shift();
    else if (argument === '--include-vendor-runtime') includeVendorRuntime = true;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  const result = await buildRecoveryBundle({ output, includeVendorRuntime });
  console.log(`Recovery source bundle written: ${result.destination}`);
  console.log(`Bundle manifest written: ${result.manifestPath}`);
  console.log(`Bundle SHA256: ${result.manifest.archive.sha256}`);
  console.log(`Files: ${result.manifest.fileCount}; vendor runtime: ${result.manifest.includesVendorRuntime}`);
}
