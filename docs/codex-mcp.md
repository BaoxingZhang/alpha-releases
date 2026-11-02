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

Codex 的 MCP 配置应把 `command` 指向项目使用的 Node.js，把 `args` 设为 `packages/alpha-engine/mcp-stdio.cjs`，并在 `env` 中提供上述变量。`ALPHA_INDEPENDENT_DATA_DIR` 必须是调用方明确授权的离线副本；不要指向真实微信目录，除非已经完成单独的备份、授权和 schema 验证。`ALPHA_INDEPENDENT_STATE_DIR` 应使用独立的 0700 目录。

stdio 每行接收一个 JSON-RPC 对象，支持 `initialize`、`ping`、`tools/list` 和 `tools/call`。`notifications/initialized` 等通知不返回响应；EOF 后进程会关闭 adapter 和 engine。协议错误会返回 JSON-RPC 错误对象，业务工具错误会保留适配器的 `isError` 结果。

该入口复用独立 HTTP/MCP 适配器的工具目录和边界。工具响应可能带有 `complete=false`、`native_schema_supported=false`、`synthetic_only=true`、`metadata_only=true` 或 `writer=false`。这些字段是能力边界的一部分，不能把 synthetic fixture、候选记录或 metadata-only 结果当作原生 Alpha parity。stdio 传输不需要 HTTP token；HTTP 适配器仍按 [独立 HTTP/MCP 接口](http-readonly-adapter-recovery.md) 的本机 token 规则运行。

当前入口适合在 Codex 中查询独立后端的账号、会话、消息、搜索、联系人、只读导出、分析、媒体元数据和显式 synthetic moments/favorites 数据。发送、编辑、防撤回/防删除 writer、真实朋友圈/收藏 schema、原生媒体解密、AI gateway、授权服务和原生完整性校验仍保持不可用或未验证。
