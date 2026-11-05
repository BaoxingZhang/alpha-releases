#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { preflightV4Copy } from './preflight-v4-copy.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtimeRoot = path.join(root, '.runtime');
const stageParent = path.join(runtimeRoot, 'v4-staged');
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
  const directory = cleanAbsolute(value, 'V4_STAGE_SOURCE_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch { throw failure('V4_STAGE_SOURCE_UNAVAILABLE'); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('V4_STAGE_SOURCE_SYMLINK_OR_NON_DIRECTORY');
  }
  let real;
  try { real = await fs.realpath(directory); } catch { throw failure('V4_STAGE_SOURCE_UNAVAILABLE'); }
  if (real !== directory) throw failure('V4_STAGE_SOURCE_SYMLINK_OR_NON_DIRECTORY');
  return directory;
}

async function ensureRuntimeStageParent() {
  const runtime = path.resolve(runtimeRoot);
  let runtimeStat;
  try { runtimeStat = await fs.lstat(runtime); } catch { throw failure('V4_STAGE_RUNTIME_UNAVAILABLE'); }
  if (runtimeStat.isSymbolicLink() || !runtimeStat.isDirectory() || await fs.realpath(runtime) !== runtime) throw failure('V4_STAGE_RUNTIME_INVALID');
  try { await fs.mkdir(stageParent, { recursive: true, mode: 0o700 }); } catch { throw failure('V4_STAGE_TARGET_PARENT_UNAVAILABLE'); }
  const stat = await fs.lstat(stageParent);
  if (stat.isSymbolicLink() || !stat.isDirectory() || await fs.realpath(stageParent) !== stageParent) throw failure('V4_STAGE_TARGET_PARENT_INVALID');
  await fs.chmod(stageParent, 0o700);
}

function relativePath(rootDirectory, value) {
  const relative = path.relative(rootDirectory, value);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw failure('V4_STAGE_PATH_ESCAPE');
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
  const stack = [{ directory: sourceRoot, depth: 0 }];
  let visited = 0;
  let totalBytes = 0;
  while (stack.length) {
    const { directory, depth } = stack.pop();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      visited += 1;
      if (visited > limits.maxFiles) throw failure('V4_STAGE_DATASET_TOO_LARGE');
      const full = path.join(directory, entry.name);
      const stat = await fs.lstat(full);
      if (stat.isSymbolicLink()) throw failure('V4_STAGE_SYMLINK_DENIED');
      if (entry.isDirectory()) {
        if (depth + 1 > limits.maxDepth) throw failure('V4_STAGE_DATASET_TOO_LARGE');
        stack.push({ directory: full, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile() || isSidecar(entry.name)) throw failure(isSidecar(entry.name) ? 'V4_STAGE_ACTIVE_DATABASE_DENIED' : 'V4_STAGE_UNSUPPORTED_ENTRY');
      if (stat.size > limits.maxSingleBytes) throw failure('V4_STAGE_FILE_TOO_LARGE');
      totalBytes += stat.size;
      if (totalBytes > limits.maxTotalBytes) throw failure('V4_STAGE_DATASET_TOO_LARGE');
      files.push({ absolute: full, relative: relativePath(sourceRoot, full), size: stat.size, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs });
    }
  }
  if (files.length < 1) throw failure('V4_STAGE_EMPTY_SOURCE');
  files.sort((left, right) => left.relative.localeCompare(right.relative));
  return { files, totalBytes };
}

async function copyInventory(inventory, sourceRoot, temporary) {
  const copiedFiles = [];
  for (const item of inventory.files) {
    const source = path.join(sourceRoot, item.relative);
    const destination = path.join(temporary, item.relative);
    await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const before = await fs.lstat(source);
    if (!before.isFile() || before.isSymbolicLink() || before.dev !== item.dev || before.ino !== item.ino || before.size !== item.size || before.mtimeMs !== item.mtimeMs) throw failure('V4_STAGE_SOURCE_CHANGED');
    const beforeHash = await sha256File(source);
    await fs.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    await fs.chmod(destination, 0o600);
    const after = await fs.lstat(source);
    const destinationStat = await fs.stat(destination);
    const destinationHash = await sha256File(destination);
    const afterHash = await sha256File(source);
    if (!after.isFile() || after.isSymbolicLink() || after.dev !== item.dev || after.ino !== item.ino || after.size !== item.size || after.mtimeMs !== item.mtimeMs || destinationStat.size !== item.size || beforeHash !== destinationHash || beforeHash !== afterHash) throw failure('V4_STAGE_SOURCE_CHANGED');
    copiedFiles.push({ path: item.relative, bytes: item.size, sha256: destinationHash });
  }
  return copiedFiles;
}

async function sha256File(filename) {
  const digest = crypto.createHash('sha256');
  for await (const chunk of createReadStream(filename)) digest.update(chunk);
  return digest.digest('hex');
}

async function writeStagedManifest(directory, account, copiedFiles, limits) {
  const manifest = {
    schema: 'alpha-independent-v4-staged-manifest.v1',
    account_id: account,
    read_only: true,
    complete: false,
    native_schema_supported: false,
    file_count: copiedFiles.length,
    total_bytes: copiedFiles.reduce((total, file) => total + file.bytes, 0),
    limits: { ...limits },
    files: copiedFiles
  };
  const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
  if (Buffer.byteLength(encoded, 'utf8') > 16 * 1024 * 1024) throw failure('V4_STAGE_MANIFEST_TOO_LARGE');
  await fs.writeFile(path.join(directory, '.alpha-v4-staged.json'), encoded, { mode: 0o600, flag: 'wx' });
  return manifest;
}

function sanitizeReport(value, source, depth = 0) {
  if (depth > 8) return '[truncated]';
  if (typeof value === 'string') {
    const replaced = source ? value.replaceAll(source, '<redacted-source>') : value;
    return path.isAbsolute(replaced) ? '<redacted-absolute-path>' : replaced.slice(0, 1024);
  }
  if (Array.isArray(value)) return value.slice(0, 512).map(item => sanitizeReport(item, source, depth + 1));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 512)) result[key] = sanitizeReport(item, source, depth + 1);
    return result;
  }
  return value;
}

async function absent(pathname, code) {
  try { await fs.lstat(pathname); throw failure(code); } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
}

async function stageV4Copy({ sourceDir, account, targetName = `v4-${account}`, preflight = preflightV4Copy, limits = DEFAULT_LIMITS } = {}) {
  safeName(account, 'V4_STAGE_ACCOUNT_ID_INVALID');
  const name = safeName(targetName, 'V4_STAGE_TARGET_NAME_INVALID');
  const source = await explicitSourceDirectory(sourceDir);
  const target = path.join(stageParent, name);
  if (containsPath(runtimeRoot, source)) throw failure('V4_STAGE_SOURCE_PROJECT_RUNTIME_DENIED');
  if (containsPath(source, target) || containsPath(target, source)) throw failure('V4_STAGE_SOURCE_TARGET_OVERLAP');
  await ensureRuntimeStageParent();
  const lockPath = `${target}.lock`;
  await absent(target, 'V4_STAGE_TARGET_EXISTS');
  await absent(lockPath, 'V4_STAGE_TARGET_BUSY');
  let lock;
  let temporary;
  let published = false;
  try {
    lock = await fs.open(lockPath, 'wx', 0o600);
    temporary = await fs.mkdtemp(path.join(stageParent, `.stage-${name}-`));
    await fs.chmod(temporary, 0o700);
    const inventory = await inventorySource(source, limits);
    const copiedFiles = await copyInventory(inventory, source, temporary);
    const stagedManifest = await writeStagedManifest(temporary, account, copiedFiles, limits);
    const preflightReport = await preflight({ dataDir: temporary, account });
    const boundedPreflight = sanitizeReport(preflightReport, source);
    const reportBytes = Buffer.byteLength(JSON.stringify(boundedPreflight), 'utf8');
    if (reportBytes > limits.maxReportBytes) throw failure('V4_STAGE_PREFLIGHT_TOO_LARGE');
    if (!['ready', 'schema-only'].includes(preflightReport.status)) {
      return { schema: 'alpha-independent-v4-stage.v1', scope: 'alpha-independent-v4-stage', status: preflightReport.status || 'unavailable', read_only: true, complete: false, native_schema_supported: false, published: false, account_id: account, target_name: name, limits, preflight: boundedPreflight };
    }
    await absent(target, 'V4_STAGE_TARGET_EXISTS');
    await fs.rename(temporary, target);
    temporary = undefined;
    published = true;
    return { schema: 'alpha-independent-v4-stage.v1', scope: 'alpha-independent-v4-stage', status: preflightReport.status, read_only: true, complete: false, native_schema_supported: false, published: true, account_id: account, target_name: name, target_dir: `.runtime/v4-staged/${name}`, manifest: { path: `.alpha-v4-staged.json`, file_count: stagedManifest.file_count, total_bytes: stagedManifest.total_bytes }, file_count: inventory.files.length, total_bytes: inventory.totalBytes, limits, preflight: boundedPreflight };
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    try { await lock?.close(); } catch {}
    try { await fs.rm(lockPath, { force: true }); } catch {}
    if (!published) {
      // The target is never removed here: it either did not exist or was owned
      // by another process and was rejected before publication.
    }
  }
}

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--json') {
      if (values.json) throw failure('V4_STAGE_USAGE');
      values.json = true;
      continue;
    }
    if (!['--source-dir', '--account-id', '--target-name'].includes(option) || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) throw failure('V4_STAGE_USAGE');
    const key = option.slice(2);
    if (Object.hasOwn(values, key)) throw failure('V4_STAGE_USAGE');
    values[key] = argv[++index];
  }
  if (!values['source-dir'] || !values['account-id']) throw failure('V4_STAGE_USAGE');
  return values;
}

function printHuman(report) {
  console.log(`v4 stage: ${report.status}; published: ${report.published}`);
  console.log(`account: ${report.account_id}; target: ${report.target_dir || 'none'}`);
  console.log(`read-only: true; complete: false; native schema supported: false`);
}

export { DEFAULT_LIMITS, cleanAbsolute, containsPath, explicitSourceDirectory, inventorySource, parse, safeName, stageV4Copy };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parse(process.argv.slice(2));
    const report = await stageV4Copy({ sourceDir: options['source-dir'], account: options['account-id'], ...(options['target-name'] ? { targetName: options['target-name'] } : {}) });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (report.status === 'rejected' || report.status === 'unavailable') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error?.code || 'V4_STAGE_FAILED'}\n`);
    process.exitCode = 2;
  }
}
