#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const MAX_FILES = 10000;
const MAX_DATABASES = 128;
const MAX_TABLES = 4096;
const MAX_COLUMNS = 256;
const MAX_DEPTH = 8;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanAbsolute(value, code = 'SCHEMA_ONLY_DATA_DIR_INVALID') {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value || value === path.parse(value).root || value.includes('\0')) {
    throw failure(code);
  }
  return value;
}

async function explicitDirectory(value) {
  const directory = cleanAbsolute(value);
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fs.lstat(current); } catch { throw failure('SCHEMA_ONLY_DATA_DIR_UNAVAILABLE'); }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw failure('SCHEMA_ONLY_SYMLINK_OR_NON_DIRECTORY');
  }
  return directory;
}

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--json') {
      if (values.json) throw failure('SCHEMA_ONLY_USAGE');
      values.json = true;
      continue;
    }
    if (option !== '--data-dir' || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--') || values['data-dir']) {
      throw failure('SCHEMA_ONLY_USAGE');
    }
    values['data-dir'] = argv[++index];
  }
  if (!values['data-dir']) throw failure('SCHEMA_ONLY_USAGE');
  return values;
}

function relativePath(root, value) {
  const relative = path.relative(root, value);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw failure('SCHEMA_ONLY_PATH_ESCAPE');
  return relative.split(path.sep).join('/');
}

async function inventory(root) {
  const files = [];
  const stack = [{ directory: root, depth: 0 }];
  let visited = 0;
  while (stack.length) {
    const { directory, depth } = stack.pop();
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      visited += 1;
      if (visited > MAX_FILES) throw failure('SCHEMA_ONLY_DATASET_TOO_LARGE');
      const full = path.join(directory, entry.name);
      const stat = await fs.lstat(full);
      if (stat.isSymbolicLink()) throw failure('SCHEMA_ONLY_SYMLINK_DENIED');
      if (entry.isDirectory()) {
        if (depth + 1 > MAX_DEPTH) throw failure('SCHEMA_ONLY_DATASET_TOO_LARGE');
        stack.push({ directory: full, depth: depth + 1 });
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.db')) {
        files.push({ path: full, relative: relativePath(root, full), stat });
      } else if (!entry.isFile()) {
        // A FIFO, socket, device or other special entry could block or have
        // side effects during a later inspection. Keep the selected copy
        // limited to ordinary files and directories.
        throw failure('SCHEMA_ONLY_UNSUPPORTED_ENTRY');
      }
    }
  }
  files.sort((left, right) => left.relative.localeCompare(right.relative));
  if (files.length > MAX_DATABASES) throw failure('SCHEMA_ONLY_TOO_MANY_DATABASES');
  return files;
}

function sqliteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function errorEntry(file, code, message) {
  return { path: file.relative, code, message: String(message || code).slice(0, 512) };
}

function inspectDatabase(file) {
  let database;
  try {
    database = new DatabaseSync(file.path, { readOnly: true });
    database.exec('PRAGMA query_only=ON');
    const queryOnly = Number(database.prepare('PRAGMA query_only').get().query_only);
    if (queryOnly !== 1) throw failure('SCHEMA_ONLY_READONLY_UNVERIFIED');
    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    if (tables.length > MAX_TABLES) throw failure('SCHEMA_ONLY_TOO_MANY_TABLES');
    const result = { path: file.relative, sizeBytes: file.stat.size, tables: [] };
    for (const row of tables) {
      const name = String(row.name);
      const columns = database.prepare(`PRAGMA table_info(${sqliteIdentifier(name)})`).all();
      if (columns.length > MAX_COLUMNS) throw failure('SCHEMA_ONLY_TOO_MANY_COLUMNS');
      result.tables.push({
        name,
        columns: columns.map(column => ({
          name: String(column.name),
          type: String(column.type || ''),
          notNull: Number(column.notnull) !== 0,
          primaryKey: Number(column.pk),
          ...(column.dflt_value === null || column.dflt_value === undefined ? {} : { defaultValue: column.dflt_value })
        }))
      });
    }
    return result;
  } catch (error) {
    const code = typeof error?.code === 'string' && error.code.startsWith('SCHEMA_ONLY_')
      ? error.code
      : 'SCHEMA_ONLY_SQLITE_READ_FAILED';
    throw failure(code, error?.message || code);
  } finally {
    try { database?.close(); } catch {}
  }
}

async function inspectSchemaOnly({ dataDir }) {
  const root = await explicitDirectory(dataDir);
  const files = await inventory(root);
  const databases = [];
  const errors = [];
  let tableCount = 0;
  for (const file of files) {
    let sidecarError = '';
    for (const suffix of ['-wal', '-shm', '-journal']) {
      try { await fs.lstat(`${file.path}${suffix}`); sidecarError = 'SCHEMA_ONLY_ACTIVE_DATABASE_DENIED'; break; } catch (error) {
        if (error?.code !== 'ENOENT') { sidecarError = 'SCHEMA_ONLY_PATH_UNAVAILABLE'; break; }
      }
    }
    if (sidecarError) {
      errors.push(errorEntry(file, sidecarError, 'Database has an active SQLite sidecar or cannot be checked'));
      continue;
    }
    try {
      const before = await fs.stat(file.path);
      const inspected = inspectDatabase({ ...file, stat: before });
      const after = await fs.stat(file.path);
      if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
        errors.push(errorEntry(file, 'SCHEMA_ONLY_DATASET_CHANGED', 'Database changed during read; metadata is not stable'));
        continue;
      }
      tableCount += inspected.tables.length;
      if (tableCount > MAX_TABLES) throw failure('SCHEMA_ONLY_TOO_MANY_TABLES');
      databases.push(inspected);
    } catch (error) {
      errors.push(errorEntry(file, error?.code || 'SCHEMA_ONLY_SQLITE_READ_FAILED', error?.message));
    }
  }
  const status = databases.length > 0 ? (errors.length ? 'partial' : 'ready') : 'unavailable';
  const result = {
    schema: 'alpha-independent-schema-only-diagnostics.v1',
    scope: 'alpha-independent-schema-only-diagnostics',
    status,
    readOnly: true,
    complete: false,
    nativeSchemaSupported: false,
    databases,
    errors,
    tableCount,
    limits: { maxFiles: MAX_FILES, maxDatabases: MAX_DATABASES, maxTables: MAX_TABLES, maxColumnsPerTable: MAX_COLUMNS, maxDepth: MAX_DEPTH, maxResponseBytes: MAX_RESPONSE_BYTES }
  };
  const encoded = JSON.stringify(result);
  if (Buffer.byteLength(encoded, 'utf8') > MAX_RESPONSE_BYTES) throw failure('SCHEMA_ONLY_RESPONSE_TOO_LARGE');
  return result;
}

function printHuman(report) {
  console.log(`Schema-only diagnostics: ${report.status}`);
  console.log(`databases: ${report.databases.length}; tables: ${report.tableCount}; errors: ${report.errors.length}`);
  console.log('read-only: true; complete: false; native schema supported: false');
  for (const error of report.errors) console.log(`error: ${error.path}: ${error.code}`);
}

export { cleanAbsolute, explicitDirectory, inspectSchemaOnly, parse };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parse(process.argv.slice(2));
    const report = await inspectSchemaOnly({ dataDir: options['data-dir'] });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (report.status === 'unavailable') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'SCHEMA_ONLY_FAILED'}\n`);
    process.exitCode = 2;
  }
}
