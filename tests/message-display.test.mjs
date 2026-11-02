import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parse } from '@babel/parser';
import { createEngine } from '../packages/alpha-engine/index.cjs';
import { createSecurity } from '../packages/alpha-security/index.cjs';
const require = createRequire(import.meta.url);
const { EngineClientFrame } = require('../packages/alpha-protocol/index.cjs');
const { validateMessageDisplay } = require('../packages/alpha-engine/message-display.cjs');

const root = fileURLToPath(new URL('../', import.meta.url));
const mainSource = await fs.readFile(path.join(root, 'src/main/index.js'), 'utf8');
const mainAst = parse(mainSource, { sourceType: 'unambiguous' });
function mainDeclaration(name) {
  const node = mainAst.program.body.find(value => value.id?.name === name || value.type === 'VariableDeclaration' && value.declarations.some(item => item.id?.name === name));
  assert.ok(node, `main declaration missing: ${name}`);
  return mainSource.slice(node.start, node.end);
}
const desktopDisplay = vm.runInNewContext(['plain', 'object$6', 'messageDisplayFromWire', 'projectDisplay', 'embedded'].map(mainDeclaration).join('\n') + '\n({ messageDisplayFromWire })', { TextDecoder, Uint8Array, URL });

test('message display validator matches desktop URL and byte-size boundaries', () => {
  const checked = validateMessageDisplay({
    kind: 'file', fileName: 'archive.zip', fileSize: '9007199254740993', fileExtension: 'zip',
  });
  assert.equal(JSON.parse(Buffer.from(checked.bytes).toString()).fileSize, '9007199254740993');
  assert.throws(() => validateMessageDisplay({ kind: 'file', fileSize: '18446744073709551616' }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
  assert.throws(() => validateMessageDisplay({ kind: 'link', linkUrl: 'http://example.test/' }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
  assert.throws(() => validateMessageDisplay({ kind: 'link', linkUrl: 'https://example.test/?cdn_url=secret' }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
  assert.equal(validateMessageDisplay({ kind: 'link', linkUrl: 'https://example.test/article' }).value.linkUrl, 'https://example.test/article');
  assert.deepEqual(validateMessageDisplay({ kind: 'location', location: { latitude: 39.9042, longitude: 116.4074, label: '北京天安门' } }).value.location, { latitude: 39.9042, longitude: 116.4074, label: '北京天安门' });
  assert.throws(() => validateMessageDisplay({ kind: 'location', location: { latitude: 91, longitude: 116, label: 'bad' } }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
  assert.throws(() => validateMessageDisplay({ kind: 'location', location: { latitude: 39, longitude: 116, label: 1 } }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
});

test('message display validator carries shallow quote metadata and rejects unsafe fields', () => {
  const display = {
    kind: 'quote',
    quote: { sender: '群友甲', kind: 'text', text: '原消息', senderId: 'room@chatroom', serverId: '9007199254740993' }
  };
  assert.deepEqual(validateMessageDisplay(display).value, display);
  assert.throws(() => validateMessageDisplay({ kind: 'quote', quote: { sender: '甲', kind: 'text', text: 'x', senderId: '\u0001' } }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
  assert.throws(() => validateMessageDisplay({ kind: 'quote', quote: { sender: '甲', kind: 'text', text: 'x', serverId: 'not-a-number' } }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
  assert.throws(() => validateMessageDisplay({ kind: 'quote', quote: { sender: '甲', kind: 'text', text: 'x', nested: {} } }), /BRIDGE_MESSAGE_DISPLAY_INVALID/);
});

test('engine carries validated bridge display through protobuf and JSON export', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/message-display-'));
  const stateDir = path.join(directory, 'state'); const dataDir = path.join(directory, 'data');
  await fs.mkdir(stateDir, { mode: 0o700 }); await fs.mkdir(dataDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const display = { kind: 'link', title: 'Alpha', description: 'A link', displayUrl: 'https://example.test', linkUrl: 'https://example.test/article' };
  const row = { conversationId: 'wxid_alpha', localId: '1', serverId: '2', createTime: '1700000000', sender: 'wxid_self', source: { database: 'message/message_0.db', table: 'Msg_fixture', localId: '1' }, localType: '49', contentEncoding: 'utf8', content: '<msg><appmsg><type>5</type></appmsg></msg>', display };
  const quoteDisplay = { kind: 'quote', quote: { sender: '群友甲', kind: 'text', text: '原消息', senderId: 'wxid_sender', serverId: '9007199254740993' } };
  const quoteRow = { ...row, localId: '2', serverId: '3', content: '<msg><appmsg><type>57</type><title>原消息</title><refermsg><type>1</type><svrid>9007199254740993</svrid><fromusr>wxid_sender</fromusr><displayname>群友甲</displayname></refermsg></appmsg></msg>', localType: '244813135921', display: quoteDisplay };
  const fake = {
    async call(op) {
      if (op === 'account.info') return { id: 'synthetic-account', readOnly: true, sourceKind: 'offline-wechat-v4', snapshotId: 'snapshot-1', capabilities: ['account.info', 'messages.list'] };
      if (op === 'messages.list') return { items: [row, quoteRow], nextCursor: '', hasMore: false };
      throw new Error(`unexpected ${op}`);
    },
    async close() {},
  };
  const engine = await createEngine({ lock, stateDir, dataDir, accountId: 'synthetic-account', bridgePath: path.join(directory, 'bridge'), bridgeFactory: () => fake });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const hello = await engine.dispatch(EngineClientFrame.fromPartial({ requestId: 1n, hello: { protocol: { major: 1, minor: 0 }, desktopVersion: 'test' } }));
  assert.equal(hello.error, undefined, JSON.stringify(hello.error));
  const listed = await engine.dispatch(EngineClientFrame.fromPartial({ requestId: 2n, listMessages: { accountId: 'synthetic-account', conversationId: 'wxid_alpha', page: { pageSize: 2 } } }));
  assert.equal(listed.error, undefined);
  assert.deepEqual(JSON.parse(Buffer.from(listed.listMessages.items[0].displayJson).toString()), display);
  assert.deepEqual(JSON.parse(JSON.stringify(desktopDisplay.messageDisplayFromWire(listed.listMessages.items[0].displayJson, 'wxid_alpha'))), display);
  assert.equal(listed.listMessages.items[1].kind, 'quote');
  assert.deepEqual(JSON.parse(Buffer.from(listed.listMessages.items[1].displayJson).toString()), quoteDisplay);
  const destinationPath = path.join(directory, 'exports', 'messages.json');
  const exported = await engine.dispatch(EngineClientFrame.fromPartial({ requestId: 3n, exportConversation: { accountId: 'synthetic-account', conversationId: 'wxid_alpha', format: 'json', destinationPath, includeMedia: false } }));
  assert.equal(exported.error, undefined);
  const payload = JSON.parse(await fs.readFile(destinationPath, 'utf8'));
  assert.deepEqual(payload.messages[0].display, display);
  assert.equal(payload.messages[0].text, row.content);
});
