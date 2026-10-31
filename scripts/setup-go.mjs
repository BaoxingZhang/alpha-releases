import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

export const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function command(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: options.cwd ?? projectRoot, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; options.onOutput?.(chunk.toString()); });
    child.stderr.on('data', chunk => { stderr += chunk; options.onOutput?.(chunk.toString()); });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(Object.assign(new Error(`${path.basename(executable)} exited ${code ?? signal}: ${stderr.slice(-4000)}`), { code, signal, stdout, stderr }));
    });
  });
}

export async function setupGo() {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This pinned toolchain is for macOS arm64 only.');
  const specification = JSON.parse(await fs.readFile(path.join(projectRoot, 'provenance/go-toolchain.json'), 'utf8'));
  const { version, url, bytes, sha256: expectedHash } = specification;
  if (!/^go1\.24\.13$/.test(version) || !/^[a-f0-9]{64}$/.test(expectedHash) || !Number.isSafeInteger(bytes) || bytes <= 0 || url !== `https://go.dev/dl/${version}.darwin-arm64.tar.gz`) {
    throw new Error('Invalid pinned Go toolchain specification.');
  }
  const toolchains = path.join(projectRoot, '.runtime/toolchains');
  const install = path.join(toolchains, version);
  const binary = path.join(install, 'bin/go');
  const marker = path.join(install, '.recovery-installation.json');
  await fs.mkdir(toolchains, { recursive: true });
  let installed;
  try { installed = JSON.parse(await fs.readFile(marker, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (installed) {
    if (installed.archiveSha256 !== expectedHash || installed.binarySha256 !== await sha256(binary)) throw new Error('Existing project Go toolchain does not match its verified installation record.');
    return { ...installed, binary, install, reused: true };
  }
  try { await fs.access(install); throw new Error('Unverified Go installation directory already exists; refusing to replace it.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const downloads = path.join(projectRoot, '.runtime/downloads');
  await fs.mkdir(downloads, { recursive: true });
  const archive = path.join(downloads, `${version}.darwin-arm64.tar.gz`);
  let archiveVerified = false;
  try { archiveVerified = (await fs.stat(archive)).size === bytes && await sha256(archive) === expectedHash; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!archiveVerified) {
    const partial = `${archive}.partial`;
    console.log(`Downloading pinned ${version} into the project runtime directory.`);
    await command('/usr/bin/curl', ['--fail', '--location', '--proto', '=https', '--proto-redir', '=https', '--silent', '--show-error', '--connect-timeout', '30', '--max-time', '600', '--output', partial, url]);
    if ((await fs.stat(partial)).size !== bytes || await sha256(partial) !== expectedHash) throw new Error('Go archive size/SHA-256 does not match the official pinned metadata.');
    await fs.rename(partial, archive);
  }
  const listing = (await command('/usr/bin/tar', ['-tzf', archive])).stdout.trim().split('\n');
  if (listing.some(name => !name.startsWith('go/') || name.split('/').includes('..'))) throw new Error('Unexpected Go archive layout.');
  const staging = await fs.mkdtemp(path.join(toolchains, '.go-install-'));
  try {
    await command('/usr/bin/tar', ['-xzf', archive, '-C', staging]);
    const extracted = path.join(staging, 'go');
    const actualVersion = (await fs.readFile(path.join(extracted, 'VERSION'), 'utf8')).split('\n')[0];
    if (actualVersion !== version) throw new Error('Extracted Go VERSION does not match pinned version.');
    const record = { version, platform: 'darwin', architecture: 'arm64', archiveUrl: url, archiveSha256: expectedHash, archiveBytes: bytes, metadataSource: specification.source, binarySha256: await sha256(path.join(extracted, 'bin/go')), installedAt: new Date().toISOString(), install };
    await fs.writeFile(path.join(extracted, '.recovery-installation.json'), JSON.stringify(record, null, 2) + '\n');
    await fs.rename(extracted, install);
    return { ...record, binary, reused: false };
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await setupGo(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
