#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const preview = path.join(root, 'scripts/chatlog-candidate-preview.mjs');
const defaultBinary = path.join(root, 'build/candidates/chatlog');
const pythonFixture = String.raw`
import hashlib, os, sqlite3, sys
root = sys.argv[1]

def connect(name):
    return sqlite3.connect(os.path.join(root, name))

db = connect('contact.db')
db.execute('CREATE TABLE contact(id INTEGER PRIMARY KEY, username TEXT, local_type INTEGER, alias TEXT, encrypt_username TEXT, flag INTEGER, delete_flag INTEGER, verify_flag INTEGER, remark TEXT, remark_quan_pin TEXT, remark_pin_yin_initial TEXT, nick_name TEXT, pin_yin_initial TEXT, quan_pin TEXT, big_head_url TEXT, small_head_url TEXT, head_img_md5 TEXT, chat_room_notify INTEGER, is_in_chat_room INTEGER, description TEXT, extra_buffer BLOB, chat_room_type INTEGER)')
db.execute('INSERT INTO contact(username, local_type, alias, remark, nick_name) VALUES (?, ?, ?, ?, ?)', ('wxid_candidate_fixture', 1, 'candidate_alias', 'Candidate Remark', 'Candidate Nick'))
db.commit(); db.close()

db = connect('session.db')
db.execute('CREATE TABLE SessionTable(username TEXT PRIMARY KEY, type INTEGER, unread_count INTEGER, unread_first_msg_srv_id INTEGER, is_hidden INTEGER, summary TEXT, draft TEXT, status INTEGER, last_timestamp INTEGER, sort_timestamp INTEGER, last_clear_unread_timestamp INTEGER, last_msg_locald_id INTEGER, last_msg_type INTEGER, last_msg_sub_type INTEGER, last_msg_sender TEXT, last_sender_display_name TEXT, last_msg_ext_type INTEGER)')
db.execute('INSERT INTO SessionTable VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ('wxid_candidate_fixture', 1, 0, 0, 0, 'candidate hello', '', 0, 1756224000, 1756224000, 0, 1, 1, 0, 'wxid_candidate_fixture', 'Candidate Nick', 0))
db.commit(); db.close()

db = connect('message_0.db')
db.execute('CREATE TABLE Timestamp(timestamp INTEGER)')
db.execute('INSERT INTO Timestamp VALUES (?)', (1756224000,))
db.execute('CREATE TABLE Name2Id(user_name TEXT)')
db.execute('INSERT INTO Name2Id(rowid, user_name) VALUES (?, ?)', (1, 'wxid_candidate_fixture'))
talker = 'wxid_candidate_fixture'
table = 'Msg_' + hashlib.md5(talker.encode()).hexdigest()
db.execute(f'CREATE TABLE {table}(local_id INTEGER PRIMARY KEY AUTOINCREMENT, server_id INTEGER, local_type INTEGER, sort_seq INTEGER, real_sender_id INTEGER, create_time INTEGER, status INTEGER, upload_status INTEGER, download_status INTEGER, server_seq INTEGER, origin_source INTEGER, source TEXT, message_content TEXT, compress_content TEXT, packed_info_data BLOB, WCDB_CT_message_content INTEGER DEFAULT NULL, WCDB_CT_source INTEGER DEFAULT NULL)')
db.execute(f'INSERT INTO {table}(server_id, local_type, sort_seq, real_sender_id, create_time, status, message_content, packed_info_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (42, 1, 1756224000001, 1, 1756224000, 2, 'candidate hello', b''))
db.commit(); db.close()
`;

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--binary' || typeof argv[index + 1] !== 'string' || argv[index + 1].startsWith('--') || values.binary) throw new Error('USAGE: --binary /absolute/build/candidates/chatlog');
    values.binary = path.resolve(argv[++index]);
  }
  return values;
}

async function sha256(filename) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of (await import('node:fs')).createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

async function runPreview(binary, workDir, kind, extra = {}) {
  const args = [preview, '--binary', binary, '--work-dir', workDir, '--kind', kind];
  for (const [key, value] of Object.entries(extra)) args.push(`--${key}`, String(value));
  const result = await execFileAsync(process.execPath, args, { cwd: root, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(result.stdout);
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
  const binary = options.binary || defaultBinary;
  let stat;
  try { stat = await fs.stat(binary); } catch (error) {
    if (error.code === 'ENOENT') {
      process.stdout.write(`${JSON.stringify({ schema: 'alpha-independent-chatlog-candidate-real-smoke.v1', status: 'SKIPPED', reason: 'CHATLOG_CANDIDATE_BINARY_MISSING', binary })}\n`);
      process.exit(0);
    }
    throw error;
  }
  if (!stat.isFile() || (stat.mode & 0o111) === 0) throw new Error('CHATLOG_CANDIDATE_BINARY_INVALID');
  const tempRoot = await fs.realpath(os.tmpdir());
  const workDir = await fs.mkdtemp(path.join(tempRoot, 'alpha-chatlog-candidate-real-'));
  try {
    await execFileAsync('/usr/bin/python3', ['-c', pythonFixture, workDir], { cwd: root, maxBuffer: 1024 * 1024 });
    const contacts = await runPreview(binary, workDir, 'contacts', { limit: 10 });
    const sessions = await runPreview(binary, workDir, 'sessions', { limit: 10 });
    const messages = await runPreview(binary, workDir, 'messages', { talker: 'wxid_candidate_fixture', time: '2025-08-27', limit: 10 });
    for (const value of [contacts, sessions, messages]) {
      if (value.candidate !== true || value.complete !== false || value.native_schema_supported !== false) throw new Error('CHATLOG_CANDIDATE_BOUNDARY_INVALID');
    }
    if (contacts.contacts?.[0]?.username !== 'wxid_candidate_fixture' || sessions.sessions?.[0]?.username !== 'wxid_candidate_fixture' || messages.items?.[0]?.text !== 'candidate hello') throw new Error('CHATLOG_CANDIDATE_FIXTURE_MISMATCH');
    process.stdout.write(`${JSON.stringify({ schema: 'alpha-independent-chatlog-candidate-real-smoke.v1', status: 'passed', binary, binarySha256: await sha256(binary), binaryBytes: stat.size, fixture: 'synthetic-v4-sqlite', reads: { contacts: contacts.contacts.length, sessions: sessions.sessions.length, messages: messages.items.length }, candidate: true, complete: false, nativeSchemaSupported: false, realData: false })}\n`);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
} catch (error) {
  process.stderr.write(`${error?.message || 'CHATLOG_CANDIDATE_REAL_SMOKE_FAILED'}\n`);
  process.exitCode = 2;
}
