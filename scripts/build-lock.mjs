import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const defaultLockPath = path.join(projectRoot, '.runtime', 'build-lock');
const defaultTimeoutMs = 30 * 60 * 1000;
const defaultPollIntervalMs = 100;
const defaultStaleAfterMs = 60 * 60 * 1000;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function error(code, details = '') {
  return new Error(`BUILD_LOCK_${code}${details ? ` ${details}` : ''}`);
}

function validateOptions(options) {
  const lockPath = options.lockPath ?? defaultLockPath;
  if (typeof lockPath !== 'string' || !path.isAbsolute(lockPath) || path.normalize(lockPath) !== lockPath || lockPath.includes('\0')) {
    throw error('PATH_INVALID');
  }
  const numbers = [
    ['timeoutMs', options.timeoutMs ?? defaultTimeoutMs],
    ['pollIntervalMs', options.pollIntervalMs ?? defaultPollIntervalMs],
    ['staleAfterMs', options.staleAfterMs ?? defaultStaleAfterMs]
  ];
  for (const [name, value] of numbers) {
    if (!Number.isSafeInteger(value) || value < 0) throw error(`${name.toUpperCase()}_INVALID`);
  }
  return {
    lockPath,
    timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
    pollIntervalMs: options.pollIntervalMs ?? defaultPollIntervalMs,
    staleAfterMs: options.staleAfterMs ?? defaultStaleAfterMs,
    name: typeof options.name === 'string' && options.name ? options.name : 'independent-build'
  };
}

function processAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (failure) {
    return failure?.code === 'EPERM';
  }
}

async function readState(lockPath) {
  let stat;
  try {
    stat = await fs.stat(lockPath);
  } catch (failure) {
    if (failure?.code === 'ENOENT') return null;
    throw failure;
  }
  let owner = null;
  try {
    owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch (failure) {
    if (failure?.code !== 'ENOENT' && failure?.name !== 'SyntaxError') throw failure;
  }
  return { owner, mtimeMs: stat.mtimeMs };
}

function isStale(state, staleAfterMs, now = Date.now()) {
  if (!state) return false;
  const age = Math.max(0, now - state.mtimeMs);
  if (state.owner && processAlive(state.owner.pid)) return false;
  if (state.owner && Number.isSafeInteger(state.owner.pid) && state.owner.pid > 0) return true;
  return age >= staleAfterMs;
}

async function removeStale(lockPath, expectedState) {
  const current = await readState(lockPath);
  if (!current || current.mtimeMs !== expectedState.mtimeMs || (current.owner?.token ?? null) !== (expectedState.owner?.token ?? null)) return false;
  await fs.rm(lockPath, { recursive: true, force: true });
  return true;
}

/**
 * Acquire the project-wide build lock.
 *
 * The directory creation is the atomic operation. The owner record is only
 * diagnostic and is never treated as an authorization token by callers.
 */
export async function acquireBuildLock(options = {}) {
  const settings = validateOptions(options);
  await fs.mkdir(path.dirname(settings.lockPath), { recursive: true, mode: 0o700 });
  const deadline = Date.now() + settings.timeoutMs;
  const token = crypto.randomUUID();
  const owner = {
    schema: 'alpha.recovered.build-lock.v1',
    token,
    pid: process.pid,
    name: settings.name,
    startedAt: new Date().toISOString()
  };
  for (;;) {
    try {
      await fs.mkdir(settings.lockPath, { mode: 0o700 });
      try {
        await fs.writeFile(path.join(settings.lockPath, 'owner.json'), JSON.stringify(owner) + '\n', { flag: 'wx', mode: 0o600 });
      } catch (failure) {
        await fs.rm(settings.lockPath, { recursive: true, force: true });
        throw failure;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        const current = await readState(settings.lockPath);
        if (!current || current.owner?.token !== token) return;
        await fs.rm(settings.lockPath, { recursive: true, force: true });
      };
    } catch (failure) {
      if (failure?.code !== 'EEXIST') throw failure;
      const state = await readState(settings.lockPath);
      if (isStale(state, settings.staleAfterMs)) {
        await removeStale(settings.lockPath, state);
        continue;
      }
      if (Date.now() >= deadline) throw error('TIMEOUT', settings.lockPath);
      await sleep(settings.pollIntervalMs);
    }
  }
}

export const BUILD_LOCK_DEFAULT_PATH = defaultLockPath;

