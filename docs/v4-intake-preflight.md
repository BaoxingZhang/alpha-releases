# v4 副本接入预检

在把授权的脱敏 v4 副本接入独立后端前，先运行统一预检：

```sh
npm run preflight:v4 -- \
  --data-dir /absolute/authorized-v4-copy \
  --account-id sanitized-v4 \
  --json
```

如果还不知道微信数据目录，可以先运行：

```sh
npm run discover:v4-sources -- --json
```

这个命令只检查固定的 macOS 微信容器路径和有限的数据库文件名，输出相对路径的脱敏摘要、候选标识及 `-wal`/`-shm`/`-journal` 侧文件状态；它不读取 SQLite 表内容、不复制文件、不扫描任意用户目录，也不把候选目录当作可用数据源。若候选显示 `active-sidecars`，请先由用户完全退出微信，再重新运行预检；工具不会替用户关闭微信。

需要把候选目录交给人工预检时，可运行 `npm run discover:v4-sources -- --show-path`。这是仅面向终端人工操作的明确绝对路径输出；默认脱敏报告仍不会包含绝对路径，`--show-path --json` 会拒绝执行，避免把本机路径写入 CI 或机器报告。

先运行 `npm run build:bridge` 准备本项目的 Go bridge；预检不会自动编译
bridge。若拿到的是 SQLCipher 加密副本，先按[加密导入流程](encrypted-import.md)
用调用方手动输入的 key 导入一个静止的明文快照，再对快照目录运行本预检；不要把
密钥或运行中的原始目录交给预检。

预检先运行只读 SQLite 元数据诊断，再尝试项目自己的只读 bridge。输出为
`alpha-independent-v4-preflight.v1`，固定标记 `read_only=true`、`complete=false`、
`native_schema_supported=false`。`status=ready` 只表示 bridge 能识别当前已验证的
独立 DTO；`status=schema-only` 表示 SQLite 元数据可读但业务 bridge 仍不兼容；
`status=unavailable` 或 `rejected` 表示副本还不能安全读取。

预检不读取密钥、不导入快照、不扫描指定目录之外的路径、不输出消息内容或联系人值，
也不会把 schema-only 成功映射成 Alpha native parity。源目录必须是绝对、规范化、无符号链接的静止副本；被检查的 SQLite 数据库不能有 `-wal`、`-shm` 或 `-journal` 侧文件，目录中的条目也必须是普通文件或目录。副本权限由调用方负责设置为仅授权维护者可读。

预检后：

1. `schema-only`：保存 JSON 报告，按报告中的表/列结构补充脱敏副本映射；不要修改 bridge 去猜测原生 schema。
2. `ready`：使用安全 staging 命令把授权副本复制成项目 `.runtime` 下的新目录；它会拒绝
   符号链接、特殊文件、SQLite 活动 sidecar、超限文件和目录，并在临时目录完成后原子发布。
   例如：

   ```sh
   npm run stage:v4 -- \
     --source-dir /absolute/authorized-v4-copy \
     --account-id sanitized-v4 \
     --target-name sanitized-v4 \
     --json
   ```

   staging 完成后会自动运行预检，并只输出有界的状态、计数和预检摘要，不写入源目录的
   绝对路径。`published=true` 且 `status=ready` 或 `schema-only` 时，项目内副本位于
   `.runtime/v4-staged/sanitized-v4`；若需要手工分步操作，也可以把副本复制到项目
   `.runtime` 下的全新真实目录（不能使用软链接），再重跑：

   ```sh
   npm run preflight:v4 -- \
     --data-dir /absolute/project/.runtime/v4-staged/sanitized-v4 \
     --account-id sanitized-v4 \
     --json
   npm run build:independent
   node scripts/launch.mjs --independent \
     --data-dir /absolute/project/.runtime/v4-staged/sanitized-v4 \
     --account-id sanitized-v4
   ```

   随后执行最小只读 UI/DTO smoke，逐项核对联系人、会话和消息字段及行数。
   `npm run test:independent` 仍可用于回归独立后端的 synthetic fixture，但它会自行创建
   synthetic 数据，不能替代对授权副本的验收。
3. `rejected`/`unavailable`：修复副本或重新导出后重跑；不要将空结果当作成功。

即使预检为 `ready`，真实发送、写入、自动取钥、原生媒体、AI 和原生完整性仍需各自的授权材料与可重放证据。
