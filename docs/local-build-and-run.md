# 原包模式本地构建与运行验证

本页保留原二进制模式的实测结论。新增独立后端已接入原界面并通过合成数据端到端验证，当前两种模式的区别见 [independent-backend.md](independent-backend.md)。

结论：可从恢复的 JavaScript 重新构建并启动 Electron 界面。项目的 Seatbelt 隔离 smoke 会让原生安全 host 拒绝 peer-image，因而该隔离报告中的 backend 不可用；单独运行 `test:smoke:native` 时，使用临时状态目录且不改原生文件，原生 engine/native-host handshake 可以进入 ready。两种结果都不能替代真实账号和业务验收。当前 Alpha 启动链路中的原生组件均为原包二进制复用，没有重新编译其原始 Rust/C++ 工程。`vendor/chatlog` 仅作为结构研究和候选核查，未接入原包启动链路；自有独立 Go bridge 是另一条离线维护路径，已在独立模式中单独验证。

## 验证结果

项目根目录的 `.nvmrc` 固定本地复现基线为 Node.js 24.21.0；`npm run check:maintainability` 会确认这个版本仍落在 `package.json` 的 Node 引擎范围内。使用 nvm 时先运行 `nvm use`，再执行下面的安装和构建命令。未使用 nvm 的环境仍需自行安装满足引擎范围的 Node.js 24.x。

最终机器记录为 [local-run.json](local-run.json)，原生日志为 [local-run.log](local-run.log)，实际截图为 [local-run.png](local-run.png)。测试运行于 macOS arm64，Electron 44.10.1，使用新建的空白项目内配置目录。

| 层次 | 结果 | 证据/限制 |
| --- | --- | --- |
| JavaScript 编译 | 通过 | esbuild 重新处理主进程、3 个 preload、6 个 renderer chunks、1 个 agent worker；产物与 source map 已生成 |
| 静态资源 | 通过 | HTML/CSS/图片复制到正确目录，首次设置页实际渲染 |
| Electron 主进程及 preload | 通过 | `app.isPackaged=false`，版本 0.3.5，`window.alpha` 存在并提供 23 个顶层能力分组 |
| renderer | 通过 | 首次设置页显示“连接你的微信”，本轮监听未捕获 renderer error；未连接账号 |
| 隔离检查 | 通过 | 项目内文件可读；项目外临时测试标记读取遭 EPERM；远程 IP 连接遭 Operation not permitted |
| 钥匙串隔离 | 显式不可用 | `safeStorage.isEncryptionAvailable()` 为 false，加解密调用抛 `RECOVERY_KEYCHAIN_DISABLED`，不读取或保存真实凭据 |
| 原生 engine（项目 Seatbelt smoke） | **隔离环境不可用** | 原程序在项目 `/usr/bin/sandbox-exec` wrapper 下返回 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`，随后 `application lock is unavailable`；这项结果单独保留，不代表 native 文件损坏 |
| 原生 engine（`test:smoke:native`） | **启动链路通过** | 临时 HOME/userData 下返回 backend `ready`，组件为 `engine` 0.3.5 与 `native-host` 0.1.0；账号为空是 disposable 状态，没有真实账号读取 |
| 账号与许可 IPC（项目 Seatbelt smoke） | **受阻** | 隔离原生 engine 未启动时，`accounts.list()`、`license.capabilities()` 返回 `ENGINE_NOT_STARTED`，不是返回空账号数组；native smoke 可查询到空 disposable accounts 和无 grants capabilities |
| 更新服务 | 未配置 | 开发分支 `state=unconfigured`、`download.phase=idle` |
| AI worker | 仅构建和路径配置 | worker 已输出到原网关要求的 `workers/agent/dist/index.cjs`；未调用模型或启动完整 AI 流程 |
| 真实业务 | 未验证 | 未获取微信密钥，未连接数据目录，未检索/导出聊天，未发消息或修改数据 |

`test:smoke` 是界面及隔离冒烟测试，也记录真实后端结果；它不会将后端失败伪装成成功。`checks.backendReady=false` 表示后端未就绪；`checks.emptyAccounts=null` 表示账号查询失败，无法判断其列表状态。测试通过后会关闭自己的窗口和进程。

### 原生运行时的独立 smoke

项目的 Seatbelt 隔离 smoke 与原生 peer-image 校验存在边界：`test:smoke` 使用 `/usr/bin/sandbox-exec`，原生 `alpha-security-host` 会在该外层沙箱下返回 `RUNTIME_PEER_IMAGE_NOT_ALLOWED`，随后桌面层显示 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`。这项结果保留为“隔离环境下原生不可用”，不等同于原生文件或签名损坏。

要单独验证原生运行时的启动链路，可运行：

```sh
npm run test:smoke:native
```

该命令不使用项目的自定义 Seatbelt wrapper（Electron 子进程仍按现有本地 smoke 约定使用 `--no-sandbox`）；这只改变 Chromium 的本地渲染隔离，不修改或绕过 Alpha 原生 guard、签名、许可或 peer manifest。命令仍使用项目 `.runtime/<session>/` 下的临时 HOME、userData、临时目录和原生路径；它不扫描个人微信目录、不注入账号、不修改 `vendor/runtime`，也不调用写入、发送或网络业务。成功标准是 renderer/IPC 可读、backend `state=ready`，并同时看到 `engine` 与 `native-host` 组件；空账号数组只表示本次 disposable userData 没有配置账号。每次运行的完整报告写入被忽略的 `.runtime/<session>/native-smoke.json`，与 `test:smoke` 的 sandbox 报告分开保存。

启动 smoke 之后，可运行 `npm run audit:native-abi` 对两个随包 WCDB dylib 做静态 ABI 盘点。它只读校验来源哈希/权限、arm64 Mach-O、代码签名、系统依赖和导出名字，不调用 `_alpha_native_get_api` 或 `_alpha_sqlite_readonly_get_api`，不访问账号目录；它不能代替真实数据库 fixture、ABI 头文件或 native schema 验收。

## 独立后端实际启动

要在原界面中验证可编辑的独立后端，先构建桥接层和桌面产物，再启动合成数据演示：

```sh
npm run build:independent
npm run demo -- --search
```

演示脚本会在项目 `.runtime/` 下生成一次性 SQLite 副本，然后启动 `scripts/launch.mjs --independent`。启动日志应先显示“Opening synthetic WeChat v4 SQLite data”，窗口中可完成离线向导并读取合成会话；它不会扫描个人微信目录。也可以直接运行 `npm run demo` 验证普通会话，或运行 `npm run demo:encrypted` 验证手动密钥导入。演示进程由用户用 Ctrl-C 关闭，生成的目录可安全删除。

直接运行 `npm run start:independent` 时不会自动寻找数据目录；它只启动一个没有配置账号的数据源，适合检查界面和锁状态。要打开指定副本，必须通过 `scripts/launch.mjs --independent --data-dir <项目内 .runtime 目录> --account-id <标识>` 显式传入，启动器会拒绝项目外路径、符号链接和缺少账号标识的配置。

## 打包独立后端

Electron 的 packaged 模式提供两个明确 flavor。普通 `Alpha Recovered.app` 默认启动随原包提供的原生 engine；独立 flavor 通过应用包内的受控 marker 默认启动本项目独立后端，不需要从终端注入环境变量。两者都保留原生完整性、签名和许可边界。先运行：

```sh
npm run build:packaged
```

该命令会在 `build/packaged-resources/independent/` 生成 `alpha-engine`、`alpha-security`、`alpha-protocol` 和两个只读 Go 适配器。打包器会将这个目录复制为应用 `Resources/independent/`，并保留普通文件属性。独立资源不完整时主进程会 fail-closed，不会回退到原生 engine。开发启动器使用 `ALPHA_RECOVERY_BACKEND=independent` 显式选择独立资源；手工模拟已打包进程时才需要再设置 `ALPHA_INDEPENDENT_PACKAGED=1`。正式组装时使用下面的独立 flavor 命令，应用会写入 `Resources/alpha-backend-mode.json` 并在双击启动时选择独立后端。
本机已用 Electron 44.10.1 实际生成 `.runtime/release-artifacts/Alpha Recovered.app` 和 `.runtime/release-artifacts/Alpha Recovered Independent.app`；打包器为两个 flavor 分别生成 `Contents/MacOS/AlphaRecovered` 与 `Contents/MacOS/AlphaRecoveredIndependent`，并同步更新 `CFBundleExecutable`，从生成的 `.app` 二进制启动时 Electron 报告 `app.isPackaged=true`。两个 app 均未签名且未公证；独立 flavor 额外包含 `Contents/Resources/alpha-update-mode.json`，默认关闭原作者更新源。打包资源包含自包含的 `@bufbuild/protobuf` wire 运行时依赖；逐文件结果见各自 manifest，验证摘要见 [`independent-validation-current.json`](independent-validation-current.json)。

本轮通过 `npm run test:packaged-independent` 直接启动独立 flavor 的生成二进制，未向进程注入 `ALPHA_RECOVERY_BACKEND` 或 `ALPHA_INDEPENDENT_PACKAGED`，只通过 `Resources/alpha-backend-mode.json` 选择独立后端。smoke 检查 `app.isPackaged=true`、`Resources/app` 与 `Resources/independent` 路径，随后经 packaged renderer→preload→main IPC 读取一次性 SQLite fixture，得到 backend `ready`、组件 `alpha-independent-engine`、账号 `synthetic-account` 和消息 `first source`。这项验证仍只覆盖独立离线 fixture；它不证明原生完整性、真实微信 schema 或真实数据可用。

在本机 macOS arm64 上可以生成未签名的 Electron app：

```sh
npm run package:macos-app
```

如果刚运行过 `npm run build:packaged`，可以使用 `npm run package:macos-app:from-build` 只组装 app，避免重复编译。产物写入 `.runtime/release-artifacts/Alpha Recovered.app`，旁边有包含逐文件 SHA-256 的 manifest。需要制作未签名、未公证的压缩 DMG 时运行 `npm run package:macos-dmg`；这些产物不能绕过 Gatekeeper、授权或原生完整性策略。

要生成可直接双击使用独立后端的自有 flavor：

```sh
npm run package:macos-app:independent
# 或
npm run package:macos-dmg:independent
```

该 flavor 只选择 `Resources/independent` 下已验证的本项目后端；它仍然需要用户导入或选择离线数据副本，不能读取真实微信目录，也不代表完整 Alpha parity。

## 本次补齐的工程部分

- 新建 `package.json`/`package-lock.json`，固定构建依赖和 Electron 版本。
- esbuild 保持 renderer 原 chunk 文件名和引用关系，生成面向恢复 JS 的 source map。
- 新建 `bootstrap.cjs`，在加载原 main 之前设置项目内用户、文档、配置、缓存、临时目录，保持原开发模式。
- 原 main 将 `app.getAppPath()` 向上两层当作 workspace，所以使用 `dist/app` 布局。
- `build/runtime-bundle` 使用真实目录和原样复制：原 `readBoundedFile()` 检查所有祖先目录，符号链接会导致 `WCDB_WRITER_BUNDLE_INVALID`。该警告在改成复制后消失。
- 显式关闭本地消息修改、防删除、防撤回开关。原 `FEATURES` 对应变量是 `ALPHA_ENABLE_LOCAL_MESSAGE_MUTATIONS`、`ALPHA_ENABLE_MOMENTS_ANTI_DELETE`、`ALPHA_ENABLE_MESSAGE_ANTI_RECALL`。
- AI worker 的构建路径满足原 `resolvePaths()` 约定，Node 执行器指向项目内 Electron；原网关只在 worker 子进程设置 `ELECTRON_RUN_AS_NODE=1`。
- `npm start` 和 smoke 统一使用外层 macOS Seatbelt。由于 macOS 拒绝嵌套 sandbox 初始化，Chromium 以 `--no-sandbox` 在该外层沙箱内运行。没有将它变成无外层限制的启动命令。
- 在隔离环境中，原 `safeStorage.isEncryptionAvailable()` 可能阻塞于系统钥匙串 `SecItemAdd → AuthorizationCopyRights`。采样定位后，恢复入口将此功能关闭并使加解密调用直接失败；没有添加明文、固定密钥或虚假许可回退。该适配之后，最终记录从 bootstrap 到首次主页面 `did-finish-load` 小于一秒。

在本页最初基线验证时，`src/` 与 `vendor/runtime/` 均为原提取内容。本轮维护已增加 main 与 renderer 的明确源码修改；原 `vendor/runtime/` 仍保持原样。源码目录内文件 SHA256、原生资源哈希及权限的最终检查见 [recovery-validation.json](recovery-validation.json)。

## 原生阻塞的已知边界

原生文件与 DMG 副本的 SHA256 一致，`alpha-security-host` 的 macOS 代码签名通过磁盘校验。路径软链问题已经排除，原生安全策略仍拒绝当前启动环境。macOS 代码签名通过不等于其内部运行时完整性校验通过。

本轮没有确定 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY` 的完整触发条件。原生文件含独立状态目录和 HOME 引用；这些路径并不完全由 Electron `app.setPath()` 控制，沙箱继续阻止实际用户目录内容访问。未使用真实用户状态来满足检查。未发现明确可用的外部策略路径配置项；也没有证据将此错误解释为已过期。组件清单显示的日期、签名和公钥均保持原样。

继续推进完整业务运行，需要取得受支持的原生开发构建及其配置/策略，或者原始 Rust/C++ 工程和对应开发材料。当前恢复工程适合阅读、修改及验证界面/主进程 JavaScript；要交付完整可维护应用，还需要补齐 [source-gaps.md](source-gaps.md) 中的原生、远端和组件缺口。

后续有限静态诊断已经定位到原生自镜像/内存段检查与内嵌策略绑定，`-103` 映射为完整性类别；仍未确定实测命中的具体分支。8 个 peer 文件均匹配随包清单，状态读取失败对应另外的错误分支，因此不把 HOME 路径或当前未过期的策略日期当作根因。详见 [native-startup-diagnosis.json](native-startup-diagnosis.json)。
