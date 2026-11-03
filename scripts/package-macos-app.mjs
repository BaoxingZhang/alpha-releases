import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import updateMode from '../packages/alpha-desktop/update-mode.cjs';
const require = createRequire(import.meta.url);
const { readProjectIdentity, flavorIdentity } = require('../packages/alpha-desktop/project-identity.cjs');

const execFileAsync = promisify(execFile);
export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const projectPackagePath = path.join(root, 'package.json');
const projectIdentity = readProjectIdentity(JSON.parse(await fs.readFile(projectPackagePath, 'utf8')));
const APP_NAME = projectIdentity.productName;
const INDEPENDENT_APP_NAME = projectIdentity.independent.productName;
export const DEFAULT_OUTPUT = path.join(root, '.runtime', 'release-artifacts', `${APP_NAME}.app`);
export const DEFAULT_INDEPENDENT_OUTPUT = path.join(root, '.runtime', 'release-artifacts', `${INDEPENDENT_APP_NAME}.app`);
// The Electron template uses `Electron` as its executable name. Keeping that
// name makes an unpacked Resources/app directory look like a development
// launch to Electron (`app.isPackaged === false`) even when it lives inside a
// .app bundle. Give each recovered flavor its own executable so the packaged
// runtime takes the same branch that users get from the generated app.
const EXECUTABLE_NAME = projectIdentity.executableName;
const INDEPENDENT_EXECUTABLE_NAME = projectIdentity.independent.executableName;
const REQUIRED_INDEPENDENT_DEPENDENCY = path.join('node_modules', '@bufbuild', 'protobuf', 'dist', 'commonjs', 'wire', 'index.js');
export const UPDATE_MODE_MARKER = 'Contents/Resources/alpha-update-mode.json';
const UPDATE_MODE_CONFIG = path.join(root, 'provenance', 'independent-update-mode.json');

async function projectVersion() {
  let packageJson;
  try { packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')); }
  catch { fail('PROJECT_PACKAGE_INVALID'); }
  if (typeof packageJson.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageJson.version)) fail('PROJECT_VERSION_INVALID');
  return packageJson.version;
}

async function installedElectronVersion() {
  let packageJson;
  try { packageJson = JSON.parse(await fs.readFile(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8')); }
  catch { fail('ELECTRON_PACKAGE_INVALID'); }
  if (typeof packageJson.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(packageJson.version)) fail('ELECTRON_VERSION_INVALID');
  return packageJson.version;
}

function fail(message) { throw new Error(message); }

// Info.plist is XML, so identity values must be escaped before they are
// interpolated into the template. The project identity validator deliberately
// permits human-readable punctuation (for example `&`) in product names.
export function escapeXmlText(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

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

export function rewriteElectronInfoPlist(source, {
  appName = APP_NAME,
  bundleIdentifier = projectIdentity.bundleIdentifier,
  executableName = 'Electron',
  appVersion,
  strictExecutable = false
} = {}) {
  let output = source;
  const replacements = [
    ['<key>CFBundleDisplayName</key>\n\t<string>Electron</string>', `<key>CFBundleDisplayName</key>\n\t<string>${escapeXmlText(appName)}</string>`],
    ['<key>CFBundleName</key>\n\t<string>Electron</string>', `<key>CFBundleName</key>\n\t<string>${escapeXmlText(appName)}</string>`],
    ['<key>CFBundleIdentifier</key>\n\t<string>com.github.Electron</string>', `<key>CFBundleIdentifier</key>\n\t<string>${escapeXmlText(bundleIdentifier)}</string>`]
  ];
  if (strictExecutable || source.includes('<key>CFBundleExecutable</key>\n\t<string>Electron</string>')) {
    replacements.push(['<key>CFBundleExecutable</key>\n\t<string>Electron</string>', `<key>CFBundleExecutable</key>\n\t<string>${escapeXmlText(executableName)}</string>`]);
  }
  if (appVersion !== undefined) {
    if (typeof appVersion !== 'string' || !/^\d+\.\d+\.\d+$/.test(appVersion)) fail('PROJECT_VERSION_INVALID');
    for (const key of ['CFBundleShortVersionString', 'CFBundleVersion']) {
      const pattern = new RegExp(`(<key>${key}<\\/key>\\s*\\n?\\s*<string>)[^<]*(<\\/string>)`);
      if (!pattern.test(output)) fail(`MACOS_APP_INFO_PLIST_${key}_MISSING`);
      output = output.replace(pattern, `$1${appVersion}$2`);
    }
  }
  for (const [before, after] of replacements) {
    const present = output.includes(before);
    if (!present && before.startsWith('<key>CFBundleExecutable</key>')) {
      if (strictExecutable) fail('MACOS_APP_INFO_PLIST_EXECUTABLE_MISSING');
      continue;
    }
    if (!present) fail('MACOS_APP_INFO_PLIST_REWRITE_FAILED');
    output = output.replace(before, after);
    if (!output.includes(after)) fail('MACOS_APP_INFO_PLIST_REWRITE_FAILED');
  }
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

export async function packageMacosApp({ output, createDmg = false, independent = false } = {}) {
  assertTarget();
  const version = await projectVersion();
  const flavor = flavorIdentity(projectIdentity, independent ? 'independent' : 'original');
  const electronVersion = await installedElectronVersion();
  const productName = independent ? INDEPENDENT_APP_NAME : APP_NAME;
  const destination = path.resolve(output ?? (independent ? DEFAULT_INDEPENDENT_OUTPUT : DEFAULT_OUTPUT));
  if (!destination.startsWith(`${path.join(root, '.runtime')}${path.sep}`) && !destination.startsWith(`${path.join(root, 'build')}${path.sep}`)) fail('MACOS_APP_OUTPUT_MUST_BE_PROJECT_GENERATED_DIR');
  const electronApp = path.join(root, 'node_modules/electron/dist/Electron.app');
  const recoveredApp = path.join(root, 'dist/app');
  const runtime = path.join(root, 'build/runtime-bundle');
  const packagedIndependent = path.join(root, 'build/packaged-resources/independent');
  await regularDirectory(electronApp, 'MACOS_APP_ELECTRON_MISSING');
  await regularDirectory(recoveredApp, 'MACOS_APP_RECOVERED_BUILD_MISSING');
  await regularDirectory(runtime, 'MACOS_APP_RUNTIME_BUNDLE_MISSING');
  await regularDirectory(packagedIndependent, 'MACOS_APP_INDEPENDENT_RESOURCES_MISSING');
  try {
    const dependency = path.join(packagedIndependent, REQUIRED_INDEPENDENT_DEPENDENCY);
    const stat = await fs.lstat(dependency);
    if (!stat.isFile() || stat.isSymbolicLink()) fail('MACOS_APP_INDEPENDENT_DEPENDENCY_INVALID');
  } catch (error) {
    if (error?.message === 'MACOS_APP_INDEPENDENT_DEPENDENCY_INVALID') throw error;
    fail('MACOS_APP_INDEPENDENT_DEPENDENCY_MISSING');
  }
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await copyDirectoryContents(electronApp, destination, { allowSymlinks: true, sourceRoot: electronApp });
  const executableName = independent ? INDEPENDENT_EXECUTABLE_NAME : EXECUTABLE_NAME;
  const templateExecutable = path.join(destination, 'Contents', 'MacOS', 'Electron');
  const executable = path.join(destination, 'Contents', 'MacOS', executableName);
  await fs.rename(templateExecutable, executable);
  const resources = path.join(destination, 'Contents', 'Resources');
  await copyDirectoryContents(recoveredApp, path.join(resources, 'app'));
  await copyDirectoryContents(runtime, resources);
  await copyDirectoryContents(packagedIndependent, path.join(resources, 'independent'));
  await fs.writeFile(path.join(resources, 'alpha-backend-mode.json'), `${JSON.stringify({ schema: 'alpha.recovered.backend-mode.v1', backend: independent ? 'independent' : 'original' }, null, 2)}\n`, { mode: 0o644 });
  if (independent) {
    let configured;
    try { configured = JSON.parse(await fs.readFile(UPDATE_MODE_CONFIG, 'utf8')); }
    catch { fail('INDEPENDENT_UPDATE_MODE_CONFIG_MISSING'); }
    const normalized = updateMode.normalizeIndependentUpdateMode(configured);
    if (configured?.mode === 'configured' && normalized.mode !== 'configured') fail('INDEPENDENT_UPDATE_MODE_CONFIG_INVALID');
    await fs.writeFile(path.join(resources, updateMode.UPDATE_MODE_FILE), `${JSON.stringify(normalized, null, 2)}\n`, { mode: 0o644 });
  }
  const plistPath = path.join(destination, 'Contents', 'Info.plist');
  const plist = await fs.readFile(plistPath, 'utf8');
  await fs.writeFile(plistPath, rewriteElectronInfoPlist(plist, {
    appName: productName,
    bundleIdentifier: flavor.bundleIdentifier,
    executableName,
    appVersion: version,
    strictExecutable: true
  }), { mode: 0o644 });
  const executableStat = await fs.stat(executable);
  await fs.chmod(executable, executableStat.mode | 0o111);
  const files = await buildFileManifest(destination, { allowSymlinks: true, sourceRoot: destination });
  const manifest = {
    schema: 'alpha-recovered.macos-app.v1',
    productName,
    version,
    appPath: path.relative(root, destination).split(path.sep).join('/'),
    target: { platform: 'darwin', arch: 'arm64' },
    electronVersion,
    nativeRecompiled: false,
    projectSigned: false,
    notarized: false,
    backendMode: independent ? 'independent' : 'original',
    source: { recoveredApp: 'dist/app', originalRuntime: 'build/runtime-bundle', independentResources: 'build/packaged-resources/independent', backendModeMarker: 'Contents/Resources/alpha-backend-mode.json', executable: `Contents/MacOS/${executableName}`, ...(independent ? { updateModeConfig: 'provenance/independent-update-mode.json', updateModeMarker: UPDATE_MODE_MARKER } : {}) },
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
    await execFileAsync('/usr/bin/hdiutil', ['create', '-volname', productName, '-srcfolder', destination, '-ov', '-format', 'UDZO', dmgPath], { cwd: root, maxBuffer: 4096 });
    const bytes = await fs.readFile(dmgPath);
    dmg = { path: path.relative(root, dmgPath).split(path.sep).join('/'), bytes: bytes.byteLength, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), signed: false, notarized: false };
    manifest.dmg = dmg;
    await writeJsonAtomic(manifestPath, manifest);
  }
  return { destination, manifestPath, manifest, dmg };
}

function parseArgs(args) {
  let output;
  let createDmg = false;
  let independent = false;
  while (args.length) {
    const argument = args.shift();
    if (argument === '--output' && args.length) output = args.shift();
    else if (argument === '--dmg') createDmg = true;
    else if (argument === '--independent') independent = true;
    else throw new Error(`Unknown or incomplete argument: ${argument}`);
  }
  return { output, createDmg, independent };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const result = await packageMacosApp(parseArgs(process.argv.slice(2)));
  console.log(`macOS app written: ${result.destination}`);
  console.log(`Manifest written: ${result.manifestPath}`);
  console.log(`Artifact digest: ${result.manifest.artifactDigest}`);
  if (result.dmg) console.log(`DMG written: ${path.resolve(root, result.dmg.path)}`);
  console.log(`Backend: ${result.manifest.backendMode}; signed: ${result.manifest.projectSigned}; notarized: ${result.manifest.notarized}`);
}
