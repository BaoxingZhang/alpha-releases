import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createGroupMembersFixture } from './group-members-fixture.mjs';

const require = createRequire(import.meta.url);
const { EngineClientFrame, EngineServerFrame } = require('../packages/alpha-protocol/index.cjs');
const { createEngine, SUPPORTED } = require('../packages/alpha-engine/index.cjs');
const { createSecurity } = require('../packages/alpha-security/index.cjs');
const root = fileURLToPath(new URL('../', import.meta.url));
const bridgePath = path.join(root, 'build/candidates/alpha-data-bridge');

test('v4 chat_room RoomData reaches the recovered listGroupMembers wire shape', async t => {
  const directory = await fs.mkdtemp(path.join(root, '.runtime/engine-groups-'));
  const fixture = await createGroupMembersFixture(path.join(directory, 'data'));
  const stateDir = path.join(directory, 'state');
  await fs.mkdir(stateDir, { mode: 0o700 });
  const lock = await createSecurity({ stateDir });
  const engine = await createEngine({ lock, stateDir, bridgePath, dataDir: fixture.directory, accountId: fixture.accountId, selfUsername: fixture.selfUsername });
  t.after(async () => { await engine.close(); await fs.rm(directory, { recursive: true, force: true }); });
  let requestId = 0n;
  const call = async (method, payload = {}) => {
    const request = EngineClientFrame.fromPartial({ requestId: ++requestId, [method]: payload });
    const reply = await engine.dispatch(EngineClientFrame.decode(EngineClientFrame.encode(request).finish()));
    return EngineServerFrame.decode(EngineServerFrame.encode(reply).finish());
  };
  const hello = (await call('hello', { protocol: { major: 1, minor: 0 } })).hello;
  assert.ok(hello.supportedMethodIds.includes(SUPPORTED.listGeneral));
  const accounts = (await call('listAccounts')).listAccounts.accounts[0];
  assert.ok(accounts.capabilities.includes('group-members'));
  const page = (await call('listGeneral', { accountId: fixture.accountId, tableName: '__alpha_group_members', query: fixture.chatroomId, limit: 1000, offset: 0, ascending: true })).listGeneral.response;
  assert.equal(page.sourceDatabase, 'contact/contact.db');
  assert.deepEqual(page.items.map(item => item.actor), ['wxid_alpha', 'wxid_beta']);
  assert.equal(page.items[0].fields.find(field => field.name === 'groupNickname').value, '群主显示名');
  assert.equal(page.items[0].fields.find(field => field.name === 'isOwner').value, 'true');
  assert.equal(page.items[1].fields.find(field => field.name === 'isOwner').value, 'false');
  assert.equal(page.items[0].fields.find(field => field.name === 'nickname').value, 'Alpha');
  const profile = (await call('getContactProfile', { accountId: fixture.accountId, username: fixture.chatroomId, commonGroupLimit: 20 })).getContactProfile.response;
  assert.equal(profile.found, true);
  assert.equal(profile.profile.username, fixture.chatroomId);
  assert.equal(profile.profile.memberCount, 2);
  assert.equal(profile.profile.ownerUsername, fixture.ownerId);
  assert.equal(profile.profile.announcement, '');
  assert.deepEqual(profile.profile.commonGroups, []);
  const complete = (await call('getContactProfile', { accountId: fixture.accountId, username: fixture.ownerId, commonGroupLimit: 20 })).getContactProfile.response;
  assert.equal(complete.profile.commonGroupCount, 2);
  assert.equal(complete.profile.commonGroups.length, 2);
  assert.equal(complete.profile.commonGroupsTruncated, false);
  assert.equal(complete.profile.commonGroups[0].username, 'room2@chatroom');
  assert.equal(complete.profile.commonGroups[0].displayName, 'room2@chatroom');
  assert.equal(complete.profile.commonGroups[1].username, fixture.chatroomId);
  assert.equal(complete.profile.commonGroups[1].displayName, '合成群聊');
  const limited = (await call('getContactProfile', { accountId: fixture.accountId, username: fixture.ownerId, commonGroupLimit: 1 })).getContactProfile.response;
  assert.equal(limited.profile.commonGroupCount, 2);
  assert.equal(limited.profile.commonGroups.length, 1);
  assert.equal(limited.profile.commonGroupsTruncated, true);
  const missingProfile = (await call('getContactProfile', { accountId: fixture.accountId, username: 'missing@chatroom', commonGroupLimit: 0 })).getContactProfile.response;
  assert.equal(missingProfile.found, false);
  const bad = await call('listGeneral', { accountId: fixture.accountId, tableName: '__alpha_group_members', query: fixture.chatroomId, limit: 1, offset: 0, ascending: false });
  assert.equal(bad.error.code, 'GROUP_MEMBERS_REQUEST_INVALID');
  for (const format of ['csv', 'json', 'html', 'xlsx']) {
    const destinationPath = path.join(directory, `members.${format}`);
    const response = await call('exportGroupMembers', {
      accountId: fixture.accountId,
      chatroomId: fixture.chatroomId,
      format,
      destinationPath,
      utcOffsetMinutes: 480
    });
    assert.equal(response.error, undefined, response.error?.code);
    assert.deepEqual(response.exportGroupMembers, { destinationPath, format, memberCount: 2 });
    const output = await fs.readFile(destinationPath);
    if (format === 'xlsx') {
      assert.equal(output.subarray(0, 2).toString('hex'), '504b');
      assert.ok(output.includes(Buffer.from('xl/worksheets/sheet1.xml')));
      assert.ok(output.includes(Buffer.from('wxid_alpha')));
    } else {
      const text = output.toString('utf8');
      assert.match(text, /wxid_alpha/);
      assert.match(text, /wxid_beta/);
    }
  }
  const unsupported = await call('exportGroupMembers', {
    accountId: fixture.accountId,
    chatroomId: fixture.chatroomId,
    format: 'txt',
    destinationPath: path.join(directory, 'members.txt'),
    utcOffsetMinutes: 0
  });
  assert.equal(unsupported.error.code, 'EXPORT_FORMAT_UNSUPPORTED');
});
