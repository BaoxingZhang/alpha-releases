import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { createEncryptedFixture } from './encrypted-fixture.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const binary = path.join(root, 'build/candidates/alpha-snapshot-import');
const execute = promisify(execFile);
const testRoot = path.join(root, '.runtime/snapshot-import-tests');
await fs.mkdir(testRoot, { recursive: true });

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(testRoot, 'case-'));
  const value = await createEncryptedFixture({ directory });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return value;
}
function start(sourceDir, outputDir, keyHex, options = {}) {
  const child = spawn(binary, ['--source-dir', sourceDir, '--output-dir', outputDir, ...(options.args ?? [])], { stdio: ['pipe', 'pipe', 'pipe'], env: options.env });
  let stdout = '', stderr = '', closed = false;
  child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdin.on('error', () => {});
  const timer = setTimeout(() => child.kill('SIGKILL'), 20000);
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => { closed = true; clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
  });
  if (!options.keepInputOpen) child.stdin.end(options.input ?? (keyHex === null ? '' : JSON.stringify({ keyHex }) + '\n'));
  return { child, done, get closed() { return closed; } };
}
async function run(sourceDir, outputDir, keyHex, options = {}) { return start(sourceDir, outputDir, keyHex, options).done; }
async function temporarySnapshots(parent) { return (await fs.readdir(parent)).filter(name => name.startsWith('.alpha-snapshot-')); }
async function waitForPlaintext(process, parent) {
  const deadline = Date.now() + 15000;
  while (!process.closed && Date.now() < deadline) {
    for (const name of await temporarySnapshots(parent)) {
      const temporary = path.join(parent,name);
      const entries = await fs.readdir(temporary, { recursive: true, withFileTypes: true }).catch(() => []);
      if (entries.some(entry => entry.isFile())) return temporary;
    }
    await delay(2);
  }
  process.child.kill('SIGKILL');
  assert.fail('Importer did not expose its private in-progress plaintext before completing');
}
async function hashes(rootDir) {
  const result = {};
  const entries = await fs.readdir(rootDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) if (entry.isFile()) {
    const full = path.join(entry.parentPath, entry.name);
    const hash = await execute('/usr/bin/shasum', ['-a', '256', full]);
    result[path.relative(rootDir, full)] = hash.stdout.split(' ')[0];
  }
  return result;
}

test('decrypts every synthetic SQLCipher page and publishes only after validation', async t => {
  const fixtureValue = await fixture(t); const output = path.join(path.dirname(fixtureValue.sourceDir), 'decoded');
  const result = await run(fixtureValue.sourceDir, output, fixtureValue.keyHex);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stderr, '');
  const summary = JSON.parse(result.stdout); assert.equal(summary.ok, true); assert.equal(summary.sourceUnchanged, true); assert.equal(summary.reservedBytesZeroed, true);
  assert.equal(summary.profile, 'wechat-v4-sqlcipher4-4096-kdf256000'); assert.equal(summary.databases.length, fixtureValue.manifest.files.length);
  assert.ok(summary.sourceFingerprint); assert.equal(await fs.stat(output).then(stat => stat.isDirectory()), true);
  for (const item of fixtureValue.manifest.files) {
    const actual = summary.databases.find(value => value.relativePath === item.relativePath); assert.ok(actual);
    assert.equal(actual.sourceSha256, item.ciphertextSha256); assert.equal(actual.outputSha256, item.plaintextSha256); assert.equal(actual.pages, item.pageCount);
    assert.equal((await fs.stat(path.join(output, ...item.relativePath.split('/')))).mode & 0o777, 0o600);
  }
});

test('wrong key, malformed key, damaged HMAC and truncation never publish partial output', async t => {
  const fixtureValue = await fixture(t);
  for (const [label, key] of [['wrong', 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'], ['short', 'abcd']]) {
    const output = path.join(path.dirname(fixtureValue.sourceDir), `out-${label}`); const result = await run(fixtureValue.sourceDir, output, key);
    assert.notEqual(result.code, 0); assert.match(result.stderr, label === 'short' ? /KEY_INPUT_INVALID/ : /KEY_AUTHENTICATION_FAILED/); await assert.rejects(fs.stat(output));
  }
  const sourceFile = path.join(fixtureValue.sourceDir, fixtureValue.manifest.files[0].relativePath); const original = await fs.readFile(sourceFile);
  const damaged = Buffer.from(original); damaged[4032] ^= 1; await fs.writeFile(sourceFile, damaged);
  const outDamaged = path.join(path.dirname(fixtureValue.sourceDir), 'out-damaged'); const damagedResult = await run(fixtureValue.sourceDir, outDamaged, fixtureValue.keyHex); assert.match(damagedResult.stderr, /KEY_AUTHENTICATION_FAILED/); await assert.rejects(fs.stat(outDamaged));
  await fs.writeFile(sourceFile, original.subarray(0, original.length - 1));
  const outTruncated = path.join(path.dirname(fixtureValue.sourceDir), 'out-truncated'); const truncatedResult = await run(fixtureValue.sourceDir, outTruncated, fixtureValue.keyHex); assert.match(truncatedResult.stderr, /TRUNCATED_DATABASE/); await assert.rejects(fs.stat(outTruncated));
});

test('rejects existing output, symlink source and active sidecar without touching source', async t => {
  const fixtureValue = await fixture(t); const parent = path.dirname(fixtureValue.sourceDir); const output = path.join(parent, 'existing'); await fs.mkdir(output);
  const before = await hashes(fixtureValue.sourceDir); const existing = await run(fixtureValue.sourceDir, output, fixtureValue.keyHex); assert.match(existing.stderr, /OUTPUT_EXISTS/); assert.deepEqual(await hashes(fixtureValue.sourceDir), before);
  const link = path.join(parent, 'source-link'); await fs.symlink(fixtureValue.sourceDir, link); const linked = await run(link, path.join(parent, 'linked-output'), fixtureValue.keyHex); assert.match(linked.stderr, /SYMLINK_DENIED/);
  const sidecar = path.join(fixtureValue.sourceDir, fixtureValue.manifest.files[0].relativePath + '-wal'); await fs.writeFile(sidecar, ''); const active = await run(fixtureValue.sourceDir, path.join(parent, 'active-output'), fixtureValue.keyHex); assert.match(active.stderr, /ACTIVE_DATABASE_DENIED/);
});

test('rejects key in argv/environment and does not log key material', async t => {
  const value = await fixture(t); const parent = path.dirname(value.sourceDir);
  const positional = await run(value.sourceDir,path.join(parent,'argv-output'),value.keyHex,{ args:[value.keyHex] });
  const environment = await run(value.sourceDir,path.join(parent,'env-output'),null,{ env:{...process.env,ALPHA_SNAPSHOT_KEY:value.keyHex} });
  for (const result of [positional,environment]) { assert.equal(result.code,2); assert.match(result.stderr,/KEY_INPUT_INVALID/); assert.equal(result.stdout,''); assert.ok(!result.stderr.includes(value.keyHex)); }
});

test('a complete output appears at one publication point, never while plaintext is being built', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir); const output=path.join(parent,'atomic-output');
  const process=start(value.sourceDir,output,value.keyHex);
  t.after(()=>process.child.kill('SIGCONT'));
  await waitForPlaintext(process,parent);
  assert.ok(process.child.kill('SIGSTOP'));
  try {
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
    assert.equal((await temporarySnapshots(parent)).length,1);
  } finally { process.child.kill('SIGCONT'); }
  let visible=false;
  while (!process.closed) {
    if (await fs.stat(output).then(()=>true,()=>false)) {
      visible=true;
      for (const file of value.manifest.files) assert.equal((await fs.stat(path.join(output,file.relativePath))).size,file.pageCount*4096);
    }
    await delay(1);
  }
  const result=await process.done; assert.equal(result.code,0,result.stderr);
  for (const file of value.manifest.files) assert.equal((await fs.stat(path.join(output,file.relativePath))).size,file.pageCount*4096);
  assert.deepEqual(await temporarySnapshots(parent),[]);
});

test('SIGTERM after plaintext exists cancels and removes private temporary output', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir); const output=path.join(parent,'canceled-output');
  const process=start(value.sourceDir,output,value.keyHex);
  await waitForPlaintext(process,parent); assert.ok(process.child.kill('SIGTERM'));
  const result=await process.done; assert.equal(result.code,2,result.stderr); assert.match(result.stderr,/IMPORT_CANCELED/); assert.equal(result.stdout,'');
  await assert.rejects(fs.stat(output),{code:'ENOENT'}); assert.deepEqual(await temporarySnapshots(parent),[]);
});

test('SIGTERM also cancels a process waiting for key input', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir); const output=path.join(parent,'waiting-output');
  const process=start(value.sourceDir,output,null,{keepInputOpen:true});
  await delay(100); assert.ok(process.child.kill('SIGTERM'));
  const result=await process.done; assert.equal(result.code,2,result.stderr); assert.match(result.stderr,/IMPORT_CANCELED/); assert.equal(result.stdout,''); assert.deepEqual(await temporarySnapshots(parent),[]);
});

test('a destination created concurrently is preserved and never overwritten', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir); const output=path.join(parent,'race-output');
  const process=start(value.sourceDir,output,value.keyHex); await waitForPlaintext(process,parent);
  await fs.mkdir(output); await fs.writeFile(path.join(output,'owner.txt'),'external owner');
  const result=await process.done; assert.equal(result.code,2,result.stderr); assert.match(result.stderr,/OUTPUT_EXISTS/); assert.equal(result.stdout,'');
  assert.deepEqual(await fs.readdir(output),['owner.txt']); assert.equal(await fs.readFile(path.join(output,'owner.txt'),'utf8'),'external owner'); assert.deepEqual(await temporarySnapshots(parent),[]);
});

test('new database shards and unrelated directory members invalidate an in-progress snapshot', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir);
  for (const kind of ['shard','directory','file']) {
    const output=path.join(parent,`changed-${kind}`); const process=start(value.sourceDir,output,value.keyHex); await waitForPlaintext(process,parent);
    const added=path.join(value.sourceDir,kind==='shard'?'message_20.db':`new-${kind}`);
    if (kind==='shard') await fs.copyFile(path.join(value.sourceDir,value.manifest.files[0].relativePath),added);
    else if (kind==='directory') await fs.mkdir(added);
    else await fs.writeFile(added,'new metadata');
    const result=await process.done; assert.equal(result.code,2,result.stderr); assert.match(result.stderr,/SOURCE_CHANGED/); assert.equal(result.stdout,'');
    await assert.rejects(fs.stat(output),{code:'ENOENT'}); assert.deepEqual(await temporarySnapshots(parent),[]); await fs.rm(added,{recursive:true});
  }
});

test('overlapping paths and FIFO members fail without creating output or blocking', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir);
  for (const output of [path.join(value.sourceDir,'inside'),parent]) { const result=await run(value.sourceDir,output,value.keyHex); assert.equal(result.code,2); assert.match(result.stderr,/PATH_OVERLAP/); }
  const fifo=path.join(value.sourceDir,'message_9.db'); await execute('/usr/bin/mkfifo',[fifo]);
  const result=await run(value.sourceDir,path.join(parent,'fifo-output'),value.keyHex); assert.equal(result.code,2); assert.match(result.stderr,/SOURCE_TYPE_DENIED/); assert.equal(result.signal,null); assert.equal(result.stdout,'');
});

test('SQLite URI escaping handles question marks and fragments in actual database paths', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir); const special=path.join(parent,'source ?# percent%');
  await fs.rename(value.sourceDir,special);
  const nested=path.join(special,'nested ?#%'); await fs.mkdir(nested); await fs.rename(path.join(special,'contact'),path.join(nested,'contact'));
  const outputParent=path.join(parent,'output ?#%'); await fs.mkdir(outputParent);
  const result=await run(special,path.join(outputParent,'decoded'),value.keyHex); assert.equal(result.code,0,result.stderr);
  const summary=JSON.parse(result.stdout); assert.ok(summary.databases.some(file=>file.relativePath.startsWith('nested ?#%/contact/')));
});

test('oversized second input lines and trailing JSON are rejected before output', async t => {
  const value=await fixture(t); const parent=path.dirname(value.sourceDir); const key=JSON.stringify({keyHex:value.keyHex});
  for (const [index,input] of [`${key}\n${'x'.repeat(17000)}`,`${key} {}`,`${key}\n{}`].entries()) {
    const output=path.join(parent,`bad-input-${index}`); const result=await run(value.sourceDir,output,null,{input});
    assert.equal(result.code,2); assert.match(result.stderr,/KEY_INPUT_INVALID/); assert.equal(result.stdout,''); await assert.rejects(fs.stat(output),{code:'ENOENT'});
  }
});
