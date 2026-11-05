import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('related open source evidence records license and reuse boundaries', async () => {
  const document = await fs.readFile(path.join(root, 'docs/related-open-source-evidence.md'), 'utf8');
  for (const marker of [
    '916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73',
    '91adcfdbb24e8e147d8332440b8c6ac899ad2abf',
    'CC BY-NC-SA 4.0',
    'GetDbKey',
    'decryptDatNative(inputPath, xorKey, aesKey)',
    'third-party-components.md',
    'native_schema_supported=false',
    '不复制其 TypeScript、原生二进制或媒体/取钥实现'
  ]) {
    assert.ok(document.includes(marker), `missing evidence marker: ${marker}`);
  }
  assert.match(document, /Alpha 继续对真实朋友圈、收藏、媒体和自动取钥保持 fail-closed/);
  assert.match(document, /raw\.githubusercontent\.com\/xunchahaha\/WeFlow1\/916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73\//);
  assert.match(document, /raw\.githubusercontent\.com\/hicccc77\/WeFlow\/91adcfdbb24e8e147d8332440b8c6ac899ad2abf\//);
  assert.doesNotMatch(document, /raw\.githubusercontent\.com\/(?:xunchahaha\/WeFlow1|hicccc77\/WeFlow)\/(?:main|master)\//);
});
