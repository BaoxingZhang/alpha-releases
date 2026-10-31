'use strict';
const fs = require('node:fs');
const fsp = fs.promises;
const path = require('node:path');
const crypto = require('node:crypto');
const DATABASE = /^(contact\.db|session\.db|message(?:_[0-9]+)?\.db)$/;
const PROFILE = 'wechat-v4-sqlcipher4-4096-kdf256000';
const HASH = /^[a-f0-9]{64}$/;
const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const fail = code => new Error(code);
function same(a, b) { return ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]); }
async function safeDirectory(directory, guard = () => {}, privateMode = false) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw fail('SNAPSHOT_PATH_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.split(path.sep).filter(Boolean)) {
    guard(); current = path.join(current, part); const stat = await fsp.lstat(current); guard();
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw fail('SYMLINK_DENIED');
  }
  if (privateMode && ((await fsp.stat(directory)).mode & 0o077)) throw fail('SNAPSHOT_PERMISSIONS_INVALID');
}
async function digestFile(filename, guard, privateMode) {
  await safeDirectory(path.dirname(filename), guard);
  guard(); const file = await fsp.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const before = await file.stat({ bigint: true });
    if (!before.isFile() || before.size > 128n * 1024n ** 3n || before.size < 4096n || before.size % 4096n !== 0n) throw fail('SNAPSHOT_DATABASE_INVALID');
    if (privateMode && (before.mode & 0o077n)) throw fail('SNAPSHOT_PERMISSIONS_INVALID');
    const hash = crypto.createHash('sha256'), buffer = Buffer.allocUnsafe(256 * 1024);
    for (;;) { guard(); const { bytesRead } = await file.read(buffer); guard(); if (!bytesRead) break; hash.update(buffer.subarray(0, bytesRead)); }
    const after = await file.stat({ bigint: true }), actual = await fsp.lstat(filename, { bigint: true }); guard();
    if (!same(before, after) || !same(before, actual) || actual.isSymbolicLink()) throw fail('SOURCE_CHANGED');
    return { hash: hash.digest('hex'), bytes: Number(before.size), stamp: before };
  } finally { await file.close(); }
}
async function inventory(directory, guard = () => {}, privateMode = false) {
  await safeDirectory(directory, guard, privateMode);
  const files = [], directories = []; let entries = 0, total = 0;
  async function walk(current, depth) {
    guard(); if (depth > 8) throw fail('DATASET_TOO_LARGE');
    const before = await fsp.lstat(current, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink()) throw fail('SYMLINK_DENIED');
    if (privateMode && (before.mode & 0o077n)) throw fail('SNAPSHOT_PERMISSIONS_INVALID');
    for (const item of await fsp.readdir(current, { withFileTypes: true })) {
      guard(); if (++entries > 10000) throw fail('DATASET_TOO_LARGE');
      const filename = path.join(current, item.name), stat = await fsp.lstat(filename);
      if (stat.isSymbolicLink()) throw fail('SYMLINK_DENIED');
      if (stat.isDirectory()) await walk(filename, depth + 1);
      else if (DATABASE.test(item.name)) {
        if (!stat.isFile()) throw fail('SNAPSHOT_DATABASE_INVALID');
        const value = await digestFile(filename, guard, privateMode); total += value.bytes;
        if (total > 512 * 1024 ** 3) throw fail('DATASET_TOO_LARGE');
        files.push({ relativePath: path.relative(directory, filename).split(path.sep).join('/'), ...value });
      } else if (/-wal$|-shm$|-journal$/.test(item.name) && DATABASE.test(item.name.replace(/-(wal|shm|journal)$/, ''))) throw fail('ACTIVE_DATABASE_DENIED');
    }
    const after = await fsp.lstat(current, { bigint: true });
    if (!same(before, after)) throw fail('SOURCE_CHANGED');
    directories.push({ filename: current, stamp: after });
  }
  await walk(directory, 0); if (!files.length) throw fail('NO_DATABASES');
  files.sort((a, b) => Buffer.compare(Buffer.from(a.relativePath), Buffer.from(b.relativePath)));
  const hash = crypto.createHash('sha256'); for (const file of files) hash.update(`${file.relativePath}\0${file.hash}\n`);
  return { directory, files, directories, fingerprint: hash.digest('hex') };
}
async function verifyStamps(value, guard = () => {}) {
  await safeDirectory(value.directory, guard);
  for (const item of [...value.directories, ...value.files.map(file => ({ filename: path.join(value.directory, file.relativePath), stamp: file.stamp }))]) {
    guard(); const current = await fsp.lstat(item.filename, { bigint: true }); guard();
    if (current.isSymbolicLink() || !same(current, item.stamp)) throw fail('SOURCE_CHANGED');
  }
}
function exact(object, keys) { return object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join(',') === keys.sort().join(','); }
function records(value) {
  if (!Array.isArray(value) || !value.length || value.length > 10000) throw fail('SNAPSHOT_MANIFEST_INVALID');
  let last = null;
  for (const row of value) {
    if (!exact(row, ['relativePath', 'sourceSha256', 'outputSha256', 'bytes', 'pages']) || typeof row.relativePath !== 'string' || row.relativePath.includes('\\') || row.relativePath.includes('\0') || row.relativePath.split('/').some(x => !x || x === '.' || x === '..') || !DATABASE.test(path.posix.basename(row.relativePath)) || row.relativePath.split('/').length > 9 || !HASH.test(row.sourceSha256) || !HASH.test(row.outputSha256) || !Number.isSafeInteger(row.bytes) || row.bytes < 4096 || row.bytes > 128 * 1024 ** 3 || row.bytes % 4096 || row.pages !== row.bytes / 4096 || (last && Buffer.compare(Buffer.from(last), Buffer.from(row.relativePath)) >= 0)) throw fail('SNAPSHOT_MANIFEST_INVALID');
    last = row.relativePath;
  }
  return value;
}
function validateManifest(value, { snapshotRoot, accountId, encryptedDir }) {
  if (!exact(value, ['version', 'accountId', 'encryptedDir', 'outputDir', 'profile', 'sourceFingerprint', 'databases']) || value.version !== 2 || value.accountId !== accountId || value.encryptedDir !== encryptedDir || value.profile !== PROFILE || !HASH.test(value.sourceFingerprint) || typeof value.outputDir !== 'string') throw fail('SNAPSHOT_MANIFEST_INVALID');
  const relative = path.relative(snapshotRoot, value.outputDir);
  if (!new RegExp(`^snapshot-${UUID}/data$`).test(relative) || path.join(snapshotRoot, relative) !== value.outputDir) throw fail('SNAPSHOT_MANIFEST_INVALID');
  records(value.databases); return value;
}
async function readManifest(options, guard) {
  const filename = path.join(options.snapshotRoot, 'manifest.v1.json');
  try { await fsp.lstat(options.snapshotRoot); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  await safeDirectory(options.snapshotRoot, guard, true);
  let file; try { file = await fsp.open(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK); } catch (error) { if (error.code === 'ENOENT') return null; throw fail('SNAPSHOT_MANIFEST_INVALID'); }
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.mode & 0o077 || stat.size > 2 * 1024 * 1024) throw fail('SNAPSHOT_MANIFEST_INVALID');
    guard(); let value; try { value = JSON.parse(await file.readFile('utf8')); } catch { throw fail('SNAPSHOT_MANIFEST_INVALID'); } guard();
    return validateManifest(value, options);
  } finally { await file.close(); }
}
function matchInventory(source, output, rows) {
  records(rows);
  if (source.files.length !== rows.length || output.files.length !== rows.length) throw fail('SNAPSHOT_HASH_MISMATCH');
  rows.forEach((row, index) => {
    const a = source.files[index], b = output.files[index];
    if (row.relativePath !== a.relativePath || row.relativePath !== b.relativePath || row.sourceSha256 !== a.hash || row.outputSha256 !== b.hash || row.bytes !== a.bytes || row.bytes !== b.bytes) throw fail('SNAPSHOT_HASH_MISMATCH');
  });
}
async function writeManifest(value, options, guard) {
  validateManifest(value, options); await safeDirectory(options.snapshotRoot, guard, true);
  const temporary = path.join(options.snapshotRoot, `.manifest-${crypto.randomUUID()}`);
  try {
    const file = await fsp.open(temporary, 'wx', 0o600);
    try { await file.writeFile(JSON.stringify(value) + '\n'); await file.sync(); } finally { await file.close(); }
    guard(); await fsp.rename(temporary, path.join(options.snapshotRoot, 'manifest.v1.json'));
  } finally { await fsp.rm(temporary, { force: true }); }
}
module.exports = { PROFILE, safeDirectory, inventory, verifyStamps, readManifest, writeManifest, matchInventory, records };
