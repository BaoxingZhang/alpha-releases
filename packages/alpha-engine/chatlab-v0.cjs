'use strict';

const VERSION = '0.0.2';
const TYPE_BY_KIND = Object.freeze({
  text: 0, image: 1, voice: 2, video: 3, file: 4, emoji: 5, link: 7,
  location: 8, red_packet: 20, transfer: 21, poke: 22, call: 23,
  share: 24, quote: 25, forward: 26, contact: 27, system: 80, recall: 81
});

function requiredString(value, name) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 10000) throw new Error(`CHATLAB_${name.toUpperCase()}_INVALID`);
  return value;
}

function optionalString(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredString(value, name);
}

function asStringId(value, name) {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return requiredString(value, name);
}

function secondsFrom(value, name) {
  let number;
  if (typeof value === 'bigint') number = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value)) number = BigInt(value);
  else if (typeof value === 'string' && /^-?\d+$/.test(value)) number = BigInt(value);
  else throw new Error(`CHATLAB_${name.toUpperCase()}_INVALID`);
  // Canonical Alpha DTOs use milliseconds; ChatLab uses integer seconds.
  if (name === 'timestamp_ms') number /= 1000n;
  const seconds = Number(number);
  if (!Number.isSafeInteger(seconds)) throw new Error('CHATLAB_TIMESTAMP_UNSAFE');
  return seconds;
}

function typeCode(item) {
  if (Number.isInteger(item.type) && item.type >= 0 && item.type <= 99) return item.type;
  if (Number.isInteger(item.localType) && item.localType >= 0 && item.localType <= 99) return item.localType;
  if (typeof item.kind === 'string' && TYPE_BY_KIND[item.kind] !== undefined) return TYPE_BY_KIND[item.kind];
  return 99;
}

function mapMember(member) {
  if (!member || typeof member !== 'object' || Array.isArray(member)) throw new Error('CHATLAB_MEMBER_INVALID');
  const out = {
    platformId: asStringId(member.platformId ?? member.id ?? member.userName, 'member_id'),
    accountName: requiredString(member.accountName ?? member.name ?? member.nickname ?? member.platformId, 'member_name')
  };
  for (const key of ['groupNickname', 'avatar']) {
    const value = optionalString(member[key], key);
    if (value !== undefined) out[key] = value;
  }
  if (member.roles !== undefined) {
    if (!Array.isArray(member.roles) || member.roles.length > 8) throw new Error('CHATLAB_MEMBER_ROLES_INVALID');
    out.roles = member.roles.map(role => {
      if (!role || typeof role !== 'object' || Array.isArray(role)) throw new Error('CHATLAB_MEMBER_ROLE_INVALID');
      const id = requiredString(role.id, 'member_role_id');
      const name = optionalString(role.name, 'member_role_name');
      return name === undefined ? { id } : { id, name };
    });
  }
  return out;
}

function mapMessage(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('CHATLAB_MESSAGE_INVALID');
  if (item.content !== undefined && item.content !== null && typeof item.content !== 'string' && typeof item.text !== 'string') throw new Error('CHATLAB_CONTENT_INVALID');
  const out = {
    sender: asStringId(item.sender ?? item.senderId ?? item.talker, 'sender_id'),
    timestamp: item.timestamp !== undefined ? secondsFrom(item.timestamp, 'timestamp') : secondsFrom(item.sentAtUnixMs, 'timestamp_ms'),
    type: typeCode(item),
    content: item.content === null || (item.content === undefined && item.text === null) ? null : String(item.content ?? item.text ?? '')
  };
  for (const [target, source] of [['accountName', 'accountName'], ['groupNickname', 'groupNickname'], ['platformMessageId', 'platformMessageId'], ['replyToMessageId', 'replyToMessageId']]) {
    const value = optionalString(item[source], target);
    if (value !== undefined) out[target] = value;
  }
  const id = item.serverId ?? item.messageId;
  if (out.platformMessageId === undefined && id !== undefined) out.platformMessageId = asStringId(id, 'platform_message_id');
  return out;
}

function toChatLabExport(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('CHATLAB_INPUT_INVALID');
  const conversation = input.conversation || input.session || {};
  const name = requiredString(conversation.name ?? conversation.displayName ?? conversation.conversationId ?? input.conversationId, 'conversation_name');
  const type = conversation.type === 'group' || conversation.isGroup === true ? 'group' : 'private';
  const meta = { name, platform: 'weixin', type };
  const groupId = optionalString(conversation.groupId ?? conversation.conversationId ?? input.conversationId, 'group_id');
  if (type === 'group' && groupId !== undefined) meta.groupId = groupId;
  const exportedAt = options.exportedAtUnixSec === undefined ? Math.floor(Date.now() / 1000) : secondsFrom(options.exportedAtUnixSec, 'exported_at');
  const chatlab = { version: VERSION, exportedAt, generator: 'alpha-recovered-independent' };
  const rawMembers = input.members ?? conversation.members ?? [];
  const rawMessages = input.messages ?? [];
  if (!Array.isArray(rawMembers) || !Array.isArray(rawMessages)) throw new Error('CHATLAB_ARRAY_INVALID');
  if (rawMembers.length > 10000 || rawMessages.length > 1000000) throw new Error('CHATLAB_ARRAY_TOO_LARGE');
  const members = rawMembers.map(mapMember);
  const messages = rawMessages.map(mapMessage);
  return { chatlab, meta, members, messages };
}

function stringifyChatLab(value) {
  return `${JSON.stringify(value)}\n`;
}

function stringifyChatLabJsonl(value) {
  const lines = [
    { _type: 'header', chatlab: value.chatlab, meta: value.meta },
    ...value.members.map(member => ({ _type: 'member', ...member })),
    ...value.messages.map(message => ({ _type: 'message', ...message }))
  ];
  return `${lines.map(line => JSON.stringify(line)).join('\n')}\n`;
}

module.exports = { VERSION, TYPE_BY_KIND, toChatLabExport, stringifyChatLab, stringifyChatLabJsonl };
