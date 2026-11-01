# 会话分析接手记录

独立引擎现在实现了 `analyzeConversation`（协议 `EngineClientFrame` 字段 **24**）的第一层只读统计。请求只读取指定会话的已验证 `messages.list` DTO，响应使用原 Alpha 的 `AnalyzeConversationResponse`：`reportJson`、`itemCount`、`truncated`。

报告保留关系报告页面能识别的字段，包括：

- `total_messages` / `scanned_messages`、发送/接收/未知方向计数（`initiative`）；
- `active_days`、`longest_daily_streak`、`active_hours` 和按方向的小时分布；
- `monthly_counts`、`message_types`、`media` 和按方向的媒体计数；
- `first_opener`、首末消息引用（时间、会话、发送者、方向和类型）；
- `journey.truncated`，以及空的 `journey.moments`、`top_terms`、`shared_terms`、专属词汇数组。

`maxMessages` 默认 50,000，允许范围为 1–500,000；读取达到上限且仍有下一页时 `truncated=true`。`utcOffsetMinutes` 限定为 -720..840，小时、日期和月份按该偏移计算。协议 tag 来源于恢复的 bindings：`analyzeConversation` 写入 tag 194，因此 field number 是 **24**。

以下内容没有从未知 SQLite 表或 payload 猜测，当前保持空值或空数组：Alpha 原分析器的 NLP 词频、共同旅程 moments、可靠的回复延迟语义和 `total_words`。`response` 的延迟与计数为 `null`，UI 应显示“未知”；`message_types` 只按消息 DTO 的已验证 `kind`/`sourceType`/`display.kind` 分类。分析覆盖范围严格等于指定会话可通过 `messages.list` 分页取得的记录，不代表消息数据库中其他未映射表的完整历史。

验证使用合成 v4 SQLite fixture，检查协议能力编号 24、6 条消息的总数/方向/活跃小时/类型/月分布/首末消息，以及 `maxMessages=3` 的截断语义：

```sh
node --test tests/engine-conversation-analysis.test.mjs
```

未访问真实微信目录、未获取密钥、未写入聊天数据库，也未调用云端或 AI 服务。

聚合分析字段 110–112 在此基础上提供 scope 2 群聊报告和 scope 4 指定会话双人报告。scope 4 支持可选的半开毫秒时间范围，分别输出 `alpha-aggregate-v1` 或 `alpha-dual-v1` 协议外壳；报告只来自已验证的消息 DTO，NLP、回复速度、朋友圈和媒体文件仍保持空值或不可用。任务状态是进程内 bounded 管理，取消时不发布报告，进程重启不会续跑。
