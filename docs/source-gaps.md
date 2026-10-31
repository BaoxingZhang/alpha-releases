> 后续进展：新增独立后端已实现离线微信 v4 数据副本的核心读取、密码应用锁及已有密钥的加密快照导入。下文原包缺口仍成立；新的实现范围见 [independent-backend.md](independent-backend.md) 和 [encrypted-import.md](encrypted-import.md)。

# Alpha 0.3.5 源码恢复范围与缺口

本工程的输入是 macOS arm64 安装包 `Alpha-0.3.5-arm64.dmg`，SHA-256 为 `53bb2ba02edf784e77629f80b7330d9b5653cbcbd8e5527849267c5a6f209004`。安装包中的可读 JavaScript 可整理为可编辑、可重新构建的应用层；原生程序目前使用随包预编译文件。完整的原始源码工程仍有以下缺口。构建和启动是否通过，以本工程实际验证记录为准，本文只说明来源与恢复边界。

| 部分 | 已取得的材料 | 可编辑或复用范围 | 尚缺材料 |
| --- | --- | --- | --- |
| Electron 主进程 | `out/main/index.js` | 编辑已发布的 CommonJS 代码，再按重建工程的规则处理与打包 | 原始 TypeScript 模块、类型、开发期目录与构建配置 |
| Electron preload | `out/preload/index.js`、图片查看器和通知窗口 preload | 编辑已发布的桥接与 IPC 代码 | 原始 TS 文件及完整开发测试 |
| React 渲染层 | `out/renderer/` 中的 JS、HTML、CSS 与资源 | 编辑已编译的组件逻辑、界面文案和样式，再重新打包 | 原始 TSX/JSX、类型、组件文件边界、CSS 预处理源码和 source map |
| AI Agent host | `vendor/runtime/bin/alpha-agent-host.cjs` | 可读、可编辑的 JavaScript bundle，含原始 `src/*.ts` 路径注释 | 分离的 TS 源文件、原始 protobuf 工程、构建配置与锁文件 |
| Rust 后端与工具 | `alpha-server`、`alpha-engine`、`alpha-mcp-stdio` 等 13 个程序 | 按原文件与协议复用 macOS arm64 二进制 | Cargo 工作区、`Cargo.toml`、`Cargo.lock`、`src/*.rs`、`build.rs`、生成代码和精确工具链 |
| C/C++ 数据及凭据组件 | WCDB/SQLCipher dylib、`alpha_xkey_helper`、`alpha_xkey.dylib` | 保留原二进制、权限、配置和哈希 | C/C++ 实现、ABI 头文件、CMake 工程、SQLCipher 集成源码和 guard 构建工具 |
| FFmpeg | 原可执行文件及 README/LICENSE | 复用原媒体处理程序与随包许可文件 | 对应源码快照、精确编译参数和依赖构建材料 |
| 授权及组件服务 | 客户端端点配置、信任配置、签名公钥和 manifest | 保留原有客户端交互与校验机制 | 远端服务实现、数据库配置、签发私钥和有效用户许可状态 |

已发布的 `out/` 共包含 10 个 JavaScript 文件；源码导航清单见 [recovered-code-index.json](recovered-code-index.json)。对解包内容的检查未发现 `.map`、`.ts` 或 `.tsx` 文件。因此，代码中的函数名、组件名和 `src/*.ts` 注释可以帮助定位逻辑，但不能恢复已被编译删除的类型、注释或原始文件划分。导航清单中的函数/类与 React 组件候选是静态索引结果，不代表全部原始模块均已恢复。

原包 `package.json` 声明 `@alpha/desktop` 0.3.5、入口 `out/main/index.js`，以及 `@bufbuild/protobuf` 2.14.0、`@hicccc77/electron-liquid-glass` 0.4.0 两项运行时依赖。它没有原始开发脚本和完整开发依赖；未取得原始 npm/pnpm/yarn 锁文件。重建工程新增的依赖和锁文件用于固定当前恢复工程，不能据此声称复现了作者当时的全部依赖解析结果或得到字节完全相同的发行包。

`vendor/runtime/` 中的 43 个文件来自原 DMG 指定的 `bin`、`native`、`manifests`、`policies`、`resources`、`voice-models` 和 `component-manifest.json`，合计 156,899,845 字节。复制后已逐文件校验 SHA-256，并保留常规文件权限。完整清单见 [native-runtime-provenance.json](native-runtime-provenance.json)。这些文件支撑的是“重建应用层并复用原生运行时”的工程形态；编译 JavaScript 或重新打包 Electron 不会重新编译这些 Rust/C/C++ 程序。组件 manifest 中的源码提交号、源文件名称和哈希也只是来源记录，不包含相应源码正文。

随包功能还有明确的组件缺口。[component-manifest.json](../vendor/runtime/component-manifest.json) 将 `local_transcription`、`original_image_download`、`alpha_wxproto`、高级组件分发和保护能力标为 `unavailable`。两个语音目录中保存的是模型目录 JSON，没有模型权重；已复制的 `bin/` 中也没有转录 worker。模型名称和下载地址不能替代实际推理引擎与模型文件。

写入相关能力应逐项看待。顶层 manifest 将通用 `controlled_writer` 标为 `unavailable`；`retention_writer` 已包含，但 `default_enabled` 为 `false`、`message_mutations` 为 `false`。WCDB 组件声明的保留能力包括 `moments.anti_delete` 与 `message.anti_recall`。因此，接口名称、界面入口或消息发送程序的存在，不能证明所有修改、发送和保留操作都已可用。本文没有补写缺失的写入模块，也没有把协议声明作为运行成功的证据。具体声明见 [alpha-wcdb.component.json](../vendor/runtime/manifests/alpha-wcdb.component.json)。

原生文件的签名、peer 身份、许可和有效期策略按原包保留。[alpha-xkey.component.json](../vendor/runtime/manifests/alpha-xkey.component.json) 中的生产策略包含有效期字段；信任配置和 `.ed25519.pub` 文件是公钥材料。重新构建本地 JavaScript 无法据此恢复远端授权服务、生成有效许可或替代签发私钥。本工程不修改这些校验来弥补源码缺口；实际服务可用性和授权行为需要由运行验证单独记录。

2026-11-01 通过 GitHub 连接器只读检查了关联仓库：[alpha](https://github.com/xunchahaha/alpha)、[alpha-wcdb](https://github.com/xunchahaha/alpha-wcdb)、[alpha-xkey](https://github.com/xunchahaha/alpha-xkey)、[alpha-wxproto](https://github.com/xunchahaha/alpha-wxproto) 均返回 404。**404 只表示在当次访问身份和时间下不可访问**，可能涉及私有、删除或改名，不能证明仓库从未存在，也不能断言源码在其他位置不存在。

公开的 [alpha-releases](https://github.com/xunchahaha/alpha-releases) 根目录包含 `README.md`、`assets`、`docs`、`update`；读取的 [README](https://github.com/xunchahaha/alpha-releases/blob/main/README.md) 主要介绍产品与发行下载，未找到原始源码构建仓库链接。本次未克隆仓库或安装其内容。更详细的组件级证据与查询边界见 [native-source-gaps.json](native-source-gaps.json)。

原生资源整理阶段只读挂载了 DMG，完成复制校验后已卸载，未执行原包程序，也未访问用户微信数据库。后续验证应分别记录 JavaScript 构建、界面启动、原生服务连接和真实数据功能的结果；其中任一项通过，都不能自动代表其他项已经通过。
