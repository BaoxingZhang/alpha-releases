"""Augment the ordinary synthetic SQLite fixture with media/display rows."""
import argparse
import hashlib
import sqlite3
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
root = Path(parser.parse_args().output)
if not root.is_absolute() or not root.exists() or root.is_symlink():
    raise SystemExit('output must be an existing absolute fixture directory')

def table_for(conversation):
    return 'Msg_' + hashlib.md5(conversation.encode()).hexdigest()

def ensure_table(db, conversation):
    table = table_for(conversation)
    db.execute(f'''CREATE TABLE IF NOT EXISTS "{table}" (
        local_id INTEGER PRIMARY KEY, server_id INTEGER, sort_seq INTEGER,
        local_type INTEGER, create_time INTEGER, real_sender_id INTEGER,
        status INTEGER, message_content BLOB, packed_info_data BLOB)''')
    return table

alpha_link = '<msg><appmsg><type>5</type><title>Alpha link</title><des>link metadata</des><url>https://example.com/alpha</url></appmsg></msg>'
alpha_file = '<msg><appmsg><type>6</type><title>alpha-report.pdf</title><des>file metadata</des><appattach><totallen>42</totallen><fileext>pdf</fileext></appattach></appmsg></msg>'

with sqlite3.connect(root / 'message/message_0.db') as db:
    alpha = ensure_table(db, 'wxid_alpha')
    beta = ensure_table(db, 'wxid_beta')
    db.executemany(f'INSERT INTO "{alpha}" VALUES (?,?,?,?,?,?,?,?,?)', [
        (10, 10010, 400, 3, 1700000005, 2, 2, b'<img md5="11111111111111111111111111111111"/>', b''),
        (11, 10011, 401, 34, 1700000006, 1, 4, b'\x00\xffvoice', b''),
        (12, 10012, 402, 43, 1700000007, 2, 2, b'<videomsg cdnurl="https://cdn.example/alpha.mp4"/>', b''),
        (13, 10013, 403, 47, 1700000008, 1, 4, b'sticker-payload', b''),
        (14, 10014, 404, 21474836529, 1700000009, 2, 2, alpha_link.encode(), b''),
        (15, 10015, 405, 25769803825, 1700000010, 1, 4, alpha_file.encode(), b''),
        (16, 10016, 406, 3, 0, 2, 2, b'<img md5="22222222222222222222222222222222"/>', b''),
    ])
    db.executemany(f'INSERT INTO "{beta}" VALUES (?,?,?,?,?,?,?,?,?)', [
        (10, 20010, 100, 3, 1700000011, 1, 4, b'<img md5="33333333333333333333333333333333"/>', b''),
        (11, 20011, 101, 43, 1700000012, 2, 2, b'<videomsg cdnurl="https://cdn.example/beta.mp4"/>', b''),
    ])
    db.commit()

with sqlite3.connect(root / 'message/message_1.db') as db:
    gamma = ensure_table(db, 'wxid_gamma')
    db.executemany(f'INSERT INTO "{gamma}" VALUES (?,?,?,?,?,?,?,?,?)', [
        (10, 30010, 100, 34, 1700000013, 1, 4, b'\x00\xffgamma-voice', b''),
    ])
    db.commit()

with sqlite3.connect(root / 'session/session.db') as db:
    db.execute('INSERT INTO SessionTable VALUES (?,?,?,?,?,?)', ('wxid_gamma', 'synthetic gamma', 1700000013, 1700000013, 'wxid_self', 'Self'))
    db.commit()
