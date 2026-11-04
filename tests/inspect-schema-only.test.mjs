import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { cleanAbsolute, inspectSchemaOnly, parse } from '../scripts/inspect-schema-only.mjs';

const execute = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const script = path.join(root, 'scripts/inspect-schema-only.mjs');
const base = path.join(root, '.runtime/inspect-schema-only-tests');
await fs.mkdir(base, { recursive: true });
await fs.mkdir(base, { recursive: true });

async function snapshot(directory) {
  const result = {};
  for (const entry of await fs.readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    result[path.relative(directory, file)] = createHash('sha256').update(await fs.readFile(file)).digest('hex');
  }
  return result;
}

function createDatabase(file, statements) {
  const database = new DatabaseSync(file);
  for (const statement of statements) database.exec(statement);
  database.close();
}

test('schema-only diagnostics lists a mismatched core schema without opening the business bridge', async t => {
  const outer = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(outer, { recursive: true, force: true }));
  const dataDir = path.join(outer, 'copy');
  await fs.mkdir(path.join(dataDir, 'db_storage', 'contact'), { recursive: true });
  createDatabase(path.join(dataDir, 'db_storage', 'contact', 'contact.db'), [
    'CREATE TABLE contact (id INTEGER PRIMARY KEY, username TEXT, local_type INTEGER, unexpected BLOB)',
    'CREATE TABLE ContactExtra (value TEXT)'
  ]);
  const before = await snapshot(dataDir);
  const report = await inspectSchemaOnly({ dataDir });
  assert.equal(report.schema, 'alpha-independent-schema-only-diagnostics.v1');
  assert.equal(report.status, 'ready');
  assert.equal(report.readOnly, true);
  assert.equal(report.complete, false);
  assert.equal(report.nativeSchemaSupported, false);
  assert.equal(report.databases.length, 1);
  assert.equal(report.databases[0].path, 'db_storage/contact/contact.db');
  assert.deepEqual(report.databases[0].tables.map(table => table.name), ['ContactExtra', 'contact']);
  assert.ok(report.databases[0].tables.find(table => table.name === 'contact').columns.some(column => column.name === 'unexpected'));
  assert.deepEqual(await snapshot(dataDir), before);
});

test('schema-only diagnostics retains readable metadata when another database is encrypted or malformed', async t => {
  const outer = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(outer, { recursive: true, force: true }));
  const dataDir = path.join(outer, 'copy');
  await fs.mkdir(dataDir, { recursive: true });
  createDatabase(path.join(dataDir, 'readable.db'), ['CREATE TABLE ok (id INTEGER PRIMARY KEY, value TEXT)']);
  await fs.writeFile(path.join(dataDir, 'encrypted-looking.db'), Buffer.from('not sqlite'));
  const report = await inspectSchemaOnly({ dataDir });
  assert.equal(report.status, 'partial');
  assert.equal(report.databases.length, 1);
  assert.equal(report.databases[0].path, 'readable.db');
  assert.equal(report.errors.length, 1);
  assert.equal(report.errors[0].path, 'encrypted-looking.db');
  assert.match(report.errors[0].code, /SCHEMA_ONLY/);
});

test('schema-only diagnostics rejects unsafe paths and duplicate arguments', () => {
  assert.throws(() => cleanAbsolute('relative/path'), /SCHEMA_ONLY_DATA_DIR_INVALID/);
  assert.throws(() => cleanAbsolute('/tmp/../tmp/path'), /SCHEMA_ONLY_DATA_DIR_INVALID/);
  assert.throws(() => parse(['--data-dir', '/tmp/path', '--data-dir', '/tmp/other']), /SCHEMA_ONLY_USAGE/);
  assert.deepEqual(parse(['--data-dir', '/tmp/path', '--json']), { 'data-dir': '/tmp/path', json: true });
});

test('schema-only diagnostics rejects symlinks and active SQLite sidecars', async t => {
  const outer = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(outer, { recursive: true, force: true }));
  const dataDir = path.join(outer, 'copy');
  await fs.mkdir(path.join(dataDir, 'nested'), { recursive: true });
  createDatabase(path.join(dataDir, 'nested', 'ok.db'), ['CREATE TABLE ok (id INTEGER PRIMARY KEY)']);
  await fs.writeFile(path.join(dataDir, 'nested', 'ok.db-wal'), Buffer.from('sidecar'));
  const sidecar = await inspectSchemaOnly({ dataDir });
  assert.equal(sidecar.status, 'unavailable');
  assert.equal(sidecar.databases.length, 0);
  assert.equal(sidecar.errors[0].code, 'SCHEMA_ONLY_ACTIVE_DATABASE_DENIED');

  await fs.rm(path.join(dataDir, 'nested', 'ok.db-wal'));
  await fs.symlink(path.join(dataDir, 'nested', 'ok.db'), path.join(dataDir, 'linked.db'));
  await assert.rejects(inspectSchemaOnly({ dataDir }), /SCHEMA_ONLY_SYMLINK_DENIED/);
});

test('schema-only diagnostics rejects special filesystem entries', async t => {
  const outer = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(outer, { recursive: true, force: true }));
  const dataDir = path.join(outer, 'copy');
  await fs.mkdir(dataDir, { recursive: true });
  const fifo = path.join(dataDir, 'stream');
  await execute('mkfifo', [fifo]);
  await assert.rejects(inspectSchemaOnly({ dataDir }), /SCHEMA_ONLY_UNSUPPORTED_ENTRY/);
});

test('schema-only diagnostics CLI reports malformed core schema without claiming readiness', async t => {
  const outer = await fs.mkdtemp(path.join(base, 'case-'));
  t.after(() => fs.rm(outer, { recursive: true, force: true }));
  const dataDir = path.join(outer, 'copy');
  await fs.mkdir(dataDir, { recursive: true });
  createDatabase(path.join(dataDir, 'contact.db'), ['CREATE TABLE unrelated (value TEXT)']);
  const { stdout, stderr } = await execute(process.execPath, [script, '--data-dir', dataDir, '--json'], { cwd: root, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(stderr, '');
  const report = JSON.parse(stdout);
  assert.equal(report.status, 'ready');
  assert.equal(report.complete, false);
  assert.equal(report.nativeSchemaSupported, false);
  assert.equal(report.databases[0].tables[0].name, 'unrelated');
});
