# v4 副本接入预检

在把授权的脱敏 v4 副本接入独立后端前，先运行统一预检：

```sh
npm run preflight:v4 -- \
  --data-dir /absolute/authorized-v4-copy \
  --account-id sanitized-v4 \
  --json
```

预检先运行只读 SQLite 元数据诊断，再尝试项目自己的只读 bridge。输出为
`alpha-independent-v4-preflight.v1`，固定标记 `read_only=true`、`complete=false`、
`native_schema_supported=false`。`status=ready` 只表示 bridge 能识别当前已验证的
独立 DTO；`status=schema-only` 表示 SQLite 元数据可读但业务 bridge 仍不兼容；
`status=unavailable` 或 `rejected` 表示副本还不能安全读取。

预检不读取密钥、不导入快照、不扫描指定目录之外的路径、不输出消息内容或联系人值，
也不会把 schema-only 成功映射成 Alpha native parity。源目录必须是绝对、规范化、无符号链接的静止副本，不能有 `-wal`、`-shm` 或 `-journal` 文件。

预检后：

1. `schema-only`：保存 JSON 报告，按报告中的表/列结构补充脱敏副本映射；不要修改 bridge 去猜测原生 schema。
2. `ready`：运行 `npm run test:independent` 和最小只读 UI smoke，再逐项核对 DTO 字段和行数。
3. `rejected`/`unavailable`：修复副本或重新导出后重跑；不要将空结果当作成功。

即使预检为 `ready`，真实发送、写入、自动取钥、原生媒体、AI 和原生完整性仍需各自的授权材料与可重放证据。
