import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createChatlogCandidate } from '../packages/alpha-engine/chatlog-candidate.cjs';

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
  if (url.pathname === '/api/v1/contact') { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(response)); return; }
  if (url.pathname === '/api/v1/chatlog') { res.writeHead(200, {'content-type': 'application/json'}); res.end(url.searchParams.has('large') ? 'x'.repeat(1024 * 1024) : JSON.stringify(response)); return; }
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
