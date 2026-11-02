import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
export async function createMomentsFixture(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('fixture path invalid');
  await fs.mkdir(directory, { recursive: true });
  const script = String.raw`import sqlite3,sys
root=sys.argv[1]
db=sqlite3.connect(root+'/moments.db')
db.execute('''CREATE TABLE __alpha_moments_v1 (
id TEXT PRIMARY KEY,
username TEXT NOT NULL,
nickname TEXT NOT NULL DEFAULT '',
created_at_unix_ms INTEGER NOT NULL,
type INTEGER NOT NULL,
text TEXT NOT NULL DEFAULT '',
raw_xml TEXT NOT NULL DEFAULT '',
fields_json TEXT NOT NULL DEFAULT '[]'
)''')
db.executemany('INSERT INTO __alpha_moments_v1 VALUES (?,?,?,?,?,?,?,?)', [
('m1','wxid_a','作者甲',1700000000000,1,'hello','<msg>hello</msg>','[{"name":"__alpha_moment_details","value":"{\\"schema\\":\\"alpha.moment.v1\\",\\"parseStatus\\":\\"plain\\"}","valueKind":1,"truncated":false}]'),
('m2','wxid_b','作者乙',1700086400000,3,'world','<msg>world</msg>','[]'),
('m3','wxid_a','作者甲',1700172800000,1,'again','','[]')])
db.commit();db.close()`;
  await execute('/usr/bin/python3', ['-c', script, directory]);
  return { directory, accountId: 'moment-account' };
}


// Add the explicit synthetic moments schema to an already-created offline
// dataset. The bridge only advertises moments capabilities when this table is
// present; no native WeChat SnsTimeLine/snsmessage schema is inferred.
export async function installMomentsFixture(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('fixture path invalid');
  const script = String.raw`import sqlite3,sys
root=sys.argv[1]
db=sqlite3.connect(root+'/moments.db')
db.execute('''CREATE TABLE __alpha_moments_v1 (
id TEXT PRIMARY KEY,
username TEXT NOT NULL,
nickname TEXT NOT NULL DEFAULT '',
created_at_unix_ms INTEGER NOT NULL,
type INTEGER NOT NULL,
text TEXT NOT NULL DEFAULT '',
raw_xml TEXT NOT NULL DEFAULT '',
fields_json TEXT NOT NULL DEFAULT '[]'
)''')
db.executemany('INSERT INTO __alpha_moments_v1 VALUES (?,?,?,?,?,?,?,?)', [
('m1','wxid_alpha','合成联系人甲',1700000000000,1,'合成朋友圈第一条','','[{"name":"__alpha_moment_details","value":"{\\"schema\\":\\"alpha.moment.v1\\",\\"parseStatus\\":\\"plain\\"}","valueKind":1,"truncated":false}]'),
('m2','wxid_beta','合成联系人乙',1700086400000,1,'合成朋友圈第二条','','[]'),
('m3','wxid_alpha','合成朋友圈作者甲',1700172800000,1,'合成朋友圈第三条','','[]')])
db.commit();db.close()`;
  await execute('/usr/bin/python3', ['-c', script, directory]);
  return { directory, sourceDatabase: 'moments.db', sourceTable: '__alpha_moments_v1' };
}

// Add a separately opt-in synthetic comment emoji mapping. The mapping is
// deliberately independent from raw XML and must point at a caller-authored
// SHA-256 media-index entry.
export async function installMomentEmojiFixture(directory, accountId = 'moment-account') {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('fixture path invalid');
  const mediaDirectory = path.join(directory, 'media');
  await fs.mkdir(mediaDirectory, { recursive: true, mode: 0o700 });
  const mediaPath = path.join(mediaDirectory, 'moment-emoji.png');
  const bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  await fs.writeFile(mediaPath, bytes, { mode: 0o600 });
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const relativePath = 'media/moment-emoji.png';
  const source = 'emoji-xml:__alpha_moment_emoji_v1:smile';
  const script = String.raw`import sqlite3,sys
root,source,sha256,relative_path,account_id=sys.argv[1:]
db=sqlite3.connect(root+'/moments.db')
db.execute('''CREATE TABLE __alpha_moment_emoji_v1 (
source TEXT NOT NULL,
sha256 TEXT NOT NULL,
size_bytes INTEGER NOT NULL,
mime_type TEXT NOT NULL,
relative_path TEXT NOT NULL,
account_id TEXT NOT NULL DEFAULT '',
moment_id TEXT NOT NULL DEFAULT ''
)''')
db.execute('INSERT INTO __alpha_moment_emoji_v1 VALUES (?,?,?,?,?,?,?)',(source,sha256,12,'image/png',relative_path,account_id,'m1'))
db.commit();db.close()`;
  await execute('/usr/bin/python3', ['-c', script, directory, source, sha256, relativePath, accountId]);
  await fs.writeFile(path.join(directory, 'media-index.v1.json'), JSON.stringify({ version: 1, accountId, entries: [{ kind: 'image', id: sha256, rendition: 'source', relativePath, sha256, sizeBytes: bytes.length, mimeType: 'image/png', accountId }] }) + '\n', { mode: 0o600 });
  return { directory, accountId, source, sha256, relativePath, bytes };
}
