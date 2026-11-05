#!/usr/bin/env node
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_STATIC_DIR = path.join(root, '.runtime', 'v4-encrypted-static', 'wechat2-static');
const STATIC_MANIFEST = '.alpha-v4-encrypted-static.json';
const MAX_MANIFEST_BYTES = 1024 * 1024;

// These names are deliberately an allowlist. The report contains only whether
// a variable is set; values (including paths, tokens and keys) never enter the
// returned object or human output.
const KEY_ENV_NAMES = Object.freeze([
  'ALPHA_INDEPENDENT_KEY_HELPER_PATH',
  'ALPHA_XKEY_HELPER_PATH',
  'ALPHA_XKEY_LEGACY_HELPER_PATH',
  'ALPHA_XKEY_LEGACY_LIBRARY_PATH',
  'ALPHA_NATIVE_VAULT_DIR',
  'ALPHA_NATIVE_VAULT_KEY_PROVIDER',
  'ALPHA_NATIVE_VAULT_ROOT_KEY_FILE',
  'ALPHA_NATIVE_VAULT_STORAGE_KEY_FILE',
  'ALPHA_NATIVE_VAULT_TICKET_KEY_FILE',
  'ALPHA_NATIVE_VAULT_WINDOWS_HELLO_ENVELOPE',
  'ALPHA_NATIVE_VAULT_WINDOWS_HELLO_KEY_NAME',
  'ALPHA_NATIVE_VAULT_WINDOWS_HELLO_PROMPT',
  'ALPHA_LICENSE_INSTALLATION_ID',
  'ALPHA_LICENSE_INSTALLATION_ID_FILE',
  'ALPHA_LICENSE_PRODUCT_CODE',
  'ALPHA_LICENSE_V2_LEASE_SIGNING',
  'ALPHA_LICENSE_V2_RESPONSE_SIGNING'
]);

const MANIFEST_SCHEMA = 'alpha-independent-v4-encrypted-static-copy-manifest.v1';

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanAbsolute(value, code) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value || value === path.parse(value).root || value.includes('\0')) {
    throw failure(code);
  }
  return value;
}

async function explicitDirectory(value, fsApi = fs) {
  const directory = cleanAbsolute(value, 'KEY_DIAGNOSTICS_STATIC_DIR_INVALID');
  let current = path.parse(directory).root;
  for (const part of directory.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    let stat;
    try { stat = await fsApi.lstat(current); } catch (error) {
      if (error?.code === 'ENOENT') throw failure('KEY_DIAGNOSTICS_STATIC_DIR_MISSING');
      throw failure('KEY_DIAGNOSTICS_STATIC_DIR_UNAVAILABLE');
    }
    if (stat.isSymbolicLink()) {
      // macOS exposes /var (and sometimes /tmp) as system aliases to /private.
      // Permit only those fixed aliases; a caller-provided directory or any
      // other ancestor symlink remains rejected.
      const resolved = await fsApi.realpath(current).catch(() => '');
      const alias = (current === '/var' && resolved === '/private/var') || (current === '/tmp' && resolved === '/private/tmp');
      if (!alias) throw failure('KEY_DIAGNOSTICS_STATIC_DIR_REJECTED');
      continue;
    }
    if (!stat.isDirectory()) throw failure('KEY_DIAGNOSTICS_STATIC_DIR_REJECTED');
  }
  return directory;
}

function envPresence(environment) {
  const names = new Set(KEY_ENV_NAMES);
  // Native xkey challenge material has used a family of names. Record only
  // the names, never their values, so an added member remains diagnosable.
  for (const name of Object.keys(environment ?? {})) {
    if (/^ALPHA_XKEY_AUTH_[A-Z0-9_]+$/.test(name)) names.add(name);
  }
  return [...names].sort().map(name => {
    const present = Object.prototype.hasOwnProperty.call(environment ?? {}, name);
    const value = present ? environment[name] : undefined;
    return {
      name,
      present,
      nonEmpty: typeof value === 'string' && value.trim().length > 0
    };
  });
}

function helperPathSummary(value, fsApi = fsSync) {
  const configured = typeof value === 'string' && value.trim().length > 0;
  if (!configured) return {
    configured: false,
    absolute: false,
    exists: false,
    regularFile: false,
    symlink: false,
    executable: false,
    status: 'not-configured'
  };
  if (!path.isAbsolute(value) || path.normalize(value) !== value || value.includes('\0')) return {
    configured: true,
    absolute: path.isAbsolute(value),
    exists: false,
    regularFile: false,
    symlink: false,
    executable: false,
    status: 'rejected'
  };
  let stat;
  try { stat = fsApi.lstatSync(value); } catch (error) {
    return {
      configured: true,
      absolute: true,
      exists: error?.code !== 'ENOENT',
      regularFile: false,
      symlink: false,
      executable: false,
      status: error?.code === 'ENOENT' ? 'missing' : 'unavailable'
    };
  }
  const symlink = stat.isSymbolicLink();
  const regularFile = stat.isFile() && !symlink;
  const executable = regularFile && (stat.mode & 0o111) !== 0;
  return {
    configured: true,
    absolute: true,
    exists: true,
    regularFile,
    symlink,
    executable,
    status: regularFile && executable ? 'valid' : 'rejected'
  };
}

function boundedInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function staticManifestMetadata(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw failure('KEY_DIAGNOSTICS_MANIFEST_INVALID');
  if (manifest.schema !== MANIFEST_SCHEMA || manifest.scope !== 'alpha-independent-v4-encrypted-static-copy') throw failure('KEY_DIAGNOSTICS_MANIFEST_SCHEMA_UNSUPPORTED');
  if (manifest.encrypted_static_copy !== true || manifest.sidecars_excluded !== true || manifest.source_static_required !== true || manifest.read_only !== true || manifest.complete !== false || manifest.native_schema_supported !== false) throw failure('KEY_DIAGNOSTICS_MANIFEST_BOUNDARY_INVALID');
  if (!boundedInteger(manifest.file_count, 1) || !boundedInteger(manifest.total_bytes) || !boundedInteger(manifest.sidecar_count) || !boundedInteger(manifest.sidecar_bytes)) throw failure('KEY_DIAGNOSTICS_MANIFEST_COUNTS_INVALID');
  if (!Array.isArray(manifest.files) || manifest.files.length !== manifest.file_count || manifest.files.length > 10000) throw failure('KEY_DIAGNOSTICS_MANIFEST_FILES_INVALID');
  for (const file of manifest.files) {
    if (!file || typeof file !== 'object' || Array.isArray(file) || typeof file.path !== 'string' || !file.path || path.posix.isAbsolute(file.path) || file.path.split('/').includes('..') || !boundedInteger(file.bytes) || !/^[0-9a-f]{64}$/i.test(file.sha256 ?? '')) throw failure('KEY_DIAGNOSTICS_MANIFEST_FILES_INVALID');
  }
  return {
    schema: manifest.schema,
    scope: manifest.scope,
    encryptedStaticCopy: true,
    sidecarsExcluded: true,
    readOnly: true,
    complete: false,
    nativeSchemaSupported: false,
    fileCount: manifest.file_count,
    totalBytes: manifest.total_bytes,
    sidecarCount: manifest.sidecar_count,
    sidecarBytes: manifest.sidecar_bytes
  };
}

async function inspectStaticManifest(staticDir, fsApi = fs) {
  if (staticDir === undefined || staticDir === null || staticDir === '') return {
    configured: false,
    status: 'not-configured',
    manifest: null
  };
  let directory;
  try { directory = await explicitDirectory(staticDir, fsApi); } catch (error) {
    return { configured: true, status: error.code === 'KEY_DIAGNOSTICS_STATIC_DIR_MISSING' ? 'missing' : 'rejected', manifest: null, errorCode: error.code || 'KEY_DIAGNOSTICS_STATIC_DIR_UNAVAILABLE' };
  }
  const manifestPath = path.join(directory, STATIC_MANIFEST);
  let stat;
  try { stat = await fsApi.lstat(manifestPath); } catch (error) {
    return { configured: true, status: error?.code === 'ENOENT' ? 'missing-manifest' : 'unavailable', manifest: null, errorCode: error?.code === 'ENOENT' ? 'KEY_DIAGNOSTICS_MANIFEST_MISSING' : 'KEY_DIAGNOSTICS_MANIFEST_UNAVAILABLE' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { configured: true, status: 'rejected', manifest: null, errorCode: 'KEY_DIAGNOSTICS_MANIFEST_REJECTED' };
  if (stat.size > MAX_MANIFEST_BYTES) return { configured: true, status: 'rejected', manifest: null, errorCode: 'KEY_DIAGNOSTICS_MANIFEST_TOO_LARGE' };
  try {
    const metadata = staticManifestMetadata(JSON.parse(await fsApi.readFile(manifestPath, 'utf8')));
    return { configured: true, status: 'valid', manifest: metadata };
  } catch (error) {
    return { configured: true, status: 'rejected', manifest: null, errorCode: error.code || 'KEY_DIAGNOSTICS_MANIFEST_INVALID' };
  }
}

function overallStatus(helper, staticCopy) {
  const rejected = helper.status === 'rejected' || staticCopy.status === 'rejected';
  if (rejected) return 'rejected';
  const available = helper.status === 'valid' || staticCopy.status === 'valid';
  if (available) return 'configured';
  return 'unavailable';
}

async function inspectKeySources({ environment = process.env, helperPath = environment?.ALPHA_INDEPENDENT_KEY_HELPER_PATH, staticDir = environment?.ALPHA_INDEPENDENT_ENCRYPTED_DIR, fsApi = fs } = {}) {
  const helper = helperPathSummary(helperPath);
  const staticCopy = await inspectStaticManifest(staticDir, fsApi);
  const variables = envPresence(environment);
  return {
    schema: 'alpha-independent-key-source-diagnostics.v1',
    scope: 'alpha-independent-key-source-diagnostics',
    status: overallStatus(helper, staticCopy),
    readOnly: true,
    complete: false,
    nativeSchemaSupported: false,
    keyRead: false,
    activeDatabaseRead: false,
    helper,
    environment: { valuesOmitted: true, variables },
    staticCopy,
    limitations: [
      'diagnostic-only',
      'key-acquisition-not-attempted',
      'active-database-not-opened',
      'environment-values-omitted'
    ]
  };
}

function printHuman(report) {
  console.log(`Key-source diagnostics: ${report.status}`);
  console.log(`helper: ${report.helper.status}; static copy: ${report.staticCopy.status}`);
  const configured = report.environment.variables.filter(item => item.nonEmpty).map(item => item.name);
  console.log(`key-related environment variables set: ${configured.length ? configured.join(', ') : 'none'}`);
  if (report.staticCopy.manifest) {
    const metadata = report.staticCopy.manifest;
    console.log(`static manifest: ${metadata.fileCount} files; ${metadata.totalBytes} bytes; ${metadata.sidecarCount} sidecars excluded`);
  }
  console.log('read-only: true; key read: false; active database read: false; values omitted: true');
}

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--json') {
      if (values.json) throw failure('KEY_DIAGNOSTICS_USAGE');
      values.json = true;
      continue;
    }
    if (option !== '--static-dir' || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--') || values['static-dir']) throw failure('KEY_DIAGNOSTICS_USAGE');
    values['static-dir'] = argv[++index];
  }
  return values;
}

export { DEFAULT_STATIC_DIR, KEY_ENV_NAMES, MANIFEST_SCHEMA, cleanAbsolute, envPresence, helperPathSummary, inspectKeySources, inspectStaticManifest, parse, staticManifestMetadata };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parse(process.argv.slice(2));
    const report = await inspectKeySources({ staticDir: options['static-dir'] || process.env.ALPHA_INDEPENDENT_ENCRYPTED_DIR || DEFAULT_STATIC_DIR });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report);
    if (report.status === 'rejected' || report.status === 'unavailable') process.exitCode = 2;
  } catch (error) {
    process.stderr.write(`${error?.code || error?.message || 'KEY_DIAGNOSTICS_FAILED'}\n`);
    process.exitCode = 2;
  }
}
