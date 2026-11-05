import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildSupportMatrix, writeSupportMatrix } from '../scripts/verify-independent-support.mjs';

test('support matrix writer publishes a complete matrix atomically', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-support-matrix-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'matrix.json');
  const matrix = buildSupportMatrix();
  await writeSupportMatrix(output, matrix);
  assert.deepEqual(JSON.parse(await fs.readFile(output, 'utf8')), matrix);
  assert.deepEqual((await fs.readdir(directory)).sort(), ['matrix.json']);
});

test('support matrix writer removes its temporary file when publication fails', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'alpha-support-matrix-fail-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, 'matrix.json');
  await fs.mkdir(output);
  await assert.rejects(writeSupportMatrix(output, buildSupportMatrix()));
  assert.deepEqual((await fs.readdir(directory)).sort(), ['matrix.json']);
});
