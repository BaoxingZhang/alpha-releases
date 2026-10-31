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
function independentRuntime({ workspace, userData, execPath, environment }) {
  const executable = regularFile(execPath);
  const entry = regularFile(path.join(workspace, 'dist/app/packages/alpha-engine/cli.cjs'));
  const bridge = regularFile(path.join(workspace, 'build/candidates/alpha-data-bridge'));
  const stateDir = path.join(userData, 'independent');
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const env = { ...environment };
  for (const name of Object.keys(env)) if (/^ALPHA_|^ELECTRON_|^NODE_OPTIONS$|^NODE_PATH$/i.test(name)) delete env[name];
  Object.assign(env, {
    ELECTRON_RUN_AS_NODE: '1',
    ALPHA_INDEPENDENT_BRIDGE_PATH: bridge,
    ALPHA_INDEPENDENT_STATE_DIR: stateDir,
    ALPHA_INDEPENDENT_DATA_DIR: environment.ALPHA_INDEPENDENT_DATA_DIR || '',
    ALPHA_INDEPENDENT_ACCOUNT_ID: environment.ALPHA_INDEPENDENT_ACCOUNT_ID || ''
  });
  return { executable, args: [entry], environment: env };
}
module.exports = { independentRuntime };
