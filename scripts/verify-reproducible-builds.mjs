import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const targets = [
  { script: 'build:bridge', artifact: 'build/candidates/alpha-data-bridge' },
  { script: 'build:snapshot-import', artifact: 'build/candidates/alpha-snapshot-import' }
];

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', script], {
      cwd: root,
      env: process.env,
      stdio: 'inherit'
    });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`${script} exited with ${code ?? 'unknown'}`)));
  });
}

async function sha256(file) {
  return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

for (const target of targets) {
  await run(target.script);
  const first = await sha256(path.join(root, target.artifact));
  await run(target.script);
  const second = await sha256(path.join(root, target.artifact));
  if (first !== second) {
    throw new Error(`REPRODUCIBLE_BUILD_MISMATCH ${target.artifact}: ${first} != ${second}`);
  }
  console.log(`Reproducible build verified: ${target.artifact} ${second}`);
}

