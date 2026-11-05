import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { parseRequest } from '../packages/alpha-engine/mcp-stdio.cjs';
import { createFixture } from './data-bridge-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('standalone MCP stdio parser accepts one JSON-RPC object per line and rejects malformed input', () => {
  assert.deepEqual(parseRequest('{"jsonrpc":"2.0","id":1,"method":"ping"}'), { jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.equal(parseRequest('not-json'), null);
  assert.equal(parseRequest('[]'), null);
  assert.equal(parseRequest('null'), null);
});

test('standalone MCP stdio completes initialize/tools/list and exits cleanly at EOF', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/mcp-stdio-test-'));
  const stateDir = path.join(directory, 'state');
  const dataDir = path.join(directory, 'data');
  await fs.mkdir(stateDir, { recursive: true, mode: 0o700 });
  const fixture = await createFixture(dataDir);
  const child = spawn(process.execPath, [path.join(root, 'packages/alpha-engine/mcp-stdio.cjs')], {
    cwd: root,
    env: {
      ...process.env,
      ALPHA_INDEPENDENT_STATE_DIR: stateDir,
      ALPHA_INDEPENDENT_BRIDGE_PATH: bridgePath,
      ALPHA_INDEPENDENT_DATA_DIR: dataDir,
      ALPHA_INDEPENDENT_ACCOUNT_ID: fixture.accountId,
      ALPHA_INDEPENDENT_SELF_USERNAME: 'wxid_self'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await fs.rm(directory, { recursive: true, force: true });
  });
  let stdout = '';
  let stderr = '';
  const responses = [];
  let wake;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    stdout += chunk;
    for (;;) {
      const newline = stdout.indexOf('\n');
      if (newline < 0) break;
      const line = stdout.slice(0, newline); stdout = stdout.slice(newline + 1);
      if (line.trim()) responses.push(JSON.parse(line));
      wake?.(); wake = undefined;
    }
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const waitFor = async count => {
    const deadline = Date.now() + 5000;
    while (responses.length < count) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`MCP_STDIO_TIMEOUT responses=${responses.length} stderr=${stderr}`);
      await Promise.race([new Promise(resolve => { wake = resolve; }), new Promise(resolve => setTimeout(resolve, remaining))]);
    }
    return responses.splice(0, count);
  };
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })}\n`);
  const [initialize, tools] = await waitFor(2);
  assert.equal(initialize.id, 1);
  assert.equal(initialize.result.serverInfo.name, 'alpha-independent-readonly');
  assert.equal(tools.id, 2);
  assert.equal(tools.result.tools.length, 91);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'wechat.core.get_status', arguments: {} } })}\n`);
  const [status] = await waitFor(1);
  assert.equal(status.id, 3);
  assert.equal(status.result.isError, undefined);
  assert.equal(status.result.structuredContent.status, 'ready');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'wechat.core.get_lock_status', arguments: {} } })}\n`);
  const [lockStatus] = await waitFor(1);
  assert.equal(lockStatus.id, 4);
  assert.equal(lockStatus.result.isError, undefined);
  assert.equal(lockStatus.result.structuredContent.scope, 'alpha-independent-lock-status');
  assert.equal(lockStatus.result.structuredContent.read_only, true);
  assert.equal(Object.hasOwn(lockStatus.result.structuredContent, 'password_failed_attempts'), false);
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'alpha-independent.components.get_status', arguments: { component: 5 } } })}\n`);
  const [advancedComponents] = await waitFor(1);
  assert.equal(advancedComponents.id, 5);
  assert.equal(advancedComponents.result.isError, undefined);
  assert.equal(advancedComponents.result.structuredContent.scope, 'alpha-independent-component-status');
  assert.equal(advancedComponents.result.structuredContent.component, 'ADVANCED_COMPONENT_KIND_WCDB_MUTATION');
  assert.equal(advancedComponents.result.structuredContent.availability, 'ADVANCED_COMPONENT_AVAILABILITY_UNSUPPORTED_TARGET');
  assert.equal(advancedComponents.result.structuredContent.error_code, 'INDEPENDENT_ADVANCED_COMPONENT_UNSUPPORTED');
  assert.equal(advancedComponents.result.structuredContent.complete, false);
  assert.equal(advancedComponents.result.structuredContent.native_schema_supported, false);
  child.stdin.end();
  const [exit] = await once(child, 'exit');
  assert.equal(exit, 0);
  assert.equal(stderr, '');
});
