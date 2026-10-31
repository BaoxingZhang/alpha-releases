"""Create only artificial SQLite data in an explicitly supplied new/empty directory."""
import argparse
import hashlib
import json
from pathlib import Path
import sqlite3

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args()
root = Path(args.output)
if not root.is_absolute() or '..' in root.parts or root.is_symlink():
    raise SystemExit('output must be an explicit absolute non-symlink directory')
if root.exists() and any(root.iterdir()):
    raise SystemExit('refusing to overwrite an existing nonempty fixture directory')
root.mkdir(parents=True, exist_ok=True)

def database(relative):
    target = root / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(target)

with database('contact/contact.db') as db:
    db.execute('CREATE TABLE contact (username TEXT, local_type INTEGER, alias TEXT, remark TEXT, nick_name TEXT)')
    db.executemany('INSERT INTO contact VALUES (?,?,?,?,?)', [
        ('wxid_self', 1, 'self', '自己', 'Self'),
        ('wxid_beta', 1, 'beta', '', 'Beta'),
        ('wxid_alpha', 1, 'alpha', '合成联系人甲', 'Alpha'),
    ])
db.close()
with database('session/session.db') as db:
    db.execute('CREATE TABLE SessionTable (username TEXT, summary TEXT, last_timestamp INTEGER, sort_timestamp INTEGER, last_msg_sender TEXT, last_sender_display_name TEXT)')
    db.executemany('INSERT INTO SessionTable VALUES (?,?,?,?,?,?)', [
        ('wxid_beta', 'synthetic beta', 1700000004, 1700000004, 'wxid_self', 'Self'),
        ('wxid_alpha', 'synthetic alpha', 1700000004, 1700000004, 'wxid_alpha', 'Alpha'),
    ])
db.close()
table = 'Msg_' + hashlib.md5(b'wxid_alpha').hexdigest()
rows = [
    [(9007199254740993, 9223372036854775807, 100, 1, 1700000000, 1, 4, 'first source', b'\x00\xff'),
     (2, 9007199254740995, 200, 1, 1700000001, 2, 2, 'second source', b''),
     (3, 0, 200, 1, 1700000002, 1, 4, 'same sequence', b'')],
    [(1, 9007199254740997, 50, 1, 1699999999, 1, 4, 'earlier shard', b''),
     (4, 9007199254740999, 200, 1, 1700000003, 1, 4, 'cross shard tie', b''),
     (5, 9007199254741001, 300, 49, 1700000004, 2, 2, b'\x28\xb5\x2f\xfd\x00', b'\xff')]
]
for shard, records in enumerate(rows):
    with database(f'message/message_{shard}.db') as db:
        db.execute('CREATE TABLE Name2Id (user_name TEXT)')
        db.executemany('INSERT INTO Name2Id VALUES (?)', [('wxid_alpha',), ('wxid_self',)])
        db.execute(f'CREATE TABLE "{table}" (local_id INTEGER PRIMARY KEY, server_id INTEGER, sort_seq INTEGER, local_type INTEGER, create_time INTEGER, real_sender_id INTEGER, status INTEGER, message_content BLOB, packed_info_data BLOB)')
        db.executemany(f'INSERT INTO "{table}" VALUES (?,?,?,?,?,?,?,?,?)', records)
    db.close()
print(json.dumps({'directory': str(root), 'accountId': 'synthetic-account', 'conversationId': 'wxid_alpha', 'selfUsername': 'wxid_self', 'messageCount': 6, 'table': table}))
