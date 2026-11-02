# 独立后端接入审查

日期：2026-11-01。范围：桌面启动分支、原网关入口、应用密码锁、显式离线数据源、账号就绪与只读边界。此记录不代表完整功能等价，也不代表原生安全策略问题已解决。

## 已确认的接入边界

- `src/main/index.js` 的 `EngineClient.startOnce()` 在开发模式接受显式 `ALPHA_RECOVERY_BACKEND=independent`，在独立 packaged flavor 中由 `Resources/alpha-backend-mode.json` 受控选择自有运行器；普通 packaged flavor 继续保留原启动和校验流程。
- 独立引擎使用自己的组件标识 `alpha-independent-engine`，协议为 1.0。桌面启动会验证协议和身份。账号就绪来自实际 Go 进程对显式 SQLite 副本的检查，不使用固定的假账号。
- `getCapabilities()` 不提供原产品 entitlement；原桌面映射结果为 `null`。独立实现不签发原作者许可，不修改原二进制、签名或策略。
- 无数据源配置时账号列表确实为空。未锁定的明文源缺失或无效时握手失败；新增加密模式的 Hello 只确认服务，首次账号查询再验证来源并报告等待密钥或错误，不能变成空列表成功。重启后已配置密码锁处于锁定状态时，Hello 仅确认独立 Node 服务初始化，不初始化数据源；数据请求返回 `APP_LOCK_LOCKED`。
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

- 当前读取的数据源是明确指定的、稳定的 SQLite 离线副本；本轮后续新增手动密钥导入器，可先将限定 SQLCipher4 profile 的加密副本验证后转成这样的快照，见下节。账号 ID 是调用者给数据集分配的标签，Go 明确返回 `idProvenance=caller-supplied-dataset-label`；不把它当成从微信验证出的登录身份。
- SQLite 使用 `mode=ro`、`immutable=1`、`query_only=1`，请求前后校验文件身份、大小、修改时间，拒绝 WAL/SHM/journal 和符号链接。这里验证的是静态副本，不声称能够抵抗恶意进程在检查与打开之间瞬时交换目录。
- 应用密码锁是本地访问控制。它有真实 scrypt 校验和持久化限流，但不加密原数据副本，不提供原 vault 或系统硬件保护，也不让来源目录对操作系统账户的所有者不可读。
- 启动器限制数据源位于项目 `.runtime/`，外层 Seatbelt 阻止实际用户目录内容读取和远程 IP 连接；Electron 仍使用现有路径隔离。没有覆盖系统 `HOME`。Chromium 的 `--no-sandbox` 依赖文档所述的外层 Seatbelt，不能脱离该启动器将其描述为已验证隔离。
- 真实微信自动发现/密钥、实时数据变化、媒体完整解析、搜索/导出、消息修改/发送、AI/外部服务、原许可和发布升级等未由本次测试验证。未实现请求保持明确错误；完整接手进度应继续在 `MAINTENANCE.md` 记录。

## 手动加密快照导入：后续独立验证

测试使用 `tests/encrypted-fixture.mjs` 和 `tests/encrypted-fixture-native.c`，没有使用真实微信数据或真实密钥。生成器先调用系统 SQLite 的 `SQLITE_FCNTL_RESERVE_BYTES` 并 `VACUUM`，建立页长 4096、每页真实保留 80 字节的有效 SQLite。没有通过截掉普通 SQLite 页尾制作测试输入。4 个数据库分别为 2、3、3、2 页，包含已知联系人、会话和消息。

加密由独立 Node crypto 实现：32 字节测试 key 作为 PBKDF2 输入，SHA512/256000 次派生 AES 密钥，盐异或 `0x3a` 后以 AES 密钥做 2 次 PBKDF2 得到 MAC 密钥；AES-256-CBC 不填充，HMAC-SHA512 覆盖密文、IV 和小端页号。算法依据为 [SQLCipher 官方设计](https://www.zetetic.net/sqlcipher/design/) 与 [官方 codec 源码](https://github.com/sqlcipher/sqlcipher/blob/master/src/sqlcipher.c)。fixture 使用确定的测试盐和 IV 以便复现，不能用于真实数据加密。

生成器返回明文与密文路径、逐库 SHA256、页数和预期业务内容。原生辅助程序缓存在项目 `.runtime/`，可用 `cleanupEncryptedFixtureHelper()` 清理，进程正常退出也会清理。早期试验生成的系统临时目录已删除。

本轮独立测试结果：

| 测试 | 结果 | 关键观察 |
| --- | --- | --- |
| `tests/import-boundary.test.mjs` | 6/6 通过 | 正确 key 解密后逐库明文哈希一致，真实 bridge 查询得到已知联系人和消息；错误 key/密文/MAC/截断/全零页不发布；已有目标、符号链接、WAL 拒绝；stdin 限制与不回显密钥；URI 特殊字符路径 |
| `tests/import-security-boundary.test.mjs` | 8/8 通过 | 明文合法篡改并恢复 mtime 后重启拒绝；manifest 不能指向外部目录；锁定初始化不访问暂时不可用的源；早失败 key 缓冲擦除；临时明文已经写出后关闭/锁定会取消并清理；manifest 提交后锁定保留完整快照；持久化状态不含测试 key 或应用密码 |
| `tests/snapshot-import.test.mjs` 中原子发布与并发目标两项 | 2/2 独立复跑通过 | 临时明文阶段最终目录不存在；最终目录出现时内容完整；并发创建的目标和标记文件保持原样 |

源码审查确认，Go 使用 macOS `renamex_np(..., RENAME_EXCL)` 完成整个目录的原子提交，没有逐文件发布或覆盖已有目标的回退。SIGTERM 通过 context 进入清理路径；Node 为每次导入建立独占工作目录，等待子进程结束后清理，覆盖强制结束无法执行 Go defer 的情况。

manifest 的 version 为 2，文件名仍为 `manifest.v1.json`。它仅接受本状态根内 `snapshots/snapshot-UUID/data`，重启后校验源和输出的内容哈希、文件清单与长度；锁定期间不做这些数据读取。manifest 原子提交之后若发生锁定，磁盘保留完整可验证快照，调用返回锁定错误并关闭读取句柄，不删除已提交快照而留下悬空 manifest。

最后的桌面接入审查发现原 `EngineRequestQueue` 会把锁控制排在长导入之后。现仅在独立开发模式将 `importDatabaseKey` 分入 bypass 队列，后端仍只允许一个导入；原模式与 packaged 行为保留。`tests/independent-import-queue.test.mjs` 的4项测试直接执行真实队列与调用方法，验证导入未完成时状态/锁定可发出及原模式行为。`tests/encrypted-smoke.mjs` 另在实际 Electron 中暂停本应用的真实导入进程，验证状态响应、锁定取消、子进程退出、工作目录清理与旧快照继续可读。

这些检查证明合成数据的算法、文件一致性和隔离行为；没有验证真实微信数据库的全部版本变体，也不包含自动获取密钥。应用锁仍不是磁盘加密，导入后的明文快照受项目目录权限和访问锁管理。manifest 哈希用于本地状态的一致性检查，不宣称是原作者签名或外部可信来源认证。
