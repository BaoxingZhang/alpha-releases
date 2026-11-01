import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { decodeDatImage } = require('../packages/alpha-engine/media-decoder.cjs');

function aesEcbEncrypt(bytes, key) {
  const cipher = crypto.createCipheriv(`aes-${key.length * 8}-ecb`, key, null);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(bytes), cipher.final()]);
}

function v4Fixture() {
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
  return { input: Buffer.concat([header, aesEcbEncrypt(aesPlain, key), middle, tail]), key, expected: Buffer.concat([plainHead, middle, tailPlain]) };
}

test('decodes a bounded v4 AES/XOR image fixture without filesystem access', () => {
  const fixture = v4Fixture();
  const result = decodeDatImage(fixture.input, { aesKey: fixture.key, xorKey: 0x37 });
  assert.deepEqual(result.bytes, fixture.expected);
  assert.equal(result.ext, 'jpg');
  assert.equal(result.mimeType, 'image/jpeg');
  assert.equal(result.format, 'v4-1');
  assert.equal(result.aesLength, 16);
  assert.equal(result.xorLength, 4);
});

test('decodes legacy XOR image bytes and reports the inferred key', () => {
  const plain = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  const xorKey = 0x5a;
  const encrypted = Buffer.from(plain.map(byte => byte ^ xorKey));
  const result = decodeDatImage(encrypted);
  assert.deepEqual(result.bytes, plain);
  assert.equal(result.ext, 'png');
  assert.equal(result.xorKey, xorKey);
});

test('rejects malformed, oversized and unauthenticated media bytes', () => {
  assert.throws(() => decodeDatImage(Buffer.alloc(0)), /MEDIA_DECODE_INPUT_INVALID/);
  assert.throws(() => decodeDatImage(Buffer.from([1, 2, 3])), /MEDIA_DECODE_FORMAT_UNKNOWN/);
  const fixture = v4Fixture();
  assert.throws(() => decodeDatImage(fixture.input, { aesKey: fixture.key }), /MEDIA_DECODE_XOR_KEY_REQUIRED/);
  assert.throws(() => decodeDatImage(fixture.input, { aesKey: Buffer.alloc(16), xorKey: 0x37 }), /MEDIA_DECODE_FORMAT_UNKNOWN/);
  assert.throws(() => decodeDatImage(fixture.input, { aesKey: fixture.key, maxInputBytes: 4 }), /MEDIA_DECODE_INPUT_TOO_LARGE/);
  assert.throws(() => decodeDatImage(fixture.input, { aesKey: fixture.key, xorKey: 0x37, maxOutputBytes: 1 }), /MEDIA_DECODE_OUTPUT_TOO_LARGE/);
});
