import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/renderer/assets/index-DPCwIOAb.js'), 'utf8');

test('independent renderer keeps moments and favorites fail-closed with actionable status', () => {
  assert.match(source, /function useFavoriteFeed\(accountId, accountEpoch, independent = false\)/);
  assert.match(source, /enabled: Boolean\(accountId\) && !independent && !searchError/);
  assert.match(source, /独立离线模式暂未接入微信收藏数据库/);
  assert.match(source, /独立模式暂不支持收藏/);
  assert.match(source, /function useMomentsQuery\(accountId, independent = false\)/);
  assert.match(source, /enabled: Boolean\(accountId\) && !independent,/);
  assert.match(source, /独立离线模式暂未接入微信朋友圈数据库/);
  assert.match(source, /独立模式暂不支持朋友圈/);
});
