import { spawn } from 'node:child_process';
import electron from 'electron';
import path from 'node:path';
import { root, launchEnvironment, sandboxProfile } from './environment.mjs';
const child = spawn('/usr/bin/sandbox-exec', ['-f', sandboxProfile(), electron, '--no-sandbox', path.join(root, 'dist/app')], { cwd: root, env: launchEnvironment(), stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
child.on('error', e => { console.error(e); process.exitCode = 1; });
