# 搜索、消息定位与日期导航契约

依据是本地恢复的 `src/main/index.js`、`src/preload/index.js` 和 `src/renderer/assets/index-DPCwIOAb.js`。原生后端未能启动，因此下列 UI/主进程校验是已观察事实；原生 SQL、搜索排序的具体 tie-break 和分词行为没有据此恢复。独立实现需要明确记录自己的排序与匹配规则。

## 请求与响应

| 分支 | 请求要点 | 响应要点 |
| --- | --- | --- |
| `searchMessages`，field 17 | query 去首尾空白后非空，最多 512 UTF-8 字节；conversationId 可空代表全局；senderId 可空；默认 descending；pageSize 默认 50、主进程允许 1–1000；groupByConversation 表示按会话分组 | items 必须包含 id/accountId/conversationId/senderId/text/sentAtUnixMs/sourceType/exactIdentity；nextCursor 原始 bytes 最多 1024；分组 matchCount 必须正数且可安全转换为 JS Number |
| `locateMessage`，field 126 | accountId、conversationId、非零 uint64 十进制 serverId 字符串 | 找不到：无 message 且两 cursor 为空；找到：message 加两个**都非空**的 beforeCursor/afterCursor，供无时间条件的 listMessages 消费 |
| `getConversationDayCounts`，field 127 | fromUnixMs/toUnixMs 均非负、to>from、跨度最多 62×24h；utcOffsetMinutes 整数 [-720,840] | days 按 localDay 严格升序，count>0；只返回有消息的天，不返回零计数项；localDay 为偏移后的 Unix 日编号，不是 YYYYMMDD |
| `getChatExportStats`，field 120 | accountId、1–100 个不同 conversationIds；可选 refresh | 每个请求会话必须恰好出现在 items 或 failedConversationIds；items 包含 total、category counts、firstMessageUnixMs、lastMessageUnixMs |

源码依据：main `searchPageRequest/searchPageResponse`（约 12931）、`locateRequest/dayCountsRequest/dayCountsFromWire`（约 12474）、`EngineClient.locateMessage`（约 63714）、`chatExportStatsFromWire`（约 5317）。原 `search()` 返回 searchPage 的第一页 items；本轮独立模式在 coverage 不完整时改为 `SEARCH_RESULTS_INCOMPLETE`，避免数组返回值丢失警告。`searchConversations()` 使用同一 wire 请求并强制 groupByConversation=true，不是另一套搜索结果。

## 时间边界不能混用

搜索 `fromUnixMs` / `toUnixMs` 是**双端包含**。renderer 的 `searchDateFilters`（约 15004）把开始日转换成当地 00:00，把结束日转换成次日 00:00 减 1ms；主进程允许 from=to。秒精度数据库应使用 `ceil(from/1000) <= create_time <= floor(to/1000)`，不能直接截断下界，否则 1001ms 会错误包含 1 秒消息。

消息列表的 `afterUnixMs` / `beforeUnixMs` 是**严格开区间**，响应必须准确回显 `appliedAfterUnixMs` / `appliedBeforeUnixMs`，包括未提供时的 undefined。main `messagePageRequest`（约 5994）允许 after=-1；renderer `jumpLowerBound`（约 9342）传入 `max(0,当地日期起点)-1ms`，随后持续 ascending 翻页。裁剪防止正时区 epoch 所在本地日的负起点被主进程拒绝。日期跳转不限于所选当天，会继续读其后的消息。

日历计数使用**半开区间 [from,to)**。renderer `monthRange`（约 12077）传当月当地 00:00 至下月当地 00:00，下界同样裁剪为非负；分组日为 `floor((unixMs + utcOffsetMinutes×60000)/86400000)`。偏移可能将非负 timestamp 映射为负 localDay。主进程将该日编号以 UTC 日期格式化成 YYYY-MM-DD。当前 UI 一个月只传月初的固定 offset，不是提供完整时区/DST 规则；独立后端应尊重所给 offset。

## ID、分组和搜索覆盖

搜索 `id` 必须与同一真实记录在 `listMessages` 中的 `msg-<64hex>` 完全一致。main `searchContextTarget` 和 renderer `validateSearchContext` 都校验这个 ID；只填 exactIdentity=true 不能让一个新编造的搜索 ID 获得定位能力。应由 account + database + table + localId 这样的来源组合生成身份，不能仅用 serverId；跨分片相同 serverId 和相同 localId 可能对应不同记录。

分组列表按 accountId/conversationId 去重，UI 显示 matchCount 为“相关聊天记录”数量（renderer `searchCountLabel` 约 15027），不是一个词在文本中出现的次数。分组代表必须是真实匹配消息，并携带其准确身份、文本和时间。独立规则可取请求排序中的第一条作为代表，然后计算相同过滤条件下该会话的匹配消息总数。

全局搜索应枚举实际 Msg 表。会话候选至少需要合并所有库 Name2Id、contact 和 SessionTable 的真实用户名，再用其 MD5 与 Msg 表名对应；仅扫描 SessionTable 会漏掉已不活跃的历史会话。不得将 Msg 表 hash 本身返回成伪造的 conversationId。请求指定了真实 conversationId 时，可直接计算该名字对应的表名。

匹配文本必须与消息显示使用同一套 UTF-8/zstd 解码结果。只对 SQLite 的原始 blob 做文本 LIKE 会漏掉 UI 已能显示的 zstd 消息。对未知编码、坏压缩数据和无法映射的 Msg 表不能静默忽略后宣称搜索完整。本轮决定增加独立响应字段 100/101/102：incomplete、unreadableMessages、unmappedTables；有效记录仍可返回，UI 必须明确说明结果不完整。完整扫描默认 incomplete=false；扫描上限或超时保持明确错误，不把未完成扫描冒充总数。

原生排序与匹配规则尚未运行验证。本轮独立实现选择：按 `(create_time,database,table,local_id)` 排序；Unicode 转小写后做字面子串匹配，不解释正则或 SQL 通配符。不要宣称是恢复出的原生 FTS 或相关性排名。每页重扫稳定副本；游标绑定快照、查询、会话、发送人、时间、分组与方向，可以改变 pageSize。

## 精确上下文和排序反例

搜索 DTO 本身没有 serverId。main `searchMessageContext`（约 63702）只对 `LocatedMessages` 缓存中已有 serverId 的消息走 locate anchor；普通 searchPage 不填这个缓存，通常走 `readSearchMessageContext`（约 12850）。该函数分别以 targetTime+1 的 before 条件和 targetTime-1 的 after 条件扫描，寻找完全一致的消息 ID；在尚未找到 target 时，如果一页出现不同 timestamp 就立即报 `SEARCH_CONTEXT_TARGET_NOT_FOUND`。

已用实际 main AST 函数复现旧独立排序的问题：

| 记录 | create_time | sort_seq |
| --- | ---: | ---: |
| target | 1700000500 | 1 |
| 另外 21 条 | 1700000499 | 2…22 |

请求 before=10/after=10 时，older 页大小为 20。按 sort_seq 倒序返回的第一页全是较早时间的消息，target 明明在下一页，nextCursor 也非空，但函数立即返回 TARGET_NOT_FOUND。因此仅测试同 timestamp 不足以证明搜索定位正确。

本轮决定让独立 `messages.list` 采用 create_time 优先及稳定来源 tie-break，locate 两侧游标共享同一排序。这样相同 timestamp 的 tie 连续，原主进程的时间定位算法才能成立。该选择是独立实现定义，不是已证明与原 native 相同。若将来坚持 sort_seq 优先，就需要明确新增按精确 messageId/sourceRef 获取无时间 anchor 的独立契约；不能把自有 messageId 塞进只允许十进制 serverId 的字段。

locate 的请求无法消除跨库重复 serverId 歧义。匹配多条不同来源时应返回明确歧义，不能随意取第一条或合并成一条。成功 anchor 的 before/after cursor 应排除 anchor 自身、分别与 descending/ascending 的无时间 listMessages 配合，跨库同时间不漏不重。主进程还会比较响应 signed int64 serverId 经 uint64 转换后的值，必须保持原 64 位位模式。

“查看源内容”是另一项能力：原生模式的 main `messageSourceRequest` 要求 `media1_<32hex>` sourceToken；独立模式现在由 `acceptedMessageSourceToken` 放行本引擎生成的 `independent1_...` token，并在 `messagePageResponse` 中保留它。独立 `getMessageSource` 会重新定位同一账号/库/表/完整 localId 后返回已解码文本；原 `media1_` raw/XML 源内容协议、媒体文件读取仍不可用。搜索上下文定位不依赖该令牌。

## 日历首日与统计依赖

`DateJumpPopover`（renderer 约 12180）同时调用 `useMonthDayCounts` 和 `useConversationStats`。月历热度来自 dayCounts；“第一条消息”日期来自 `getChatExportStats` 的 `firstMessageUnixMs`。只实现 dayCounts 仍会缺少首日按钮。

stats 的 category 必须来自主进程允许集合：text/image/voice/video/emoji/file/link/chat-record/quote/transfer/red-packet/call/location/card/system/other。未知类型计入 other。所有 counts 的和必须等于 total，first>=0、last>=first。原模式保留“first 为 0 当且仅当 last 为 0”的原校验；本轮独立模式允许非空会话从 epoch 0 延续至更晚时间，空会话仍必须 total=0、first=last=0。renderer 首日存在性改由 total>0 判断。统计覆盖同会话所有消息分片，不能只覆盖 session 表存在的活跃记录。

renderer `parseJumpDate` 依据完整本地日是否与 UTC epoch 后的时间相交校验，而不是固定要求 year>=1970。日终必须大于 0，日内无效日期仍拒绝。这样洛杉矶 epoch 所在的 1969-12-31 可以跳转，而上海 1969-12-31（整日早于 epoch）仍被拒绝；消息列表起点继续裁剪为 -1，绝不请求负 timestamp 数据。

## 本轮独立验证

`node --test tests/search-navigation-boundary.test.mjs` 的 7 组测试已全部通过。测试生成自有 SQLite 数据，调用真实 Go bridge 子进程、真实 Node 引擎与从当前 main/renderer AST 提取的方法；没有真实微信数据、账号或密钥。

- UTF-8/zstd 命中、仅存在 Name2Id 的历史会话、字面通配符、升降序反向、分组真实计数与代表。
- 搜索毫秒双端包含、sender 过滤、查询/sender 变化拒绝复用游标。
- create_time/sort_seq 故意相反的上下文反例；上下文是完整顺序的连续子序列，继续读取前后游标后可无漏无重拼回全列表。
- 跨分库相同 local_id/同时间保持身份；serverId 单一定位的两侧锚点与列表一致，重复 serverId 明确歧义、缺失明确 null。
- 日历毫秒半开、UTC+8 午夜、负 localDay、after=-1、总数/category/首末时间一致；epoch 0→1s 在独立 stats 接纳而原模式仍拒绝。
- 部分结果保留已知命中，三个扩展字段真实 protobuf 往返；覆盖状态不一致拒绝，原模式不暴露扩展，数组旧入口拒绝丢弃 partial 标记。
- renderer 真实日期函数在独立 Node 子进程的 `Asia/Shanghai` 与 `America/Los_Angeles` 时区执行：上海 1970-01-01 的跳转下界为 -1，月起点为 0；洛杉矶 1970-01-01 起点仍保留 28800000ms，不错误裁剪至 0，1969 年 12 月的有效查询为 [0,28800000)。负偏移下 epoch 的本地日期 1969-12-31 可解析，完整早于 epoch 的日期与无效日期仍拒绝。两区产生的首日跳转边界都经过真实引擎列表查询，准确返回 0 秒和 1 秒的两条合成消息。

此验证证明上述合成边界；不证明原 native 行为等价、真实大库性能、完整内容格式解析或所有 UI 交互。root 另负责实际 Electron UI 测试。只读检查还确认 Suggestions、KeywordSearch、SearchResultsPanel、FootprintContentSearch 均接入部分结果提示。
