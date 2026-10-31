import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createMediaBrowseFixture } from './media-browse-fixture.mjs';
import { mediaMetadataExportRequest } from '../src/renderer/assets/media-metadata-export.mjs';

const require = createRequire(import.meta.url);
const { createEngine } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/media-metadata-'));
  const fixture = await createMediaBrowseFixture(path.join(directory, 'data'));
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  let sequence = 0n;
  async function call(method, payload = {}) {
    const request = EngineClientFrame.fromPartial({ requestId: ++sequence, [method]: { accountId: fixture.accountId, ...payload } });
    const response = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(response).finish());
  }
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const hello = await call('hello', { protocol: { major: 1, minor: 0 } });
  assert.equal(hello.error, undefined);
  return { ...fixture, directory, call };
}

const ok = (reply, key) => { assert.equal(reply.error, undefined, reply.error?.code); assert.ok(reply[key]); return reply[key]; };

test('renderer helper exposes independent metadata-only formats and rejects mismatched paths', () => {
  const request = mediaMetadataExportRequest('synthetic-account', '', 'media-json', '/tmp/media.json');
  assert.deepEqual(request, { accountId: 'synthetic-account', conversationId: '', format: 'media-json', destinationPath: '/tmp/media.json', includeMedia: false, metadataOnly: true, mediaReady: false });
  assert.throws(() => mediaMetadataExportRequest('synthetic-account', '', 'media-json', '/tmp/media.csv'), /MEDIA_METADATA_REQUEST_INVALID/);
});

test('media metadata export preserves source identity and explicit metadata-only status', async t => {
  const f = await setup(t);
  const jsonPath = path.join(f.directory, 'media.json');
  const result = ok(await f.call('exportConversation', { conversationId: 'wxid_alpha', format: 'media-json', destinationPath: jsonPath }), 'exportConversation');
  assert.equal(result.format, 'media-json');
  const document = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  assert.equal(document.kind, 'media-metadata');
  assert.equal(document.metadataOnly, true);
  assert.equal(document.mediaReady, false);
  assert.equal(document.scope, 'conversation');
  assert.ok(document.itemCount >= 4);
  assert.ok(document.items.every(item => item.metadataOnly === true && item.mediaReady === false));
  const image = document.items.find(item => item.refs.some(ref => ref.kind === 'image'));
  assert.equal(image.source.table.startsWith('Msg_'), true);
  assert.equal(image.source.localId, image.localId);
  assert.ok(image.refs.some(ref => ref.id));
  assert.equal(Object.hasOwn(image, 'text'), false);
});

test('account metadata export scans discovered sessions and protects output paths', async t => {
  const f = await setup(t);
  const csvPath = path.join(f.directory, 'account-media.csv');
  const result = ok(await f.call('exportConversation', { conversationId: '', format: 'media-csv', destinationPath: csvPath }), 'exportConversation');
  assert.ok(result.itemCount >= 6);
  const csv = await fs.readFile(csvPath, 'utf8');
  assert.match(csv, /^id,accountId,conversationId,/);
  assert.match(csv, /metadataOnly/);
  const protectedPath = path.join(f.directory, 'data', 'media.csv');
  assert.equal((await f.call('exportConversation', { conversationId: '', format: 'media-csv', destinationPath: protectedPath })).error.code, 'EXPORT_DESTINATION_INVALID');
  assert.equal((await f.call('exportConversation', { conversationId: 'wxid_alpha', format: 'media-json', destinationPath: path.join(f.directory, 'wrong.csv') })).error.code, 'MEDIA_METADATA_REQUEST_INVALID');
});
