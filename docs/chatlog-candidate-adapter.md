# Chatlog 候选读取适配层

`packages/alpha-engine/chatlog-candidate.cjs` 是一个独立的、显式 opt-in 的候选读取封装。它为已经准备好的微信 v4 解密工作目录启动固定版本的 Chatlog 子进程，并把访问限制在本机 loopback 的只读 JSON 路由：

- `/health`
- `/api/v1/chatlog`
- `/api/v1/contact`
- `/api/v1/chatroom`
- `/api/v1/session`

调用方必须提供绝对路径的 Chatlog 可执行文件和已经解密的 `workDir`。封装会分配随机 loopback 端口，使用临时 `HOME`/`CHATLOG_DIR`，关闭时终止子进程并删除临时配置。它不会自动取钥、读取微信进程、打开 Chatlog MCP、暴露 `/image`、`/video`、`/file`、`/voice`、`/data` 媒体路由，也不会接收或传递数据库密钥。

Chatlog 的 `server` 命令即使只打开已解密的工作目录，也要求存在非空 `data_key` 配置。封装写入的 `independent-workdir` 是固定的非秘密哨兵值，不是数据库密钥；真正的解密和密钥导入仍必须通过 Alpha 独立后端现有的显式导入流程完成。

这个模块目前只提供受控子进程和 HTTP 边界，尚未把 Chatlog 的 JSON 映射成 Alpha 官方 Engine DTO，也没有增加 `82/128` 支持矩阵。Chatlog 的分页、搜索、数据库生命周期和字段语义与 Alpha 不同，因此不能把它直接当作 Alpha 原生后端或真实功能 parity。接入真实数据前仍需用户明确授权的脱敏副本、版本对账、只读快照验证和 DTO 映射测试。

模块还导出一个纯 JSON 的候选 normalizer，用于后续对账。它只接受 Chatlog `/api/v1/chatlog` 返回的消息数组，以及 `/api/v1/contact`、`/api/v1/session` 返回的 `items` 数组，执行字段类型、长度、NUL 字符、时间和数量上限校验后，输出带 `schema=alpha-independent-chatlog-candidate-*`、`candidate=true`、`complete=false`、`native_schema_supported=false` 的独立投影。消息保留 `seq`、会话/发送人、毫秒时间、Chatlog `type/subType`、文本和 `isSelf/isChatRoom`；联系人和会话只保留 Chatlog 明确提供的用户名、显示字段和时间/顺序。normalizer 不生成 `EngineClientFrame`、`sourceToken`、`serverId`、Alpha 分页游标或官方 DTO，也不会把 Chatlog 的字段语义计入支持矩阵；非法或超出边界的输入会失败关闭。

候选源码固定在 `vendor/chatlog`，其构建和许可证证据见 [chatlog-build-results.json](chatlog-build-results.json) 和 [native-backend-candidates.md](native-backend-candidates.md)。本模块不自动把候选二进制打进发行包，避免在没有真实数据验收和依赖许可复核时改变发行边界。
