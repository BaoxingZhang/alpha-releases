import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = path.join(root, 'workers/agent/dist/index.cjs');

function varint(value) {
  let number = BigInt(value);
  const bytes = [];
  do {
    let byte = Number(number & 0x7fn);
    number >>= 7n;
    if (number) byte |= 0x80;
    bytes.push(byte);
  } while (number);
  return Buffer.from(bytes);
}

function fieldString(field, value) {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([varint(BigInt(field << 3 | 2)), varint(bytes.length), bytes]);
}

function fieldVarint(field, value) {
  return Buffer.concat([varint(BigInt(field << 3)), varint(value)]);
}

function fieldBytes(field, bytes) {
  return Buffer.concat([varint(BigInt(field << 3 | 2)), varint(bytes.length), bytes]);
}

function framed(kind, method, requestId, payload) {
  const body = Buffer.allocUnsafe(6 + payload.length);
  body.writeUInt8(kind, 0);
  body.writeUInt8(method, 1);
  body.writeUInt32BE(requestId, 2);
  payload.copy(body, 6);
  const prefix = Buffer.allocUnsafe(4);
  prefix.writeUInt32BE(body.length, 0);
  return Buffer.concat([prefix, body]);
}

function helloPayload() {
  return Buffer.concat([
    fieldVarint(1, 1),
    fieldVarint(2, 0),
    fieldString(3, 'fixture-test'),
    fieldBytes(4, Buffer.from('nonce'))
  ]);
}

function turnPayload(prompt) {
  const provider = Buffer.concat([fieldString(2, 'fixture'), fieldString(3, 'fixture-model')]);
  const part = fieldString(1, prompt);
  const message = Buffer.concat([fieldVarint(2, 1), fieldBytes(3, part)]);
  return Buffer.concat([
    fieldString(1, 'fixture-run'),
    fieldString(2, 'fixture-turn'),
    fieldBytes(3, provider),
    fieldBytes(4, message)
  ]);
}

function readVarint(bytes, offset) {
  let value = 0n;
  let shift = 0n;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if (!(byte & 0x80)) return { value, offset };
    shift += 7n;
  }
  throw new Error('truncated varint');
}

function fields(bytes) {
  const result = [];
  let offset = 0;
  while (offset < bytes.length) {
    const tag = readVarint(bytes, offset);
    offset = tag.offset;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (wire === 0) {
      const value = readVarint(bytes, offset);
      offset = value.offset;
      result.push({ field, wire, value: value.value });
    } else if (wire === 2) {
      const length = readVarint(bytes, offset);
      offset = length.offset;
      const end = offset + Number(length.value);
      if (end > bytes.length) throw new Error('truncated length-delimited field');
      result.push({ field, wire, value: bytes.subarray(offset, end) });
      offset = end;
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
  }
  return result;
}

function decodeOutput(frameBytes) {
  const bodyLength = frameBytes.readUInt32BE(0);
  assert.equal(bodyLength, frameBytes.length - 4);
  const body = frameBytes.subarray(4);
  return {
    kind: body[0],
    method: body[1],
    requestId: body.readUInt32BE(2),
    payload: body.subarray(6)
  };
}

function decodeProviderEvent(payload) {
  const event = { text: '', finished: false, failure: undefined };
  for (const item of fields(payload)) {
    if (item.field === 10 && item.wire === 2) {
      const text = fields(item.value).find((part) => part.field === 2 && part.wire === 2);
      if (text) event.text += text.value.toString('utf8');
    }
    if (item.field === 14 && item.wire === 2) {
      const reason = fields(item.value).find((part) => part.field === 1 && part.wire === 2);
      event.finished = reason?.value.toString('utf8') === 'stop';
    }
    if (item.field === 15 && item.wire === 2) event.failure = fields(item.value);
  }
  return event;
}

test('agent worker fixture responds locally without a model network request', { timeout: 10_000 }, async () => {
  const child = spawn(process.execPath, [host], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ALPHA_AGENT_PROVIDER_KIND: 'fixture' } });
  const frames = [];
  const waiters = [];
  let pending = Buffer.alloc(0);
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdout.on('data', (chunk) => {
    pending = Buffer.concat([pending, chunk]);
    while (pending.length >= 4) {
      const size = pending.readUInt32BE(0);
      if (pending.length < size + 4) break;
      const output = decodeOutput(pending.subarray(0, size + 4));
      pending = pending.subarray(size + 4);
      const waiter = waiters.shift();
      if (waiter) waiter(output);
      else frames.push(output);
    }
  });
  const next = () => frames.length ? Promise.resolve(frames.shift()) : new Promise((resolve) => waiters.push(resolve));
  try {
    child.stdin.write(framed(1, 1, 1, helloPayload()));
    const hello = await next();
    assert.equal(hello.kind, 2);
    assert.equal(hello.method, 1);
    const providerKinds = fields(hello.payload).filter((item) => item.field === 4).map((item) => item.value.toString('utf8'));
    assert.ok(providerKinds.includes('fixture'));

    child.stdin.write(framed(1, 2, 2, turnPayload('hello fixture')));
    let text = '';
    let finish;
    for (;;) {
      const output = await next();
      if (output.requestId !== 2 || output.method !== 2) continue;
      if (output.kind === 3) {
        const event = decodeProviderEvent(output.payload);
        text += event.text;
        if (event.failure) assert.fail(`fixture failed: ${JSON.stringify(event.failure)}`);
        if (event.finished) finish = true;
      }
      if (output.kind === 4) break;
    }
    assert.equal(text, 'fixture:hello fixture');
    assert.equal(finish, true);
  } finally {
    child.stdin.end();
    child.kill();
    await new Promise((resolve) => child.once('close', resolve));
    assert.equal(stderr, '', `agent worker wrote unexpected stderr: ${stderr}`);
  }
});
