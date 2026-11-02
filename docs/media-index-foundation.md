# 独立媒体索引基础

独立后端支持一个可选的 `media-index.v1.json` 读取层。它只从调用者显式选择的数据源根目录加载，不扫描用户目录，也不伪装成 Alpha 原生 `media1_` token。基于该索引，协议 field 103 另提供一个明确隔离的 `alpha-media://sha256/<sha256>` 解析分支；它只服务唯一绑定到账号、会话和消息的图片条目。显式 `kind=file` 条目也可被现有附件 grant 接受，用于只读保存或打开；该 fallback 的完整校验和上限见 [`file-attachment-recovery.md`](file-attachment-recovery.md)。

调用方也可以使用 `writeMediaIndex({ root, entries, accountId })` 生成索引。`entries` 必须逐项给出媒体类型、原始 ID 和根目录内的相对文件路径；写入器会在发布 manifest 前检查目录和父路径、拒绝符号链接、限制文件大小、计算 SHA-256，并以临时文件原子发布。它不会根据微信目录自动发现媒体，也不会从消息内容猜路径；默认拒绝覆盖已有 manifest，只有显式 `overwrite: true` 才会替换它。

索引格式：

```json
{
  "version": 1,
  "accountId": "synthetic-account",
  "entries": [
    {
      "kind": "image",
      "id": "0123456789abcdef0123456789abcdef",
      "rendition": "source",
      "relativePath": "media/image.bin",
      "sha256": "…64 个十六进制字符…",
      "sizeBytes": 1234,
      "mimeType": "image/png",
      "conversationId": "wxid_peer",
      "accountId": "synthetic-account",
      "messageId": "msg-1",
      "sentAtUnixMs": "1700000000000"
    }
  ]
}
```

独立引擎读取消息引用时，会按 `kind`、原始媒体 `id`、`rendition` 匹配索引；manifest 或条目带有 `accountId` 时必须与当前独立数据集标签一致；如果条目带有 `conversationId` 或 `messageId`，还必须与当前消息一致。匹配成功后，消息得到独立的 `alpha-media://sha256/<sha256>` URI。主进程仍以账号、发送者、当前锁和选中账号发放 grant，媒体协议不会接受没有 grant 的 URI。

主进程只在普通 content-addressed cache 没有同名文件时读取索引条目。读取时会再次校验显式根目录、manifest、父目录和媒体文件的符号链接、相对路径边界、大小和 SHA-256；图片还必须通过 PNG/JPEG/GIF/WebP/BMP magic 检查。文件变化、哈希不匹配、重复 key、未知媒体类型或索引损坏都会 fail-closed。

当前已用合成的 1×1 PNG 验证图片索引、独立 field 103 解析、主进程 grant、`readImage` IPC 和 renderer 的 `alpha-media://img/...` 预览闭环；运行记录见 [`independent-run.json`](independent-run.json) 的 `independentImageReadThroughRendererIpc` 与 `independentImagePreviewRendered` 检查。语音、视频、DAT/AES、缩略图/原图变体、朋友圈媒体和 Alpha 原生 `media1_` 解析仍不可用；索引接入不代表这些能力已经还原。

独立 HTTP/MCP 适配器现在另提供显式 indexed-media 读取：`GET /api/v1/independent/media/indexed/<sha256>` 和 `alpha-independent.media.read_indexed`。调用方必须提供明确的账号、会话、消息、媒体 ID、kind、rendition 和小写 SHA-256；引擎会重新定位同一会话中的真实消息 ref，并使用 `readMediaEntry` 再次校验相对路径、父目录 symlink、文件大小和 SHA-256。HTTP 返回已索引字节及 manifest MIME/文件名，MCP 返回有界 Base64；响应固定标记 `scope=alpha-independent-indexed-media`、`complete=false`、`native_schema_supported=false`。这两个入口只读取调用方明确写入 `media-index.v1.json` 的文件，拒绝 `media1_`、任意路径、native media cache、DAT/AES 解密和远程补齐。

独立解析要求 manifest entry 同时带 `conversationId` 和 `messageId`，重新读取并校验文件大小/SHA-256，再扫描同一会话中的真实消息 DTO，确认图片 ref、消息身份和可选时间/大小断言一致。`preferLive`、远程补齐、pending、live video、非零 `recordOffset` 以及 MD5 断言均 fail-closed。返回的 `Message` 不携带原生 `media1_` token；调用方应继续使用 entry 产生的 `alpha-media://sha256/...` URI。

`writeMediaIndex` 的输入是用户或上层适配器已经确认的文件清单，因此它可以用于脱敏 fixture、受控导入或未来经过验证的媒体扫描结果；它不是 Chatlog `hardlink.db`/`VoiceInfo` 的自动读取器，也不证明 Alpha 原生媒体 schema 或 token 已恢复。
