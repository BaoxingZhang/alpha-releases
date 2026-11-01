# 原包模式本地构建与运行验证

本页保留原二进制模式的实测结论。新增独立后端已接入原界面并通过合成数据端到端验证，当前两种模式的区别见 [independent-backend.md](independent-backend.md)。

结论：可从恢复的 JavaScript 重新构建并启动 Electron 界面；原生后端启动失败，尚不能作为完整聊天工具使用。当前 Alpha 启动链路中的原生组件均为原包二进制复用，没有重新编译其原始 Rust/C++ 工程。`vendor/chatlog` 仅作为结构研究和候选核查，未接入原包启动链路；自有独立 Go bridge 是另一条离线维护路径，已在独立模式中单独验证。

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
| 原生 engine | **不可用** | 原程序返回 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`，随后 `application lock is unavailable` |
| 账号与许可 IPC | **受阻** | `accounts.list()`、`license.capabilities()` 返回 `ENGINE_NOT_STARTED`，不是返回空账号数组 |
| 更新服务 | 未配置 | 开发分支 `state=unconfigured`、`download.phase=idle` |
| AI worker | 仅构建和路径配置 | worker 已输出到原网关要求的 `workers/agent/dist/index.cjs`；未调用模型或启动完整 AI 流程 |
| 真实业务 | 未验证 | 未获取微信密钥，未连接数据目录，未检索/导出聊天，未发消息或修改数据 |

`test:smoke` 是界面及隔离冒烟测试，也记录真实后端结果；它不会将后端失败伪装成成功。`checks.backendReady=false` 表示后端未就绪；`checks.emptyAccounts=null` 表示账号查询失败，无法判断其列表状态。测试通过后会关闭自己的窗口和进程。

## 独立后端实际启动

要在原界面中验证可编辑的独立后端，先构建桥接层和桌面产物，再启动合成数据演示：

```sh
npm run build:independent
npm run demo -- --search
```

演示脚本会在项目 `.runtime/` 下生成一次性 SQLite 副本，然后启动 `scripts/launch.mjs --independent`。启动日志应先显示“Opening synthetic WeChat v4 SQLite data”，窗口中可完成离线向导并读取合成会话；它不会扫描个人微信目录。也可以直接运行 `npm run demo` 验证普通会话，或运行 `npm run demo:encrypted` 验证手动密钥导入。演示进程由用户用 Ctrl-C 关闭，生成的目录可安全删除。

直接运行 `npm run start:independent` 时不会自动寻找数据目录；它只启动一个没有配置账号的数据源，适合检查界面和锁状态。要打开指定副本，必须通过 `scripts/launch.mjs --independent --data-dir <项目内 .runtime 目录> --account-id <标识>` 显式传入，启动器会拒绝项目外路径、符号链接和缺少账号标识的配置。

## 打包独立后端

Electron 的 packaged 模式默认仍启动随原包提供的原生 engine。要把恢复的独立后端放入可分发的资源目录，先运行：

```sh
npm run build:packaged
```

该命令会在 `build/packaged-resources/independent/` 生成 `alpha-engine`、`alpha-security`、`alpha-protocol` 和两个只读 Go 适配器。打包器应将这个目录复制为应用 `Resources/independent/`，并保留普通文件属性。安装后的应用只有在同时设置 `ALPHA_RECOVERY_BACKEND=independent` 与 `ALPHA_INDEPENDENT_PACKAGED=1` 时才会选择该后端；缺少任一标记时保持原生启动链路和许可/完整性检查。独立资源不完整时主进程会 fail-closed，不会回退到原生 engine。
本机已用 Electron 44.10.1 实际生成 `.runtime/release-artifacts/Alpha Recovered.app`；manifest 记录 598 个文件、未签名且未公证，结果摘要见 [`independent-validation-current.json`](independent-validation-current.json)。

在本机 macOS arm64 上可以生成未签名的 Electron app：

```sh
npm run package:macos-app
```

如果刚运行过 `npm run build:packaged`，可以使用 `npm run package:macos-app:from-build` 只组装 app，避免重复编译。产物写入 `.runtime/release-artifacts/Alpha Recovered.app`，旁边有包含逐文件 SHA-256 的 manifest。需要制作未签名、未公证的压缩 DMG 时运行 `npm run package:macos-dmg`；这些产物不能绕过 Gatekeeper、授权或原生完整性策略。

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
