import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { loadMediaIndex } = require('../packages/alpha-engine/media-index.cjs');
const { readIndexedImage } = require('../packages/alpha-engine/indexed-image.cjs');

function aesEcbEncrypt(bytes, key) {
  const cipher = crypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(bytes), cipher.final()]);
}

function datFixture() {
  const key = Buffer.from('0123456789abcdef', 'ascii');
  const plainHead = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc]);
  const middle = Buffer.from('middle', 'ascii');
  const tailPlain = Buffer.from([0xff, 0xd9, 0x01, 0x02]);
  const xorKey = 0x37;
  const header = Buffer.alloc(15);
  Buffer.from('07085631', 'hex').copy(header, 0);
  header.writeUInt32LE(plainHead.length, 6);
  header.writeUInt32LE(tailPlain.length, 10);
  header[14] = 1;
  const tail = Buffer.from(tailPlain.map(byte => byte ^ xorKey));
  const aesPlain = Buffer.concat([plainHead, Buffer.alloc(16, 16)]);
  const input = Buffer.concat([header, aesEcbEncrypt(aesPlain, key), middle, tail]);
  const expected = Buffer.concat([plainHead, middle, tailPlain]);
  return { input, expected, key, xorKey };
}

async function fixture(t, encoding = 'dat') {
  const root = await fs.mkdtemp(path.join(process.cwd(), '.runtime/indexed-image-'));
  const relativePath = 'media/image.dat';
  await fs.mkdir(path.join(root, 'media'), { mode: 0o700 });
  const dat = datFixture();
  const bytes = encoding === 'dat' ? dat.input : dat.expected;
  await fs.writeFile(path.join(root, relativePath), bytes, { mode: 0o600 });
  const entry = {
    kind: 'image', id: 'image-id', rendition: 'source', relativePath,
    encoding, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length,
    mimeType: 'image/jpeg', accountId: 'synthetic-account', conversationId: 'wxid_peer', messageId: 'msg-1'
  };
  await fs.writeFile(path.join(root, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId: 'synthetic-account', entries: [entry] }) + '\n', { mode: 0o600 });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, index: loadMediaIndex({ root, expectedAccountId: 'synthetic-account' }), entry, dat };
}

test('reads an explicitly encoded DAT image only with the configured in-process key', async t => {
  const f = await fixture(t);
  const decoded = await readIndexedImage(f.index, f.entry, { datKey: { aesKey: f.dat.key, xorKey: f.dat.xorKey } });
  assert.equal(decoded.mimeType, 'image/jpeg');
  assert.equal(decoded.decoded, true);
  assert.deepEqual(decoded.bytes, f.dat.expected);
  assert.equal(decoded.entry.sha256, f.entry.sha256);
  await assert.rejects(readIndexedImage(f.index, f.entry), /IMAGE_CACHE_DAT_KEY_UNAVAILABLE/);
});

test('fails closed for a wrong DAT key and keeps raw entries independent of DAT configuration', async t => {
  const dat = await fixture(t);
  await assert.rejects(readIndexedImage(dat.index, dat.entry, { datKey: { aesKey: Buffer.alloc(16), xorKey: dat.dat.xorKey } }), /IMAGE_CACHE_DAT_DECODE_FAILED/);
  const raw = await fixture(t, 'raw');
  const value = await readIndexedImage(raw.index, raw.entry);
  assert.equal(value.decoded, false);
  assert.deepEqual(value.bytes, raw.dat.expected);
});

test('media index rejects an unrecognized encoding marker', async t => {
  const f = await fixture(t, 'raw');
  const manifest = path.join(f.root, 'media-index.v1.json');
  const parsed = JSON.parse(await fs.readFile(manifest, 'utf8'));
  parsed.entries[0].encoding = 'native-dat';
  await fs.writeFile(manifest, JSON.stringify(parsed));
  assert.throws(() => loadMediaIndex({ root: f.root }), /MEDIA_INDEX_ENCODING_UNSUPPORTED/);
});

test('media index keeps DAT encoding restricted to image entries', async t => {
  const f = await fixture(t, 'raw');
  const manifest = path.join(f.root, 'media-index.v1.json');
  const parsed = JSON.parse(await fs.readFile(manifest, 'utf8'));
  parsed.entries[0].kind = 'voice';
  parsed.entries[0].encoding = 'dat';
  await fs.writeFile(manifest, JSON.stringify(parsed));
  assert.throws(() => loadMediaIndex({ root: f.root }), /MEDIA_INDEX_ENCODING_KIND_UNSUPPORTED/);
});
