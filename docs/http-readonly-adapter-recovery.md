# 独立 HTTP/MCP 接口接手记录

独立后端现在有一个可选的本机适配器 `packages/alpha-engine/http-server.cjs`。它把已经通过 protobuf/Go bridge 验证的 DTO 查询和受控会话文件导出暴露为本机 HTTP 接口，并提供一组明确列出的 MCP 工具。它不复用原包的 `HttpApiService`、原网关、原 MCP 命令，也不改变原包的完整性策略。

启动独立引擎时设置一个 32–256 位可见 ASCII 令牌即可启用适配器：

```sh
ALPHA_INDEPENDENT_HTTP_TOKEN="$(openssl rand -hex 32)" \
ALPHA_INDEPENDENT_HTTP_PORT=5031 \
npm run start:independent
```

`scripts/environment.mjs` 会在独立模式下校验并保留这两个变量，`recovery-runtime.cjs` 再将它们传给 Electron 启动的独立 engine；原包模式会丢弃这组变量。这样从桌面启动器运行时，监听器配置与直接运行 engine 的行为一致。

适配器只监听 `127.0.0.1`，拒绝 `Origin`、非本机 Host、缺失或不匹配令牌，以及超过 1 MiB 的请求体。健康检查 `/health` 和 `/api/v1/health` 不需要令牌。支持的 HTTP 路径是账号、会话、消息、搜索、联系人、通讯录目录、群成员、导出格式、受控会话导出和媒体元数据导出，分别映射到已验证的独立 protobuf 方法；目录路径只允许 `friend` 和 `group` 两种已有证据支持的分类。

`POST /mcp` 实现 Streamable HTTP 的 `initialize`、`ping`、`tools/list` 和 `tools/call`，目前声明并处理 20 个工具：状态与账号信息、联系人列表/目录/解析/profile、群成员、会话列表与解析、会话消息、搜索发送人、消息搜索、消息原始 DTO、消息前后文、首条/日期锚点、每日计数、五种会话文件导出、媒体 JSON/CSV 元数据导出，以及独立搜索页。消息原始工具只返回已验证 DTO 字段（含来源标识、长整数、显示 JSON 的 Base64 和独立 source token），不返回数据库密钥、原始 XML 或本地媒体路径。联系人 profile 只返回独立引擎能证明的存在性、共同群和群成员字段；通讯录目录只派生已验证的好友和群聊。工具参数对象和字段均做白名单校验，游标扫描最多 128 页/10,000 条；未知工具以 MCP `isError` 返回。没有发送消息、写入数据库、朋友圈、收藏、媒体下载或任意 SQL 工具。

新增的上下文工具只使用独立引擎已经验证的消息 DTO：`get_message_around` 接受消息 `id`、`serverId` 或 `localId`，`get_message_anchor` 支持首条消息和 `YYYY-MM-DD` 日期，`get_daily_message_counts` 使用独立引擎的会话日计数。它们不会返回原始 XML、本地媒体路径、数据库密钥或未经验证的原 Alpha 媒体 token。

`POST /api/v1/exports` 只允许独立引擎已验证的 `json`、`markdown`、`html`、`txt`、`xlsx` 格式；`POST /api/v1/media-metadata` 只允许 `media-json`、`media-csv`，可省略会话标识以导出账号范围，接收绝对 `destination_path` 和可选的毫秒时间范围；引擎会拒绝源目录/状态目录、符号链接、已有目标、媒体打包和未支持格式，不覆盖已有文件。该接口写入一个新导出文件，因此不把文件写入称作数据源只读操作。

这是一层独立适配器，尚未声称兼容官方文档中的全部 24 个 HTTP 路径和 60 个 MCP 工具。官方接口中依赖原生媒体、朋友圈、收藏、发送和完整 ChatLab 语义的路径仍需逐项取得 schema 和运行证据后实现。当前测试使用合成引擎 DTO，验证令牌、Host/Origin、HTTP 路由、游标/长整数转换、受控导出、MCP 工具、参数白名单和未知工具错误；没有读取真实微信目录。

媒体元数据导出只写入消息 DTO 中已经验证的来源库/表/行号、时间、发送者、refs 和 display 字段，并固定写入 `metadataOnly=true`、`mediaReady=false`。它不读取、解密、下载、播放本地媒体，也不生成 Alpha 原生 `media1_` token。
