import { spawn } from 'node:child_process';

const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--omit=optional', '--json'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', chunk => { stdout += chunk; });
child.stderr.on('data', chunk => { stderr += chunk; });

const exitCode = await new Promise((resolve, reject) => {
  child.once('error', reject);
  child.once('close', resolve);
});

let report;
try {
  report = JSON.parse(stdout);
} catch (error) {
  console.error('Dependency audit did not return JSON.');
  if (stderr.trim()) console.error(stderr.trim());
  console.error(error.message);
  process.exitCode = 1;
}

if (report) {
  const vulnerabilities = report.metadata?.vulnerabilities ?? {};
  const summary = {
    info: Number(vulnerabilities.info ?? 0),
    low: Number(vulnerabilities.low ?? 0),
    moderate: Number(vulnerabilities.moderate ?? 0),
    high: Number(vulnerabilities.high ?? 0),
    critical: Number(vulnerabilities.critical ?? 0),
    total: Number(vulnerabilities.total ?? 0)
  };
  console.log(JSON.stringify({ command: 'npm audit --omit=optional', vulnerabilities: summary }, null, 2));
  if (exitCode !== 0 || summary.total !== 0) {
    console.error('Dependency audit failed: the locked dependency tree has vulnerabilities.');
    process.exitCode = 1;
  }
}
