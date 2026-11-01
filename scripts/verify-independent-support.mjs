import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const output = path.join(root, 'docs/independent-support-matrix.json');
const engine = require(path.join(root, 'packages/alpha-engine/index.cjs'));

function fail(message) {
  console.error(`Independent support matrix failed: ${message}`);
  process.exitCode = 1;
}

const supported = engine.SUPPORTED;
const allMethods = engine.ALL_METHODS;
if (!supported || !Array.isArray(allMethods)) {
  fail('engine exports SUPPORTED and ALL_METHODS are required');
} else {
  const names = new Set(allMethods);
  const supportedNames = Object.keys(supported);
  const unknownSupported = supportedNames.filter(name => !names.has(name));
  const duplicateIds = supportedNames.filter((name, index) => supportedNames.findIndex(candidate => supported[candidate] === supported[name]) !== index);
  if (unknownSupported.length) fail(`SUPPORTED contains unknown methods: ${unknownSupported.join(', ')}`);
  if (duplicateIds.length) fail(`SUPPORTED contains duplicate field numbers: ${duplicateIds.join(', ')}`);

  const matrix = {
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
  const expected = `${JSON.stringify(matrix, null, 2)}\n`;
  if (process.argv.includes('--write')) {
    await fs.writeFile(output, expected);
    console.log(`Wrote ${path.relative(root, output)} (${allMethods.length} request branches).`);
  } else {
    try {
      const actual = await fs.readFile(output, 'utf8');
      if (actual !== expected) fail(`${path.relative(root, output)} is stale; run npm run verify:independent-support -- --write`);
      else console.log(`Independent support matrix verified (${supportedNames.length}/${allMethods.length} implemented).`);
    } catch (error) {
      fail(`${path.relative(root, output)}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
    }
  }
}
