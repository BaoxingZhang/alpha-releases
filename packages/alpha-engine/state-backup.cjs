'use strict';

// The independent state directory contains user choices and export metadata.
// It must never be treated as a copy of the encrypted WeChat source database.
// This module deliberately uses a small, self-describing stream format instead
// of a general archive extractor so that every path is validated before it is
// created on restore.
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');

const SCHEMA = 'alpha-independent-state-backup.v1';
const STATE_SCHEMA = 'alpha-independent-state.v1';
const MAGIC = Buffer.from('ALPHA-INDEPENDENT-STATE-BACKUP\n', 'utf8');
const HASH = /^[a-f0-9]{64}$/;
const SNAPSHOT_DIR = 'snapshots';
const SNAPSHOT_NOTE = 'snapshots are intentionally excluded; re-import a verified snapshot separately';
const MAX_HEADER_BYTES = 4 * 1024 * 1024;
const MAX_FILES = 4096;
const MAX_FILE_BYTES = 2 * 1024 ** 3;
const MAX_TOTAL_BYTES = 32 * 1024 ** 3;
const TOP_LEVEL_FILES = new Set([
  'selected-source.v1.json',
  'removed-account.v1.json',
  'telemetry-consent.v1.json',
  'chat-export-jobs.v1.json',
  'moments-export-jobs.v1.json',
  'chat-export-schedules.v1.json',
  'official-schedule-plans.v1.json',
  'official-plan-attempts.v1.json'
]);
const SENSITIVE_NAME = /(?:database|data|image|media|encryption|private|credential|password|secret|token|key)/i;

function failure(code, detail = '') {
  const error = new Error(detail ? `${code}: ${detail}` : code);
  error.code = code;
  return error;
}

function absoluteClean(value, code = 'STATE_PATH_INVALID') {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0') || !path.isAbsolute(value) || path.normalize(value) !== value || path.parse(value).root === value) throw failure(code);
  return value;
}

function relativeSafe(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && !value.includes('\0') && !value.includes('\\') && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..') && path.posix.normalize(value) === value;
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function lstatNoSymlink(filename, code = 'STATE_SYMLINK_DENIED') {
  let stat;
  try { stat = await fsp.lstat(filename, { bigint: true }); } catch (error) {
    if (error.code === 'ENOENT') throw failure('STATE_PATH_MISSING');
    throw error;
  }
  if (stat.isSymbolicLink()) throw failure(code);
  return stat;
}

async function safeExistingDirectory(directory, { privateMode = true } = {}) {
  absoluteClean(directory);
  let current = path.parse(directory).root;
  for (const part of directory.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await lstatNoSymlink(current);
    if (!stat.isDirectory()) throw failure('STATE_DIRECTORY_INVALID');
  }
  const stat = await lstatNoSymlink(directory);
  if (!stat.isDirectory()) throw failure('STATE_DIRECTORY_INVALID');
  if (privateMode && (Number(stat.mode) & 0o077)) throw failure('STATE_PERMISSIONS_INVALID');
  return stat;
}

async function safeExistingParent(filename) {
  const parent = path.dirname(filename);
  await safeExistingDirectory(parent, { privateMode: false });
  return parent;
}

function sensitivePath(relativePath) {
  const basename = path.posix.basename(relativePath);
  return basename === 'password-lock.v1.json' || basename === 'official-plan-intent.v1.json' || SENSITIVE_NAME.test(basename);
}

function stateFileAllowed(relativePath) {
  if (!relativeSafe(relativePath)) return false;
  if (relativePath.includes('/')) return false;
  return TOP_LEVEL_FILES.has(relativePath);
}

async function digestRegularFile(filename, relativePath) {
  const stat = await lstatNoSymlink(filename);
  if (!stat.isFile()) throw failure('STATE_ENTRY_INVALID', relativePath);
  if ((Number(stat.mode) & 0o077) !== 0 || Number(stat.size) > MAX_FILE_BYTES) throw failure('STATE_PERMISSIONS_INVALID', relativePath);
  const hash = crypto.createHash('sha256');
  const file = await fsp.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || Number(before.mode) & 0o077) throw failure('STATE_PERMISSIONS_INVALID', relativePath);
    for (;;) {
      const chunk = Buffer.allocUnsafe(256 * 1024);
      const { bytesRead } = await file.read(chunk, 0, chunk.length, null);
      if (!bytesRead) break;
      hash.update(chunk.subarray(0, bytesRead));
    }
    const after = await file.stat({ bigint: true });
    const actual = await fsp.lstat(filename, { bigint: true });
    if (actual.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) throw failure('STATE_SOURCE_CHANGED', relativePath);
    return { path: relativePath, bytes: Number(before.size), sha256: hash.digest('hex'), mode: 0o600 };
  } finally {
    await file.close();
  }
}

async function inventoryState(sourceDir) {
  await safeExistingDirectory(sourceDir, { privateMode: true });
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = entry.name;
    const filename = path.join(sourceDir, relative);
    const stat = await lstatNoSymlink(filename);
    if (entry.name === SNAPSHOT_DIR) {
      if (!stat.isDirectory()) throw failure('STATE_ENTRY_INVALID', relative);
      // Snapshot directories contain plaintext SQLite copies and manifests that
      // bind themselves to the original source path. They are deliberately not
      // included in this portable state backup; import them again explicitly.
      continue;
    }
    if (stat.isDirectory()) throw failure('STATE_ENTRY_UNKNOWN', relative);
    if (sensitivePath(relative)) throw failure('STATE_SENSITIVE_FILE_DENIED', relative);
    if (!stateFileAllowed(relative)) throw failure('STATE_ENTRY_UNKNOWN', relative);
    files.push(await digestRegularFile(filename, relative));
  }
  files.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  if (files.length > MAX_FILES) throw failure('STATE_TOO_LARGE');
  const totalBytes = files.reduce((sum, item) => sum + item.bytes, 0);
  if (totalBytes > MAX_TOTAL_BYTES) throw failure('STATE_TOO_LARGE');
  return { files, totalBytes };
}

function aggregateDigest(files) {
  const hash = crypto.createHash('sha256');
  for (const item of files) hash.update(`${item.path}\0${item.bytes}\0${item.sha256}\0${item.mode}\n`, 'utf8');
  return hash.digest('hex');
}

function canonical(value) { return JSON.stringify(value); }

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw failure('STATE_BACKUP_MANIFEST_INVALID');
  if (manifest.schema !== SCHEMA || manifest.version !== 1 || manifest.stateSchema !== STATE_SCHEMA || !Array.isArray(manifest.files) || manifest.files.length > MAX_FILES || !HASH.test(manifest.aggregateSha256)) throw failure('STATE_BACKUP_MANIFEST_INVALID');
  if (!Number.isSafeInteger(manifest.totalBytes) || manifest.totalBytes < 0 || manifest.totalBytes > MAX_TOTAL_BYTES) throw failure('STATE_BACKUP_MANIFEST_INVALID');
  let total = 0; let last = '';
  for (const row of manifest.files) {
    if (!row || typeof row !== 'object' || !relativeSafe(row.path) || !stateFileAllowed(row.path) || sensitivePath(row.path) || !HASH.test(row.sha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || row.bytes > MAX_FILE_BYTES || row.mode !== 0o600 || row.path <= last) throw failure('STATE_BACKUP_MANIFEST_INVALID');
    total += row.bytes;
    last = row.path;
  }
  if (total !== manifest.totalBytes || aggregateDigest(manifest.files) !== manifest.aggregateSha256) throw failure('STATE_BACKUP_MANIFEST_INVALID');
  return manifest;
}

async function readExact(file, bytes) {
  const output = Buffer.alloc(bytes); let offset = 0;
  while (offset < bytes) {
    const { bytesRead } = await file.read(output, offset, bytes - offset, null);
    if (!bytesRead) throw failure('STATE_BACKUP_TRUNCATED');
    offset += bytesRead;
  }
  return output;
}

async function writeAll(file, buffer) {
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesWritten } = await file.write(buffer, offset, buffer.length - offset, null);
    if (!bytesWritten) throw failure('STATE_BACKUP_WRITE_FAILED');
    offset += bytesWritten;
  }
}

async function ensureAbsent(filename, code = 'STATE_TARGET_EXISTS') {
  try {
    const stat = await fsp.lstat(filename);
    if (stat.isSymbolicLink()) throw failure('STATE_SYMLINK_DENIED');
    throw failure(code);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
}

function sameIdentity(a, b) {
  return a && b && a.dev === b.dev && a.ino === b.ino;
}

async function removeOwned(filename, owned, recursive = false) {
  if (!owned) return false;
  try {
    const current = await fsp.lstat(filename, { bigint: true });
    if (!sameIdentity(current, owned)) return false;
    await fsp.rm(filename, { force: true, recursive });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function publishFileExclusive(temporary, target, owned) {
  try {
    await fsp.link(temporary, target);
  } catch (error) {
    if (error.code === 'EEXIST') throw failure('STATE_TARGET_EXISTS');
    throw error;
  } finally {
    await removeOwned(temporary, owned);
  }
}

async function createStateBackup({ sourceDir, targetFile, projectVersion = '0.3.5' } = {}) {
  sourceDir = absoluteClean(sourceDir);
  targetFile = absoluteClean(targetFile);
  if (inside(sourceDir, targetFile)) throw failure('STATE_PATH_OVERLAP');
  await safeExistingDirectory(sourceDir, { privateMode: true });
  await safeExistingParent(targetFile);
  await ensureAbsent(targetFile);
  const inventory = await inventoryState(sourceDir);
  const manifest = {
    schema: SCHEMA,
    version: 1,
    stateSchema: STATE_SCHEMA,
    projectVersion: typeof projectVersion === 'string' && /^\d+\.\d+\.\d+$/.test(projectVersion) ? projectVersion : '0.3.5',
    createdAt: new Date().toISOString(),
    files: inventory.files,
    totalBytes: inventory.totalBytes,
    aggregateSha256: aggregateDigest(inventory.files),
    exclusions: [SNAPSHOT_NOTE, 'database keys, lock verifiers and runtime credentials are never backed up']
  };
  validateManifest(manifest);
  const header = Buffer.from(canonical(manifest), 'utf8');
  if (header.length > MAX_HEADER_BYTES) throw failure('STATE_TOO_LARGE');
  const temporary = path.join(path.dirname(targetFile), `.alpha-state-backup-${crypto.randomUUID()}.tmp`);
  let published = false;
  let temporaryOwned = null;
  try {
    const output = await fsp.open(temporary, 'wx', 0o600);
    temporaryOwned = await fsp.lstat(temporary, { bigint: true });
    try {
      await writeAll(output, MAGIC);
      const length = Buffer.alloc(4); length.writeUInt32BE(header.length, 0); await writeAll(output, length); await writeAll(output, header); await writeAll(output, crypto.createHash('sha256').update(header).digest());
      for (const row of manifest.files) {
        const input = await fsp.open(path.join(sourceDir, row.path), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
        const hash = crypto.createHash('sha256'); let remaining = row.bytes;
        try {
          while (remaining > 0) {
            const chunk = Buffer.allocUnsafe(Math.min(256 * 1024, remaining)); const { bytesRead } = await input.read(chunk, 0, chunk.length, null);
            if (!bytesRead) throw failure('STATE_SOURCE_CHANGED', row.path);
            remaining -= bytesRead; hash.update(chunk.subarray(0, bytesRead)); await writeAll(output, chunk.subarray(0, bytesRead));
          }
        } finally { await input.close(); }
        if (hash.digest('hex') !== row.sha256) throw failure('STATE_SOURCE_CHANGED', row.path);
      }
      await output.sync();
    } finally { await output.close(); }
    await publishFileExclusive(temporary, targetFile, temporaryOwned); published = true;
  } finally {
    if (!published) await removeOwned(temporary, temporaryOwned);
  }
  return { schema: SCHEMA, targetFile, manifest };
}

async function restoreStateBackup({ sourceFile, targetDir } = {}) {
  sourceFile = absoluteClean(sourceFile);
  targetDir = absoluteClean(targetDir);
  if (sourceFile === targetDir || inside(targetDir, sourceFile)) throw failure('STATE_PATH_OVERLAP');
  await safeExistingParent(sourceFile);
  const archiveStat = await lstatNoSymlink(sourceFile);
  if (!archiveStat.isFile() || (Number(archiveStat.mode) & 0o077) !== 0) throw failure('STATE_PERMISSIONS_INVALID');
  await safeExistingParent(targetDir);
  await ensureAbsent(targetDir);
  const archive = await fsp.open(sourceFile, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  let temporary = path.join(path.dirname(targetDir), `.alpha-state-restore-${crypto.randomUUID()}.tmp`);
  let temporaryOwned = null;
  try {
    const magic = await readExact(archive, MAGIC.length); if (!magic.equals(MAGIC)) throw failure('STATE_BACKUP_FORMAT_INVALID');
    const lengthBytes = await readExact(archive, 4); const length = lengthBytes.readUInt32BE(0); if (length <= 0 || length > MAX_HEADER_BYTES) throw failure('STATE_BACKUP_MANIFEST_INVALID');
    const header = await readExact(archive, length); const expectedHeaderHash = await readExact(archive, 32);
    if (!crypto.timingSafeEqual(crypto.createHash('sha256').update(header).digest(), expectedHeaderHash)) throw failure('STATE_BACKUP_MANIFEST_TAMPERED');
    let manifest; try { manifest = JSON.parse(header.toString('utf8')); } catch { throw failure('STATE_BACKUP_MANIFEST_INVALID'); }
    validateManifest(manifest);
    await fsp.mkdir(temporary, { mode: 0o700 });
    temporaryOwned = await fsp.lstat(temporary, { bigint: true });
    for (const row of manifest.files) {
      const filename = path.join(temporary, ...row.path.split('/'));
      const parent = path.dirname(filename); await fsp.mkdir(parent, { recursive: true, mode: 0o700 });
      const output = await fsp.open(filename, 'wx', 0o600); const hash = crypto.createHash('sha256'); let remaining = row.bytes;
      try {
        while (remaining > 0) {
          const chunk = await readExact(archive, Math.min(256 * 1024, remaining)); remaining -= chunk.length; hash.update(chunk); await writeAll(output, chunk);
        }
        await output.sync();
      } finally { await output.close(); }
      if (hash.digest('hex') !== row.sha256) throw failure('STATE_BACKUP_HASH_MISMATCH', row.path);
    }
    const trailing = Buffer.alloc(1); const result = await archive.read(trailing, 0, 1, null); if (result.bytesRead !== 0) throw failure('STATE_BACKUP_TRAILING_DATA');
    await fsp.chmod(temporary, 0o700);
    await fsp.rename(temporary, targetDir); temporary = '';
    return { schema: SCHEMA, targetDir, manifest };
  } finally {
    await archive.close();
    if (temporary) await removeOwned(temporary, temporaryOwned, true);
  }
}

module.exports = { SCHEMA, STATE_SCHEMA, createStateBackup, restoreStateBackup, inventoryState, validateManifest, aggregateDigest, removeOwned };
