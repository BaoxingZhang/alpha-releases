import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, 'src');
const app = path.join(root, 'dist/app');
await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });
await fs.mkdir(app, { recursive: true });
await fs.cp(path.join(src, 'renderer'), path.join(app, 'out/renderer'), { recursive: true });
const common = { bundle: false, sourcemap: true, sourcesContent: true, minify: false, legalComments: 'inline', logLevel: 'info', metafile: true };
const outputs = await Promise.all([
  build({ ...common, entryPoints: [path.join(src, 'main/index.js')], outdir: path.join(app, 'out/main'), platform: 'node', format: 'cjs', target: 'node24' }),
  build({ ...common, entryPoints: (await fs.readdir(path.join(src, 'preload'))).filter(x => x.endsWith('.js')).map(x => path.join(src, 'preload', x)), outdir: path.join(app, 'out/preload'), platform: 'node', format: 'cjs', target: 'node24' }),
  build({ ...common, entryPoints: (await fs.readdir(path.join(src, 'renderer/assets'))).filter(x => x.endsWith('.js')).map(x => path.join(src, 'renderer/assets', x)), outdir: path.join(app, 'out/renderer/assets'), platform: 'browser', format: 'esm', target: 'es2022' }),
  build({ ...common, entryPoints: [path.join(src, 'agent-host/index.cjs')], outfile: path.join(root, 'workers/agent/dist/index.cjs'), platform: 'node', format: 'cjs', target: 'node24' })
]);
await fs.copyFile(path.join(root, 'scripts/bootstrap.cjs'), path.join(app, 'bootstrap.cjs'));
await fs.writeFile(path.join(app, 'package.json'), JSON.stringify({ name: 'alpha-recovered-local', productName: 'Alpha Recovered', version: '0.3.5', private: true, main: 'bootstrap.cjs' }, null, 2) + '\n');
await fs.mkdir(path.join(root, 'build'), { recursive: true });
const runtimeBundle = path.join(root, 'build/runtime-bundle');
// Original validation rejects symlinks anywhere in the resource path.
await fs.rm(runtimeBundle, { recursive: true, force: true });
await fs.cp(path.join(root, 'vendor/runtime'), runtimeBundle, { recursive: true, preserveTimestamps: true, mode: constants.COPYFILE_FICLONE });
await fs.writeFile(path.join(root, 'docs/build-results.json'), JSON.stringify({ builtAt: new Date().toISOString(), node: process.version, electron: '44.0.0', esbuild: '0.28.2', sourceKind: 'recovered emitted JavaScript; not original TypeScript', nativeRecompiled: false, outputs: outputs.map(x => x.metafile) }, null, 2) + '\n');
console.log('Built recovered JavaScript. Original native binaries remain unchanged.');
