import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DEFAULT_SCAN_ROOTS = ['docs', 'provenance'];
const MAX_TEXT_BYTES = 16 * 1024 * 1024;

// These rules intentionally look for concrete secrets and host-specific paths.
// Generic words such as "token" or "password" are documentation, not findings.
const RULES = [
  { category: 'absolute-path', name: 'user-home-path', pattern: /(?:file:\/\/)?\/Users\/[A-Za-z0-9._-]+(?:\/|$)/g },
  { category: 'absolute-path', name: 'private-temp-path', pattern: /(?:file:\/\/)?\/(?:private\/var|var\/folders|tmp)\/[A-Za-z0-9._+~-]+/g },
  { category: 'absolute-path', name: 'volume-path', pattern: /(?:file:\/\/)?\/Volumes\/[A-Za-z0-9._+~ -]+(?:\/|$)/g },
  { category: 'credential', name: 'private-key-block', pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g },
  { category: 'credential', name: 'github-token', pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g },
  { category: 'credential', name: 'openai-token', pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { category: 'credential', name: 'slack-token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { category: 'credential', name: 'bearer-token', pattern: /\bBearer\s+[A-Za-z0-9._~+\/=~-]{20,}/gi },
  { category: 'credential', name: 'secret-assignment', pattern: /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9._~+\/=~-]{16,}/gi },
  { category: 'credential', name: 'password-assignment', pattern: /\bpassword\s*[:=]\s*["']?[A-Za-z0-9._~+\/=~-]{16,}/gi }
];

function fail(message) {
  throw new Error(`PUBLIC_RELEASE_AUDIT_${message}`);
}

function inside(parent, candidate) {
  const normalizedParent = path.resolve(parent);
  const normalizedCandidate = path.resolve(candidate);
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}${path.sep}`);
}

function relativePath(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join('/') || '.';
}

function parseRelativePath(root, value, label) {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}_INVALID`);
  const absolute = path.resolve(root, value);
  if (!inside(root, absolute)) fail(`${label}_OUTSIDE_ROOT`);
  return absolute;
}

async function collectTextFiles(directory, root, excluded, reportPath, output) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      output.missingRoots.push(relativePath(root, directory));
      return;
    }
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = relativePath(root, absolute);
    if (excluded.some(item => absolute === item || inside(item, absolute))) continue;
    if (reportPath && absolute === reportPath) continue;
    if (entry.isSymbolicLink()) {
      output.skippedFiles.push({ path: relative, reason: 'symlink' });
      continue;
    }
    if (entry.isDirectory()) {
      await collectTextFiles(absolute, root, excluded, reportPath, output);
      continue;
    }
    if (!entry.isFile()) {
      output.skippedFiles.push({ path: relative, reason: 'unsupported-entry' });
      continue;
    }
    const stat = await fs.stat(absolute);
    if (stat.size > MAX_TEXT_BYTES) {
      output.skippedFiles.push({ path: relative, reason: 'file-too-large', bytes: stat.size });
      continue;
    }
    const bytes = await fs.readFile(absolute);
    if (bytes.includes(0)) {
      output.skippedFiles.push({ path: relative, reason: 'binary' });
      continue;
    }
    output.textFiles.push({ absolute, relative, source: bytes.toString('utf8') });
  }
}

function scanTextFile(file, findings) {
  const lines = file.source.split(/\r?\n/);
  const seen = new Set();
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of line.matchAll(rule.pattern)) {
        const key = `${file.relative}:${lineIndex + 1}:${rule.name}:${match.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          path: file.relative,
          line: lineIndex + 1,
          column: (match.index ?? 0) + 1,
          category: rule.category,
          rule: rule.name,
          value: '[redacted]'
        });
      }
    }
  }
}

export async function auditPublicTree({ root = repositoryRoot, scanRoots = DEFAULT_SCAN_ROOTS, excludes = [], reportPath, strict = false } = {}) {
  const absoluteRoot = path.resolve(root);
  const absoluteScanRoots = scanRoots.map(value => parseRelativePath(absoluteRoot, value, 'SCAN_ROOT'));
  const absoluteExcludes = excludes.map(value => parseRelativePath(absoluteRoot, value, 'EXCLUDE'));
  const absoluteReport = reportPath ? path.resolve(reportPath) : undefined;
  const output = {
    schema: 'alpha-prepublish-audit.v1',
    status: 'passed',
    enforcement: strict ? 'strict' : 'report',
    root: '.',
    scanRoots: absoluteScanRoots.map(item => relativePath(absoluteRoot, item)),
    excluded: absoluteExcludes.map(item => relativePath(absoluteRoot, item)),
    filesScanned: 0,
    textFilesScanned: 0,
    missingRoots: [],
    skippedFiles: [],
    findings: [],
    textFiles: []
  };
  for (const directory of absoluteScanRoots) await collectTextFiles(directory, absoluteRoot, absoluteExcludes, absoluteReport, output);
  output.textFilesScanned = output.textFiles.length;
  output.filesScanned = output.textFiles.length + output.skippedFiles.length;
  for (const file of output.textFiles) scanTextFile(file, output.findings);
  delete output.textFiles;
  output.findings.sort((left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column || left.rule.localeCompare(right.rule));
  output.findingCount = output.findings.length;
  output.status = output.findingCount === 0 ? 'passed' : 'failed';
  return output;
}

export async function writeAuditReport(filename, report) {
  const destination = path.resolve(filename);
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await fs.rename(temporary, destination);
}

function usage() {
  return [
    'Usage: node scripts/audit-public-release.mjs [options]',
    '',
    'Scans docs/ and provenance/ for host-specific absolute paths and concrete credential patterns.',
    'Options:',
    '  --root PATH       project root (default: current repository)',
    '  --scan PATH       scan root relative to --root (repeatable)',
    '  --exclude PATH    excluded directory relative to --root (repeatable)',
    '  --report PATH     write a redacted JSON report (outside scanned roots is recommended)',
    '  --strict          return non-zero when findings exist (default is report-only)',
    '  --json            print the JSON report instead of the human summary',
    '  --help            show this help'
  ].join('\n');
}

function parseArgs(argv) {
  const options = { root: repositoryRoot, scanRoots: [], excludes: [], reportPath: undefined, json: false, strict: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--help') return { help: true };
    if (argument === '--json') { options.json = true; continue; }
    if (argument === '--strict') { options.strict = true; continue; }
    if (argument === '--root' || argument === '--scan' || argument === '--exclude' || argument === '--report') {
      const value = argv[++index];
      if (!value) fail(`${argument.slice(2).toUpperCase()}_MISSING`);
      if (argument === '--root') options.root = path.resolve(value);
      else if (argument === '--scan') options.scanRoots.push(value);
      else if (argument === '--exclude') options.excludes.push(value);
      else options.reportPath = path.resolve(value);
      continue;
    }
    if (argument.startsWith('--root=') || argument.startsWith('--scan=') || argument.startsWith('--exclude=') || argument.startsWith('--report=')) {
      const [flag, ...rest] = argument.split('=');
      const value = rest.join('=');
      if (!value) fail(`${flag.slice(2).toUpperCase()}_MISSING`);
      if (flag === '--root') options.root = path.resolve(value);
      else if (flag === '--scan') options.scanRoots.push(value);
      else if (flag === '--exclude') options.excludes.push(value);
      else options.reportPath = path.resolve(value);
      continue;
    }
    fail('ARGUMENT_INVALID');
  }
  if (options.scanRoots.length === 0) options.scanRoots = [...DEFAULT_SCAN_ROOTS];
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      const report = await auditPublicTree(options);
      if (options.reportPath) await writeAuditReport(options.reportPath, report);
      if (options.json) console.log(JSON.stringify(report, null, 2));
      else if (report.status === 'passed') console.log(`Public release audit passed (${report.textFilesScanned} text files scanned).`);
      else {
        console.error(`Public release audit failed (${report.findingCount} finding${report.findingCount === 1 ? '' : 's'}).`);
        for (const finding of report.findings) console.error(`- ${finding.path}:${finding.line}:${finding.column} ${finding.rule}`);
        if (options.reportPath) console.error(`Report: ${path.resolve(options.reportPath)}`);
      }
      if (report.status !== 'passed' && options.strict) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
