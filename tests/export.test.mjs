import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createSearchFixture } from './search-fixture.mjs';

const require = createRequire(import.meta.url);
const { createEngine, SUPPORTED } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const root = path.resolve(new URL('..', import.meta.url).pathname);
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

function ok(reply, method) {
  assert.equal(reply.error, undefined, reply.error?.code);
  assert.ok(reply[method]);
  return reply[method];
}

async function setup(t) {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/export-'));
  const fixture = await createSearchFixture({ directory: path.join(directory, 'data') });
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  let sequence = 0n;
  async function call(method, payload = {}) {
    const request = EngineClientFrame.fromPartial({ requestId: ++sequence, [method]: { accountId: fixture.accountId, ...payload } });
    const decoded = EngineClientFrame.decode(EngineClientFrame.encode(request).finish());
    const response = await engine.dispatch(decoded);
    return EngineServerFrame.decode(EngineServerFrame.encode(response).finish());
  }
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  ok(await call('hello', { protocol: { major: 1, minor: 0 } }), 'hello');
  return { ...fixture, directory, call };
}

test('offline exporter advertises field 16 and preserves exact identities in JSON', async t => {
  const f = await setup(t);
  const hello = ok(await f.call('hello', { protocol: { major: 1, minor: 0 } }), 'hello');
  assert.ok(hello.supportedMethodIds.includes(SUPPORTED.exportConversation));
  assert.equal(hello.supportsExportTimeRange, true);
  const destinationPath = path.join(f.directory, 'export.json');
  const result = ok(await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath }), 'exportConversation');
  assert.equal(result.itemCount, 6);
  const document = JSON.parse(await fs.readFile(destinationPath, 'utf8'));
  assert.equal(document.format, 'json');
  assert.equal(document.itemCount, 6);
  assert.equal(document.messages[1].localId, '9007199254740993');
  assert.equal(document.messages[1].serverId, '9223372036854775807');
  assert.equal(document.messages.find(item => item.text === f.zstdText).contentDecodeStatus, 'decoded');
  assert.equal(document.messages[1].source.localId, document.messages[1].localId);
});

test('offline exporter writes a bounded XLSX message sheet with verified identities', async t => {
  const f = await setup(t);
  const destinationPath = path.join(f.directory, 'export.xlsx');
  const result = ok(await f.call('exportConversation', { conversationId: f.conversationId, format: 'xlsx', destinationPath }), 'exportConversation');
  assert.equal(result.itemCount, 6);
  const output = await fs.readFile(destinationPath);
  assert.equal(output.subarray(0, 4).toString('hex'), '504b0304');
  assert.ok(output.includes(Buffer.from('wxid_alpha')));
  assert.ok(output.includes(Buffer.from('same sequence')));
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'xlsx', destinationPath: path.join(f.directory, 'wrong.json') })).error.code, 'EXPORT_REQUEST_INVALID');
});

test('markdown and txt exports apply exact inclusive millisecond bounds', async t => {
  const f = await setup(t);
  const markdownPath = path.join(f.directory, 'export.md');
  const markdown = ok(await f.call('exportConversation', { conversationId: f.conversationId, format: 'markdown', destinationPath: markdownPath, startTimeUnixMs: 1700000000000n, endTimeUnixMs: 1700000001000n }), 'exportConversation');
  assert.equal(markdown.itemCount, 2);
  const markdownText = await fs.readFile(markdownPath, 'utf8');
  assert.match(markdownText, /second/);
  assert.match(markdownText, /first 100%/);
  assert.doesNotMatch(markdownText, /earlier shard/);
  const txtPath = path.join(f.directory, 'export.txt');
  const txt = ok(await f.call('exportConversation', { conversationId: f.conversationId, format: 'txt', destinationPath: txtPath }), 'exportConversation');
  assert.equal(txt.itemCount, 6);
  assert.match(await fs.readFile(txtPath, 'utf8'), /压缩维护 needle zstd 中文/);
  const emptyPath = path.join(f.directory, 'empty.json');
  assert.equal(ok(await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath: emptyPath, startTimeUnixMs: 1700000000001n, endTimeUnixMs: 1700000000001n }), 'exportConversation').itemCount, 0);
});

test('html export is a safe static rendering of verified message DTOs', async t => {
  const f = await setup(t);
  const destinationPath = path.join(f.directory, 'export.html');
  const result = ok(await f.call('exportConversation', { conversationId: f.conversationId, format: 'html', destinationPath }), 'exportConversation');
  assert.equal(result.itemCount, 6);
  const html = await fs.readFile(destinationPath, 'utf8');
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /Alpha conversation export/);
  assert.match(html, /压缩维护 needle zstd 中文/);
  assert.match(html, /first 100%/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /xl\/worksheets/); // HTML must not be an XLSX masquerading as a web document.
});

test('derived exports are bounded, parseable and preserve verified message fields', async t => {
  const f = await setup(t);
  const cases = [
    ['chatlab-json', 'chatlab.json'],
    ['chatlab-jsonl', 'chatlab.jsonl'],
    ['chatlab-v0-json', 'chatlab-v0.json'],
    ['chatlab-v0-jsonl', 'chatlab-v0.jsonl'],
    ['sql', 'chat.sql'],
    ['weclone', 'chat.csv']
  ];
  for (const [format, file] of cases) {
    const destinationPath = path.join(f.directory, file);
    const result = ok(await f.call('exportConversation', { conversationId: f.conversationId, format, destinationPath }), 'exportConversation');
    assert.equal(result.format, format);
    const output = await fs.readFile(destinationPath, 'utf8');
    assert.match(output, /wxid_alpha/);
    assert.match(output, /same sequence/);
    if (format === 'chatlab-json') assert.equal(JSON.parse(output).format, 'chatlab-json-derived');
    if (format === 'chatlab-jsonl') {
      const lines = output.trimEnd().split('\n').map(line => JSON.parse(line));
      assert.equal(lines[0].format, 'chatlab-jsonl-derived');
      assert.equal(lines[0].recordType, 'meta');
      assert.equal(lines[1].recordType, 'message');
    }
    if (format === 'chatlab-v0-json') {
      const parsed = JSON.parse(output);
      assert.equal(parsed.chatlab.version, '0.0.2');
      assert.equal(parsed.meta.platform, 'weixin');
      assert.equal(parsed.meta.type, 'private');
      assert.deepEqual(parsed.members, []);
      assert.equal(parsed.messages[0].platformMessageId, '9007199254740997');
    }
    if (format === 'chatlab-v0-jsonl') {
      const lines = output.trimEnd().split('\n').map(line => JSON.parse(line));
      assert.equal(lines[0]._type, 'header');
      assert.equal(lines[0].chatlab.version, '0.0.2');
      assert.equal(lines.at(-1)._type, 'message');
    }
    if (format === 'sql') assert.match(output, /CREATE TABLE IF NOT EXISTS alpha_messages/);
    if (format === 'weclone') {
      assert.match(output, /^conversation_id,message_id,/);
      assert.match(output, /weclone-derived,alpha-independent-message-v1/);
    }
  }
});

test('exporter rejects media, existing destinations, symlink destinations and incomplete pages', async t => {
  const f = await setup(t);
  const destinationPath = path.join(f.directory, 'existing.json');
  await fs.writeFile(destinationPath, 'keep', { mode: 0o600 });
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath })).error.code, 'EXPORT_OUTPUT_EXISTS');
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath: path.join(f.directory, 'media.json'), includeMedia: true })).error.code, 'EXPORT_MEDIA_UNSUPPORTED');
  const symlink = path.join(f.directory, 'link.json');
  await fs.symlink(destinationPath, symlink);
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath: symlink })).error.code, 'EXPORT_DESTINATION_INVALID');
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath: path.join(f.directory, 'cursor.json'), page: { cursor: Buffer.from('cursor') } })).error.code, 'EXPORT_PAGE_UNSUPPORTED');
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'arkme-json', destinationPath: path.join(f.directory, 'unknown.json') })).error.code, 'EXPORT_FORMAT_UNSUPPORTED');
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'xlsx', destinationPath: null })).error.code, 'EXPORT_DESTINATION_INVALID');
  assert.equal((await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath: path.join(f.directory, 'data', 'inside.json') })).error.code, 'EXPORT_DESTINATION_INVALID');
  assert.equal(await fs.readFile(destinationPath, 'utf8'), 'keep');
  assert.deepEqual((await fs.readdir(f.directory)).filter(name => name.startsWith('.alpha-export-')), []);
});

test('exporter creates a bounded missing task directory and keeps protected paths untouched', async t => {
  const f = await setup(t);
  const nestedDirectory = path.join(f.directory, 'Alpha导出-2026', '会话');
  const destinationPath = path.join(nestedDirectory, 'conversation.json');
  const result = ok(await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath }), 'exportConversation');
  assert.equal(result.destinationPath, path.resolve(destinationPath));
  assert.equal(JSON.parse(await fs.readFile(destinationPath, 'utf8')).itemCount, 6);

  const protectedDestination = path.join(f.directory, 'data', 'new', 'conversation.json');
  const failure = await f.call('exportConversation', { conversationId: f.conversationId, format: 'json', destinationPath: protectedDestination });
  assert.equal(failure.error.code, 'EXPORT_DESTINATION_INVALID');
  await assert.rejects(fs.access(path.dirname(protectedDestination)));
  assert.deepEqual((await fs.readdir(f.directory)).filter(name => name.startsWith('.alpha-export-')), []);
});
