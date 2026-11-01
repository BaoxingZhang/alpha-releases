import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadMediaIndex, findMediaEntry, readMediaEntry } = require('../packages/alpha-engine/media-index.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/media-index-'));
  const media = Buffer.from('synthetic image bytes\n', 'utf8');
  await fs.mkdir(path.join(root, 'media'), { mode: 0o700 });
  await fs.writeFile(path.join(root, 'media', 'image.bin'), media, { mode: 0o600 });
  const entry = {
    kind: 'image', id: '0123456789abcdef0123456789abcdef', rendition: 'source',
    relativePath: 'media/image.bin', sha256: crypto.createHash('sha256').update(media).digest('hex'), sizeBytes: media.length,
    mimeType: 'image/png', conversationId: 'wxid_peer', messageId: 'msg-1', sentAtUnixMs: '1700000000000'
  };
  await fs.writeFile(path.join(root, 'media-index.v1.json'), JSON.stringify({ version: 1, entries: [entry] }) + '\n', { mode: 0o600 });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, entry, media };
}

test('media index loads an explicit bounded entry and verifies bytes', async t => {
  const f = await fixture(t);
  const index = loadMediaIndex({ root: f.root });
  const entry = findMediaEntry(index, { kind: 'image', id: f.entry.id, rendition: 'source' });
  assert.equal(entry.relativePath, f.entry.relativePath);
  const resolved = await readMediaEntry(index, { kind: 'image', id: f.entry.id, rendition: 'source' });
  assert.deepEqual(resolved.bytes, f.media);
  assert.equal(resolved.entry.mimeType, 'image/png');
  await assert.rejects(readMediaEntry(index, { ...entry, filePath: path.join(f.root, entry.relativePath) }), /MEDIA_INDEX_ENTRY_INVALID/);
});

test('media index rejects traversal, absolute paths, duplicate keys and malformed bounds', async t => {
  const f = await fixture(t);
  const manifest = path.join(f.root, 'media-index.v1.json');
  const invalid = [
    { ...f.entry, relativePath: '../outside.bin' },
    { ...f.entry, relativePath: '/tmp/outside.bin' },
    { ...f.entry, sizeBytes: -1 },
    { ...f.entry, sha256: 'not-a-sha256' }
  ];
  for (const entry of invalid) {
    await fs.writeFile(manifest, JSON.stringify({ version: 1, entries: [entry] }));
    assert.throws(() => loadMediaIndex({ root: f.root }), /MEDIA_INDEX_/);
  }
  await fs.writeFile(manifest, JSON.stringify({ version: 1, entries: [f.entry, f.entry] }));
  assert.throws(() => loadMediaIndex({ root: f.root }), /MEDIA_INDEX_DUPLICATE_ENTRY/);
  await fs.writeFile(manifest, JSON.stringify({ version: 1, entries: [f.entry] }));
  assert.throws(() => loadMediaIndex({ root: f.root, maxEntries: 0 }), /MEDIA_INDEX_LIMIT_INVALID/);
});

test('media index fails closed for symlink roots, manifest and media files', async t => {
  const f = await fixture(t);
  const outside = await fs.mkdtemp(path.join(process.cwd(), '.runtime/media-index-outside-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  const symlinkRoot = `${f.root}-link`;
  await fs.symlink(f.root, symlinkRoot);
  t.after(() => fs.rm(symlinkRoot, { recursive: true, force: true }));
  assert.throws(() => loadMediaIndex({ root: symlinkRoot }), /MEDIA_INDEX_ROOT_INVALID/);
  const manifestPath = path.join(f.root, 'media-index.v1.json');
  const saved = await fs.readFile(manifestPath);
  await fs.unlink(manifestPath);
  await fs.symlink(path.join(outside, 'missing.json'), manifestPath);
  assert.throws(() => loadMediaIndex({ root: f.root }), /MEDIA_INDEX_MANIFEST_SYMLINK/);
  await fs.unlink(manifestPath);
  await fs.writeFile(manifestPath, saved, { mode: 0o600 });
  const mediaPath = path.join(f.root, f.entry.relativePath);
  const realPath = `${mediaPath}.real`;
  await fs.rename(mediaPath, realPath);
  await fs.symlink(realPath, mediaPath);
  const index = loadMediaIndex({ root: f.root });
  await assert.rejects(readMediaEntry(index, f.entry), /MEDIA_INDEX_FILE_SYMLINK/);
  await fs.unlink(mediaPath);
  await fs.rename(realPath, mediaPath);
  await fs.symlink(path.join(f.root, 'media'), path.join(f.root, 'linked-media'));
  const parentManifest = { ...f.entry, relativePath: 'linked-media/image.bin' };
  await fs.writeFile(manifestPath, JSON.stringify({ version: 1, entries: [parentManifest] }));
  const parentIndex = loadMediaIndex({ root: f.root });
  await assert.rejects(readMediaEntry(parentIndex, parentManifest), /MEDIA_INDEX_FILE_SYMLINK/);
});

test('media index detects size and digest changes and bounds reads', async t => {
  const f = await fixture(t);
  const index = loadMediaIndex({ root: f.root });
  await fs.writeFile(path.join(f.root, f.entry.relativePath), Buffer.concat([f.media, Buffer.from('changed')]));
  await assert.rejects(readMediaEntry(index, f.entry), /MEDIA_INDEX_SIZE_MISMATCH/);
  await fs.writeFile(path.join(f.root, f.entry.relativePath), Buffer.alloc(f.media.length, 0x7f));
  const changedIndex = loadMediaIndex({ root: f.root });
  await assert.rejects(readMediaEntry(changedIndex, f.entry), /MEDIA_INDEX_HASH_MISMATCH/);
  await fs.writeFile(path.join(f.root, f.entry.relativePath), f.media);
  await assert.rejects(readMediaEntry(index, f.entry, { maxBytes: 1 }), /MEDIA_INDEX_FILE_TOO_LARGE/);
});
