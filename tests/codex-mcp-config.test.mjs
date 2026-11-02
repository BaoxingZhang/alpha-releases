import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/codex-mcp-config.mjs');

test('Codex MCP config generator emits absolute independent stdio settings without reading data', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-codex-config-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const stateDir = path.join(directory, 'state');
  const dataDir = path.join(directory, 'authorized-copy');
  const bridgePath = path.join(directory, 'alpha-data-bridge');
  const output = path.join(directory, 'codex.json');
  const { stdout } = await execute(process.execPath, [script, '--state-dir', stateDir, '--data-dir', dataDir, '--bridge-path', bridgePath, '--account-id', 'synthetic-account']);
  const config = JSON.parse(stdout);
  assert.equal(config.mcpServers.alpha.args[0], path.join(root, 'packages/alpha-engine/mcp-stdio.cjs'));
  assert.equal(config.mcpServers.alpha.env.ALPHA_INDEPENDENT_DATA_DIR, dataDir);
  assert.equal(await fs.stat(dataDir).then(() => true, () => false), false);
  await execute(process.execPath, [script, '--state-dir', stateDir, '--data-dir', dataDir, '--bridge-path', bridgePath, '--account-id', 'synthetic-account', '--output', output]);
  assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), config);
  await assert.rejects(execute(process.execPath, [script, '--state-dir', 'relative', '--data-dir', dataDir, '--bridge-path', bridgePath, '--account-id', 'synthetic-account']), /CODEX_MCP_CONFIG_STATE_DIR_INVALID/);
});
