import { _electron as electron } from 'playwright-core';
import electronPath from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { root, launchEnvironment, sandboxProfile } from '../scripts/environment.mjs';
import { normalizeRunLog } from '../scripts/normalize-run-log.mjs';
import { createSearchFixture } from './search-fixture.mjs';

const session = `search-smoke-${Date.now()}`;
const runtime = path.join(root, '.runtime', session);
fs.mkdirSync(runtime, { recursive: true });
const fixture = await createSearchFixture({ directory: path.join(runtime, 'fixture') });
const partial = await createSearchFixture({ directory: path.join(runtime, 'partial-fixture') });
execFileSync('/usr/bin/python3', ['-c', "import sqlite3,sys; db=sqlite3.connect(sys.argv[1]); db.execute('UPDATE \"'+sys.argv[2]+'\" SET message_content=? WHERE local_id=5',(bytes.fromhex('28b52ffd00'),)); db.commit(); db.close()", path.join(partial.directory, 'message/message_1.db'), partial.table]);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const wrapper = path.join(runtime, 'electron-sandbox.sh');
fs.writeFileSync(wrapper, `#!/bin/sh\nexec /usr/bin/sandbox-exec -f ${quote(sandboxProfile())} ${quote(electronPath)} "$@"\n`, { mode: 0o755 });
const snapshot = directory => Object.fromEntries(fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => {
  const file = path.join(entry.parentPath, entry.name);
  return [path.relative(directory, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')];
}));
const before = [snapshot(fixture.directory), snapshot(partial.directory)];
const report = { testedAt: new Date().toISOString(), session, realUserDataAccessed: false, checks: {}, rendererErrors: [] };
const logs = [];
let app, page;
async function open(data, suffix = '') {
  app = await electron.launch({ executablePath: wrapper, args: ['--no-sandbox', path.join(root, 'dist/app')], cwd: root, env: launchEnvironment(session + suffix, { backend: 'independent', dataDir: data.directory, accountId: data.accountId }), timeout: 45000 });
  app.process().stdout?.on('data', value => logs.push(value.toString()));
  app.process().stderr?.on('data', value => logs.push(value.toString()));
  for (let tries = 0; tries < 300; tries++) {
    page = app.windows().find(window => window.url().includes('/out/renderer/index.html'));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page);
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.rendererErrors.push(error.message));
  await page.waitForFunction(() => !!window.alpha && document.body.innerText.length > 20);
  await page.getByRole('checkbox', { name: '我已了解，开始连接本地数据' }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '打开数据副本', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '暂时跳过', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('.setup-footer').getByRole('button', { name: '进入 Alpha', exact: true }).click();
  await page.locator('main[data-surface="workspace"]').waitFor();
  await page.getByText('合成联系人甲', { exact: true }).first().click();
}
async function close() {
  if (!app) return;
  const closing = app; app = undefined; page = undefined;
  const timer = setTimeout(() => closing.process().kill('SIGKILL'), 8000);
  try { await closing.close(); } finally { clearTimeout(timer); }
}
try {
  await open(fixture);
  report.api = await page.evaluate(async data => {
    const pages = []; let cursor = '';
    do {
      const response = await window.alpha.messages.searchPage(data.accountId, data.query, { pageSize: 2, cursor, ascending: false });
      pages.push(response); if (response.nextCursor && response.nextCursor === cursor) throw Error('stalled cursor'); cursor = response.nextCursor;
    } while (cursor && pages.length < 20);
    if (cursor) throw Error('search pagination did not finish');
    const groups = await window.alpha.messages.searchConversations(data.accountId, data.query, { pageSize: 20 });
    const compressed = await window.alpha.messages.searchPage(data.accountId, '压缩维护', { conversationId: data.conversationId });
    const context = await window.alpha.messages.context(data.accountId, compressed.items[0], { before: 30, after: 30 });
    return { pages, groups, compressed, context };
  }, fixture);
  const hits = report.api.pages.flatMap(value => value.items);
  assert.equal(hits.length, fixture.matchingCount);
  assert.equal(new Set(hits.map(hit => hit.id)).size, hits.length);
  assert.ok(report.api.pages.every(value => value.coverage.complete));
  assert.equal(report.api.groups.items.length, fixture.groupedMatchingCount);
  assert.ok(report.api.groups.items.some(value => value.conversationId === fixture.archivedConversationId));
  assert.equal(report.api.compressed.items[0].text, fixture.zstdText);
  assert.equal(report.api.context.items[report.api.context.targetIndex].id, report.api.compressed.items[0].id);
  assert.equal(report.api.context.items.length, fixture.alphaMatchingCount);
  report.checks.globalSearchPaginationAndArchivedConversation = true;
  report.checks.zstdHitAndExactContext = true;

  await page.getByRole('button', { name: '搜索聊天记录', exact: true }).click();
  const keyword = page.getByRole('textbox', { name: '搜索关键词', exact: true });
  await keyword.fill(fixture.query);
  await page.waitForFunction(() => document.querySelectorAll('.conversation-search-hit').length === 6);
  await page.locator('.conversation-search-results').getByText(fixture.zstdText, { exact: true }).waitFor();
  report.checks.conversationSearchOriginalUi = true;
  await page.getByRole('button', { name: '不限发送人', exact: true }).click();
  await page.getByRole('option').filter({ hasText: '合成联系人甲' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.conversation-search-hit').length === 4);
  report.checks.senderFilterOriginalUi = true;
  await keyword.fill('100%');
  await page.waitForFunction(() => document.querySelectorAll('.conversation-search-hit').length === 1);
  await page.locator('.conversation-search-hit-text').click();
  await page.getByText('已定位到搜索消息，可上下滚动查看相邻记录', { exact: true }).waitFor();
  const literal = hits.find(hit => hit.text.includes('100%'));
  assert.ok(literal);
  await page.locator(`[data-message-id="${literal.id}"]`).waitFor();
  report.checks.literalQueryAndLocateOriginalUi = true;
  await page.screenshot({ path: path.join(root, 'docs/search-run.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('button', { name: '搜索聊天记录', exact: true }).click();
  await page.getByRole('button', { name: '按日期定位', exact: true }).click();
  await page.getByRole('button', { name: '从第一条消息开始', exact: true }).click();
  await page.getByText('维护 earlier shard', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: '按日期定位', exact: true }).click();
  await page.getByText('本月 6 条消息，1 天有聊天', { exact: true }).waitFor();
  await page.getByRole('dialog', { name: '按日期定位' }).getByRole('gridcell', { name: /6 条消息/ }).waitFor();
  report.checks.firstMessageJumpAndCalendarOriginalUi = true;
  await page.screenshot({ path: path.join(root, 'docs/search-date-run.png'), fullPage: true, animations: 'disabled' });
  await page.getByRole('dialog', { name: '按日期定位' }).press('Escape');

  const globalQuery = page.getByRole('textbox', { name: '搜索联系人和聊天记录', exact: true });
  await globalQuery.fill(fixture.query);
  const suggestions = page.getByRole('dialog', { name: '搜索建议' });
  await suggestions.getByText(fixture.archivedConversationId, { exact: true }).waitFor();
  const popupOpened = app.waitForEvent('window');
  await globalQuery.press('Enter');
  const popup = await popupOpened;
  popup.setDefaultTimeout(12000);
  popup.on('pageerror', error => report.rendererErrors.push(error.message));
  await popup.getByRole('textbox', { name: '消息关键词', exact: true }).waitFor();
  await popup.getByRole('navigation', { name: '匹配的会话' }).getByRole('button').filter({ hasText: fixture.archivedConversationId }).click();
  await popup.locator('.chat-search-hit').filter({ hasText: '维护 archived without session' }).hover();
  await popup.getByRole('button', { name: '预览', exact: true }).click();
  await popup.getByText('维护 archived without session', { exact: true }).last().waitFor();
  assert.equal(await popup.getByRole('alert').count(), 0);
  report.checks.globalSearchWindowAndArchivedPreview = true;
  await popup.screenshot({ path: path.join(root, 'docs/search-global-run.png'), fullPage: true, animations: 'disabled' });
  await popup.close();
  report.lock = await page.evaluate(async data => {
    const password = 'Synthetic search smoke password';
    await window.alpha.security.configureApplicationLock({ action: 'enable_password', newPassword: password });
    await window.alpha.security.lockApplication();
    let rejected = '';
    try { await window.alpha.messages.searchPage(data.accountId, data.query, {}); } catch (e) { rejected = e.message; }
    await window.alpha.security.unlockApplication(password);
    const resumed = await window.alpha.messages.searchConversations(data.accountId, data.query, {});
    return { rejected, resumedGroups: resumed.items.length };
  }, fixture);
  assert.match(report.lock.rejected, /APP_LOCK_LOCKED/);
  assert.equal(report.lock.resumedGroups, fixture.groupedMatchingCount);
  report.checks.searchObeysApplicationLock = true;
  await close();

  await open(partial, '-partial');
  const coverage = await page.evaluate(async data => {
    const response = await window.alpha.messages.searchPage(data.accountId, data.query, { conversationId: data.conversationId });
    let legacyError = '';
    try { await window.alpha.messages.search(data.accountId, data.query, data.conversationId, 50); } catch (e) { legacyError = e.message; }
    return { response, legacyError };
  }, partial);
  assert.equal(coverage.response.items.length, 5);
  assert.equal(coverage.response.coverage.complete, false);
  assert.equal(coverage.response.coverage.unreadableMessages, '1');
  assert.match(coverage.legacyError, /SEARCH_RESULTS_INCOMPLETE/);
  await page.getByRole('button', { name: '搜索聊天记录', exact: true }).click();
  await page.getByRole('textbox', { name: '搜索关键词', exact: true }).fill(partial.query);
  await page.getByText('部分记录或会话暂时无法解析，以下仅显示已读取的匹配结果。', { exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.conversation-search-hit').length === 5);
  report.partial = coverage;
  report.checks.partialResultsDisclosedInOriginalUi = true;
  await page.screenshot({ path: path.join(root, 'docs/search-partial-run.png'), fullPage: true, animations: 'disabled' });
  await close();
  assert.deepEqual([snapshot(fixture.directory), snapshot(partial.directory)], before);
  report.checks.sourceDatabasesUnchanged = true;
  assert.deepEqual(report.rendererErrors, []);
} catch (error) {
  report.failure = error.stack; process.exitCode = 1;
  if (page) { report.bodyAtFailure = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(root, 'docs/search-run-failure.png'), fullPage: true }).catch(() => {}); }
  if (app) report.windowsAtFailure = await Promise.all(app.windows().map(async window => ({ url: window.url(), body: await window.locator('body').innerText().catch(() => '') })));
} finally {
  await close().catch(error => { report.closeError = error.message; });
  fs.writeFileSync(path.join(root, 'docs/search-run.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(root, 'docs/search-run.log'), normalizeRunLog(logs.join('')));
  console.log(JSON.stringify({ checks: report.checks, failure: report.failure, report: 'docs/search-run.json' }, null, 2));
}
