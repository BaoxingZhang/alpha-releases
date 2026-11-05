# 取钥来源只读诊断

在没有合法数据库 key 时，可运行：

```sh
npm run inspect:key-sources -- --static-dir /absolute/project/.runtime/v4-encrypted-static/wechat2-static --json
```

该命令只检查三类元数据：`ALPHA_INDEPENDENT_KEY_HELPER_PATH` 是否配置为存在且可执行的绝对普通文件、固定 allowlist 中取钥相关环境变量是否存在，以及显式静止副本中的 `.alpha-v4-encrypted-static.json` 顶层 manifest 元数据。`ALPHA_XKEY_AUTH_*` 变量只报告变量名和存在性。环境变量值、helper 路径、账号标识、manifest 文件列表/哈希、key 和 token 都不会写入报告或人类输出。

诊断不会执行 helper，不读取 helper 输出，不打开 SQLite，不遍历静止副本中的数据库文件，也不会检查或复制活动微信目录。`keyRead=false`、`activeDatabaseRead=false` 和 `complete=false` 是固定边界；`status=configured` 只表示存在可供后续人工选择的 helper 或静止加密副本，不能表示已经取得 key、已解密或可读取真实数据。helper 或 manifest 边界不符合要求时命令返回 `rejected` 并以非零状态退出。

静止副本由 `npm run stage:encrypted-v4` 生成时，manifest 必须是本项目的 `alpha-independent-v4-encrypted-static-copy-manifest.v1`，并且保持 `encrypted_static_copy=true`、`sidecars_excluded=true`、`read_only=true`、`complete=false`、`native_schema_supported=false`。诊断只把文件数、字节数和排除 sidecar 计数作为脱敏元数据返回；它不会把 manifest 当作明文数据源，也不会绕过合法 key 导入流程。

没有配置 `--static-dir` 时，命令使用 `ALPHA_INDEPENDENT_ENCRYPTED_DIR`；若该变量也未设置，则只检查项目内固定的 `.runtime/v4-encrypted-static/wechat2-static` 路径。它不会自动搜索 WeChat、WeChat2 或用户目录。命令不改变 helper、环境变量、静态副本或应用状态。
