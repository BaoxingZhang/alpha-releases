# Alpha offline data bridge

这是自有 Go 读取模块，不依赖 Alpha 原厂 engine/guard，也不导入 Chatlog 的 internal 包。当前支持用户显式指定的、已经解密的离线微信 v4 SQLite 副本：账号信息、联系人、会话、分页消息。这是完整 Alpha 后端的第一批数据依赖，不代表完整功能已经恢复。

源码的 schema 参考固定 [Chatlog v4 数据源](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechatdb/datasource/v4/datasource.go)，查询、验证、协议和分页代码为本项目实现。仅有一个固定 Go module 依赖：`github.com/mattn/go-sqlite3 v1.14.32`；其源码和许可证保留在项目内依赖缓存及 [已有依赖许可索引](../../docs/chatlog-dependency-licenses.json)。没有复制上游实现或改动 `vendor/chatlog`。

在工程根目录构建与测试：

```sh
node scripts/build-data-bridge.mjs
node --test tests/data-bridge.test.mjs
```

构建脚本复用已经校验的 Go 1.24.13，在 `build/data-bridge-source/` 创建构建副本，使用 `-mod=readonly`、CGo 和项目内缓存。它先运行 Go 测试，再生成 [原生程序](../../build/candidates/alpha-data-bridge) 和 [实际构建报告](../../build/candidates/data-bridge-build.json)，并保存包内 [验证记录副本](build-validation.json)。源码目录的 go.mod/go.sum 不会由构建改写。Node 集成测试使用生成的真实 Go 程序和人工 SQLite 数据，没有访问微信用户目录。

启动必须明确传入两项参数：

```text
build/candidates/alpha-data-bridge --data-dir /absolute/offline-copy --account-id dataset-label
```

`account-id` 是调用者指定的数据源标签，不是自动发现或验证的微信登录身份。`account.info` 返回 `idProvenance=caller-supplied-dataset-label`、`sourceKind=offline-wechat-v4`、`readOnly=true`、`live=false`、snapshotId、相对数据库路径和实际可用操作。目录没有兼容数据库、schema 缺列、路径含符号链接、存在 WAL/SHM/journal 时启动失败，错误在 stderr，退出码为 2；不能将该状态映射成成功的空账号。

## JSON-lines 协议

每行一个请求/响应，stdout 只输出 JSON。错误不会终止后续有效请求；超大或损坏的传输导致进程失败。每条请求最多 1 MiB，查询超时 15 秒，分页 limit 为 1 至 500，默认 100。

```json
{"id":"1","op":"messages.list","params":{"conversationId":"wxid_alpha","limit":100,"ascending":true,"cursor":""}}
{"id":"1","ok":true,"result":{"items":[],"nextCursor":"","hasMore":false}}
{"id":"2","ok":false,"error":{"code":"CAPABILITY_UNAVAILABLE","message":"contact.db is not present"}}
```

上面的空 items 只是协议示例；程序只在真实查询没有结果时返回空列表。

| op | 参数 | 返回 |
| --- | --- | --- |
| `account.info`（兼容别名 `accounts.info`） | 无 | 数据源信息；只有打开并验证实际数据库后才能返回 |
| `contacts.list` | `limit`、`cursor`、可选 `usernameExact` | 联系人页，精确 username 查找，不支持模糊搜索 |
| `sessions.list` | `limit`、`cursor` | 会话页，按 sort_timestamp 降序、username/rowid 升序 |
| `messages.list` | `conversationId`、`limit`、`cursor`、`ascending`、可选 `afterTime`/`beforeTime` | 消息页；时间边界是十进制字符串形式的 Unix 秒，包含边界 |

Cursor 是 bridge 产生的不透明 base64url 字符串，绑定本次数据快照和全部筛选/排序参数；调用者原样传回，不能拿另一个查询的 cursor 继续读取。limit 可以调整。消息跨所有分库按 `(sort_seq, database, local_id)` 全局排序，再截取一页；反向分页反转完整排序，不依赖分库的 Timestamp 范围声明。查询不存在的 `Msg_<MD5(conversationId)>` 表会返回真实空页；缺失整个消息库则返回明确不可用。

## 数据与身份

所有整数（包括原始 local_id、server_id、sort_seq、时间、类型和行号）均序列化为十进制字符串，不经过 JavaScript Number。消息不使用 `server_id` 作为唯一键，因为本地记录可以为 0，且跨分库可能重复。

- Contact：`username, localType, alias, remark, nickName, source:{database,table,rowId}`。
- Session：`username, summary, lastTimestamp, sortTimestamp, lastMsgSender, lastSenderDisplayName, source:{database,table,rowId}`。lastSenderDisplayName 是最后发言人名，不是会话名称。
- Message：`conversationId, localId, serverId, sortSeq, localType, createTime, sender, realSenderId, status, content, contentBase64, contentEncoding, packedInfoBase64, source:{database,table,localId}`。

`source.database` 是相对输入根目录的路径。外层 Alpha 协议如果只允许 int32 localId，必须把完整字符串和 source locator 保存在自己的 opaque source token/映射里，不能截断、取模或转成失真的 Number。`status` 保留原值，不代表已验证的消息方向；方向需要明确自己的 username。

`contentBase64` 和 `packedInfoBase64` 保留原始字节。当前没有 zstd/卡片/protobuf 内容解码；有效 UTF-8 才同时填 content，其余标为 `binary`。这不等同于所有消息类型、媒体、引用和压缩内容已经可用，调用者需显示实际不支持状态。

## 读取边界

识别的文件是递归目录内 `contact.db`、`session.db`、`message.db`/`message_<数字>.db`；同一数据源不能有多个 contact/session 库。深度、成员数、分库数均有上限。首次打开验证 SQLite 文件头、核心表和所需列；未知 schema 明确拒绝。

SQLite URI 固定 `mode=ro&immutable=1&_query_only=1`。没有原始 SQL、写入、解密、取密钥、附加库、发送或联网接口。测试直接在连接上尝试写入被拒绝，并证明即使内部关闭 query_only，mode=ro 仍拒绝写入。读取前后检测文件身份/大小/修改时间、目录身份/修改时间和副文件，变化后要求重新打开稳定副本，不热更新。

路径检查拒绝全部祖先和目录成员的符号链接，使用固定数据库命名和参数化条件，不接受请求提供的数据库路径或 SQL 表名。该模块面向调用者控制的稳定离线副本；文件系统检查不是针对恶意并发目录交换的 OS 沙箱，也不宣称为活跃微信数据库提供快照一致性。主程序应继续限制授权目录和数据访问权限。

合成数据入口为 [createFixture](../../tests/data-bridge-fixture.mjs)，也可使用 Python CLI `tests/data-bridge-fixtures.py --output ABS_NEW_EMPTY_DIR`。它创建 4 个数据库，3 个联系人、2 个会话、6 条跨分库消息，包括同 sort_seq、最大有符号 int64、超过 2^53 的 local_id 和二进制内容。测试也覆盖查询参数错误、cursor 绑定、symlink/WAL/坏 schema、运行中修改和新增分库的拒绝。

后续合法手动密钥接入应放在单独的导入/解密服务中：用户本地输入凭据，源文件始终只读，解密到独立受控目录，完成页校验及一致性检查后原子发布给本 bridge；错误密钥不得留下看似有效的数据库。此版本没有实现该服务，没有自动取密钥，也没有更改系统安全设置。
