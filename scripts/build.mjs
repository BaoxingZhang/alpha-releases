import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');
const app = path.join(root, 'dist/app');
const independentRequested = process.argv.includes('--independent') || process.env.ALPHA_BUILD_INDEPENDENT === '1';

const runtimeDependencies = ['@bufbuild/protobuf'];

async function digestFile(filename) {
  return crypto.createHash('sha256').update(await fs.readFile(filename)).digest('hex');
}

async function copyIndependentRuntime() {
  // Keep the independent runtime inside the app directory so it survives a
  // normal Electron app.asar/package step.  The packaged recovery adapter can
  // resolve this directory from app.getAppPath(); no original native binary
  // is copied or impersonated here.
  const independent = path.join(app, 'independent');
  await fs.rm(independent, { recursive: true, force: true });
  await fs.mkdir(path.join(independent, 'packages'), { recursive: true });

  for (const name of ['alpha-desktop', 'alpha-engine', 'alpha-security', 'alpha-protocol']) {
    await fs.cp(path.join(root, 'packages', name), path.join(independent, 'packages', name), { recursive: true });
  }

  const candidates = [
    ['alpha-data-bridge', path.join(root, 'build/candidates/alpha-data-bridge')],
    ['alpha-snapshot-import', path.join(root, 'build/candidates/alpha-snapshot-import')]
  ];
  const files = [];
  for (const [name, source] of candidates) {
    const destination = path.join(independent, 'bin', name);
    try {
      const stat = await fs.lstat(source);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('not a regular file');
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(source, destination, constants.COPYFILE_FICLONE);
      await fs.chmod(destination, stat.mode & 0o777);
      files.push({ name, source: path.relative(root, source), path: path.relative(app, destination), bytes: stat.size, sha256: await digestFile(destination), mode: (stat.mode & 0o777).toString(8) });
    } catch (error) {
      if (error.code !== 'ENOENT' && independentRequested) throw new Error(`INDEPENDENT_ARTIFACT_MISSING:${name}`);
      files.push({ name, source: path.relative(root, source), path: path.relative(app, destination), status: 'missing' });
    }
  }

  const status = files.every(file => file.status !== 'missing') ? 'ready' : 'unavailable';
  const manifest = {
    schema: 'alpha-recovered.independent-runtime.v1',
    status,
    version: '0.3.5',
    platform: process.platform,
    arch: process.arch,
    entry: 'packages/alpha-engine/cli.cjs',
    bridge: 'bin/alpha-data-bridge',
    importer: 'bin/alpha-snapshot-import',
    packages: ['alpha-engine', 'alpha-security', 'alpha-protocol'],
    files,
    sourceKind: 'maintained independent implementations; never the original native backend'
  };
  await fs.writeFile(path.join(independent, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (status !== 'ready' && independentRequested) throw new Error('INDEPENDENT_RUNTIME_INCOMPLETE');
  return manifest;
}

async function copyRuntimeDependencies(destination) {
  const nodeModules = path.join(destination, 'node_modules');
  // The generated app (and its independent subdirectory) is recreated before
  // this function runs, so there is no stale dependency tree to remove here.
  // Avoid recursive deletion races on macOS while another build is finishing.
  for (const dependency of runtimeDependencies) {
    const source = path.join(root, 'node_modules', dependency);
    const target = path.join(nodeModules, dependency);
    const stat = await fs.lstat(source).catch(error => {
      if (error.code === 'ENOENT') throw new Error(`RUNTIME_DEPENDENCY_MISSING:${dependency}`);
      throw error;
    });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`RUNTIME_DEPENDENCY_INVALID:${dependency}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true });
  }
}

await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });
await fs.mkdir(app, { recursive: true });
await fs.cp(path.join(src, 'renderer'), path.join(app, 'out/renderer'), { recursive: true });
const common = { bundle: false, sourcemap: true, sourcesContent: true, minify: false, legalComments: 'inline', logLevel: 'info', metafile: true };
const outputs = await Promise.all([
  build({ ...common, entryPoints: [path.join(src, 'main/index.js')], outdir: path.join(app, 'out/main'), platform: 'node', format: 'cjs', target: 'node24' }),
  build({ ...common, entryPoints: (await fs.readdir(path.join(src, 'preload'))).filter(x => x.endsWith('.js')).map(x => path.join(src, 'preload', x)), outdir: path.join(app, 'out/preload'), platform: 'node', format: 'cjs', target: 'node24' }),
  build({ ...common, entryPoints: (await fs.readdir(path.join(src, 'renderer/assets'))).filter(x => x.endsWith('.js') || x.endsWith('.mjs')).map(x => path.join(src, 'renderer/assets', x)), outdir: path.join(app, 'out/renderer/assets'), platform: 'browser', format: 'esm', target: 'es2022' }),
  build({ ...common, entryPoints: [path.join(src, 'agent-host/index.cjs')], outfile: path.join(root, 'workers/agent/dist/index.cjs'), platform: 'node', format: 'cjs', target: 'node24' })
]);
await fs.copyFile(path.join(root, 'scripts/bootstrap.cjs'), path.join(app, 'bootstrap.cjs'));
await fs.copyFile(path.join(root, 'packages/alpha-desktop/recovery-runtime.cjs'), path.join(app, 'out/main/recovery-runtime.cjs'));
for (const name of ['alpha-desktop', 'alpha-engine', 'alpha-security', 'alpha-protocol']) {
  await fs.cp(path.join(root, 'packages', name), path.join(app, 'packages', name), { recursive: true });
}
const independentManifest = await copyIndependentRuntime();
await copyRuntimeDependencies(path.join(app, 'independent'));
// The recovered main process and the independent protocol package both load
// @bufbuild/protobuf at runtime. Keep this dependency beside the app payload
// so a packaged app does not accidentally depend on the developer's
// node_modules directory.
await copyRuntimeDependencies(app);
await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'alpha-recovered-local', productName: 'Alpha Recovered', version: '0.3.5', private: true, main: 'bootstrap.cjs' }, null, 2) + '\n');
await fs.mkdir(path.join(root, 'build'), { recursive: true });
const runtimeBundle = path.join(root, 'build/runtime-bundle');
// Original validation rejects symlinks anywhere in the resource path.
await fs.rm(runtimeBundle, { recursive: true, force: true });
await fs.cp(path.join(root, 'vendor/runtime'), runtimeBundle, { recursive: true, preserveTimestamps: true, mode: constants.COPYFILE_FICLONE });
await fs.writeFile(path.join(root, 'docs/build-results.json'), JSON.stringify({ builtAt: new Date().toISOString(), node: process.version, electron: '44.10.1', esbuild: '0.28.2', sourceKind: 'recovered emitted JavaScript; not original TypeScript', nativeRecompiled: false, runtimeDependencies, independentRuntime: independentManifest, outputs: outputs.map(x => x.metafile) }, null, 2) + '\n');
console.log(`Built recovered JavaScript (${independentManifest.status} independent runtime). Original native binaries remain unchanged.`);
