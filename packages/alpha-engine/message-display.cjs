'use strict';

const MAX_UINT64 = (1n << 64n) - 1n;
const DISPLAY_KEYS = new Set(['kind', 'title', 'description', 'sourceName', 'fileName', 'fileSize', 'fileExtension', 'displayUrl', 'linkUrl', 'location']);
const TEXT_KEYS = new Set(['title', 'description', 'sourceName', 'fileName']);

function invalid() {
  throw new Error('BRIDGE_MESSAGE_DISPLAY_INVALID');
}

function object(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function plain(value, maximum = 2048) {
  return typeof value === 'string' && value.length <= maximum && !value.includes('\0');
}

function checkedURL(value, kind) {
  if (typeof value !== 'string' || value.length > 4096) invalid();
  if (kind === 'link' && /[\u0000-\u0020\u007f]/.test(value)) invalid();
  let parsed;
  try { parsed = new URL(value); } catch { invalid(); }
  if (parsed.username || parsed.password) invalid();
  if (kind === 'display') {
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) invalid();
  } else {
    if (parsed.protocol !== 'https:') invalid();
    for (const key of parsed.searchParams.keys()) if (/^(aes_?key|cdn_?url|encrypt_?url)$/i.test(key)) invalid();
  }
  return value;
}

// Keep this aligned with src/main/index.js projectDisplay for fields emitted
// by the independent Go bridge. It returns a fresh object so a bridge cannot
// smuggle extra keys into protobuf displayJson or JSON exports.
function validateMessageDisplay(value) {
  if (!object(value) || typeof value.kind !== 'string' || value.kind.length > 64 || value.kind.includes('\0')) invalid();
  for (const key of Object.keys(value)) if (!DISPLAY_KEYS.has(key)) invalid();
  const output = { kind: value.kind };
  for (const key of TEXT_KEYS) {
    if (value[key] !== undefined) {
      if (!plain(value[key])) invalid();
      output[key] = value[key];
    }
  }
  if (value.fileSize !== undefined) {
    if (typeof value.fileSize !== 'string' || !/^\d{1,20}$/.test(value.fileSize)) invalid();
    try { if (BigInt(value.fileSize) > MAX_UINT64) invalid(); } catch { invalid(); }
    output.fileSize = value.fileSize;
  }
  if (value.fileExtension !== undefined) {
    if (typeof value.fileExtension !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(value.fileExtension)) invalid();
    output.fileExtension = value.fileExtension;
  }
  if (value.displayUrl !== undefined) output.displayUrl = checkedURL(value.displayUrl, 'display');
  if (value.linkUrl !== undefined) output.linkUrl = checkedURL(value.linkUrl, 'link');
  if (value.location !== undefined) {
    const location = value.location;
    if (!object(location) || typeof location.latitude !== 'number' || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90 || typeof location.longitude !== 'number' || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180 || !plain(location.label)) invalid();
    output.location = { latitude: location.latitude, longitude: location.longitude, label: location.label };
  }
  const encoded = Buffer.from(JSON.stringify(output), 'utf8');
  if (encoded.length > 64 * 1024) invalid();
  return { value: output, bytes: encoded };
}

module.exports = { validateMessageDisplay };
