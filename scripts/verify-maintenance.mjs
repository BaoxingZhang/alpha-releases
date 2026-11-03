import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// These checks are deliberately read-only and do not require a built app or
// an authorized data directory. Build, package, smoke, and dependency audits
// remain separate because they have different prerequisites and side effects.
const checks = [
  'check:project',
  'check:maintainability',
  'verify:protocol',
  'verify:vendor',
  'verify:independent-support',
  'audit:api'
];

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', script], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('close', code => resolve(code ?? 1));
  });
}

for (const script of checks) {
  console.log(`\n[maintenance] npm run ${script}`);
  let code;
  try {
    code = await run(script);
  } catch (error) {
    console.error(`[maintenance] failed to start ${script}: ${error.message}`);
    process.exitCode = 1;
    break;
  }
  if (code !== 0) {
    console.error(`[maintenance] ${script} failed with exit code ${code}`);
    process.exitCode = code;
    break;
  }
}

if (!process.exitCode) console.log(`\nMaintenance checks passed (${checks.length} read-only checks).`);
