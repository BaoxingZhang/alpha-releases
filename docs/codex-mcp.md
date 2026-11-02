# 在 Codex 中使用独立 MCP

恢复工程提供一个本机 stdio MCP 入口，供 Codex 或其他支持 MCP 的客户端调用已经验证的独立只读 DTO。入口不会启动 HTTP 监听，也不会启用原生 Alpha engine。

在项目根目录运行：

```sh
ALPHA_INDEPENDENT_STATE_DIR=<state-dir> \
ALPHA_INDEPENDENT_BRIDGE_PATH=<bridge-executable> \
ALPHA_INDEPENDENT_DATA_DIR=<explicit-authorized-data-copy> \
ALPHA_INDEPENDENT_ACCOUNT_ID=<account-id> \
npm run mcp:independent
```

也可以让项目生成配置，避免手工填写绝对路径。默认 JSON 适合通用 MCP 客户端或插件清单：

```sh
npm run mcp:config -- \
  --state-dir /absolute/project/.runtime/codex-state \
  --data-dir /absolute/project/authorized-data-copy \
  --bridge-path /absolute/project/build/candidates/alpha-data-bridge \
  --account-id synthetic-account \
  --output /absolute/project/.runtime/codex-mcp.json
```

生成的 JSON 可用于采用 `mcpServers` 清单的 MCP 客户端。Codex CLI 请使用下面的 `codex-toml` 输出。命令只生成配置，不读取数据目录，也不启动 engine。

对于 Codex CLI，建议生成原生 `config.toml` 片段：

```sh
npm run mcp:config -- \
  --format codex-toml \
  --server-name alpha-local \
  --state-dir /absolute/project/.runtime/codex-state \
  --data-dir /absolute/project/authorized-data-copy \
  --bridge-path /absolute/project/build/candidates/alpha-data-bridge \
  --account-id synthetic-account \
  --output /absolute/project/.runtime/codex-mcp.toml
```

把输出文件中的两个 `[mcp_servers.alpha-local]` 表追加到 `~/.codex/config.toml`，然后运行：

```sh
codex mcp get alpha-local
codex mcp list
```

该文件是配置片段，不应覆盖已有的 `config.toml`。也可以直接使用 Codex CLI 写入配置（不经过生成器）：

```sh
codex mcp add \
  --env ALPHA_INDEPENDENT_STATE_DIR=/absolute/project/.runtime/codex-state \
  --env ALPHA_INDEPENDENT_DATA_DIR=/absolute/project/authorized-data-copy \
  --env ALPHA_INDEPENDENT_BRIDGE_PATH=/absolute/project/build/candidates/alpha-data-bridge \
  --env ALPHA_INDEPENDENT_ACCOUNT_ID=synthetic-account \
  alpha-local -- \
  /absolute/path/to/node \
  /absolute/project/packages/alpha-engine/mcp-stdio.cjs
```

`--format codex-toml` 只写入本地 stdio 的 `command`、`args`、`cwd` 和四个独立后端环境变量；它不会连接 Codex、创建数据目录或启动 engine。`--server-name` 只能使用字母开头、长度不超过 64 的字母/数字、下划线或短横线。JSON 输出仍保留给 Cursor、Claude 或其他采用 `mcpServers` 清单的客户端，不应与 Codex 的 TOML 配置格式混用。

Codex 的 MCP 配置应把 `command` 指向项目使用的 Node.js，把 `args` 设为 `packages/alpha-engine/mcp-stdio.cjs`，并在 `env` 中提供上述变量。`ALPHA_INDEPENDENT_DATA_DIR` 必须是调用方明确授权的离线副本；不要指向真实微信目录，除非已经完成单独的备份、授权和 schema 验证。`ALPHA_INDEPENDENT_STATE_DIR` 应使用独立的 0700 目录。

独立工具目录包含 `alpha-independent.official_plans.list/get/save/delete`。这些工具只维护账号隔离的 `official-schedule-plans.v1.json` 本地元数据和更新时间 CAS，响应固定标记 `scope=alpha-independent-official-schedule-plans`、`complete=false`、`native_schema_supported=false`、`local_metadata_only=true`；它们不会访问公众号服务、抓取文章、下载媒体、创建官方执行记录或运行官方计划。

stdio 每行接收一个 JSON-RPC 对象，支持 `initialize`、`ping`、`tools/list` 和 `tools/call`。`notifications/initialized` 等通知不返回响应；EOF 后进程会关闭 adapter 和 engine。协议错误会返回 JSON-RPC 错误对象，业务工具错误会保留适配器的 `isError` 结果。

该入口复用独立 HTTP/MCP 适配器的工具目录和边界。工具响应可能带有 `complete=false`、`native_schema_supported=false`、`synthetic_only=true`、`metadata_only=true` 或 `writer=false`。这些字段是能力边界的一部分，不能把 synthetic fixture、候选记录或 metadata-only 结果当作原生 Alpha parity。stdio 传输不需要 HTTP token；HTTP 适配器仍按 [独立 HTTP/MCP 接口](http-readonly-adapter-recovery.md) 的本机 token 规则运行。

当前入口适合在 Codex 中查询独立后端的账号、会话、消息、搜索、联系人、只读导出、分析、媒体元数据和显式 synthetic moments/favorites 数据。发送、编辑、防撤回/防删除 writer、真实朋友圈/收藏 schema、原生媒体解密、AI gateway、授权服务和原生完整性校验仍保持不可用或未验证。
