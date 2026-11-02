import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const targets = [
  {
    name: 'alpha-native',
    relativePath: 'native/wcdb/libalpha_native.dylib',
    exports: ['_alpha_native_get_api'],
    sourceEvidence: 'low-confidence-api-table-entry'
  },
  {
    name: 'alpha-sqlcipher-readonly',
    relativePath: 'native/wcdb/libalpha_sqlcipher_readonly.dylib',
    exports: ['_alpha_moments_project_row_v1', '_alpha_sqlite_readonly_get_api'],
    sourceEvidence: 'low-confidence-readonly-api-and-moments-entry'
  }
];

function command(file, args) {
  return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function provenanceEntry(root, relativePath) {
  const provenancePath = path.join(root, 'docs/native-runtime-provenance.json');
  const provenance = JSON.parse(fs.readFileSync(provenancePath, 'utf8'));
  const entry = provenance.entries.find(item => item.type === 'file' && item.path === relativePath);
  if (!entry) throw new Error(`NATIVE_ABI_PROVENANCE_MISSING:${relativePath}`);
  return entry;
}

function parseExports(output) {
  return output.split(/\r?\n/u).map(line => line.trim().split(/\s+/u).at(-1)).filter(value => /^_[A-Za-z0-9_$]+$/u.test(value));
}

function parseDependencies(output) {
  return output.split(/\r?\n/u).slice(1).map(line => line.trim()).filter(Boolean).map(line => line.replace(/\s+\(compatibility version.*$/u, ''));
}

export function auditNativeAbi({ root = repositoryRoot } = {}) {
  if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('NATIVE_ABI_AUDIT_REQUIRES_MACOS_ARM64');
  const results = targets.map(target => {
    const relativePath = `vendor/runtime/${target.relativePath}`;
    const absolutePath = path.join(root, relativePath);
    const metadata = fs.lstatSync(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) throw new Error(`NATIVE_ABI_FILE_INVALID:${relativePath}`);
    const bytes = fs.readFileSync(absolutePath);
    const provenance = provenanceEntry(root, target.relativePath);
    const digest = sha256(bytes);
    if (digest !== provenance.sha256 || bytes.length !== provenance.bytes || (metadata.mode & 0o777) !== Number(provenance.mode)) {
      throw new Error(`NATIVE_ABI_PROVENANCE_MISMATCH:${relativePath}`);
    }
    const fileDescription = command('/usr/bin/file', [absolutePath]).trim();
    const format = fileDescription.replace(/^.*?:\s*/u, '');
    if (!/^Mach-O 64-bit dynamically linked shared library arm64$/u.test(format)) throw new Error(`NATIVE_ABI_ARCHITECTURE_INVALID:${relativePath}`);
    const exports = parseExports(command('/usr/bin/nm', ['-gU', absolutePath]));
    for (const symbol of target.exports) if (!exports.includes(symbol)) throw new Error(`NATIVE_ABI_EXPORT_MISSING:${symbol}`);
    const dependencies = parseDependencies(command('/usr/bin/otool', ['-L', absolutePath]));
    if (dependencies.some(dependency => dependency.startsWith('/') && !dependency.startsWith('/System/Library/') && !dependency.startsWith('/usr/lib/'))) {
      throw new Error(`NATIVE_ABI_EXTERNAL_DEPENDENCY:${relativePath}`);
    }
    const codesign = command('/usr/bin/codesign', ['--verify', '--strict', absolutePath]).trim();
    return {
      name: target.name,
      path: relativePath,
      bytes: bytes.length,
      sha256: digest,
      mode: metadata.mode & 0o777,
      architecture: 'arm64',
      format,
      exports: target.exports,
      dependencies,
      codesign: { verified: true, output: codesign },
      sourceEvidence: target.sourceEvidence,
      unknownAbiCallExecuted: false
    };
  });
  return {
    schema: 'alpha-recovered.native-abi-audit.v1',
    status: 'passed',
    platform: 'darwin-arm64',
    nativeFilesModified: false,
    unknownAbiCallExecuted: false,
    targets: results
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    console.log(JSON.stringify(auditNativeAbi(), null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
