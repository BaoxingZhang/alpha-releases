# 独立 Node 协议引擎

这是自有后端的真实适配层。输入为恢复的 `EngineClientFrame`，输出为 `EngineServerFrame`，均使用 4 字节大端长度前缀。数据库读取委托同项目的 Go `alpha-data-bridge`，应用锁委托 `alpha-security`；不加载 Electron、恢复后的整份 main 或原闭源引擎。

当前实现 128 个请求分支中的 13 个，其余 115 个明确返回 `UNIMPLEMENTED`。这只是完整功能接手的第一步：搜索、媒体解析、朋友圈、导出、任务、统计、AI、账号密钥和写入等功能仍需逐项实现，不把页面能打开视作功能完成。完整范围仍见 `docs/backend-compatibility-map.json`。

## 启动与模块边界

入口为 `cli.cjs`。要求 Node 24.15+、已构建 Go bridge，以及已存在且不含符号链接的状态目录。目录和数据库只接受调用者显式配置；不扫描用户目录或运行中的微信。

| 环境变量 | 含义 |
| --- | --- |
| `ALPHA_INDEPENDENT_STATE_DIR` | 必填，应用锁和选中数据源的独立状态目录 |
| `ALPHA_INDEPENDENT_BRIDGE_PATH` | 配置数据时必填，Go 可执行文件绝对路径 |
| `ALPHA_INDEPENDENT_DATA_DIR` | 可选，经过授权的离线 SQLite 副本目录绝对路径 |
| `ALPHA_INDEPENDENT_ACCOUNT_ID` | 配置数据时必填，调用者指定的数据集标识，不代表验证过的微信登录身份 |
| `ALPHA_INDEPENDENT_SELF_USERNAME` | 可选，显式提供的自身 username；缺失时消息方向为 unknown |

无数据配置时，账号清单真实为空。配置错误或 Go 退出会返回错误，不变成成功的空清单。正常未锁定启动只有在 `account.info` 验证实际 SQLite 成功后才接受 Hello。已锁定启动只初始化自己的安全与协议层，Hello 不声明源已验证，所有账号和数据请求仍受锁限制。

模块用途：

- `index.cjs`：方法分派、协议 DTO 映射、账号选择及 `runStdio`。`createEngine` 要求真实 `lock`，每个数据请求在异步工作前后检查访问状态。
- `bridge-client.cjs`：独立 Go 子进程、JSONL 请求相关性、大小/超时限制和故障传播。
- `cli.cjs`：读取明确配置、创建真实安全模块、传输生命周期；EOF、SIGINT、SIGTERM 都关闭 Go 子进程。

stdout 只输出二进制协议。stderr 仅输出初始化错误码，不转发 Go 的源路径或数据内容。

## 已实现的协议

Hello 身份为 `alpha-independent-engine`，协议 1.0。`supportedMethodIds` 使用恢复协议中 `EngineClientFrame` 的字段编号，测试直接对照静态覆盖清单校验。

| 方法 | 字段编号 | 实际行为 |
| --- | ---: | --- |
| hello | 10 | 自有引擎版本协商；不冒充原引擎的 bootstrap 证明 |
| getCapabilities | 11 | 无原产品 entitlements，返回空对象 |
| listAccounts | 12 | 显式离线数据源的实时验证及账号状态 |
| selectAccount | 13 | 成功验证后持久保存选择 |
| listConversations | 14 | 真实会话表分页，联系人备注/昵称为名称；无 contact.db 时回退 username |
| listMessages | 15 | 跨分库稳定分页、顺序和排他毫秒时间范围 |
| discoverAccounts | 29 | 仅接受与已配置源路径完全一致的 sourceLocation |
| listContacts | 42 | 升序、offset/limit 和 `__alpha_contact_exact:` 精确 username 查询 |
| getApplicationLockStatus | 48 | 真实独立密码锁状态 |
| unlockApplication | 50 | 真实密码校验、失败退避和持久状态 |
| lockApplication | 51 | 关闭数据桥并锁定访问 |
| getDataRevision | 105 | 由真实已验证 snapshotId 导出的 16 位十六进制 revision |
| configureApplicationLock | 131 | enable_password / change_password / disable，交给真实安全模块 |

账号 capabilities 来自 Go 实际可用数据库；只有 session.db 的副本不会宣布 contacts 或 messages。每次查询账号状态或 revision 都重新调用 Go 验证不可变快照，文件变动不会沿用缓存 ready。

`detectAccountDataSources` 是桌面 main 的本地 IPC，不在这 128 个协议方法中，需由桌面独立适配器把验证过的账号映射成候选。原许可证、在线密钥获取、锁 provision/reset 均未模拟；重置必须先设计安全状态清理语义。

## 数据与兼容限制

目前只接受 Go bridge 支持的离线明文 SQLite v4 schema。查询使用只读数据源；缺库、schema 不兼容、目录或文件改变、活动 WAL/SHM/journal 均按真实错误传播。

- Go 游标保留原不透明字符串，放入 protobuf bytes；不修改其内部 snapshot/query 绑定。
- serverId 保持 int64 BigInt。原协议 Message.localId 是 int32，超过范围时此旧字段为 0（不可用），完整字符串保存在独立 `sourceToken`，稳定消息 ID 也包含数据库/表/完整 localId。原桌面转换仅接受原 `media1_` 格式，会过滤独立 token，因此旧 UI 尚无完整 localId 新字段；后续应扩展自有 DTO，不能假装原媒体/写入 token。所有写入方法目前均未实现。
- 消息文本保持原 UTF-8。zstd 内容在当前运行时支持并能安全解压时读取，否则返回 kind=`unsupported` 和明确的占位说明“[未支持的二进制消息内容]”；占位文本不是原始消息内容。XML/富媒体业务结构尚未完整解析，媒体文件不自动读取。
- 消息方向仅依赖显式 SELF_USERNAME 与真实 sender；缺失任一时为 unknown，不从状态字段猜测。
- 联系人高级 directory/lookup、模糊查询和降序尚未实现，直接返回 `UNIMPLEMENTED`。每次页大小最多 500；会话/消息通过 nextCursor 继续读取。
- 密码请求的 Uint8Array 在分派 finally 中清零，安全模块不持久保存明文；该锁是应用访问控制，不是对离线数据库的磁盘加密。

## 验证

在项目根目录，先构建 `build/candidates/alpha-data-bridge`，再运行：

```sh
node --test tests/engine.test.mjs tests/independent-boundary-engine.test.mjs
```

测试仅由 `tests/data-bridge-fixture.mjs` 创建合成 SQLite，并通过真实 Node 子进程 → protobuf → 真实 Go 子进程验证。覆盖分片/粘包、协议方法编号、115 个未实现分支、账号选择重启、联系人/会话/跨分库消息、64 位 ID、时间范围和游标绑定、密码锁/退避/重启、超长/截断/无效帧、子进程失败和源改变。故障注入的小脚本只用于超时/无效输出测试，不作为正常数据实现。
