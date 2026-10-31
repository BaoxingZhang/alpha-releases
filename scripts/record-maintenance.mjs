import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baseline = JSON.parse(await fs.readFile(path.join(root, 'provenance/recovered-files.json'), 'utf8'));
const changed = [];
for (const entry of baseline.files) {
  const content = await fs.readFile(path.join(root, entry.path));
  const hash = crypto.createHash('sha256').update(content).digest('hex');
  if (hash !== entry.sha256) changed.push({ path: entry.path, originalSha256: entry.sha256, currentSha256: hash, currentBytes: content.length });
}
await fs.writeFile(path.join(root, 'provenance/maintenance-changes.json'), JSON.stringify({
  recordedAt: new Date().toISOString(), sourceDmgSha256: baseline.source_dmg_sha256,
  originalManifest: 'provenance/recovered-files.json', originalFiles: baseline.files.length,
  unchangedOriginalFiles: baseline.files.length - changed.length, changed,
  reason: 'Explicit independent backend startup, data-source discovery, original gateway boundaries, offline manual-key onboarding, and independent import timeout/queue routing.',
  authoredModules: ['packages/alpha-engine', 'packages/alpha-data-bridge', 'packages/alpha-snapshot-import', 'packages/alpha-security', 'packages/alpha-desktop'],
  originalNativeArtifactsModified: false,
  note: 'Recovered declarations in alpha-protocol remain generated from main. The current source hash is recorded separately from original provenance. Native hashes must also pass verify:vendor.'
}, null, 2) + '\n');
console.log(`${changed.length} maintained recovered files; ${baseline.files.length - changed.length} remain byte-identical to the extraction.`);
