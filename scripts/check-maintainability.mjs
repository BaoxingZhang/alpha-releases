import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCurrentEvidenceRefresh } from './current-evidence-consistency.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const { readProjectIdentity } = require('../packages/alpha-desktop/project-identity.cjs');
const errors = [];
let checks = 0;

async function readJson(relativePath) {
  const absolutePath = path.join(root, relativePath);
  try {
    return JSON.parse(await fs.readFile(absolutePath, 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: ${error.code === 'ENOENT' ? 'missing' : `invalid JSON (${error.message})`}`);
    return null;
  }
}

async function exists(relativePath, type = 'file') {
  try {
    const stat = await fs.stat(path.join(root, relativePath));
    if (type === 'directory' && !stat.isDirectory()) throw new Error('is not a directory');
    if (type === 'file' && !stat.isFile()) throw new Error('is not a file');
    checks++;
    return true;
  } catch (error) {
    errors.push(`${relativePath}: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
    return false;
  }
}

function sameMap(actual, expected, label) {
  const actualKeys = Object.keys(actual ?? {}).sort();
  const expectedKeys = Object.keys(expected ?? {}).sort();
  if (actualKeys.length !== expectedKeys.length || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    errors.push(`${label}: dependency names differ from package.json`);
    return;
  }
  for (const key of expectedKeys) {
    if (actual[key] !== expected[key]) errors.push(`${label}: ${key} is ${JSON.stringify(actual[key])}, expected ${JSON.stringify(expected[key])}`);
  }
}

function nodeVersionInRange(version, range) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match || range !== '>=24.15 <25') return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 24 && minor >= 15;
}

function resolveLocalImport(from, specifier) {
  const candidate = path.resolve(path.dirname(from), specifier);
  return candidate;
}

async function checkRendererImports() {
  const directory = path.join(root, 'src/renderer/assets');
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    errors.push(`src/renderer/assets: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
    return;
  }
  const sourceFiles = entries.filter(entry => entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)).map(entry => path.join(directory, entry.name));
  const importPattern = /(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const file of sourceFiles) {
    const source = await fs.readFile(file, 'utf8');
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveLocalImport(file, specifier);
      if (!resolved.startsWith(`${root}${path.sep}`)) {
        errors.push(`${path.relative(root, file)}: local import escapes project: ${specifier}`);
        continue;
      }
      const candidates = [
        resolved,
        `${resolved}.js`,
        `${resolved}.mjs`,
        `${resolved}.cjs`,
        `${resolved}.json`,
        path.join(resolved, 'index.js'),
        path.join(resolved, 'index.mjs'),
        path.join(resolved, 'index.cjs')
      ];
      let found = false;
      for (const candidate of candidates) {
        try {
          const stat = await fs.stat(candidate);
          if (stat.isFile()) {
            found = true;
            break;
          }
        } catch {
          // Try the next conventional extension.
        }
      }
      if (!found) errors.push(`${path.relative(root, file)}: unresolved local import ${specifier}`);
    }
  }

  const buildRoot = path.join(root, 'dist/app/out/renderer/assets');
  try {
    await fs.stat(buildRoot);
  } catch (error) {
    if (error.code !== 'ENOENT') errors.push(`dist/app/out/renderer/assets: ${error.message}`);
    return;
  }
  for (const file of sourceFiles) {
    const relative = path.relative(directory, file);
    try {
      const stat = await fs.stat(path.join(buildRoot, relative));
      if (!stat.isFile()) errors.push(`dist/app/out/renderer/assets/${relative}: build output is not a file`);
    } catch (error) {
      errors.push(`dist/app/out/renderer/assets/${relative}: ${error.code === 'ENOENT' ? 'missing after build' : error.message}`);
    }
  }
}

const packageJson = await readJson('package.json');
const lockfile = await readJson('package-lock.json');
const goToolchain = await readJson('provenance/go-toolchain.json');
const runtimeProvenance = await readJson('docs/native-runtime-provenance.json');
const recoveredProvenance = await readJson('provenance/recovered-files.json');
const maintenanceChanges = await readJson('provenance/maintenance-changes.json');
const projectMetadata = await readJson('provenance/project-metadata.json');
const currentValidation = await readJson('docs/independent-validation-current.json');
const supportMatrix = await readJson('docs/independent-support-matrix.json');
try {
  const gitignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  if (!gitignore.split(/\r?\n/).some(line => line.trim() === '.alpha/')) errors.push('.gitignore: .alpha/ runtime state must remain ignored');
} catch (error) {
  errors.push(`.gitignore: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
}
let nvmrc = null;
try {
  nvmrc = (await fs.readFile(path.join(root, '.nvmrc'), 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+$/.test(nvmrc)) errors.push('.nvmrc: expected a pinned x.y.z Node version');
} catch (error) {
  errors.push(`.nvmrc: ${error.code === 'ENOENT' ? 'missing' : error.message}`);
}

if (packageJson) {
  if (packageJson.name !== 'alpha-recovered-local' || !/^\d+\.\d+\.\d+$/.test(packageJson.version ?? '')) errors.push('package.json: project identity/version drifted');
  try { readProjectIdentity(packageJson); } catch (error) { errors.push(`package.json: ${error.message}`); }
  if (!packageJson.engines?.node || !nodeVersionInRange(process.version, packageJson.engines.node)) errors.push(`Node ${process.version} does not satisfy package.json engines.node (${packageJson.engines?.node ?? 'missing'})`);
  if (nvmrc && /^\d+\.\d+\.\d+$/.test(nvmrc) && !nodeVersionInRange(`v${nvmrc}`, packageJson.engines.node)) errors.push(`.nvmrc: pinned Node ${nvmrc} does not satisfy package.json engines.node (${packageJson.engines.node ?? 'missing'})`);
  const requiredScripts = ['build', 'build:independent', 'build:packaged', 'package:macos-app', 'package:macos-app:from-build', 'package:macos-dmg', 'package:macos-dmg:from-build', 'package:macos-app:independent', 'package:macos-app:independent:from-build', 'package:macos-dmg:independent', 'package:macos-dmg:independent:from-build', 'test', 'test:independent', 'test:smoke', 'test:smoke:native', 'test:packaged-native', 'start:native', 'verify:vendor', 'audit:native-abi', 'verify:protocol', 'verify:packaged-markers', 'verify:release-manifest', 'verify:independent-support', 'status', 'doctor', 'inspect:source', 'inspect:schema-only', 'discover:v4-sources', 'preflight:v4', 'stage:v4', 'verify:dependencies', 'audit:upstream', 'audit:public-release', 'prepare:public-source', 'bundle:recovery', 'check:project', 'check:maintainability', 'verify:maintenance', 'backup:independent-state', 'restore:independent-state', 'chatlog:preview', 'test:chatlog:candidate', 'mcp:independent', 'mcp:config'];
  for (const name of requiredScripts) if (typeof packageJson.scripts?.[name] !== 'string') errors.push(`package.json: missing script ${name}`);
}

if (lockfile && packageJson) {
  if (lockfile.lockfileVersion !== 3) errors.push(`package-lock.json: expected lockfileVersion 3, found ${lockfile.lockfileVersion}`);
  const rootPackage = lockfile.packages?.[''];
  if (!rootPackage) errors.push('package-lock.json: root package entry is missing');
  else {
    for (const key of ['name', 'version']) if (rootPackage[key] !== packageJson[key]) errors.push(`package-lock.json: root ${key} does not match package.json`);
    sameMap(rootPackage.dependencies, packageJson.dependencies, 'package-lock.json dependencies');
    sameMap(rootPackage.devDependencies, packageJson.devDependencies, 'package-lock.json devDependencies');
    sameMap(rootPackage.engines, packageJson.engines, 'package-lock.json engines');
  }
}

const requiredFiles = [
  'AGENTS.md', 'README.md', 'MAINTENANCE.md', '.gitignore', '.gitattributes',
  '.github/workflows/maintenance.yml',
  'scripts/build.mjs', 'scripts/build-packaged-resources.mjs', 'scripts/package-macos-app.mjs', 'scripts/environment.mjs', 'scripts/launch.mjs', 'scripts/verify-vendor.mjs', 'scripts/verify-packaged-markers.mjs', 'scripts/release-manifest.mjs', 'scripts/verify-release-manifest.mjs', 'scripts/audit-upstream-release.mjs', 'scripts/audit-public-release.mjs', 'scripts/prepare-public-source.mjs', 'scripts/backup-independent-state.mjs', 'scripts/restore-independent-state.mjs', 'scripts/chatlog-candidate-preview.mjs', 'scripts/test-chatlog-candidate-real.mjs',
  'scripts/setup-go.mjs', 'scripts/build-lock.mjs', 'scripts/project-contract.mjs', 'scripts/recovery-bundle.mjs', 'scripts/check-maintainability.mjs', 'scripts/verify-maintenance.mjs', 'scripts/audit-native-abi.mjs', 'scripts/verify-independent-support.mjs', 'scripts/project-status.mjs', 'scripts/doctor.mjs', 'scripts/inspect-source.mjs', 'scripts/inspect-schema-only.mjs', 'scripts/discover-v4-sources.mjs', 'scripts/preflight-v4-copy.mjs', 'scripts/verify-dependencies.mjs', 'scripts/codex-mcp-config.mjs', 'tests/packaged-native-smoke.mjs', 'tests/codex-mcp-config.test.mjs', 'tests/inspect-source.test.mjs', 'tests/inspect-schema-only.test.mjs', 'tests/discover-v4-sources.test.mjs', 'tests/preflight-v4-copy.test.mjs',
  'scripts/current-evidence-consistency.mjs', 'scripts/stage-v4-copy.mjs',
  'tests/stage-v4-copy.test.mjs',
  'src/main/index.js', 'src/agent-host/index.cjs', 'src/renderer/index.html',
  'src/renderer/assets/index-DPCwIOAb.js', 'src/renderer/assets/export-policy.mjs', 'src/renderer/assets/media-metadata-export.mjs',
  'packages/alpha-protocol/index.cjs', 'packages/alpha-engine/README.md', 'packages/alpha-engine/index.cjs', 'packages/alpha-engine/http-server.cjs', 'packages/alpha-engine/media-decoder.cjs', 'packages/alpha-engine/media-index.cjs', 'packages/alpha-engine/file-attachment.cjs', 'packages/alpha-engine/generic-jobs.cjs', 'packages/alpha-engine/optional-asr.cjs', 'packages/alpha-engine/state-backup.cjs', 'packages/alpha-wcdb-compat/README.md', 'packages/alpha-wcdb-compat/index.cjs', 'packages/alpha-wcdb-compat/probe.c', 'scripts/build-wcdb-compat-probe.mjs', 'tests/wcdb-compat.test.mjs', 'tests/optional-asr.test.mjs',
  'packages/alpha-data-bridge/go.mod', 'packages/alpha-data-bridge/go.sum', 'packages/alpha-data-bridge/media-probe.go', 'packages/alpha-data-bridge/media-probe_test.go', 'packages/alpha-data-bridge/schema-diagnostics.go', 'packages/alpha-data-bridge/schema-diagnostics_test.go',
  'packages/alpha-snapshot-import/go.mod', 'packages/alpha-snapshot-import/go.sum',
  'packages/alpha-desktop/backend-mode.cjs', 'packages/alpha-desktop/project-identity.cjs', 'packages/alpha-desktop/update-mode.cjs', 'packages/alpha-desktop/recovery-runtime.cjs', 'vendor/chatlog/go.mod',
  'provenance/go-toolchain.json', 'provenance/recovered-files.json', 'provenance/maintenance-changes.json', 'provenance/project-metadata.json', 'provenance/independent-update-mode.json',
  'CONTRIBUTING.md', 'SECURITY.md', 'CHANGELOG.md', 'docs/maintainer-playbook.md', 'docs/codex-mcp.md',
  'docs/local-build-and-run.md', 'docs/schema-only-diagnostics.md', 'docs/v4-intake-preflight.md', 'docs/native-runtime-provenance.json', 'docs/http-readonly-adapter-recovery.md', 'docs/optional-asr.md', 'docs/cross-platform-release-evidence.json', 'docs/media-decoder-evidence.md', 'docs/media-index-foundation.md', 'docs/file-attachment-recovery.md', 'docs/media-schema-evidence.md',
  'docs/independent-validation-current.json', 'docs/independent-support-matrix.json', 'docs/native-smoke-validation.json', 'docs/native-abi-validation.json', 'docs/state-backup-recovery.md', 'tests/state-backup.test.mjs', 'tests/state-backup-cli.test.mjs'
];
for (const relativePath of requiredFiles) await exists(relativePath);
await exists('vendor/runtime', 'directory');

if (goToolchain) {
  if (!/^go\d+\.\d+\.\d+$/.test(goToolchain.version) || !/^https:\/\/go\.dev\/dl\/go\d+\.\d+\.\d+\.darwin-arm64\.tar\.gz$/.test(goToolchain.url)) errors.push('provenance/go-toolchain.json: pinned macOS arm64 URL/version is invalid');
  if (!/^[a-f0-9]{64}$/.test(goToolchain.sha256) || !Number.isSafeInteger(goToolchain.bytes) || goToolchain.bytes <= 0) errors.push('provenance/go-toolchain.json: archive hash/size is invalid');
  const version = /^go(\d+\.\d+)/.exec(goToolchain.version)?.[1];
  for (const relativePath of ['packages/alpha-data-bridge/go.mod', 'packages/alpha-snapshot-import/go.mod', 'vendor/chatlog/go.mod']) {
    try {
      const source = await fs.readFile(path.join(root, relativePath), 'utf8');
      const declared = /^go\s+(\d+\.\d+(?:\.\d+)?)/m.exec(source)?.[1];
      if (!declared || !version || !declared.startsWith(`${version}.`) && declared !== version) errors.push(`${relativePath}: Go language version ${declared ?? 'missing'} differs from pinned toolchain ${goToolchain.version}`);
    } catch {
      // Missing files were already reported by the required-file check.
    }
  }
}

if (runtimeProvenance) {
  if (!Array.isArray(runtimeProvenance.entries) || runtimeProvenance.entries.length === 0) errors.push('docs/native-runtime-provenance.json: no runtime entries recorded');
}
if (recoveredProvenance && (!Array.isArray(recoveredProvenance.files) || recoveredProvenance.files.length === 0)) errors.push('provenance/recovered-files.json: no recovered source files recorded');
if (maintenanceChanges && (maintenanceChanges.originalNativeArtifactsModified !== false || !Array.isArray(maintenanceChanges.changed))) errors.push('provenance/maintenance-changes.json: maintenance record is incomplete');
if (projectMetadata) {
  if (projectMetadata.schema !== 'alpha-maintainable-project.v1') errors.push('provenance/project-metadata.json: unsupported schema');
  if (projectMetadata.maintenanceStatus !== 'user-maintained-recovery') errors.push('provenance/project-metadata.json: maintenance status is not user-maintained-recovery');
  if (projectMetadata.sourceBoundaries?.newCodeLicense !== 'not-yet-selected-by-maintainer') errors.push('provenance/project-metadata.json: new-code license boundary changed without a license record');
  const electronVersion = projectMetadata.buildBaseline?.electronVersion;
  if (!/^\d+\.\d+\.\d+$/.test(electronVersion ?? '')) errors.push('provenance/project-metadata.json: buildBaseline.electronVersion must be a pinned x.y.z version');
  if (packageJson?.devDependencies?.electron !== electronVersion) errors.push(`package.json: devDependencies.electron ${packageJson?.devDependencies?.electron ?? 'missing'} does not match project metadata ${electronVersion ?? 'missing'}`);
  const lockedElectronVersion = lockfile?.packages?.['node_modules/electron']?.version;
  if (lockedElectronVersion !== electronVersion) errors.push(`package-lock.json: node_modules/electron ${lockedElectronVersion ?? 'missing'} does not match project metadata ${electronVersion ?? 'missing'}`);
}

if (currentValidation) {
  let httpToolCount;
  try {
    httpToolCount = require(path.join(root, 'packages/alpha-engine/http-server.cjs')).toolDefinitions().length;
  } catch (error) {
    errors.push(`packages/alpha-engine/http-server.cjs: cannot load for HTTP tool count check (${error.message})`);
  }
  errors.push(...validateCurrentEvidenceRefresh(currentValidation, { httpToolCount }));
  try {
    const engine = require(path.join(root, 'packages/alpha-engine/index.cjs'));
    const total = engine.ALL_METHODS.length;
    const implemented = Object.keys(engine.SUPPORTED).length;
    const unsupported = total - implemented;
    const recorded = currentValidation.protocol;
    if (recorded?.totalRequestBranches !== total || recorded?.implementedRequestBranches !== implemented || recorded?.unsupportedRequestBranches !== unsupported) {
      errors.push('docs/independent-validation-current.json: protocol counts do not match packages/alpha-engine/index.cjs');
    }
    const matrixCounts = supportMatrix?.counts;
    if (matrixCounts?.totalRequestBranches !== total || matrixCounts?.implementedRequestBranches !== implemented || matrixCounts?.unsupportedRequestBranches !== unsupported) {
      errors.push('docs/independent-support-matrix.json: protocol counts do not match packages/alpha-engine/index.cjs');
    }
    const recordedMatrix = currentValidation.validation?.supportMatrix;
    if (recordedMatrix?.totalRequestBranches !== total || recordedMatrix?.implementedRequestBranches !== implemented || recordedMatrix?.unsupportedRequestBranches !== unsupported || recordedMatrix?.status !== 'passed') {
      errors.push('docs/independent-validation-current.json: support matrix record is stale');
    }
    const audit = currentValidation.validation?.dependencyAudit;
    const electronVersion = packageJson?.devDependencies?.electron;
    if (audit?.status !== 'passed' || audit?.electronVersion !== electronVersion || audit?.vulnerabilities?.total !== 0) {
      errors.push('docs/independent-validation-current.json: dependency audit must record zero vulnerabilities for the pinned Electron version');
    }
  } catch (error) {
    errors.push(`packages/alpha-engine/index.cjs: cannot load for protocol count check (${error.message})`);
  }
}

const gitignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8').catch(() => '');
for (const ignored of ['dist/', 'build/', '.runtime/', 'workers/agent/dist/']) {
  if (!gitignore.split(/\r?\n/).includes(ignored)) errors.push(`.gitignore: generated path ${ignored} is not ignored`);
}

await checkRendererImports();

if (errors.length) {
  console.error(`Maintainability checks failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Maintainability checks passed (${checks} required paths and metadata checks).`);
}
