'use strict';
// Explicit development backend selection. No original native component is
// invoked or impersonated by this adapter.
const fs = require('node:fs');
const path = require('node:path');
function regularFile(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('INDEPENDENT_RUNTIME_FILE_INVALID');
  return filename;
}
function independentRuntime({ workspace, appPath = undefined, userData, execPath, environment, packaged = false, resourcesPath = undefined }) {
  const executable = regularFile(execPath);
  // Development keeps the recovered packages in the editable workspace. A
  // packaged app cannot execute files from app.asar, so its independent
  // runtime is copied to Resources/independent by the build/packaging step.
  // Keep this layout explicit instead of silently falling back to the native
  // Alpha binaries when the packaged payload is incomplete.
  let root = workspace;
  let entry;
  let bridge;
  if (packaged) {
    if (typeof resourcesPath !== 'string' || !path.isAbsolute(resourcesPath)) throw new Error('INDEPENDENT_RESOURCES_PATH_INVALID');
    const candidates = [
      // External Resources/independent layout for asar-safe packaging.
      { root: path.join(resourcesPath, 'independent'), packageRoot: path.join(resourcesPath, 'independent') },
      // The development build's self-contained app/independent layout. This
      // remains useful for packagers that copy app.asar contents verbatim.
      ...(typeof appPath === 'string' && path.isAbsolute(appPath) ? [{ root: path.join(appPath, 'independent'), packageRoot: path.join(appPath, 'independent', 'packages') }] : [])
    ];
    let lastError;
    for (const candidate of candidates) {
      try {
        const candidateEntry = regularFile(path.join(candidate.packageRoot, 'alpha-engine', 'cli.cjs'));
        const candidateBridge = regularFile(path.join(candidate.root, 'bin', process.platform === 'win32' ? 'alpha-data-bridge.exe' : 'alpha-data-bridge'));
        root = candidate.root;
        entry = candidateEntry;
        bridge = candidateBridge;
        break;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        lastError = error;
      }
    }
    if (!entry || !bridge) throw lastError ?? new Error('INDEPENDENT_RUNTIME_PAYLOAD_MISSING');
  } else {
    entry = regularFile(path.join(root, 'dist/app/packages/alpha-engine/cli.cjs'));
    bridge = regularFile(path.join(root, 'build/candidates/alpha-data-bridge'));
  }
  const stateDir = path.join(userData, 'independent');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const env = { ...environment };
  for (const name of Object.keys(env)) if (/^ALPHA_|^ELECTRON_|^NODE_OPTIONS$|^NODE_PATH$/i.test(name)) delete env[name];
  Object.assign(env, {
    ELECTRON_RUN_AS_NODE: '1',
    ALPHA_INDEPENDENT_BRIDGE_PATH: bridge,
    ALPHA_INDEPENDENT_STATE_DIR: stateDir,
    ALPHA_INDEPENDENT_DATA_DIR: environment.ALPHA_INDEPENDENT_DATA_DIR || '',
    ALPHA_INDEPENDENT_ENCRYPTED_DIR: environment.ALPHA_INDEPENDENT_ENCRYPTED_DIR || '',
    ALPHA_INDEPENDENT_IMPORTER_PATH: environment.ALPHA_INDEPENDENT_IMPORTER_PATH || (packaged
      ? path.join(root, 'bin', process.platform === 'win32' ? 'alpha-snapshot-import.exe' : 'alpha-snapshot-import')
      : path.join(workspace, 'build/candidates/alpha-snapshot-import')),
    ALPHA_INDEPENDENT_ACCOUNT_ID: environment.ALPHA_INDEPENDENT_ACCOUNT_ID || '',
    // These values were explicitly validated by scripts/environment.mjs and
    // must survive the Electron-to-engine environment boundary for the
    // optional local read-only HTTP/MCP adapter.
    ...(environment.ALPHA_INDEPENDENT_HTTP_TOKEN !== undefined ? { ALPHA_INDEPENDENT_HTTP_TOKEN: environment.ALPHA_INDEPENDENT_HTTP_TOKEN } : {}),
    ...(environment.ALPHA_INDEPENDENT_HTTP_PORT !== undefined ? { ALPHA_INDEPENDENT_HTTP_PORT: environment.ALPHA_INDEPENDENT_HTTP_PORT } : {})
  });
  return { executable, args: [entry], cwd: root, environment: env };
}
module.exports = { independentRuntime };
