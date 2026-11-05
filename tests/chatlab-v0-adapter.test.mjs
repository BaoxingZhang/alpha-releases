import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { toChatLabExport, stringifyChatLab, stringifyChatLabJsonl } = require('../packages/alpha-engine/chatlab-v0.cjs');

const sample = () => toChatLabExport({
  conversation: { conversationId: 'room@chatroom', displayName: '测试群', isGroup: true },
  members: [{ id: 9007199254740993n, name: '甲', roles: [{ id: 'owner' }] }],
  messages: [
    { senderId: 'wxid_a', sentAtUnixMs: 1700000000123n, localType: 0, text: 'hello', serverId: 9007199254740993123n },
    { senderId: 'wxid_b', sentAtUnixMs: '1700000001123', kind: 'quote', text: null, replyToMessageId: '9007199254740993123' }
  ]
}, { exportedAtUnixSec: 1700000000 });

test('ChatLab v0.0.2 JSON keeps uint64 ids and second timestamps', () => {
  const value = sample();
  assert.equal(value.chatlab.version, '0.0.2');
  assert.equal(value.chatlab.exportedAt, 1700000000);
  assert.equal(value.meta.platform, 'weixin');
  assert.equal(value.messages[0].timestamp, 1700000000);
  assert.equal(value.messages[0].platformMessageId, '9007199254740993123');
  assert.equal(value.members[0].platformId, '9007199254740993');
  assert.equal(value.messages[1].content, null);
  assert.equal(value.messages[1].type, 25);
  assert.equal(toChatLabExport({ conversation: { name: 'x' }, messages: [{ senderId: 'a', sentAtUnixMs: 0, kind: 'future-kind', text: 'x' }] }, { exportedAtUnixSec: 0 }).messages[0].type, 99);
});

test('ChatLab JSONL has deterministic header/member/message order and omits media', () => {
  const value = sample();
  const lines = stringifyChatLabJsonl(value).trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(lines.map(item => item._type), ['header', 'member', 'message', 'message']);
  assert.equal(lines[0].chatlab.version, '0.0.2');
  assert.equal(Object.hasOwn(lines[2], 'mediaPath'), false);
  assert.equal(Object.hasOwn(lines[2], 'chatRecords'), false);
});

test('ChatLab adapter rejects unsafe timestamps and malformed ids', () => {
  assert.throws(() => toChatLabExport({ conversation: { name: 'x' }, messages: [{ senderId: 'a', sentAtUnixMs: Number.MAX_SAFE_INTEGER + 1 }] }), /CHATLAB_TIMESTAMP/);
  assert.throws(() => toChatLabExport({ conversation: { name: 'x' }, messages: [{ senderId: '', sentAtUnixMs: 0 }] }), /CHATLAB_SENDER_ID/);
  assert.throws(() => toChatLabExport({ conversation: { name: 'x' }, members: [{ id: 'a', name: 'x', roles: [{ id: 1 }] }] }), /CHATLAB_MEMBER_ROLE_ID/);
  assert.throws(() => toChatLabExport({ conversation: { name: 'x' }, messages: {} }), /CHATLAB_ARRAY_INVALID/);
  assert.match(stringifyChatLab(sample()), /"chatlab":\{"version":"0\.0\.2"/);
});
