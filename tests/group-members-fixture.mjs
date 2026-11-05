import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createFixture } from './data-bridge-fixture.mjs';

const execute = promisify(execFile);

function varint(value) {
  const bytes = [];
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return Buffer.from(bytes);
}

function field(fieldNumber, value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([varint((fieldNumber << 3) | 2), varint(bytes.length), bytes]);
}

function user(username, displayName) {
  return Buffer.concat([field(1, username), field(2, displayName)]);
}

function roomData(memberCount = 2) {
  if (!Number.isInteger(memberCount) || memberCount < 2 || memberCount > 5001) throw new Error('memberCount must be between 2 and 5001');
  const users = [field(1, user('wxid_alpha', '群主显示名')), field(1, user('wxid_beta', '群成员显示名'))];
  for (let index = 2; index < memberCount; index += 1) users.push(field(1, user(`wxid_member_${index}`, `群成员${index}`)));
  return Buffer.concat(users);
}

/** Creates only a synthetic v4 chat_room row in the fixture directory. */
export async function createGroupMembersFixture(directory, options = {}) {
  const original = await createFixture(directory);
  const encoded = roomData(options.memberCount ?? 2).toString('base64');
  const script = `
import base64, sqlite3, sys
db=sqlite3.connect(sys.argv[1] + '/contact/contact.db')
db.execute('CREATE TABLE chat_room (id INTEGER PRIMARY KEY, username TEXT, owner TEXT, ext_buffer BLOB)')
db.execute('INSERT INTO chat_room(username,owner,ext_buffer) VALUES (?,?,?)', ('room@chatroom','wxid_alpha',base64.b64decode(sys.argv[2])))
db.execute('INSERT INTO chat_room(username,owner,ext_buffer) VALUES (?,?,?)', ('room2@chatroom','wxid_beta',base64.b64decode(sys.argv[3])))
db.execute('CREATE TABLE __alpha_group_pins_v1 (chatroom_id TEXT NOT NULL, seq TEXT NOT NULL, sender_id TEXT NOT NULL, server_id TEXT NOT NULL, local_type INTEGER NOT NULL, preview TEXT NOT NULL, pinned_by TEXT NOT NULL)')
db.executemany('INSERT INTO __alpha_group_pins_v1 VALUES (?,?,?,?,?,?,?)', [
 ('room@chatroom','1','wxid_alpha','9223372036854775808',1,'合成置顶第一条','wxid_alpha'),
 ('room@chatroom','2','wxid_beta','9',49,'合成置顶第二条','wxid_alpha')])
db.execute('INSERT INTO contact VALUES (?,?,?,?,?)', ('room@chatroom',2,'','合成群聊',''))
db.commit(); db.close()
db=sqlite3.connect(sys.argv[1] + '/session/session.db')
db.execute('INSERT INTO SessionTable VALUES (?,?,?,?,?,?)', ('room@chatroom','synthetic room',1700000004,1700000004,'wxid_alpha','群主显示名'))
db.commit(); db.close()
`;
  const encodedSecond = Buffer.concat([field(1, user('wxid_alpha', ''))]).toString('base64');
  await execute('/usr/bin/python3', ['-c', script, directory, encoded, encodedSecond]);
  await fs.access(`${directory}/contact/contact.db`);
  return { ...original, chatroomId: 'room@chatroom', ownerId: 'wxid_alpha', memberId: 'wxid_beta' };
}
