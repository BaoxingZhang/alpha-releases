#!/usr/bin/env node
// Index recovered JavaScript without evaluating it or inventing original modules.
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const options = { source: path.join(projectRoot, 'src'), original: null, out: path.join(projectRoot, 'docs') };
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--help' || arg === '-h') {
    console.log('Usage: node tools/index-recovered-code.mjs [--source DIR] [--original DIR] [--out DIR]\nDefaults: --source ./src --out ./docs (relative to this project).\nProduces recovered-code-index.json and recovered-modules/functions/components.tsv. No target code is executed.\nOriginal line numbers are reported only for byte-identical source/bundle pairs.');
    process.exit(0);
  }
  const key = arg.slice(2);
  if (!['source', 'original', 'out'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${arg}`);
  options[key] = path.resolve(args[++i]);
}

const hash = (value) => createHash('sha256').update(value).digest('hex');
const posix = (value) => value.split(path.sep).join('/');
async function filesBelow(root) {
  const output = [];
  const queue = [root];
  while (queue.length) {
    const dir = queue.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || ['node_modules', '.git'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) queue.push(full);
      else if (entry.isFile()) output.push(full);
    }
  }
  return output.sort();
}

// Keep source positions/newlines, but blank comments, strings and regular
// expressions. Template bodies are intentionally omitted, including ${...}.
// This is a lexical navigation index, not an AST or semantic reconstruction.
function maskNonCode(source) {
  const chars = source.split('');
  const blank = (start, end) => { for (let j = start; j < end; j++) if (chars[j] !== '\n' && chars[j] !== '\r') chars[j] = ' '; };
  let i = 0;
  let regexAllowed = true;
  while (i < source.length) {
    const c = source[i], next = source[i + 1];
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i + 2);
      const stop = end === -1 ? source.length : end;
      blank(i, stop); i = stop; continue;
    }
    if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop); i = stop; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const start = i++, quote = c;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i++] === quote) break;
      }
      blank(start, i); regexAllowed = false; continue;
    }
    if (c === '/' && regexAllowed) {
      const start = i++;
      let bracket = false;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === '[') bracket = true;
        else if (source[i] === ']') bracket = false;
        else if (source[i] === '/' && !bracket) { i++; break; }
        else if (source[i] === '\n') break;
        i++;
      }
      while (/[a-z]/i.test(source[i] ?? '') && i < source.length) i++;
      blank(start, i); regexAllowed = false; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const start = i++;
      while (i < source.length && /[\w$]/.test(source[i])) i++;
      const word = source.slice(start, i);
      regexAllowed = /^(return|throw|case|delete|void|typeof|yield|await|in|of|instanceof|new)$/.test(word);
      continue;
    }
    if (/[0-9]/.test(c)) {
      i++;
      while (i < source.length && /[\w.]/.test(source[i])) i++;
      regexAllowed = false; continue;
    }
    regexAllowed = /[=(:,;!?\[{+*%&|^~<>]/.test(c);
    i++;
  }
  return chars.join('');
}

function lineStarts(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === '\n') starts.push(i + 1);
  return starts;
}
function atLine(starts, offset) {
  let low = 0, high = starts.length;
  while (low + 1 < high) { const mid = (low + high) >> 1; if (starts[mid] <= offset) low = mid; else high = mid; }
  return low + 1;
}
function closingBrace(mask, opening) {
  let depth = 0;
  for (let i = opening; i < mask.length; i++) {
    if (mask[i] === '{') depth++;
    else if (mask[i] === '}' && --depth === 0) return i + 1;
  }
  return null;
}
function functionBody(mask, start) {
  const opening = mask.indexOf('(', start);
  if (opening < 0 || opening > start + 1000) return -1;
  let depth = 0;
  for (let i = opening; i < Math.min(mask.length, start + 10000); i++) {
    if (mask[i] === '(') depth++;
    else if (mask[i] === ')' && --depth === 0) {
      const rest = mask.slice(i + 1, i + 100);
      const match = rest.match(/^\s*\{/);
      return match ? i + 1 + match[0].lastIndexOf('{') : -1;
    }
  }
  return -1;
}

const originals = options.original ? await filesBelow(options.original) : [];
const originalsByRelative = new Map(originals.map((file) => [posix(path.relative(options.original, file)), file]));
const modules = [];
for (const file of await filesBelow(options.source)) {
  if (!/\.(?:[cm]?js|jsx|ts|tsx)$/.test(file)) continue;
  const bytes = await readFile(file);
  const source = bytes.toString('utf8');
  const relative = posix(path.relative(options.source, file));
  const original = originalsByRelative.get(relative) ?? originalsByRelative.get(relative.replace(/^(src|out)\//, ''));
  const originalSha256 = original ? hash(await readFile(original)) : null;
  const sha256 = hash(bytes);
  const exactOriginal = original && originalSha256 === sha256 ? original : null;
  const starts = lineStarts(source);
  const mask = maskNonCode(source);
  const lines = mask.split('\n');
  const symbols = [];
  let depth = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const declaration = line.match(/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(function\s*\*?|class)\s+([\w$]+)/);
    const variable = line.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([\w$]+)\s*=\s*(.*)/);
    let name, kind, bodyOffset = -1;
    if (declaration) {
      name = declaration[2]; kind = declaration[1].startsWith('class') ? 'class' : 'function';
      const start = starts[index] + line.indexOf(declaration[1]);
      bodyOffset = kind === 'function' ? functionBody(mask, start) : mask.indexOf('{', start);
      // Do not scan arbitrarily far if a declaration is incomplete.
      if (bodyOffset > start + 10000) bodyOffset = -1;
    } else if (variable) {
      const rhs = variable[2];
      const isCallable = /^(?:async\s+)?(?:function\b|\([^;]*\)\s*=>|[\w$]+\s*=>)/.test(rhs);
      const isWrappedComponent = /\.(?:memo|forwardRef)\s*\(/.test(rhs);
      const isClass = /^class\b/.test(rhs);
      if (isCallable || isWrappedComponent || isClass) {
        name = variable[1]; kind = isClass ? 'class' : 'function';
        const start = starts[index] + line.indexOf('=');
        const rhsWindow = mask.slice(start, start + 10000);
        const namedFunction = rhsWindow.match(/\bfunction\b/);
        const arrow = rhsWindow.indexOf('=>');
        if (isClass) bodyOffset = mask.indexOf('{', start);
        else if (namedFunction && (arrow < 0 || namedFunction.index < arrow)) bodyOffset = functionBody(mask, start + namedFunction.index);
        else if (arrow >= 0) {
          const rest = rhsWindow.slice(arrow + 2);
          const opening = rest.match(/^\s*\{/);
          bodyOffset = opening ? start + arrow + 2 + opening[0].lastIndexOf('{') : -1;
        }
      } else if (depth === 0) {
        name = variable[1]; kind = 'binding';
      }
    }
    if (name) {
      const endOffset = bodyOffset >= 0 ? closingBrace(mask, bodyOffset) : null;
      const endLine = endOffset ? atLine(starts, endOffset - 1) : index + 1;
      const body = source.slice(starts[index], endOffset ?? starts[index] + line.length);
      const component = kind === 'function' && /^[A-Z]/.test(name) && /(?:\.jsx(?:s)?\s*\(|\.createElement\s*\(|\.(?:memo|forwardRef)\s*\()/.test(body);
      symbols.push({ name, kind, componentCandidate: component, line: index + 1, endLine, scopeDepth: depth,
        originalLocation: exactOriginal ? { file: posix(path.relative(options.original, exactOriginal)), line: index + 1, endLine } : null });
    }
    for (const c of line) { if (c === '{') depth++; else if (c === '}') depth--; }
  }
  const imports = [];
  // Literal import/require statements only; computed/dynamic paths are omitted.
  const pattern = /(?:\bimport\s+(?:[^;\n]*?\s+from\s*)?|\bexport\s+[^;\n]*?\s+from\s*|\brequire\s*\(\s*)(["'])([^"'\n]+)\1/g;
  let match;
  while ((match = pattern.exec(source))) {
    const codeWindow = mask.slice(match.index, match.index + 8);
    if (!/\b(import|export|require)\b/.test(codeWindow)) continue;
    imports.push({ specifier: match[2], line: atLine(starts, match.index) });
  }
  modules.push({ path: relative, bytes: bytes.length, lines: starts.length, sha256,
    format: /^\s*(?:import\s|export\s)/m.test(mask) ? 'esm' : /\brequire\s*\(|\bexports\b/.test(mask) ? 'commonjs' : 'script',
    original: original ? { path: posix(path.relative(options.original, original)), sha256: originalSha256,
      mapping: exactOriginal ? 'byte-identical: line numbers preserved' : 'changed: original line mapping not asserted' } : null,
    imports, symbols });
}

const functions = modules.flatMap((module) => module.symbols.filter((s) => s.kind !== 'binding').map((symbol) => ({ path: module.path, ...symbol })));
const components = functions.filter((symbol) => symbol.componentCandidate);
const output = {
  schemaVersion: 1, method: 'pure-Node lexical navigation index; target code is never executed',
  sourceRoot: options.source, originalRoot: options.original,
  limitations: [
    'Recovered bundles retain their emitted file boundaries. This index does not reconstruct original TypeScript/TSX modules, types, source maps, or build configuration.',
    'Function/class ranges and component classification are lexical heuristics, not semantic guarantees. Anonymous callbacks, class methods, computed imports, complex multiline arrow declarations, and template expressions may be omitted.',
    'React component candidates have an uppercase name and JSX-runtime/createElement/memo/forwardRef evidence; vendor and application components may both appear.',
    'Original bundle line numbers are emitted only when the entire source file is byte-identical to the matched original file.'
  ],
  counts: { modules: modules.length, functionsAndClasses: functions.length, componentCandidates: components.length,
    exactOriginalMatches: modules.filter((m) => m.original?.mapping.startsWith('byte-identical')).length },
  modules
};
const tsv = (columns, rows) => [columns.join('\t'), ...rows.map((row) => columns.map((key) => String(row[key] ?? '').replace(/[\t\r\n]/g, ' ')).join('\t'))].join('\n') + '\n';
await mkdir(options.out, { recursive: true });
await writeFile(path.join(options.out, 'recovered-code-index.json'), JSON.stringify(output, null, 2) + '\n');
await writeFile(path.join(options.out, 'recovered-modules.tsv'), tsv(['path', 'format', 'lines', 'bytes', 'sha256', 'original'], modules.map((m) => ({ ...m, original: m.original?.mapping ?? 'not supplied/matched' }))));
const rows = (values) => values.map((s) => ({ ...s, originalPath: s.originalLocation?.file, originalLine: s.originalLocation?.line }));
const columns = ['path', 'name', 'kind', 'line', 'endLine', 'scopeDepth', 'originalPath', 'originalLine'];
await writeFile(path.join(options.out, 'recovered-functions.tsv'), tsv(columns, rows(functions)));
await writeFile(path.join(options.out, 'recovered-components.tsv'), tsv(columns, rows(components)));
console.log(JSON.stringify({ outputDirectory: options.out, ...output.counts }, null, 2));
