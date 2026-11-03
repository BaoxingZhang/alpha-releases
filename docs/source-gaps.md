> 后续进展：新增独立后端已实现离线微信 v4 数据副本的核心读取、密码应用锁、已有密钥的加密快照导入、搜索/日期导航，以及显式 synthetic moments/favorites fixture 的只读列表、作者/日计数、合成表情解析和收藏媒体索引边界。当前独立协议支持 82/128 个请求分支；其中 `listMessageRecallRecords` 只从 `__alpha_general_revokes` 派生消息撤回候选，保留 `partial/candidate` 边界，不兼容原生 recall store 或 writer；公众号计划的独立后端现在另外保存本地计划元数据（4 个 CRUD 分支），并可把执行请求记录为明确 blocked 的本地 metadata，但不执行计划；公众号创建意图仍仅保存主进程已加密的 opaque ciphertext，不解密、不联网、不代表文章抓取、执行记录或官方导出功能已恢复。安全锁的 native provision/reset/key vault、消息捕获/发送/变更 writer 和真实微信语音转写的 worker、VoiceInfo/SILK 媒体链路缺口已单独记录在 [native-capability-blockers.json](native-capability-blockers.json)，这几项继续保持 `UNIMPLEMENTED`。另有不计入 native 支持矩阵的可选 sherpa-onnx backend，只处理调用方明确选择的 WAV media-index，仍需维护者提供运行时和模型。下文原包缺口仍成立，真实 native schema 不因 synthetic fixture 或可选 backend 而闭合。新的实现范围见 [independent-backend.md](independent-backend.md)、[optional-asr.md](optional-asr.md)、[encrypted-import.md](encrypted-import.md)、[search-navigation.md](search-navigation.md)。

补充：独立后端已按 [`telemetry-recovery.md`](telemetry-recovery.md) 接通 field 21/22/23 的本地同意状态管理；该实现明确停用发送并不补齐原包缺失的遥测服务端、事件队列或上传协议。REA 还确认原生 `libalpha_native.dylib` 存在 `wcdb.group_pins.*` 错误族及 `ext_buffer_` 引用，但尚未恢复原生群置顶 schema、编码或 ABI；独立模式现在仅支持显式自有 `__alpha_group_pins_v1` synthetic fixture，并固定标记为离线只读能力。原生形状仍保持 fail-closed，静态线索只记录在 [原生 operation 证据](native-operation-source-evidence.md)。

## 上游功能声明与当前恢复范围

公开发行仓库的 README 同时列出产品功能和高级功能。下表把这些声明与当前独立工程的证据边界对齐，避免把“界面入口、协议字段或原包二进制存在”当成已经恢复。`synthetic-only` 只适用于显式 `__alpha_*_v1` 测试表，不能代表真实微信 schema。

| 上游声明 | 当前可复用或独立实现 | 仍缺少的证据/实现 |
| --- | --- | --- |
| 聊天浏览、搜索、日期跳转、多格式导出和定时导出 | 离线 v4 副本的会话/消息读取、字面搜索、日期计数、JSON/Markdown/HTML/TXT/XLSX 及 ChatLab/SQL/WeClone 派生导出；任务状态、取消、重试和有限重启恢复 | 更多真实消息编码、附件打包、第三方格式的完整兼容语义、增量/冲突规则和大库性能 |
| 通讯录、群成员和其他资料导出 | 联系人/群成员只读查询与导出；显式 `__alpha_group_pins_v1` synthetic fixture 可投影为有界群置顶记录；支付、好友申请、撤回、通话为带来源标识的 partial/candidate 记录 | 原生资料库 schema、原生群置顶 `__alpha_group_pins` 的字段/分页语义、完整字段语义、好友验证/互动/搜索记录及原始 Alpha 记录库 |
| 朋友圈、日历、媒体、导出和防删除 | 仅显式 synthetic moments fixture 的文字、作者、日计数和 metadata-only 导出；`__alpha_moment_details` 中显式 projection 的评论可显示经 `__alpha_moment_emoji_v1` 与自有 media-index 校验的合成表情，导出只保留有界 projection 和已验证表情 SHA-256/大小/MIME，不输出 raw XML、原生 token 或 URL；bridge 另有显式 v4 `media.probe` 元数据探针；防删除控制面保持 writer-disabled | 真实 `SnsTimeLine`/`snsmessage` schema、评论 XML、完整互动/媒体解析、原生导出语义和可恢复写入 |
| 收藏、媒体墙、原图/媒体访问 | synthetic favorites fixture 的分页/过滤/类型计数及显式媒体槽位索引；消息媒体可浏览 metadata；显式 `kind=file` media-index 可复用附件保存/打开 IPC 的只读 SHA-256 fallback；显式 v4 `media.probe` 可读取 hardlink/VoiceInfo metadata | 真实收藏库、source lookup、`media1_` token、路径/密钥定位、解密、缩略图和播放 |
| 语音播放与语音转文字 | 合成 `__alpha_voice_playback_v1` 映射 + 自有 WAV media-index 的 `decodeVoicePlayback`；`media.probe` 返回显式 `VoiceInfo` 的数据长度；新增只读取调用方已选择 `VoiceInfo.voice_data` 原始字节的第三方候选入口（固定 `complete=false`、`third_party_candidate=true`、`decoded=false`，不解码 SILK）；保留转写 UI/任务协议和模型目录声明；另有不计入 native parity 的可选 sherpa-onnx backend，仅处理调用方明确选择的 WAV media-index | 真实 VoiceInfo/SILK/FFmpeg/native media cache、原生转写 worker、取消、缓存和真实微信输入仍未恢复；可选 backend 仍需维护者自行提供哈希匹配的 runtime 与模型 |
| AI 助手、多模型、ChatGPT 登录、总结和分享图 | 原 AI host bundle 可编辑；独立模式仅有显式 opt-in 的本地 fixture worker | gateway/provider 登录、凭据与权限、真实模型调用、工具审批、上下文压缩和分享图生成 |
| HTTP API、MCP、推送与发送 | 独立本机适配器覆盖已验证只读 DTO、导出/统计、analytics、媒体 metadata 和 synthetic moments/favorites 路由 | 官方其余路径、真实媒体/朋友圈/收藏 schema、推送、发送和写入结果确认 |
| 高级：文字发送、公众号文章导出、消息编辑、CDN 媒体补齐 | 原包 UI/协调代码与协议字段保留；未修改完整性、授权或平台限制 | 合法写入/登录态、公众号文章服务、编辑一致性、Windows CDN 组件和失败恢复 |

# Alpha 0.3.5 源码恢复范围与缺口

本工程的输入是 macOS arm64 安装包 `Alpha-0.3.5-arm64.dmg`，SHA-256 为 `53bb2ba02edf784e77629f80b7330d9b5653cbcbd8e5527849267c5a6f209004`。安装包中的可读 JavaScript 可整理为可编辑、可重新构建的应用层；原生程序目前使用随包预编译文件。完整的原始源码工程仍有以下缺口。构建和启动是否通过，以本工程实际验证记录为准，本文只说明来源与恢复边界。

| 部分 | 已取得的材料 | 可编辑或复用范围 | 尚缺材料 |
| --- | --- | --- | --- |
| Electron 主进程 | `out/main/index.js` | 编辑已发布的 CommonJS 代码，再按重建工程的规则处理与打包 | 原始 TypeScript 模块、类型、开发期目录与构建配置 |
| Electron preload | `out/preload/index.js`、图片查看器和通知窗口 preload | 编辑已发布的桥接与 IPC 代码 | 原始 TS 文件及完整开发测试 |
| React 渲染层 | `out/renderer/` 中的 JS、HTML、CSS 与资源 | 编辑已编译的组件逻辑、界面文案和样式，再重新打包 | 原始 TSX/JSX、类型、组件文件边界、CSS 预处理源码和 source map |
| AI Agent host | `vendor/runtime/bin/alpha-agent-host.cjs` | 可读、可编辑的 JavaScript bundle，含原始 `src/*.ts` 路径注释 | 分离的 TS 源文件、原始 protobuf 工程、构建配置与锁文件 |
| Rust 后端与工具 | `alpha-server`、`alpha-engine`、`alpha-mcp-stdio` 等 13 个程序 | 按原文件与协议复用 macOS arm64 二进制 | Cargo 工作区、`Cargo.toml`、`Cargo.lock`、`src/*.rs`、`build.rs`、生成代码和精确工具链 |
| C/C++ 数据及凭据组件 | WCDB/SQLCipher dylib、`alpha_xkey_helper`、`alpha_xkey.dylib`；REA 已观察到 `_alpha_moments_project_row_v1`、`_alpha_native_get_api` 和 `_alpha_sqlite_readonly_get_api` 的入口及部分参数检查 | 保留原二进制、权限、配置和哈希；可把已记录的函数边界作为后续授权 ABI 取证索引 | 当前 `vendor/runtime` 复制范围未包含 ABI 头文件正文；`alpha-wcdb.package-manifest.json` 只保留 `include/alpha_native.h`、`include/alpha_sqlite_readonly.h` 等路径/哈希记录。C/C++ 实现、CMake 工程、SQLCipher 集成源码和 guard 构建工具仍缺；API 表字段签名、row 结构、返回码和生命周期未闭合，不能直接调用未知函数表 |
| FFmpeg | 原可执行文件及 README/LICENSE | 复用原媒体处理程序与随包许可文件 | 对应源码快照、精确编译参数和依赖构建材料 |
| 授权及组件服务 | 客户端端点配置、信任配置、签名公钥和 manifest | 保留原有客户端交互与校验机制 | 远端服务实现、数据库配置、签发私钥和有效用户许可状态 |

已发布的 `out/` 共包含 10 个 JavaScript 文件；源码导航清单见 [recovered-code-index.json](recovered-code-index.json)。对解包内容的检查未发现 `.map`、`.ts` 或 `.tsx` 文件。因此，代码中的函数名、组件名和 `src/*.ts` 注释可以帮助定位逻辑，但不能恢复已被编译删除的类型、注释或原始文件划分。导航清单中的函数/类与 React 组件候选是静态索引结果，不代表全部原始模块均已恢复。

原包 `package.json` 声明 `@alpha/desktop` 0.3.5、入口 `out/main/index.js`，以及 `@bufbuild/protobuf` 2.14.0、`@hicccc77/electron-liquid-glass` 0.4.0 两项运行时依赖。它没有原始开发脚本和完整开发依赖；未取得原始 npm/pnpm/yarn 锁文件。重建工程新增的依赖和锁文件用于固定当前恢复工程，不能据此声称复现了作者当时的全部依赖解析结果或得到字节完全相同的发行包。

`vendor/runtime/` 中的 43 个文件来自原 DMG 指定的 `bin`、`native`、`manifests`、`policies`、`resources`、`voice-models` 和 `component-manifest.json`，合计 156,899,845 字节。复制后已逐文件校验 SHA-256，并保留常规文件权限。完整清单见 [native-runtime-provenance.json](native-runtime-provenance.json)。这些文件支撑的是“重建应用层并复用原生运行时”的工程形态；编译 JavaScript 或重新打包 Electron 不会重新编译这些 Rust/C/C++ 程序。组件 manifest 中的源码提交号、源文件名称和哈希也只是来源记录，不包含相应源码正文。

随包功能还有明确的组件缺口。[component-manifest.json](../vendor/runtime/component-manifest.json) 将 `local_transcription`、`original_image_download`、`alpha_wxproto`、高级组件分发和保护能力标为 `unavailable`。两个语音目录中保存的是模型目录 JSON，没有模型权重；已复制的 `bin/` 中也没有转录 worker。模型名称和下载地址不能替代实际推理引擎与模型文件。

2026-11-03 对原始 DMG 做了只读 REA 清单复核（DMG SHA-256 仍为 `53bb2ba02edf784e77629f80b7330d9b5653cbcbd8e5527849267c5a6f209004`，容器完整覆盖 1710 个成员）。包内 `Contents/Resources/bin/runtime-endpoints.json` 的目标是 `windows-x64`，而 `component-manifest.json` 的目标是 `macos-arm64`；这两个声明不能合并为“macOS 原生服务可直接运行”，也为当前完整性策略拒绝提供了额外的身份/平台不一致证据。`alpha-wxproto.component.json` 还把发布资格标为 `release_qualified=false`，并只携带受 guard 保护的转写 worker 元数据。上述静态材料仍不能替代原生源码、授权服务或真实运行回执。

写入相关能力应逐项看待。顶层 manifest 将通用 `controlled_writer` 标为 `unavailable`；`retention_writer` 已包含，但 `default_enabled` 为 `false`、`message_mutations` 为 `false`。WCDB 组件声明的保留能力包括 `moments.anti_delete` 与 `message.anti_recall`。因此，接口名称、界面入口或消息发送程序的存在，不能证明所有修改、发送和保留操作都已可用。本文没有补写缺失的写入模块，也没有把协议声明作为运行成功的证据。具体声明见 [alpha-wcdb.component.json](../vendor/runtime/manifests/alpha-wcdb.component.json)。

原生文件的签名、peer 身份、许可和有效期策略按原包保留。[alpha-xkey.component.json](../vendor/runtime/manifests/alpha-xkey.component.json) 中的生产策略包含有效期字段；信任配置和 `.ed25519.pub` 文件是公钥材料。重新构建本地 JavaScript 无法据此恢复远端授权服务、生成有效许可或替代签发私钥。本工程不修改这些校验来弥补源码缺口；实际服务可用性和授权行为需要由运行验证单独记录。

2026-11-01 通过 GitHub 连接器只读检查了关联仓库：[alpha](https://github.com/xunchahaha/alpha)、[alpha-wcdb](https://github.com/xunchahaha/alpha-wcdb)、[alpha-xkey](https://github.com/xunchahaha/alpha-xkey)、[alpha-wxproto](https://github.com/xunchahaha/alpha-wxproto) 均返回 404。**404 只表示在当次访问身份和时间下不可访问**，可能涉及私有、删除或改名，不能证明仓库从未存在，也不能断言源码在其他位置不存在。

公开的 [alpha-releases](https://github.com/xunchahaha/alpha-releases) 根目录包含 `README.md`、`assets`、`docs`、`update`；读取的 [README](https://github.com/xunchahaha/alpha-releases/blob/main/README.md) 主要介绍产品与发行下载，未找到原始源码构建仓库链接。本次未克隆仓库或安装其内容。更详细的组件级证据与查询边界见 [native-source-gaps.json](native-source-gaps.json)。

另行核对了公开的 [alpha-build](https://github.com/xunchahaha/alpha-build) 打包仓。其 README 和 workflow 说明该仓只消费 `xunchahaha/alpha` 的版本锁，检查 release 与锁定 commit，并在具备私有凭据时 checkout 私有组件；它不 checkout、编译或公开 `alpha`、`alpha-wcdb`、`alpha-xkey`、`alpha-wxproto` 的源码。当前身份下对这些仓库、锁定提交和 manifest 记录的 `local/...` 归档访问均返回 404；这只能说明本次访问不可达，不能证明仓库永久不存在。因而本工程仍无法取得原生源码，只能维护已恢复的应用层和独立替换实现。

补充发现作者账号公开的 [WeFlow1](https://github.com/xunchahaha/WeFlow1) fork，以及其他公开 WeFlow Rust fork。它们包含朋友圈、媒体、分析和 WCDB 接口的应用层或替代后端材料，但使用 CC BY-NC-SA 4.0 或依赖外部原生组件；没有证据证明其 ABI、授权、schema 和 macOS arm64 行为与 Alpha 0.3.5 相同。本工程仅将其作为研究参考，未复制源码或接入依赖。详细对象、许可证和平台边界见 [相关公开项目与可复用边界](related-open-source-evidence.md)。

原生资源整理阶段只读挂载了 DMG，完成复制校验后已卸载，未执行原包程序，也未访问用户微信数据库。后续验证应分别记录 JavaScript 构建、界面启动、原生服务连接和真实数据功能的结果；其中任一项通过，都不能自动代表其他项已经通过。
