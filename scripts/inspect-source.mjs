#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_STDOUT_BYTES = 4 * 1024 * 1024;
const MAX_STDERR_BYTES = 16 * 1024;

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanAbsolute(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value || value === path.parse(value).root) throw failure(code);
  return value;
}

async function explicitDirectory(value) {
  const directory = cleanAbsolute(value, 'SOURCE_DATA_DIR_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch { throw failure('SOURCE_DATA_DIR_UNAVAILABLE'); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('SOURCE_DATA_DIR_INVALID');
  }
  return directory;
}

function accountId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_@.-]{1,128}$/.test(value)) throw failure('SOURCE_ACCOUNT_ID_INVALID');
  return value;
}

function parse(argv) {
  const values = {};
  const allowed = new Set(['data-dir', 'account-id', 'json']);
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--json') {
      if (values.json) throw failure('SOURCE_USAGE');
      values.json = true;
      continue;
    }
    if (!option?.startsWith('--') || !allowed.has(option.slice(2)) || option === '--json' || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) throw failure('SOURCE_USAGE');
    const key = option.slice(2);
    if (Object.hasOwn(values, key)) throw failure('SOURCE_USAGE');
    values[key] = argv[++index];
  }
  if (!values['data-dir'] || !values['account-id']) throw failure('SOURCE_USAGE');
  return values;
}

async function bridgeBinary() {
  const binary = path.join(root, 'build/candidates/alpha-data-bridge');
  let stat;
  try { stat = await fs.lstat(binary); } catch { throw failure('SOURCE_BRIDGE_MISSING', 'Run npm run build:bridge before inspecting a source.'); }
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o111) === 0) throw failure('SOURCE_BRIDGE_INVALID');
  return binary;
}

async function inspectSource({ dataDir, account, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const binary = await bridgeBinary();
  const child = spawn(binary, ['--data-dir', dataDir, '--account-id', account], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdout = '';
  let stderr = '';
  const output = new Promise((resolve, reject) => {
    const reader = createInterface({ input: child.stdout });
    reader.on('line', line => {
      stdoutBytes += Buffer.byteLength(line, 'utf8') + 1;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        reader.close();
        child.kill('SIGTERM');
        reject(failure('SOURCE_RESPONSE_TOO_LARGE'));
        return;
      }
      stdout += `${line}\n`;
    });
    child.stdout.on('error', error => reject(error));
    child.once('error', error => reject(error));
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_STDERR_BYTES) stderr += chunk.toString('utf8');
    });
  });
  const timeout = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
  try {
    child.stdin.end(JSON.stringify({ id: 'source-diagnostics', op: 'schema.inspect', params: {} }) + '\n');
    const outcome = await output;
    if (outcome.signal) throw failure('SOURCE_BRIDGE_TERMINATED');
    if (outcome.code !== 0) {
      const code = /^([A-Z][A-Z0-9_]{1,95}):/m.exec(stderr)?.[1] || 'SOURCE_BRIDGE_FAILED';
      throw failure(code, stderr.trim() || code);
    }
  } finally {
    clearTimeout(timeout);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  let response;
  try { response = JSON.parse(stdout); } catch { throw failure('SOURCE_RESPONSE_INVALID'); }
  if (response.id !== 'source-diagnostics' || response.ok !== true || !response.result || typeof response.result !== 'object') {
    throw failure(response?.error?.code || 'SOURCE_RESPONSE_INVALID', response?.error?.message || 'Bridge did not return a successful schema diagnostic');
  }
  return {
    schema: 'alpha-independent-source-diagnostics-cli.v1',
    scope: 'alpha-independent-source-diagnostics',
    status: 'ready',
    read_only: true,
    complete: false,
    native_schema_supported: false,
    account_id: account,
    diagnostics: response.result
  };
}

function printHuman(report) {
  const databases = report.diagnostics.databases?.length ?? 0;
  const tables = report.diagnostics.tableCount ?? 0;
  console.log(`Source diagnostics: ${report.status}`);
  console.log(`scope: ${report.scope}; account: ${report.account_id}; databases: ${databases}; tables: ${tables}`);
  console.log('read-only: true; complete: false; native schema supported: false');
}

export { accountId, cleanAbsolute, explicitDirectory, inspectSource, parse };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parse(process.argv.slice(2));
    const dataDir = await explicitDirectory(options['data-dir']);
    const account = accountId(options['account-id']);
    const report = await inspectSource({ dataDir, account });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
  } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'SOURCE_INSPECTION_FAILED'}\n`);
    process.exitCode = 2;
  }
}
