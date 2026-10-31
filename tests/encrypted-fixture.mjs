import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import { createFixture as createPlainFixture } from './data-bridge-fixture.mjs';

const execute = promisify(execFile);
const PAGE_SIZE = 4096;
const RESERVE = 80;
const PAYLOAD_SIZE = PAGE_SIZE - RESERVE;
const KDF_ITERATIONS = 256000;
const DEFAULT_KEY_HEX = '00112233445566778899aabbccddeeff0123456789abcdeffedcba9876543210';
const nativeSource = new URL('./encrypted-fixture-native.c', import.meta.url);
const runtime = fileURLToPath(new URL('../.runtime/', import.meta.url));
let nativeBinaryPromise;
let helperDirectory;
process.once('exit', () => { if (helperDirectory) fsSync.rmSync(helperDirectory, { recursive: true, force: true }); });

function cleanAbsolute(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory || directory === path.parse(directory).root) throw new Error('Encrypted fixture requires an explicit clean absolute directory');
}
async function compileNative() {
  await fs.mkdir(runtime, { recursive: true });
  const directory = await fs.mkdtemp(path.join(runtime, 'encrypted-fixture-helper-'));
  helperDirectory = directory;
  const binary = path.join(directory, 'reserve-vacuum');
  try {
    await execute('/usr/bin/cc', [fileURLToPath(nativeSource), '-lsqlite3', '-o', binary]);
    return { binary, directory };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    helperDirectory = undefined;
    throw new Error(`ENCRYPTED_FIXTURE_SQLITE_HELPER_UNAVAILABLE: ${error.message}`);
  }
}
/** Remove the test-only helper once the caller has finished creating fixtures. */
export async function cleanupEncryptedFixtureHelper() {
  if (nativeBinaryPromise) await nativeBinaryPromise.catch(() => {});
  if (helperDirectory) await fs.rm(helperDirectory, { recursive: true, force: true });
  helperDirectory = undefined;
  nativeBinaryPromise = undefined;
}
async function nativeBinary() {
  if (!nativeBinaryPromise) nativeBinaryPromise = compileNative();
  return nativeBinaryPromise;
}
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function hmacSha512(key, ...parts) {
  const hmac = crypto.createHmac('sha512', key);
  for (const part of parts) hmac.update(part);
  return hmac.digest();
}
function le32(value) { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value, 0); return bytes; }
function keyBytes(keyHex) {
  if (typeof keyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('ENCRYPTED_FIXTURE_KEY_INVALID');
  return Buffer.from(keyHex, 'hex');
}
function deriveFixtureKeys(relative, keyHex) {
  const salt = crypto.createHash('sha256').update(`${relative}\0${keyHex}`).digest().subarray(0, 16);
  const inputKey = keyBytes(keyHex);
  const encryptionKey = crypto.pbkdf2Sync(inputKey, salt, KDF_ITERATIONS, 32, 'sha512');
  inputKey.fill(0);
  const hmacSalt = Buffer.from(salt);
  for (let i = 0; i < hmacSalt.length; i++) hmacSalt[i] ^= 0x3a;
  const macKey = crypto.pbkdf2Sync(encryptionKey, hmacSalt, 2, 32, 'sha512');
  return { salt, encryptionKey, macKey };
}
function encryptPage(page, pageNumber, relative, { salt, encryptionKey, macKey }) {
  if (page.length !== PAGE_SIZE || pageNumber < 1) throw new Error('ENCRYPTED_FIXTURE_PAGE_INVALID');
  const payload = pageNumber === 1 ? page.subarray(16, PAYLOAD_SIZE) : page.subarray(0, PAYLOAD_SIZE);
  const iv = hmacSha512(encryptionKey, Buffer.from('fixture-iv\0'), Buffer.from(relative), le32(pageNumber)).subarray(0, 16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
  cipher.setAutoPadding(false);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const mac = hmacSha512(macKey, ciphertext, iv, le32(pageNumber));
  return pageNumber === 1 ? Buffer.concat([salt, ciphertext, iv, mac]) : Buffer.concat([ciphertext, iv, mac]);
}
async function preparePlain(directory) {
  const helper = await nativeBinary();
  const files = [];
  async function visit(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile() && entry.name.endsWith('.db')) files.push(filename);
    }
  }
  await visit(directory);
  files.sort();
  if (files.length < 4) throw new Error('ENCRYPTED_FIXTURE_DATABASES_MISSING');
  for (const filename of files) await execute(helper.binary, [filename]);
  const manifests = [];
  for (const filename of files) {
    let bytes = Buffer.from(await fs.readFile(filename));
    if (bytes.length < PAGE_SIZE * 2 || bytes.length % PAGE_SIZE !== 0 || bytes[16] !== 0x10 || bytes[17] !== 0x00 || bytes[20] !== RESERVE) throw new Error(`ENCRYPTED_FIXTURE_LAYOUT_INVALID: ${filename}`);
    for (let offset = PAYLOAD_SIZE; offset < bytes.length; offset += PAGE_SIZE) bytes.fill(0, offset, offset + RESERVE);
    await fs.writeFile(filename, bytes);
    manifests.push({ relativePath: path.relative(directory, filename).split(path.sep).join('/'), plaintextSha256: sha256(bytes), pageCount: bytes.length / PAGE_SIZE, pageSize: PAGE_SIZE, reserve: RESERVE });
  }
  return manifests;
}
async function encryptDirectory(plain, encrypted, keyHex, manifests) {
  for (const manifest of manifests) {
    const source = path.join(plain, ...manifest.relativePath.split('/'));
    const target = path.join(encrypted, ...manifest.relativePath.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    const input = Buffer.from(await fs.readFile(source));
    const pages = [];
    const keys = deriveFixtureKeys(manifest.relativePath, keyHex);
    try {
      for (let pageNumber = 1; pageNumber <= manifest.pageCount; pageNumber++) pages.push(encryptPage(input.subarray((pageNumber - 1) * PAGE_SIZE, pageNumber * PAGE_SIZE), pageNumber, manifest.relativePath, keys));
    } finally { keys.encryptionKey.fill(0); keys.macKey.fill(0); }
    const output = Buffer.concat(pages);
    await fs.writeFile(target, output, { mode: 0o600 });
    manifest.ciphertextSha256 = sha256(output);
  }
}

/**
 * Create a reproducible SQLCipher 4 shaped fixture from the existing synthetic
 * SQLite layout. The plaintext copy is returned for hash/round-trip checks;
 * the encrypted copy is the directory passed to the snapshot importer.
 */
export async function createEncryptedFixture({ directory, keyHex = DEFAULT_KEY_HEX }) {
  cleanAbsolute(directory);
  const key = keyBytes(keyHex);
  key.fill(0);
  await fs.mkdir(directory, { recursive: true });
  if ((await fs.readdir(directory)).length !== 0) throw new Error('ENCRYPTED_FIXTURE_DIRECTORY_NOT_EMPTY');
  const plain = path.join(directory, 'plain');
  const encrypted = path.join(directory, 'encrypted');
  const expected = await createPlainFixture(plain);
  const manifests = await preparePlain(plain);
  await encryptDirectory(plain, encrypted, keyHex.toLowerCase(), manifests);
  const manifest = { format: 'sqlcipher4-fixture-v1', pageSize: PAGE_SIZE, reserve: RESERVE, kdf: 'PBKDF2-HMAC-SHA512', kdfIterations: KDF_ITERATIONS, hmac: 'HMAC-SHA512(ciphertext||iv||pageNoLE32)', hmacSaltMask: '3a', aes: 'AES-256-CBC/no-padding', files: manifests };
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
  return { sourceDir: encrypted, plaintextDir: plain, keyHex: keyHex.toLowerCase(), expected, manifest };
}
