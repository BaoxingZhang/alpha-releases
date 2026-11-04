import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRunLog } from '../scripts/normalize-run-log.mjs';

test('native smoke log normalization removes trailing whitespace only', () => {
  const input = 'alpha  \n' + 'beta\t\r\n' + 'inside  spaces\n' + 'tail \t';
  assert.equal(normalizeRunLog(input), 'alpha\n' + 'beta\r\n' + 'inside  spaces\n' + 'tail');
});

test('native smoke log normalization accepts empty and non-string chunks', () => {
  assert.equal(normalizeRunLog(), '');
  assert.equal(normalizeRunLog(42), '42');
});
