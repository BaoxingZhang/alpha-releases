import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditPublicTree, writeAuditReport } from './audit-public-release.mjs';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_REPORT_NAME = 'public-release-audit.json';
const DEFAULT_MANIFEST_NAME = 'public-source-candidate.v1.json';
const TOP_LEVEL_EXCLUDES = new Set(['.git', '.alpha', '.runtime', 'node_modules', 'dist', 'build']);
const PRIVATE_EVIDENCE_DEFAULT_EXCLUDES = new Set([
  'packages/alpha-data-bridge/.runtime',
  'packages/alpha-data-bridge/build-validation.json',
  'packages/alpha-data-bridge/search-validation.json',
  'packages/alpha-snapshot-import/build-validation.json',
  'workers/agent/dist',
  'docs/native-diagnosis-evidence',
  'docs/native-startup-diagnosis.json',
  'docs/runtime-gap-review.json',
  'docs/recovered-code-index.json',
  'docs/recovered-functions.tsv',
  'docs/recovered-modules.tsv',
  'docs/chatlog-build-info.txt',
  'docs/chatlog-build-results.json',
  'docs/chatlog-build.log',
  'docs/chatlog-dependency-licenses.json',
  'docs/encrypted-run.json',
  'docs/independent-run.json',
  'docs/independent-validation.json',
  'docs/local-run.json',
  'docs/native-capability-inventory.json',
  'docs/native-runtime-provenance.json',
  'docs/native-source-gaps.json',
  'docs/recovered-components.tsv',
  'docs/upstream-alpha-releases-current.json',
  'provenance/recovered-files.json',
  'provenance/rea-evidence.json'
]);

function fail(code, detail = '') { throw new Error(detail ? `${code}:${detail}` : code); }
function normalize(relative) { return relative.split(path.sep).join('/'); }
function inside(parent, candidate) {
  const p = path.resolve(parent);
  const c = path.resolve(candidate);
  return c === p || c.startsWith(`${p}${path.sep}`);
}
function relative(root, absolute) { return normalize(path.relative(root, absolute)); }
function assertExternalArtifact(label, value, sourceRoot, destination) {
  const artifact = path.resolve(value);
  if (inside(sourceRoot, artifact) || inside(destination, artifact)) fail(`PUBLIC_SOURCE_${label}_MUST_BE_EXTERNAL`);
  return artifact;
}
function isPathExcluded(value, extraExcludes) {
  const rel = normalize(value);
  const first = rel.split('/')[0];
  if (TOP_LEVEL_EXCLUDES.has(first) || rel === 'workers/agent/dist' || rel.startsWith('workers/agent/dist/')) return true;
  if (/^docs\/.*\.(?:png|log)$/i.test(rel)) return true;
  if (PRIVATE_EVIDENCE_DEFAULT_EXCLUDES.has(rel)) return true;
  if (extraExcludes.some(item => rel === item || rel.startsWith(`${item}/`))) return true;
  if (rel === 'vendor/runtime' || rel === 'vendor/runtime/bin') return false;
  if (rel.startsWith('vendor/runtime/')) {
    if (/^vendor\/runtime\/(?:manifests|policies|resources)(?:\/|$)/.test(rel)) return false;
    return !/^vendor\/runtime\/bin\/[^/]+\.(?:LICENSE|README)$/i.test(rel);
  }
  return false;
}

async function copyTree(sourceRoot, currentSource, outputRoot, extraExcludes, files) {
  const entries = await fs.readdir(currentSource, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const source = path.join(currentSource, entry.name);
    const rel = relative(sourceRoot, source);
    if (isPathExcluded(rel, extraExcludes)) continue;
    const destination = path.join(outputRoot, rel);
    if (entry.isSymbolicLink()) fail('PUBLIC_SOURCE_SYMLINK_REJECTED', rel);
    if (entry.isDirectory()) {
      await fs.mkdir(destination, { recursive: true, mode: 0o755 });
      await copyTree(sourceRoot, source, outputRoot, extraExcludes, files);
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o755 });
      await fs.copyFile(source, destination);
      const stat = await fs.stat(source);
      await fs.chmod(destination, stat.mode & 0o777);
      files.push({ path: rel, bytes: stat.size });
    } else {
      fail('PUBLIC_SOURCE_ENTRY_UNSUPPORTED', rel);
    }
  }
}

export async function preparePublicSource({ root = repositoryRoot, output, excludes = [], reportPath, manifestPath } = {}) {
  const sourceRoot = path.resolve(root);
  if (!output || typeof output !== 'string') fail('PUBLIC_SOURCE_OUTPUT_REQUIRED');
  const destination = path.resolve(output);
  if (destination === sourceRoot || inside(sourceRoot, destination)) fail('PUBLIC_SOURCE_OUTPUT_MUST_BE_OUTSIDE_ROOT');
  const sourceStat = await fs.stat(sourceRoot).catch(error => { if (error.code === 'ENOENT') fail('PUBLIC_SOURCE_ROOT_MISSING'); throw error; });
  if (!sourceStat.isDirectory()) fail('PUBLIC_SOURCE_ROOT_INVALID');
  try {
    await fs.lstat(destination);
    fail('PUBLIC_SOURCE_OUTPUT_EXISTS', destination);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const extraExcludes = excludes.map(item => {
    if (typeof item !== 'string') fail('PUBLIC_SOURCE_EXCLUDE_INVALID');
    return normalize(item.replace(/^\.\//, '').replace(/\/$/, ''));
  }).filter(Boolean);
  if (extraExcludes.some(item => path.posix.isAbsolute(item) || item.includes('..'))) fail('PUBLIC_SOURCE_EXCLUDE_INVALID');
  const auditOutput = assertExternalArtifact('REPORT', reportPath || `${destination}.${DEFAULT_REPORT_NAME}`, sourceRoot, destination);
  const outputManifest = assertExternalArtifact('MANIFEST', manifestPath || `${destination}.${DEFAULT_MANIFEST_NAME}`, sourceRoot, destination);
  if (auditOutput === outputManifest) fail('PUBLIC_SOURCE_ARTIFACT_PATH_COLLISION');
  for (const artifact of [auditOutput, outputManifest]) {
    try {
      await fs.lstat(artifact);
      fail('PUBLIC_SOURCE_ARTIFACT_EXISTS', artifact);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  await fs.mkdir(destination, { recursive: true, mode: 0o755 });
  const files = [];
  await copyTree(sourceRoot, sourceRoot, destination, extraExcludes, files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const audit = await auditPublicTree({ root: destination, reportPath: auditOutput, strict: true });
  await writeAuditReport(auditOutput, audit);
  const result = {
    schema: 'alpha-public-source-candidate.v1',
    sourceRoot: sourceRoot === repositoryRoot ? '.' : '[caller-specified]',
    output: destination,
    excluded: [...new Set([...PRIVATE_EVIDENCE_DEFAULT_EXCLUDES, ...extraExcludes])].sort(),
    fileCount: files.length,
    files,
    audit: {
      status: audit.status,
      enforcement: audit.enforcement,
      findingCount: audit.findingCount,
      reportPath: auditOutput
    },
    status: audit.status === 'passed' ? 'ready-for-license-and-review' : 'blocked-by-public-audit'
  };
  await fs.mkdir(path.dirname(outputManifest), { recursive: true, mode: 0o700 });
  await fs.writeFile(outputManifest, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return result;
}

function usage() {
  return [
    'Usage: node scripts/prepare-public-source.mjs --output PATH [options]',
    '',
    'Copies a new candidate tree, excludes generated/private evidence, and runs the strict public-release audit.',
    'The source tree is never modified. A failed audit leaves the candidate and a redacted report for review.',
    'Options:',
    '  --root PATH       source repository root (default: current repository)',
    '  --output PATH     new output directory outside --root (required)',
    '  --exclude PATH    additional source-relative path to exclude (repeatable)',
    '  --report PATH     redacted audit report path',
    '  --manifest PATH   candidate manifest path',
    '  --help            show this help'
  ].join('\n');
}

function parseArgs(argv) {
  const options = { root: repositoryRoot, output: undefined, excludes: [], reportPath: undefined, manifestPath: undefined };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (['--root', '--output', '--exclude', '--report', '--manifest'].includes(argument)) {
      const value = argv[++index];
      if (!value) fail(`${argument.slice(2).toUpperCase()}_MISSING`);
      if (argument === '--root') options.root = path.resolve(value);
      else if (argument === '--output') options.output = value;
      else if (argument === '--exclude') options.excludes.push(value);
      else if (argument === '--report') options.reportPath = value;
      else options.manifestPath = value;
      continue;
    }
    if (argument.startsWith('--')) fail('ARGUMENT_INVALID', argument);
    fail('ARGUMENT_INVALID', argument);
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log(usage());
    else {
      const result = await preparePublicSource(options);
      console.log(`Public source candidate ${result.status}: ${result.output}`);
      console.log(`Files: ${result.fileCount}; findings: ${result.audit.findingCount}`);
      console.log(`Audit report: ${result.audit.reportPath}`);
      console.log(`Manifest: ${path.resolve(options.manifestPath || `${result.output}.${DEFAULT_MANIFEST_NAME}`)}`);
      if (result.status !== 'ready-for-license-and-review') process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
