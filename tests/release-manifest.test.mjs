import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReleaseManifest, writeReleaseManifest } from '../scripts/release-manifest.mjs';

test('release manifest records every publishable artifact and stable digest', async () => {
  const first = await buildReleaseManifest();
  assert.equal(first.schema, 'alpha-recovered.release-manifest.v1');
  assert.equal(first.target.platform, 'darwin');
  assert.equal(first.target.arch, 'arm64');
  assert.equal(first.target.nativeRecompiled, false);
  assert.equal(first.target.projectSigned, false);
  assert.ok(first.artifactCount > 0);
  assert.equal(first.artifactCount, first.artifacts.length);
  assert.match(first.artifactDigest, /^[0-9a-f]{64}$/);
  assert.equal(new Set(first.artifacts.map(item => item.path)).size, first.artifactCount);
  assert.ok(first.artifacts.some(item => item.artifact === 'app' && item.path.endsWith('/package.json')));
  assert.ok(first.artifacts.some(item => item.artifact === 'runtime-bundle'));
  const second = await buildReleaseManifest();
  assert.equal(second.artifactDigest, first.artifactDigest);
});

test('release manifest writes atomically to a caller-selected path', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-release-manifest-'));
  try {
    const destination = path.join(directory, 'manifest.json');
    const result = await writeReleaseManifest(destination);
    assert.equal(result.destination, destination);
    const parsed = JSON.parse(await fs.readFile(destination, 'utf8'));
    assert.equal(parsed.artifactDigest, result.manifest.artifactDigest);
    const mode = (await fs.stat(destination)).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
