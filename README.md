# Alpha 0.3.5 恢复工程

这是从 `Alpha-0.3.5-arm64.dmg` 整理出的可编辑工程：重建 Electron 主进程、预加载、React 界面和 AI worker 的 JavaScript，复用原包 macOS arm64 原生二进制。

**已实际构建并打开首次设置界面；尚未达到完整业务可运行状态。** 原生后端返回 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`，账号读取和授权能力随之不可用。最终运行记录见 [local-run.json](docs/local-run.json)，截图见 [local-run.png](docs/local-run.png)。这是恢复后的 JavaScript 工程，并非作者原始 TypeScript/Rust/C++ 源码仓库。

长期维护以尽量完整保留现有功能为目标，范围与逐项验收条件见 [MAINTENANCE.md](MAINTENANCE.md)。

## 本机使用

当前依赖和 Electron 已安装。修改 `src/` 后，在项目目录执行：

```sh
npm run build
npm start
```

重新安装依赖时，使用 Node.js 24.x 且 >=24.15（本机验证版本 24.21.0）、macOS arm64：

```sh
npm ci
npm run setup
npm run build
npm run test:smoke
```

Electron 44 的二进制安装是独立步骤，因此保留 `npm run setup`。恢复工程固定 Electron 44.0.0、esbuild 0.28.2、Playwright Core 1.64.1；`package-lock.json` 是此次新增的锁文件。React 19.2.8 等前端运行时已经包含在原 renderer chunks 中，无需再装一份 React。

`npm start` 默认离线隔离运行，数据位于项目 `.runtime/manual/`；每次自动测试使用新的 `.runtime/smoke-*/`。它保留真实开发模式，不伪装发行版。启动适配器将 Electron 的用户、文档、配置、缓存、临时路径指向项目内，外层 macOS Seatbelt 阻止读取用户主目录中项目外的文件内容，并拒绝远程 IP 出站连接，允许本机 loopback 用于自动测试。原生子进程继承同一沙箱。离线适配器将 Electron `safeStorage` 标为不可用，并让加解密调用明确失败，以避免系统钥匙串请求卡住启动；依赖其存储的凭据功能因此不可用，不使用明文回退。未导入真实账号、数据库、密钥或许可。

macOS 不允许 Chromium 在已受 Seatbelt 约束的子进程中再次初始化沙箱，所以本地启动命令传入 `--no-sandbox`，由外层 Seatbelt 继续约束整个进程树。原代码的 `contextIsolation`、`nodeIntegration: false` 和 `webSecurity` 保留。这是本地隔离分析启动器，不是生产发行配置；`npm start` 不会解除外层限制。

## 项目结构

| 路径 | 用途 |
| --- | --- |
| `src/main/index.js` | 恢复的 Electron 主进程，含业务 IPC、原生服务管理、AI 接入和窗口逻辑 |
| `src/preload/` | 主窗口、图片查看器、通知窗口桥接 |
| `src/renderer/` | HTML、CSS、React 编译后 JS、图片及静态资源 |
| `src/agent-host/index.cjs` | 可编辑的 AI worker，保留原 `src/*.ts` 模块标记 |
| `packages/alpha-protocol/` | 独立提取的真实请求/响应编解码与stdio分帧，含来源清单和测试 |
| `vendor/chatlog/` | 固定版本的Go源码候选子模块，尚未接入Alpha |
| `scripts/` | 新增构建、隔离启动和资源校验工具 |
| `vendor/runtime/` | 原包运行时的未修改副本，43 个文件，SHA256 和权限有记录 |
| `dist/app/` | JavaScript 构建产物及开发启动适配入口 |
| `workers/agent/dist/` | AI worker 构建产物，满足原网关的开发目录约定 |
| `build/runtime-bundle/` | 构建时复制的原生资源，使用真实目录以通过原路径检查 |
| `provenance/` | 原包 package.json、恢复文件 SHA256、REA 证据引用 |
| `docs/` | 源码导航、缺口、构建和本地运行证据 |

`src/` 的 169 个文件在首次整理时与提取内容逐字节一致。未将大 bundle 机械拆成假定的原始模块；可使用 [修改指南](docs/editing-guide.md) 和 [代码索引](docs/recovered-code-index.json) 定位。索引包括 11 个 JS 模块、5806 个函数/类、562 个 React 组件候选，含第三方代码。

esbuild 会重新处理 11 个 JS 文件并生成调试 source map。这里的映射回到 `src/` 中的恢复 JavaScript，不是原始 TS/TSX。renderer chunk 文件名和相互导入路径保留，防止破坏原 HTML、动态加载与资源引用。

## 验证与边界

```sh
npm run verify:protocol # 校验独立协议模块仍与恢复源一致
npm run test:protocol   # 编解码、分帧边界与来源测试
npm run verify:vendor   # 核对43个原包运行时文件的SHA256和权限
npm run test:smoke      # 隔离检查、实际Electron界面、IPC与后端状态诊断
npm run index          # 根据当前src重新生成导航索引
```

`test:smoke` 的成功退出表示隔离和界面冒烟通过，**不表示后端 ready**；后端结果单独写入 `docs/local-run.json` 的 `checks.backendReady`。本轮未连接微信、未触发密钥获取、未发消息、未调用模型，也未验证聊天检索、导出等真实数据流程。

主要缺口包括原 TS/TSX 与类型、完整开发工作区、原依赖锁、Cargo/Rust 和 C++/CMake 工程、原生协议生成工程、服务端授权实现，以及未随包提供的高级组件和语音模型。原生程序依赖自身的完整性、身份、许可及有效期检查，已有二进制不能保证恢复工程完整可用。

详细见 [缺失部分清单](docs/source-gaps.md)、[本地验证说明](docs/local-build-and-run.md)、[原生资源来源](docs/native-runtime-provenance.json)。原始商标、第三方许可文件及 bundle 中的许可注释保留；本工程未给恢复代码重新声明开源许可证。

## 独立后端接手基础

已从实际main的AST依赖闭包中提取独立 [协议模块](packages/alpha-protocol/README.md)：900个顶层绑定，128类请求、129类响应，12项测试通过。它仅加载protobuf wire，不启动Electron，也不提供或伪造后端业务结果。原桌面入口当前仍使用原恢复逻辑；协议模块供后续兼容后端和模块化迁移使用。

已固定引入 [imldy/chatlog](https://github.com/imldy/chatlog/tree/a7162bca9454fa43b5950a2414670983fe180e56) 源码子模块，提交 `a7162bca9454fa43b5950a2414670983fe180e56`。它提供一部分可维护的数据读取基础，但不是Alpha引擎的直接替代品，也没有接入当前界面。范围见 [候选核查](docs/native-backend-candidates.md)；新增源码保留原许可证及依赖许可。

以后克隆本项目时需同时取得子模块：

```sh
git submodule update --init --recursive
```

原Alpha后端、自有协议模块和候选Go代码应分别验证。不能用其中任一编译成功，代替完整Alpha功能已迁移的结论。

候选源码已在本机实际编译为 arm64 可执行文件，构建记录见 [chatlog-build-results.json](docs/chatlog-build-results.json)。只验证了源码编译与产物架构，没有启动候选服务或验证真实微信数据，也未接入Alpha。重建命令：

```sh
node scripts/setup-go.mjs
node scripts/build-chatlog.mjs
```

Go工具链和缓存均放在项目 `.runtime/`，安装包摘要来自 [Go官方下载目录](https://go.dev/dl/)，不会修改系统Go或shell配置。原生完整性问题的已确认调用链见 [诊断报告](docs/native-startup-diagnosis.json)。

完整 [128项后端请求对照](docs/backend-compatibility-map.md) 已建立：候选提供读取基础6项、需要组合或新建30项、缺失92项，当前直接兼容0项。此统计是请求契约层面的覆盖，不能换算成已恢复功能百分比。
