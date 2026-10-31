'use strict';
// Independent application access lock. It does not encrypt source databases,
// implement the original vault, or grant any original Alpha entitlement.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const KDF = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function failure(code) { return new Error(code); }
function directorySafe(directory) {
  if (!path.isAbsolute(directory)) throw failure('APP_LOCK_STATE_PATH_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const st = fs.lstatSync(current);
    if (st.isSymbolicLink() || !st.isDirectory()) throw failure('APP_LOCK_STATE_PATH_INVALID');
  }
}
function passwordBytes(value, fresh = false) {
  if (!(value instanceof Uint8Array) || value.byteLength > 1024) throw failure('APP_LOCK_PASSWORD_INVALID_CHARACTERS');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(value).normalize('NFC'); }
  catch { throw failure('APP_LOCK_PASSWORD_INVALID_CHARACTERS'); }
  if (text.length > 256) throw failure('APP_LOCK_PASSWORD_TOO_LONG');
  if (text.length < (fresh ? 8 : 1)) throw failure(fresh ? 'APP_LOCK_PASSWORD_TOO_SHORT' : 'APP_LOCK_PASSWORD_INCORRECT');
  return Buffer.from(text, 'utf8');
}
async function derive(value, salt, fresh = false) {
  const bytes = passwordBytes(value, fresh);
  try { return await scrypt(bytes, salt, 32, KDF); }
  finally { bytes.fill(0); }
}
async function createSecurity({ stateDir }) {
  directorySafe(stateDir);
  const filename = path.join(stateDir, 'password-lock.v1.json');
  let record = { version: 1, enabled: false, attempts: 0, retryAt: 0 };
  let exists = false;
  let filePresent = false;
  try { fs.lstatSync(filename); filePresent = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (filePresent) {
    const fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > 4096 || (stat.mode & 0o077)) throw failure('APP_LOCK_STATE_INVALID');
      record = JSON.parse(fs.readFileSync(fd, 'utf8'));
    } finally { fs.closeSync(fd); }
    exists = true;
    if (record.version !== 1 || typeof record.enabled !== 'boolean' || !Number.isSafeInteger(record.attempts) || record.attempts < 0 || record.attempts > 100000 || !Number.isSafeInteger(record.retryAt) || record.retryAt < 0 || (record.enabled && (!/^[a-f0-9]{32}$/.test(record.salt) || !/^[a-f0-9]{64}$/.test(record.hash)))) throw failure('APP_LOCK_STATE_INVALID');
  }
  let locked = record.enabled;
  let invalid = false;
  let busy = false;
  let identity = exists ? fs.lstatSync(filename, { bigint: true }) : null;
  function guard() {
    try {
      directorySafe(stateDir);
      if (exists) {
        const st = fs.lstatSync(filename, { bigint: true });
        if (!st.isFile() || st.isSymbolicLink() || (st.mode & 0o077n) || ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].some(key => st[key] !== identity[key])) throw failure('APP_LOCK_STATE_INVALID');
      } else {
        try { fs.lstatSync(filename); throw failure('APP_LOCK_STATE_INVALID'); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
    } catch { invalid = true; }
    if (invalid) throw failure('APP_LOCK_STATE_INVALID');
  }
  function save(next) {
    guard();
    const temporary = path.join(stateDir, `.password-lock-${crypto.randomUUID()}`);
    let fd;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify(next) + '\n');
      fs.fsyncSync(fd);
      fs.closeSync(fd); fd = undefined;
      fs.renameSync(temporary, filename);
      const dir = fs.openSync(stateDir, fs.constants.O_RDONLY);
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
      record = next; exists = true; identity = fs.lstatSync(filename, { bigint: true });
    } catch (e) { invalid = true; throw failure('APP_LOCK_STATE_WRITE_FAILED'); }
    finally { if (fd !== undefined) fs.closeSync(fd); fs.rmSync(temporary, { force: true }); }
  }
  function status() {
    guard();
    return { detected: true, usable: true, enabled: record.enabled, verified: record.enabled && !locked,
      locked, availability: record.enabled ? 4 : 3, hardwareProtection: 1,
      provider: 'alpha-independent-password-v1', errorCode: '', helloConfigured: false,
      helloAvailable: false, passwordConfigured: record.enabled,
      passwordRetryAfterMs: BigInt(Math.max(0, record.retryAt - Date.now())), passwordFailedAttempts: record.attempts };
  }
  async function exclusive(fn) {
    guard();
    if (busy) throw failure('APP_LOCK_BUSY');
    busy = true;
    try { return await fn(); } finally { busy = false; }
  }
  async function verify(password) {
    if (Date.now() < record.retryAt) throw failure('APP_LOCK_PASSWORD_THROTTLED');
    let actual;
    try {
      actual = await derive(password, Buffer.from(record.salt, 'hex'));
      if (crypto.timingSafeEqual(actual, Buffer.from(record.hash, 'hex'))) return;
    } finally { actual?.fill(0); }
    const attempts = Math.min(100000, record.attempts + 1);
    save({ ...record, attempts, retryAt: Date.now() + Math.min(60000, 1000 * 2 ** Math.min(attempts - 1, 6)) });
    throw failure('APP_LOCK_PASSWORD_INCORRECT');
  }
  return {
    status,
    assertAccess() { guard(); if (locked || busy) throw failure('APP_LOCK_LOCKED'); },
    lock() { guard(); if (busy) throw failure('APP_LOCK_BUSY'); if (!record.enabled) throw failure('APP_LOCK_NOT_ENABLED'); locked = true; return status(); },
    unlock(password) { return exclusive(async () => {
      if (!record.enabled) throw failure('APP_LOCK_NOT_ENABLED');
      await verify(password);
      save({ ...record, attempts: 0, retryAt: 0 }); locked = false;
      return status();
    }); },
    configure({ action, password = new Uint8Array(), newPassword = new Uint8Array() }) { return exclusive(async () => {
      if (!['enable_password', 'change_password', 'disable'].includes(action)) throw failure('APP_LOCK_ACTION_UNSUPPORTED');
      if (action === 'enable_password' && record.enabled) throw failure('APP_LOCK_ALREADY_ENABLED');
      if (action !== 'enable_password') {
        if (!record.enabled) throw failure('APP_LOCK_NOT_ENABLED');
        await verify(password);
      }
      if (action === 'disable') save({ version: 1, enabled: false, attempts: 0, retryAt: 0 });
      else {
        const salt = crypto.randomBytes(16);
        const hash = await derive(newPassword, salt, true);
        try { save({ version: 1, enabled: true, salt: salt.toString('hex'), hash: hash.toString('hex'), attempts: 0, retryAt: 0 }); }
        finally { hash.fill(0); }
      }
      locked = false;
      return status();
    }); }
  };
}
module.exports = { createSecurity };
