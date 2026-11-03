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

test('independent runtime never forwards the original Alpha update channel', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-update-boundary-'));
  try {
    const workspace = path.join(temporary, 'workspace');
    await fs.mkdir(path.join(workspace, 'dist/app/packages/alpha-engine'), { recursive: true });
    await fs.mkdir(path.join(workspace, 'build/candidates'), { recursive: true });
    await fs.writeFile(path.join(workspace, 'dist/app/packages/alpha-engine/cli.cjs'), '#!/usr/bin/env node\n');
    await fs.writeFile(path.join(workspace, 'build/candidates/alpha-data-bridge'), 'bridge');
    const child = independentRuntime({
      workspace,
      userData: path.join(temporary, 'user-data'),
      execPath: process.execPath,
      environment: {
        ALPHA_UPDATE_ROOT_PUBLIC_KEY_BASE64URL: 'A'.repeat(43),
        ALPHA_UPDATE_POLICY_URL: 'https://updates.example.invalid/policy.json',
        ALPHA_UPDATE_POLICY_PATH: '/private/tmp/author-policy.json',
        ALPHA_UPDATE_MIRROR_BASE_URL: 'https://mirror.example.invalid',
        ALPHA_UPDATE_CHANNEL: 'nightly'
      }
    });
    for (const name of [
      'ALPHA_UPDATE_ROOT_PUBLIC_KEY_BASE64URL',
      'ALPHA_UPDATE_POLICY_URL',
      'ALPHA_UPDATE_POLICY_PATH',
      'ALPHA_UPDATE_MIRROR_BASE_URL',
      'ALPHA_UPDATE_CHANNEL'
    ]) assert.equal(child.environment[name], undefined, name);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('explicit key helper path crosses development and packaged desktop boundaries', async () => {
  const previous = process.env.ALPHA_INDEPENDENT_KEY_HELPER_PATH;
  const helper = path.join(os.tmpdir(), 'alpha-key-helper-boundary');
  process.env.ALPHA_INDEPENDENT_KEY_HELPER_PATH = helper;
  try {
    const inherited = launchEnvironment('key-helper-boundary', { backend: 'independent' });
    assert.equal(inherited.ALPHA_INDEPENDENT_KEY_HELPER_PATH, helper);

    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-key-helper-runtime-'));
    try {
      const workspace = path.join(temporary, 'workspace');
      const userData = path.join(temporary, 'user-data');
      await fs.mkdir(path.join(workspace, 'dist/app/packages/alpha-engine'), { recursive: true });
      await fs.mkdir(path.join(workspace, 'build/candidates'), { recursive: true });
      await fs.writeFile(path.join(workspace, 'dist/app/packages/alpha-engine/cli.cjs'), '#!/usr/bin/env node\n');
      await fs.writeFile(path.join(workspace, 'build/candidates/alpha-data-bridge'), 'bridge');
      const development = independentRuntime({ workspace, userData, execPath: process.execPath, environment: inherited });
      assert.equal(development.environment.ALPHA_INDEPENDENT_KEY_HELPER_PATH, helper);

      const resources = path.join(temporary, 'Resources');
      const packagedRoot = path.join(resources, 'independent');
      await fs.mkdir(path.join(packagedRoot, 'alpha-engine'), { recursive: true });
      await fs.mkdir(path.join(packagedRoot, 'bin'), { recursive: true });
      await fs.writeFile(path.join(packagedRoot, 'alpha-engine', 'cli.cjs'), '#!/usr/bin/env node\n');
      await fs.writeFile(path.join(packagedRoot, 'bin', 'alpha-data-bridge'), 'bridge');
      await fs.writeFile(path.join(packagedRoot, 'bin', 'alpha-snapshot-import'), 'importer');
      const packaged = independentRuntime({ packaged: true, resourcesPath: resources, workspace, userData, execPath: process.execPath, environment: inherited });
      assert.equal(packaged.environment.ALPHA_INDEPENDENT_KEY_HELPER_PATH, helper);
    } finally {
      await fs.rm(temporary, { recursive: true, force: true });
    }
  } finally {
    if (previous === undefined) delete process.env.ALPHA_INDEPENDENT_KEY_HELPER_PATH;
    else process.env.ALPHA_INDEPENDENT_KEY_HELPER_PATH = previous;
  }
});

test('packaged independent runtime resolves only Resources/independent payloads', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-packaged-runtime-'));
  try {
    const resources = path.join(temporary, 'Resources');
    const root = path.join(resources, 'independent');
    const userData = path.join(temporary, 'user-data');
    await fs.mkdir(path.join(root, 'alpha-engine'), { recursive: true });
    await fs.mkdir(path.join(root, 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, 'alpha-engine', 'cli.cjs'), '#!/usr/bin/env node\n');
    await fs.writeFile(path.join(root, 'bin', 'alpha-data-bridge'), 'bridge');
    await fs.writeFile(path.join(root, 'bin', 'alpha-snapshot-import'), 'importer');
    const child = independentRuntime({
      packaged: true,
      resourcesPath: resources,
      workspace: path.join(temporary, 'ignored-workspace'),
      userData,
      execPath: process.execPath,
      environment: { ALPHA_RECOVERY_BACKEND: 'independent', ALPHA_INDEPENDENT_HTTP_PORT: '5033' }
    });
    assert.deepEqual(child.args, [path.join(root, 'alpha-engine', 'cli.cjs')]);
    assert.equal(child.cwd, root);
    assert.equal(child.environment.ALPHA_INDEPENDENT_BRIDGE_PATH, path.join(root, 'bin', 'alpha-data-bridge'));
    assert.equal(child.environment.ALPHA_INDEPENDENT_IMPORTER_PATH, path.join(root, 'bin', 'alpha-snapshot-import'));
    assert.equal(child.environment.ALPHA_RECOVERY_BACKEND, undefined);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('packaged independent runtime also accepts the generated app/independent layout', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-packaged-app-layout-'));
  try {
    const resources = path.join(temporary, 'Resources');
    const appPath = path.join(temporary, 'app.asar');
    const root = path.join(appPath, 'independent');
    await fs.mkdir(path.join(root, 'packages', 'alpha-engine'), { recursive: true });
    await fs.mkdir(path.join(root, 'bin'), { recursive: true });
    await fs.writeFile(path.join(root, 'packages', 'alpha-engine', 'cli.cjs'), '#!/usr/bin/env node\n');
    await fs.writeFile(path.join(root, 'bin', 'alpha-data-bridge'), 'bridge');
    const child = independentRuntime({ packaged: true, resourcesPath: resources, appPath, workspace: temporary, userData: path.join(temporary, 'user-data'), execPath: process.execPath, environment: {} });
    assert.equal(child.cwd, root);
    assert.equal(child.args[0], path.join(root, 'packages', 'alpha-engine', 'cli.cjs'));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('packaged independent runtime fails closed when the resource payload is incomplete', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-packaged-runtime-missing-'));
  try {
    const resources = path.join(temporary, 'Resources');
    await fs.mkdir(path.join(resources, 'independent', 'alpha-engine'), { recursive: true });
    await fs.writeFile(path.join(resources, 'independent', 'alpha-engine', 'cli.cjs'), '#!/usr/bin/env node\n');
    assert.throws(
      () => independentRuntime({ packaged: true, resourcesPath: resources, workspace: temporary, userData: path.join(temporary, 'user-data'), execPath: process.execPath, environment: {} }),
      /ENOENT/
    );
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
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

test('independent fixture agent crosses the launcher boundary only by explicit opt-in', () => {
  const previous = process.env.ALPHA_INDEPENDENT_AGENT;
  process.env.ALPHA_INDEPENDENT_AGENT = 'fixture';
  try {
    const inherited = launchEnvironment('agent-fixture-boundary', { backend: 'independent' });
    assert.equal(inherited.ALPHA_INDEPENDENT_AGENT, 'fixture');
    const explicit = launchEnvironment('agent-fixture-explicit', { backend: 'independent', agentFixture: true });
    assert.equal(explicit.ALPHA_INDEPENDENT_AGENT, 'fixture');
    const original = launchEnvironment('agent-fixture-original', { backend: 'original' });
    assert.equal(original.ALPHA_INDEPENDENT_AGENT, undefined);
  } finally {
    if (previous === undefined) delete process.env.ALPHA_INDEPENDENT_AGENT;
    else process.env.ALPHA_INDEPENDENT_AGENT = previous;
  }
});

test('independent launcher rejects non-fixture agent values', () => {
  const previous = process.env.ALPHA_INDEPENDENT_AGENT;
  process.env.ALPHA_INDEPENDENT_AGENT = 'openai';
  try {
    assert.throws(() => launchEnvironment('agent-invalid-boundary', { backend: 'independent' }), { message: 'INDEPENDENT_AGENT_INVALID' });
  } finally {
    if (previous === undefined) delete process.env.ALPHA_INDEPENDENT_AGENT;
    else process.env.ALPHA_INDEPENDENT_AGENT = previous;
  }
});
