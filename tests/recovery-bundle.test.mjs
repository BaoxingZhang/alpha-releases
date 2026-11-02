import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildRecoveryBundle } from '../scripts/recovery-bundle.mjs';

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL('..', import.meta.url).pathname);

test('recovery source bundle excludes generated outputs and user runtime state', { timeout: 30_000 }, async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/recovery-bundle-test-'));
  const output = path.join(directory, 'source.tar.gz');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const result = await buildRecoveryBundle({ output });
  assert.equal(result.manifest.schema, 'alpha-recovered.source-bundle.v1');
  assert.equal(result.manifest.includesVendorRuntime, false);
  assert.equal(result.manifest.nativeRecompiled, false);
  assert.equal(result.manifest.projectSigned, false);
  assert.ok(result.manifest.files.some(item => item.path === 'README.md'));
  assert.ok(result.manifest.files.some(item => item.path === 'vendor/runtime/manifests/alpha-wcdb.component.json'));
  assert.equal(result.manifest.files.some(item => item.path === 'vendor/runtime/bin/alpha-server'), false);
  assert.equal(result.manifest.files.some(item => /^(?:\.runtime|dist|build|node_modules|\.alpha)\//.test(item.path)), false);
  assert.equal(result.manifest.files.some(item => /^docs\/.*\.(?:png|log)$/i.test(item.path)), false);
  const archive = await execFileAsync('/usr/bin/tar', ['-tzf', output], { cwd: root, maxBuffer: 1024 * 1024 });
  assert.match(archive.stdout, /(^|\n)README\.md\n/);
  assert.doesNotMatch(archive.stdout, /(^|\n)vendor\/runtime\/bin\/alpha-server\n/);
});

test('recovery source archive bytes are reproducible across invocations', { timeout: 30_000 }, async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/recovery-bundle-repro-'));
  const firstOutput = path.join(directory, 'first.tar.gz');
  const secondOutput = path.join(directory, 'second.tar.gz');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const first = await buildRecoveryBundle({ output: firstOutput });
  const second = await buildRecoveryBundle({ output: secondOutput });
  assert.match(first.manifest.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(second.manifest.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(first.manifest.archive.bytes, second.manifest.archive.bytes);
  assert.equal(first.manifest.archive.sha256, second.manifest.archive.sha256);
  assert.equal(await fs.readFile(firstOutput, 'hex'), await fs.readFile(secondOutput, 'hex'));
});
