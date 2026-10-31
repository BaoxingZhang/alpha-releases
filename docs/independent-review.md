# 独立后端接入审查

日期：2026-11-01。范围：桌面启动分支、原网关入口、应用密码锁、显式离线数据源、账号就绪与只读边界。此记录不代表完整功能等价，也不代表原生安全策略问题已解决。

## 已确认的接入边界

- `src/main/index.js` 的 `EngineClient.startOnce()` 仅在开发模式且显式选择 `ALPHA_RECOVERY_BACKEND=independent` 时调用自有运行器；原模式继续保留原启动和校验流程。
- 独立引擎使用自己的组件标识 `alpha-independent-engine`，协议为 1.0。桌面启动会验证协议和身份。账号就绪来自实际 Go 进程对显式 SQLite 副本的检查，不使用固定的假账号。
- `getCapabilities()` 不提供原产品 entitlement；原桌面映射结果为 `null`。独立实现不签发原作者许可，不修改原二进制、签名或策略。
- 无数据源配置时账号列表确实为空。已配置但缺失或无效的数据源会使握手失败，不能变成空列表成功。重启后已配置密码锁处于锁定状态时，Hello 仅确认独立 Node 服务初始化，不初始化数据源；数据请求返回 `APP_LOCK_LOCKED`。
- 联系人、会话、消息能力由 Go `account.info.capabilities` 派生。只有会话库的合法副本可以列出会话，以用户名显示未提供的联系人名称；不会宣称具备联系人库或消息库能力。
- 账号和 revision 查询会重新调用 `account.info`，触发源文件检查；已打开副本改变后返回 `DATASET_CHANGED`，不继续返回旧的 ready/revision。

## 本轮发现并修复的问题

| 问题 | 修复与验证 |
| --- | --- |
| 密码状态文件的悬空符号链接可能被当成“没有设置密码” | 改用 `lstat` 区分缺失与链接；独立测试要求拒绝初始化 |
| 异步解锁与显式锁定竞争，旧解锁可能覆盖后来锁定 | 锁定在密码操作进行中返回 `APP_LOCK_BUSY`；测试验证已接受的锁定不会被旧操作撤销 |
| 密码限流错误码不匹配现有 UI | 使用 `APP_LOCK_PASSWORD_THROTTLED`；失败次数和重试等待持久化，重启仍拒绝立即重试 |
| 数据源改变后缓存的账号信息仍返回就绪 | 每次源访问进行 Go `account.info` 检查；真实子进程与合成 SQLite 测试复现后通过 |
| 账号固定声明全部读取能力 | 改为实际能力映射，加入仅会话库测试 |
| 只有表名/部分字段不保证查询能够执行 | Go 初始化验证全部使用列；对需要 `rowid` 的表验证其可用且未被同名列遮盖；消息游标要求单列整数 `local_id` 主键 |
| 智能体/HTTP 功能可能绕过 EngineClient 直接启动原网关 | 在独立模式入口明确拒绝，具体如下 |

## 原网关入口的最小改动

以下改动都位于 `src/main/index.js`，仅独立开发模式生效：

1. `PersonaGatewayService.getOrStart()` 在读取模型配置、外部 MCP 配置或启动子进程之前抛出 `INDEPENDENT_FEATURE_UNIMPLEMENTED`。所有检索到的 gateway 调用方均经过该入口；`startConfigured()` 只在类内部由该入口调用。
2. `assertHttpApiAllowed()` 提前返回相同错误。启用 HTTP 的操作在保存配置前失败。
3. `HttpApiService.reconcileNow()` 为以前保存的启用配置保留该明确错误码，状态为 error，不启动连接或监听器。
4. 独立模式不查找或展示原 `alpha-mcp-stdio` 的可执行路径。

没有删除界面功能。尚未接手的智能体、HTTP/MCP 服务保持明确不可用，避免误启动原程序或伪装为可用。原模式与 packaged 模式的原入口已用隔离测试确认仍可到达；此测试不执行原程序，也不能替代其运行环境完整验证。

## 独立测试结果

执行：

```sh
node --test tests/independent-boundary-security.test.cjs tests/independent-boundary-gateway.test.mjs tests/independent-boundary-engine.test.mjs
```

结果：**15/15 通过**。

| 文件 | 数量 | 验证范围 |
| --- | ---: | --- |
| `tests/independent-boundary-security.test.cjs` | 5 | 悬空链接、锁定竞争、持久化限流、已建立状态被删、损坏/公开可读状态 |
| `tests/independent-boundary-gateway.test.mjs` | 6 | 独立模式拒绝原网关；原/packaged 入口保留；HTTP 提前拒绝及状态；不发现原 MCP 命令 |
| `tests/independent-boundary-engine.test.mjs` | 4 | 无源/无效源的区别；锁定时不启动源；部分库真实能力；源改变后不误报就绪 |

网关测试从实际源码 AST 选择类/函数，在受控依赖中执行；不会导入整个 Electron 入口。引擎测试使用真实自有 Go 子进程和新建的合成 SQLite，数据与状态均在项目 `.runtime/` 中，结束后清理。未读取个人微信数据，未向外部服务发请求。

Go 组件另有驱动级只读写入拒绝、数据库字节不变、侧文件和符号链接拒绝、跨分片分页测试；其记录见 `packages/alpha-data-bridge/build-validation.json`。桌面完整链路验证由 `tests/independent-smoke.mjs` 和 `docs/independent-run.json` 记录，不能与上述隔离单元/集成测试混为一项。

## 保留的实际限制

- 当前数据源是明确指定的、稳定的、已解密 SQLite 离线副本。账号 ID 是调用者给数据集分配的标签，Go 明确返回 `idProvenance=caller-supplied-dataset-label`；不把它当成从微信验证出的登录身份。
- SQLite 使用 `mode=ro`、`immutable=1`、`query_only=1`，请求前后校验文件身份、大小、修改时间，拒绝 WAL/SHM/journal 和符号链接。这里验证的是静态副本，不声称能够抵抗恶意进程在检查与打开之间瞬时交换目录。
- 应用密码锁是本地访问控制。它有真实 scrypt 校验和持久化限流，但不加密原数据副本，不提供原 vault 或系统硬件保护，也不让来源目录对操作系统账户的所有者不可读。
- 启动器限制数据源位于项目 `.runtime/`，外层 Seatbelt 阻止实际用户目录内容读取和远程 IP 连接；Electron 仍使用现有路径隔离。没有覆盖系统 `HOME`。Chromium 的 `--no-sandbox` 依赖文档所述的外层 Seatbelt，不能脱离该启动器将其描述为已验证隔离。
- 真实微信自动发现/密钥、实时数据变化、媒体完整解析、搜索/导出、消息修改/发送、AI/外部服务、原许可和发布升级等未由本次测试验证。未实现请求保持明确错误；完整接手进度应继续在 `MAINTENANCE.md` 记录。
