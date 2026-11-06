'use strict';

const path = require('node:path');

const SESSION_PATTERN = /^[A-Za-z0-9_-]+$/;

function absoluteDirectory(value, code) {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value) || path.normalize(value) !== value || path.resolve(value) !== value || value.includes('\0')) {
    throw new Error(code);
  }
  return value;
}

function recoverySession(value) {
  const session = value ?? 'manual';
  if (typeof session !== 'string' || !SESSION_PATTERN.test(session)) throw new Error('RECOVERY_SESSION_INVALID');
  return session;
}

/**
 * Resolve the disposable runtime root used by the recovery bootstrap.
 * Development launches stay inside the project .runtime tree. Packaged
 * launches use Electron's userData parent so a copied app or read-only DMG
 * never needs to write into its own Contents directory.
 */
function resolveRuntimeRoot({ packaged, project, userData, session } = {}) {
  const safeProject = absoluteDirectory(project, 'RECOVERY_PROJECT_INVALID');
  const safeSession = recoverySession(session);
  if (packaged) {
    const safeUserData = absoluteDirectory(userData, 'RECOVERY_USER_DATA_INVALID');
    return path.join(safeUserData, 'recovery-runtime', safeSession);
  }
  const runtimeBase = path.join(safeProject, '.runtime');
  const runtimeRoot = path.join(runtimeBase, safeSession);
  if (!runtimeRoot.startsWith(`${runtimeBase}${path.sep}`)) throw new Error('RECOVERY_RUNTIME_INVALID');
  return runtimeRoot;
}

module.exports = { recoverySession, resolveRuntimeRoot };
