#!/usr/bin/env node
// Parse source as data. Never import/evaluate the recovered Electron entrypoint.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const options = { main: path.join(root, 'src/main/index.js'), preload: path.join(root, 'src/preload/index.js'), out: path.join(root, 'packages/alpha-protocol'), check: false };
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === '--check') options.check = true;
  else if (arg === '--help') {
    console.log('Usage: node tools/extract-protocol.mjs [--check] [--main FILE] [--preload FILE] [--out DIR]\nAST binding closure extraction only; no recovered application code is executed.');
    process.exit(0);
  } else {
    const key = arg.slice(2);
    if (!['main', 'preload', 'out'].includes(key) || !process.argv[i + 1] || process.argv[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete argument: ${arg}`);
    options[key] = path.resolve(process.argv[++i]);
  }
}

const hash = value => createHash('sha256').update(value).digest('hex');
const posix = value => value.split(path.sep).join('/');
const relative = value => posix(path.relative(root, value));
const moduleRoots = ['EngineClientFrame', 'EngineServerFrame', 'encodeLengthDelimitedFrame', 'LengthDelimitedFrameDecoder'];
const publicNames = [...moduleRoots, 'FrameProtocolError', 'DEFAULT_MAX_FRAME_BYTES'];
const allowedGlobals = new Set(['BigInt', 'Buffer', 'Error', 'Math', 'Number', 'RangeError', 'Uint8Array', 'globalThis']);
const allowedGlobalThisMembers = new Set(['Error', 'String', 'Array', 'Boolean', 'btoa', 'atob', 'Number', 'Object']);
const externalModules = new Map([['wire', '@bufbuild/protobuf/wire']]);
const fail = (message, node) => { throw new Error(`${message}${node?.loc ? ` (line ${node.loc.start.line})` : ''}`); };

// Only inert initializers may run when a generated module is imported. Function
// bodies are retained, but never executed by the extractor. The one permitted
// require() is emitted explicitly after validating its original source binding.
function assertInert(node) {
  if (!node) return;
  switch (node.type) {
    case 'NumericLiteral': case 'StringLiteral': case 'BooleanLiteral': case 'NullLiteral': case 'BigIntLiteral': case 'RegExpLiteral':
    case 'FunctionExpression': case 'ArrowFunctionExpression': return;
    case 'Identifier': return;
    case 'UnaryExpression':
      if (node.operator === 'delete') fail('Side-effecting initializer is not extractable', node);
      return assertInert(node.argument);
    case 'BinaryExpression': case 'LogicalExpression':
      assertInert(node.left); return assertInert(node.right);
    case 'ConditionalExpression':
      assertInert(node.test); assertInert(node.consequent); return assertInert(node.alternate);
    case 'ArrayExpression':
      for (const item of node.elements) assertInert(item);
      return;
    case 'ObjectExpression':
      for (const property of node.properties) {
        if (!['ObjectProperty', 'ObjectMethod'].includes(property.type)) fail('Spread or unknown initializer is not extractable', property);
        if (property.computed) assertInert(property.key);
        if (property.type === 'ObjectProperty') assertInert(property.value);
      }
      return;
    default: fail(`Executable initializer is not permitted: ${node.type}`, node);
  }
}

function topDeclaration(binding) {
  let declaration = binding.path;
  while (declaration.parentPath && !declaration.parentPath.isProgram()) declaration = declaration.parentPath;
  if (!declaration.parentPath?.isProgram() || !['VariableDeclaration', 'FunctionDeclaration', 'ClassDeclaration'].includes(declaration.node.type)) {
    fail(`Unsupported declaration for ${binding.identifier.name}`, binding.path.node);
  }
  return declaration;
}

function isStoredCallback(reference, statement) {
  let functionPath = null;
  for (let cursor = reference.parentPath; cursor && cursor !== statement; cursor = cursor.parentPath) {
    if (cursor.isFunction()) functionPath = cursor;
  }
  if (!functionPath) return false;
  let current = functionPath;
  while (current.parentPath && current.parentPath !== statement) {
    const parent = current.parentPath, node = parent.node;
    if (parent.isObjectProperty() && !node.computed && node.value === current.node || parent.isObjectExpression() || parent.isVariableDeclarator() && node.init === current.node) {
      current = parent;
      continue;
    }
    if (parent.isCallExpression() && node.arguments.length === 1 && node.arguments[0] === current.node && node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.object.type === 'Identifier' && node.callee.object.name === 'Object' && !parent.scope.getBinding('Object') && node.callee.property.name === 'freeze') {
      current = parent;
      continue;
    }
    return false;
  }
  return statement.isVariableDeclaration() && current.isVariableDeclarator();
}

function closure(source, sourcePath, roots, allowWire) {
  const ast = parse(source, { sourceType: 'script', ranges: true, attachComment: true });
  let program;
  traverse(ast, { Program(p) { program = p; p.stop(); } });
  const bindings = new Map(), units = new Map(), globals = new Set(), external = [];
  const dependencies = new Map();
  const queue = [...roots];
  while (queue.length) {
    const name = queue.pop();
    if (bindings.has(name)) continue;
    const binding = program.scope.getBinding(name);
    if (!binding || binding.scope !== program.scope) fail(`Missing top-level dependency: ${name}`);
    if (binding.constantViolations.length) fail(`Mutable top-level binding is not supported: ${name}`, binding.constantViolations[0].node);
    bindings.set(name, binding);
    const declaration = topDeclaration(binding);
    const declaredNames = declaration.isVariableDeclaration() ? Object.keys(declaration.getBindingIdentifiers()) : [declaration.node.id.name];
    for (const declared of declaredNames) queue.push(declared);
    if (units.has(declaration.node.start)) continue;
    const unit = { declaration, names: declaredNames, dependencies: new Set(), external: null };
    units.set(declaration.node.start, unit);

    if (externalModules.has(name)) {
      const expected = externalModules.get(name);
      const init = binding.path.node.init;
      if (!allowWire || declaredNames.length !== 1 || !binding.path.isVariableDeclarator() || init?.type !== 'CallExpression' || init.callee.type !== 'Identifier' || init.callee.name !== 'require' || program.scope.getBinding('require') || init.arguments.length !== 1 || init.arguments[0].type !== 'StringLiteral' || init.arguments[0].value !== expected) {
        fail(`External dependency mapping rejected: ${name}`, binding.path.node);
      }
      unit.external = expected;
      external.push({ binding: name, module: expected, line: declaration.node.loc.start.line });
      continue;
    }

    if (declaration.isVariableDeclaration()) {
      for (const item of declaration.node.declarations) assertInert(item.init);
    } else if (declaration.isClassDeclaration()) {
      for (const member of declaration.node.body.body) {
        if (member.type === 'StaticBlock' || member.static && member.value) fail('Static class initialization is not supported', member);
        if (member.computed) assertInert(member.key);
      }
    }
    declaration.traverse({
      ReferencedIdentifier(reference) {
        const dependency = reference.scope.getBinding(reference.node.name);
        if (dependency?.scope === program.scope) {
          queue.push(reference.node.name);
          unit.dependencies.add(reference.node.name);
        } else if (!dependency) {
          const global = reference.node.name;
          if (!allowedGlobals.has(global)) fail(`Unexpected global/external dependency: ${global}`, reference.node);
          if (global === 'globalThis') {
            const member = reference.parentPath.node;
            if (member.type !== 'MemberExpression' || member.computed || member.object !== reference.node || !allowedGlobalThisMembers.has(member.property.name)) fail('Unreviewed globalThis access', member);
          }
          globals.add(global);
        }
      }
    });
    for (const declared of declaredNames) dependencies.set(declared, unit.dependencies);
  }

  // Reject hidden initialization outside the selected declarations. Consumer
  // functions/classes do not execute on import and do not belong in the module.
  for (const [name, binding] of bindings) {
    for (const reference of binding.referencePaths) {
      const statement = reference.findParent(p => p.parentPath?.isProgram());
      if (!statement || units.has(statement.node.start) || statement.isFunctionDeclaration()) continue;
      if (statement.isClassDeclaration()) {
        const member = reference.findParent(p => p.parentPath?.isClassBody());
        // Ordinary method bodies and instance field values run after import.
        // Extends expressions, static initializers and computed names do not.
        if (member && !member.node.computed && (['ClassMethod', 'ClassPrivateMethod'].includes(member.node.type) || ['ClassProperty', 'ClassPrivateProperty'].includes(member.node.type) && !member.node.static)) continue;
      }
      if (isStoredCallback(reference, statement)) continue;
      fail(`Unreviewed top-level consumer/initialization of ${name}`, statement.node);
    }
  }
  return { source, sourcePath, roots, bindings, units: [...units.values()].sort((a, b) => a.declaration.node.start - b.declaration.node.start), globals: [...globals].sort(), external, dependencies };
}

function render(result, exports) {
  const chunks = [];
  let nextLine = 1;
  const append = text => { chunks.push(text); nextLine += (text.match(/\n/g) ?? []).length; };
  append(`"use strict";\n// GENERATED by tools/extract-protocol.mjs. Edit the extractor, not this file.\n// Source: ${relative(result.sourcePath)} (SHA256 ${hash(result.source)})\n// AST binding closure only; the application entrypoint is never evaluated.\n\n`);
  const declarations = [];
  for (const unit of result.units) {
    const node = unit.declaration.node;
    const start = Math.min(node.start, ...(node.leadingComments ?? []).map(comment => comment.start));
    const original = result.source.slice(start, node.end);
    append(`// Recovered from ${relative(result.sourcePath)}:${node.loc.start.line}\n`);
    const generatedStart = nextLine;
    const emitted = unit.external ? `const ${unit.names[0]} = require(${JSON.stringify(unit.external)});` : original;
    append(emitted + '\n');
    declarations.push({
      names: unit.names, kind: node.type,
      dependencies: [...unit.dependencies].filter(name => !unit.names.includes(name)).sort(),
      node: { start: node.start, end: node.end, startLine: node.loc.start.line, endLine: node.loc.end.line },
      original: { startOffset: start, endOffset: node.end, declarationStartLine: node.loc.start.line, endLine: node.loc.end.line, sha256: hash(original) },
      generated: { startLine: generatedStart, endLine: nextLine - 1, sha256: hash(emitted) },
      ...(unit.external ? { externalModule: unit.external } : {})
    });
    append('\n');
  }
  for (const name of exports) if (!result.bindings.has(name)) fail(`Requested export is outside dependency closure: ${name}`);
  if (exports.length === 1 && exports[0] === 'IPC_CHANNELS') append('Object.freeze(IPC_CHANNELS);\n');
  append(`module.exports = Object.freeze({ ${exports.join(', ')} });\n`);
  return { text: chunks.join(''), source: relative(result.sourcePath), roots: result.roots, exports, selectedBindings: [...result.bindings.keys()].sort(), globals: result.globals, externalModules: result.external, declarations, bindingCount: result.bindings.size };
}

const [mainBytes, preloadBytes, extractorBytes] = await Promise.all([fs.readFile(options.main), fs.readFile(options.preload), fs.readFile(fileURLToPath(import.meta.url))]);
const mainClosure = closure(mainBytes.toString('utf8'), options.main, moduleRoots, true);
const protocol = render(mainClosure, [...mainClosure.bindings.keys()].sort());
const channels = render(closure(preloadBytes.toString('utf8'), options.preload, ['IPC_CHANNELS'], false), ['IPC_CHANNELS']);
for (const name of publicNames) if (!mainClosure.bindings.has(name)) fail(`Public export is outside dependency closure: ${name}`);
const index = `"use strict";\n// GENERATED public facade. Full recovered bindings are opt-in via ./bindings.\nconst { ${publicNames.join(', ')} } = require("./bindings.cjs");\nconst { IPC_CHANNELS } = require("./ipc-channels.cjs");\nmodule.exports = Object.freeze({ ${[...publicNames, 'IPC_CHANNELS'].join(', ')} });\n`;
const packageJson = {
  name: '@alpha-recovered/protocol', version: '0.3.5-recovered.1', private: true,
  description: 'Recovered Alpha wire codecs and framing; no Electron or native process startup',
  type: 'commonjs', main: 'index.cjs', exports: { '.': './index.cjs', './bindings': './bindings.cjs', './ipc': './ipc-channels.cjs', './source-manifest.json': './source-manifest.json' },
  engines: { node: '>=24.15 <25' }, dependencies: { '@bufbuild/protobuf': '2.14.0' }
};
const json = value => JSON.stringify(value, null, 2) + '\n';
const files = new Map([['index.cjs', index], ['bindings.cjs', protocol.text], ['ipc-channels.cjs', channels.text], ['package.json', json(packageJson)]]);
const manifest = {
  schemaVersion: 1,
  method: 'Babel Program-scope binding dependency closure; original declaration slices retained in source order; no target evaluation',
  extractor: { path: relative(fileURLToPath(import.meta.url)), sha256: hash(extractorBytes), parser: '8.0.10', traverse: '8.0.10' },
  offsetUnit: 'UTF-16 code units in decoded UTF-8 source; endOffset is exclusive; line numbers are one-based',
  sources: [{ path: relative(options.main), bytes: mainBytes.length, sha256: hash(mainBytes) }, { path: relative(options.preload), bytes: preloadBytes.length, sha256: hash(preloadBytes) }],
  modules: [['bindings.cjs', protocol], ['ipc-channels.cjs', channels]].map(([file, { text, ...details }]) => ({ file, sha256: hash(text), ...details })),
  facade: { file: 'index.cjs', sha256: hash(index), exports: [...publicNames, 'IPC_CHANNELS'] },
  limitations: ['Recovered codecs are emitted JavaScript, not original .proto or TypeScript sources.', 'This module only serializes/deserializes data. It does not authenticate, start an engine, grant a license, or report backend readiness.', 'The original encoder permits payloads up to u32; the decoder defaults to a 16 MiB limit. Apply an application-specific outbound size limit when needed.']
};
files.set('source-manifest.json', json(manifest));
if (options.check) {
  for (const [file, expected] of files) {
    const current = await fs.readFile(path.join(options.out, file), 'utf8').catch(() => null);
    if (current !== expected) throw new Error(`Generated protocol is missing or stale: ${path.join(options.out, file)}. Run npm run extract:protocol.`);
  }
} else {
  await fs.mkdir(options.out, { recursive: true });
  for (const [file, contents] of files) await fs.writeFile(path.join(options.out, file), contents);
}
console.log(JSON.stringify({ mode: options.check ? 'check' : 'write', directory: relative(options.out), protocolBindings: protocol.bindingCount, ipcBindings: channels.bindingCount, externalModules: protocol.externalModules.map(item => item.module) }, null, 2));
