import { _electron as electron } from 'playwright-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { createFixture } from './data-bridge-fixture.mjs';
import { root, launchEnvironment } from '../scripts/environment.mjs';
import projectPackage from '../package.json' with { type: 'json' };
import projectIdentity from '../packages/alpha-desktop/project-identity.cjs';

// This smoke starts the generated .app binary itself. Passing an unpacked
// Resources/app path to Electron exercises the development branch, so this
// test also asserts app.isPackaged and the packaged Resources path before it
// reads the disposable fixture through the renderer IPC surface.
const independentIdentity = projectIdentity.readProjectIdentity(projectPackage).independent;
const appPath = path.join(root, '.runtime', 'release-artifacts', `${independentIdentity.productName}.app`);
const executablePath = path.join(appPath, 'Contents', 'MacOS', independentIdentity.executableName);
const resourcesPath = path.join(appPath, 'Contents', 'Resources');
const session = `packaged-independent-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
const packagedRuntime = path.join(appPath, 'Contents', '.runtime', session);
const report = { schema: 'alpha-recovered.packaged-independent-smoke.v1', session, checks: {} };
let app;

async function installMediaFixture(fixture) {
  const imageId = '0123456789abcdef0123456789abcdef';
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const fileBytes = Buffer.from('synthetic packaged attachment\n', 'utf8');
  const box = (type, payload) => { const bytes = Buffer.isBuffer(payload) ? payload : Buffer.from(payload); const header = Buffer.alloc(8); header.writeUInt32BE(bytes.length + 8, 0); header.write(type, 4, 4, 'ascii'); return Buffer.concat([header, bytes]); };
  const videoBytes = Buffer.concat([
    box('ftyp', Buffer.concat([Buffer.from('isom', 'ascii'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2', 'ascii')])),
    box('moov', box('trak', box('mdia', box('hdlr', Buffer.concat([Buffer.alloc(8), Buffer.from('vide', 'ascii')]))))),
    box('mdat', Buffer.from('synthetic-mp4', 'ascii'))
  ]);
  const videoId = 'fedcba9876543210fedcba9876543210';
  const videoSha256 = crypto.createHash('sha256').update(videoBytes).digest('hex');
  const fileId = crypto.createHash('sha256').update(fileBytes).digest('hex');
  const messageTable = 'Msg_' + crypto.createHash('md5').update(fixture.conversationId).digest('hex');
  const messageDatabase = path.join(fixture.directory, 'message', 'message_0.db');
  const imageRelativePath = 'media/packaged-smoke.png';
  const fileRelativePath = `media/files/${fileId}.zip`;
  await fs.mkdir(path.join(fixture.directory, 'media', 'files'), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(fixture.directory, imageRelativePath), imageBytes, { mode: 0o600 });
  await fs.writeFile(path.join(fixture.directory, fileRelativePath), fileBytes, { mode: 0o600 });
  const videoRelativePath = 'media/packaged-smoke.mp4';
  await fs.writeFile(path.join(fixture.directory, videoRelativePath), videoBytes, { mode: 0o600 });
  const db = new DatabaseSync(messageDatabase);
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    6, 400, 400, 3, 1700000005, 1, 1, `<msg md5="${imageId}"/> packaged image`, Buffer.alloc(0)
  );
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    7, 401, 401, 25769803825, 1700000006, 1, 1, `<msg sha256="${fileId}"><appmsg><type>6</type><title>packaged.zip</title><appattach><totallen>${fileBytes.length}</totallen><fileext>zip</fileext></appattach></appmsg></msg>`, Buffer.alloc(0)
  );
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    8, 402, 402, 43, 1700000007, 1, 1, `<videomsg rawmd5="${videoId}"/> packaged video`, Buffer.alloc(0)
  );
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    9, 403, 403, 49, 1700000008, 1, 1, '<msg><appmsg><type>5</type><title>packaged link</title><des>synthetic packaged link</des><url>https://example.test/packaged</url></appmsg></msg>', Buffer.alloc(0)
  );
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    10, 404, 404, 48, 1700000009, 1, 1, '<msg><location x="39.9042" y="116.4074" label="北京天安门" /></msg>', Buffer.alloc(0)
  );
  db.prepare(`INSERT INTO "${messageTable}" (local_id,server_id,sort_seq,local_type,create_time,real_sender_id,status,message_content,packed_info_data) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    11, 405, 405, 244813135921, 1700000010, 1, 1, '<msg><appmsg><type>57</type><title>packaged quoted text</title><refermsg><type>1</type><svrid>9007199254740993</svrid><fromusr>wxid_self</fromusr><displayname>自己</displayname></refermsg></appmsg></msg>', Buffer.alloc(0)
  );
  db.close();
  const imageMessageId = `msg-${crypto.createHash('sha256').update(JSON.stringify({ accountId: fixture.accountId, database: 'message/message_0.db', table: messageTable, localId: '6' })).digest('hex')}`;
  const fileMessageId = `msg-${crypto.createHash('sha256').update(JSON.stringify({ accountId: fixture.accountId, database: 'message/message_0.db', table: messageTable, localId: '7' })).digest('hex')}`;
  const videoMessageId = `msg-${crypto.createHash('sha256').update(JSON.stringify({ accountId: fixture.accountId, database: 'message/message_0.db', table: messageTable, localId: '8' })).digest('hex')}`;
  await fs.writeFile(path.join(fixture.directory, 'media-index.v1.json'), JSON.stringify({
    version: 1,
    accountId: fixture.accountId,
    entries: [{
      kind: 'image', id: imageId, rendition: 'source', relativePath: imageRelativePath,
      sha256: crypto.createHash('sha256').update(imageBytes).digest('hex'), sizeBytes: imageBytes.length,
      mimeType: 'image/png', accountId: fixture.accountId, conversationId: fixture.conversationId,
      messageId: imageMessageId, sentAtUnixMs: '1700000005000'
    }, {
      kind: 'file', id: fileId, rendition: 'source', relativePath: fileRelativePath,
      sha256: fileId, sizeBytes: fileBytes.length, mimeType: 'application/zip',
      accountId: fixture.accountId, conversationId: fixture.conversationId, messageId: fileMessageId
    }, {
      kind: 'video', id: videoId, rendition: 'source', relativePath: videoRelativePath,
      sha256: videoSha256, sizeBytes: videoBytes.length, mimeType: 'video/mp4',
      accountId: fixture.accountId, conversationId: fixture.conversationId, messageId: videoMessageId
    }]
  }, null, 2) + '\n', { mode: 0o600 });
  return { imageBytes, imageSha256: crypto.createHash('sha256').update(imageBytes).digest('hex'), fileBytes, fileId, videoSha256 };
}

await fs.mkdir(runtime, { recursive: true, mode: 0o700 });
try {
  const executableStat = await fs.stat(executablePath).catch(() => null);
  assert.ok(executableStat?.isFile(), 'generated independent executable is missing');
  const marker = JSON.parse(await fs.readFile(path.join(resourcesPath, 'alpha-backend-mode.json'), 'utf8'));
  assert.deepEqual(marker, { schema: 'alpha.recovered.backend-mode.v1', backend: 'independent' });
  report.checks.independentPackagedMarker = true;

  const fixture = await createFixture(path.join(runtime, 'fixture'));
  const media = await installMediaFixture(fixture);
  const environment = launchEnvironment(session, {
    backend: 'independent',
    dataDir: fixture.directory,
    accountId: fixture.accountId
  });
  app = await electron.launch({
    executablePath,
    args: ['--no-sandbox'],
    cwd: root,
    env: environment,
    timeout: 45000
  });
  const main = await app.evaluate(({ app }) => ({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath
  }));
  report.main = main;
  assert.equal(main.isPackaged, true);
  assert.equal(main.resourcesPath, resourcesPath);
  assert.equal(main.appPath, path.join(resourcesPath, 'app'));
  report.checks.electronPackagedMode = true;

  const deadline = Date.now() + 30000;
  let page;
  while (Date.now() < deadline) {
    page = app.windows().find(candidate => candidate.url().endsWith('/out/renderer/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'packaged renderer did not open');
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20);
  report.checks.packagedRendererLoaded = true;

  const backend = await page.evaluate(() => window.alpha.system.getBackendStatus());
  assert.equal(backend.state, 'ready');
  assert.ok(backend.components.some(component => component.component === 'alpha-independent-engine'));
  report.backend = backend;
  report.checks.independentBackendReady = true;

  const accountResult = await page.evaluate(async ({ accountId, conversationId }) => {
    const accounts = await window.alpha.accounts.list();
    const messages = await window.alpha.messages.list(accountId, conversationId, 100, true);
    return { accounts, messages };
  }, { accountId: fixture.accountId, conversationId: fixture.conversationId });
  assert.equal(accountResult.accounts.length, 1);
  assert.equal(accountResult.accounts[0].id, fixture.accountId);
  assert.ok(accountResult.messages.some(message => message.text === 'first source'));
  report.accounts = accountResult.accounts;
  report.messageCount = accountResult.messages.length;
  report.checks.fixtureReadThroughRendererIpc = true;

  // Complete the real packaged onboarding path before exercising media grants.
  // The account/message query above intentionally proves DTO reads only; image
  // and file bytes require the selected-account and renderer grant checks.
  await page.getByText('已明确绑定索引的图片预览已可用', { exact: false }).waitFor({ timeout: 15000 });
  await page.getByRole('checkbox', { name: '我已了解，开始连接本地数据' }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '打开数据副本', exact: true }).click({ timeout: 20000 });
  await page.locator('.setup-footer').getByRole('button', { name: '暂时跳过', exact: true }).click({ timeout: 20000 });
  await page.locator('.setup-footer').getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '进入 Alpha', exact: true }).click();
  await page.locator('main[data-surface="workspace"]').waitFor();
  await page.getByText('合成联系人甲', { exact: true }).first().click({ timeout: 15000 });
  await page.getByText('first source', { exact: true }).first().waitFor({ timeout: 15000 });
  const accountMedia = await page.evaluate(async (accountId) => {
    const result = {};
    for (const category of ['file', 'link']) {
      result[category] = await window.alpha.messages.browseAccountMedia(accountId, { category, pageSize: 90 });
    }
    return result;
  }, fixture.accountId);
  assert.ok(accountMedia.file.items.some((item) => item.display?.kind === 'file'), JSON.stringify(accountMedia.file));
  assert.ok(accountMedia.link.items.some((item) => item.display?.kind === 'link'), JSON.stringify(accountMedia.link));
  report.checks.packagedAccountMediaFileAndLinkThroughRendererIpc = true;
  const selectedMessages = await page.evaluate(async ({ accountId, conversationId }) => window.alpha.messages.list(accountId, conversationId, 100, true), {
    accountId: fixture.accountId,
    conversationId: fixture.conversationId
  });
  assert.ok(selectedMessages.some(message => message.text.includes('packaged image')), JSON.stringify(selectedMessages));
  const locationMessage = selectedMessages.find((message) => message.display?.kind === 'location');
  assert.deepEqual(locationMessage?.display?.location, { latitude: 39.9042, longitude: 116.4074, label: '北京天安门' });
  const quoteMessage = selectedMessages.find((message) => message.display?.kind === 'quote');
  assert.deepEqual(quoteMessage?.display?.quote, {
    sender: '自己',
    kind: 'text',
    text: 'packaged quoted text',
    senderId: 'wxid_self',
    serverId: '9007199254740993'
  });
  report.checks.packagedMessageDisplayLocationAndQuoteThroughRendererIpc = true;
  await page.locator('.message-location-card').filter({ hasText: '北京天安门' }).waitFor({ timeout: 15000 });
  await page.locator('.message-quote').filter({ hasText: 'packaged quoted text' }).waitFor({ timeout: 15000 });
  report.checks.packagedLocationAndQuoteCardsRendered = true;
  const image = await page.evaluate(async ({ accountId, opaqueId }) => window.alpha.media.readImage(accountId, opaqueId), {
    accountId: fixture.accountId,
    opaqueId: media.imageSha256
  });
  assert.deepEqual(image, { mimeType: 'image/png', dataBase64: media.imageBytes.toString('base64') });
  report.checks.packagedImageReadThroughRendererIpc = true;
  await page.locator('.message-media img').first().waitFor({ timeout: 15000 });
  // The image element can be mounted before Chromium has completed the
  // decode.  Waiting for the actual load state avoids a timing race that is
  // more visible on the GitHub macOS runner than on a warm local cache.
  await page.waitForFunction(() => {
    const element = document.querySelector('.message-media img');
    return Boolean(element?.complete && element.naturalWidth > 0);
  }, { timeout: 15000 });
  assert.equal(await page.locator('.message-media img').first().evaluate((element) => element.complete && element.naturalWidth > 0), true);
  report.checks.packagedImagePreviewRendered = true;
  const attachment = await page.evaluate(async ({ accountId, opaqueId }) => window.alpha.media.openAttachment(accountId, opaqueId, 'reveal'), {
    accountId: fixture.accountId,
    opaqueId: media.fileId
  });
  assert.deepEqual(attachment, { fileName: 'packaged.zip' });
  const attachmentRoot = path.join(packagedRuntime, 'temp', 'alpha-attachment-open');
  const attachmentFiles = (await fs.readdir(attachmentRoot, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name === 'packaged.zip')
    .map(entry => path.join(entry.parentPath, entry.name));
  assert.equal(attachmentFiles.length, 1);
  assert.deepEqual(await fs.readFile(attachmentFiles[0]), media.fileBytes);
  report.checks.packagedFileAttachmentThroughRendererIpc = true;
  await page.getByRole('button', { name: '图片与视频', exact: true }).click({ timeout: 15000 });
  const mediaPage = page.locator('section[aria-label="图片与视频"]');
  await mediaPage.waitFor({ timeout: 15000 });
  const mediaTabList = mediaPage.getByRole('tablist', { name: '媒体类型', exact: true });
  await mediaTabList.waitFor({ timeout: 15000 });
  const mediaTabs = await mediaTabList.getByRole('tab').evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-tab')));
  assert.deepEqual(mediaTabs, ['media', 'image', 'video', 'file', 'link']);
  await mediaPage.getByRole('tab', { name: '文件', exact: true }).click();
  await mediaPage.locator('#media-panel-file').waitFor({ timeout: 15000 });
  await mediaPage.getByText('packaged.zip', { exact: true }).waitFor({ timeout: 15000 });
  await mediaPage.getByRole('tab', { name: '链接', exact: true }).click();
  await mediaPage.locator('#media-panel-link').waitFor({ timeout: 15000 });
  await mediaPage.getByText('packaged link', { exact: true }).waitFor({ timeout: 15000 });
  report.checks.packagedIndependentFileAndLinkTabs = true;
  const video = await page.evaluate(async ({ accountId, opaqueId }) => window.alpha.media.readPlayback(accountId, opaqueId), {
    accountId: fixture.accountId,
    opaqueId: media.videoSha256
  });
  assert.equal(video.mimeType, 'video/mp4');
  assert.match(video.url, /^alpha-media:\/\/av\//);
  report.checks.packagedIndexedVideoPlaybackGrant = true;
} finally {
  if (app) {
    const closeTimer = setTimeout(() => app.process().kill('SIGKILL'), 8000);
    try { await app.close(); } finally { clearTimeout(closeTimer); }
  }
  await fs.rm(runtime, { recursive: true, force: true });
  await fs.rm(packagedRuntime, { recursive: true, force: true });
}

console.log(JSON.stringify(report, null, 2));
