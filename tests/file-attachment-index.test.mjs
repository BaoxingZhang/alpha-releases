import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_INDEXED_ATTACHMENT_BYTES,
  locateIndexedAttachment
} from '../packages/alpha-engine/file-attachment.cjs';

const accountId = 'synthetic-file-account';

async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/file-attachment-index-'));
  await fs.mkdir(path.join(root, 'media'), { recursive: true, mode: 0o700 });
  const bytes = options.bytes ?? Buffer.from('synthetic attachment bytes\n', 'utf8');
  const relativePath = options.relativePath ?? 'media/archive.zip';
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(filePath, bytes, { mode: 0o600 });
  const sha256 = options.sha256 ?? crypto.createHash('sha256').update(bytes).digest('hex');
  const entry = {
    kind: 'file', id: options.id ?? 'source-file-id', rendition: 'source', relativePath,
    sha256, sizeBytes: options.sizeBytes ?? bytes.length, mimeType: 'application/zip', accountId
  };
  await fs.writeFile(path.join(root, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId, entries: [entry] }) + '\n', { mode: 0o600 });
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  return { root, filePath, bytes, entry, id: sha256 };
}

function locate(f, granted = () => true, fileName = 'archive.zip') {
  return locateIndexedAttachment({ root: f.root, id: f.id, accountId, fileName, granted });
}

test('indexed file attachment reads and copies only the verified sha binding', async t => {
  const f = await fixture(t);
  const source = locate(f);
  assert.equal(source.fileName, 'archive.zip');
  assert.equal(source.size, f.bytes.length);
  const output = [];
  await source.copyTo({ write: async chunk => { output.push(Buffer.from(chunk)); } });
  assert.deepEqual(Buffer.concat(output), f.bytes);
  const current = locate(f);
  assert.equal(source.sameAs(current), true);
});

test('indexed attachment fails closed when content hash or size changes', async t => {
  const f = await fixture(t);
  const source = locate(f);
  await fs.writeFile(f.filePath, Buffer.from('changed attachment\n'), { mode: 0o600 });
  await assert.rejects(source.copyTo({ write: async () => {} }), /FILE_ATTACHMENT_CONTENT_CHANGED/);
  const oversized = await fixture(t, { sizeBytes: MAX_INDEXED_ATTACHMENT_BYTES + 1 });
  assert.throws(() => locate(oversized), /MEDIA_INDEX_FILE_TOO_LARGE/);
});

test('indexed attachment honors the live renderer grant and rejects missing or ambiguous entries', async t => {
  const f = await fixture(t);
  const source = locate(f, () => false);
  await assert.rejects(source.copyTo({ write: async () => {} }), /FILE_ATTACHMENT_NOT_AUTHORIZED/);
  const missing = { ...f, id: 'f'.repeat(64) };
  assert.throws(() => locate(missing), /MEDIA_INDEX_ENTRY_NOT_FOUND/);

  const second = { ...f.entry, rendition: 'alternate', relativePath: 'media/second.zip' };
  await fs.writeFile(path.join(f.root, second.relativePath), f.bytes, { mode: 0o600 });
  await fs.writeFile(path.join(f.root, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId, entries: [f.entry, second] }) + '\n', { mode: 0o600 });
  assert.throws(() => locate(f), /MEDIA_INDEX_ENTRY_AMBIGUOUS/);
});

test('indexed attachment rejects symlinked media and account mismatches', async t => {
  const f = await fixture(t);
  const outside = path.join(path.dirname(f.root), 'outside-attachment.bin');
  await fs.writeFile(outside, f.bytes, { mode: 0o600 });
  await fs.rm(f.filePath);
  await fs.symlink(outside, f.filePath);
  await assert.rejects(locate(f).copyTo({ write: async () => {} }), /FILE_ATTACHMENT_CONTENT_CHANGED/);

  const otherRoot = await fs.mkdtemp(path.join(process.cwd(), '.runtime/file-attachment-account-'));
  t.after(() => fs.rm(otherRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 25 }));
  await fs.writeFile(path.join(otherRoot, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId: 'other-account', entries: [f.entry] }) + '\n', { mode: 0o600 });
  assert.throws(() => locateIndexedAttachment({ root: otherRoot, id: f.id, accountId, fileName: 'archive.zip', granted: () => true }), /MEDIA_INDEX_ACCOUNT_MISMATCH/);
});
