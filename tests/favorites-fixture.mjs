import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';

const execute = promisify(execFile);

// This fixture is deliberately separate from any native WeChat favorites
// database. The bridge accepts it only because the marker table is explicit.
export async function createFavoritesFixture(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('fixture path invalid');
  await fs.mkdir(directory, { recursive: true });
  const script = String.raw`import sqlite3,sys
root=sys.argv[1]
db=sqlite3.connect(root+'/favorite.db')
db.execute('''CREATE TABLE __alpha_favorites_v1 (
id TEXT PRIMARY KEY,
type INTEGER NOT NULL,
updated_at_unix_ms INTEGER NOT NULL,
title TEXT NOT NULL DEFAULT '',
description TEXT NOT NULL DEFAULT '',
source_id TEXT NOT NULL DEFAULT '',
from_username TEXT NOT NULL DEFAULT '',
content_xml TEXT NOT NULL DEFAULT '',
fields_json TEXT NOT NULL DEFAULT '[]',
tags_json TEXT NOT NULL DEFAULT '[]'
)''')
db.executemany('INSERT INTO __alpha_favorites_v1 VALUES (?,?,?,?,?,?,?,?,?,?)', [
('f1',1,1700000000000,'第一收藏','一段说明','source-1','wxid_alpha','<msg>第一收藏</msg>','[{"name":"kind","value":"text","valueKind":1,"truncated":false}]','[{"id":"7","name":"工作"}]'),
('f2',2,1700086400000,'第二收藏','包含关键字','source-2','wxid_beta','<msg>第二收藏</msg>','[]','[{"id":"7","name":"工作"},{"id":"8","name":"稍后"}]'),
('f3',1,1700172800000,'第三收藏','','source-3','wxid_alpha','','[]','[{"id":"8","name":"稍后"}]')])
db.commit();db.close()`;
  await execute('/usr/bin/python3', ['-c', script, directory]);
  return { directory, accountId: 'favorites-account' };
}

// Add the explicit synthetic favorites schema to an already-created offline
// dataset so the desktop smoke can exercise capability-gated UI behavior.
export async function installFavoritesFixture(directory) {
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory) throw new Error('fixture path invalid');
  const script = String.raw`import sqlite3,sys
root=sys.argv[1]
db=sqlite3.connect(root+'/favorite.db')
db.execute('''CREATE TABLE __alpha_favorites_v1 (
id TEXT PRIMARY KEY,
type INTEGER NOT NULL,
updated_at_unix_ms INTEGER NOT NULL,
title TEXT NOT NULL DEFAULT '',
description TEXT NOT NULL DEFAULT '',
source_id TEXT NOT NULL DEFAULT '',
from_username TEXT NOT NULL DEFAULT '',
content_xml TEXT NOT NULL DEFAULT '',
fields_json TEXT NOT NULL DEFAULT '[]',
tags_json TEXT NOT NULL DEFAULT '[]'
)''')
db.executemany('INSERT INTO __alpha_favorites_v1 VALUES (?,?,?,?,?,?,?,?,?,?)', [
('f1',1,1700000000000,'合成第一收藏','一段说明','source-1','wxid_alpha','<msg>合成第一收藏</msg>','[{"name":"kind","value":"text","valueKind":1,"truncated":false}]','[{"id":"7","name":"工作"}]'),
('f2',2,1700086400000,'合成第二收藏','包含关键字','source-2','wxid_beta','<msg>合成第二收藏</msg>','[]','[{"id":"7","name":"工作"}]')])
db.commit();db.close()`;
  await execute('/usr/bin/python3', ['-c', script, directory]);
  return { directory, sourceDatabase: 'favorite.db', sourceTable: '__alpha_favorites_v1' };
}

// Independent-only fixture with a declared favorite media-slot table and a
// content-addressed media index. It carries no claim about native WeChat
// favorite schemas or media tokens.
export async function createFavoritesMediaFixture(directory) {
  const fixture = await createFavoritesFixture(directory);
  const script = String.raw`import sqlite3,sys
root=sys.argv[1]
db=sqlite3.connect(root+'/favorite.db')
db.execute('''CREATE TABLE __alpha_favorite_media_v1 (
favorite_id TEXT NOT NULL,
item_index INTEGER NOT NULL,
role TEXT NOT NULL,
token TEXT NOT NULL UNIQUE,
PRIMARY KEY (favorite_id,item_index,role)
)''')
db.execute("INSERT INTO __alpha_favorite_media_v1 VALUES (?,?,?,?)", ('f1',0,'source','fav1_0123456789abcdef0123456789abcdef'))
db.commit();db.close()`;
  await execute('/usr/bin/python3', ['-c', script, directory]);
  const mediaDirectory = path.join(directory, 'media');
  await fs.mkdir(mediaDirectory, { recursive: true, mode: 0o700 });
  const mediaPath = path.join(mediaDirectory, 'favorite-image.bin');
  const media = Buffer.from('synthetic favorite media bytes\n', 'utf8');
  await fs.writeFile(mediaPath, media, { mode: 0o600 });
  const sha256 = crypto.createHash('sha256').update(media).digest('hex');
  await fs.writeFile(path.join(directory, 'media-index.v1.json'), JSON.stringify({
    version: 1,
    accountId: fixture.accountId,
    entries: [{ kind: 'image', id: 'fav1_0123456789abcdef0123456789abcdef', rendition: 'source', relativePath: 'media/favorite-image.bin', sha256, sizeBytes: media.length, mimeType: 'image/png' }]
  }) + '\n', { mode: 0o600 });
  return { ...fixture, mediaToken: 'fav1_0123456789abcdef0123456789abcdef', media, sha256 };
}
