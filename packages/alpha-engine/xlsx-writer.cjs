'use strict';

// Small dependency-free OOXML writer for bounded, read-only exports. It uses
// ZIP Store entries so the archive can be inspected without shipping a second
// compression library. This is intentionally limited to one worksheet.
const MAX_BYTES = 64 * 1024 * 1024;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function u16(value) { const out = Buffer.allocUnsafe(2); out.writeUInt16LE(value, 0); return out; }
function u32(value) { const out = Buffer.allocUnsafe(4); out.writeUInt32LE(value >>> 0, 0); return out; }
function xmlEscape(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[character]));
}

function cellReference(column, row) {
  let value = column + 1, letters = '';
  while (value > 0) { const remainder = (value - 1) % 26; letters = String.fromCharCode(65 + remainder) + letters; value = Math.floor((value - 1) / 26); }
  return `${letters}${row + 1}`;
}

function worksheetXml(headers, rows) {
  const allRows = [headers, ...rows];
  const body = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = cellReference(columnIndex, rowIndex);
      if (typeof value === 'boolean') return `<c r="${reference}" t="b"><v>${value ? 1 : 0}</v></c>`;
      return `<c r="${reference}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function zipStore(entries, tooLargeCode = 'GROUP_MEMBER_EXPORT_TOO_LARGE') {
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (nameBytes.length > 0xffff || data.length > 0xffffffff || offset > 0xffffffff) throw new Error(tooLargeCode);
    const header = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc32(data)), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), nameBytes]);
    local.push(header, data);
    const directory = Buffer.concat([Buffer.from([0x50, 0x4b, 0x01, 0x02]), u16(20), u16(20), u16(0x800), u16(0), u16(0), u16(0), u32(crc32(data)), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes]);
    central.push(directory);
    offset += header.length + data.length;
  }
  const centralBytes = Buffer.concat(central), localBytes = Buffer.concat(local);
  const end = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralBytes.length), u32(localBytes.length), u16(0)]);
  const result = Buffer.concat([localBytes, centralBytes, end]);
  if (result.length > MAX_BYTES) throw new Error(tooLargeCode);
  return result;
}

function groupMembersXlsx(headers, rows) {
  return recordsXlsx(headers, rows, 'Members', 'GROUP_MEMBER_EXPORT_TOO_LARGE', 5000);
}

function contactsXlsx(headers, rows) {
  return recordsXlsx(headers, rows, 'Contacts', 'CONTACT_EXPORT_TOO_LARGE', 100000);
}

function recordsXlsx(headers, rows, sheetName = 'Records', tooLargeCode = 'RECORD_EXPORT_TOO_LARGE', maxRows = 20000) {
  if (!Array.isArray(headers) || headers.length < 1 || headers.length > 256 || headers.some(header => typeof header !== 'string' || !header || header.length > 256) || !Array.isArray(rows) || rows.length > maxRows || rows.some(row => !Array.isArray(row) || row.length !== headers.length)) throw new Error(tooLargeCode);
  const safeSheetName = String(sheetName).replace(/[\\/*?:\[\]]/g, '_').slice(0, 31) || 'Records';
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(safeSheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>';
  const rootRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>';
  const entries = [
    ['[Content_Types].xml', contentTypes],
    ['_rels/.rels', rootRels],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', rels],
    ['xl/worksheets/sheet1.xml', worksheetXml(headers, rows)]
  ];
  return zipStore(entries, tooLargeCode);
}

module.exports = { contactsXlsx, groupMembersXlsx, recordsXlsx, MAX_BYTES };
