import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createFavoritesFixture, createFavoritesMediaFixture } from './favorites-fixture.mjs';

const require = createRequire(import.meta.url);
const { createEngine, SUPPORTED } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('independent engine reads only the explicit synthetic favorites fixture', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-favorites-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFavoritesFixture(dataDir);
  const stateDir = path.join(outer, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const request = EngineClientFrame.fromPartial({ requestId: ++id, [method]: { accountId: fixture.accountId, ...payload } });
    const result = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(result).finish());
  }
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.equal(hello.error, undefined);
  assert.ok(hello.hello.supportedMethodIds.includes(SUPPORTED.listFavorites));
  const accounts = await call('listAccounts');
  assert.equal(accounts.error, undefined);
  assert.deepEqual(accounts.listAccounts.accounts[0].capabilities, ['offline-readonly', 'favorites']);

  const page = await call('listFavorites', { limit: 2, ascending: true, includeTypeCounts: true });
  assert.equal(page.error, undefined, page.error?.code);
  assert.deepEqual(page.listFavorites.response.items.map(row => row.id), ['f1', 'f2']);
  assert.equal(page.listFavorites.response.items[0].sourceTable, '__alpha_favorites_v1');
  assert.deepEqual(page.listFavorites.response.items[0].mediaObjects, []);
  assert.deepEqual(page.listFavorites.response.typeCounts, [{ type: 1, count: 2 }, { type: 2, count: 1 }]);
  assert.deepEqual(page.listFavorites.response.tags.map(tag => [tag.id, tag.name, tag.count]), [[7n, '工作', 2], [8n, '稍后', 2]]);

  const tagged = await call('listFavorites', { limit: 10, ascending: true, tagId: 7n });
  assert.equal(tagged.error, undefined, tagged.error?.code);
  assert.deepEqual(tagged.listFavorites.response.items.map(row => row.id), ['f1', 'f2']);
  const queried = await call('listFavorites', { limit: 10, ascending: true, query: '关键字' });
  assert.equal(queried.error, undefined, queried.error?.code);
  assert.deepEqual(queried.listFavorites.response.items.map(row => row.id), ['f2']);

  const media = await call('listFavorites', { includeMedia: true });
  assert.equal(media.error?.code, 'FAVORITES_MEDIA_UNAVAILABLE');
});

test('independent engine resolves declared synthetic favorite media through the media index', async t => {
  const outer = await fs.mkdtemp(path.join(root, '.runtime/engine-favorite-media-'));
  const dataDir = path.join(outer, 'data');
  const fixture = await createFavoritesMediaFixture(dataDir);
  const stateDir = path.join(outer, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir, accountId: fixture.accountId });
  t.after(async () => { await engine.close(); await fs.rm(outer, { recursive: true, force: true }); });
  let id = 0n;
  async function call(method, payload = {}) {
    const request = EngineClientFrame.fromPartial({ requestId: ++id, [method]: { accountId: fixture.accountId, ...payload } });
    const result = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(result).finish());
  }
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.equal(hello.error, undefined, hello.error?.code);
  assert.ok(hello.hello.supportedMethodIds.includes(SUPPORTED.listFavoriteMediaSlots));
  const accounts = await call('listAccounts');
  assert.equal(accounts.error, undefined, accounts.error?.code);
  assert.ok(accounts.listAccounts.accounts[0].capabilities.includes('favorite-media'));
  const slots = await call('listFavoriteMediaSlots', { favoriteId: 'f1' });
  assert.equal(slots.error, undefined, slots.error?.code);
  assert.equal(slots.listFavoriteMediaSlots.status, 'ready');
  assert.deepEqual(slots.listFavoriteMediaSlots.media.slots.map(slot => [slot.itemIndex, slot.role, slot.token]), [[0, 'source', fixture.mediaToken]]);
  const resolved = await call('resolveFavoriteMedia', { token: fixture.mediaToken });
  assert.equal(resolved.error, undefined, resolved.error?.code);
  assert.equal(resolved.resolveFavoriteMedia.status, 'ready');
  assert.equal(resolved.resolveFavoriteMedia.opaqueId, fixture.sha256);
  assert.equal(resolved.resolveFavoriteMedia.mimeType, 'image/png');
  const missing = await call('resolveFavoriteMedia', { token: 'fav1_ffffffffffffffffffffffffffffffff' });
  assert.equal(missing.error, undefined, missing.error?.code);
  assert.equal(missing.resolveFavoriteMedia.status, 'missing');
});
