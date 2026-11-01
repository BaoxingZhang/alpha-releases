import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
import { root, launchEnvironment, sandboxProfile } from './environment.mjs';
const args = process.argv.slice(2);
const options = {};
let session = 'manual';
while (args.length) {
  const option = args.shift();
  if (option === '--independent') { options.backend = 'independent'; session = 'independent-manual'; }
  else if (option === '--agent-fixture') { options.agentFixture = true; }
  else if (option === '--data-dir' && args.length) options.dataDir = args.shift();
  else if (option === '--encrypted-dir' && args.length) options.encryptedDir = args.shift();
  else if (option === '--account-id' && args.length) options.accountId = args.shift();
  else if (option === '--session' && args.length) session = args.shift();
  else throw new Error(`Unknown or incomplete argument: ${option}`);
}
if ((options.dataDir || options.encryptedDir) && options.backend !== 'independent') throw new Error('--data-dir/--encrypted-dir requires --independent');
if (options.agentFixture && options.backend !== 'independent') throw new Error('--agent-fixture requires --independent');
const child = spawn('/usr/bin/sandbox-exec', ['-f', sandboxProfile(), electron, '--no-sandbox', path.join(root, 'dist/app')], { cwd: root, env: launchEnvironment(session, options), stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
child.on('error', e => { console.error(e); process.exitCode = 1; });
