import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from '@babel/parser';

// Test the recovered desktop queue and its real call-site selector without
// importing the Electron entrypoint or starting any subprocess.
const source = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'unambiguous' });
function declaration(name) {
  const node = ast.program.body.find(value => value.id?.name === name);
  assert.ok(node, `missing source declaration: ${name}`);
  return node;
}
const slice = node => source.slice(node.start, node.end);
const independentModeSource = slice(declaration('independentBackendEnabled'));
const prioritySource = slice(declaration('engineRequestPriority'));
const queueSource = slice(declaration('EngineRequestQueue'));
const callNode = declaration('EngineClient').body.body.find(node => node.type === 'ClassMethod' && node.key.name === 'call');
assert.ok(callNode, 'EngineClient.call must exist in the actual desktop source');

function desktop(t, backend, packaged) {
  const context = vm.createContext({
    setTimeout, clearTimeout, Buffer,
    electron: { app: { isPackaged: packaged } },
    process: { env: { ALPHA_RECOVERY_BACKEND: backend } },
    backendMode: { isIndependentBackendEnabled(app, environment) { return environment.ALPHA_RECOVERY_BACKEND === 'independent' && (!app.isPackaged || environment.ALPHA_INDEPENDENT_PACKAGED === '1'); } },
    EngineClientFrame: { encode(frame) { return { finish: () => Buffer.from(String(frame.requestId)) }; } },
    encodeLengthDelimitedFrame: value => value
  });
  const { Queue, call, priority } = vm.runInContext(`${independentModeSource}\n${prioritySource}\n${queueSource}\n({ Queue: EngineRequestQueue, call: ({ ${slice(callNode)} }).call, priority: engineRequestPriority })`, context);
  const queue = new Queue(5000), sent = [], pending = [];
  const client = {
    requests: queue,
    child: { stdin: { write(bytes, done) { sent.push(BigInt(bytes.toString('utf8'))); done(); } } },
    failAll(error) { queue.failAll(error); }
  };
  t.after(async () => { queue.failAll(new Error('TEST_FINISHED')); await Promise.allSettled(pending); });
  return {
    queue, sent, priority,
    request(id, method) {
      const value = call.call(client, { requestId: id, [method]: {} }, 5000);
      pending.push(value); value.catch(() => {});
      return value;
    }
  };
}

test('actual independent desktop call lets status and lock reach the engine before import completes', async t => {
  const app = desktop(t, 'independent', false);
  let importCompleted = false;
  const imported = app.request(1n, 'importDatabaseKey').then(value => { importCompleted = true; return value; });
  const status = app.request(2n, 'getApplicationLockStatus');
  const locked = app.request(3n, 'lockApplication');
  assert.deepEqual(app.sent, [1n, 2n]);
  assert.equal(importCompleted, false);
  app.queue.receive(2n, { locked: false });
  assert.deepEqual(await status, { locked: false });
  assert.deepEqual(app.sent, [1n, 2n, 3n]);
  assert.equal(importCompleted, false);
  app.queue.receive(3n, { locked: true });
  assert.deepEqual(await locked, { locked: true });
  assert.equal(importCompleted, false);
  app.queue.receive(1n, { error: 'APP_LOCK_LOCKED' });
  assert.deepEqual(await imported, { error: 'APP_LOCK_LOCKED' });
});

test('actual original desktop call keeps import, status and lock in the original serial queue', async t => {
  const app = desktop(t, 'original', false);
  const imported = app.request(1n, 'importDatabaseKey');
  const status = app.request(2n, 'getApplicationLockStatus');
  const locked = app.request(3n, 'lockApplication');
  assert.deepEqual(app.sent, [1n]);
  app.queue.receive(1n, 'import-finished'); assert.equal(await imported, 'import-finished');
  assert.deepEqual(app.sent, [1n, 2n]);
  app.queue.receive(2n, 'status-finished'); assert.equal(await status, 'status-finished');
  assert.deepEqual(app.sent, [1n, 2n, 3n]);
  app.queue.receive(3n, 'lock-finished'); assert.equal(await locked, 'lock-finished');
});

test('packaged desktop ignores the independent environment flag for queue routing', async t => {
  const app = desktop(t, 'independent', true);
  const imported = app.request(1n, 'importDatabaseKey');
  const locked = app.request(2n, 'lockApplication');
  assert.deepEqual(app.sent, [1n]);
  app.queue.receive(1n, 'original-import-finished'); await imported;
  assert.deepEqual(app.sent, [1n, 2n]);
  app.queue.receive(2n, 'original-lock-finished'); await locked;
});

test('priority defaults and other request lanes remain unchanged', t => {
  const { priority } = desktop(t, 'independent', false);
  assert.equal(priority({ importDatabaseKey: {} }), 'interactive');
  assert.equal(priority({ importDatabaseKey: {} }, false), 'interactive');
  assert.equal(priority({ importDatabaseKey: {} }, true), 'bypass');
  for (const independent of [true, false]) {
    assert.equal(priority({ watchDatabaseKeyAcquisition: {} }, independent), 'bypass');
    assert.equal(priority({ getApplicationLockStatus: {} }, independent), 'interactive');
    assert.equal(priority({ lockApplication: {} }, independent), 'interactive');
    assert.equal(priority({ listMessages: {} }, independent), 'normal');
    assert.equal(priority({ getDataRevision: {} }, independent), 'background');
  }
});
