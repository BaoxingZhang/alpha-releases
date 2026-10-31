import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectRoot, setupGo, command, sha256 } from './setup-go.mjs';

const pinnedCommit = 'a7162bca9454fa43b5950a2414670983fe180e56';
const source = path.join(projectRoot, 'vendor/chatlog');
const docs = path.join(projectRoot, 'docs');
const output = path.join(projectRoot, 'build/candidates/chatlog');
const logFile = path.join(docs, 'chatlog-build.log');
const resultsFile = path.join(docs, 'chatlog-build-results.json');
const result = {
  startedAt: new Date().toISOString(), status: 'in_progress', source: { repository: 'https://github.com/imldy/chatlog', commit: pinnedCommit, directory: source },
  target: 'darwin/arm64', candidateExecuted: false, systemSecurityChanged: false,
  scope: 'Compile fixed candidate source only; not an Alpha backend replacement or real-data validation.',
  checks: {}, limitations: ['No key acquisition, process memory access, server/TUI launch, or real WeChat data access.', 'No Alpha engine protocol adapter or UI integration is provided by this build.', 'Current WeChat compatibility and full Alpha feature coverage remain unverified.', 'Original automatic macOS key acquisition requires SIP changes; it was not invoked.', 'Dependency license inventory records notices, not a complete legal audit.']
};
let log = '';
function logOutput(text) { log += text; process.stdout.write(text); }
async function run(executable, args, options = {}) {
  log += `\n$ ${executable} ${args.join(' ')}\n`;
  const response = await command(executable, args, options);
  if (!options.onOutput) log += response.stdout + response.stderr;
  return response.stdout.trim();
}
function parseJsonSequence(text) {
  const values = [];
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; continue; }
    if (c === '"') inString = true;
    else if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}' && --depth === 0) values.push(JSON.parse(text.slice(start, i + 1)));
  }
  if (depth || inString) throw new Error('Incomplete Go JSON sequence.');
  return values;
}
async function licenseFiles(directory, relative = '') {
  const files = [];
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await licenseFiles(directory, next));
    else if (entry.isFile() && /^(licen[cs]e|copying|notice|copyright)(?:$|[._-])/i.test(entry.name)) files.push(next);
  }
  return files;
}
async function preserveLicenses(modules) {
  const destination = path.join(docs, 'chatlog-licenses');
  await fs.mkdir(destination, { recursive: true });
  const entries = [];
  for (const module of modules) {
    if (!module.Dir) throw new Error(`No cached source directory for built module ${module.Path}`);
    const id = `${module.Path}${module.Version ? '@' + module.Version : '@candidate'}`;
    if (id.split('/').includes('..') || path.isAbsolute(id)) throw new Error('Unexpected module path.');
    const files = [];
    for (const relative of await licenseFiles(module.Dir)) {
      const from = path.join(module.Dir, relative);
      const to = path.join(destination, id, relative);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
      files.push({ sourceRelativePath: relative, preservedPath: path.relative(projectRoot, to), sha256: await sha256(to) });
    }
    entries.push({ module: module.Path, version: module.Version ?? null, sourceDirectory: module.Dir, goMod: module.GoMod ?? null, licenseFiles: files, missingStandaloneLicense: files.length === 0 });
  }
  const embedded = [];
  for (const spec of [{ module: 'github.com/sjzar/go-lame', file: 'clame/encoder.c', lines: 24, description: 'Embedded LAME: GNU Library GPL v2 or later; root wrapper license is not the entire dependency license.' }, { module: 'github.com/sjzar/go-silk', file: 'csilk/SKP_Silk_CNG.c', lines: 26, description: 'Embedded SILK: Skype copyright, redistribution terms and no express/implied patent license.' }]) {
    const module = modules.find(item => item.Path === spec.module);
    if (!module) continue;
    const from = path.join(module.Dir, spec.file);
    const text = (await fs.readFile(from, 'utf8')).split('\n').slice(0, spec.lines).join('\n') + '\n';
    const to = path.join(destination, `${module.Path}@${module.Version}`, spec.file + '.notice.txt');
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.writeFile(to, text);
    embedded.push({ module: spec.module, originalFile: spec.file, sourceSha256: await sha256(from), preservedNotice: path.relative(projectRoot, to), description: spec.description });
  }
  const manifest = { generatedAt: new Date().toISOString(), scope: 'Source license/notice files from modules actually imported by this candidate build; embedded audio notices sampled explicitly.', modules: entries, embeddedNotices: embedded };
  await fs.writeFile(path.join(docs, 'chatlog-dependency-licenses.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { modules: entries.length, standaloneLicenseFiles: entries.reduce((sum, item) => sum + item.licenseFiles.length, 0), modulesWithoutStandaloneLicense: entries.filter(item => item.missingStandaloneLicense).map(item => item.module), embeddedNotices: embedded.length, manifest: 'docs/chatlog-dependency-licenses.json' };
}

try {
  await fs.mkdir(docs, { recursive: true });
  const actualCommit = await run('/usr/bin/git', ['-C', source, 'rev-parse', 'HEAD']);
  if (actualCommit !== pinnedCommit) throw new Error(`Candidate source commit differs from pinned ${pinnedCommit}.`);
  const beforeStatus = await run('/usr/bin/git', ['-C', source, 'status', '--porcelain', '--untracked-files=all']);
  if (beforeStatus) throw new Error('Candidate source is modified; refusing to describe it as the fixed upstream build.');
  result.source.goModSha256Before = await sha256(path.join(source, 'go.mod'));
  result.source.goSumSha256Before = await sha256(path.join(source, 'go.sum'));
  result.toolchain = await setupGo();
  const cacheRoot = path.join(projectRoot, '.runtime/chatlog-go');
  const directories = { GOCACHE: path.join(cacheRoot, 'build-cache'), GOMODCACHE: path.join(cacheRoot, 'module-cache'), GOPATH: path.join(cacheRoot, 'gopath'), GOTMPDIR: path.join(cacheRoot, 'tmp') };
  await Promise.all(Object.values(directories).map(directory => fs.mkdir(directory, { recursive: true })));
  const clang = await run('/usr/bin/xcrun', ['--find', 'clang']);
  const sdk = await run('/usr/bin/xcrun', ['--show-sdk-path']);
  const env = { ...process.env, ...directories, GOROOT: result.toolchain.install, GOENV: 'off', GOWORK: 'off', GOTOOLCHAIN: 'local', CGO_ENABLED: '1', GOOS: 'darwin', GOARCH: 'arm64', GOFLAGS: '', GOPROXY: 'https://proxy.golang.org,direct', GOSUMDB: 'sum.golang.org', GOPRIVATE: '', GONOSUMDB: '', GONOPROXY: '', CC: clang, SDKROOT: sdk };
  // Ignore inherited compiler/linker overrides; this record describes the source defaults.
  for (const name of ['CGO_CFLAGS', 'CGO_CPPFLAGS', 'CGO_CXXFLAGS', 'CGO_LDFLAGS', 'GOEXPERIMENT', 'GOARM64', 'GOVCS']) delete env[name];
  result.buildEnvironment = { ...directories, GOROOT: env.GOROOT, GOENV: env.GOENV, GOWORK: env.GOWORK, GOTOOLCHAIN: env.GOTOOLCHAIN, CGO_ENABLED: env.CGO_ENABLED, GOOS: env.GOOS, GOARCH: env.GOARCH, GOPROXY: env.GOPROXY, GOSUMDB: env.GOSUMDB, CC: clang, SDKROOT: sdk, systemPathChanged: false, homeChanged: false };
  result.toolchain.versionOutput = await run(result.toolchain.binary, ['version'], { env });
  await fs.mkdir(path.dirname(output), { recursive: true });
  const temporaryOutput = `${output}.building`;
  result.command = ['go', 'build', '-mod=readonly', '-trimpath', '-o', temporaryOutput, 'main.go'];
  console.log('Compiling the pinned candidate source; executable will not be launched.');
  await run(result.toolchain.binary, result.command.slice(1), { cwd: source, env, onOutput: logOutput });
  await fs.rename(temporaryOutput, output);
  result.checks.compilation = true;
  result.artifact = { path: output, sha256: await sha256(output), bytes: (await fs.stat(output)).size };
  result.artifact.file = await run('/usr/bin/file', [output]);
  result.artifact.linkedLibraries = await run('/usr/bin/otool', ['-L', output]);
  const buildInfo = await run(result.toolchain.binary, ['version', '-m', output], { env });
  await fs.writeFile(path.join(docs, 'chatlog-build-info.txt'), buildInfo + '\n');
  result.artifact.buildInfo = 'docs/chatlog-build-info.txt';
  result.checks.machoArm64 = /Mach-O 64-bit executable arm64/.test(result.artifact.file);
  if (!result.checks.machoArm64) throw new Error('Candidate output is not a macOS arm64 executable.');
  const packages = parseJsonSequence(await run(result.toolchain.binary, ['list', '-mod=readonly', '-deps', '-json', 'main.go'], { cwd: source, env }));
  const unique = new Map();
  for (const item of packages) if (item.Module) unique.set(item.Module.Path, item.Module);
  result.licenses = await preserveLicenses([...unique.values()].sort((a, b) => a.Path.localeCompare(b.Path)));
  result.checks.sourceUnchanged = !(await run('/usr/bin/git', ['-C', source, 'status', '--porcelain', '--untracked-files=all']));
  result.source.goModSha256After = await sha256(path.join(source, 'go.mod'));
  result.source.goSumSha256After = await sha256(path.join(source, 'go.sum'));
  result.checks.moduleFilesUnchanged = result.source.goModSha256Before === result.source.goModSha256After && result.source.goSumSha256Before === result.source.goSumSha256After;
  if (!result.checks.sourceUnchanged || !result.checks.moduleFilesUnchanged) throw new Error('Source or module lock files changed during candidate build.');
  result.status = 'passed';
} catch (error) {
  result.status = 'failed';
  result.error = { message: error.message, code: error.code ?? null };
  log += `\nFAILED: ${error.stack ?? error.message}\n`;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  result.finishedAt = new Date().toISOString();
  result.log = 'docs/chatlog-build.log';
  await fs.writeFile(logFile, log);
  await fs.writeFile(resultsFile, JSON.stringify(result, null, 2) + '\n');
  console.log(`Candidate build ${result.status}; report: ${resultsFile}`);
}
