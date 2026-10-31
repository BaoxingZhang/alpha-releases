import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launchEnvironment } from '../scripts/environment.mjs';

const require = createRequire(import.meta.url);
const { independentRuntime } = require('../packages/alpha-desktop/recovery-runtime.cjs');

test('independent HTTP settings cross both desktop environment boundaries', async () => {
  const previousToken = process.env.ALPHA_INDEPENDENT_HTTP_TOKEN;
  const previousPort = process.env.ALPHA_INDEPENDENT_HTTP_PORT;
  const token = 't'.repeat(32);
  process.env.ALPHA_INDEPENDENT_HTTP_TOKEN = token;
  process.env.ALPHA_INDEPENDENT_HTTP_PORT = '5031';
  try {
    const inherited = launchEnvironment('http-boundary', { backend: 'independent' });
    assert.equal(inherited.ALPHA_INDEPENDENT_HTTP_TOKEN, token);
    assert.equal(inherited.ALPHA_INDEPENDENT_HTTP_PORT, '5031');

    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-http-boundary-'));
    try {
      const workspace = path.join(temporary, 'workspace');
      const userData = path.join(temporary, 'user-data');
      await fs.mkdir(path.join(workspace, 'dist/app/packages/alpha-engine'), { recursive: true });
      await fs.mkdir(path.join(workspace, 'build/candidates'), { recursive: true });
      await fs.writeFile(path.join(workspace, 'dist/app/packages/alpha-engine/cli.cjs'), '#!/usr/bin/env node\n');
      await fs.writeFile(path.join(workspace, 'build/candidates/alpha-data-bridge'), 'bridge');
      const child = independentRuntime({ workspace, userData, execPath: process.execPath, environment: inherited });
      assert.equal(child.environment.ALPHA_INDEPENDENT_HTTP_TOKEN, token);
      assert.equal(child.environment.ALPHA_INDEPENDENT_HTTP_PORT, '5031');
      assert.equal(child.environment.ALPHA_RECOVERY_BACKEND, undefined);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  } finally {
    if (previousToken === undefined) delete process.env.ALPHA_INDEPENDENT_HTTP_TOKEN;
    else process.env.ALPHA_INDEPENDENT_HTTP_TOKEN = previousToken;
    if (previousPort === undefined) delete process.env.ALPHA_INDEPENDENT_HTTP_PORT;
    else process.env.ALPHA_INDEPENDENT_HTTP_PORT = previousPort;
  }
});

test('original backend drops independent HTTP settings', () => {
  const previousToken = process.env.ALPHA_INDEPENDENT_HTTP_TOKEN;
  const previousPort = process.env.ALPHA_INDEPENDENT_HTTP_PORT;
  process.env.ALPHA_INDEPENDENT_HTTP_TOKEN = 'o'.repeat(32);
  process.env.ALPHA_INDEPENDENT_HTTP_PORT = '5032';
  try {
    const inherited = launchEnvironment('original-boundary', { backend: 'original' });
    assert.equal(inherited.ALPHA_INDEPENDENT_HTTP_TOKEN, undefined);
    assert.equal(inherited.ALPHA_INDEPENDENT_HTTP_PORT, undefined);
  } finally {
    if (previousToken === undefined) delete process.env.ALPHA_INDEPENDENT_HTTP_TOKEN;
    else process.env.ALPHA_INDEPENDENT_HTTP_TOKEN = previousToken;
    if (previousPort === undefined) delete process.env.ALPHA_INDEPENDENT_HTTP_PORT;
    else process.env.ALPHA_INDEPENDENT_HTTP_PORT = previousPort;
  }
});
