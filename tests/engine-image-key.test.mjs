import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createFixture } from './data-bridge-fixture.mjs';

const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('image key lifecycle remains memory-only and reports media decoder unavailable', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-image-key-'));
  const dataDir = path.join(directory, 'data');
  const stateDir = path.join(directory, 'state');
  await createFixture(dataDir);
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: 'synthetic-account', selfUsername: 'wxid_self' });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let requestId = 0n;
  async function call(method, payload = {}) {
    const frame = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: method === 'hello' ? payload : { accountId: 'synthetic-account', ...payload } });
    const response = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(frame).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(response).finish());
  }
  assert.equal((await call('hello', { protocol: { major: 1, minor: 0 } })).error, undefined);

  const initial = (await call('getImageMediaStatus')).getImageMediaStatus.status;
  assert.equal(initial.detected, false);
  assert.equal(initial.usable, false);
  assert.equal(initial.enabled, false);
  assert.equal(initial.verified, false);
  assert.equal(initial.errorCode, 'INDEPENDENT_IMAGE_KEY_UNCONFIGURED');

  const aesKey = new Uint8Array(16).fill(0x2a);
  const configured = await call('configureImageKey', { mode: 2, xorKey: 91, aesKey });
  assert.equal(configured.error, undefined, configured.error?.code);
  assert.equal(configured.configureImageKey.status.enabled, true);
  assert.equal(configured.configureImageKey.status.usable, false);
  assert.equal(configured.configureImageKey.status.provider, 'independent-memory-key');
  assert.equal(configured.configureImageKey.status.errorCode, 'INDEPENDENT_MEDIA_DECODER_UNAVAILABLE');
  assert.equal(configured.configureImageKey.evidence.datMagicVerified, false);
  assert.equal(configured.configureImageKey.evidence.evidenceDigest.length, 32);
  assert.equal((await call('getImageMediaStatus')).getImageMediaStatus.status.enabled, true);

  assert.equal((await call('configureImageKey', { mode: 1, xorKey: 0, aesKey: new Uint8Array() })).error?.code, 'IMAGE_KEY_MODE_UNSUPPORTED');
  assert.equal((await call('configureImageKey', { mode: 3, xorKey: 0, aesKey: new Uint8Array() })).error?.code, 'IMAGE_KEY_MODE_UNSUPPORTED');
  assert.equal((await call('configureImageKey', { mode: 2, xorKey: 256, aesKey })).error?.code, 'IMAGE_KEY_REQUEST_INVALID');
  assert.equal((await call('configureImageKey', { mode: 2, xorKey: 1, aesKey: new Uint8Array(15) })).error?.code, 'IMAGE_KEY_REQUEST_INVALID');

  const cleared = (await call('clearImageKey')).clearImageKey.status;
  assert.equal(cleared.enabled, false);
  assert.equal(cleared.usable, false);
  assert.equal(cleared.errorCode, 'INDEPENDENT_IMAGE_KEY_UNCONFIGURED');
  const stateEntries = await fs.readdir(stateDir);
  assert.ok(!stateEntries.some(entry => /image|key/i.test(entry)));
  for (const entry of stateEntries) {
    const bytes = await fs.readFile(path.join(stateDir, entry));
    assert.equal(bytes.includes(Buffer.from('2a'.repeat(16), 'hex')), false);
  }
});
