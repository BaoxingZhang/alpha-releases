import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { preparePublicSource } from '../scripts/prepare-public-source.mjs';

async function fixture(prefix = 'alpha-public-source-') {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const root = path.join(parent, 'source');
  await fs.mkdir(root, { recursive: true });
  return { parent, root };
}

async function exists(filename) {
  try {
    await fs.lstat(filename);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

test('prepares a nested candidate tree and applies default exclusions', async t => {
  const { parent, root } = await fixture();
  const output = path.join(parent, 'candidate');
  t.after(() => fs.rm(parent, { recursive: true, force: true }));

  await fs.mkdir(path.join(root, 'src', 'nested'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'one'), { recursive: true });
  await fs.mkdir(path.join(root, 'src', 'two'), { recursive: true });
  await fs.mkdir(path.join(root, 'docs', 'native-diagnosis-evidence'), { recursive: true });
  await fs.mkdir(path.join(root, 'packages', 'alpha-data-bridge', '.runtime', 'cache'), { recursive: true });
  await fs.mkdir(path.join(root, 'vendor', 'runtime', 'bin'), { recursive: true });
  await fs.mkdir(path.join(root, 'vendor', 'runtime', 'manifests'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'nested', 'value.txt'), 'nested source\n');
  await fs.writeFile(path.join(root, 'src', 'one', 'same.txt'), 'one\n');
  await fs.writeFile(path.join(root, 'src', 'two', 'same.txt'), 'two\n');
  await fs.writeFile(path.join(root, 'docs', 'README.md'), 'public documentation\n');
  await fs.writeFile(path.join(root, 'docs', 'capture.log'), 'private log\n');
  await fs.writeFile(path.join(root, 'docs', 'native-runtime-provenance.json'), '{"source":"/Users/alice/Downloads/Alpha.dmg"}\n');
  await fs.writeFile(path.join(root, 'docs', 'local-run.json'), '{"userData":"/Users/alice/private"}\n');
  await fs.writeFile(path.join(root, 'docs', 'native-diagnosis-evidence', 'trace.json'), '{"private":true}\n');
  await fs.writeFile(path.join(root, 'packages', 'alpha-data-bridge', '.runtime', 'cache', 'build.txt'), '/Users/alice/private\n');
  await fs.writeFile(path.join(root, 'vendor', 'runtime', 'bin', 'runtime.dylib'), 'binary\n');
  await fs.writeFile(path.join(root, 'vendor', 'runtime', 'bin', 'runtime.LICENSE'), 'license\n');
  await fs.writeFile(path.join(root, 'vendor', 'runtime', 'manifests', 'runtime.json'), '{}\n');
  for (const directory of ['.git', '.alpha', '.runtime', 'node_modules', 'dist', 'build']) {
    await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.writeFile(path.join(root, directory, 'private.txt'), 'private\n');
  }

  const result = await preparePublicSource({ root, output });
  assert.equal(result.status, 'ready-for-license-and-review');
  assert.equal(result.audit.status, 'passed');
  assert.equal(result.sourceRoot, '[caller-specified]');
  assert.equal(await fs.readFile(path.join(output, 'src', 'nested', 'value.txt'), 'utf8'), 'nested source\n');
  assert.equal(await fs.readFile(path.join(output, 'src', 'one', 'same.txt'), 'utf8'), 'one\n');
  assert.equal(await fs.readFile(path.join(output, 'src', 'two', 'same.txt'), 'utf8'), 'two\n');
  assert.equal(await fs.readFile(path.join(output, 'vendor', 'runtime', 'bin', 'runtime.LICENSE'), 'utf8'), 'license\n');
  assert.equal(await fs.readFile(path.join(output, 'vendor', 'runtime', 'manifests', 'runtime.json'), 'utf8'), '{}\n');
  for (const relative of [
    'docs/capture.log',
    'docs/native-runtime-provenance.json',
    'docs/local-run.json',
    'docs/native-diagnosis-evidence/trace.json',
    'packages/alpha-data-bridge/.runtime/cache/build.txt',
    'vendor/runtime/bin/runtime.dylib',
    '.git/private.txt',
    '.alpha/private.txt',
    '.runtime/private.txt',
    'node_modules/private.txt',
    'dist/private.txt',
    'build/private.txt'
  ]) assert.equal(await exists(path.join(output, relative)), false, relative);
  const manifest = JSON.parse(await fs.readFile(`${output}.public-source-candidate.v1.json`, 'utf8'));
  assert.equal(manifest.fileCount, result.fileCount);
  assert.ok(manifest.files.some(file => file.path === 'src/nested/value.txt'));
  assert.equal(JSON.parse(await fs.readFile(result.audit.reportPath, 'utf8')).status, 'passed');
});

test('rejects unsafe output, artifact and exclude paths before copying', async t => {
  const { parent, root } = await fixture();
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.writeFile(path.join(root, 'src', 'file.txt'), 'source\n');

  await assert.rejects(
    () => preparePublicSource({ root, output: path.join(root, 'candidate') }),
    /PUBLIC_SOURCE_OUTPUT_MUST_BE_OUTSIDE_ROOT/
  );
  await assert.rejects(
    () => preparePublicSource({ root, output: path.join(parent, 'candidate'), reportPath: path.join(root, 'audit.json') }),
    /PUBLIC_SOURCE_REPORT_MUST_BE_EXTERNAL/
  );
  await assert.rejects(
    () => preparePublicSource({ root, output: path.join(parent, 'candidate-2'), excludes: ['../private'] }),
    /PUBLIC_SOURCE_EXCLUDE_INVALID/
  );
  await fs.mkdir(path.join(parent, 'existing'));
  await assert.rejects(
    () => preparePublicSource({ root, output: path.join(parent, 'existing') }),
    /PUBLIC_SOURCE_OUTPUT_EXISTS/
  );
});

test('leaves a redacted candidate and manifest when strict public audit fails', async t => {
  const { parent, root } = await fixture();
  const output = path.join(parent, 'candidate');
  const reportPath = path.join(parent, 'audit-report.json');
  const manifestPath = path.join(parent, 'candidate-manifest.json');
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'docs'), { recursive: true });
  await fs.writeFile(path.join(root, 'docs', 'leak.md'), 'path=/Users/alice/private\nBearer abcdefghijklmnopqrstuvwxyz123456\n');

  const result = await preparePublicSource({ root, output, reportPath, manifestPath });
  assert.equal(result.status, 'blocked-by-public-audit');
  assert.equal(result.audit.status, 'failed');
  assert.equal(result.audit.findingCount, 2);
  assert.equal(await fs.readFile(path.join(output, 'docs', 'leak.md'), 'utf8'), 'path=/Users/alice/private\nBearer abcdefghijklmnopqrstuvwxyz123456\n');
  const report = JSON.parse(await fs.readFile(result.audit.reportPath, 'utf8'));
  assert.equal(report.status, 'failed');
  assert.equal(report.findingCount, 2);
  assert.doesNotMatch(JSON.stringify(report), /\/Users\/alice|abcdefghijklmnopqrstuvwxyz123456/);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  assert.equal(manifest.status, 'blocked-by-public-audit');
  assert.equal(manifest.audit.reportPath, reportPath);
  assert.equal(await exists(`${output}.public-release-audit.json`), false);
  assert.equal(await exists(`${output}.public-source-candidate.v1.json`), false);
});

test('rejects symlinks instead of copying through them', async t => {
  const { parent, root } = await fixture();
  const output = path.join(parent, 'candidate');
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'target.txt'), 'target\n');
  await fs.symlink('target.txt', path.join(root, 'link.txt'));
  await assert.rejects(
    () => preparePublicSource({ root, output }),
    /PUBLIC_SOURCE_SYMLINK_REJECTED:link\.txt/
  );
  assert.equal(await exists(output), true);
  assert.equal(await exists(`${output}.public-source-candidate.v1.json`), false);
});
