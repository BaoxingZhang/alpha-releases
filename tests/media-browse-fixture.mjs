import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createFixture } from './data-bridge-fixture.mjs';

const execute = promisify(execFile);
const augmenter = fileURLToPath(new URL('./media-browse-fixtures.py', import.meta.url));

/** Build the normal synthetic database and add only media/display rows. */
export async function createMediaBrowseFixture(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('Fixture requires an explicit clean absolute directory');
  const base = await createFixture(directory);
  await execute('/usr/bin/python3', [augmenter, '--output', directory]);
  return { ...base, dataDir: directory, conversations: ['wxid_alpha', 'wxid_beta', 'wxid_gamma'] };
}

export async function removeMediaFixture(directory) {
  await fs.rm(directory, { recursive: true, force: true });
}
