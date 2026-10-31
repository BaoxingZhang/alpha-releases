import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const record = JSON.parse(fs.readFileSync(path.join(root, 'docs/native-runtime-provenance.json')));
let count = 0;
for (const file of record.entries.filter(x => x.type === 'file')) {
  const target = path.join(root, 'vendor/runtime', file.path);
  const hash = createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  if (hash !== file.sha256) throw new Error(`Vendor hash changed: ${file.path}`);
  const mode = fs.statSync(target).mode & 0o777;
  if (mode !== Number(file.mode)) throw new Error(`Vendor mode changed: ${file.path}`);
  count++;
}
console.log(`Verified ${count} original runtime files (SHA256 + permissions).`);
