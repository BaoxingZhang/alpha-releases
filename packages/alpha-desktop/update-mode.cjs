'use strict';

const fs = require('node:fs');
const path = require('node:path');

const UPDATE_MODE_FILE = 'alpha-update-mode.json';
const SCHEMA = 'alpha.recovered.update-mode.v1';

function disabled(reason = 'independent-update-policy-not-configured') {
  return Object.freeze({ schema: SCHEMA, mode: 'disabled', reason });
}

function normalizeIndependentUpdateMode(value) {
  if (!value || value.schema !== SCHEMA || !['disabled', 'configured'].includes(value.mode)) return disabled('independent-update-marker-invalid');
  if (value.mode === 'disabled') return disabled(typeof value.reason === 'string' && value.reason ? value.reason : undefined);
  const config = value.config;
  if (!config || typeof config !== 'object' || Array.isArray(config)) return disabled('independent-update-config-invalid');
  if (typeof config.publicKey !== 'string' || typeof config.policyUrl !== 'string' || typeof config.channel !== 'string') return disabled('independent-update-config-invalid');
  return Object.freeze({ schema: SCHEMA, mode: 'configured', config: Object.freeze({
    publicKey: config.publicKey,
    policyUrl: config.policyUrl,
    channel: config.channel,
    ...(typeof config.mirrorBaseUrl === 'string' ? { mirrorBaseUrl: config.mirrorBaseUrl } : {})
  }) });
}

function readIndependentUpdateMode(resourcesPath) {
  if (typeof resourcesPath !== 'string' || !path.isAbsolute(resourcesPath)) return disabled();
  let value;
  try {
    value = JSON.parse(fs.readFileSync(path.join(resourcesPath, UPDATE_MODE_FILE), 'utf8'));
  } catch {
    return disabled('independent-update-marker-missing');
  }
  return normalizeIndependentUpdateMode(value);
}

module.exports = Object.freeze({ UPDATE_MODE_FILE, SCHEMA, normalizeIndependentUpdateMode, readIndependentUpdateMode });
