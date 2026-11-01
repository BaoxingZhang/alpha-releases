// Maintained export choices shared by the center and dialog. Original engine
// preferences stay separate from the independent engine's remembered format.
const INDEPENDENT_FORMATS = new Set(['json', 'markdown', 'txt', 'xlsx', 'chatlab-json', 'chatlab-jsonl', 'sql', 'weclone']);

export function chatExportPolicy(preferences, offered, independent) {
  const formats = independent ? offered.filter(item => INDEPENDENT_FORMATS.has(item.id)) : offered;
  const preferred = independent ? preferences.independentFormat || preferences.format : preferences.format;
  const format = formats.some(item => item.id === preferred) ? preferred : independent ? 'markdown' : formats[0]?.id;
  return { formats, format, includeMedia: independent ? false : preferences.includeMedia === true };
}

export function independentFormatPreference(value) {
  return INDEPENDENT_FORMATS.has(value) ? value : '';
}
