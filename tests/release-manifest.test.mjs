import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildReleaseManifest, writeReleaseManifest } from '../scripts/release-manifest.mjs';
import { verifyReleaseManifest } from '../scripts/verify-release-manifest.mjs';

test('release manifest records every publishable artifact and stable digest', async () => {
  const first = await buildReleaseManifest();
  assert.equal(first.schema, 'alpha-recovered.release-manifest.v1');
  assert.equal(first.target.platform, 'darwin');
  assert.equal(first.target.arch, 'arm64');
  assert.equal(first.target.nativeRecompiled, false);
  assert.equal(first.target.projectSigned, false);
  assert.deepEqual(first.identity, {
    productName: 'Alpha Recovered',
    bundleIdentifier: 'local.alpha.recovered',
    executableName: 'AlphaRecovered',
    independent: {
      productName: 'Alpha Recovered Independent',
      bundleIdentifier: 'local.alpha.recovered.independent',
      executableName: 'AlphaRecoveredIndependent'
    }
  });
  assert.ok(first.artifactCount > 0);
  assert.equal(first.artifactCount, first.artifacts.length);
  assert.match(first.artifactDigest, /^[0-9a-f]{64}$/);
  assert.equal(new Set(first.artifacts.map(item => item.path)).size, first.artifactCount);
  assert.ok(first.artifacts.some(item => item.artifact === 'app' && item.path.endsWith('/package.json')));
  assert.ok(first.artifacts.some(item => item.artifact === 'runtime-bundle'));
  assert.ok(first.artifacts.some(item => item.artifact === 'independent-resources' && item.path.endsWith('/manifest.json')));
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

test('release manifest verifier re-hashes every artifact and recomputes the aggregate digest', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-release-verify-'));
  try {
    const destination = path.join(directory, 'manifest.json');
    const written = await writeReleaseManifest(destination);
    const verified = await verifyReleaseManifest(destination);
    assert.equal(verified.artifactCount, written.manifest.artifactCount);
    assert.equal(verified.artifactDigest, written.manifest.artifactDigest);
    const tampered = JSON.parse(await fs.readFile(destination, 'utf8'));
    tampered.artifacts[0].sha256 = '0'.repeat(64);
    await fs.writeFile(destination, JSON.stringify(tampered));
    await assert.rejects(() => verifyReleaseManifest(destination), /RELEASE_MANIFEST_FILE_HASH_MISMATCH/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('release manifest verifier binds each entry to its artifact root', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-release-label-'));
  try {
    const source = await buildReleaseManifest();
    const destination = path.join(directory, 'manifest.json');
    const tampered = JSON.parse(JSON.stringify(source));
    const entry = tampered.artifacts.find(item => item.artifact === 'app');
    entry.artifact = 'agent';
    await fs.writeFile(destination, JSON.stringify(tampered));
    await assert.rejects(() => verifyReleaseManifest(destination), /RELEASE_MANIFEST_ARTIFACT_LABEL_MISMATCH/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('release manifest verifier rejects a stale package version', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-release-version-'));
  try {
    const source = await buildReleaseManifest();
    const destination = path.join(directory, 'manifest.json');
    await fs.writeFile(destination, JSON.stringify({ ...source, version: '0.3.4' }));
    await assert.rejects(() => verifyReleaseManifest(destination), /RELEASE_MANIFEST_VERSION_MISMATCH/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('release manifest verifier rejects identity drift', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-release-identity-'));
  try {
    const source = await buildReleaseManifest();
    const destination = path.join(directory, 'manifest.json');
    await fs.writeFile(destination, JSON.stringify({ ...source, identity: { ...source.identity, executableName: 'Wrong' } }));
    await assert.rejects(() => verifyReleaseManifest(destination), /RELEASE_MANIFEST_IDENTITY_MISMATCH/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('release manifest verifier rejects traversal and duplicate entries', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-release-invalid-'));
  try {
    const source = await buildReleaseManifest();
    const destination = path.join(directory, 'manifest.json');
    const traversal = { ...source, artifactCount: 1, artifacts: [{ ...source.artifacts[0], path: '../outside' }] };
    await fs.writeFile(destination, JSON.stringify(traversal));
    await assert.rejects(() => verifyReleaseManifest(destination), /RELEASE_MANIFEST_PATH_INVALID/);
    const duplicate = { ...source, artifacts: [source.artifacts[0], source.artifacts[0]], artifactCount: 2 };
    await fs.writeFile(destination, JSON.stringify(duplicate));
    await assert.rejects(() => verifyReleaseManifest(destination), /RELEASE_MANIFEST_DUPLICATE_PATH/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

test('release manifest verifier rejects files added after manifest creation', async () => {
  const extra = path.join(process.cwd(), 'dist', 'app', `.release-manifest-extra-${process.pid}-${Date.now()}`);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-release-extra-'));
  try {
    const source = await buildReleaseManifest();
    const destination = path.join(directory, 'manifest.json');
    await fs.writeFile(destination, JSON.stringify(source));
    await fs.writeFile(extra, 'unlisted artifact\n', { flag: 'wx', mode: 0o600 });
    await assert.rejects(() => verifyReleaseManifest(destination), /RELEASE_MANIFEST_UNLISTED_FILE/);
  } finally {
    await fs.rm(extra, { force: true });
    await fs.rm(directory, { recursive: true, force: true });
  }
});
