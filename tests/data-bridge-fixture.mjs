import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const generator = fileURLToPath(new URL('./data-bridge-fixtures.py', import.meta.url));

export async function createFixture(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('Fixture requires an explicit clean absolute directory');
  await fs.mkdir(path.dirname(directory), { recursive: true });
  const { stdout } = await execute('/usr/bin/python3', [generator, '--output', directory]);
  return JSON.parse(stdout);
}
