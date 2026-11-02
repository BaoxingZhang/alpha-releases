import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { root, launchEnvironment, sandboxProfile } from '../scripts/environment.mjs';
import { createFixture } from './data-bridge-fixture.mjs';
import { installMomentsFixture, installMomentEmojiFixture } from './moments-fixture.mjs';
import { installFavoritesFixture } from './favorites-fixture.mjs';
const session = `independent-smoke-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
fs.mkdirSync(runtime, { recursive: true });
const fixture = await createFixture(path.join(runtime, 'fixture'));
await installMomentsFixture(fixture.directory);
await installFavoritesFixture(fixture.directory);

// Add one explicitly synthetic, content-addressed PNG to this packaged smoke
// fixture. The bridge derives the image id from the message XML; the manifest
// binds that id to the exact message identity, so the renderer must obtain the
// bytes through the same grant + hash checked IPC path used by a real image.
const imageId = '0123456789abcdef0123456789abcdef';
const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const imageRelativePath = 'media/independent-smoke.png';
fs.mkdirSync(path.join(fixture.directory, 'media'), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(fixture.directory, imageRelativePath), imageBytes, { mode: 0o600 });
const messageTable = 'Msg_' + crypto.createHash('md5').update(fixture.conversationId).digest('hex');
const messageDatabase = path.join(fixture.directory, 'message', 'message_0.db');
{
  const db = new DatabaseSync(messageDatabase);
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    6, 400, 400, 3, 1700000005, 1, 1, `<msg md5="${imageId}"/> image source`, Buffer.alloc(0)
  );
  db.close();
}
const imageMessageId = `msg-${crypto.createHash('sha256').update(JSON.stringify({
  accountId: fixture.accountId,
  database: 'message/message_0.db',
  table: messageTable,
  localId: '6'
})).digest('hex')}`;
fixture.messageCount += 1;
const imageSha256 = crypto.createHash('sha256').update(imageBytes).digest('hex');
const fileBytes = Buffer.from('synthetic attachment bytes\n', 'utf8');
const fileId = crypto.createHash('sha256').update(fileBytes).digest('hex');
const fileRelativePath = `media/files/${fileId}.zip`;
fs.mkdirSync(path.dirname(path.join(fixture.directory, fileRelativePath)), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(fixture.directory, fileRelativePath), fileBytes, { mode: 0o600 });
const voiceBytes = Buffer.alloc(46);
voiceBytes.write('RIFF', 0, 'ascii');
voiceBytes.writeUInt32LE(voiceBytes.length - 8, 4);
voiceBytes.write('WAVE', 8, 'ascii');
voiceBytes.write('fmt ', 12, 'ascii');
voiceBytes.writeUInt32LE(16, 16);
voiceBytes.writeUInt16LE(1, 20);
voiceBytes.writeUInt16LE(1, 22);
voiceBytes.writeUInt32LE(8000, 24);
voiceBytes.writeUInt32LE(16000, 28);
voiceBytes.writeUInt16LE(2, 32);
voiceBytes.writeUInt16LE(16, 34);
voiceBytes.write('data', 36, 'ascii');
voiceBytes.writeUInt32LE(2, 40);
voiceBytes.writeUInt16LE(0, 44);
const voiceId = crypto.createHash('sha256').update(voiceBytes).digest('hex');
const voiceRelativePath = `media/voice/${voiceId}.wav`;
fs.mkdirSync(path.dirname(path.join(fixture.directory, voiceRelativePath)), { recursive: true, mode: 0o700 });
fs.writeFileSync(path.join(fixture.directory, voiceRelativePath), voiceBytes, { mode: 0o600 });
{
  const db = new DatabaseSync(messageDatabase);
  db.exec(`CREATE TABLE "__alpha_voice_playback_v1" (media_id TEXT PRIMARY KEY, wav_media_id TEXT NOT NULL)`);
  db.prepare(`INSERT INTO "__alpha_voice_playback_v1" (media_id, wav_media_id) VALUES (?, ?)`)
    .run(voiceId, voiceId);
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    7, 401, 401, 34, 1700000006, 1, 1, `<msg sha256="${voiceId}"/> voice source`, Buffer.alloc(0)
  );
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    8, 402, 402, 25769803825, 1700000007, 1, 1, `<msg sha256="${fileId}"><appmsg><type>6</type><title>archive.zip</title><appattach><totallen>${fileBytes.length}</totallen><fileext>zip</fileext></appattach></appmsg></msg>`, Buffer.alloc(0)
  );
  db.close();
}
fixture.messageCount += 2;
const fileMessageId = `msg-${crypto.createHash('sha256').update(JSON.stringify({
  accountId: fixture.accountId,
  database: 'message/message_0.db',
  table: messageTable,
  localId: '8'
})).digest('hex')}`;
fs.writeFileSync(path.join(fixture.directory, 'media-index.v1.json'), JSON.stringify({
  version: 1,
  accountId: fixture.accountId,
  entries: [{
    kind: 'image',
    id: imageId,
    rendition: 'source',
    relativePath: imageRelativePath,
    sha256: imageSha256,
    sizeBytes: imageBytes.length,
    mimeType: 'image/png',
    accountId: fixture.accountId,
    conversationId: fixture.conversationId,
    messageId: imageMessageId,
    sentAtUnixMs: '1700000005000'
  }, {
    kind: 'file',
    id: fileId,
    rendition: 'source',
    relativePath: fileRelativePath,
    sha256: fileId,
    sizeBytes: fileBytes.length,
    mimeType: 'application/zip',
    accountId: fixture.accountId,
    conversationId: fixture.conversationId,
    messageId: fileMessageId
  }, {
    kind: 'voice',
    id: voiceId,
    rendition: 'wav',
    relativePath: voiceRelativePath,
    sha256: voiceId,
    sizeBytes: voiceBytes.length,
    mimeType: 'audio/wav',
    accountId: fixture.accountId
  }]
}, null, 2) + '\n', { mode: 0o600 });
await installMomentEmojiFixture(fixture.directory, fixture.accountId);
const quote = x => "'" + x.replaceAll("'", "'\\''") + "'";
const wrapper = path.join(runtime, 'electron-sandbox.sh');
fs.writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(sandboxProfile())} ${quote(electronPath)} "$@"\n`, { mode: 0o755 });
function snapshot(directory) {
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter(x => x.isFile()).map(x => {
    const file = path.join(x.parentPath, x.name);
    return [path.relative(directory, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
  }));
}
const before = snapshot(fixture.directory);
function descendants(pid) {
  const children = spawnSync('/usr/bin/pgrep', ['-P', String(pid)], { encoding: 'utf8' }).stdout.trim().split(/\s+/).filter(x => /^\d+$/.test(x)).map(Number);
  return children.flatMap(child => [{ pid: child, executable: spawnSync('/bin/ps', ['-p', String(child), '-o', 'comm='], { encoding: 'utf8' }).stdout.trim() }, ...descendants(child)]);
}
const report = { testedAt: new Date().toISOString(), session, fixture, realUserDataAccessed: false, checks: {}, rendererErrors: [], logs: [] };
let app, page;
try {
  app = await electron.launch({ executablePath: wrapper, args: ['--no-sandbox', path.join(root, 'dist/app')], cwd: root, env: launchEnvironment(session, { backend: 'independent', dataDir: fixture.directory, accountId: fixture.accountId }), timeout: 45000 });
  app.process().stdout?.on('data', x => report.logs.push(x.toString()));
  app.process().stderr?.on('data', x => report.logs.push(x.toString()));
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    page = app.windows().find(p => p.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(page, 'Main renderer must open');
  page.on('pageerror', e => report.rendererErrors.push(e.message));
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20);
  report.backend = await page.evaluate(() => window.alpha.system.getBackendStatus());
  assert.equal(report.backend.state, 'ready');
  assert.ok(report.backend.components.some(c => c.component === 'alpha-independent-engine'));
  report.checks.independentBackendReady = true;
  report.accounts = await page.evaluate(() => window.alpha.accounts.list());
  assert.equal(report.accounts.length, 1);
  assert.equal(report.accounts[0].id, fixture.accountId);
  assert.equal(report.accounts[0].handleState, 'open');
  report.capabilities = await page.evaluate(() => window.alpha.license.capabilities());
  assert.equal(report.capabilities, null, 'No original entitlement is forged');
  const read = await page.evaluate(async ({ accountId, conversationId }) => {
    const messages = await window.alpha.messages.list(accountId, conversationId, 100, true);
    const sourceMessage = messages.find(message => message.text === 'first source');
    const source = sourceMessage ? await window.alpha.messages.source(accountId, {
      conversationId: sourceMessage.conversationId,
      messageId: sourceMessage.id,
      sourceToken: sourceMessage.sourceToken,
      sentAtUnixMs: sourceMessage.sentAtUnixMs
    }) : null;
    return {
      contacts: await window.alpha.data.contacts(accountId, '', 100, 0),
      conversations: await window.alpha.conversations.list(accountId, 100),
      messages,
      sourceMessage,
      source
    };
  }, fixture);
  report.read = read;
  assert.ok(JSON.stringify(read.contacts).includes('合成联系人甲'));
  assert.ok(JSON.stringify(read.messages).includes('first source'));
  assert.match(read.sourceMessage?.sourceToken ?? '', /^independent1_[A-Za-z0-9_-]+$/);
  assert.deepEqual(read.source, { text: 'first source', format: 'text' });
  const imageMessage = read.messages.find(message => message.text.includes('image source'));
  assert.equal(imageMessage?.id, imageMessageId);
  assert.equal(imageMessage?.refs?.[0]?.uri, `alpha-media://sha256/${imageSha256}`);
  const voiceMessage = read.messages.find(message => message.text.includes('voice source'));
  assert.equal(voiceMessage?.refs?.[0]?.uri, `alpha-media://sha256/${voiceId}`);
  assert.equal(voiceMessage?.refs?.[0]?.rendition, 'wav');
  const fileMessage = read.messages.find(message => message.display?.fileName === 'archive.zip');
  assert.equal(fileMessage?.id, fileMessageId);
  assert.equal(fileMessage?.display?.kind, 'file');
  assert.equal(fileMessage?.refs?.[0]?.uri, `alpha-media://sha256/${fileId}`);
  assert.equal(fileMessage?.refs?.[0]?.kind, 'file');
  report.checks.realSqliteThroughDesktopIpc = true;
  report.checks.independentMessageSourceThroughRendererIpc = true;
  // Exercise the real renderer -> preload -> main IPC path for the recovered
  // directory/profile APIs. The fixture is synthetic and has no real WeChat
  // directory or credentials.
  report.contacts = await page.evaluate(async ({ accountId }) => {
    const directory = await window.alpha.data.contactDirectory(accountId, { query: '', categories: [], limit: 100, offset: 0 });
    const profile = await window.alpha.data.contactProfile(accountId, 'wxid_alpha');
    return { directory, profile };
  }, fixture);
  assert.equal(report.contacts.directory.total, 3);
  assert.equal(report.contacts.directory.items[0].username, 'wxid_alpha');
  assert.equal(report.contacts.directory.items[0].category, 'friend');
  assert.equal(report.contacts.directory.counts.friend, 3);
  assert.equal(report.contacts.profile?.username, 'wxid_alpha');
  assert.equal(report.contacts.profile?.gender, 0);
  report.checks.contactDirectoryAndProfileThroughRendererIpc = true;
  report.ownedChildProcesses = descendants(app.process().pid);
  assert.ok(report.ownedChildProcesses.some(x => x.executable.endsWith('/alpha-data-bridge')));
  assert.equal(report.ownedChildProcesses.some(x => /\/(?:vendor\/runtime|build\/runtime-bundle)\/bin\/alpha-/.test(x.executable)), false);
  report.checks.noOriginalAlphaChildObserved = true;
  // Walk the actual onboarding controls; no localStorage or query-cache injection.
  await page.getByText('已明确绑定索引的图片预览已可用', { exact: false }).waitFor({ timeout: 15000 });
  report.checks.independentOnboardingMediaBoundaryShown = true;
  await page.getByRole('checkbox', { name: '我已了解，开始连接本地数据' }).click();
  const connect = page.locator('.setup-footer').getByRole('button', { name: '打开数据副本', exact: true });
  await connect.click({ timeout: 20000 });
  await page.locator('.setup-footer').getByRole('button', { name: '暂时跳过', exact: true }).click({ timeout: 20000 });
  await page.locator('.setup-footer').getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '进入 Alpha', exact: true }).click();
  await page.locator('main[data-surface="workspace"]').waitFor();
  report.checks.originalOnboardingCompleted = true;
  await page.getByText('合成联系人甲', { exact: true }).first().click({ timeout: 15000 });
  await page.getByText('first source', { exact: true }).first().waitFor({ timeout: 15000 });
  // Media IPC requires the selected account proof established by onboarding.
  // The earlier listMessages call only checks metadata and intentionally does
  // not imply a byte-read grant.
  report.image = await page.evaluate(async ({ accountId, opaqueId }) => window.alpha.media.readImage(accountId, opaqueId), {
    accountId: fixture.accountId,
    opaqueId: imageSha256
  });
  assert.deepEqual(report.image, { mimeType: 'image/png', dataBase64: imageBytes.toString('base64') });
  report.checks.independentImageReadThroughRendererIpc = true;
  await page.locator('.message-media img').first().waitFor({ timeout: 15000 });
  const renderedImage = page.locator('.message-media img').first();
  assert.match(await renderedImage.getAttribute('src'), /^alpha-media:\/\/img\//);
  assert.equal(await renderedImage.evaluate((image) => image.complete && image.naturalWidth > 0), true);
  report.checks.independentImagePreviewRendered = true;
  report.voice = await page.evaluate(async ({ accountId, opaqueId }) => window.alpha.media.readPlayback(accountId, opaqueId), {
    accountId: fixture.accountId,
    opaqueId: voiceId
  });
  assert.deepEqual(report.voice, { mimeType: 'audio/wav', dataBase64: voiceBytes.toString('base64') });
  report.checks.independentVoicePlaybackThroughRendererIpc = true;
  report.attachment = await page.evaluate(async ({ accountId, opaqueId }) => window.alpha.media.openAttachment(accountId, opaqueId, 'reveal'), {
    accountId: fixture.accountId,
    opaqueId: fileId
  });
  assert.deepEqual(report.attachment, { fileName: 'archive.zip' });
  const attachmentRoot = path.join(runtime, 'temp', 'alpha-attachment-open');
  const attachmentFiles = fs.readdirSync(attachmentRoot, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name === 'archive.zip')
    .map(entry => path.join(entry.parentPath, entry.name));
  assert.equal(attachmentFiles.length, 1);
  assert.deepEqual(fs.readFileSync(attachmentFiles[0]), fileBytes);
  report.checks.independentFileAttachmentThroughRendererIpc = true;
  report.checks.messageRendered = true;
  await page.getByRole('button', { name: '朋友圈', exact: true }).click({ timeout: 15000 });
  await page.locator('section[aria-label="朋友圈浏览器"]').waitFor({ timeout: 15000 });
  await page.getByText('独立 synthetic-only 朋友圈：仅读取 moments.db 的 __alpha_moments_v1', { exact: false }).waitFor({ timeout: 15000 });
  await page.getByText('合成朋友圈第一条', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('合成朋友圈第二条', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.synthetic-moment-card').count(), 3);
  assert.deepEqual(await page.locator('.synthetic-moment-card').evaluateAll((cards) => cards.map((card) => card.getAttribute('data-source-table'))), ['__alpha_moments_v1', '__alpha_moments_v1', '__alpha_moments_v1']);
  assert.equal(await page.getByRole('button', { name: '导出朋友圈', exact: true }).count(), 0, 'Synthetic moments must not expose export');
  assert.equal(await page.getByRole('button', { name: '朋友圈防删除', exact: true }).count(), 0, 'Synthetic moments must not expose anti-delete writes');
  assert.equal(await page.getByText('合成评论者', { exact: true }).count(), 1, 'Synthetic comment must remain visible');
  const momentEmojiImage = page.locator('.synthetic-moment-card .moment-comment-sticker img').first();
  await momentEmojiImage.waitFor({ timeout: 15000 });
  assert.match(await momentEmojiImage.getAttribute('src'), /^alpha-media:\/\/moment\//);
  assert.equal(await momentEmojiImage.evaluate((image) => image.complete && image.naturalWidth > 0), true, 'Synthetic moment emoji must decode through media IPC');
  assert.equal(await page.locator('.synthetic-moment-card button[aria-label="查看表情"]').count(), 1);
  report.checks.syntheticMomentsRenderedReadOnly = true;
  report.checks.syntheticMomentEmojiRenderedThroughMediaProtocol = true;
  await page.getByRole('button', { name: '收藏', exact: true }).click({ timeout: 15000 });
  await page.locator('section[aria-label="收藏"]').waitFor({ timeout: 15000 });
  await page.getByText('独立 synthetic-only 收藏：仅读取 favorite.db 或 favorites.db 的 __alpha_favorites_v1', { exact: false }).waitFor({ timeout: 15000 });
  await page.getByText('一段说明', { exact: true }).waitFor({ timeout: 15000 });
  await page.getByText('包含关键字', { exact: true }).waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.favorite-card-row').count(), 2);
  assert.equal(await page.getByRole('button', { name: '刷新收藏', exact: true }).count(), 1);
  assert.equal(await page.locator('.favorite-card-row img, .favorite-card-row video, .favorite-card-row audio').count(), 0, 'Synthetic favorites must remain metadata/text-only');
  report.checks.syntheticFavoritesRenderedReadOnly = true;
  // Frame 136 is implemented independently even when the native moments
  // exporter (frame 135) is unavailable. Exercise the actual renderer ->
  // preload -> main -> independent engine path with an empty synthetic
  // candidate table; the resulting JSON is still a truthful zero-row export.
  const recordExportDirectory = path.join(runtime, 'records-export');
  report.recordExport = await page.evaluate(async ({ accountId, outputDirectory }) => {
    const started = await window.alpha.chatExport.startRecords({
      accountId,
      format: 'json',
      outputDirectory,
      categories: [{ category: 'payments' }]
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const job = (await window.alpha.chatExport.list(accountId)).find((item) => item.jobId === started.jobId);
      if (job && ['canceled', 'completed', 'completed_with_errors', 'failed'].includes(job.state)) return job;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error('record export did not finish');
  }, { accountId: fixture.accountId, outputDirectory: recordExportDirectory });
  assert.equal(report.recordExport.kind, 'records');
  assert.equal(report.recordExport.state, 'completed');
  assert.equal(report.recordExport.items.length, 1);
  assert.equal(report.recordExport.items[0].state, 'completed');
  const recordExportPath = report.recordExport.items[0].path;
  assert.ok(recordExportPath && fs.existsSync(recordExportPath));
  const recordExportBody = JSON.parse(fs.readFileSync(recordExportPath, 'utf8'));
  assert.equal(recordExportBody.partial, true);
  assert.equal(recordExportBody.candidate, true);
  assert.deepEqual(recordExportBody.records, []);
  report.checks.independentRecordExportThroughRendererIpc = true;
  await page.getByRole('button', { name: '其他资料', exact: true }).click();
  await page.locator('section[aria-label="其他资料"]').waitFor({ timeout: 15000 });
  for (const label of ['朋友圈互动（暂不可用）', '搜索记录（暂不可用）']) {
    assert.equal(await page.getByRole('tab', { name: label, exact: true }).isDisabled(), true, label);
  }
  for (const label of ['转账与红包', '好友验证', '撤回']) {
    assert.equal(await page.getByRole('tab', { name: label, exact: true }).isDisabled(), false, label);
  }
  await page.getByText('独立离线模式支持好友验证、转账与红包、撤回、通话候选', { exact: false }).waitFor({ timeout: 15000 });
  const recordsExportPopupPromise = page.waitForEvent('popup', { timeout: 15000 });
  await page.getByRole('button', { name: '导出其他资料', exact: true }).click();
  const recordsExportPopup = await recordsExportPopupPromise;
  await recordsExportPopup.locator('.dataset-export-dialog').waitFor({ timeout: 15000 });
  for (const label of ['朋友圈互动（暂不可用）', '搜索记录（暂不可用）']) {
    assert.equal(await recordsExportPopup.getByRole('checkbox', { name: label, exact: true }).isDisabled(), true, label);
  }
  assert.equal(await recordsExportPopup.getByRole('checkbox', { name: '好友验证', exact: true }).isDisabled(), false);
  assert.equal(await recordsExportPopup.getByRole('checkbox', { name: '转账与红包', exact: true }).isDisabled(), false);
  assert.equal(await recordsExportPopup.getByRole('checkbox', { name: '撤回', exact: true }).isDisabled(), false);
  assert.equal(await recordsExportPopup.getByRole('checkbox', { name: '通话记录', exact: true }).isDisabled(), false);
  await recordsExportPopup.locator('.dataset-export-dialog').getByRole('button', { name: '取消', exact: true }).click();
  report.checks.independentRecordCategoriesGated = true;
  await page.getByRole('button', { name: '通讯录', exact: true }).click();
  await page.locator('section[aria-label="通讯录"]').waitFor({ timeout: 15000 });
  const unsupportedPrimary = page.getByRole('button', { name: '公众号（暂不可用）', exact: true });
  assert.equal(await unsupportedPrimary.isDisabled(), true);
  await page.getByRole('combobox', { name: '更多分类', exact: true }).click();
  const unsupportedMore = page.getByRole('option', { name: /企微好友/ }).first();
  assert.equal(await unsupportedMore.getAttribute('aria-disabled'), 'true');
  await page.keyboard.press('Escape');
  await page.getByText('独立离线数据目前只支持好友和群聊', { exact: false }).waitFor({ timeout: 15000 });
  report.checks.independentUnsupportedContactCategoriesGated = true;
  const exportPopupPromise = page.waitForEvent('popup', { timeout: 15000 });
  await page.locator('.contact-export-trigger').click();
  const exportPopup = await exportPopupPromise;
  await exportPopup.locator('.contact-export-dialog').waitFor({ timeout: 15000 });
  assert.equal(await exportPopup.getByRole('radio', { name: /Excel 表格/ }).isDisabled(), false);
  assert.equal(await exportPopup.getByRole('checkbox', { name: /企微好友/ }).isDisabled(), true);
  assert.equal(await exportPopup.getByRole('checkbox', { name: /导出本机已缓存的头像|独立离线导出暂不包含头像/ }).isDisabled(), true);
  await exportPopup.locator('.contact-export-dialog').getByRole('button', { name: '取消', exact: true }).click();
  report.checks.independentContactExportCapabilities = true;
  await page.locator('.contacts-row').filter({ hasText: '合成联系人甲' }).click({ timeout: 15000 });
  await page.locator('.contact-profile[aria-label="联系人 合成联系人甲"]').waitFor({ timeout: 15000 });
  await page.getByText('资料', { exact: true }).waitFor({ timeout: 15000 });
  report.checks.contactDirectoryAndProfileRendered = true;
  await page.screenshot({ path: path.join(root, 'docs/independent-run.png'), fullPage: true });
  // Use real security IPC and demonstrate that the same data operation is denied.
  report.lock = await page.evaluate(async ({ accountId, conversationId }) => {
    const password = 'Synthetic-smoke-password-123';
    const configured = await window.alpha.security.configureApplicationLock({ action: 'enable_password', newPassword: password });
    const locked = await window.alpha.security.lockApplication();
    let denied = '';
    try { await window.alpha.messages.list(accountId, conversationId, 100, true); }
    catch (e) { denied = e.message; }
    const unlocked = await window.alpha.security.unlockApplication(password);
    const messages = await window.alpha.messages.list(accountId, conversationId, 100, true);
    return { configured, locked, denied, unlocked, resumedCount: messages.length };
  }, fixture);
  assert.match(report.lock.denied, /APP_LOCK_LOCKED/);
  assert.equal(report.lock.locked.locked, true);
  assert.equal(report.lock.unlocked.locked, false);
  report.checks.lockEnforcesReadAccess = true;
  assert.deepEqual(snapshot(fixture.directory), before, 'Source snapshot must remain byte-identical');
  report.checks.sourceUnchanged = true;
  assert.deepEqual(report.rendererErrors, []);
} catch (e) {
  report.failure = e.stack;
  if (page) {
    report.bodyAtFailure = await page.locator('body').innerText().catch(() => '');
    await page.screenshot({ path: path.join(root, 'docs/independent-run-failure.png'), fullPage: true }).catch(() => {});
  }
  process.exitCode = 1;
} finally {
  if (app) {
    const timer = setTimeout(() => app.process().kill('SIGKILL'), 8000);
    try { await app.close(); } catch (e) { report.closeError = e.message; } finally { clearTimeout(timer); }
  }
  const logs = report.logs.join(''); delete report.logs;
  fs.writeFileSync(path.join(root, 'docs/independent-run.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs/independent-run.log'), logs);
  console.log(JSON.stringify({ checks: report.checks, failure: report.failure, report: 'docs/independent-run.json' }, null, 2));
}
