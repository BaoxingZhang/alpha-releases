import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { zstdCompressSync } from 'node:zlib';
import { createFixture } from './data-bridge-fixture.mjs';

const execute = promisify(execFile);

/** Synthetic-only extension of the v4 schema fixture, never discovers user data. */
export async function createSearchFixture(options) {
  const directory = typeof options === 'string' ? options : options.directory;
  const original = await createFixture(directory);
  const zstdText = '压缩维护 needle zstd 中文';
  const compressed = zstdCompressSync(Buffer.from(zstdText)).toString('base64');
  const script = `
import sqlite3, hashlib, json, base64, sys
from pathlib import Path
root=Path(sys.argv[1]); compressed=base64.b64decode(sys.argv[2])
def table(name): return 'Msg_'+hashlib.md5(name.encode()).hexdigest()
schema='(local_id INTEGER PRIMARY KEY, server_id INTEGER, sort_seq INTEGER, local_type INTEGER, create_time INTEGER, real_sender_id INTEGER, status INTEGER, message_content BLOB, packed_info_data BLOB)'
for shard in range(2):
 db=sqlite3.connect(root/'message'/('message_%d.db'%shard))
 db.executemany('INSERT INTO Name2Id(user_name) VALUES (?)',[('wxid_beta',),('wxid_archived',)])
 alpha=table('wxid_alpha')
 if shard==0:
  for local,text in [(9007199254740993,'维护 needle first 100% _ . [literal]'),(2,'维护 needle second'),(3,'维护 same sequence')]: db.execute('UPDATE '+alpha+' SET message_content=? WHERE local_id=?',(text,local))
  beta=table('wxid_beta'); db.execute('CREATE TABLE '+beta+schema)
  db.executemany('INSERT INTO '+beta+' VALUES (?,?,?,?,?,?,?,?,?)',[(1,77,200,1,1700086400,2,2,'维护 beta next day',b''),(2,78,200,1,1700000001,3,4,'维护 beta tied time',b''),(3,-1,200,1,1700172800,3,4,'Percent 100% needle [] _',b'')])
 else:
  db.execute('UPDATE '+alpha+' SET message_content=? WHERE local_id=1',('维护 earlier shard',))
  db.execute('UPDATE '+alpha+' SET server_id=?,message_content=? WHERE local_id=4',(9007199254740995,'维护 cross shard tie'))
  db.execute('UPDATE '+alpha+' SET sort_seq=25,message_content=? WHERE local_id=5',(compressed,))
  archived=table('wxid_archived'); db.execute('CREATE TABLE '+archived+schema)
  db.execute('INSERT INTO '+archived+' VALUES (?,?,?,?,?,?,?,?,?)',(1,99,200,1,1700000002,4,4,'维护 archived without session',b''))
 db.commit(); db.close()
`;
  await execute('/usr/bin/python3', ['-c', script, directory, compressed]);
  return { ...original, directory, accountId: 'synthetic-account', conversationId: 'wxid_alpha', secondConversationId: 'wxid_beta', archivedConversationId: 'wxid_archived', query: '维护', zstdText, messageCount: 10, matchingCount: 9, alphaMatchingCount: 6, groupedMatchingCount: 3, ambiguousServerId: '9007199254740995', uniqueServerId: '9223372036854775807', unsignedServerId: '18446744073709551615', firstTime: '1699999999', lastTime: '1700172800' };
}
