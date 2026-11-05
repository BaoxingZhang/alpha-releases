#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtimeRoot = path.join(root, '.runtime');
const stageParent = path.join(runtimeRoot, 'v4-encrypted-static');

const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 10000,
  maxDepth: 8,
  maxSingleBytes: 1024 * 1024 * 1024,
  maxTotalBytes: 8 * 1024 * 1024 * 1024,
  maxReportBytes: 512 * 1024
});

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanAbsolute(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value || value === path.parse(value).root || value.includes('\0')) throw failure(code);
  return value;
}

function safeName(value, code) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_@.-]{1,96}$/.test(value) || value === '.' || value === '..') throw failure(code);
  return value;
}

async function explicitSourceDirectory(value) {
  const directory = cleanAbsolute(value, 'V4_STATIC_SOURCE_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch { throw failure('V4_STATIC_SOURCE_UNAVAILABLE'); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('V4_STATIC_SOURCE_SYMLINK_OR_NON_DIRECTORY');
  }
  let real;
  try { real = await fs.realpath(directory); } catch { throw failure('V4_STATIC_SOURCE_UNAVAILABLE'); }
  if (real !== directory) throw failure('V4_STATIC_SOURCE_SYMLINK_OR_NON_DIRECTORY');
  return directory;
}

async function ensureRuntimeStageParent() {
  const runtime = path.resolve(runtimeRoot);
  let runtimeStat;
  try { runtimeStat = await fs.lstat(runtime); } catch { throw failure('V4_STATIC_RUNTIME_UNAVAILABLE'); }
  if (runtimeStat.isSymbolicLink() || !runtimeStat.isDirectory() || await fs.realpath(runtime) !== runtime) throw failure('V4_STATIC_RUNTIME_INVALID');
  try { await fs.mkdir(stageParent, { recursive: true, mode: 0o700 }); } catch { throw failure('V4_STATIC_TARGET_PARENT_UNAVAILABLE'); }
  const stat = await fs.lstat(stageParent);
  if (stat.isSymbolicLink() || !stat.isDirectory() || await fs.realpath(stageParent) !== stageParent) throw failure('V4_STATIC_TARGET_PARENT_INVALID');
  await fs.chmod(stageParent, 0o700);
}

function relativePath(rootDirectory, value) {
  const relative = path.relative(rootDirectory, value);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw failure('V4_STATIC_PATH_ESCAPE');
  return relative.split(path.sep).join('/');
}

function containsPath(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isSidecar(name) {
  return /(?:-wal|-shm|-journal)$/i.test(name);
}

async function inventorySource(sourceRoot, limits) {
  const files = [];
  const sidecars = [];
  const stack = [{ directory: sourceRoot, depth: 0 }];
  let visited = 0;
  let totalBytes = 0;
  while (stack.length) {
    const { directory, depth } = stack.pop();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      visited += 1;
      if (visited > limits.maxFiles) throw failure('V4_STATIC_DATASET_TOO_LARGE');
      const full = path.join(directory, entry.name);
      const stat = await fs.lstat(full);
      if (stat.isSymbolicLink()) throw failure('V4_STATIC_SYMLINK_DENIED');
      if (entry.isDirectory()) {
        if (depth + 1 > limits.maxDepth) throw failure('V4_STATIC_DATASET_TOO_LARGE');
        stack.push({ directory: full, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) throw failure('V4_STATIC_UNSUPPORTED_ENTRY');
      if (isSidecar(entry.name)) {
        sidecars.push({ path: relativePath(sourceRoot, full), bytes: stat.size });
        continue;
      }
      if (stat.size > limits.maxSingleBytes) throw failure('V4_STATIC_FILE_TOO_LARGE');
      totalBytes += stat.size;
      if (totalBytes > limits.maxTotalBytes) throw failure('V4_STATIC_DATASET_TOO_LARGE');
      files.push({ absolute: full, relative: relativePath(sourceRoot, full), size: stat.size, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs });
    }
  }
  if (files.length < 1) throw failure('V4_STATIC_EMPTY_SOURCE');
  files.sort((left, right) => left.relative.localeCompare(right.relative));
  sidecars.sort((left, right) => left.path.localeCompare(right.path));
  const sidecarBytes = sidecars.reduce((total, item) => total + item.bytes, 0);
  return { files, sidecars, sidecarBytes, totalBytes };
}

async function sha256File(filename) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}

async function copyInventory(inventory, sourceRoot, temporary) {
  const copiedFiles = [];
  for (const item of inventory.files) {
    const source = path.join(sourceRoot, item.relative);
    const destination = path.join(temporary, item.relative);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const before = await fs.lstat(source);
    if (!before.isFile() || before.isSymbolicLink() || before.dev !== item.dev || before.ino !== item.ino || before.size !== item.size || before.mtimeMs !== item.mtimeMs) throw failure('V4_STATIC_SOURCE_CHANGED');
    const beforeHash = await sha256File(source);
    await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    await fs.chmod(destination, 0o600);
    const after = await fs.lstat(source);
    const destinationStat = await fs.stat(destination);
    const destinationHash = await sha256File(destination);
    const afterHash = await sha256File(source);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== item.dev || after.ino !== item.ino || after.size !== item.size || after.mtimeMs !== item.mtimeMs || destinationStat.size !== item.size || beforeHash !== destinationHash || beforeHash !== afterHash) throw failure('V4_STATIC_SOURCE_CHANGED');
    copiedFiles.push({ path: item.relative, bytes: item.size, sha256: destinationHash });
  }
  return copiedFiles;
}

function sameRegularInventory(left, right) {
  if (!left || !right || left.files.length !== right.files.length) return false;
  return left.files.every((item, index) => {
    const other = right.files[index];
    return item.relative === other.relative
      && item.size === other.size
      && item.dev === other.dev
      && item.ino === other.ino
      && item.mtimeMs === other.mtimeMs;
  });
}

async function writeManifest(directory, account, inventory, copiedFiles, limits) {
  const manifest = {
    schema: 'alpha-independent-v4-encrypted-static-copy-manifest.v1',
    scope: 'alpha-independent-v4-encrypted-static-copy',
    account_id: account,
    source_kind: 'encrypted-v4-static-copy',
    encrypted_static_copy: true,
    sidecars_excluded: true,
    sidecar_count: inventory.sidecars.length,
    sidecar_bytes: inventory.sidecarBytes,
    source_static_required: true,
    read_only: true,
    complete: false,
    native_schema_supported: false,
    file_count: copiedFiles.length,
    total_bytes: copiedFiles.reduce((total, file) => total + file.bytes, 0),
    limits: { ...limits },
    files: copiedFiles
  };
  const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(encoded, 'utf8') > 16 * 1024 * 1024) throw failure('V4_STATIC_MANIFEST_TOO_LARGE');
  await fs.writeFile(path.join(directory, '.alpha-v4-encrypted-static.json'), encoded, { mode: 0o600, flag: 'wx' });
  return manifest;
}

async function absent(pathname, code) {
  try { await fs.lstat(pathname); throw failure(code); } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function stageEncryptedV4Copy({ sourceDir, account, targetName = `encrypted-v4-${account}`, limits = DEFAULT_LIMITS } = {}) {
  safeName(account, 'V4_STATIC_ACCOUNT_ID_INVALID');
  const name = safeName(targetName, 'V4_STATIC_TARGET_NAME_INVALID');
  const source = await explicitSourceDirectory(sourceDir);
  const target = path.join(stageParent, name);
  if (containsPath(runtimeRoot, source)) throw failure('V4_STATIC_SOURCE_PROJECT_RUNTIME_DENIED');
  if (containsPath(source, target) || containsPath(target, source)) throw failure('V4_STATIC_SOURCE_TARGET_OVERLAP');
  await ensureRuntimeStageParent();
  const lockPath = `${target}.lock`;
  await absent(target, 'V4_STATIC_TARGET_EXISTS');
  await absent(lockPath, 'V4_STATIC_TARGET_BUSY');
  let lock;
  let temporary;
  let published = false;
  try {
    lock = await fs.open(lockPath, 'wx', 0o600);
    temporary = await fs.mkdtemp(path.join(stageParent, `.static-${name}-`));
    await fs.chmod(temporary, 0o700);
    const inventory = await inventorySource(source, limits);
    const copiedFiles = await copyInventory(inventory, source, temporary);
    // A regular file can be created after the initial walk. Re-inventory the
    // source before publication so the staged directory is a closed static
    // set rather than a partial snapshot of a changing source.
    const finalInventory = await inventorySource(source, limits);
    if (!sameRegularInventory(inventory, finalInventory)) throw failure('V4_STATIC_SOURCE_CHANGED');
    const manifest = await writeManifest(temporary, account, inventory, copiedFiles, limits);
    await absent(target, 'V4_STATIC_TARGET_EXISTS');
    await fs.rename(temporary, target);
    temporary = undefined;
    published = true;
    return {
      schema: 'alpha-independent-v4-encrypted-static-copy.v1',
      scope: 'alpha-independent-v4-encrypted-static-copy',
      status: 'staged',
      published: true,
      account_id: account,
      target_name: name,
      target_dir: `.runtime/v4-encrypted-static/${name}`,
      encrypted_static_copy: true,
      sidecars_excluded: true,
      sidecar_count: inventory.sidecars.length,
      sidecar_bytes: inventory.sidecarBytes,
      source_static_required: true,
      read_only: true,
      complete: false,
      native_schema_supported: false,
      manifest: { path: '.alpha-v4-encrypted-static.json', file_count: manifest.file_count, total_bytes: manifest.total_bytes },
      file_count: inventory.files.length,
      total_bytes: inventory.totalBytes,
      limits
    };
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    try { await fs.rm(lockPath, { force: true }); } catch {}
    // Unlink before closing the descriptor so a new owner can never be
    // mistaken for this invocation during cleanup.
    try { await lock?.close(); } catch {}
    if (!published) {
      // The target is never removed here: it either did not exist or was owned by another process.
    }
  }
}

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--json') {
      if (values.json) throw failure('V4_STATIC_USAGE');
      values.json = true;
      continue;
    }
    if (!['--source-dir', '--account-id', '--target-name'].includes(option) || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) throw failure('V4_STATIC_USAGE');
    const key = option.slice(2);
    if (Object.hasOwn(values, key)) throw failure('V4_STATIC_USAGE');
    values[key] = argv[++index];
  }
  if (!values['source-dir'] || !values['account-id']) throw failure('V4_STATIC_USAGE');
  return values;
}

function printHuman(report) {
  console.log(`encrypted v4 static copy: ${report.status}; published: ${report.published}`);
  console.log(`account: ${report.account_id}; target: ${report.target_dir || 'none'}`);
  console.log(`files: ${report.file_count}; sidecars excluded: ${report.sidecar_count}`);
  console.log('read-only: true; complete: false; native schema supported: false');
}

export { DEFAULT_LIMITS, containsPath, inventorySource, parse, safeName, sameRegularInventory, stageEncryptedV4Copy };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parse(process.argv.slice(2));
    const report = await stageEncryptedV4Copy({ sourceDir: options['source-dir'], account: options['account-id'], ...(options['target-name'] ? { targetName: options['target-name'] } : {}) });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
  } catch (error) {
    process.stderr.write(`${error?.code || 'V4_STATIC_STAGE_FAILED'}\n`);
    process.exitCode = 2;
  }
}
