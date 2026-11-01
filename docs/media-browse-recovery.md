# 媒体浏览接手记录

## 已验证范围

恢复的主进程 DTO 暴露了两个请求：`browseConversationMessages`（字段 137）和 `browseAccountMedia`（字段 138）。原 UI 允许会话类型筛选 `media`、`file`、`link`、`music`、`mini-program`、`transaction`，以及账号范围的 `media`、`image`、`video`。当前独立引擎只接入可由真实 v4 `messages.list` 证明的部分：

- 会话浏览：`media` 按 `local_type` 3/34/43/47 及已验证的消息 kind 筛选；`file`/`link` 按 bridge 解析的 display kind 筛选。
- 账号浏览：`media`、`image`、`video`；提供可选会话范围。账号范围按真实 `sessions.list` 的会话逐个扫描，分页游标保存 bridge 游标和会话迭代状态。
- from/to 为包含边界的 int64 毫秒范围，Node 在 bridge 秒范围查询后再做精确毫秒过滤；结果保持 bridge 的降序消息顺序，并保留 `refs`、`displayJson`、conversation/source identity。

合成 SQLite fixture 覆盖图片、视频、语音、贴纸、链接、文件、Unix epoch-zero、多个会话及分页游标。测试只使用人工生成的数据，不读取用户微信目录。

## 明确限制

bridge 没有经过验证的媒体索引、`.dat`/语音/视频文件路径或解密密钥，因此浏览结果是消息元数据。vendor/chatlog v4 中出现的 `hardlink.db`、`media_*.db`、`VoiceInfo` 和候选相对路径只作为待验证证据记录在 [media-schema-evidence.md](media-schema-evidence.md)，当前 bridge 不打开这些库。实现不会读取文件、联网下载、播放媒体、生成 Alpha `media1_...` 解析 token 或写入数据库。正文不可解码时，仍可能保留真实语音 `serverId` ref；图片/视频 ref 只有在消息正文明确提供 ID/URI 时才出现。

`music`、`mini-program`、`transaction` 尚无安全的 v4 字段语义，返回 `TYPE_BROWSE_CATEGORY_UNSUPPORTED`。账号范围只覆盖 `sessions.list` 能发现的会话和其 `messages.list` 结果，不能宣称包含已从 session index 移除的历史表。收藏、朋友圈和其他媒体 token/下载接口仍保持 `UNIMPLEMENTED`。
