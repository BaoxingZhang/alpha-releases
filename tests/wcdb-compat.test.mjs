import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probe, getSnsTimeline } from '../packages/alpha-wcdb-compat/index.cjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const base = path.join(root, '.runtime/wcdb-compat-tests');
await fs.mkdir(base, { recursive: true });

async function helper(t, output) {
  const dir = await fs.mkdtemp(path.join(base, 'case-'));
  const file = path.join(dir, 'helper.cjs');
  await fs.writeFile(file, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(output))} + '\\n');\n`);
  await fs.chmod(file, 0o700);
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return file;
}

test('third-party probe requires explicit absolute paths and preserves boundary markers', async t => {
  const executablePath = await helper(t, { ok: true, result: { schema: 'alpha-third-party-wcdb-probe.v1', nativeSchemaSupported: false, libraryBasename: 'libwcdb_api.dylib', symbols: { wcdb_init: true } } });
  const value = await probe({ executablePath, libraryPath: '/tmp/libwcdb_api.dylib' });
  assert.equal(value.sourceKind, 'explicit-third-party-wcdb');
  assert.equal(value.nativeSchemaSupported, false);
  assert.equal(value.writer, false);
  await assert.rejects(() => probe({ executablePath, libraryPath: 'relative.dylib' }), /WCDB_COMPAT_LIBRARY_INVALID/);
  await assert.rejects(() => probe({ executablePath: 'relative-helper', libraryPath: '/tmp/lib.dylib' }), /WCDB_COMPAT_EXECUTABLE_INVALID/);
});

test('third-party sns response is decoded without accepting arbitrary schemas', async t => {
  const raw = Buffer.from(JSON.stringify({ timeline: [{ id: 'fixture' }] })).toString('base64');
  const executablePath = await helper(t, { ok: true, result: { schema: 'alpha-third-party-wcdb-sns.v1', nativeSchemaSupported: false, rawJsonBase64: raw } });
  const value = await getSnsTimeline({ executablePath, libraryPath: '/tmp/lib.dylib', accountDir: '/tmp/account', key: 'a'.repeat(64), limit: 1 });
  assert.deepEqual(value.raw, { timeline: [{ id: 'fixture' }] });
  assert.equal(value.complete, false);
  await assert.rejects(() => getSnsTimeline({ executablePath, libraryPath: '/tmp/lib.dylib', accountDir: '/tmp/account', key: 'bad' }), /WCDB_COMPAT_KEY_INVALID/);
});

test('malformed third-party helper replies fail closed', async t => {
  const executablePath = await helper(t, { ok: true, result: { schema: 'wrong' } });
  await assert.rejects(() => probe({ executablePath, libraryPath: '/tmp/lib.dylib' }), /WCDB_COMPAT_RESPONSE_INVALID/);
});
