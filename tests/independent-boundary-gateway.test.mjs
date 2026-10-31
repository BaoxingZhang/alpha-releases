import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { parse } from '@babel/parser';

// Evaluate only named declarations from the actual source in a stubbed context.
// Never import the recovered Electron entrypoint or launch an original binary.
const source = fs.readFileSync(new URL('../src/main/index.js', import.meta.url), 'utf8');
const ast = parse(source, { sourceType: 'unambiguous' });
const declaration = name => {
  const node = ast.program.body.find(node => node.id?.name === name);
  assert.ok(node, `missing source declaration: ${name}`);
  return source.slice(node.start, node.end);
};
function initializer(name, node = ast) {
  if (node?.type === 'VariableDeclarator' && node.id.name === name) return source.slice(node.init.start, node.init.end);
  for (const value of Object.values(node ?? {})) {
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) { const result = initializer(name, child); if (result) return result; }
    } else if (value?.type) { const result = initializer(name, value); if (result) return result; }
  }
}
const gatewaySource = `${declaration('PersonaGatewayError')}\n${declaration('PersonaGatewayService')}\nPersonaGatewayService`;
function environment(backend = 'independent', packaged = false) {
  return {
    electron: { app: { isPackaged: packaged } },
    process: { env: { ALPHA_RECOVERY_BACKEND: backend }, resourcesPath: '/synthetic/resources' }
  };
}
function gateway(backend, packaged) {
  const Gateway = vm.runInNewContext(gatewaySource, {
    ...environment(backend, packaged), defaultDependencies: {}, boundedTimeout() {},
    DEFAULT_STARTUP_TIMEOUT_MS: 1000, DEFAULT_SHUTDOWN_TIMEOUT_MS: 1000
  });
  return new Gateway({});
}

test('independent gateway rejects before configuration reads or subprocess startup', async () => {
  const service = gateway('independent', false);
  let reads = 0;
  let starts = 0;
  service.options.agentConfiguration = async () => { reads++; return {}; };
  service.startConfigured = async () => { starts++; return { state: 'unexpected' }; };
  await assert.rejects(service.getOrStart(), error => error.code === 'INDEPENDENT_FEATURE_UNIMPLEMENTED' && error.message === 'INDEPENDENT_FEATURE_UNIMPLEMENTED');
  assert.equal(reads, 0);
  assert.equal(starts, 0);
  assert.equal(service.status().state, 'stopped');
});

test('original and packaged gateway modes retain their original startup entry', async () => {
  for (const [backend, packaged] of [['original', false], ['independent', true]]) {
    const service = gateway(backend, packaged);
    let starts = 0;
    service.startConfigured = async () => { starts++; return 'original-start'; };
    assert.equal(await service.getOrStart(), 'original-start');
    assert.equal(starts, 1);
  }
});

function allowed(backend = 'independent', packaged = false, locked = false) {
  let reads = 0;
  const fn = vm.runInNewContext(`(${declaration('assertHttpApiAllowed')})`, {
    ...environment(backend, packaged), apiLockTransition: false, gatewayWindowSuspended: false,
    shutdownStarted: false, blocksBusinessOperations: () => false,
    engine: { async getApplicationLockStatus() { reads++; return { locked }; } }
  });
  return { fn, reads: () => reads };
}

test('independent HTTP gate rejects before reading engine state; original lock gate remains', async () => {
  const independent = allowed();
  await assert.rejects(independent.fn(), { message: 'INDEPENDENT_FEATURE_UNIMPLEMENTED' });
  assert.equal(independent.reads(), 0);
  for (const [backend, packaged] of [['original', false], ['independent', true]]) {
    const original = allowed(backend, packaged);
    await original.fn();
    assert.equal(original.reads(), 1);
    await assert.rejects(allowed(backend, packaged, true).fn(), { message: 'HTTP_API_OPERATION_BLOCKED' });
  }
});

test('stored enabled HTTP config reports explicit unsupported state and never connects/listens', async () => {
  let connections = 0;
  let listeners = 0;
  const HttpApi = vm.runInNewContext(`(${declaration('HttpApiService')})`, {
    node_http: { createServer() { listeners++; throw new Error('must not listen'); } }
  });
  const service = new HttpApi('/synthetic/http.json', {
    allowed: allowed().fn,
    async connection() { connections++; }
  });
  service.config.enabled = true;
  service.token = 'synthetic-http-test-token-does-not-leave-process';
  await service.reconcileNow();
  assert.equal(service.status().state, 'error');
  assert.equal(service.status().errorCode, 'INDEPENDENT_FEATURE_UNIMPLEMENTED');
  assert.equal(connections, 0);
  assert.equal(listeners, 0);
});

test('enabling HTTP in independent mode rejects before persisting configuration', async () => {
  let saves = 0;
  const HttpApi = vm.runInNewContext(`(${declaration('HttpApiService')})`, { parseHttpApiUpdate: value => value });
  const service = new HttpApi('/synthetic/http.json', { allowed: allowed().fn });
  service.save = async () => { saves++; };
  await assert.rejects(service.update({ enabled: true }), { message: 'INDEPENDENT_FEATURE_UNIMPLEMENTED' });
  assert.equal(saves, 0);
  assert.equal(service.status().enabled, false);
});

test('independent settings do not discover or advertise the original MCP command', () => {
  const expression = initializer('mcpStdioPath');
  assert.ok(expression);
  for (const [backend, packaged, expectedLookups] of [['independent', false, 0], ['original', false, 1], ['independent', true, 1]]) {
    let lookups = 0;
    const result = vm.runInNewContext(expression, {
      ...environment(backend, packaged), node_path: path,
      node_fs: { existsSync() { lookups++; return true; } },
      mcpStdioName: 'alpha-mcp-stdio', workspaceRoot: '/synthetic/project'
    });
    assert.equal(lookups, expectedLookups);
    if (!expectedLookups) assert.equal(result, undefined);
    else assert.ok(result.endsWith('/alpha-mcp-stdio'));
  }
});
