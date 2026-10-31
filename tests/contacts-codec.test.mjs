import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { checkedLookup, nativeContactFromRow, validateLookupUsernames } = require('../packages/alpha-engine/contacts.cjs');
const { ListContactsResponse, EngineClientFrame } = require('../packages/alpha-protocol/bindings.cjs');

test('contacts lookup codec preserves exact request order and validates native DTOs', () => {
  const requested = validateLookupUsernames(['wxid_alpha', 'wxid_beta']);
  const result = checkedLookup({
    sourceDatabase: 'contact/contact.db',
    sourceTable: 'contact',
    items: [
      { username: 'wxid_beta', displayName: 'Beta', alias: '', remark: '', nickName: 'Beta', localType: '1', sourceTable: 'contact', fields: [] },
      { username: 'wxid_alpha', displayName: 'Alpha', alias: '', remark: 'Alpha remark', nickName: 'Alpha', localType: '1', sourceTable: 'contact', fields: [] }
    ]
  }, requested);
  assert.deepEqual(result.items.map(item => item.username), ['wxid_alpha', 'wxid_beta']);
  assert.equal(result.items[0].displayName, 'Alpha remark');
  assert.deepEqual(nativeContactFromRow({ username: 'wxid_alpha', remark: '', nickName: 'Alpha', alias: '', localType: '1', sourceTable: 'contact' }).fields, []);
  assert.throws(() => checkedLookup({ sourceDatabase: 'contact/contact.db', sourceTable: 'contact', items: [{ username: 'other', remark: '', nickName: '', alias: '', localType: '1', sourceTable: 'contact', fields: [] }] }, requested), /BRIDGE_CONTACT_LOOKUP_INVALID/);
  assert.throws(() => checkedLookup({ sourceDatabase: '../contact.db', sourceTable: 'contact', items: [] }, requested), /BRIDGE_CONTACT_LOOKUP_INVALID/);
});

test('contacts lookup protobuf response roundtrips through ListContactsResponse', () => {
  const response = ListContactsResponse.fromPartial({
    sourceDatabase: 'contact/contact.db', sourceTable: 'contact',
    lookup: { items: [{ username: 'wxid_alpha', displayName: 'Alpha', localType: 1, flags: 0n, sourceTable: 'contact', fields: [] }] },
    items: [{ username: 'wxid_alpha', displayName: 'Alpha', localType: 1, flags: 0n, sourceTable: 'contact', fields: [] }]
  });
  const decoded = ListContactsResponse.decode(ListContactsResponse.encode(response).finish());
  assert.equal(decoded.lookup.items[0].username, 'wxid_alpha');
  assert.equal(decoded.items[0].displayName, 'Alpha');
  const frame = EngineClientFrame.fromPartial({ requestId: 1n, listContacts: { accountId: 'synthetic', lookup: { usernames: ['wxid_alpha'] } } });
  const frameDecoded = EngineClientFrame.decode(EngineClientFrame.encode(frame).finish());
  assert.deepEqual(frameDecoded.listContacts.lookup.usernames, ['wxid_alpha']);
});
