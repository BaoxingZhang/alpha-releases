import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const output = path.join(root, 'docs/independent-support-matrix.json');
const engine = require(path.join(root, 'packages/alpha-engine/index.cjs'));

function fail(message) {
  throw new Error(`Independent support matrix failed: ${message}`);
}

export function buildSupportMatrix() {
  const supported = engine.SUPPORTED;
  const allMethods = engine.ALL_METHODS;
  if (!supported || !Array.isArray(allMethods)) fail('engine exports SUPPORTED and ALL_METHODS are required');
  const names = new Set(allMethods);
  const supportedNames = Object.keys(supported);
  const unknownSupported = supportedNames.filter(name => !names.has(name));
  const duplicateIds = supportedNames.filter((name, index) => supportedNames.findIndex(candidate => supported[candidate] === supported[name]) !== index);
  if (unknownSupported.length) fail(`SUPPORTED contains unknown methods: ${unknownSupported.join(', ')}`);
  if (duplicateIds.length) fail(`SUPPORTED contains duplicate field numbers: ${duplicateIds.join(', ')}`);

  return {
    schema: 'alpha-independent-support-matrix.v1',
    source: {
      engine: 'packages/alpha-engine/index.cjs',
      supportedExport: 'SUPPORTED',
      allMethodsExport: 'ALL_METHODS',
      unsupportedBehavior: 'Engine dispatch returns UNIMPLEMENTED; no empty success is synthesized'
    },
    counts: {
      totalRequestBranches: allMethods.length,
      implementedRequestBranches: supportedNames.length,
      unsupportedRequestBranches: allMethods.length - supportedNames.length
    },
    supported: supportedNames.map(name => ({ name, fieldNumber: supported[name] })).sort((a, b) => a.fieldNumber - b.fieldNumber || a.name.localeCompare(b.name)),
    unsupported: allMethods.filter(name => !Object.hasOwn(supported, name)).map(name => ({ name, status: 'UNIMPLEMENTED' })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

export async function writeSupportMatrix(filename, matrix) {
  const destination = path.resolve(filename);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(matrix, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
}

export async function verifySupportMatrix({ write = process.argv.includes('--write') } = {}) {
  const matrix = buildSupportMatrix();
  const expected = `${JSON.stringify(matrix, null, 2)}\n`;
  if (write) {
    await writeSupportMatrix(output, matrix);
    console.log(`Wrote ${path.relative(root, output)} (${matrix.counts.totalRequestBranches} request branches).`);
    return matrix;
  }
  try {
    const actual = await fs.readFile(output, 'utf8');
    if (actual !== expected) fail(`${path.relative(root, output)} is stale; run npm run verify:independent-support -- --write`);
    else console.log(`Independent support matrix verified (${matrix.counts.implementedRequestBranches}/${matrix.counts.totalRequestBranches} implemented).`);
  } catch (error) {
    if (error?.message?.startsWith('Independent support matrix failed:')) throw error;
    fail(`${path.relative(root, output)}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
  }
  return matrix;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    await verifySupportMatrix();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
