# “其他资料”记录的证据边界

## 结论

Alpha 的“其他资料”页面和导出入口仍保留在恢复的界面中。当前独立后端对 `payments`、`friend_requests`、`revokes` 和 `calls` 只提供消息 XML 能证明的 **partial/candidate** 视图；`moment_interactions`、`searches` 仍不可用。协议分支 `listGeneral` 另外实现了明确的虚拟表 `__alpha_group_members`，frame 136 `startRecordExport` 对 payments/friend_requests/revokes/calls 四类候选记录提供独立任务导出。

这里的限制来自数据来源和字段语义，而不是导出文件格式本身。界面能够列出字段、筛选条件和 `xlsx/csv/json` 选项，不能证明离线副本中存在同名记录库，也不能证明一条消息已经包含支付金额、通话时长、撤回原文或朋友圈互动的完整语义。

## 已观察到的界面和协议

- 主进程定义六个记录分类，并限制每次最多选择六类；记录导出支持 `xlsx`、`csv`、`json`，每类可带最多 20,000 个选中 ID。证据见 [`src/main/index.js`](../src/main/index.js) 中 `GENERAL_RECORD_CATEGORIES`、`recordExportRequest` 和 `startRecordExport`。
- renderer 会调用 `window.alpha.data.generalRecords(accountId, category)`，并期待 `id`、`atUnixMs`、`tableName`、`actor`、`fields`、`truncated` 等字段；不同分类还要求支付、好友验证、撤回、通话、朋友圈互动和搜索的专用字段。
- `startRecordExport` 只是把经过校验的请求转发到原生 frame 136。恢复出的 JavaScript 没有实现记录查询或字段组装。

这些是可编辑的调用契约和页面语义，属于观察到的产品层事实；它们不是 SQLite schema 证据。

## 当前独立 bridge 能证明的范围

独立 Go bridge 对输入目录只接受已验证的微信 v4 明文快照：

- `contact.db`：`contact`，以及存在时的 `chat_room(username, owner, ext_buffer)`；
- `session.db`：`SessionTable`；
- `message*.db`：已验证的 `Name2Id` 和 `Msg_<md5>` 消息表及固定消息列。

`listGeneral` 对 `tableName=__alpha_group_members` 读取 `chat_room.ext_buffer`，解析群成员并补充联系人字段；对 `__alpha_general_payments`、`__alpha_general_friend_requests` 和 `__alpha_general_revokes` 以及 `__alpha_general_calls` 只扫描可验证的消息 XML，并标记候选来源。好友申请只接受 `local_type=37` 且 XML `sysmsg` 类型为 `VerifyMsg`/`friend`/`friendmsg` 的行，未匹配内容会被省略。四类候选记录现在支持最多 512 字节、无控制字符和首尾空白的大小写不敏感字面 `query`，匹配已生成记录的 ID、时间、发送者、内容、字段名和值；`ascending` 可选择稳定升序或降序，分页仍是有界全量扫描后的 offset/limit。其他表名立即返回 `UNSUPPORTED_OPERATION`。这些限制在 [`packages/alpha-data-bridge/groups.go`](../packages/alpha-data-bridge/groups.go) 和 [`packages/alpha-data-bridge/records.go`](../packages/alpha-data-bridge/records.go) 中明确执行。

消息表可以提供 `local_type`、时间、发送者、正文和来源标识，但这些字段不足以证明下面的完整业务字段：

| 分类 | 可以从消息中观察到的候选线索 | 当前不能安全推导的字段 |
| --- | --- | --- |
| payments | 某些 `type=49` 或文本/XML 消息 | 金额、收付款人、交易状态、交易号、红包类型和结算时间 |
| revokes | 撤回类型或系统文本候选 | 被撤回消息的完整原文、批次关系、找回状态 |
| calls | 消息 `local_type=50` 且正文包含 `<voipmsg>` 或 `<voipinvitemsg>` | 媒体类型、接通状态、通话时长、通话方向、`status_text`、`interrupted` 和“其他设备接听”等状态 |
| friend_requests | `local_type=37` 且 `sysmsg` 类型为 `VerifyMsg`/`friend`/`friendmsg` 的 XML；可提取 username、nickname、content、scene | 请求方向、处理状态、标签、完整验证记录和原生去重关系 |
| moment_interactions | 普通消息中的文本或链接 | 朋友圈帖子、点赞/评论/提及关系及媒体状态 |
| searches | 无稳定来源 | 搜索来源、关键词、会话和时间 |

支付、好友申请、撤回和通话候选只在对应 `local_type`（`49/37/10000/50`）及受限 XML 结构明确时返回，并在字段中标记 `partial=1`、`candidate=1`，同时保留 `source_database`、`source_table`、`source_local_id`、`source_server_id`。好友申请只输出 `kind=friend_request`、`state=unknown`、可观察的人名/问候/场景和来源信息；请求方向、处理状态和标签均省略。通话候选只输出 `kind=call`、`state=unknown`、会话和来源信息；媒体类型、时长、方向、状态文本和中断标记均省略，避免把未证实 XML 字段解释为完整语义。frame 136 接受 `xlsx`、`csv`、`json`，每个选中分类写一个带哈希后缀的文件；JSON 保留原始 `fields`，CSV/XLSX 使用基础列和 `field.<name>` 展平列。输出经过 `inspectExportPath`/`prepareExportPath` 的源目录隔离、禁止覆盖和原子 hard-link 发布，任务快照沿用 frame 123–125 的状态、取消和错误语义。选中的 `recordIds` 必须在真实扫描结果中找到，否则任务失败关闭。导出仍不是 Alpha 完整记录语义；其余分类和未知格式继续 fail-closed，把候选直接映射成完整记录会造成静默误报。

## 下一步所需证据

要实现任一分类，需要用户授权的脱敏 fixture 或受控原生请求/响应捕获，至少包含：

1. 对应数据库文件的 `sqlite_master`、索引和代表性行；
2. 每个协议字段与数据库列或原生响应字段的对应关系；
3. 重复记录、缺失字段、截断、分页和账号隔离语义；
4. 与 Alpha 页面显示和导出文件的逐项对账样本。

在取得这些证据前，不增加猜测性 SQL 或分类器，也不把 partial writer 扩展到其他分类。群成员虚拟表的实现、JSON/Markdown/HTML/TXT 会话导出和四种会话文件格式不改变本记录域的边界。

