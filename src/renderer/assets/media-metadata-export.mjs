// Independent-only helper for the media browser. It deliberately routes
// through the existing conversation export IPC so the main process keeps the
// same path checks and atomic publication rules.
export const MEDIA_METADATA_FORMATS = Object.freeze([
  { id: 'media-json', extension: 'json', label: '媒体元数据 JSON' },
  { id: 'media-csv', extension: 'csv', label: '媒体元数据 CSV' }
]);

export function mediaMetadataExportRequest(accountId, conversationId, format, destinationPath) {
  if (typeof accountId !== 'string' || !accountId.trim() || typeof conversationId !== 'string' || typeof destinationPath !== 'string') throw new Error('MEDIA_METADATA_REQUEST_INVALID');
  const choice = MEDIA_METADATA_FORMATS.find(item => item.id === format);
  if (!choice || !destinationPath.toLowerCase().endsWith(`.${choice.extension}`)) throw new Error('MEDIA_METADATA_REQUEST_INVALID');
  return { accountId: accountId.trim(), conversationId, format: choice.id, destinationPath, includeMedia: false, metadataOnly: true, mediaReady: false };
}

export function mediaMetadataExportLabel(format) {
  return MEDIA_METADATA_FORMATS.find(item => item.id === format)?.label || '媒体元数据';
}
