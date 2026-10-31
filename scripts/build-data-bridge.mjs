import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, setupGo, command, sha256 } from './setup-go.mjs';

const source = path.join(projectRoot, 'packages/alpha-data-bridge');
const buildSource = path.join(projectRoot, 'build/data-bridge-source');
const output = path.join(projectRoot, 'build/candidates/alpha-data-bridge');
const reportPath = path.join(projectRoot, 'build/candidates/data-bridge-build.json');
const report = { startedAt: new Date().toISOString(), status: 'in_progress', sourceKind: 'Original Go implementation; no Chatlog internal packages or binaries are imported', sourceFiles: {}, testResults: null };
try {
  const toolchain = await setupGo();
  const cacheRoot = path.join(projectRoot, '.runtime/chatlog-go');
  const cache = { GOCACHE: path.join(cacheRoot, 'build-cache'), GOMODCACHE: path.join(cacheRoot, 'module-cache'), GOPATH: path.join(cacheRoot, 'gopath'), GOTMPDIR: path.join(projectRoot, '.runtime/data-bridge-go/tmp') };
  await Promise.all(Object.values(cache).map(dir => fs.mkdir(dir, { recursive: true })));
  const clang = (await command('/usr/bin/xcrun', ['--find', 'clang'])).stdout.trim();
  const sdk = (await command('/usr/bin/xcrun', ['--show-sdk-path'])).stdout.trim();
  const env = { ...process.env, ...cache, TMPDIR: cache.GOTMPDIR, GOROOT: toolchain.install, GOENV: 'off', GOWORK: 'off', GOTOOLCHAIN: 'local', CGO_ENABLED: '1', GOOS: 'darwin', GOARCH: 'arm64', GOFLAGS: '', GOPROXY: 'https://proxy.golang.org,direct', GOSUMDB: 'sum.golang.org', GOPRIVATE: '', GONOSUMDB: '', GONOPROXY: '', CC: clang, SDKROOT: sdk };
  for (const name of ['CGO_CFLAGS', 'CGO_CPPFLAGS', 'CGO_CXXFLAGS', 'CGO_LDFLAGS', 'GOEXPERIMENT', 'GOARM64', 'GOVCS']) delete env[name];
  await fs.rm(buildSource, { recursive: true, force: true });
  await fs.mkdir(buildSource, { recursive: true });
  for (const name of await fs.readdir(source)) {
    if (!name.endsWith('.go') && name !== 'go.mod' && name !== 'go.sum') continue;
    report.sourceFiles[name] = await sha256(path.join(source, name));
    await fs.copyFile(path.join(source, name), path.join(buildSource, name));
  }
  report.toolchain = { version: toolchain.version, binary: toolchain.binary, archiveSha256: toolchain.archiveSha256 };
  console.log('Testing original read-only bridge against synthetic SQLite fixtures.');
  report.testResults = await command(toolchain.binary, ['test', '-mod=readonly', '-v', './...'], { cwd: buildSource, env, onOutput: text => process.stdout.write(text) });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await command(toolchain.binary, ['build', '-mod=readonly', '-trimpath', '-o', output + '.building', '.'], { cwd: buildSource, env, onOutput: text => process.stdout.write(text) });
  await fs.rename(output + '.building', output);
  report.artifact = { path: output, bytes: (await fs.stat(output)).size, sha256: await sha256(output), file: (await command('/usr/bin/file', [output])).stdout.trim(), buildInfo: (await command(toolchain.binary, ['version', '-m', output], { env })).stdout.trim() };
  for (const [name, hash] of Object.entries(report.sourceFiles)) {
    if (hash !== await sha256(path.join(source, name))) throw new Error('Bridge source changed during build');
    if ((name === 'go.mod' || name === 'go.sum') && hash !== await sha256(path.join(buildSource, name))) throw new Error('Readonly build unexpectedly changed module files');
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(source, 'build-validation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Data bridge build ${report.status}: ${reportPath}`);
}
