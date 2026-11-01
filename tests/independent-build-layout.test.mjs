import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const independent = path.join(root, 'dist/app/independent');

test('independent packaged layout is self-contained when an independent build exists', async t => {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(independent, 'manifest.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return t.skip('run npm run build:independent first');
    throw error;
  }
  assert.equal(manifest.schema, 'alpha-recovered.independent-runtime.v1');
  assert.equal(manifest.status, 'ready');
  assert.equal(manifest.entry, 'packages/alpha-engine/cli.cjs');
  assert.equal(manifest.bridge, 'bin/alpha-data-bridge');
  assert.equal(manifest.importer, 'bin/alpha-snapshot-import');
  for (const relative of [manifest.entry, manifest.bridge, manifest.importer, 'manifest.json']) {
    const filename = path.join(independent, relative);
    const stat = await fs.lstat(filename);
    assert.equal(stat.isFile(), true, `${relative} must be a regular file`);
    assert.equal(stat.isSymbolicLink(), false, `${relative} must not be a symlink`);
    if (relative.startsWith('bin/')) assert.equal(stat.mode & 0o111, 0o111, `${relative} must remain executable`);
  }
  for (const name of manifest.packages) {
    const stat = await fs.lstat(path.join(independent, 'packages', name));
    assert.equal(stat.isDirectory(), true, `${name} package must be copied`);
  }
  const protobufPackage = path.join(independent, 'node_modules', '@bufbuild', 'protobuf');
  const protobufStat = await fs.lstat(protobufPackage);
  assert.equal(protobufStat.isDirectory(), true, 'protobuf runtime dependency must be copied');
  const wireEntry = path.join(protobufPackage, 'dist', 'commonjs', 'wire', 'index.js');
  assert.equal((await fs.lstat(wireEntry)).isFile(), true, 'protobuf wire CommonJS entry must be packaged');
});
