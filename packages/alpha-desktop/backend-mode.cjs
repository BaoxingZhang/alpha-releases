'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PACKAGED_MODE_FILE = 'alpha-backend-mode.json';

// Keep backend selection in one small, filesystem-backed module. The main
// process still owns Electron lifecycle and process spawning; this module only
// reads the packaged marker and answers which explicitly selected backend is
// allowed to run.
function isIndependentBackendEnabled({ isPackaged }, environment = {}) {
  return environment.ALPHA_RECOVERY_BACKEND === 'independent'
    && (!isPackaged || environment.ALPHA_INDEPENDENT_PACKAGED === '1');
}

function isIndependentFixtureEnabled(app, environment = {}) {
  return isIndependentBackendEnabled(app, environment)
    && environment.ALPHA_INDEPENDENT_AGENT === 'fixture';
}

function readPackagedBackendMode(resourcesPath) {
  if (typeof resourcesPath !== 'string' || !path.isAbsolute(resourcesPath)) return '';
  try {
    const value = JSON.parse(fs.readFileSync(path.join(resourcesPath, PACKAGED_MODE_FILE), 'utf8'));
    if (!value || value.schema !== 'alpha.recovered.backend-mode.v1' || !['original', 'independent'].includes(value.backend)) return '';
    return value.backend;
  } catch {
    return '';
  }
}

function applyPackagedBackendMode(resourcesPath, environment = process.env) {
  const mode = readPackagedBackendMode(resourcesPath);
  if (!mode || !environment || typeof environment !== 'object') return mode;
  environment.ALPHA_RECOVERY_BACKEND = mode;
  if (mode === 'independent') environment.ALPHA_INDEPENDENT_PACKAGED = '1';
  else delete environment.ALPHA_INDEPENDENT_PACKAGED;
  return mode;
}

module.exports = Object.freeze({
  PACKAGED_MODE_FILE,
  isIndependentBackendEnabled,
  isIndependentFixtureEnabled,
  readPackagedBackendMode,
  applyPackagedBackendMode
});
