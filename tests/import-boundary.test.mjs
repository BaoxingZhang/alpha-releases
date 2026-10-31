import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createEncryptedFixture, cleanupEncryptedFixtureHelper } from './encrypted-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const importer = path.join(root, 'build/candidates/alpha-snapshot-import');
const bridge = path.join(root, 'build/candidates/alpha-data-bridge');
const runtime = path.join(root, '.runtime', `import-boundary-${process.pid}`);
let fixture;

async function runProcess(command, args, input, timeoutMs = 30000) {
  const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
  const stdout = []; const stderr = [];
  child.stdout.on('data', value => stdout.push(value));
  child.stderr.on('data', value => stderr.push(value));
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  const exit = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, signal: null, error }));
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.stdin.end(input);
  });
  clearTimeout(timer);
  return { ...exit, stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') };
}
async function runImport(sourceDir, outputDir, keyHex = fixture.keyHex) {
  return runProcess(importer, ['--source-dir', sourceDir, '--output-dir', outputDir], `${JSON.stringify({ keyHex })}\n`);
}
async function copyVariant(name) {
  const directory = path.join(runtime, name);
  await fs.cp(fixture.sourceDir, directory, { recursive: true });
  return directory;
}
async function hash(file) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
async function bridgeInfo(directory) {
  const reply = await runProcess(bridge, ['--data-dir', directory, '--account-id', fixture.expected.accountId], '{"id":"1","op":"account.info","params":{}}\n');
  assert.equal(reply.code, 0, reply.stderr);
  const lines = reply.stdout.trim().split('\n');
  return JSON.parse(lines.at(-1));
}

test.before(async () => {
  await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
  fixture = await createEncryptedFixture({ directory: path.join(runtime, 'fixture') });
});
test.after(async () => { await fs.rm(runtime, { recursive: true, force: true }); await cleanupEncryptedFixtureHelper(); });

test('correct key decrypts every multi-page database and bridge can read the output', async () => {
  const output = path.join(runtime, 'output-success');
  const result = await runImport(fixture.sourceDir, output);
  assert.equal(result.code, 0, result.stderr);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.ok, true);
  assert.equal(summary.sourceUnchanged, true);
  assert.equal(summary.reservedBytesZeroed, true);
  assert.equal(summary.databases.length, fixture.manifest.files.length);
  for (const file of fixture.manifest.files) {
    const target = path.join(output, ...file.relativePath.split('/'));
    assert.equal(await hash(target), file.plaintextSha256, file.relativePath);
    assert.equal((await fs.stat(target)).mode & 0o777, 0o600);
  }
  assert.equal((await fs.stat(output)).mode & 0o777, 0o700);
  const info = await bridgeInfo(output);
  assert.equal(info.ok, true, JSON.stringify(info));
  assert.equal(info.result.sourceKind, 'offline-wechat-v4');
  assert.equal(info.result.readOnly, true);
  const read = await runProcess(bridge, ['--data-dir', output, '--account-id', fixture.expected.accountId], [
    JSON.stringify({ id: 'contacts', op: 'contacts.list', params: {} }),
    JSON.stringify({ id: 'messages', op: 'messages.list', params: { conversationId: fixture.expected.conversationId, limit: 100 } })
  ].join('\n') + '\n');
  assert.equal(read.code, 0, read.stderr);
  const [contacts, messages] = read.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(contacts.result.items.some(row => row.remark === '合成联系人甲'));
  assert.ok(messages.result.items.some(row => row.content === 'first source'));
});

test('wrong key and page corruption fail authentication without publishing output', async () => {
  const wrongOutput = path.join(runtime, 'output-wrong-key');
  const wrong = await runImport(fixture.sourceDir, wrongOutput, 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
  assert.equal(wrong.code, 2);
  assert.match(wrong.stderr, /KEY_AUTHENTICATION_FAILED/);
  await assert.rejects(fs.stat(wrongOutput), { code: 'ENOENT' });
  for (const [name, mutate] of [
    ['cipher-corrupt', async file => { const bytes = await fs.readFile(file); bytes[32] ^= 1; await fs.writeFile(file, bytes); }],
    ['hmac-corrupt', async file => { const bytes = await fs.readFile(file); bytes[4090] ^= 1; await fs.writeFile(file, bytes); }]
  ]) {
    const source = await copyVariant(name);
    await mutate(path.join(source, 'contact/contact.db'));
    const output = path.join(runtime, `output-${name}`);
    const result = await runImport(source, output);
    assert.equal(result.code, 2, result.stderr);
    assert.match(result.stderr, /KEY_AUTHENTICATION_FAILED/);
    await assert.rejects(fs.stat(output), { code: 'ENOENT' });
  }
});

test('truncated and all-zero pages fail before publishing output', async () => {
  const truncated = await copyVariant('truncated');
  const truncatedFile = path.join(truncated, 'session/session.db');
  await fs.truncate(truncatedFile, (await fs.stat(truncatedFile)).size - 1);
  const truncatedResult = await runImport(truncated, path.join(runtime, 'output-truncated'));
  assert.equal(truncatedResult.code, 2);
  assert.match(truncatedResult.stderr, /TRUNCATED_DATABASE/);
  const zeros = await copyVariant('zero-page');
  await fs.writeFile(path.join(zeros, 'message/message_0.db'), Buffer.alloc(4096), { flag: 'r+' });
  const zeroResult = await runImport(zeros, path.join(runtime, 'output-zero-page'));
  assert.equal(zeroResult.code, 2);
  assert.match(zeroResult.stderr, /KEY_AUTHENTICATION_FAILED/);
});

test('existing output, symlink members and active sidecars are rejected safely', async () => {
  const existing = path.join(runtime, 'output-existing');
  await fs.mkdir(existing, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(existing, 'sentinel'), 'keep');
  const existingResult = await runImport(fixture.sourceDir, existing);
  assert.equal(existingResult.code, 2);
  assert.match(existingResult.stderr, /OUTPUT_EXISTS/);
  assert.equal(await fs.readFile(path.join(existing, 'sentinel'), 'utf8'), 'keep');

  const linked = await copyVariant('symlink-member');
  const linkedFile = path.join(linked, 'contact/contact.db');
  await fs.unlink(linkedFile);
  await fs.symlink(path.join(linked, 'session/session.db'), linkedFile);
  const linkedResult = await runImport(linked, path.join(runtime, 'output-symlink'));
  assert.equal(linkedResult.code, 2);
  assert.match(linkedResult.stderr, /SYMLINK_DENIED/);

  const sidecar = await copyVariant('active-sidecar');
  await fs.writeFile(path.join(sidecar, 'message/message_0.db-wal'), Buffer.from('synthetic WAL marker'));
  const sidecarResult = await runImport(sidecar, path.join(runtime, 'output-sidecar'));
  assert.equal(sidecarResult.code, 2);
  assert.match(sidecarResult.stderr, /ACTIVE_DATABASE_DENIED/);
});

test('key stdin rejects trailing values, oversized second lines and malformed hex without echoing secrets', async () => {
  const samples = [
    `${JSON.stringify({ keyHex: fixture.keyHex })} {"extra":true}\n`,
    `${JSON.stringify({ keyHex: fixture.keyHex })}\n${'A'.repeat(17000)}\n`,
    JSON.stringify({ keyHex: 'private-invalid-key-marker' }) + '\n',
    JSON.stringify({ keyHex: fixture.keyHex, password: 'private-password-marker' }) + '\n'
  ];
  for (const [index, input] of samples.entries()) {
    const output = path.join(runtime, `invalid-stdin-${index}`);
    const result = await runProcess(importer, ['--source-dir', fixture.sourceDir, '--output-dir', output], input);
    assert.equal(result.code, 2, `input case ${index}: ${result.stderr}`);
    assert.match(result.stderr, /KEY_INPUT_INVALID/);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes(fixture.keyHex), false);
    assert.equal(result.stderr.includes('private-'), false);
    await assert.rejects(fs.stat(output), { code: 'ENOENT' });
  }
});

test('filesystem names containing URI metacharacters are interpreted as paths during SQLite verification', async () => {
  const parent = path.join(runtime, 'output?literal#fragment');
  await fs.mkdir(parent);
  const output = path.join(parent, 'snapshot');
  const result = await runImport(fixture.sourceDir, output);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true);
  for (const file of fixture.manifest.files) assert.equal(await hash(path.join(output, file.relativePath)), file.plaintextSha256);
});
