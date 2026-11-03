# Alpha 的完整功能保留与原生后端独立维护

检查日期：2026-11-01。对象为本工程保存的 Alpha 0.3.5 macOS arm64 安装包材料，以及通过 GitHub 连接器只读查看的公开仓库。本文是后续实现方案；没有替换后端、克隆 WeFlow、读取真实微信数据或执行新的业务调用。

**建议保留 Alpha 的桌面界面、交互和全部功能清单，在现有 EngineClient 边界逐项实现可自行编译的后端。WeFlow 可以提供部分应用层源码参考，但当前公开版本不能直接补齐 macOS 数据库和密钥组件。** 全功能保留是最终目标；分阶段验收用于控制依赖和定位问题，不代表把产品范围缩减为离线查看或简单导出。

目前已验证 JavaScript 可以重建、Electron 首次设置界面可以启动。项目 Seatbelt smoke 下原生 engine 会返回 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`；在 macOS arm64、临时 HOME/TMP、Electron `--no-sandbox` 且不使用该 wrapper 的 native smoke 中，engine/native-host 已返回 ready。native smoke 只证明启动和握手，账号为空，未验证真实微信数据；这还不是完整业务可用的项目，不能把界面启动、协议编码或合成数据通过当成真实聊天功能通过。详见 [本地构建与运行验证](local-build-and-run.md) 和 [native smoke 证据](native-smoke-validation.json)。

## 1. 维护目标与发行包基线

官方 [Alpha README](https://github.com/xunchahaha/alpha-releases/blob/main/README.md#L19) 已发布停更说明，预计 0.3.5 为最后版本，同时保留底层组件延期、安全修复等必要更新的可能性。因此，“后续没有功能迭代”和“原有组件马上全部停止服务”不是同一个已知事实；长期维护仍不应把持续获得作者签发的原生构建作为唯一依赖。

全功能清单应同时保存三个状态：界面/协议中有入口、本次 macOS 包实际包含组件、实际业务已经验收。原产品的平台差异也必须保留：官方 [高级功能表](https://github.com/xunchahaha/alpha-releases/blob/main/README.md#L170) 将发消息、公众号导出和微信媒体补齐标为 Windows 能力，macOS 消息编辑标为实验性。本地 [组件清单](../vendor/runtime/component-manifest.json) 又将通用 controlled writer、wxproto、原图下载和本地转录标为不可用。两类证据不能合并成“macOS 已经支持全部功能”。这些功能应列入完整维护计划，不能从计划中删除，也不能在实现之前标为已恢复。

本项目取得的是发布后的 JS 与原生二进制。缺少原始 Rust/C/C++ 工程、原始 TS/TSX、完整开发锁文件及服务端源码；反编译不能补回已丢失的原始源文件和所有设计信息。原生文件来源及 SHA-256 见 [原生资源清单](native-runtime-provenance.json)，源码边界见 [源码缺口](source-gaps.md)。

## 2. 已有协议足以支持什么

| 边界 | 已验证的材料 | 能恢复的程度 | 仍然未知或缺失 |
| --- | --- | --- | --- |
| renderer → preload → Electron main | 已发布 JS 中的 IPC 注册、参数校验、返回映射、23 个顶层能力分组 | 可保留界面 API，逐项建立功能契约和回归用例 | 原始 TS 类型、全部业务测试与隐藏状态分支 |
| main → alpha-engine | `EngineClientFrame`、`EngineServerFrame` 的 encode/decode；4 字节大端长度头；请求 ID、超时、取消、启动 hello 与能力协商 | 可恢复已包含方法的线格式、枚举和字段，并实现独立后端或主进程适配器 | 不能从编码器推导数据库 SQL、排序/聚合算法、服务端全部约束、并发语义和异常恢复行为 |
| HTTP bridge → engine | `POST /engine-frame`、protobuf、回环地址、临时 Bearer token、请求大小限制和只读操作白名单 | 可保留外部工具的数据访问入口和鉴权边界 | 此 bridge 只覆盖部分读取操作；它不是整个产品的后端 API |
| alpha-data-host → native | manifest 的 `alpha.native.v1`、`alpha.data-rpc.v1`、`--semantic-json-stdio`、`alpha_native_get_api` 与 readonly provider ABI 名称 | 可据已知操作名和调用侧继续整理接口 | ABI 头文件、结构布局、全部 JSON schema、SQLCipher 参数与微信 schema 映射没有完整源码；不能只替换 dylib 文件名 |
| key-worker / xkey / security-host | helper 协议名称、密钥编码、手动导入/自动获取参数、签名与 peer 配置 | 能规划自己的密钥提供接口和合法测试输入 | macOS 自动获取具体实现、版本适配、原生凭据保管、完整安全握手源码未取得 |
| main → AI gateway → JS worker | 本地网关配置、客户端请求、流事件处理，以及可读的 agent host/provider 实现 | 模型调用循环可逐步拆出为可维护模块；可编写新网关满足调用侧契约 | 原 Rust 网关的持久化、授权、记忆索引、工具调度及恢复算法不能由前端接口完整推出 |

本地证据位置：`src/main/index.js:57950` / `60099` 是两端 frame 编码器；`:62766` 是长度头；`:62812` 是 EngineClient；`:62987` 附近为 hello；`:64730` 附近为请求发送；`:5562` 是 DesktopEngineBridge；`:64690` 附近为 `dispatchReadOnlyFrame` 白名单。`src/main/index.js:67416` 和 `:67833` 是网关生命周期/路径；`src/agent-host/index.cjs:4365`、`:6193`、`:6602`、`:6891` 分别包含模型 HTTP、模型协议归一化、host runtime、framing。源文件可直接打开：[main](../src/main/index.js)、[agent host](../src/agent-host/index.cjs)、[WCDB manifest](../vendor/runtime/manifests/alpha-wcdb.component.json)。行号针对当前保存的发布 JS。

优先在 `EngineClient` 对外方法处引入可替换实现，保留原 UI 和 IPC。需要给现有 Rust 网关/CLI 提供兼容服务时，再实现其所需 protobuf/HTTP 传输。新实现必须用自己的能力报告声明支持范围，未完成方法返回明确不可用；不能通过伪造原厂许可、空列表或成功响应掩盖缺失逻辑。

## 3. 按完整功能清单替换和验收

下表的“可先验证”允许使用人工生成数据或用户明确提供的脱敏样本。它们用于开发，不替代真实微信版本、账号和数据条件下的验收。

| 模块与保留目标 | 独立实现路径与难点 | 可先验证 | 真实验收所需条件 |
| --- | --- | --- | --- |
| 账号发现、切换、手动密钥、自动密钥获取 | 已知导入接口接收 32 字节数据库密钥；可先实现账户注册和用户提供密钥。自动获取单列为 macOS 原生项目，缺少 xkey 源码，受微信版本和系统权限影响，不能认为 WeFlow 已补齐 | 合成账号、错误密钥、切换后的缓存失效、密钥不出现在日志、锁定后的拒绝行为 | 用户指定自己的账号与数据目录；自动获取另需明确授权访问对应本机微信进程和必要系统权限。无需让用户把密钥发到对话中 |
| 微信只读数据库、实时更新 | 自建 SQLCipher/WCDB 适配层，按微信版本隔离 schema、分库、WAL/快照和账户生命周期。普通 SQLite 能打开测试库不代表能读当前微信库 | 自建加密库、只读文件权限、分页游标、重连、文件变化与一致性 | 经授权的数据副本优先；随后才能检查选定真实目录的持续更新、账号切换和微信升级兼容性。监测不能写回业务库 |
| 聊天、群成员、联系人、朋友圈、收藏、其他资料 | 保留现有页面与 DTO；逐类实现记录解析、卡片/引用、昵称、时间线、来源定位和缺失字段语义 | 各消息类型/卡片的固定样本，分页无重漏、群昵称映射、撤回记录展示、朋友圈时间筛选 | 用户授权的多类型真实样本；核对消息数、内容、排序和原客户端显示。只读访问不自动授权保留/编辑数据库 |
| 搜索、统计、年度/双人报告、关系旅程、画像和冲突复盘 | 调用协议较丰富，核心聚合仍在原生程序。独立重写查询、时间区间、排序与统计公式；已有 JS 可复用校验和展示。公式不明处应记录差异 | 明确计算结果的小数据集、跨年/时区/撤回/重复消息、搜索上下文和定位 | 同一授权数据集比对报告与抽样结果；AI 文本结果用质量标准验收，不能要求逐字相等 |
| 本地图片、视频、语音、文件、表情和缓存 | 已有媒体 grant/token、缓存访问、路径检查、播放器逻辑可保留；补齐底层定位、已知密钥解码、容器解析、SILK/转码与缓存清理。WeFlow 有部分 DAT 解码 TS，但不是所有媒体格式的完成证明 | 人工媒体、过期 token、跨账号/路径越界、缺文件、损坏媒体、缓存清理、播放范围请求 | 授权的各格式媒体样本及对应密钥；检查真实路径映射、缩略图/原图、语音与视频质量。缓存可读不代表数据库/密钥已解决 |
| 导出中心、联系人/群成员/朋友圈/其他资料导出、全部格式、定时导出 | 将页面宣告的格式逐项登记；实现数据遍历、媒体复制、清单、取消/续跑、增量和覆盖策略。原生 formatter/任务调度源码仍缺；WeFlow TS 上层有参考价值 | 固定样本逐格式解析和内容对账，文件名冲突、错误恢复、定时/手动任务并发、输出目录授权 | 经授权的数据和输出目录；大数据量/媒体缺失/不同语言等情况。生成有效 JSON 仅是一个格式的局部通过 |
| AI 助手、总结、记忆、画像、工具审批、模型设置 | 保留可读 agent host 的多模型适配、SSE、重试、压缩、工具循环，替换 Rust 网关及持久化。恢复/重建记忆、任务、审批记录和账号隔离 | 本地假模型服务、流中断、重试、取消、工具审批拒绝、跨账号记忆隔离、重启恢复 | 用户选择模型端点与自己的凭据；明确允许哪些聊天内容发给该服务后测试真实总结、工具和费用。未授权时可继续用合成内容测试 |
| 本机 HTTP API、MCP、CLI、外部 MCP 接入 | 保留可见 API/工具目录与认证；重新实现服务器/stdio adapter，兼容分页、事件、取消、权限和错误码 | 本地客户端、token/Origin 检查、只读白名单、流关闭、工具 schema、审批与取消 | 访问真实聊天、联网工具或外部 MCP 时，使用对应已授权范围；桌面能查询不等于所有外部接口已通过 |
| 应用锁、凭据保护、更新、日志和许可界面 | 本地应用锁/秘密存储可独立实现并保留用户体验；原厂 guard、签名和商业授权继续按原有机制对待。自研功能的权限与能力模型应独立设计。更新需自己的构建/签名/发布来源 | 锁定、解锁、密钥不可用时明确失败、敏感日志脱敏、升级迁移、坏包拒绝 | 系统凭据存储测试需使用本项目新建凭据；商业组件需有效授权/开发材料。当前隔离启动禁用了 safeStorage，因此尚未验收真实钥匙串路径 |
| 防撤回、防删除、消息编辑/恢复 | 原包 retention writer 与通用 controlled writer 是不同能力；后者在本次包不可用。分别实现触发器/保留数据、变更日志、回滚和版本兼容，不把读取后端直接扩展为任意写入 | 可丢弃数据库副本上的事务、中断、恢复和幂等性；禁止访问真实库的测试 | 只有用户另外明确允许相应写入后，才在备份和可恢复副本上验收；真实库写入必须单独限定账号、操作和回滚条件 |
| 发消息、公众号导出、CDN 媒体补齐 | 属于产品完整功能范围，但官方标注的 macOS 支持有限。缺协议组件/服务端与登录态处理，不能靠恢复按钮、字符串或调用 schema 实现。需要逐功能获得受支持源码/组件或独立实现，记录平台范围 | 模拟传输、任务队列、取消、幂等、媒体校验、失败反馈 | 发消息需用户明确指定可发送的接收对象和内容；读取公众号/补齐 CDN 需对应账号授权和联网范围。不得把真实发送当成普通启动测试 |

上述模块有依赖但可并行整理源码。例如，媒体缓存、模型 provider、导出格式和 UI 类型恢复可以与 macOS 数据读取适配同时推进。导入样本只是开发及回归路径，完整交付仍包含用户需要的微信接入和原产品功能。

## 4. WeFlow：可用材料与不能填补的缺口

只读检查的是 [hicccc77/WeFlow](https://github.com/hicccc77/WeFlow)，检查时 `main` 为提交 `b4d334d6accc7b4d92cb0c54124eaf67d61e9807`（2026-10-28）。取得了完整递归文件树，626 项、`truncated=false`；没有执行仓库程序或安装依赖。

它确实包含 `src/`、`electron/`、`shared/`、TypeScript 配置、Vite 配置、`package-lock.json` 和构建脚本；[package.json](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/package.json) 标识版本 5.0.0。聊天、导出、统计、朋友圈、AI 等不是只有 README 名称，有对应 TS 服务文件。但是原生依赖闭合性需要逐项判断：

| 能力 | 实际源码证据 | 结论 |
| --- | --- | --- |
| macOS 数据库读取 | [wcdbCore.ts:397](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/electron/services/wcdbCore.ts#L397) 从配置或 `WCDB_DLL_PATH` 取路径；`:824` 缺库即失败；`:832` 有 darwin 分支；`:873` 用 Koffi 加载外部库，再绑定 `wcdb_*` C ABI | 有真实跨平台调用层和查询结果解析；没有随仓库提供可重建的 macOS 数据读取原生实现。darwin 分支不能等同于 arm64 原生源代码齐全 |
| 数据库/图片密钥 | [keyProviderService.ts:6](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/electron/services/keyProviderService.ts#L6) 委托用户配置的外部可执行文件；`:21` 定义请求 action；`:48` 启动进程，以 JSON/NDJSON 通信 | 可复用 adapter 设计；本文件不实现 macOS 自动获取算法，缺省路径直接报未配置 |
| 原生图片解码 | [nativeImageDecrypt.ts:51](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/electron/services/nativeImageDecrypt.ts#L51) 从用户配置路径加载 `.node`，使用 `decryptDatNative` | 原生插件源码和构建工程不在本次完整文件树中 |
| 部分图片 DAT 的 JS 解码 | [imageDecryptService.ts:2197](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/electron/services/imageDecryptService.ts#L2197) 在原生不可用时调用 JS fallback；`:2204` 至 `:2282` 包含文件检测、已知密钥的 XOR 与 AES DAT 处理 | **有实际可读实现**，是媒体模块候选基础。仍需合法取得密钥；不能证明覆盖 WXGF、所有容器与微信新版本 |
| 批量原始导出 | [weliveBridge.ts:130](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/electron/services/weliveBridge.ts#L130) 只接受显式外部 `welivePath`，缺少即失败 | 此桥接层不包含 WeLive 引擎源码；其他 TS formatter 应按格式独立评估，不能用一个外部导出入口推定全格式均缺或均有 |
| 原生源码与产物盘点 | 完整树未发现 `.rs`、C/C++/Objective-C 源码、Cargo/CMake 工程、macOS `.dylib` 或 `.node`；`resources/runtime/` 只有 win32 下 4 个 MSVC runtime DLL | 这是对该提交仓库树的有边界检查，不代表作者历史提交、其他仓库或第三方组件永远不存在 |

官方 [第三方组件说明](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/docs/third-party-components.md) 描述外置 WCDB、媒体插件和 WeLive 协议。文档开头声称缺组件没有替代实现，但图片源码实际存在上表中的 JS fallback；对该项以代码为准。不能仅凭 README/文档判断实现完整度。

WeFlow 的 WCDB 接口是多个 `wcdb_*` 导出；Alpha manifest 是 `alpha_native_get_api` / `alpha_sqlite_readonly_get_api`。二者没有被证明 ABI 或记录 schema 相同。即使取得某个可运行 WeFlow 第三方库，也需要独立验证 ABI、JSON/DTO、数据库版本、许可和 macOS arm64 支持，不能直接改路径作为 Alpha 的替换品。

[WeFlow LICENSE](https://github.com/hicccc77/WeFlow/blob/b4d334d6accc7b4d92cb0c54124eaf67d61e9807/LICENSE) 为 **CC BY-NC-SA 4.0**，并非宽松商业许可。复用其代码需要遵守非商业、署名及适用的相同方式共享条件；商业用途或与本工程其他代码的许可兼容性没有在本次核定，不能据公开可读就认定已经获准。当前可执行选择是先把它作为只读技术参考及候选来源，决定实际引入前核对具体使用方式和文件许可；未经该步骤不要整仓库并入，也不要替换 Alpha UI。独立原创实现可以围绕已知功能契约进行，但不能把搬运源码包装成原创。

## 5. 原生 guard、许可与长期独立性

保存的原生文件带签名、peer 身份和内部策略。部分 manifest 策略有效期至 `2026-11-18T00:00:00Z`，这说明原始分发链存在时间与签发依赖；它不证明当前完整性错误是过期导致，也不能据此推断此日期后所有功能的精确运行表现。`codesign` 校验通过同样不代表自定义 guard 会接受恢复工程环境。

若继续复用这些文件，需要原作者提供适配的开发构建、配置、源码或持续可用的受支持组件。独立维护路线则需要用可自行构建的实现替换对应功能，并保存自己的凭据保护、应用锁和权限检查；不能靠修改原文件策略、伪造许可、签名或原厂服务器响应获得独立性。原厂商业服务及授权协议不是能从安装包恢复出的完整服务端。

此前对 `xunchahaha/alpha`、`alpha-wcdb`、`alpha-xkey`、`alpha-wxproto` 的只读访问返回 404；**这只表示当时身份和时间下不可访问**，可能是私有、删除或改名，不能证明源码从未存在。详见 [原生源码缺口记录](native-source-gaps.json)。

## 6. 建议的实施顺序与交付标准

1. **固定全功能基线。** 从 renderer/preload/main/manifest/官方平台表整理功能、IPC、DTO、状态机、输出格式和平台差异；原页面全部保留，为每项建立“源码已掌握 / 待实现 / 模拟验证 / 真实验收 / 平台不支持”的可追踪记录。缺项不隐藏成成功。
2. **拆出接口和可维护模块。** 保留原代码快照，把协议、账户、数据读取、媒体、导出、分析、AI、锁与权限拆为自己的模块，逐步恢复类型。先建立能覆盖完整页面的数据契约和合成样本；同时开展 macOS 数据库与密钥组件的来源调查和独立适配。该阶段结束不代表业务已经完成。
3. **闭合真实读取和媒体链路。** 取得用户授权的样本，完成数据库、联系人、消息、朋友圈/收藏、来源定位、搜索、实时变更与媒体解码；再用同一数据集验证各类导出、统计、报告和 AI 工具读取。兼容目标记录微信版本和 macOS/架构。
4. **补齐全部运行服务。** 完成 AI gateway 的持久化/记忆/审批/流式恢复，HTTP/MCP/CLI，导出任务和定时任务，模型组件、应用锁与升级迁移。模型下载和云调用应由用户选择的配置驱动；原包没有附带模型权重不能算已恢复本地 ASR。
5. **逐项实现写入及平台受限能力。** 防撤回/防删除、编辑与恢复、发送、公众号导出和媒体补齐各自拥有授权、测试与回滚边界。macOS 原本缺失的能力若要扩展，应标为新增平台实现，不能冒充从该 DMG 恢复成功。
6. **验收可持续维护。** 在干净 macOS arm64 环境从本项目源码和明确许可的依赖构建所有必需服务；在不依赖原 Alpha 签发更新的条件下运行；有版本兼容矩阵、数据迁移/备份策略和功能回归记录。所有目标功能逐项达到约定状态，才可宣称完整维护目标达成。

“应用层可重建”“完整界面连接合成后端”“指定微信版本下真实数据可用”“全功能且后端均能自行构建”是四个不同里程碑。当前证据只支持第一项中的构建与初始界面启动；后面三项仍需实现和验收。本文没有承诺可完整还原原始 Rust/C++ 源码，也没有把外部项目或第三方二进制的可用性当作已经验证的结果。
