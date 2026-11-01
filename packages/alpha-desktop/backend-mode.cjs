'use strict';

// Keep backend selection in one small, dependency-free module. The main
// process still owns Electron lifecycle and process spawning; this module only
// answers which explicitly selected backend is allowed to run.
function isIndependentBackendEnabled({ isPackaged }, environment = {}) {
  return environment.ALPHA_RECOVERY_BACKEND === 'independent'
    && (!isPackaged || environment.ALPHA_INDEPENDENT_PACKAGED === '1');
}

function isIndependentFixtureEnabled(app, environment = {}) {
  return isIndependentBackendEnabled(app, environment)
    && environment.ALPHA_INDEPENDENT_AGENT === 'fixture';
}

module.exports = Object.freeze({ isIndependentBackendEnabled, isIndependentFixtureEnabled });
