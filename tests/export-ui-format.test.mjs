import test from 'node:test';
import assert from 'node:assert/strict';
import { chatExportPolicy, independentFormatPreference } from '../src/renderer/assets/export-policy.mjs';

const formats = ['xlsx', 'html', 'markdown', 'txt', 'json', 'sql'].map(id => ({ id }));

test('xlsx/media preferences select an independent export without altering original settings', () => {
  const preferences = Object.freeze({ format: 'xlsx', includeMedia: true });
  const independent = chatExportPolicy(preferences, formats, true);
  assert.deepEqual(independent.formats.map(item => item.id), ['xlsx', 'markdown', 'txt', 'json']);
  assert.equal(independent.format, 'xlsx');
  assert.equal(independent.includeMedia, false);
  assert.equal(chatExportPolicy(preferences, formats, false).format, 'xlsx');
  assert.equal(chatExportPolicy(preferences, formats, false).includeMedia, true);
});

test('center and dialog remember an independent selection separately from original settings', () => {
  const preferences = { format: 'html', independentFormat: independentFormatPreference('json') };
  assert.equal(chatExportPolicy(preferences, formats, true).format, 'json');
  assert.equal(chatExportPolicy(preferences, formats, false).format, 'html');
  assert.equal(independentFormatPreference('xlsx'), 'xlsx');
  assert.equal(chatExportPolicy({ format: 'txt' }, formats, true).format, 'txt');
});
