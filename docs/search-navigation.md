# 搜索、定位与日期导航

独立后端新增全账号/单会话搜索、按发送人和时间筛选、会话分组计数、消息定位、月历消息数及会话首末时间统计。保留原界面入口，数据来自实际只读 SQLite 查询。没有调用原 Alpha 后端，也没有增加数据库写入。

## 本机使用

```sh
npm run build:independent
npm run demo:search
```

演示创建独立的合成数据库。完成首次设置后，在左上搜索框输入“维护”可查看所有匹配会话；在聊天工具栏点击“搜索聊天记录”可筛选发送人、点击命中并查看前后消息。“按日期定位”会显示当天消息数，并提供“从第一条消息开始”。

合成数据包含正常文本、合法 zstd 压缩文本、多个分库、超过 JavaScript 安全整数的 ID、重复 serverId，以及仅在 Name2Id 中存在的历史会话。该演示不能代替真实微信数据验收。

## 实际语义

- 搜索是 Unicode 小写转换后的字面子串匹配，`%`、`_`、`.` 和 `[]` 都是普通字符；没有正则、分词索引或相关性排名。
- 全账号搜索枚举实际消息表，从 Name2Id、联系人和会话表的真实用户名映射会话。不会只查询当前会话列表，也不会把表名 hash 伪装为会话 ID。
- 消息列表、搜索和定位按 `(create_time, database, table, local_id)` 稳定排序，倒序反转整个顺序。排序是独立实现定义，尚未证明与原生后端完全一致。旧版按 sort_seq 的游标版本会被明确拒绝，重新查询即可获得新游标。
- 搜索时间为双端包含；消息列表 after/before 为开区间；日期计数为半开区间 `[from,to)`，最多 62 天，使用请求提供的固定 UTC 偏移。日期跳转读取所选日期及之后的数据。
- 每条搜索命中复用列表的来源身份，按账号、分库、表和完整 localId 生成稳定 ID。重复 serverId 的直接定位返回 `MESSAGE_LOCATE_AMBIGUOUS`；搜索命中仍有精确来源身份，可通过上下文入口定位。
- 分组数量是过滤后匹配消息条数，不是关键词出现次数。会话统计返回实际总数、类型分类数量及首末时间；未知子类型归为 other，不猜测 XML 语义。

UTF-8/zstd 解码由 Go 查询层统一完成，列表与搜索使用同一文本。遇到坏压缩数据、超出单条尺寸上限的内容，或无法映射到会话名的消息表，会返回已读取的匹配结果，同时标记不完整。原界面提示“部分记录或会话暂时无法解析”，计数标为“已找到”；不把部分空结果宣称为全部无匹配。

这一覆盖信息使用本项目新增的 protobuf 字段 100–102，主进程仅在独立模式接纳。旧 `messages.search()` 只返回数组，无法携带覆盖说明，因此在部分结果时明确报 `SEARCH_RESULTS_INCOMPLETE`；当前 UI 使用携带覆盖信息的 `searchPage/searchConversations`。

## 验证与边界

```sh
npm test
npm run test:search
npm run test:encrypted
npm run test:independent
npm run test:smoke
```

端到端结果见 [search-run.json](search-run.json)，当前汇总见 [search-validation.json](search-validation.json)。契约和旧排序导致命中定位失败的反例保存在 [search-navigation-contract.md](search-navigation-contract.md)，Go 构建/算法记录见 [data bridge 验证](../packages/alpha-data-bridge/search-validation.json)。

搜索当前逐次扫描，限制为查询 15 秒、100 万条记录、512 MiB 扫描估算及 64 MiB 候选结果估算，单条解码最多 4 MiB。单页 JSON 超过 12 MiB 时返回 `RESPONSE_TOO_LARGE`，调用方应减小 page size 或增加筛选条件。达到限制会返回错误，不返回冒充完整结果的截断页。这些是资源边界，不是大库性能承诺；持久索引、取消长查询、更完整的编码和语义解析仍需后续实现。

群成员选择、完整通讯录资料、分类内容浏览、媒体、导出任务、统计报告、朋友圈、AI 和写入等范围仍在 [MAINTENANCE.md](../MAINTENANCE.md)。本阶段的会话统计为导航提供数据，不代表整个导出或分析功能已完成。仍未访问真实微信目录、取得密钥、调用模型或发送消息。
