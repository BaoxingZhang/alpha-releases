'use strict';

// This module is an independent, bounded decoder for caller-supplied WeChat
// image bytes. v4 decoding requires caller-supplied AES and XOR keys; legacy
// DAT decoding infers its XOR key from an image magic header. It does not
// locate media, acquire keys, access a WeChat process, or fetch a CDN URL. The
// v4 container layout is corroborated by the vendored Apache-2.0 Chatlog
// reference under vendor/chatlog/pkg/util/dat2img; no Chatlog code or runtime
// dependency is imported here.

const crypto = require('node:crypto');

const MAX_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const V4_HEADERS = new Map([
  ['07085631', 'v4-1'],
  ['07085632', 'v4-2']
]);
const IMAGE_FORMATS = Object.freeze([
  Object.freeze({ ext: 'jpg', mimeType: 'image/jpeg', header: Buffer.from([0xff, 0xd8, 0xff]) }),
  Object.freeze({ ext: 'png', mimeType: 'image/png', header: Buffer.from([0x89, 0x50, 0x4e, 0x47]) }),
  Object.freeze({ ext: 'gif', mimeType: 'image/gif', header: Buffer.from([0x47, 0x49, 0x46, 0x38]) }),
  Object.freeze({ ext: 'tiff', mimeType: 'image/tiff', header: Buffer.from([0x49, 0x49, 0x2a, 0x00]) }),
  Object.freeze({ ext: 'bmp', mimeType: 'image/bmp', header: Buffer.from([0x42, 0x4d]) }),
  Object.freeze({ ext: 'wxgf', mimeType: 'image/x-wxgf', header: Buffer.from([0x77, 0x78, 0x67, 0x66]) })
]);

function fail(code) {
  throw new Error(code);
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  fail('MEDIA_DECODE_INPUT_INVALID');
}

function boundedLimit(value, fallback, code) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_OUTPUT_BYTES) fail(code);
  return value;
}

function formatOf(bytes) {
  for (const format of IMAGE_FORMATS) {
    if (bytes.length >= format.header.length && bytes.subarray(0, format.header.length).equals(format.header)) return format;
  }
  return null;
}

function xorImage(bytes, xorKey, maxOutputBytes) {
  if (bytes.length > maxOutputBytes) fail('MEDIA_DECODE_OUTPUT_TOO_LARGE');
  let key = xorKey;
  let format = null;
  if (key !== undefined) {
    if (!Number.isInteger(key) || key < 0 || key > 255) fail('MEDIA_DECODE_XOR_KEY_INVALID');
    const probe = Buffer.from(bytes.subarray(0, Math.min(bytes.length, 16)));
    for (const candidate of IMAGE_FORMATS) {
      if (probe.length < candidate.header.length) continue;
      let matches = true;
      const candidateKey = probe[0] ^ candidate.header[0];
      if (candidateKey !== key) continue;
      for (let i = 0; i < candidate.header.length; i++) {
        if ((probe[i] ^ key) !== candidate.header[i]) { matches = false; break; }
      }
      if (matches) { format = candidate; break; }
    }
    if (!format) fail('MEDIA_DECODE_FORMAT_UNKNOWN');
  } else {
    for (const candidate of IMAGE_FORMATS) {
      if (bytes.length < candidate.header.length) continue;
      const candidateKey = bytes[0] ^ candidate.header[0];
      let matches = true;
      for (let i = 0; i < candidate.header.length; i++) {
        if ((bytes[i] ^ candidateKey) !== candidate.header[i]) { matches = false; break; }
      }
      if (matches) { key = candidateKey; format = candidate; break; }
    }
    if (!format) fail('MEDIA_DECODE_FORMAT_UNKNOWN');
  }
  const output = Buffer.allocUnsafe(bytes.length);
  for (let i = 0; i < bytes.length; i++) output[i] = bytes[i] ^ key;
  return { bytes: output, ext: format.ext, mimeType: format.mimeType, format: 'legacy-xor', xorKey: key };
}

function decryptEcb(ciphertext, key) {
  if (![16, 24, 32].includes(key.length)) fail('MEDIA_DECODE_AES_KEY_INVALID');
  if (ciphertext.length === 0) return Buffer.alloc(0);
  if (ciphertext.length % 16 !== 0) fail('MEDIA_DECODE_AES_BLOCK_INVALID');
  const algorithm = `aes-${key.length * 8}-ecb`;
  const decipher = crypto.createDecipheriv(algorithm, key, null);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function decodeV4(bytes, { aesKey, xorKey, maxOutputBytes }) {
  if (bytes.length < 15) fail('MEDIA_DECODE_TRUNCATED');
  if (!(aesKey instanceof Uint8Array) || ![16, 24, 32].includes(aesKey.byteLength)) fail('MEDIA_DECODE_AES_KEY_REQUIRED');
  if (xorKey === undefined) fail('MEDIA_DECODE_XOR_KEY_REQUIRED');
  if (!Number.isInteger(xorKey) || xorKey < 0 || xorKey > 255) fail('MEDIA_DECODE_XOR_KEY_INVALID');
  const aesLength = bytes.readUInt32LE(6);
  const xorLength = bytes.readUInt32LE(10);
  const payload = bytes.subarray(15);
  if (aesLength > payload.length || xorLength > payload.length || aesLength + xorLength > payload.length) fail('MEDIA_DECODE_LENGTH_INVALID');
  // The v4 container stores the AES section with one complete block beyond
  // the declared plaintext length (the reference implementation removes the
  // padding block after decryption). Keep that layout explicit rather than
  // silently accepting a shorter ciphertext.
  const aesCipherLength = aesLength === 0 ? 0 : Math.floor(aesLength / 16) * 16 + 16;
  if (aesCipherLength > payload.length - xorLength) fail('MEDIA_DECODE_LENGTH_INVALID');
  const middleStart = aesCipherLength;
  const middleEnd = payload.length - xorLength;
  const outputLength = aesLength + Math.max(0, middleEnd - middleStart) + xorLength;
  if (outputLength > maxOutputBytes) fail('MEDIA_DECODE_OUTPUT_TOO_LARGE');
  const decrypted = decryptEcb(payload.subarray(0, aesCipherLength), Buffer.from(aesKey));
  const head = decrypted.subarray(0, aesLength);
  const tail = payload.subarray(middleEnd);
  const output = Buffer.allocUnsafe(outputLength);
  let offset = 0;
  head.copy(output, offset); offset += head.length;
  payload.subarray(middleStart, middleEnd).copy(output, offset); offset += Math.max(0, middleEnd - middleStart);
  const key = xorKey;
  for (const byte of tail) output[offset++] = byte ^ key;
  const format = formatOf(output);
  if (!format) fail('MEDIA_DECODE_FORMAT_UNKNOWN');
  return { bytes: output, ext: format.ext, mimeType: format.mimeType, format: V4_HEADERS.get(bytes.subarray(0, 4).toString('hex')), xorKey: key, aesLength, xorLength };
}

function decodeDatImage(input, { aesKey, xorKey, maxInputBytes = MAX_INPUT_BYTES, maxOutputBytes = MAX_OUTPUT_BYTES } = {}) {
  if (!Number.isSafeInteger(maxInputBytes) || maxInputBytes < 1 || maxInputBytes > MAX_INPUT_BYTES) fail('MEDIA_DECODE_LIMIT_INVALID');
  const maximumOutput = boundedLimit(maxOutputBytes, MAX_OUTPUT_BYTES, 'MEDIA_DECODE_LIMIT_INVALID');
  const bytes = asBuffer(input);
  if (bytes.length === 0 || bytes.length > maxInputBytes) fail(bytes.length === 0 ? 'MEDIA_DECODE_INPUT_INVALID' : 'MEDIA_DECODE_INPUT_TOO_LARGE');
  const header = bytes.length >= 4 ? V4_HEADERS.get(bytes.subarray(0, 4).toString('hex')) : undefined;
  if (header) return decodeV4(bytes, { aesKey, xorKey, maxOutputBytes: maximumOutput });
  return xorImage(bytes, xorKey, maximumOutput);
}

module.exports = {
  IMAGE_FORMATS,
  MAX_INPUT_BYTES,
  MAX_OUTPUT_BYTES,
  decodeDatImage
};
