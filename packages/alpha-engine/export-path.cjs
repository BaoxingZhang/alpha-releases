'use strict';
const fs = require('node:fs');
const path = require('node:path');

const error = code => new Error(code);
function within(directory, target) {
  const relative = path.relative(path.resolve(directory), target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

// Inspect without creating anything. The renderer names a task folder below
// the chosen export directory; only bounded missing descendants are allowed.
function inspectExportPath(destination, excluded = [], allowMissing = false) {
  if (typeof destination !== 'string' || !path.isAbsolute(destination) || destination.length > 4096 || /[\u0000-\u001f\u007f]/.test(destination)) throw error('EXPORT_DESTINATION_INVALID');
  const normalized = path.resolve(destination);
  if (normalized === path.parse(normalized).root || excluded.some(directory => directory && within(directory, normalized))) throw error('EXPORT_DESTINATION_INVALID');
  let current = path.parse(normalized).root;
  const missing = [];
  for (const part of path.dirname(normalized).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw error('EXPORT_DESTINATION_INVALID');
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure.message === 'EXPORT_DESTINATION_INVALID' ? failure : error('EXPORT_DESTINATION_INVALID');
      if (!allowMissing) throw error('EXPORT_PARENT_MISSING');
      missing.push(current);
      if (missing.length > 8) throw error('EXPORT_DESTINATION_INVALID');
    }
  }
  try {
    const stat = fs.lstatSync(normalized);
    throw error(stat.isSymbolicLink() ? 'EXPORT_DESTINATION_INVALID' : 'EXPORT_OUTPUT_EXISTS');
  } catch (failure) { if (failure.code !== 'ENOENT') throw failure; }
  return { destination: normalized, missing };
}

function prepareExportPath(destination, excluded, guard, created) {
  const plan = inspectExportPath(destination, excluded, true);
  for (const directory of plan.missing) {
    guard();
    // Recheck ancestors before each mkdir. EEXIST is acceptable only if a
    // fresh lstat still proves it is an ordinary directory.
    inspectExportPath(destination, excluded, true);
    try { fs.mkdirSync(directory, { mode: 0o700 }); created.push(directory); }
    catch (failure) { if (failure.code !== 'EEXIST') throw error('EXPORT_OUTPUT_FAILED'); }
  }
  guard();
  return inspectExportPath(destination, excluded).destination;
}

function cleanupExportDirectories(created) {
  // Never recursively delete: another export may already have used the folder.
  for (const directory of [...created].reverse()) {
    try { fs.rmdirSync(directory); } catch { /* Preserve nonempty/replaced paths. */ }
  }
}
module.exports = { inspectExportPath, prepareExportPath, cleanupExportDirectories };
