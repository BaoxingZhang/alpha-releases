import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const output = path.join(root, 'build', 'packaged-resources', 'independent');
const packages = ['alpha-engine', 'alpha-security', 'alpha-protocol'];
const binaries = [
  ['alpha-data-bridge', path.join(root, 'build/candidates/alpha-data-bridge')],
  ['alpha-snapshot-import', path.join(root, 'build/candidates/alpha-snapshot-import')]
];

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(path.join(output, 'bin'), { recursive: true });
for (const name of packages) {
  await fs.cp(path.join(root, 'packages', name), path.join(output, name), { recursive: true });
}
for (const [name, source] of binaries) {
  const stat = await fs.lstat(source).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`INDEPENDENT_RUNTIME_ARTIFACT_MISSING:${source}`);
  }
  await fs.copyFile(source, path.join(output, 'bin', name));
  await fs.chmod(path.join(output, 'bin', name), stat.mode & 0o777);
}
const binaryManifest = [];
for (const [name] of binaries) {
  const filename = path.join(output, 'bin', name);
  const stat = await fs.stat(filename);
  binaryManifest.push({ name, path: `bin/${name}`, bytes: stat.size, mode: (stat.mode & 0o777).toString(8), sha256: crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex') });
}
const manifest = {
  schema: 'alpha.independent-packaged-resources.v1',
  layout: 'Resources/independent',
  source: 'recovered independent JavaScript plus locally rebuilt read-only Go adapters',
  packages,
  binaries: binaryManifest
};
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Packaged independent resources prepared at ${output}`);
