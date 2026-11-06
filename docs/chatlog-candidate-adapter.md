# Chatlog 候选读取适配层

`packages/alpha-engine/chatlog-candidate.cjs` 是一个独立的、显式 opt-in 的候选读取封装。它为已经准备好的微信 v4 解密工作目录启动固定版本的 Chatlog 子进程，并把访问限制在本机 loopback 的只读 JSON 路由：

2026-11-05 曾在用户已启动的微信进程上做过一次有界的 Chatlog `key --pid --force` 只读探测，最长约 120 秒。2026-11-06 在用户重新启动 WeChat2 后按同样边界进行了多次重试；最近一次在 2026-11-06T13:00:42Z 正常退出但仍未输出可用数据库密钥。探测使用隔离的临时 `CHATLOG_DIR`/`HOME`，没有打开数据库、保存原始输出或修改微信文件。脱敏证据见 [`chatlog-wechat2-live-key-probe.json`](chatlog-wechat2-live-key-probe.json) 和 [`chatlog-live-key-probe.json`](chatlog-live-key-probe.json)，因此候选 helper 仍保持 fail-closed，不能据此宣称真实数据可读或 Alpha 原生取钥已恢复。

- `/health`
- `/api/v1/chatlog`
- `/api/v1/contact`
- `/api/v1/chatroom`
- `/api/v1/session`

调用方必须提供绝对路径的 Chatlog 可执行文件和已经解密的 `workDir`。封装会分配随机 loopback 端口，使用临时 `HOME`/`CHATLOG_DIR`，关闭时终止子进程并删除临时配置。它不会自动取钥、读取微信进程、打开 Chatlog MCP、暴露 `/image`、`/video`、`/file`、`/voice`、`/data` 媒体路由，也不会接收或传递数据库密钥。

Chatlog 的 `server` 命令即使只打开已解密的工作目录，也要求存在非空 `data_key` 配置。封装写入的 `independent-workdir` 是固定的非秘密哨兵值，不是数据库密钥；真正的解密和密钥导入仍必须通过 Alpha 独立后端现有的显式导入流程完成。

这个模块目前只提供受控子进程和 HTTP 边界，尚未把 Chatlog 的 JSON 映射成 Alpha 官方 Engine DTO，也没有增加 `87/128` 支持矩阵。Chatlog 的分页、搜索、数据库生命周期和字段语义与 Alpha 不同，因此不能把它直接当作 Alpha 原生后端或真实功能 parity。接入真实数据前仍需用户明确授权的脱敏副本、版本对账、只读快照验证和 DTO 映射测试。

模块还导出一个纯 JSON 的候选 normalizer，用于后续对账。它只接受 Chatlog `/api/v1/chatlog` 返回的消息数组，以及 `/api/v1/contact`、`/api/v1/session` 返回的 `items` 数组，执行字段类型、长度、NUL 字符、时间和数量上限校验后，输出带 `schema=alpha-independent-chatlog-candidate-*`、`candidate=true`、`complete=false`、`native_schema_supported=false` 的独立投影。消息保留 `seq`、会话/发送人、毫秒时间、Chatlog `type/subType`、文本和 `isSelf/isChatRoom`；联系人和会话只保留 Chatlog 明确提供的用户名、显示字段和时间/顺序。normalizer 不生成 `EngineClientFrame`、`sourceToken`、`serverId`、Alpha 分页游标或官方 DTO，也不会把 Chatlog 的字段语义计入支持矩阵；非法或超出边界的输入会失败关闭。

启动后的 `ChatlogCandidate` 还提供 `readContacts({keyword, limit, offset})`、`readSessions({keyword, limit, offset})` 和 `readMessages({time, talker, sender, keyword, limit, offset})` 三个便捷读取方法。它们只请求已允许的 JSON 路由，固定使用 `format=json`，限制每页最多 1000 项和 offset 范围，并直接返回上述 candidate 投影；HTTP 非 200、查询值非法或响应校验失败都会失败关闭。它们仍不提供 Alpha 的账号绑定、generation、官方 cursor、native `serverId` 或 writer 语义。

需要在命令行做一次脱敏副本预览时，可以使用 `npm run chatlog:preview -- --binary /absolute/chatlog --work-dir /absolute/decrypted-work --kind messages --limit 100`，`--kind` 也支持 `contacts` 和 `sessions`，消息还可传 `--talker`、`--sender`、`--time`、`--keyword`。CLI 只把上述显式工作目录交给候选适配器，输出同样带 `candidate=true`、`complete=false` 和 `native_schema_supported=false`；参数错误或 Chatlog 返回异常时退出码为 2，不会生成 Alpha Engine DTO、source token 或写回工作目录。

可以用 `npm run test:chatlog:candidate` 重跑本地 arm64 候选二进制的合成 v4 SQLite smoke。脚本默认读取 `build/candidates/chatlog`，也可以传 `--binary /absolute/chatlog`；它在系统临时目录的 canonical 路径下创建临时目录，生成只包含一条联系人、会话和消息的 `contact.db`、`session.db`、`message_0.db`，分别通过真实 Chatlog 子进程读取三类数据，然后删除临时目录。macOS 的临时目录可能是符号链接，传给候选适配器的路径必须是规范化后的绝对路径；脚本已经按此规则创建目录。候选二进制不存在时命令输出 `status=SKIPPED` 和 `CHATLOG_CANDIDATE_BINARY_MISSING` 并以 0 退出，不加入默认 `npm test`；二进制存在时输出 SHA-256、大小、读取数量和 `realData=false`。该 smoke 只证明固定 Chatlog candidate 能读取 synthetic v4 schema，不验证真实微信数据、数据库密钥、Alpha native DTO 或写入能力。

候选源码固定在 `vendor/chatlog`，其构建和许可证证据见 [chatlog-build-results.json](chatlog-build-results.json) 和 [native-backend-candidates.md](native-backend-candidates.md)。本模块不自动把候选二进制打进发行包，避免在没有真实数据验收和依赖许可复核时改变发行边界。
