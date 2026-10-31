import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSearchFixture } from './search-fixture.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('data watch targets expose only the explicitly selected offline source root', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-watch-'));
  const fixture = await createSearchFixture({ directory: path.join(directory, 'data') });
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const input = EngineClientFrame.fromPartial({ requestId: ++id, [method]: method === 'hello' ? payload : { accountId: fixture.accountId, ...payload } });
    return EngineServerFrame.decode(EngineServerFrame.encode(await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(input).finish()))).finish());
  }
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.equal(hello.error, undefined, hello.error?.code);
  assert.ok(hello.hello.supportedMethodIds.includes(106));
  const response = await call('getDataWatchTargets');
  assert.equal(response.error, undefined, response.error?.code);
  assert.deepEqual(response.getDataWatchTargets.directories, [fixture.directory]);
  assert.ok(response.getDataWatchTargets.directories.every(item => path.isAbsolute(item)));
});

test('data watch targets fail closed when the selected source is removed', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-watch-missing-'));
  const fixture = await createSearchFixture({ directory: path.join(directory, 'data') });
  const stateDir = path.join(directory, 'state'); await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const input = EngineClientFrame.fromPartial({ requestId: ++id, [method]: method === 'hello' ? payload : { accountId: fixture.accountId, ...payload } });
    return EngineServerFrame.decode(EngineServerFrame.encode(await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(input).finish()))).finish());
  }
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);
  await fs.rm(fixture.directory, { recursive: true, force: true });
  const response = await call('getDataWatchTargets');
  assert.equal(response.error?.code, 'DATASET_CHANGED');
});
