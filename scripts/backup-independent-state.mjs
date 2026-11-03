#!/usr/bin/env node
import { createStateBackup } from '../packages/alpha-engine/state-backup.cjs';

function parse(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== '--source' && name !== '--target' || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--')) throw new Error('USAGE: --source /absolute/state --target /absolute/backup.alpha-state');
    if (values[name.slice(2)]) throw new Error('USAGE: duplicate option');
    values[name.slice(2)] = argv[++index];
  }
  if (!values.source || !values.target) throw new Error('USAGE: --source /absolute/state --target /absolute/backup.alpha-state');
  return values;
}

try {
  const options = parse(process.argv.slice(2));
  const result = await createStateBackup({ sourceDir: options.source, targetFile: options.target });
  process.stdout.write(`${JSON.stringify({ schema: result.schema, targetFile: result.targetFile, manifest: result.manifest })}\n`);
} catch (error) {
  process.stderr.write(`${error?.message || 'STATE_BACKUP_FAILED'}\n`);
  process.exitCode = 2;
}
