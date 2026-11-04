# Schema-only diagnostics

当一个脱敏 v4 副本无法通过独立 bridge 的核心 schema 验证时，可以先使用 schema-only 诊断列出副本中 SQLite 数据库的表和列。它只读取调用方明确指定的目录，不启动 bridge、不执行业务查询、不读取密钥，也不扩大独立后端的 schema 兼容范围。

```sh
npm run inspect:schema-only -- \
  --data-dir /absolute/authorized-v4-copy \
  --json
```

输出固定标记 `readOnly=true`、`complete=false`、`nativeSchemaSupported=false`。数据库路径始终是相对输入目录的路径；输出包含表名、列名、SQLite 类型、`notNull` 和主键序号，不包含消息内容、联系人值、密钥或绝对路径。无法打开的 `.db` 文件会保留有界错误条目；只要仍有可读数据库，报告状态为 `partial`，这样核心 schema 不匹配时也能看到实际表结构。

工具拒绝目录和成员中的符号链接、活动 `-wal`/`-shm`/`-journal` 数据库、路径穿越、超深或超大目录以及超过响应上限的结果。`ready` 或 `partial` 只表示 SQLite 元数据可读，不能证明 `contact.db`、`session.db`、消息表、真实微信 schema 或 Alpha native 兼容。确认结构后仍需用 `npm run inspect:source` 和独立后端的只读 DTO 测试逐步验证。
