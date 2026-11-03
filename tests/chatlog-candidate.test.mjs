import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createChatlogCandidate, normalizeChatlogEnvelope, normalizeChatlogMessage } from '../packages/alpha-engine/chatlog-candidate.cjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);

async function fixture(t, body = {}) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(tempRoot, 'alpha-chatlog-candidate-test-'));
  const work = path.join(root, 'work');
  await fs.mkdir(work);
  await fs.writeFile(path.join(work, 'message_0.db'), 'fixture');
  const fake = path.join(root, 'chatlog-fake.cjs');
  const script = `#!/usr/bin/env node
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.writeFileSync(path.join(process.env.CHATLOG_DIR, 'args.json'), JSON.stringify(args));
fs.writeFileSync(path.join(process.env.CHATLOG_DIR, 'env.json'), JSON.stringify({ CHATLOG_DATA_KEY: process.env.CHATLOG_DATA_KEY || '', ALPHA_INDEPENDENT_DATA_DIR: process.env.ALPHA_INDEPENDENT_DATA_DIR || '' }));
const addr = args[args.indexOf('--addr') + 1];
const port = Number(addr.split(':').at(-1));
const response = ${JSON.stringify(body)};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname === '/health') { res.writeHead(200, {'content-type': 'application/json'}); res.end('{"status":"ok"}'); return; }
  if (url.pathname === '/api/v1/contact') { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(response.contacts || response)); return; }
  if (url.pathname === '/api/v1/session') { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(response.sessions || response)); return; }
  if (url.pathname === '/api/v1/chatlog') { res.writeHead(200, {'content-type': 'application/json'}); res.end(url.searchParams.has('large') ? 'x'.repeat(1024 * 1024) : JSON.stringify(response.messages || response)); return; }
  if (req.url === '/redirect') { res.writeHead(302, {location: '/health'}); res.end(); return; }
  if (req.url === '/large') { res.writeHead(200, {'content-type': 'text/plain'}); res.end('x'.repeat(1024 * 1024)); return; }
  res.writeHead(404); res.end('missing');
});
server.listen(port, '127.0.0.1');
`;
  await fs.writeFile(fake, script, { mode: 0o700 });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, work, fake };
}

test('chatlog candidate binds loopback, exposes only read-only API paths, and cleans child/config', async t => {
  const f = await fixture(t, { items: [{ username: 'wxid_demo' }] });
  const candidate = await createChatlogCandidate({ binaryPath: f.fake, workDir: f.work });
  assert.match(candidate.baseUrl, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(candidate.port > 0, true);
  const contact = await candidate.json('/api/v1/contact?limit=1');
  assert.equal(contact.status, 200);
  assert.deepEqual(contact.json.items, [{ username: 'wxid_demo' }]);
  const args = JSON.parse(await fs.readFile(path.join(candidate.configDirectory, 'args.json'), 'utf8'));
  assert.equal(args.includes('--work-dir'), true);
  assert.equal(args.includes('--data-dir'), false);
  assert.equal(args.includes('--auto-decrypt'), false);
  assert.deepEqual(args.slice(-2), ['--data-key', 'independent-workdir']);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(candidate.configDirectory, 'env.json'), 'utf8')), { CHATLOG_DATA_KEY: '', ALPHA_INDEPENDENT_DATA_DIR: '' });
  await assert.rejects(candidate.request('/image/secret'), error => error.code === 'CHATLOG_CANDIDATE_PATH_UNSUPPORTED');
  await assert.rejects(candidate.request('/mcp'), error => error.code === 'CHATLOG_CANDIDATE_PATH_UNSUPPORTED');
  await assert.rejects(candidate.request('/api/v1/contact', { method: 'POST' }), error => error.code === 'CHATLOG_CANDIDATE_METHOD_UNSUPPORTED');
  await assert.rejects(candidate.request('/health?x=' + 'a'.repeat(5000)), error => error.code === 'CHATLOG_CANDIDATE_PATH_UNSUPPORTED');
  const configDirectory = candidate.configDirectory;
  await fs.writeFile(path.join(configDirectory, 'ephemeral-marker'), 'candidate');
  const pid = candidate.child.pid;
  await candidate.close();
  assert.equal(candidate.closed, true);
  await assert.rejects(candidate.request('/health'), error => error.code === 'CHATLOG_CANDIDATE_CLOSED');
  await assert.rejects(fs.stat(configDirectory), { code: 'ENOENT' });
  if (pid) {
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.throws(() => process.kill(pid, 0), error => ['ESRCH', 'EPERM'].includes(error.code));
  }
});

test('chatlog candidate bounds response bytes and rejects symlink/path inputs', async t => {
  const f = await fixture(t, { text: 'ok' });
  const empty = path.join(f.root, 'empty-work'); await fs.mkdir(empty);
  await assert.rejects(createChatlogCandidate({ binaryPath: f.fake, workDir: empty }), /CHATLOG_CANDIDATE_WORK_DIR_UNPREPARED/);
  const link = path.join(f.root, 'work-link'); await fs.symlink(f.work, link);
  await assert.rejects(createChatlogCandidate({ binaryPath: f.fake, workDir: link }), /CHATLOG_CANDIDATE_WORK_DIR_INVALID/);
  const parentLink = path.join(f.root, 'parent-link'); await fs.symlink(f.root, parentLink);
  await assert.rejects(createChatlogCandidate({ binaryPath: f.fake, workDir: path.join(parentLink, 'work') }), /CHATLOG_CANDIDATE_WORK_DIR_INVALID/);
  const candidate = await createChatlogCandidate({ binaryPath: f.fake, workDir: f.work, responseLimitBytes: 1024 });
  t.after(() => candidate.close());
  await assert.rejects(candidate.request('/api/v1/chatlog?large=1'), /CHATLOG_CANDIDATE_RESPONSE_TOO_LARGE/);
});

test('chatlog candidate normalizes only bounded candidate envelopes', () => {
  const messages = normalizeChatlogEnvelope([
    {
      seq: 1756225000000,
      time: '2025-08-27T00:00:00+08:00',
      talker: 'wxid_demo',
      talkerName: 'Demo',
      isChatRoom: false,
      sender: 'wxid_demo',
      senderName: 'Demo',
      isSelf: true,
      type: 1,
      subType: 0,
      content: 'hello'
    }
  ], 'message');
  assert.equal(messages.schema, 'alpha-independent-chatlog-candidate-messages.v1');
  assert.equal(messages.candidate, true);
  assert.equal(messages.complete, false);
  assert.equal(messages.native_schema_supported, false);
  assert.deepEqual(messages.items[0], {
    schema: 'alpha-independent-chatlog-candidate-message.v1',
    scope: 'alpha-independent-chatlog-candidate',
    candidate: true,
    complete: false,
    native_schema_supported: false,
    source_kind: 'chatlog-http-v1',
    id: 'chatlog-seq:1756225000000',
    sequence: '1756225000000',
    conversation_id: 'wxid_demo',
    conversation_name: 'Demo',
    sender_id: 'wxid_demo',
    sender_name: 'Demo',
    sent_at_unix_ms: '1756224000000',
    kind: 'text',
    text: 'hello',
    type: 1,
    sub_type: 0,
    is_chat_room: false,
    is_self: true
  });
  const contacts = normalizeChatlogEnvelope({ items: [{ userName: 'wxid_demo', alias: 'demo', remark: 'Demo', nickName: 'Demo', isFriend: true }] }, 'contact');
  assert.deepEqual(contacts.contacts[0], { username: 'wxid_demo', alias: 'demo', remark: 'Demo', nickname: 'Demo', is_friend: true });
  const sessions = normalizeChatlogEnvelope({ items: [{ userName: 'wxid_demo', nickName: 'Demo', content: 'hello', nTime: '2025-08-27T00:00:00+08:00', nOrder: 1 }] }, 'session');
  assert.deepEqual(sessions.sessions[0], { username: 'wxid_demo', nickname: 'Demo', content: 'hello', last_at_unix_ms: '1756224000000', order: 1 });
  assert.throws(() => normalizeChatlogMessage({ seq: 1, time: '2025-08-27T00:00:00+08:00', talker: 'wxid_demo', talkerName: '', isChatRoom: false, sender: 'wxid_demo', senderName: '', isSelf: false, type: 1, subType: 0, content: '\u0000' }), /CHATLOG_CANDIDATE_MESSAGE_CONTENT_INVALID/);
  assert.throws(() => normalizeChatlogMessage({ seq: 1, time: '2025-08-27T00:00:00+08:00', talker: 'wxid_demo', talkerName: '', isChatRoom: false, sender: 'wxid_demo', senderName: '', isSelf: false, type: 'text', subType: 0, content: 'x' }), /CHATLOG_CANDIDATE_MESSAGE_TYPE_INVALID/);
  assert.throws(() => normalizeChatlogEnvelope([], 'unknown'), /CHATLOG_CANDIDATE_KIND_INVALID/);
  assert.throws(() => normalizeChatlogEnvelope(new Array(1001).fill({}), 'contact'), /CHATLOG_CANDIDATE_CONTACT_LIST_INVALID/);
});

test('chatlog candidate convenience reads return bounded candidate projections', async t => {
  const f = await fixture(t, {
    contacts: { items: [{ userName: 'wxid_demo', alias: 'demo', remark: 'Demo', nickName: 'Demo', isFriend: true }] },
    sessions: { items: [{ userName: 'wxid_demo', nickName: 'Demo', content: 'hello', nTime: '2025-08-27T00:00:00+08:00', nOrder: 1 }] },
    messages: [{ seq: 1, time: '2025-08-27T00:00:00+08:00', talker: 'wxid_demo', talkerName: 'Demo', isChatRoom: false, sender: 'wxid_demo', senderName: 'Demo', isSelf: true, type: 1, subType: 0, content: 'hello' }]
  });
  const candidate = await createChatlogCandidate({ binaryPath: f.fake, workDir: f.work });
  t.after(() => candidate.close());
  const contacts = await candidate.readContacts({ keyword: 'demo', limit: 1, offset: 0 });
  assert.equal(contacts.contacts[0].username, 'wxid_demo');
  const sessions = await candidate.readSessions({ limit: 1 });
  assert.equal(sessions.sessions[0].last_at_unix_ms, '1756224000000');
  const messages = await candidate.readMessages({ talker: 'wxid_demo', time: '2025-08-27', limit: 1 });
  assert.equal(messages.items[0].text, 'hello');
  await assert.rejects(candidate.readMessages({ limit: 1001 }), /CHATLOG_CANDIDATE_LIMIT_INVALID/);
  await assert.rejects(candidate.readContacts({ keyword: '\u0000' }), /CHATLOG_CANDIDATE_QUERY_INVALID/);
});

test('chatlog candidate preview CLI reads an explicit work directory and preserves candidate boundary', async t => {
  const f = await fixture(t, {
    messages: [{ seq: 1, time: '2025-08-27T00:00:00+08:00', talker: 'wxid_demo', talkerName: 'Demo', isChatRoom: false, sender: 'wxid_demo', senderName: 'Demo', isSelf: true, type: 1, subType: 0, content: 'hello' }]
  });
  const result = await execFileAsync(process.execPath, [path.join(root, 'scripts/chatlog-candidate-preview.mjs'), '--binary', f.fake, '--work-dir', f.work, '--kind', 'messages', '--limit', '1'], { cwd: root, maxBuffer: 1024 * 1024 });
  const value = JSON.parse(result.stdout);
  assert.equal(value.candidate, true);
  assert.equal(value.complete, false);
  assert.equal(value.native_schema_supported, false);
  assert.equal(value.items[0].text, 'hello');
  await assert.rejects(execFileAsync(process.execPath, [path.join(root, 'scripts/chatlog-candidate-preview.mjs'), '--binary', f.fake, '--work-dir', f.work, '--kind', 'messages', '--limit', '1001'], { cwd: root }), error => error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' || error.stderr.includes('CHATLOG_CANDIDATE_LIMIT_INVALID'));
});
