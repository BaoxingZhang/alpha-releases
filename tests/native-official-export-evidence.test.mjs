import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('native official export evidence remains bound to the shipped artifact', async () => {
  const evidence = JSON.parse(await fs.readFile(path.join(root, 'docs/native-official-export-evidence.json'), 'utf8'));
  const artifactPath = path.join(root, evidence.artifact.path);
  const bytes = await fs.readFile(artifactPath);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), evidence.artifact.sha256);
  assert.equal(evidence.schema, 'alpha.native-official-export-evidence.v1');
  assert.equal(evidence.artifact.architecture, 'arm64');
  assert.equal(evidence.artifact.format, 'mach-o');
  for (const type of [
    'OfficialExportSpec',
    'SensitiveTicket',
    'MaterialDeliveryTicket',
    'MaterialOfficialExportStatus',
    'OperationPermitClaims'
  ]) assert.ok(evidence.observedProtocolTypes.includes(type), type);
  assert.equal(evidence.observedProcedureFacts.find(item => item.name === 'parse_arguments').address, '0x100000880');
  assert.equal(evidence.observedProcedureFacts.find(item => item.name === 'job_state_name').address, '0x1000a4f40');
  for (const value of [
    'cli.selection_source_invalid',
    'cli.material_source_invalid',
    'cli.management_arguments_invalid',
    'cli.resume_spec_conflict',
    'on_mode_conflict--account--official-account--scope--download-assets--include-media--max-pages--timeout-seconds--material-bundle-id'
  ]) assert.ok(evidence.observedStrings.includes(value), value);
  assert.equal(evidence.scope.staticOnly, true);
  assert.equal(evidence.scope.executed, false);
  assert.equal(evidence.scope.nativeSchemaSupported, false);
  assert.equal(evidence.scope.writerEnabled, false);
  assert.ok(evidence.limitations.length >= 3);
});
