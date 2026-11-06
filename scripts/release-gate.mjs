import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const manifestPath = path.join(root, '.runtime', 'release-manifest.json');

export function validateReleaseBoundary(packageJson, manifest) {
  if (!packageJson || packageJson.private !== true) throw new Error('RELEASE_GATE_PACKAGE_MUST_REMAIN_PRIVATE');
  if (!manifest || manifest.schema !== 'alpha-recovered.release-manifest.v1') throw new Error('RELEASE_GATE_MANIFEST_INVALID');
  if (manifest.target?.projectSigned !== false) throw new Error('RELEASE_GATE_SIGNING_STATE_UNEXPECTED');
  return {
    packagePrivate: true,
    projectSigned: false,
    notarized: false
  };
}

async function readPackagedBoundaries() {
  const directory = path.join(root, '.runtime', 'release-artifacts');
  let entries;
  try { entries = await fs.readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const boundaries = [];
  for (const entry of entries.filter(item => item.isFile() && item.name.endsWith('.app.manifest.json')).sort((a, b) => a.name.localeCompare(b.name))) {
    const filename = path.join(directory, entry.name);
    const value = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (value.projectSigned !== false || value.notarized !== false) {
      throw new Error(`RELEASE_GATE_PACKAGED_SIGNING_STATE_UNEXPECTED:${entry.name}`);
    }
    boundaries.push({ name: entry.name, projectSigned: false, notarized: false });
  }
  return boundaries;
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', script], { cwd: root, env: process.env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`RELEASE_GATE_STEP_FAILED:${script}:${code ?? 'unknown'}`)));
  });
}

async function main() {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  await run('verify:reproducible-builds');
  await run('release:manifest');
  await run('verify:release-manifest');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const boundary = validateReleaseBoundary(packageJson, manifest);
  const packagedBoundaries = await readPackagedBoundaries();
  await run('verify:maintenance');
  console.log(JSON.stringify({
    schema: 'alpha-recovered.release-gate.v1',
    manifest: path.relative(root, manifestPath),
    artifactCount: manifest.artifactCount,
    artifactDigest: manifest.artifactDigest,
    boundary: { ...boundary, packagedManifests: packagedBoundaries }
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await main();
}
