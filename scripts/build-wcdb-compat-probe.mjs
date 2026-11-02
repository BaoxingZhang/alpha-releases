import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, command, sha256 } from './setup-go.mjs';

if (process.platform !== 'darwin') throw new Error('WCDB_COMPAT_PROBE_REQUIRES_MACOS');
const source = path.join(projectRoot, 'packages/alpha-wcdb-compat/probe.c');
const output = path.join(projectRoot, '.runtime/candidates/alpha-wcdb-compat-probe');
const reportPath = path.join(projectRoot, '.runtime/candidates/alpha-wcdb-compat-probe-build.json');
await fs.mkdir(path.dirname(output), { recursive: true });
const clang = (await command('/usr/bin/xcrun', ['--find', 'clang'])).stdout.trim();
const sdk = (await command('/usr/bin/xcrun', ['--show-sdk-path'])).stdout.trim();
await command(clang, ['-arch', 'arm64', '-isysroot', sdk, '-O2', '-Wall', '-Wextra', '-Werror', source, '-o', output]);
const report = { schema: 'alpha-third-party-wcdb-probe-build.v1', status: 'passed', sourceSha256: await sha256(source), artifactSha256: await sha256(output), artifact: output, platform: process.platform, architecture: 'arm64' };
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
