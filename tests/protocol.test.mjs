import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const protocolDirectory = path.join(root, 'packages/alpha-protocol');
const { EngineClientFrame, EngineServerFrame, encodeLengthDelimitedFrame, LengthDelimitedFrameDecoder, FrameProtocolError, DEFAULT_MAX_FRAME_BYTES, IPC_CHANNELS } = require(protocolDirectory);
const hash = value => createHash('sha256').update(value).digest('hex');
const encode = (codec, value) => Buffer.from(codec.encode(codec.fromPartial(value)).finish());

test('known client and server wire vectors match the recovered protobuf field numbers', () => {
  const hello = Buffer.from('080752071205302e332e35', 'hex');
  assert.deepEqual(encode(EngineClientFrame, { requestId: 7n, hello: { desktopVersion: '0.3.5' } }), hello);
  const request = EngineClientFrame.decode(hello);
  assert.equal(request.requestId, 7n);
  assert.equal(request.hello.desktopVersion, '0.3.5');
  const denial = Buffer.from('080712080a0644454e494544', 'hex');
  assert.deepEqual(encode(EngineServerFrame, { requestId: 7n, error: { code: 'DENIED' } }), denial);
  assert.equal(EngineServerFrame.decode(denial).error.code, 'DENIED');
});

test('all client and server envelope variants have a working dependency closure', () => {
  for (const codec of [EngineClientFrame, EngineServerFrame]) {
    const fields = Object.keys(codec.fromPartial({})).filter(name => name !== 'requestId');
    assert.ok(fields.length > 100, 'the complete recovered envelope is available');
    for (const field of fields) {
      const input = codec.fromPartial({ requestId: 23n, [field]: {} });
      const output = codec.decode(codec.encode(input).finish());
      assert.deepEqual(output, input, `round-trip of ${field}`);
    }
  }
});

test('nested messages preserve unicode, bytes, optional fields and 64-bit integers', () => {
  const input = EngineServerFrame.fromPartial({
    requestId: 18446744073709551615n,
    listMessages: {
      items: [{ id: 'message-1', conversationId: 'conversation-1', sourceId: 'import-1', sentAtUnixMs: 1793491200123n, direction: 2, kind: 'text', text: '你好，Alpha 👋', serverId: 9007199254740993n, displayJson: new Uint8Array([0, 127, 255]) }],
      nextCursor: new Uint8Array([1, 2, 254, 255]), appliedAfterUnixMs: 0n
    }
  });
  assert.deepEqual(EngineServerFrame.decode(EngineServerFrame.encode(input).finish()), input);
  const json = EngineServerFrame.toJSON(input);
  assert.equal(json.requestId, '18446744073709551615');
  assert.equal(json.listMessages.items[0].serverId, '9007199254740993');
  assert.deepEqual(EngineServerFrame.fromJSON(json), input);
});

test('uint64 bounds and malformed protobuf payloads are rejected', () => {
  for (const codec of [EngineClientFrame, EngineServerFrame]) {
    for (const requestId of [-1n, 18446744073709551616n]) assert.throws(() => encode(codec, { requestId }), /uint64 too large/);
    assert.throws(() => codec.decode(Buffer.from([0x08, 0x80])));
    assert.throws(() => codec.decode(Buffer.from([0x52, 0x05, 0x12, 0x03, 0x61])));
  }
});

test('unknown protobuf fields do not prevent known fields from being decoded', () => {
  // field 200, varint value 123; future protocol fields may be present.
  const body = Buffer.concat([encode(EngineClientFrame, { requestId: 99n }), Buffer.from([0xc0, 0x0c, 0x7b])]);
  assert.equal(EngineClientFrame.decode(body).requestId, 99n);
});

test('4-byte big-endian framing survives every split and coalesced packets', () => {
  const payloads = [encode(EngineClientFrame, { requestId: 1n, hello: { desktopVersion: '0.3.5' } }), Buffer.alloc(0), Buffer.from([0, 1, 2, 255])];
  const frames = payloads.map(encodeLengthDelimitedFrame);
  assert.deepEqual(frames[0].subarray(0, 4), Buffer.from([0, 0, 0, payloads[0].length]));
  const stream = Buffer.concat(frames);
  for (let split = 0; split <= stream.length; split++) {
    const decoder = new LengthDelimitedFrameDecoder();
    const output = [...decoder.push(stream.subarray(0, split)), ...decoder.push(stream.subarray(split))];
    assert.deepEqual(output, payloads, `split offset ${split}`);
    assert.doesNotThrow(() => decoder.finish());
  }
  const bytewise = new LengthDelimitedFrameDecoder();
  assert.deepEqual([...stream].flatMap(byte => bytewise.push(Buffer.from([byte]))), payloads);
  bytewise.finish();
});

test('EOF rejects truncated headers and bodies, then clears incomplete state', () => {
  const framed = encodeLengthDelimitedFrame(Buffer.from('payload'));
  for (let length = 1; length < framed.length; length++) {
    const decoder = new LengthDelimitedFrameDecoder();
    assert.deepEqual(decoder.push(framed.subarray(0, length)), []);
    assert.throws(() => decoder.finish(), error => error instanceof FrameProtocolError && error.code === 'TRUNCATED_FRAME');
    assert.doesNotThrow(() => decoder.finish());
    assert.deepEqual(decoder.push(framed), [Buffer.from('payload')]);
  }
});

test('oversized frame headers are rejected without waiting for the body', () => {
  assert.equal(DEFAULT_MAX_FRAME_BYTES, 16 * 1024 * 1024);
  const header = Buffer.alloc(4);
  header.writeUInt32BE(DEFAULT_MAX_FRAME_BYTES + 1);
  assert.throws(() => new LengthDelimitedFrameDecoder().push(header), error => error.code === 'FRAME_TOO_LARGE');
  const decoder = new LengthDelimitedFrameDecoder(4);
  assert.deepEqual(decoder.push(encodeLengthDelimitedFrame(Buffer.from('1234'))), [Buffer.from('1234')]);
  assert.throws(() => decoder.push(encodeLengthDelimitedFrame(Buffer.from('12345'))), error => error.code === 'FRAME_TOO_LARGE');
  assert.deepEqual(decoder.push(encodeLengthDelimitedFrame(Buffer.from('ok'))), [Buffer.from('ok')]);
  const onlyEmpty = new LengthDelimitedFrameDecoder(0);
  assert.deepEqual(onlyEmpty.push(Buffer.alloc(4)), [Buffer.alloc(0)]);
  for (const limit of [-1, 0.5, NaN, Infinity, 4294967296]) assert.throws(() => new LengthDelimitedFrameDecoder(limit), RangeError);
  // The size guard runs before allocation; do not allocate a multi-GiB fixture.
  assert.throws(() => encodeLengthDelimitedFrame({ byteLength: 4294967296 }), error => error.code === 'FRAME_TOO_LARGE');
});

test('IPC contracts and complete bindings are available without loading Electron/main', async () => {
  assert.equal(IPC_CHANNELS.listAccounts, 'alpha:accounts:list');
  assert.equal(IPC_CHANNELS.pageMessages, 'alpha:messages:page');
  assert.ok(Object.isFrozen(IPC_CHANNELS));
  const manifest = JSON.parse(await fs.readFile(path.join(protocolDirectory, 'source-manifest.json'), 'utf8'));
  const bindings = require(path.join(protocolDirectory, 'bindings.cjs'));
  const selected = manifest.modules.find(module => module.file === 'bindings.cjs');
  assert.deepEqual(Object.keys(bindings).sort(), selected.selectedBindings);
  assert.equal(bindings.EngineClientFrame, EngineClientFrame);
  assert.deepEqual(selected.externalModules.map(item => item.module), ['@bufbuild/protobuf/wire']);
  assert.ok(!Object.keys(require.cache).some(file => file.includes('/node_modules/electron/') || file === path.join(root, 'src/main/index.js')));
});

test('source hashes and AST node ranges identify the untouched original declarations', async () => {
  const manifest = JSON.parse(await fs.readFile(path.join(protocolDirectory, 'source-manifest.json'), 'utf8'));
  for (const source of manifest.sources) assert.equal(hash(await fs.readFile(path.join(root, source.path))), source.sha256);
  for (const module of manifest.modules) {
    const source = await fs.readFile(path.join(root, module.source), 'utf8');
    assert.equal(hash(await fs.readFile(path.join(protocolDirectory, module.file))), module.sha256);
    let previousEnd = 0;
    for (const declaration of module.declarations) {
      assert.ok(declaration.node.start >= previousEnd && declaration.node.end > declaration.node.start);
      previousEnd = declaration.node.end;
      assert.equal(hash(source.slice(declaration.original.startOffset, declaration.original.endOffset)), declaration.original.sha256);
    }
  }
  const verified = spawnSync(process.execPath, ['tools/extract-protocol.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(verified.status, 0, verified.stderr);
});

test('the extractor refuses an unexpected external mapping before writing output', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-protocol-extraction-'));
  try {
    const original = await fs.readFile(path.join(root, 'src/main/index.js'), 'utf8');
    const altered = original.replace('const wire = require("@bufbuild/protobuf/wire");', 'const wire = require("electron");');
    assert.notEqual(altered, original);
    const main = path.join(temporary, 'untrusted-main.js');
    const output = path.join(temporary, 'out');
    await fs.writeFile(main, altered);
    const result = spawnSync(process.execPath, ['tools/extract-protocol.mjs', '--main', main, '--out', output], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /External dependency mapping rejected: wire/);
    await assert.rejects(fs.access(output), { code: 'ENOENT' });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('the extractor refuses hidden initialization of a selected codec outside its declaration', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-protocol-side-effect-'));
  try {
    const original = await fs.readFile(path.join(root, 'src/main/index.js'), 'utf8');
    const main = path.join(temporary, 'altered-main.js');
    const output = path.join(temporary, 'out');
    // This code must only be parsed: executing it would change the codec.
    await fs.writeFile(main, original + '\n(() => { EngineClientFrame.injected = true; })();\n');
    const result = spawnSync(process.execPath, ['tools/extract-protocol.mjs', '--main', main, '--out', output], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unreviewed top-level consumer\/initialization of EngineClientFrame/);
    await assert.rejects(fs.access(output), { code: 'ENOENT' });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
