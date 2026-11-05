#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DISCOVERY_LIMITS = Object.freeze({
  maxRoots: 8,
  maxEntries: 6000,
  maxDepth: 8,
  maxReports: 64,
  maxReportBytes: 512 * 1024
});

const STANDARD_RELATIVE_ROOTS = Object.freeze([
  'Library/Containers/com.tencent.xinWeChat/Data/Documents',
  'Library/Containers/com.tencent.xinWeChat2/Data/Documents',
  'Library/Application Support/com.tencent.xinWeChat',
  'Library/Application Support/WeChat',
  'Documents/WeChat Files'
]);

const MARKER_PATTERNS = Object.freeze([
  ['contact', /^contact(?:_fts)?\.db$/i],
  ['session', /^session\.db$/i],
  ['message', /^(?:message|message_\d+|message_fts|message_resource|biz_message_\d+)\.db$/i],
  ['media', /^media_\d+\.db$/i],
  ['favorite', /^favorite(?:_fts)?\.db$/i],
  ['moments', /^(?:sns|moments)\.db$/i],
  ['hardlink', /^hardlink\.db$/i],
  ['general', /^general\.db$/i],
  ['profile', /^(?:head_image|key_info)\.db$/i]
]);

function failure(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function markerKind(name) {
  for (const [kind, pattern] of MARKER_PATTERNS) if (pattern.test(name)) return kind;
  return undefined;
}

function isSidecar(name) {
  return /(?:-wal|-shm|-journal)$/i.test(name);
}

function shouldDescend(relativeRoot, depth, name) {
  if (depth !== 0) return true;
  if (/\/Data\/Documents$/i.test(relativeRoot)) return name === 'xwechat_files' || name === 'WeChat Files';
  return true;
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function redactedRelativePath(home, value) {
  const relative = path.relative(home, value);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw failure('V4_DISCOVERY_PATH_ESCAPE');
  const parts = relative.split(path.sep);
  const fixed = new Set(['Library', 'Containers', 'Application Support', 'Documents', 'Data', 'WeChat Files', 'com.tencent.xinWeChat', 'com.tencent.xinWeChat2']);
  return parts.map((part, index) => fixed.has(part) || index < 2 ? part : `<redacted-${digest(part)}>`).join('/');
}

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--json') {
      if (values.json) throw failure('V4_DISCOVERY_USAGE');
      values.json = true;
      continue;
    }
    if (option === '--show-path') {
      if (values.showPath) throw failure('V4_DISCOVERY_USAGE');
      values.showPath = true;
      continue;
    }
    throw failure('V4_DISCOVERY_USAGE');
  }
  if (values.json && values.showPath) throw failure('V4_DISCOVERY_PATH_OUTPUT_REQUIRES_HUMAN_MODE');
  return values;
}

async function safeRoot(home, relative, fsApi) {
  const root = path.join(home, relative);
  const parts = root.slice(path.parse(root).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(root).root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try { stat = await fsApi.lstat(current); } catch (error) {
      if (error?.code === 'ENOENT') return undefined;
      return { root, status: 'error', code: error?.code || 'V4_DISCOVERY_ROOT_UNAVAILABLE' };
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) return { root, status: 'rejected', code: 'V4_DISCOVERY_ROOT_SYMLINK_OR_NON_DIRECTORY' };
  }
  return { root, status: 'present' };
}

async function inspectRoot({ home, root, relativeRoot, fsApi, limits, includePaths = false }) {
  const queue = [{ directory: root, depth: 0 }];
  const markerFiles = [];
  const sidecars = [];
  const seen = new Set();
  let entries = 0;
  let directories = 0;
  let files = 0;
  let truncated = false;
  while (queue.length) {
    const { directory, depth } = queue.shift();
    let children;
    try { children = await fsApi.readdir(directory, { withFileTypes: true }); } catch (error) {
      return { status: 'error', code: error?.code || 'V4_DISCOVERY_READ_FAILED' };
    }
    children.sort((left, right) => left.name.localeCompare(right.name));
    for (const child of children) {
      entries += 1;
      if (entries > limits.maxEntries) { truncated = true; break; }
      const absolute = path.join(directory, child.name);
      let stat;
      try { stat = await fsApi.lstat(absolute); } catch (error) {
        return { status: 'error', code: error?.code || 'V4_DISCOVERY_STAT_FAILED' };
      }
      if (stat.isSymbolicLink()) { seen.add('symlink'); continue; }
      if (child.isDirectory()) {
        directories += 1;
        if (!shouldDescend(relativeRoot, depth, child.name)) continue;
        if (depth + 1 > limits.maxDepth) { truncated = true; continue; }
        queue.push({ directory: absolute, depth: depth + 1 });
        continue;
      }
      if (!child.isFile()) { seen.add('special'); continue; }
      files += 1;
      const kind = markerKind(child.name);
      if (kind) markerFiles.push({ directory: path.dirname(absolute), name: child.name, kind });
      if (isSidecar(child.name)) sidecars.push({ directory: path.dirname(absolute), name: child.name });
    }
    if (truncated) break;
  }
  const byAncestor = new Map();
  for (const marker of markerFiles) {
    let current = marker.directory;
    while (current === root || current.startsWith(`${root}${path.sep}`)) {
      const state = byAncestor.get(current) || { kinds: new Set(), files: 0, sidecars: 0 };
      state.kinds.add(marker.kind);
      state.files += 1;
      byAncestor.set(current, state);
      if (current === root) break;
      current = path.dirname(current);
    }
  }
  for (const sidecar of sidecars) {
    let current = sidecar.directory;
    while (current === root || current.startsWith(`${root}${path.sep}`)) {
      const state = byAncestor.get(current) || { kinds: new Set(), files: 0, sidecars: 0 };
      state.sidecars += 1;
      byAncestor.set(current, state);
      if (current === root) break;
      current = path.dirname(current);
    }
  }
  const candidateEntries = [...byAncestor.entries()]
    .filter(([, value]) => value.kinds.size >= 3)
    .filter(([directory], _, all) => !all.some(([other]) => other !== directory && other.startsWith(`${directory}${path.sep}`)))
    .sort((left, right) => right[0].length - left[0].length || right[1].kinds.size - left[1].kinds.size)
    .slice(0, limits.maxReports);
  const candidates = candidateEntries
    .map(([directory, value]) => ({
      source_id: `wechat-v4-${digest(directory)}`,
      relative_path: redactedRelativePath(home, directory),
      ...(includePaths ? { absolute_path: directory } : {}),
      marker_kinds: [...value.kinds].sort(),
      marker_file_count: value.files,
      active_sidecar_count: value.sidecars,
      status: value.sidecars > 0 ? 'active-sidecars' : 'candidate',
      read_only: true,
      complete: false,
      native_schema_supported: false
    }));
  return {
    status: candidates.length ? 'candidate' : truncated ? 'truncated' : 'empty',
    relative_root: relativeRoot,
    file_count: files,
    directory_count: directories,
    entry_count: entries,
    active_sidecar_count: sidecars.length,
    truncated,
    candidates
  };
}

async function discoverSources({ home = os.homedir(), fsApi = fs, limits = DISCOVERY_LIMITS, includePaths = false } = {}) {
  if (typeof home !== 'string' || !path.isAbsolute(home)) throw failure('V4_DISCOVERY_HOME_INVALID');
  const roots = [];
  for (const relative of STANDARD_RELATIVE_ROOTS.slice(0, limits.maxRoots)) {
    const result = await safeRoot(home, relative, fsApi);
    if (!result) continue;
    if (result.status !== 'present') { roots.push({ relative_root: relative, status: result.status, code: result.code }); continue; }
    roots.push(await inspectRoot({ home, root: result.root, relativeRoot: relative, fsApi, limits, includePaths }));
  }
  const report = {
    schema: 'alpha-independent-v4-source-discovery.v1',
    scope: 'alpha-independent-v4-source-discovery',
    status: roots.some(root => root.status === 'candidate') ? 'candidate' : roots.length ? 'empty' : 'unavailable',
    read_only: true,
    complete: false,
    native_schema_supported: false,
    roots
  };
  const bytes = Buffer.byteLength(JSON.stringify(report), 'utf8');
  if (bytes > limits.maxReportBytes) throw failure('V4_DISCOVERY_REPORT_TOO_LARGE');
  return report;
}

function printHuman(report, { showPath = false } = {}) {
  console.log(`v4 source discovery: ${report.status}`);
  console.log('read-only: true; complete: false; native schema supported: false');
  for (const root of report.roots) {
    console.log(`root ${root.relative_root || '<unknown>'}: ${root.status}; candidates: ${root.candidates?.length || 0}`);
    for (const candidate of root.candidates || []) {
      const location = showPath && candidate.absolute_path ? candidate.absolute_path : candidate.relative_path;
      console.log(`  ${candidate.source_id}: ${location}; ${candidate.status}; sidecars=${candidate.active_sidecar_count}`);
      if (showPath) console.log('    use this path only after the source is static and has no active SQLite sidecars');
    }
  }
}

export { DISCOVERY_LIMITS, STANDARD_RELATIVE_ROOTS, discoverSources, markerKind, parse, redactedRelativePath };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parse(process.argv.slice(2));
    const report = await discoverSources({ includePaths: options.showPath === true });
    if (options.json) console.log(JSON.stringify(report, null, 2));
    else printHuman(report, options);
  } catch (error) {
    process.stderr.write(`${error?.code || 'V4_DISCOVERY_FAILED'}\n`);
    process.exitCode = 2;
  }
}
