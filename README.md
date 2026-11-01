# Alpha 0.3.5 恢复工程

这是从 `Alpha-0.3.5-arm64.dmg` 整理出的可编辑工程：重建 Electron 主进程、预加载、React 界面和 AI worker 的 JavaScript，复用原包 macOS arm64 原生二进制。

**已能本地编译，并使用自有后端在原界面中读取、搜索、定位和导出离线微信 v4 聊天数据。** 已接通手动密钥导入与加密快照、联系人/会话/消息读取、联系人查询与有限档案存在性读取、联系人和群成员 CSV/JSON/VCF/HTML/XLSX 导出、跨分库分页、全账号和会话搜索、日期导航、会话/账号媒体元数据浏览及 metadata-only JSON/CSV 导出、部分消息结构化展示、JSON/Markdown/HTML/TXT/XLSX 会话导出，以及基于已验证消息 DTO 的 `chatlab-json`/`chatlab-jsonl`/`sql`/`weclone` 派生导出、payments/revokes/calls 候选资料的 xlsx/csv/json 导出、年度基础统计、会话关系基础统计、应用锁，以及有界后台定时导出计划和重启恢复。派生格式不声称与原 Alpha/native formatter 或第三方工具完全兼容。独立引擎还提供可选的本机受控 HTTP/MCP 适配器（包含已验证 DTO 查询、会话文件导出和媒体 JSON/CSV 元数据导出）。完整 Alpha 功能仍未恢复；真实微信数据、自动取钥、原生媒体、AI 和其他导出格式等尚待接手。朋友圈、收藏和“其他资料”记录的证据边界分别见 [朋友圈 schema 证据](docs/moments-schema-evidence.md)、[收藏 schema 证据](docs/favorites-schema-evidence.md) 和 [其他资料记录证据](docs/general-records-schema-evidence.md)。完整接手范围详见 [独立后端与实测](docs/independent-backend.md)、[独立 HTTP/MCP 适配器](docs/http-readonly-adapter-recovery.md)、[加密导入](docs/encrypted-import.md) 和 [搜索导航](docs/search-navigation.md)。

原包模式仍保留，启动仍返回 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`，记录见 [local-run.json](docs/local-run.json)。这是恢复后的 JavaScript 工程与新增维护模块，并非作者原始 TypeScript/Rust/C++ 源码仓库。

长期维护以尽量完整保留现有功能为目标，范围与逐项验收条件见 [MAINTENANCE.md](MAINTENANCE.md)。

## 本机使用

当前依赖、Electron 和项目内 Go 工具链已安装。先运行合成数据演示：

```sh
npm run build:independent
npm run demo
```

打开后勾选本地数据说明，点击“打开数据副本”，跳过图片密钥步骤并完成向导，即可查看合成会话。演示不读取个人微信数据。

要演示加密副本的手动密钥流程，运行 `npm run demo:encrypted`，将终端显示的合成测试密钥输入首次设置页。解密结果保存在项目内；不持久保存密钥，应用锁不加密磁盘上的明文快照。每次演示使用新配置目录。

`npm run demo:search` 生成包含压缩文本和历史会话的搜索演示。完成向导后搜索“维护”，可以验证分组、发送人筛选、命中定位与日期日历。

修改 `src/` 或 `packages/` 后可运行 `npm run build`；改 Go 桥接或解密模块后分别运行 `npm run build:bridge`、`npm run build:snapshot-import`。以下命令启动保留的原包模式：

```sh
npm run build
npm start
```

重新安装依赖时，使用 Node.js 24.x 且 >=24.15（本机验证版本 24.21.0）、macOS arm64：

```sh
nvm use                 # 读取项目根目录的 .nvmrc（24.21.0）
npm ci
npm run setup
npm run build
npm run check:maintainability
npm run test:smoke
npm run release:manifest # 生成未签名的本地构建清单
```

项目的 `.github/workflows/maintenance.yml` 固定了同一套 macOS arm64 维护基线：递归获取参考子模块、按 `package-lock.json` 安装依赖、构建独立后端和桌面 bundle、运行完整测试，并校验协议绑定、原包运行时哈希和维护边界。构建报告会作为 Actions artifact 保留；Go 桥接和快照导入仍只接受项目内固定的 macOS arm64 工具链，不会在 CI 中改用系统 Go。

`npm run release:manifest` 会对 `dist/app`、`build/runtime-bundle` 和 `workers/agent/dist` 的每个文件生成 SHA-256 清单与整体摘要，写入 `.runtime/release-manifest.json`。清单明确标记目标为 macOS arm64、原生代码未重新编译且项目未签名；它是发布审计材料，不是 DMG、代码签名或公证结果。原生运行时仍必须先通过 `npm run verify:vendor`。

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
| `packages/alpha-engine/` | 自有 Node stdio 协议服务，连接原桌面 IPC 与只读数据桥接 |
| `packages/alpha-data-bridge/` | 自有可编译 Go 模块，读取显式指定的离线微信 v4 SQLite 数据副本 |
| `packages/alpha-snapshot-import/` | 自有 Go 逐页认证解密、SQLite 完整性校验与离线快照发布 |
| `packages/alpha-security/` | 自有密码应用锁，不存储微信或模型凭据 |
| `vendor/chatlog/` | 固定版本的Go源码参考子模块；未修改，也不作为新桥接的运行依赖 |
| `scripts/` | 新增构建、隔离启动和资源校验工具 |
| `vendor/runtime/` | 原包运行时的未修改副本，43 个文件，SHA256 和权限有记录 |
| `dist/app/` | JavaScript 构建产物及开发启动适配入口 |
| `workers/agent/dist/` | AI worker 构建产物，满足原网关的开发目录约定 |
| `build/runtime-bundle/` | 构建时复制的原生资源，使用真实目录以通过原路径检查 |
| `provenance/` | 原包 package.json、恢复文件 SHA256、REA 证据引用 |
| `docs/` | 源码导航、缺口、构建和本地运行证据 |

`src/` 的 169 个文件在首次整理时与提取内容逐字节一致。本轮已修改 main 的独立后端选择/数据目录/网关边界，以及 renderer 的离线连接说明；变更摘要见 [维护来源记录](provenance/maintenance-changes.json)。未将大 bundle 机械拆成假定的原始模块；可使用 [修改指南](docs/editing-guide.md) 和 [代码索引](docs/recovered-code-index.json) 定位。索引包括 11 个 JS 模块、5805 个函数/类、562 个 React 组件候选，含第三方代码。

esbuild 会重新处理 11 个 JS 文件并生成调试 source map。这里的映射回到 `src/` 中的恢复 JavaScript，不是原始 TS/TSX。renderer chunk 文件名和相互导入路径保留，防止破坏原 HTML、动态加载与资源引用。

## 验证与边界

```sh
npm run verify:protocol # 校验独立协议模块仍与恢复源一致
npm run test:protocol   # 编解码、分帧边界与来源测试
npm run verify:vendor   # 核对43个原包运行时文件的SHA256和权限
npm run test:smoke      # 隔离检查、实际Electron界面、IPC与后端状态诊断
npm run check:maintainability # 检查Node/锁文件、源码入口、工具链记录和构建复制边界
npm run test:encrypted  # 原UI手动密钥、错误密钥拒绝、消息读取与重启复用
npm run test:search     # 原UI搜索、发送人筛选、定位、月历和部分结果提示
npm run index          # 根据当前src重新生成导航索引
```

`test:smoke` 的成功退出表示隔离和界面冒烟通过，**不表示后端 ready**；后端结果单独写入 `docs/local-run.json` 的 `checks.backendReady`。新增独立模式已用合成数据验证读取、解密、检索和 JSON/Markdown/HTML/TXT/XLSX/派生格式会话导出；尚未验证真实微信数据，未获取实际密钥、发消息或调用模型。

主要缺口包括原 TS/TSX 与类型、完整开发工作区、原依赖锁、Cargo/Rust 和 C++/CMake 工程、原生协议生成工程、服务端授权实现，以及未随包提供的高级组件和语音模型。原生程序依赖自身的完整性、身份、许可及有效期检查，已有二进制不能保证恢复工程完整可用。

详细见 [缺失部分清单](docs/source-gaps.md)、[本地验证说明](docs/local-build-and-run.md)、[原生资源来源](docs/native-runtime-provenance.json)。原始商标、第三方许可文件及 bundle 中的许可注释保留；本工程未给恢复代码重新声明开源许可证。

## 独立后端接手基础

已从实际main的AST依赖闭包中提取独立 [协议模块](packages/alpha-protocol/README.md)：900个顶层绑定，128类请求、129类响应，12项测试通过。它仅加载protobuf wire，不启动Electron，也不提供或伪造后端业务结果。原桌面 main 的内嵌编解码仍保留，独立引擎已实际使用此协议模块，通过原有 framing 与桌面通信。

已固定引入 [imldy/chatlog](https://github.com/imldy/chatlog/tree/a7162bca9454fa43b5950a2414670983fe180e56) 源码子模块，提交 `a7162bca9454fa43b5950a2414670983fe180e56`。它用于理解一部分微信 v4 数据结构。本轮新桥接为自有 Go module，使用固定的 go-sqlite3 和 klauspost/compress 依赖，不导入 Chatlog internal 包或运行其取钥逻辑。范围见 [候选核查](docs/native-backend-candidates.md)；新增源码保留原许可证及依赖许可。

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

完整 [128项后端请求对照](docs/backend-compatibility-map.md) 记录的是 Chatlog 候选映射（直接兼容0项），不是新独立引擎的实现数量。新引擎支持与未实现分支见 [当前接手状态](docs/independent-backend.md)，公开源码和替代后端的许可证/平台边界见 [公共源码候选](docs/public-source-candidates.md)，不能把请求数量换算成完整功能百分比。
