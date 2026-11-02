'use strict';

// Reads one caller-owned image-index entry and, when explicitly declared,
// decodes its DAT container. This module deliberately keeps the manifest hash
// bound to the stored bytes: a decoded image is a derived view and does not
// become a native media token or a new manifest identity.

const { readMediaEntry } = require('./media-index.cjs');
const { decodeDatImage } = require('./media-decoder.cjs');

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const IMAGE_HEADERS = Object.freeze({
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/gif': Buffer.from('GIF', 'ascii'),
  'image/webp': Buffer.from('RIFF', 'ascii'),
  'image/bmp': Buffer.from('BM', 'ascii')
});

function fail(code) {
  throw new Error(code);
}

function validDatKey(value) {
  return value && Number.isInteger(value.xorKey) && value.xorKey >= 0 && value.xorKey <= 255 &&
    (Buffer.isBuffer(value.aesKey) || value.aesKey instanceof Uint8Array) &&
    [16, 24, 32].includes(value.aesKey.byteLength);
}

function verifyImageBytes(bytes, declaredMime, decoderMime) {
  const mimeType = declaredMime || decoderMime || '';
  const header = IMAGE_HEADERS[mimeType];
  if (!header || !Buffer.isBuffer(bytes) || bytes.length < header.length) fail('IMAGE_CACHE_FORMAT_INVALID');
  if (mimeType === 'image/gif') {
    const signature = bytes.subarray(0, 6).toString('ascii');
    if (signature !== 'GIF87a' && signature !== 'GIF89a') fail('IMAGE_CACHE_FORMAT_INVALID');
  } else if (mimeType === 'image/webp') {
    if (bytes.length < 12 || bytes.subarray(8, 12).toString('ascii') !== 'WEBP') fail('IMAGE_CACHE_FORMAT_INVALID');
  } else if (!bytes.subarray(0, header.length).equals(header)) {
    fail('IMAGE_CACHE_FORMAT_INVALID');
  }
  return mimeType;
}

function maxBytes(value) {
  if (value === undefined) return DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(value) || value < 1 || value > DEFAULT_MAX_BYTES) fail('IMAGE_CACHE_LIMIT_INVALID');
  return value;
}

async function readIndexedImage(index, entry, { datKey, maxBytes: requestedMaxBytes } = {}) {
  if (!entry || entry.kind !== 'image') fail('IMAGE_CACHE_ENTRY_INVALID');
  const limit = maxBytes(requestedMaxBytes);
  const stored = await readMediaEntry(index, entry, { maxBytes: limit });
  let bytes = stored.bytes;
  let decoderMime = '';
  if (entry.encoding === 'dat') {
    if (!validDatKey(datKey)) fail('IMAGE_CACHE_DAT_KEY_UNAVAILABLE');
    try {
      const decoded = decodeDatImage(bytes, {
        aesKey: Buffer.from(datKey.aesKey),
        xorKey: datKey.xorKey,
        maxInputBytes: limit,
        maxOutputBytes: limit
      });
      bytes = decoded.bytes;
      decoderMime = decoded.mimeType || '';
    } catch (failure) {
      if (failure instanceof Error && failure.message === 'MEDIA_DECODE_OUTPUT_TOO_LARGE') fail('IMAGE_CACHE_DAT_TOO_LARGE');
      fail('IMAGE_CACHE_DAT_DECODE_FAILED');
    }
  }
  if (bytes.length === 0 || bytes.length > limit) fail('IMAGE_CACHE_TOO_LARGE');
  const mimeType = verifyImageBytes(bytes, stored.entry.mimeType, decoderMime);
  return { entry: stored.entry, bytes, mimeType, decoded: entry.encoding === 'dat' };
}

module.exports = { DEFAULT_MAX_BYTES, readIndexedImage, verifyImageBytes };
