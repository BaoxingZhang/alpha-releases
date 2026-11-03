#!/usr/bin/env node
import { restoreStateBackup } from '../packages/alpha-engine/state-backup.cjs';

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== '--source' && name !== '--target' || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) throw new Error('USAGE: --source /absolute/backup.alpha-state --target /absolute/new-state');
    if (values[name.slice(2)]) throw new Error('USAGE: duplicate option');
    values[name.slice(2)] = argv[++index];
  }
  if (!values.source || !values.target) throw new Error('USAGE: --source /absolute/backup.alpha-state --target /absolute/new-state');
  return values;
}

try {
  const options = parse(process.argv.slice(2));
  const result = await restoreStateBackup({ sourceFile: options.source, targetDir: options.target });
  process.stdout.write(`${JSON.stringify({ schema: result.schema, targetDir: result.targetDir, manifest: result.manifest })}\n`);
} catch (error) {
  process.stderr.write(`${error?.message || 'STATE_RESTORE_FAILED'}\n`);
  process.exitCode = 2;
}
