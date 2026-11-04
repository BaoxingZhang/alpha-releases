import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse, preflightV4Copy } from '../scripts/preflight-v4-copy.mjs';

test('v4 preflight keeps schema-only and source readiness separate', async () => {
  const dataDir = await fs.mkdtemp(path.join(process.cwd(), '.runtime/preflight-v4-'));
  try {
  const report = await preflightV4Copy({
    dataDir,
    account: 'sanitized-v4',
    inspectSchema: async ({ dataDir }) => ({ schema: 'alpha-independent-schema-only-diagnostics.v1', status: 'ready', readOnly: true, complete: false, nativeSchemaSupported: false, databases: [], errors: [], tableCount: 0, checked: dataDir }),
    inspectSrc: async () => { const error = new Error('bridge schema mismatch'); error.code = 'SCHEMA_UNSUPPORTED'; throw error; }
  });
  assert.equal(report.schema, 'alpha-independent-v4-preflight.v1');
  assert.equal(report.status, 'schema-only');
  assert.equal(report.read_only, true);
  assert.equal(report.complete, false);
  assert.equal(report.native_schema_supported, false);
  assert.equal(report.source.status, 'unavailable');
  assert.equal(report.source.code, 'SCHEMA_UNSUPPORTED');
  assert.equal(report.account_id, 'sanitized-v4');
  assert.equal(report.schema_only.checked, dataDir);
  } finally { await fs.rm(dataDir, { recursive: true, force: true }); }
});

test('v4 preflight reports ready only when the source diagnostic is ready', async () => {
  const dataDir = await fs.mkdtemp(path.join(process.cwd(), '.runtime/preflight-v4-'));
  try {
  const report = await preflightV4Copy({
    dataDir,
    account: 'sanitized-v4',
    inspectSchema: async () => ({ schema: 'alpha-independent-schema-only-diagnostics.v1', status: 'partial', databases: [], errors: [{ path: 'message.db', code: 'SCHEMA_ONLY_SQLITE_READ_FAILED' }], tableCount: 0 }),
    inspectSrc: async () => ({ status: 'ready', diagnostics: { sourceKind: 'explicit-offline-sqlite-schema', databases: [], tableCount: 3 } })
  });
  assert.equal(report.status, 'ready');
  assert.deepEqual(report.source, { status: 'ready', diagnostics: { sourceKind: 'explicit-offline-sqlite-schema', databases: [], tableCount: 3 } });
  } finally { await fs.rm(dataDir, { recursive: true, force: true }); }
});

test('v4 preflight rejects unsafe paths and malformed labels', async () => {
  assert.throws(() => parse(['--data-dir', '/tmp/a', '--data-dir', '/tmp/b', '--account-id', 'x']), /V4_PREFLIGHT_USAGE/);
  assert.throws(() => parse(['--data-dir', '/tmp/a']), /V4_PREFLIGHT_USAGE/);
  const report = await preflightV4Copy({ dataDir: '/tmp/../tmp/a', account: 'sanitized-v4', inspectSchema: async () => { throw new Error('must not run'); } });
  assert.equal(report.status, 'rejected');
  assert.equal(report.error.code, 'SOURCE_DATA_DIR_INVALID');
});
