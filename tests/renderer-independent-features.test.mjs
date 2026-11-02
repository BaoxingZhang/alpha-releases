import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'src/renderer/assets/index-DPCwIOAb.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(process.cwd(), 'src/main/index.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(process.cwd(), 'src/renderer/assets/index-Bk459aoT.css'), 'utf8');

test('independent renderer exposes only explicit synthetic favorites and moments', () => {
  assert.match(source, /function useFavoriteFeed\(accountId, accountEpoch, independent = false, syntheticFavorites = false\)/);
  assert.match(source, /enabled: Boolean\(accountId\) && \(!independent \|\| syntheticFavorites\) && !searchError/);
  assert.match(source, /独立离线模式暂未接入微信收藏数据库/);
  assert.match(source, /独立模式暂不支持收藏/);
  assert.match(source, /独立 synthetic-only 收藏：仅读取 favorite\.db 或 favorites\.db 的 __alpha_favorites_v1/);
  assert.match(source, /capabilities\.has\("favorites"\)/);
  assert.match(source, /function useMomentsQuery\(accountId, independent = false, syntheticMoments = false\)/);
  assert.match(source, /enabled: Boolean\(accountId\) && \(!independent \|\| syntheticMoments\),/);
  assert.match(source, /独立离线模式暂未接入微信朋友圈数据库/);
  assert.match(source, /独立模式暂不支持朋友圈/);
  assert.match(source, /独立 synthetic-only 朋友圈：仅读取 moments\.db 的 __alpha_moments_v1/);
  assert.match(source, /function SyntheticMomentCard\(\{ moment, accountId, mediaRevision = 0 \}\)/);
  assert.match(source, /synthetic-only · __alpha_moments_v1 · 只读文字、评论和媒体/);
  assert.match(source, /const comments = detail\?\.comments \?\? \[\]/);
  assert.match(source, /jsxRuntimeExports\.jsx\(MomentComment, \{ comment: comment2, accountId, viewerLabel: viewerLabel2, mediaRevision \}/);
  assert.match(source, /\["moments", "moment-authors", "moment-day-counts"\]\.every/);
  assert.match(source, /capabilities: Array\.isArray\(account\.capabilities\) \? \[\.\.\.account\.capabilities\] : \[\]/);
  assert.match(mainSource, /sourceTable === "__alpha_moments_v1" \? item\.text : ""/);
  assert.match(mainSource, /includeMedia: !independentBackendEnabled\(\)/);
  assert.match(source, /!independent && .*MomentsProtectionEntry/);
  assert.match(source, /momentsEnabled && .*MomentExportAction/);
  assert.match(source, /syntheticOnly \? "导出朋友圈（synthetic 元数据）"/);
  assert.match(source, /useMomentExportDraft\(accountId, accountScope, seed, syntheticOnly\)/);
  assert.match(source, /syntheticOnly \? \[\] : \["image", "video", "live_photo"\]/);
  assert.match(source, /\(!independent \|\| syntheticMoments\).*MomentExportAction/);
  assert.match(mainSource, /capabilitySummary/);
  assert.match(source, /独立后端已实现 \$\{capabilitySummary\.implementedRequestBranches\}\/\$\{capabilitySummary\.totalRequestBranches\}/);
  assert.match(source, /另有 \$\{capabilitySummary\.unsupportedRequestBranches\} 个请求明确返回 \$\{capabilitySummary\.unsupportedBehavior\}/);
});

test('independent media browser remains metadata-only', () => {
  assert.match(source, /function MediaTile\(\{[^}]*metadataOnly = false/);
  assert.match(source, /const canReadImage = !metadataOnly \|\| indexedImages/);
  assert.match(source, /const canReadVideo = !metadataOnly/);
  assert.match(source, /const metadataOnlyTile = metadataOnly && \(video \|\| !indexedImages\)/);
  assert.match(source, /children: "仅有元数据"/);
  assert.match(source, /function MediaGrid\(\{[^}]*metadataOnly = false/);
  assert.match(source, /const metadataOnly = isIndependentEngineStatus\(status\);/);
  assert.match(source, /onOpenImage: \(message\) => void viewer\.open\(message\)/);
  assert.match(source, /onOpenVideo: setVideo/);
  assert.match(source, /metadataOnly=true，mediaReady=false/);
  assert.match(source, /metadataOnly=true，mediaReady=false.*不会读取或播放/);
  assert.match(styleSource, /\.type-browse-tile-metadata \{/);
});

test('independent settings do not advertise the native desktop MCP gateway', () => {
  assert.match(source, /function McpConnectionGuide\(\{ status, independent = false \}\)/);
  assert.match(source, /独立模式的桌面 HTTP API\/MCP 入口保持关闭/);
  assert.match(source, /当前独立后端不提供桌面 HTTP API\/MCP 入口，也不支持发送、推送或原生完整目录/);
  assert.match(source, /McpConnectionGuide, \{ status: httpApiStatus, independent: isIndependentEngineStatus\(status\) \}/);
});
