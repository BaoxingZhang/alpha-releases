import path from 'node:path';
import { spawn } from 'node:child_process';
import { root } from './environment.mjs';
import { createFixture } from '../tests/data-bridge-fixture.mjs';
const args = process.argv.slice(2);
if (args.length > 1 || (args.length && !['--encrypted', '--search'].includes(args[0]))) throw new Error('Usage: npm run demo [-- --encrypted|--search]');
const session = `demo-${args[0]?.slice(2) ? args[0].slice(2) + '-' : ''}${Date.now()}`;
const directory = path.join(root, '.runtime', session, 'fixture');
let sourceDir, accountId, encrypted = args.includes('--encrypted');
if (encrypted) {
  const { createEncryptedFixture, cleanupEncryptedFixtureHelper } = await import('../tests/encrypted-fixture.mjs');
  const fixture = await createEncryptedFixture({ directory });
  sourceDir = fixture.sourceDir; accountId = fixture.expected.accountId;
  await cleanupEncryptedFixtureHelper();
  console.log('Opening synthetic encrypted WeChat v4 data. This key is for generated demo data only:');
  console.log(fixture.keyHex);
} else {
  const fixture = args.includes('--search') ? await (await import('../tests/search-fixture.mjs')).createSearchFixture({ directory }) : await createFixture(directory);
  sourceDir = fixture.directory; accountId = fixture.accountId;
  console.log('Opening synthetic WeChat v4 SQLite data. No personal WeChat files are used.');
}
const child = spawn(process.execPath, [path.join(root, 'scripts/launch.mjs'), '--independent', '--session', session, encrypted ? '--encrypted-dir' : '--data-dir', sourceDir, '--account-id', accountId], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', e => { console.error(e); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
