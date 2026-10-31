'use strict';

const textValue = (value, maximum = 4096) => {
  if (typeof value !== 'string' || value.length > maximum || value.includes('\0')) throw new Error('BRIDGE_CONTACT_INVALID');
  return value;
};

function validateLookupUsernames(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 500) throw new Error('CONTACT_LOOKUP_INVALID');
  const seen = new Set();
  for (const username of value) {
    if (typeof username !== 'string' || !username || username !== username.trim() || Buffer.byteLength(username, 'utf8') > 1024 || /[\u0000-\u001f\u007f]/.test(username)) throw new Error('CONTACT_LOOKUP_INVALID');
    if (seen.has(username)) throw new Error('CONTACT_LOOKUP_INVALID');
    seen.add(username);
  }
  return value;
}

function nativeContactFromRow(row) {
  if (!row || typeof row !== 'object') throw new Error('BRIDGE_CONTACT_INVALID');
  const username = textValue(row.username, 1024);
  if (!username || username !== username.trim() || /[\u0000-\u001f\u007f]/.test(username)) throw new Error('BRIDGE_CONTACT_INVALID');
  const localType = typeof row.localType === 'string' && row.localType.length <= 10 && /^(?:0|[1-9][0-9]*)$/.test(row.localType) ? BigInt(row.localType) : null;
  if (localType === null || localType > 0xffffffffn) throw new Error('BRIDGE_CONTACT_INVALID');
  if (row.sourceTable !== 'contact') throw new Error('BRIDGE_CONTACT_INVALID');
  const fields = row.fields === undefined ? [] : row.fields;
  if (!Array.isArray(fields) || fields.length > 32) throw new Error('BRIDGE_CONTACT_INVALID');
  const mappedFields = fields.map(field => {
    if (!field || typeof field.name !== 'string' || field.name.length > 256 || field.name.includes('\0') || typeof field.value !== 'string' || field.value.length > 4096 || field.value.includes('\0') || !Number.isInteger(field.valueKind) || field.valueKind < 0 || field.valueKind > 16 || typeof field.truncated !== 'boolean') throw new Error('BRIDGE_CONTACT_INVALID');
    return { name: field.name, value: field.value, valueKind: field.valueKind, truncated: field.truncated };
  });
  return {
    username,
    displayName: textValue(row.remark, 4096) || textValue(row.nickName, 4096) || username,
    alias: textValue(row.alias, 4096),
    remark: textValue(row.remark, 4096),
    nickname: textValue(row.nickName, 4096),
    avatarRef: row.avatarRef === undefined ? '' : textValue(row.avatarRef, 4096),
    localType: Number(localType),
    flags: (() => {
      try {
        if (row.flags !== undefined && (typeof row.flags === 'string' && row.flags.length > 20 || typeof row.flags !== 'string' && typeof row.flags !== 'bigint' && typeof row.flags !== 'number')) throw new Error();
        const flags = row.flags === undefined ? 0n : BigInt(row.flags);
        if (flags < 0n || flags > 0xffffffffffffffffn) throw new Error();
        return flags;
      } catch {
        throw new Error('BRIDGE_CONTACT_INVALID');
      }
    })(),
    sourceTable: textValue(row.sourceTable, 1024),
    fields: mappedFields
  };
}

function checkedLookup(value, usernames) {
  validateLookupUsernames(usernames);
  if (!value || !Array.isArray(value.items) || value.items.length > usernames.length || typeof value.sourceDatabase !== 'string' || value.sourceDatabase.length > 1024 || value.sourceDatabase.includes('\0') || value.sourceTable !== 'contact') throw new Error('BRIDGE_CONTACT_LOOKUP_INVALID');
  const databaseParts = value.sourceDatabase.split('/');
  if (!databaseParts.length || databaseParts.at(-1) !== 'contact.db' || databaseParts.some(part => !part || part === '.' || part === '..')) throw new Error('BRIDGE_CONTACT_LOOKUP_INVALID');
  const requested = new Set(usernames);
  const seen = new Set();
  const byUsername = new Map();
  value.items.forEach(row => {
    // The Go bridge carries provenance under source.table for lookup rows;
    // normalize it to the engine's native contact DTO before validation.
    const item = nativeContactFromRow({ ...row, sourceTable: row.sourceTable ?? row.source?.table ?? 'contact' });
    if (!requested.has(item.username) || seen.has(item.username)) throw new Error('BRIDGE_CONTACT_LOOKUP_INVALID');
    seen.add(item.username);
    byUsername.set(item.username, item);
  });
  return { items: usernames.flatMap(username => byUsername.has(username) ? [byUsername.get(username)] : []), sourceDatabase: value.sourceDatabase, sourceTable: value.sourceTable };
}

module.exports = { validateLookupUsernames, nativeContactFromRow, checkedLookup };
