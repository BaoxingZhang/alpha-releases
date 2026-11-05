import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { envPresence, helperPathSummary, inspectKeySources, inspectStaticManifest, parse } from '../scripts/key-source-diagnostics.mjs';

const manifestName = '.alpha-v4-encrypted-static.json';

async function fixture(t, { manifest = true } = {}) {
  const tempRoot = await fs.realpath(os.tmpdir());
  const directory = await fs.mkdtemp(path.join(tempRoot, 'alpha-key-source-diagnostics-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  if (manifest) {
    await fs.writeFile(path.join(directory, manifestName), JSON.stringify({
      schema: 'alpha-independent-v4-encrypted-static-copy-manifest.v1',
      scope: 'alpha-independent-v4-encrypted-static-copy',
      account_id: 'secret-account-must-not-leak',
      encrypted_static_copy: true,
      sidecars_excluded: true,
      source_static_required: true,
      read_only: true,
      complete: false,
      native_schema_supported: false,
      file_count: 43,
      total_bytes: 13484032,
      sidecar_count: 46,
      sidecar_bytes: 1234,
      files: Array.from({ length: 43 }, (_, index) => ({ path: `contact/contact-${index}.db`, sha256: 'a'.repeat(64), bytes: 100 }))
    }), { mode: 0o600 });
  }
  return directory;
}

test('key-source diagnostics parses only the static-dir option', () => {
  assert.deepEqual(parse(['--static-dir', '/tmp/authorized-copy', '--json']), { 'static-dir': '/tmp/authorized-copy', json: true });
  assert.throws(() => parse(['--json', '--json']), /KEY_DIAGNOSTICS_USAGE/);
  assert.throws(() => parse(['--static-dir', '/tmp/a', '--static-dir', '/tmp/b']), /KEY_DIAGNOSTICS_USAGE/);
});

test('valid explicit helper and encrypted-static manifest report metadata without secrets', async t => {
  const staticDir = await fixture(t);
  const helperPath = path.join(staticDir, 'helper');
  await fs.writeFile(helperPath, '#!/bin/sh\nexit 1\n', { mode: 0o700 });
  await fs.writeFile(path.join(staticDir, 'contact.db'), 'DATABASE_SECRET_MUST_NOT_BE_READ');
  await fs.writeFile(`${path.join(staticDir, 'contact.db')}-wal`, 'ACTIVE_SIDECAR_MUST_NOT_BE_READ');
  const report = await inspectKeySources({
    environment: {
      ALPHA_INDEPENDENT_KEY_HELPER_PATH: helperPath,
      ALPHA_NATIVE_VAULT_ROOT_KEY_FILE: '/private/secret/key-material',
      ALPHA_XKEY_AUTH_TICKET: 'secret-ticket'
    },
    staticDir
  });
  assert.equal(report.status, 'configured');
  assert.equal(report.helper.status, 'valid');
  assert.equal(report.helper.path, undefined);
  assert.equal(report.staticCopy.status, 'valid');
  assert.deepEqual(report.staticCopy.manifest, {
    schema: 'alpha-independent-v4-encrypted-static-copy-manifest.v1',
    scope: 'alpha-independent-v4-encrypted-static-copy',
    encryptedStaticCopy: true,
    sidecarsExcluded: true,
    readOnly: true,
    complete: false,
    nativeSchemaSupported: false,
    fileCount: 43,
    totalBytes: 13484032,
    sidecarCount: 46,
    sidecarBytes: 1234
  });
  assert.equal(report.keyRead, false);
  assert.equal(report.activeDatabaseRead, false);
  assert.equal(report.environment.valuesOmitted, true);
  const encoded = JSON.stringify(report);
  for (const secret of [helperPath, '/private/secret/key-material', 'secret-ticket', 'DATABASE_SECRET_MUST_NOT_BE_READ', 'secret-account-must-not-leak']) assert.equal(encoded.includes(secret), false, secret);
  assert.equal(report.environment.variables.find(item => item.name === 'ALPHA_NATIVE_VAULT_ROOT_KEY_FILE')?.nonEmpty, true);
});

test('helper path validation rejects relative paths, symlinks and non-executables', async t => {
  const directory = await fixture(t, { manifest: false });
  const regular = path.join(directory, 'regular');
  await fs.writeFile(regular, 'not executable', { mode: 0o600 });
  assert.equal(helperPathSummary('relative-helper').status, 'rejected');
  assert.equal(helperPathSummary(regular).status, 'rejected');
  const link = path.join(directory, 'link');
  await fs.symlink(regular, link);
  assert.equal(helperPathSummary(link).status, 'rejected');
  assert.equal(helperPathSummary(path.join(directory, 'missing')).status, 'missing');
});

test('static manifest failures are fail-closed and do not inspect database files', async t => {
  const directory = await fixture(t, { manifest: false });
  await fs.writeFile(path.join(directory, 'message.db'), 'DATABASE_CONTENT_SHOULD_NOT_BE_OPENED');
  await fs.writeFile(path.join(directory, manifestName), '{"schema":"wrong"}', { mode: 0o600 });
  const report = await inspectKeySources({ environment: {}, staticDir: directory });
  assert.equal(report.status, 'rejected');
  assert.equal(report.staticCopy.status, 'rejected');
  assert.equal(report.staticCopy.errorCode, 'KEY_DIAGNOSTICS_MANIFEST_SCHEMA_UNSUPPORTED');
  assert.equal(JSON.stringify(report).includes('DATABASE_CONTENT_SHOULD_NOT_BE_OPENED'), false);
  const missing = await inspectStaticManifest(path.join(directory, 'missing-copy'));
  assert.equal(missing.status, 'missing');
});

test('environment report exposes names and presence only', () => {
  const result = envPresence({ ALPHA_INDEPENDENT_KEY_HELPER_PATH: '', ALPHA_XKEY_AUTH_CHALLENGE: 'sensitive', ALPHA_NATIVE_VAULT_DIR: '/private/vault' });
  const helper = result.find(item => item.name === 'ALPHA_INDEPENDENT_KEY_HELPER_PATH');
  assert.deepEqual(helper, { name: 'ALPHA_INDEPENDENT_KEY_HELPER_PATH', present: true, nonEmpty: false });
  assert.equal(result.find(item => item.name === 'ALPHA_XKEY_AUTH_CHALLENGE')?.nonEmpty, true);
  const encoded = JSON.stringify(result);
  assert.equal(encoded.includes('sensitive'), false);
  assert.equal(encoded.includes('/private/vault'), false);
});
