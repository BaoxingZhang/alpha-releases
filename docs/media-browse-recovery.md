# 媒体浏览接手记录

## 已验证范围

恢复的主进程 DTO 暴露了两个请求：`browseConversationMessages`（字段 137）和 `browseAccountMedia`（字段 138）。原 UI 允许会话类型筛选 `media`、`file`、`link`、`music`、`mini-program`、`transaction`，以及账号范围的 `media`、`image`、`video`。当前独立引擎只接入可由真实 v4 `messages.list` 证明的部分：

- 会话浏览：`media` 按 `local_type` 3/34/43/47 及已验证的消息 kind 筛选；`file`/`link` 按 bridge 解析的 display kind 筛选。
- 账号浏览：`media`、`image`、`video`；提供可选会话范围。账号范围按真实 `sessions.list` 的会话逐个扫描，分页游标保存 bridge 游标和会话迭代状态。
- from/to 为包含边界的 int64 毫秒范围，Node 在 bridge 秒范围查询后再做精确毫秒过滤；结果保持 bridge 的降序消息顺序，并保留 `refs`、`displayJson`、conversation/source identity。

合成 SQLite fixture 覆盖图片、视频、语音、贴纸、链接、文件、Unix epoch-zero、多个会话及分页游标。测试只使用人工生成的数据，不读取用户微信目录。

## 明确限制

消息媒体浏览仍然只返回消息元数据。对于调用方明确选择的、已解密且稳定的 v4 副本，bridge 新增独立 `media.probe`，只读打开 `hardlink.db`/`media_*.db` 的已验证表，返回相对路径、大小、修改时间、源库 SHA-256 和语音数据长度；它不读取媒体字节、不联网、不播放、不生成 Alpha `media1_...` 解析 token 或写入数据库。没有显式媒体库时返回 unavailable；schema、路径组件、符号链接、sidecar、并发变化和资源上限都会 fail-closed。正文不可解码时，仍可能保留真实语音 `serverId` ref；图片/视频 ref 只有在消息正文明确提供 ID/URI 时才出现。vendor/chatlog v4 的表名和路径线索仍只作为来源证据，独立探针不声称 Alpha native schema parity。

`music`、`mini-program`、`transaction` 尚无安全的 v4 字段语义，返回 `TYPE_BROWSE_CATEGORY_UNSUPPORTED`。账号范围只覆盖 `sessions.list` 能发现的会话和其 `messages.list` 结果，不能宣称包含已从 session index 移除的历史表。真实收藏媒体、朋友圈媒体和其他媒体 token/下载接口仍保持不可用；独立 `listFavorites` 只读取 synthetic 收藏 fixture，不属于媒体浏览能力。独立收藏媒体槽位/解析另有单独的 `__alpha_favorite_media_v1` + `media-index.v1.json` synthetic 链路，仍不兼容真实收藏媒体。
