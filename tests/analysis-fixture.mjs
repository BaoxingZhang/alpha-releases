import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createSearchFixture } from './search-fixture.mjs';

const execute = promisify(execFile);

/** Synthetic-only fixture with one group chat and explicit mention text. */
export async function createAnalysisFixture(directory) {
  const original = await createSearchFixture(directory);
  const script = String.raw`
import hashlib, sqlite3, sys
from pathlib import Path
root=Path(sys.argv[1])
conversation='room@chatroom'
table='Msg_'+hashlib.md5(conversation.encode()).hexdigest()
db=sqlite3.connect(root/'session'/'session.db')
db.execute('INSERT INTO SessionTable VALUES (?,?,?,?,?,?)',(conversation,'synthetic group',1700000010,1700000010,'wxid_peer','Peer'))
db.commit(); db.close()
db=sqlite3.connect(root/'message'/'message_0.db')
db.execute('INSERT INTO Name2Id(user_name) VALUES (?)',('wxid_peer',))
db.execute(f'CREATE TABLE "{table}" (local_id INTEGER PRIMARY KEY, server_id INTEGER, sort_seq INTEGER, local_type INTEGER, create_time INTEGER, real_sender_id INTEGER, status INTEGER, message_content BLOB, packed_info_data BLOB)')
db.executemany(f'INSERT INTO "{table}" VALUES (?,?,?,?,?,?,?,?,?)',[
 (101,7001,1,1,1700000005,3,4,'wxid_peer:\n@wxid_self hello',b''),
 (102,7002,2,1,1700000006,3,4,'wxid_peer:\n@all update',b''),
 (103,7003,3,1,1700003600,2,2,'@wxid_self my reply',b'')
])
db.commit(); db.close()
`;
  await execute('/usr/bin/python3', ['-c', script, original.directory]);
  return { ...original, groupConversationId: 'room@chatroom', groupMessageCount: 3 };
}
