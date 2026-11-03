import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateChangelogVersion, validatePackageLock } from './project-contract.mjs';
import { createRequire } from 'node:module';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { readProjectIdentity } = require('../packages/alpha-desktop/project-identity.cjs');
const errors = [];

async function readJson(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, relativePath), 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: ${error.code === 'ENOENT' ? 'missing' : `invalid JSON (${error.message})`}`);
    return null;
  }
}

async function requireFile(relativePath) {
  try {
    const stat = await fs.stat(path.join(root, relativePath));
    if (!stat.isFile()) errors.push(`${relativePath}: expected a regular file`);
  } catch (error) {
    errors.push(`${relativePath}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
  }
}

async function readText(relativePath) {
  try {
    return await fs.readFile(path.join(root, relativePath), 'utf8');
  } catch {
    return null;
  }
}

const metadata = await readJson('provenance/project-metadata.json');
const packageJson = await readJson('package.json');
const packageLock = await readJson('package-lock.json');
const changelogText = await readText('CHANGELOG.md');
const requiredFiles = [
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'MAINTENANCE.md',
  'docs/maintainer-playbook.md',
  'docs/source-gaps.md'
];
requiredFiles.push('package-lock.json');
for (const file of requiredFiles) await requireFile(file);

if (metadata) {
  if (metadata.schema !== 'alpha-maintainable-project.v1') errors.push('project metadata: unsupported schema');
  if (!metadata.projectName || !metadata.packageName || !/^\d+\.\d+\.\d+$/.test(metadata.version)) errors.push('project metadata: project identity/version is incomplete');
  if (metadata.maintenanceStatus !== 'user-maintained-recovery') errors.push('project metadata: maintenanceStatus must remain user-maintained-recovery');
  const digest = metadata.upstream?.sourceDmgSha256;
  if (!/^[a-f0-9]{64}$/.test(digest ?? '')) errors.push('project metadata: sourceDmgSha256 must be a lowercase SHA-256');
  if (!/^https:\/\/github\.com\//.test(metadata.upstream?.releaseRepository ?? '')) errors.push('project metadata: upstream releaseRepository must be an HTTPS GitHub URL');
  if (metadata.sourceBoundaries?.originalRuntime !== 'provenance-only precompiled macOS arm64 artifacts; signatures and hashes are preserved') errors.push('project metadata: original runtime boundary changed without an explicit review');
}

if (packageJson && metadata) {
  if (packageJson.name !== metadata.packageName) errors.push(`package.json name ${packageJson.name} does not match project metadata ${metadata.packageName}`);
  if (packageJson.version !== metadata.version) errors.push(`package.json version ${packageJson.version} does not match project metadata ${metadata.version}`);
  if (packageJson.private !== true) errors.push('package.json: recovered project must remain private until licensing is selected');
  try {
    const identity = readProjectIdentity(packageJson);
    if (metadata.projectName !== identity.productName) errors.push(`project metadata projectName ${metadata.projectName} does not match package productName ${identity.productName}`);
  } catch (error) {
    errors.push(`package.json project identity: ${error.message}`);
  }
}

if (packageJson && packageLock) errors.push(...validatePackageLock(packageJson, packageLock));
if (packageJson) errors.push(...validateChangelogVersion(packageJson, changelogText));

if (errors.length) {
  console.error(`Project checks failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Project checks passed (${requiredFiles.length + 2} maintenance entrypoints and metadata checks).`);
}
