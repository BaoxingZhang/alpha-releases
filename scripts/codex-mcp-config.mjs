import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const transport = path.join(root, 'packages', 'alpha-engine', 'mcp-stdio.cjs');

function fail(message) {
  throw new Error(`CODEX_MCP_CONFIG_${message}`);
}

function absolute(value, name) {
  if (typeof value !== 'string' || !value || !path.isAbsolute(value) || path.normalize(value) !== value || value.includes('\0')) fail(`${name}_INVALID`);
  return value;
}

function parseArgs(argv) {
  const options = { node: process.execPath, output: '', format: 'json', server_name: 'alpha' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) fail('ARGUMENTS_INVALID');
    const name = argument.slice(2);
    if (!['state-dir', 'data-dir', 'bridge-path', 'account-id', 'node', 'output', 'format', 'server-name'].includes(name)) fail('ARGUMENTS_INVALID');
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) fail('ARGUMENTS_INVALID');
    options[name.replaceAll('-', '_')] = value;
  }
  for (const name of ['state_dir', 'data_dir', 'bridge_path']) absolute(options[name], name.toUpperCase());
  if (typeof options.account_id !== 'string' || !options.account_id || options.account_id.length > 256 || /[\u0000-\u001f\u007f]/.test(options.account_id)) fail('ACCOUNT_ID_INVALID');
  options.node = absolute(options.node, 'NODE');
  if (options.output) options.output = absolute(options.output, 'OUTPUT');
  if (!['json', 'codex-toml', 'toml'].includes(options.format)) fail('FORMAT_INVALID');
  if (typeof options.server_name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(options.server_name)) fail('SERVER_NAME_INVALID');
  return options;
}

function document(options) {
  return {
    mcpServers: {
      [options.server_name]: {
        command: options.node,
        args: [transport],
        env: {
          ALPHA_INDEPENDENT_STATE_DIR: options.state_dir,
          ALPHA_INDEPENDENT_DATA_DIR: options.data_dir,
          ALPHA_INDEPENDENT_BRIDGE_PATH: options.bridge_path,
          ALPHA_INDEPENDENT_ACCOUNT_ID: options.account_id
        }
      }
    }
  };
}

function tomlString(value) {
  // JSON basic strings are valid TOML basic strings and correctly escape
  // paths/account ids without allowing table or key injection.
  return JSON.stringify(value);
}

function tomlDocument(options) {
  const section = `mcp_servers.${options.server_name}`;
  return [
    `[${section}]`,
    `command = ${tomlString(options.node)}`,
    `args = [${tomlString(transport)}]`,
    `cwd = ${tomlString(root)}`,
    '',
    `[${section}.env]`,
    `ALPHA_INDEPENDENT_STATE_DIR = ${tomlString(options.state_dir)}`,
    `ALPHA_INDEPENDENT_DATA_DIR = ${tomlString(options.data_dir)}`,
    `ALPHA_INDEPENDENT_BRIDGE_PATH = ${tomlString(options.bridge_path)}`,
    `ALPHA_INDEPENDENT_ACCOUNT_ID = ${tomlString(options.account_id)}`,
    ''
  ].join('\n');
}

const options = parseArgs(process.argv.slice(2));
const serialized = options.format === 'json'
  ? `${JSON.stringify(document(options), null, 2)}\n`
  : tomlDocument(options);
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true, mode: 0o700 });
  const temporary = `${options.output}.${process.pid}.tmp`;
  await fs.writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
  try {
    await fs.rename(temporary, options.output);
  } finally {
    await fs.rm(temporary, { force: true });
  }
} else {
  process.stdout.write(serialized);
}
