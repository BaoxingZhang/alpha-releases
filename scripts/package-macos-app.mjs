import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const DEFAULT_OUTPUT = path.join(root, '.runtime', 'release-artifacts', 'Alpha Recovered.app');
const APP_NAME = 'Alpha Recovered';

function fail(message) { throw new Error(message); }

function assertTarget() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') fail('MACOS_APP_TARGET_UNSUPPORTED');
}

async function regularDirectory(directory, code) {
  const stat = await fs.lstat(directory).catch(error => {
    if (error.code === 'ENOENT') fail(code);
    throw error;
  });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code);
  return directory;
}

export async function copyDirectoryContents(source, destination, { allowSymlinks = false, sourceRoot = source } = {}) {
  await regularDirectory(source, 'MACOS_APP_SOURCE_INVALID');
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isSymbolicLink()) {
      if (!allowSymlinks) fail(`MACOS_APP_SYMLINK_REJECTED:${from}`);
      const target = await fs.readlink(from);
      if (path.isAbsolute(target)) fail(`MACOS_APP_ABSOLUTE_SYMLINK_REJECTED:${from}`);
      const resolved = path.resolve(path.dirname(from), target);
      if (resolved !== sourceRoot && !resolved.startsWith(`${sourceRoot}${path.sep}`)) fail(`MACOS_APP_SYMLINK_ESCAPE:${from}`);
      await fs.symlink(target, to);
    } else if (entry.isDirectory()) await copyDirectoryContents(from, to, { allowSymlinks, sourceRoot });
    else if (entry.isFile()) {
      await fs.copyFile(from, to);
      const stat = await fs.stat(from);
      await fs.chmod(to, stat.mode & 0o777);
    } else fail(`MACOS_APP_ENTRY_UNSUPPORTED:${from}`);
  }
}

export function rewriteElectronInfoPlist(source) {
  const replacements = [
    ['<key>CFBundleDisplayName</key>\n\t<string>Electron</string>', `<key>CFBundleDisplayName</key>\n\t<string>${APP_NAME}</string>`],
    ['<key>CFBundleName</key>\n\t<string>Electron</string>', `<key>CFBundleName</key>\n\t<string>${APP_NAME}</string>`],
    ['<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>', '<key>CFBundleIdentifier</key>\n\t<string>local.alpha.recovered</string>']
  ];
  let output = source;
  for (const [before, after] of replacements) output = output.replace(before, after);
  for (const [, after] of replacements) if (!output.includes(after)) fail('MACOS_APP_INFO_PLIST_REWRITE_FAILED');
  return output;
}

export async function buildFileManifest(directory, { allowSymlinks = false, sourceRoot = directory } = {}) {
  const files = [];
  async function walk(current, relativeDirectory = '') {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const relative = path.posix.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        if (!allowSymlinks) fail(`MACOS_APP_SYMLINK_REJECTED:${relative}`);
        const target = await fs.readlink(absolute);
        if (path.isAbsolute(target)) fail(`MACOS_APP_ABSOLUTE_SYMLINK_REJECTED:${relative}`);
        const resolved = path.resolve(path.dirname(absolute), target);
        if (resolved !== sourceRoot && !resolved.startsWith(`${sourceRoot}${path.sep}`)) fail(`MACOS_APP_SYMLINK_ESCAPE:${relative}`);
        files.push({ path: relative, symlink: target, bytes: 0, sha256: '', mode: 'symlink' });
      } else if (entry.isDirectory()) await walk(absolute, relative);
      else if (entry.isFile()) {
        const bytes = await fs.readFile(absolute);
        const stat = await fs.stat(absolute);
        files.push({ path: relative, bytes: bytes.byteLength, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), mode: (stat.mode & 0o777).toString(8) });
      } else fail(`MACOS_APP_ENTRY_UNSUPPORTED:${relative}`);
    }
  }
  await walk(directory);
  return files;
}

export function manifestDigest(files) {
  return crypto.createHash('sha256').update(files
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map(file => `${file.path}\0${file.bytes}\0${file.sha256}\0${file.mode}\0${file.symlink ?? ''}\n`)
    .join('')).digest('hex');
}

async function writeJsonAtomic(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, filename);
  } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

async function gitCommit() {
  try {
    const result = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root, maxBuffer: 4096 });
    return /^[0-9a-f]{40}$/.test(result.stdout.trim()) ? result.stdout.trim() : '';
  } catch { return ''; }
}

export async function packageMacosApp({ output = DEFAULT_OUTPUT, createDmg = false } = {}) {
  assertTarget();
  const destination = path.resolve(output);
  if (!destination.startsWith(`${path.join(root, '.runtime')}${path.sep}`) && !destination.startsWith(`${path.join(root, 'build')}${path.sep}`)) fail('MACOS_APP_OUTPUT_MUST_BE_PROJECT_GENERATED_DIR');
  const electronApp = path.join(root, 'node_modules/electron/dist/Electron.app');
  const recoveredApp = path.join(root, 'dist/app');
  const runtime = path.join(root, 'build/runtime-bundle');
  const packagedIndependent = path.join(root, 'build/packaged-resources/independent');
  await regularDirectory(electronApp, 'MACOS_APP_ELECTRON_MISSING');
  await regularDirectory(recoveredApp, 'MACOS_APP_RECOVERED_BUILD_MISSING');
  await regularDirectory(runtime, 'MACOS_APP_RUNTIME_BUNDLE_MISSING');
  await regularDirectory(packagedIndependent, 'MACOS_APP_INDEPENDENT_RESOURCES_MISSING');
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await copyDirectoryContents(electronApp, destination, { allowSymlinks: true, sourceRoot: electronApp });
  const resources = path.join(destination, 'Contents', 'Resources');
  await copyDirectoryContents(recoveredApp, path.join(resources, 'app'));
  await copyDirectoryContents(runtime, resources);
  await copyDirectoryContents(packagedIndependent, path.join(resources, 'independent'));
  const plistPath = path.join(destination, 'Contents', 'Info.plist');
  const plist = await fs.readFile(plistPath, 'utf8');
  await fs.writeFile(plistPath, rewriteElectronInfoPlist(plist), { mode: 0o644 });
  const executable = path.join(destination, 'Contents', 'MacOS', 'Electron');
  const executableStat = await fs.stat(executable);
  await fs.chmod(executable, executableStat.mode | 0o111);
  const files = await buildFileManifest(destination, { allowSymlinks: true, sourceRoot: destination });
  const manifest = {
    schema: 'alpha-recovered.macos-app.v1',
    productName: APP_NAME,
    version: '0.3.5',
    appPath: path.relative(root, destination).split(path.sep).join('/'),
    target: { platform: 'darwin', arch: 'arm64' },
    electronVersion: '44.10.1',
    nativeRecompiled: false,
    projectSigned: false,
    notarized: false,
    source: { recoveredApp: 'dist/app', originalRuntime: 'build/runtime-bundle', independentResources: 'build/packaged-resources/independent' },
    gitCommit: await gitCommit(),
    artifactDigest: manifestDigest(files),
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0),
    files
  };
  const manifestPath = `${destination}.manifest.json`;
  await writeJsonAtomic(manifestPath, manifest);
  let dmg;
  if (createDmg) {
    const dmgPath = destination.replace(/\.app$/i, '.dmg');
    await fs.rm(dmgPath, { force: true });
    await execFileAsync('/usr/bin/hdiutil', ['create', '-volname', APP_NAME, '-srcfolder', destination, '-ov', '-format', 'UDZO', dmgPath], { cwd: root, maxBuffer: 4096 });
    const bytes = await fs.readFile(dmgPath);
    dmg = { path: path.relative(root, dmgPath).split(path.sep).join('/'), bytes: bytes.byteLength, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), signed: false, notarized: false };
    manifest.dmg = dmg;
    await writeJsonAtomic(manifestPath, manifest);
  }
  return { destination, manifestPath, manifest, dmg };
}

function parseArgs(args) {
  let output = DEFAULT_OUTPUT;
  let createDmg = false;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--output' && args.length) output = args.shift();
    else if (argument === '--dmg') createDmg = true;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  return { output, createDmg };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await packageMacosApp(parseArgs(process.argv.slice(2)));
  console.log(`macOS app written: ${result.destination}`);
  console.log(`Manifest written: ${result.manifestPath}`);
  console.log(`Artifact digest: ${result.manifest.artifactDigest}`);
  if (result.dmg) console.log(`DMG written: ${path.resolve(root, result.dmg.path)}`);
  console.log(`Signed: ${result.manifest.projectSigned}; notarized: ${result.manifest.notarized}`);
}
