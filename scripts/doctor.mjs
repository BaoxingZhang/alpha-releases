import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NODE_MIN_MINOR = 15;
const NODE_MAJOR = 24;

function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?/.exec(String(version ?? ''));
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3] ?? 0) } : null;
}

export function nodeVersionSupported(version) {
  const parsed = parseNodeVersion(version);
  return Boolean(parsed && parsed.major === NODE_MAJOR && parsed.minor >= NODE_MIN_MINOR);
}

async function isDirectory(fsApi, target) {
  try { return (await fsApi.stat(target)).isDirectory(); } catch { return false; }
}

async function isFile(fsApi, target) {
  try { return (await fsApi.stat(target)).isFile(); } catch { return false; }
}

export async function collectDoctorReport({
  root = repositoryRoot,
  nodeVersion = process.version,
  platform = process.platform,
  arch = process.arch,
  fsApi = fs
} = {}) {
  const checks = [];
  const check = (id, ok, detail, required = true) => checks.push({ id, ok: Boolean(ok), required, detail });

  check('node', nodeVersionSupported(nodeVersion), `Node ${nodeVersion}; requires >=24.15 <25`);
  check('platform', platform === 'darwin' && arch === 'arm64', `${platform}/${arch}; packaged runtime requires macOS arm64`);
  check('package-json', await isFile(fsApi, path.join(root, 'package.json')), 'package.json is present');
  check('package-lock', await isFile(fsApi, path.join(root, 'package-lock.json')), 'package-lock.json is present');
  check('vendor-runtime', await isDirectory(fsApi, path.join(root, 'vendor', 'runtime')), 'vendor/runtime is present');
  check('electron-binary', await isFile(fsApi, path.join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')), 'Electron 44 binary is installed');
  check('esbuild-binary', await isFile(fsApi, path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')), 'esbuild binary is installed');

  const required = checks.filter(item => item.required);
  const ok = required.every(item => item.ok);
  return {
    schema: 'alpha-recovery-doctor.v1',
    status: ok ? 'ready' : 'blocked',
    scope: 'local-build-prerequisites',
    dataAccess: 'none',
    checks,
    nextSteps: ok ? ['npm run build:independent', 'npm run test:independent'] : ['nvm use', 'npm ci', 'npm run setup']
  };
}

function printHuman(report) {
  console.log(`Alpha recovery doctor: ${report.status}`);
  console.log(`scope: ${report.scope}; data access: ${report.dataAccess}`);
  for (const item of report.checks) console.log(`${item.ok ? 'ok' : 'FAIL'} ${item.id}: ${item.detail}`);
  console.log(`next: ${report.nextSteps.join(' && ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await collectDoctorReport();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
  if (report.status !== 'ready') process.exitCode = 1;
}
