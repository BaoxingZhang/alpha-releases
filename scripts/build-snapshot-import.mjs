import fs from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, setupGo, command, sha256 } from './setup-go.mjs';
import { acquireBuildLock } from './build-lock.mjs';

const source = path.join(projectRoot, 'packages/alpha-snapshot-import');
const buildSource = path.join(projectRoot, 'build/snapshot-import-source');
const output = path.join(projectRoot, 'build/candidates/alpha-snapshot-import');
const reportPath = path.join(projectRoot, 'build/candidates/snapshot-import-build.json');
const report = { startedAt: new Date().toISOString(), status: 'in_progress', sourceFiles: {}, scope: 'Build only; no key, decrypt, or real-data operation is executed.' };
const releaseBuildLock = await acquireBuildLock({ name: 'build-snapshot-import' });
try {
  const toolchain = await setupGo();
  const cacheRoot = path.join(projectRoot, '.runtime/chatlog-go');
  const cache = { GOCACHE: path.join(cacheRoot, 'build-cache'), GOMODCACHE: path.join(cacheRoot, 'module-cache'), GOPATH: path.join(cacheRoot, 'gopath'), GOTMPDIR: path.join(projectRoot, '.runtime/snapshot-import-go/tmp') };
  await Promise.all(Object.values(cache).map(dir => fs.mkdir(dir, { recursive: true })));
  const clang = (await command('/usr/bin/xcrun', ['--find', 'clang'])).stdout.trim();
  const sdk = (await command('/usr/bin/xcrun', ['--show-sdk-path'])).stdout.trim();
  const env = { ...process.env, ...cache, TMPDIR: cache.GOTMPDIR, GOROOT: toolchain.install, GOENV: 'off', GOWORK: 'off', GOTOOLCHAIN: 'local', CGO_ENABLED: '1', GOOS: 'darwin', GOARCH: 'arm64', GOFLAGS: '', GOPROXY: 'https://proxy.golang.org,direct', GOSUMDB: 'sum.golang.org', CC: clang, SDKROOT: sdk };
  for (const name of ['CGO_CFLAGS', 'CGO_CPPFLAGS', 'CGO_CXXFLAGS', 'CGO_LDFLAGS', 'GOEXPERIMENT', 'GOARM64', 'GOVCS']) delete env[name];
  await fs.rm(buildSource, { recursive: true, force: true }); await fs.mkdir(buildSource, { recursive: true });
  for (const name of await fs.readdir(source)) { if (!name.endsWith('.go') && !['go.mod','go.sum'].includes(name)) continue; report.sourceFiles[name] = await sha256(path.join(source,name)); await fs.copyFile(path.join(source,name),path.join(buildSource,name)); }
  report.toolchain = { version: toolchain.version, archiveSha256: toolchain.archiveSha256, binary: toolchain.binary };
  await command(toolchain.binary, ['test', '-mod=readonly', './...'], { cwd: buildSource, env, onOutput: text => process.stdout.write(text) });
  await fs.mkdir(path.dirname(output), { recursive: true }); await command(toolchain.binary, ['build', '-mod=readonly', '-trimpath', '-buildvcs=false', '-o', output+'.building', '.'], { cwd: buildSource, env, onOutput: text => process.stdout.write(text) }); await fs.rename(output+'.building',output);
  report.artifact = { path: output, bytes: (await fs.stat(output)).size, sha256: await sha256(output), file: (await command('/usr/bin/file',[output])).stdout.trim(), buildInfo: 'build/snapshot-import-build-info.txt' };
  await fs.writeFile(path.join(projectRoot,'build/snapshot-import-build-info.txt'),(await command(toolchain.binary,['version','-m',output],{env})).stdout+'\n');
  for (const [name,hash] of Object.entries(report.sourceFiles)) if (hash!==await sha256(path.join(source,name))) throw new Error('Snapshot importer source changed during build');
  report.status='passed';
} catch (error) { report.status='failed'; report.error=error.message; console.error(error.message); process.exitCode=1; }
finally { try { report.finishedAt=new Date().toISOString(); await fs.mkdir(path.dirname(reportPath),{recursive:true}); await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n'); console.log(`Snapshot importer build ${report.status}: ${reportPath}`); } finally { await releaseBuildLock(); } }
