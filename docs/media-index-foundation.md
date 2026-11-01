# 独立媒体索引基础

独立后端支持一个可选的 `media-index.v1.json` 读取层。它只从调用者显式选择的数据源根目录加载，不扫描用户目录，也不伪装成 Alpha 原生 `media1_` token、`resolveMessageMedia` 或 DAT/AES 解码器。

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

当前仅验证了合成的图片索引链路。语音、视频、DAT/AES、缩略图/原图变体、朋友圈媒体和 Alpha 原生 `resolveMessageMedia` 仍不可用；索引接入不代表这些能力已经还原。
