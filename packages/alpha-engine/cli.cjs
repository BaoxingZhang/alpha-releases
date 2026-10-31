#!/usr/bin/env node
'use strict';
const { createSecurity } = require('../alpha-security/index.cjs');
const { createEngine, runStdio } = require('./index.cjs');
(async () => {
  const stateDir = process.env.ALPHA_INDEPENDENT_STATE_DIR;
  if (!stateDir) throw new Error('ENGINE_STATE_PATH_REQUIRED');
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath: process.env.ALPHA_INDEPENDENT_BRIDGE_PATH, importerPath: process.env.ALPHA_INDEPENDENT_IMPORTER_PATH || '', encryptedDir: process.env.ALPHA_INDEPENDENT_ENCRYPTED_DIR || '', dataDir: process.env.ALPHA_INDEPENDENT_DATA_DIR || '', accountId: process.env.ALPHA_INDEPENDENT_ACCOUNT_ID || '', selfUsername: process.env.ALPHA_INDEPENDENT_SELF_USERNAME || '' });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { engine.close().finally(() => process.exit(signal === 'SIGINT' ? 130 : 143)); });
  const outcome = await runStdio(engine);
  if (outcome.failed) process.exitCode = 1;
})().catch(failure => { process.stderr.write(`${/^[A-Z][A-Z0-9_]{1,95}$/.test(failure.message || '') ? failure.message : 'ENGINE_INITIALIZATION_FAILED'}\n`); process.exitCode = 1; });
