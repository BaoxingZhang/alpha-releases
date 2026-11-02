'use strict';

const path = require('node:path');
const { loadMediaIndex, readMediaEntry } = require('./media-index.cjs');

// Indexed attachments are an explicit independent recovery surface.  The
// generic media-index reader can handle larger objects for offline analysis,
// but the renderer-facing attachment IPC intentionally keeps a smaller bound
// because readMediaEntry materializes the bytes before writing them out.
const MAX_INDEXED_ATTACHMENT_BYTES = 64 * 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/;

function failure(code) {
  return new Error(code);
}

function sameEntry(left, right) {
  return left?.kind === right?.kind &&
    left?.sha256 === right?.sha256 &&
    left?.relativePath === right?.relativePath &&
    left?.sizeBytes === right?.sizeBytes &&
    left?.accountId === right?.accountId;
}

class IndexedAttachmentSource {
  constructor({ index, entry, fileName, id, accountId, granted }) {
    this.index = index;
    this.entry = entry;
    this.fileName = fileName;
    this.id = id;
    this.accountId = accountId;
    this.granted = granted;
  }

  get size() {
    return this.entry.sizeBytes;
  }

  /**
   * The manifest entry is immutable, but a later locate() creates a new
   * index object. Compare the explicit content binding rather than object
   * identity so saveAttachment detects changed path/hash/size metadata.
   */
  sameAs(other) {
    return other instanceof IndexedAttachmentSource &&
      other.id === this.id &&
      other.accountId === this.accountId &&
      other.index.root === this.index.root &&
      sameEntry(other.entry, this.entry);
  }

  /** Read, verify and write the indexed bytes while the renderer grant lives. */
  async copyTo(sink) {
    if (!this.granted()) throw failure('FILE_ATTACHMENT_NOT_AUTHORIZED');
    let media;
    try {
      media = await readMediaEntry(this.index, this.entry, { maxBytes: MAX_INDEXED_ATTACHMENT_BYTES });
    } catch (reason) {
      if (reason instanceof Error && reason.message === 'MEDIA_INDEX_FILE_TOO_LARGE') throw failure('FILE_ATTACHMENT_TOO_LARGE');
      if (reason instanceof Error && /^MEDIA_INDEX_[A-Z_]+$/.test(reason.message)) throw failure('FILE_ATTACHMENT_CONTENT_CHANGED');
      throw failure('FILE_ATTACHMENT_CONTENT_CHANGED');
    }
    if (!this.granted()) throw failure('FILE_ATTACHMENT_NOT_AUTHORIZED');
    await sink.write(media.bytes);
    if (!this.granted()) throw failure('FILE_ATTACHMENT_NOT_AUTHORIZED');
  }
}

/**
 * Locate exactly one explicitly indexed file whose verified SHA-256 is the
 * independent alpha-media URI id. No native media1_ or directory scan is
 * accepted here.
 */
function locateIndexedAttachment({ root, id, accountId, fileName, granted } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw failure('MEDIA_INDEX_ROOT_INVALID');
  if (typeof id !== 'string' || !SHA256.test(id)) throw failure('MEDIA_INDEX_ID_INVALID');
  if (typeof accountId !== 'string' || !accountId.trim()) throw failure('MEDIA_INDEX_ACCOUNT_INVALID');
  if (typeof fileName !== 'string' || !fileName) throw failure('MEDIA_INDEX_FILENAME_INVALID');
  if (typeof granted !== 'function') throw failure('MEDIA_INDEX_GRANT_INVALID');
  const normalizedAccount = accountId.trim();
  const index = loadMediaIndex({ root: path.resolve(root), expectedAccountId: normalizedAccount });
  const candidates = index.entries.filter((entry) =>
    entry.kind === 'file' &&
    entry.sha256 === id &&
    (!entry.accountId || entry.accountId === normalizedAccount)
  );
  if (candidates.length === 0) throw failure('MEDIA_INDEX_ENTRY_NOT_FOUND');
  if (candidates.length !== 1) throw failure('MEDIA_INDEX_ENTRY_AMBIGUOUS');
  const [entry] = candidates;
  if (entry.sizeBytes > MAX_INDEXED_ATTACHMENT_BYTES) throw failure('MEDIA_INDEX_FILE_TOO_LARGE');
  return new IndexedAttachmentSource({ index, entry, fileName, id, accountId: normalizedAccount, granted });
}

module.exports = {
  MAX_INDEXED_ATTACHMENT_BYTES,
  IndexedAttachmentSource,
  locateIndexedAttachment
};
