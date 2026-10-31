import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createFixture } from './data-bridge-fixture.mjs';
const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame } = require('../packages/alpha-protocol/index.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

async function setup(t, { fixture = true, onlySessions = false, locked = false } = {}) {
  const base = path.join(root, '.runtime');
  await fs.mkdir(base, { recursive: true });
  const directory = await fs.mkdtemp(path.join(base, 'independent-boundary-engine-'));
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const dataDir = path.join(directory, 'data');
  if (fixture) await createFixture(dataDir);
  if (onlySessions) {
    await fs.rm(path.join(dataDir, 'contact'), { recursive: true });
    await fs.rm(path.join(dataDir, 'message'), { recursive: true });
  }
  const lock = await createSecurity({ stateDir });
  if (locked) { await lock.configure({ action: 'enable_password', newPassword: Buffer.from('Synthetic boundary password 123') }); lock.lock(); }
  let engine;
  t.after(async () => { if (engine) await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const open = async options => {
    engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: 'synthetic-account', ...options });
    let requestId = 0n;
    return (method, value = {}) => engine.dispatch(EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: value }));
  };
  return { open, dataDir };
}
const hello = call => call('hello', { protocol: { major: 1, minor: 0 } });

test('no configured data yields a real empty account list; missing configured data cannot become ready', async t => {
  const context = await setup(t, { fixture: false });
  const empty = await context.open({ dataDir: '', accountId: '' });
  assert.ok((await hello(empty)).hello);
  assert.deepEqual((await empty('listAccounts')).listAccounts.accounts, []);
  const missing = await context.open({});
  const result = await hello(missing);
  assert.ok(result.error);
  assert.equal(result.hello, undefined);
});

test('locked startup does not initialize a configured source or claim it has been checked', async t => {
  const context = await setup(t, { fixture: false, locked: true });
  let sourceStarts = 0;
  const call = await context.open({ bridgeFactory() { sourceStarts++; throw new Error('UNEXPECTED_SOURCE_ACCESS'); } });
  const result = await hello(call);
  assert.ok(result.hello);
  assert.deepEqual(result.hello.components.map(x => x.component), ['alpha-independent-engine']);
  assert.equal((await call('listAccounts')).error.code, 'APP_LOCK_LOCKED');
  assert.equal(sourceStarts, 0);
});

test('session-only source reports only its actual capabilities and lists sessions without contacts', async t => {
  const context = await setup(t, { onlySessions: true });
  const call = await context.open({});
  assert.ok((await hello(call)).hello);
  const account = (await call('listAccounts')).listAccounts.accounts[0];
  assert.equal(account.capabilities.includes('contacts'), false);
  assert.equal(account.capabilities.includes('messages'), false);
  assert.equal(account.capabilities.includes('conversations'), true);
  const sessions = await call('listConversations', { accountId: 'synthetic-account', page: { pageSize: 100 } });
  assert.equal(sessions.error, undefined);
  assert.ok(sessions.listConversations.items.some(x => x.displayName === 'wxid_alpha'));
});

test('account readiness and revision cannot remain successful after their source changes', async t => {
  const context = await setup(t);
  const call = await context.open({});
  assert.ok((await hello(call)).hello);
  assert.ok((await call('listAccounts')).listAccounts.accounts[0].ready);
  await fs.appendFile(path.join(context.dataDir, 'contact/contact.db'), Buffer.from([0]));
  const accounts = await call('listAccounts');
  assert.equal(accounts.error?.code, 'DATASET_CHANGED');
  assert.equal(accounts.listAccounts, undefined);
  const revision = await call('getDataRevision', { accountId: 'synthetic-account' });
  assert.equal(revision.error?.code, 'DATASET_CHANGED');
  assert.equal(revision.getDataRevision, undefined);
});
