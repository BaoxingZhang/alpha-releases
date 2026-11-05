import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('native message sidecar evidence remains bound to the shipped artifact', async () => {
  const evidence = JSON.parse(await fs.readFile(path.join(root, 'docs/native-message-send-evidence.json'), 'utf8'));
  const artifactPath = path.join(root, evidence.artifact.path);
  const bytes = await fs.readFile(artifactPath);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), evidence.artifact.sha256);
  assert.equal(evidence.artifact.architecture, 'arm64');
  assert.equal(evidence.artifact.format, 'mach-o');
  assert.ok(evidence.artifact.procedureCount > 0);
  assert.ok(evidence.artifact.definedStringCount > 0);
  assert.ok(evidence.observedProtocolTypes.includes('SendMessageRequest'));
  assert.ok(evidence.observedProtocolTypes.includes('MessageCaptureStartRequest'));
  assert.ok(evidence.observedProtocolTypes.includes('ApplyMessageMutationRequest'));
  for (const errorString of [
    'cli.account_required',
    'cli.idempotency_required',
    'cli.engine_required',
    'cli.target_required',
    'cli.delivery_ticket_invalid',
    'message.material_session_missing',
    'message.remote_failed',
    'engine.message_send_response_missing',
    'engine.message_cancel_response_missing',
    'engine.message_session_response_missing',
    'message.canceled'
  ]) assert.ok(evidence.observedErrorStrings.includes(errorString), errorString);
  assert.equal(evidence.scope.staticOnly, true);
  assert.equal(evidence.scope.executed, false);
  assert.equal(evidence.scope.nativeSchemaSupported, false);
  assert.equal(evidence.scope.writerEnabled, false);
  assert.ok(evidence.limitations.length >= 3);
});
