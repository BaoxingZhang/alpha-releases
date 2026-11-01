'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const error = code => new Error(code);
const MANIFEST_NAME = 'media-index.v1.json';
const MANIFEST_VERSION = 1;
const DEFAULT_MAX_ENTRIES = 10000;
const DEFAULT_MAX_MANIFEST_BYTES = 8 * 1024 * 1024;
const DEFAULT_MAX_FILE_BYTES = 512 * 1024 * 1024;
const MEDIA_KINDS = new Set(['image', 'video', 'file', 'voice']);
const SHA256 = /^[0-9a-f]{64}$/;

function boundedText(value, maximum, code = 'MEDIA_INDEX_ENTRY_INVALID') {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) throw error(code);
  return value;
}

function boundedRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || root.length > 4096 || /[\u0000-\u001f\u007f]/.test(root)) throw error('MEDIA_INDEX_ROOT_INVALID');
  return path.resolve(root);
}

function assertDirectory(root, code = 'MEDIA_INDEX_ROOT_INVALID') {
  let stat;
  try { stat = fs.lstatSync(root); } catch (failure) { if (failure.code === 'ENOENT') throw error(code); throw failure; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw error(code);
}

function assertNoSymlinkParents(root, target) {
  const absoluteRoot = path.resolve(root);
  let current = absoluteRoot;
  const relativeDirectory = path.relative(absoluteRoot, path.dirname(path.resolve(target)));
  if (relativeDirectory === '..' || relativeDirectory.startsWith(`..${path.sep}`) || path.isAbsolute(relativeDirectory)) throw error('MEDIA_INDEX_PATH_INVALID');
  for (const part of relativeDirectory.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = fs.lstatSync(current); } catch (failure) { if (failure.code === 'ENOENT') throw error('MEDIA_INDEX_FILE_NOT_FOUND'); throw failure; }
    if (stat.isSymbolicLink()) throw error('MEDIA_INDEX_FILE_SYMLINK');
    if (!stat.isDirectory()) throw error('MEDIA_INDEX_FILE_INVALID');
  }
}

function pathWithin(root, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.length > 4096 || relativePath.includes('\0') || relativePath.includes('\\') || path.posix.isAbsolute(relativePath) || path.isAbsolute(relativePath)) throw error('MEDIA_INDEX_PATH_INVALID');
  const parts = relativePath.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw error('MEDIA_INDEX_PATH_INVALID');
  const absoluteRoot = path.resolve(root);
  const target = path.resolve(absoluteRoot, ...parts);
  const relative = path.relative(absoluteRoot, target);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw error('MEDIA_INDEX_PATH_INVALID');
  return target;
}

function entryKey(entry) {
  return `${entry.kind}\0${entry.id}\0${entry.rendition}`;
}

function normalizeEntry(raw, root, maxFileBytes) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw error('MEDIA_INDEX_ENTRY_INVALID');
  const kind = boundedText(raw.kind, 32);
  if (!MEDIA_KINDS.has(kind)) throw error('MEDIA_INDEX_KIND_UNSUPPORTED');
  const id = boundedText(raw.id, 1024);
  const rendition = raw.rendition === undefined ? 'source' : boundedText(raw.rendition, 64);
  const relativePath = boundedText(raw.relativePath, 4096);
  const filePath = pathWithin(root, relativePath);
  const sha256 = boundedText(raw.sha256, 64).toLowerCase();
  if (!SHA256.test(sha256)) throw error('MEDIA_INDEX_HASH_INVALID');
  if (!Number.isSafeInteger(raw.sizeBytes) || raw.sizeBytes < 0 || raw.sizeBytes > maxFileBytes) throw error('MEDIA_INDEX_SIZE_INVALID');
  const result = { kind, id, rendition, relativePath, filePath, sha256, sizeBytes: raw.sizeBytes };
  if (raw.accountId !== undefined) result.accountId = boundedText(raw.accountId, 256);
  if (raw.mimeType !== undefined) result.mimeType = boundedText(raw.mimeType, 128);
  if (raw.conversationId !== undefined) result.conversationId = boundedText(raw.conversationId, 1024);
  if (raw.messageId !== undefined) result.messageId = boundedText(raw.messageId, 1024);
  if (raw.sentAtUnixMs !== undefined) {
    if (typeof raw.sentAtUnixMs !== 'string' || !/^(?:0|[1-9][0-9]{0,18})$/.test(raw.sentAtUnixMs)) throw error('MEDIA_INDEX_TIMESTAMP_INVALID');
    result.sentAtUnixMs = raw.sentAtUnixMs;
  }
  return result;
}

function readManifestFile(manifestPath, maxBytes) {
  let stat;
  try { stat = fs.lstatSync(manifestPath); } catch (failure) { if (failure.code === 'ENOENT') throw error('MEDIA_INDEX_MANIFEST_MISSING'); throw failure; }
  if (stat.isSymbolicLink()) throw error('MEDIA_INDEX_MANIFEST_SYMLINK');
  if (!stat.isFile()) throw error('MEDIA_INDEX_MANIFEST_INVALID');
  if (stat.size > maxBytes) throw error('MEDIA_INDEX_MANIFEST_TOO_LARGE');
  let source;
  try { source = fs.readFileSync(manifestPath, 'utf8'); } catch { throw error('MEDIA_INDEX_MANIFEST_INVALID'); }
  try { return JSON.parse(source); } catch { throw error('MEDIA_INDEX_MANIFEST_INVALID'); }
}

function loadMediaIndex({ root, fileName = MANIFEST_NAME, maxEntries = DEFAULT_MAX_ENTRIES, maxManifestBytes = DEFAULT_MAX_MANIFEST_BYTES, maxFileBytes = DEFAULT_MAX_FILE_BYTES, expectedAccountId = '' } = {}) {
  const absoluteRoot = boundedRoot(root);
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 1 || maxEntries > DEFAULT_MAX_ENTRIES) throw error('MEDIA_INDEX_LIMIT_INVALID');
  if (!Number.isSafeInteger(maxManifestBytes) || maxManifestBytes < 1 || maxManifestBytes > DEFAULT_MAX_MANIFEST_BYTES) throw error('MEDIA_INDEX_LIMIT_INVALID');
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > DEFAULT_MAX_FILE_BYTES) throw error('MEDIA_INDEX_LIMIT_INVALID');
  assertDirectory(absoluteRoot);
  if (typeof fileName !== 'string' || fileName !== MANIFEST_NAME) throw error('MEDIA_INDEX_MANIFEST_INVALID');
  const manifestPath = path.join(absoluteRoot, fileName);
  const raw = readManifestFile(manifestPath, maxManifestBytes);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.version !== MANIFEST_VERSION || !Array.isArray(raw.entries) || raw.entries.length > maxEntries) throw error('MEDIA_INDEX_MANIFEST_INVALID');
  const accountId = raw.accountId === undefined ? '' : boundedText(raw.accountId, 256);
  if (expectedAccountId !== '' && (typeof expectedAccountId !== 'string' || expectedAccountId.length > 256 || expectedAccountId.includes('\0'))) throw error('MEDIA_INDEX_ACCOUNT_INVALID');
  if (expectedAccountId && accountId && accountId !== expectedAccountId) throw error('MEDIA_INDEX_ACCOUNT_MISMATCH');
  const entries = [];
  const byKey = new Map();
  for (const item of raw.entries) {
    const entry = normalizeEntry(item, absoluteRoot, maxFileBytes);
    if (expectedAccountId && entry.accountId && entry.accountId !== expectedAccountId) throw error('MEDIA_INDEX_ACCOUNT_MISMATCH');
    const key = entryKey(entry);
    if (byKey.has(key)) throw error('MEDIA_INDEX_DUPLICATE_ENTRY');
    byKey.set(key, entry);
    entries.push(Object.freeze(entry));
  }
  return Object.freeze({ version: MANIFEST_VERSION, root: absoluteRoot, manifestPath, accountId, entries: Object.freeze(entries) });
}

function findMediaEntry(index, { kind, id, rendition = 'source' } = {}) {
  if (!index || typeof index !== 'object' || !Array.isArray(index.entries) || typeof index.root !== 'string') throw error('MEDIA_INDEX_HANDLE_INVALID');
  const normalized = normalizeEntry({ kind, id, rendition, relativePath: 'placeholder', sha256: '0'.repeat(64), sizeBytes: 0 }, index.root, DEFAULT_MAX_FILE_BYTES);
  const key = entryKey(normalized);
  return index.entries.find(entry => entryKey(entry) === key) || null;
}

async function readMediaEntry(index, entryOrQuery, { maxBytes = DEFAULT_MAX_FILE_BYTES } = {}) {
  if (!index || typeof index !== 'object' || !Array.isArray(index.entries) || typeof index.root !== 'string') throw error('MEDIA_INDEX_HANDLE_INVALID');
  let entry;
  if (entryOrQuery && entryOrQuery.filePath) {
    if (!index.entries.includes(entryOrQuery)) throw error('MEDIA_INDEX_ENTRY_INVALID');
    entry = entryOrQuery;
  } else {
    entry = findMediaEntry(index, entryOrQuery);
  }
  if (!entry) throw error('MEDIA_INDEX_ENTRY_NOT_FOUND');
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > DEFAULT_MAX_FILE_BYTES) throw error('MEDIA_INDEX_LIMIT_INVALID');
  assertDirectory(index.root);
  if (entry.sizeBytes > maxBytes) throw error('MEDIA_INDEX_FILE_TOO_LARGE');
  const target = pathWithin(index.root, entry.relativePath);
  assertNoSymlinkParents(index.root, target);
  let handle;
  let stat;
  try {
    handle = await fs.promises.open(target, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    stat = await handle.stat();
  } catch (failure) {
    if (handle) await handle.close().catch(() => {});
    if (failure.code === 'ENOENT') throw error('MEDIA_INDEX_FILE_NOT_FOUND');
    if (failure.code === 'ELOOP') throw error('MEDIA_INDEX_FILE_SYMLINK');
    throw error('MEDIA_INDEX_FILE_INVALID');
  }
  if (!stat.isFile()) { await handle.close().catch(() => {}); throw error('MEDIA_INDEX_FILE_INVALID'); }
  if (stat.size !== entry.sizeBytes) { await handle.close().catch(() => {}); throw error('MEDIA_INDEX_SIZE_MISMATCH'); }
  const hash = crypto.createHash('sha256');
  const chunks = [];
  let total = 0;
  let stream;
  try { stream = handle.createReadStream({ highWaterMark: 64 * 1024, autoClose: false }); } catch { await handle.close().catch(() => {}); throw error('MEDIA_INDEX_FILE_INVALID'); }
  try {
    for await (const chunk of stream) {
      total += chunk.length;
      if (total > maxBytes) throw error('MEDIA_INDEX_FILE_TOO_LARGE');
      hash.update(chunk);
      chunks.push(chunk);
    }
  } catch (failure) {
    stream.destroy();
    await handle.close().catch(() => {});
    if (/^MEDIA_INDEX_/.test(failure.message || '')) throw failure;
    throw error('MEDIA_INDEX_READ_FAILED');
  }
  await handle.close().catch(() => {});
  if (total !== entry.sizeBytes) throw error('MEDIA_INDEX_SIZE_MISMATCH');
  if (hash.digest('hex') !== entry.sha256) throw error('MEDIA_INDEX_HASH_MISMATCH');
  return { entry, bytes: Buffer.concat(chunks, total) };
}

module.exports = {
  MANIFEST_NAME,
  MANIFEST_VERSION,
  DEFAULT_MAX_ENTRIES,
  DEFAULT_MAX_MANIFEST_BYTES,
  DEFAULT_MAX_FILE_BYTES,
  loadMediaIndex,
  findMediaEntry,
  readMediaEntry
};
