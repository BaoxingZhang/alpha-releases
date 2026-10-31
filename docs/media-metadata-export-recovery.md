# 媒体元数据导出

独立后端现在可以把已经由 `browseConversationMessages` 或
`browseAccountMedia` 验证的媒体消息 DTO 导出为 JSON/CSV。导出只包含消息
身份、来源库/表、时间、发送者、`refs` 和可选 `display`；每行都标记
`metadataOnly: true`、`mediaReady: false`。

空的 `conversationId` 表示按可发现会话扫描整个账号；非空值表示单个会话。
实现复用独立导出的路径隔离、禁止覆盖、原子 hard-link 发布和 20,000 条/64 MiB
限制。它不会读取媒体文件、推断本地路径、生成 Alpha `media1_` token、获取图片密钥、
联网补齐或播放媒体。原生引擎模式仍按其自身格式支持情况返回错误。

预加载入口为 `window.alpha.messages.exportMediaMetadata(accountId, conversationId,
format, destinationPath)`，其中 `format` 是 `media-json` 或 `media-csv`。
