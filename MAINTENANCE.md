# Alpha 本地维护目标与功能对照

目标是尽量完整保留 Alpha 的现有功能、交互和数据语义，逐步获得可以自行修改、编译、测试和更新的实现。恢复界面不是终点；不会用返回空数组、伪造 ready 或隐藏功能入口来替代真实功能。

当前起点是用户提供的 macOS arm64 0.3.5 包。原作者的[停更公告](https://github.com/xunchahaha/alpha-releases/blob/main/README.md)说明 0.3.5 大概率为最后版本，可能继续提供底层延期和安全修复。公开仓库主要是发行材料和接口文档，不能当成完整源码仓库。

上游基线通过 `npm run audit:upstream` 维护：命令只读获取公开仓库、release、文件树和更新策略，必要时校验本地 DMG；默认不写文件，只有显式 `--write` 才会更新 [`docs/upstream-alpha-releases-current.json`](docs/upstream-alpha-releases-current.json)。这使后续发行检查可重复，同时不会自动替换原生运行时、签名或授权配置。

## 本轮实际推进

新增自有 Go 只读桥接、Node 协议服务和密码应用锁，已经通过原 UI 的首次设置、合成数据库聊天显示及锁定前后读取验证。本阶段进一步加入显式加密微信 v4 离线副本和已有密钥的导入，逐页认证解密后生成可复用明文快照；尚未接入自动取钥或验证真实账号。原功能入口和以下全部领域仍保留；新后端未实现的请求明确返回不可用。

这次只完成了数据读取和模块接入的第一层，不等于多账号、完整搜索/消息语义、实时数据、媒体、导出、分析、朋友圈、AI/API、编辑发送或独立发行完成。详见 [本轮实现与限制](docs/independent-backend.md)。

随后接通搜索与日期导航：全账号/会话字面搜索、发送人/时间筛选、分组计数、命中上下文、直接 serverId 定位、月历计数及首条消息跳转。已明确部分覆盖提示，仍需真实数据、性能、索引和完整内容语义验收，见 [搜索接手记录](docs/search-navigation.md)。

## 保留范围

| 领域 | 已取得的实现 | 独立维护仍需补齐 | 通过标准 |
| --- | --- | --- | --- |
| 窗口、主题、布局、通知、设置 | renderer/preload/main JS、资源 | 拆分维护模块与界面回归用例 | 主窗口/图片/通知窗口均实际工作，设置可恢复 |
| 多账号与数据目录 | UI、IPC、DTO、原生二进制 | 真实账号发现、隔离、选择及状态管理 | 选中账号与实际数据一致，切换不串数据 |
| 数据库及图片密钥 | UI、IPC、xkey 二进制；新增手动数据库密钥导入 | 自动取钥、图片密钥及真实样本验证 | 使用授权样本能验证密钥，错误密钥明确失败 |
| 微信只读数据层 | IPC/Protobuf、WCDB 动态库；新增自有读取桥接和固定格式离线解密 | 原 Rust/C++ 源码、更多数据库版本适配、实时快照与 WAL 一致性 | 原数据不被修改，页数/条数/字段与基准一致 |
| 私聊、群聊、消息类型、引用 | UI、消息展示逻辑、请求响应编解码 | 对应真实数据读取与语义解析 | 分页无漏重，时间/64位ID精度正确，引用可定位 |
| 搜索、日期跳转、上下文 | UI、IPC、协议；新增自有字面搜索、过滤、稳定游标、精确上下文和日历计数 | 大库索引与性能、更多消息编码/语义、真实数据完整验收 | 跨页结果稳定，过滤正确，可回到原消息；部分覆盖明确说明 |
| 通讯录、群成员、公告 | UI、IPC、协议；新增联系人字面量查询、friend/group directory 分页与计数、有限 profile 存在性读取、真实 RoomData 共同群计数/列表、群成员读取和 CSV/JSON/VCF/HTML/XLSX 只读导出，群成员另支持 CSV/JSON/HTML/XLSX 导出，群 profile 可返回真实成员数和唯一群主；独立模式 UI 会禁用未验证分类和头像导出 | 高级通讯录分类、完整资料、头像导出、群公告和管理员身份；企微/公众号/服务号/曾经好友/黑名单分类保持不可用 | 备注/昵称/群身份与实际记录一致；查询结果有分页且 `%`/`_` 按字面量处理，未验证分类请求失败关闭 |
| 收藏、其他资料 | UI、IPC、协议；独立后端仅对显式 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture 接入 `listFavorites`，支持有界分页、类型/关键字/标签过滤和类型计数；另从消息 XML 提供 payments/friend_requests/revokes/calls 的 partial/candidate 读取及 xlsx/csv/json 只读导出 | 真实收藏库 schema、收藏 source lookup、媒体槽位/解析、收藏 UI、真实收藏库 HTTP/MCP 语义、好友验证/朋友圈互动/搜索记录、完整支付字段和通话语义和原始 Alpha 记录库 | synthetic fixture 与原始/结构化候选内容可对照并明确来源；真实 schema、媒体和未知类型继续失败关闭，不伪造 native parity |
| 图片、视频、语音、实况照片 | UI、缓存/协议部分 JS、FFmpeg；独立后端可读取消息中的真实 refs 与媒体类型元数据；另有只接受调用方字节的独立 DAT 图片解码模块（v4 需显式 AES/XOR key，旧式 DAT 按 magic 推断），以及由调用方明确列出文件后生成 `media-index.v1.json` 的安全写入器，见 [`docs/media-decoder-evidence.md`](docs/media-decoder-evidence.md) 和 [`docs/media-index-foundation.md`](docs/media-index-foundation.md)；显式索引绑定的 PNG 已通过真实 renderer→preload→main IPC 和界面预览 | 原生媒体定位、key 获取、解密接入、SILK、WXGF、附件定位 | decoder 和显式索引写入器的合成测试通过；独立 `resolveMessageMedia` 已支持显式索引绑定的图片读取，并已验证图片预览；它不兼容原生 `media1_`、不自动扫描目录，DAT/AES、语音/视频解码和 UI 播放仍不可用 |
| 媒体墙与图片查看器 | UI、分页及窗口逻辑；独立 `browseConversationMessages`/`browseAccountMedia` 已支持真实消息的 media/file/link 与 media/image/video 元数据筛选、时间范围和分页，并可通过 `window.alpha.messages.exportMediaMetadata` 导出 metadata-only JSON/CSV | 媒体索引与服务实现、文件路径/下载/token | 全账号扫描基于可发现 session index；导出明确标记 `metadataOnly=true`、`mediaReady=false`；本地文件读取、解密、缩略图、原图和播放仍未实现 |
| 语音转文字 | UI、任务接口、模型目录 | 运行引擎、模型文件、取消与缓存 | 有模型时真实产出，无模型时明确不可用 |
| 聊天/联系人/资料导出 | UI、部分导出协调 JS、协议；独立后端已支持 JSON/Markdown/HTML/TXT/XLSX 单次导出、四种消息 DTO 派生格式和独立 stateDir 多会话任务状态/取消及终态历史 | 原 Alpha/第三方 ChatLab、SQL、WeClone 完整兼容语义、附件打包、完整格式语义和进程级恢复 | 已实现格式文件有效、条数一致；派生格式兼容边界和完整任务生命周期仍需补齐 |
| 定时导出及任务历史 | 调度 UI、IPC、独立 stateDir 计划与 bounded scheduler | Alpha 完整调度冲突/增量语义、派生第三方格式兼容、后台任务跨进程租约 | 当前独立 runner 支持单一无媒体 JSON/Markdown/HTML/TXT/XLSX/派生格式；XLSX 不支持自定义列；重启最多补一条到期 run，失败可追踪并手工重试 |
| 数据变化监控 | UI、IPC、协议；独立后端字段 106 返回显式离线数据源根目录并由主进程 watcher 使用 | 在线微信变化、自动数据发现、切号/重启后的实时监控语义 | 只监控授权且显式选择的源，源失效时停止并报告错误 |
| 统计、足迹、年度/双人报告 | UI、图表/报告组件、协议；独立后端已支持基于可发现会话和消息的年度基础聚合及指定会话关系基础统计 | 完整统计语义、足迹、回复速度、口头禅、朋友圈互动、双人报告和图片导出 | 合成样本的年度/会话基础计数正确，并明确报告覆盖边界 |
| 朋友圈浏览、日历、导出 | UI、IPC、协议；只有账号具备 `moments`、`moment-authors`、`moment-day-counts` 时，朋友圈页才读取 `moments.db`/`__alpha_moments_v1` synthetic fixture，展示文字、作者筛选、本地日计数和 projection 中显式索引的只读合成评论表情并标明 synthetic-only；engine 另提供 JSON/Markdown/TXT/HTML metadata-only 导出任务，媒体请求明确拒绝；显式 `alpha.moment.v1` projection 仅导出有界的评论/点赞/媒体元数据，表情必须先经 `__alpha_moment_emoji_v1` 与自有 `media-index.v1.json` 核验后才输出 SHA-256、大小、MIME；raw XML、原生 token 和可下载 URL 不进入导出；独立 `resolveMomentEmoji` 只接受 `__alpha_moment_emoji_v1` 对显式 `emoji-xml:` source 的图片映射，并重新核对自有索引的 SHA-256、大小、MIME、相对路径、账号和 moment 绑定；HTTP `/api/v1/sns/timeline`、`/api/v1/sns/usernames`、`/api/v1/sns/day-counts` 和 MCP `alpha-independent.moments.*` 只读适配器保留来源字段并标记 synthetic-only | 真实微信 `SnsTimeLine`/`snsmessage` schema、评论 XML/互动与原生媒体解析、synthetic UI 导出入口和防删除写入 | synthetic fixture 时间线分页、作者聚合、日计数、明确索引的合成表情映射、评论 projection 的只读媒体渲染、engine 导出任务和页面只读展示正确；真实 schema/无 capability 账号继续 fail-closed |
| 防撤回、朋友圈防删除 | UI、策略接口、原 retention 库 | 可维护的保留机制及可恢复写入 | 只在明确开启后作用，有备份/恢复验证 |
| AI 助手、会话总结 | 多服务适配/worker JS、线程 UI、IPC | 数据工具、gateway、持久状态及端到端对接 | 真实工具结果、审批、取消、重试、上下文压缩均正确 |
| AI 记忆、人格、外部 MCP | JS、UI、协议、原 server | 记忆存储、工具权限与完整 gateway | 账号/线程隔离、审批和删除行为可验证 |
| HTTP API、MCP、CLI | main 网关/代理部分、公开契约；独立后端新增本机受控 HTTP/MCP 适配器，当前声明 58 个工具，覆盖状态、账号（含只读工具目录）、会话、消息、搜索、联系人和群成员，以及 profile、消息原始 DTO、上下文/日期辅助查询、独立消息命中定位、独立消息来源文本、独立年度/会话关系基础统计、会话/账号媒体元数据浏览、显式 v4 `media.probe` 元数据探针、合成语音播放解析、独立移动端账号/会话概览、显式数据源 revision/watcher 诊断、synthetic moments 时间线/作者/日计数和 metadata-only 导出、synthetic favorites 列表和媒体槽位/解析、导出能力/统计、scope 1–4 聚合分析，并支持受控会话文件导出、媒体 metadata 导出，以及独立定时导出计划的 CRUD/CAS、run-now、运行/尝试历史和 retry 工具（均标记 `scope=alpha-independent-scheduled-export`，不冒充官方计划 API） | 官方其余 HTTP/MCP 路径、真实朋友圈 `SnsTimeLine`/`snsmessage`、媒体/朋友圈互动/真实收藏库/发送语义、完整兼容测试 | 已接入路径在合成 DTO 上通过鉴权、边界、字段和错误测试；独立消息命中定位及 analytics/媒体浏览工具明确标记 `native_schema_supported:false`；`media.probe` 只返回显式 v4 媒体库元数据并固定标记 metadata-only，不生成原生 token 或播放媒体；`alpha-independent.records.list_candidates` 与 `/api/v1/independent/records` 明确标记消息派生候选记录，不冒充官方 `alpha.messages.resolve_search_hit` 或 `wechat.analytics.*`；`wechat.core.list_tools` 明确只返回独立适配器只读子集并标记 `complete:false`；moments/favorites/voice/mobile synthetic/独立路由固定标记 synthetic-only 或 verified-dto 且真实 schema fail-closed；官方列出的24个HTTP路径、60个MCP工具仍需逐项验证 |
| 应用锁及凭据保存 | UI、IPC、原 security host | 自有可维护安全存储及锁实现 | 锁住时数据访问被阻止，凭据加密且不串账号 |
| 更新与发布 | JS更新逻辑、公钥/配置；新增原生 flavor 与独立 flavor 的显式打包入口及 backend marker；独立 flavor 默认关闭原作者更新通道，配置由 `provenance/independent-update-mode.json` 管理 | 自有构建、签名、公证、发布服务及版本迁移 | 两种 flavor 的 backend 选择和独立更新 marker 可审计；安装/升级/回滚和签名发布仍需在自有发行环境真实通过，不依赖作者发行身份 |
| 消息编辑 | UI、IPC、实验性Mac入口 | 受控写入组件及合法开发接口或自有实现 | 对副本验证编辑/恢复、一致性与故障恢复 |
| 发送文字、公众号文章导出 | UI/IPC/部分协调、原 sidecar | 原服务与组件或自有实现；另需Windows环境 | 去重、结果确认、失败恢复及真实业务验收 |
| CDN媒体补齐 | UI/IPC/部分协调 | 平台协议实现、合法登录态及下载组件 | 原图/视频/附件完整且认证/失败状态正确 |

此表覆盖功能领域，不把280个IPC常量当作280项功能。发送文字、公众号在线导出和CDN媒体补齐在官方当前表格中只支持Windows；macOS消息编辑为实验性。保留跨平台能力的接手目标，但本次Mac安装包不能证明这些Windows功能已恢复。

## 维护顺序

1. **可复现基线**：保留提取来源、恢复JS、原生哈希、依赖锁、构建和隔离运行证据。已完成，详见 README。
2. **通信与模块边界**：把 IPC/Protobuf/stdio 帧处理独立成模块，验证真实编解码与异常行为；保持现有界面业务契约。接着拆分主进程的桌面服务和后端接口。
3. **原生依赖接手**：先明确当前完整性错误的原因，评估能否使用作者提供的开发运行时。同时逐项取得/实现数据、媒体、安全、任务服务的源码。原包二进制复用仅为过渡，不作为长期可维护性的验收。
4. **全领域回归**：以受控样本验证聊天、搜索、资料、媒体、导出、分析、朋友圈、AI和开发者接口；所有领域都保留在清单中。
5. **写入与平台功能**：在数据副本/专用测试账号上验证保留、编辑、发送、公众号/CDN能力。Mac与Windows分别记录；不能用一边的编译通过代替另一边的功能通过。
6. **独立发布**：自己的应用标识、更新签名、版本迁移、安装升级和回滚通过后，才称为可独立维护的发行版。

新增导入数据源可以作为测试或兼容入口，但不能代替微信接入，也不能作为删除原功能的理由。独立实现使用自己的接口和安全机制；不会伪造原作者的签名、设备许可或服务响应。

## 现有依据

- [构建/运行实测](docs/local-build-and-run.md)
- [手动密钥与离线加密导入](docs/encrypted-import.md)
- [搜索、定位与日期导航](docs/search-navigation.md)
- [年度基础统计接手记录](docs/annual-analysis-recovery.md)
- [会话分析接手记录](docs/conversation-analysis-recovery.md)
- [聊天导出任务接手记录](docs/chat-export-jobs-recovery.md)
- [群成员导出接手记录](docs/group-members-export-recovery.md)
- [独立 HTTP/MCP 适配器接手记录](docs/http-readonly-adapter-recovery.md)
- [源码与原生材料缺口](docs/source-gaps.md)
- [其他资料记录的 schema 证据](docs/general-records-schema-evidence.md)
- [原生 operation 与 ABI 证据](docs/native-operation-source-evidence.md)
- [公共源码与替代后端候选](docs/public-source-candidates.md)
- [相关公开项目与可复用边界](docs/related-open-source-evidence.md)
- [JavaScript拆分与IPC边界](docs/independent-maintenance-js.md)
- [全功能原生替换分析](docs/independent-maintenance-native.md)
- [官方HTTP/MCP接口索引](docs/api-reference-index.json)
- [128项后端兼容映射](docs/backend-compatibility-map.md)
- [独立协议模块](packages/alpha-protocol/README.md)
- [候选源码实际构建结果](docs/chatlog-build-results.json)
- [原生启动诊断](docs/native-startup-diagnosis.json)
- [可编译数据层候选核查](docs/native-backend-candidates.md)
- [源码导航](docs/recovered-code-index.json)

WeFlow 的应用层源码与部分图片解码可用于研究，但其当前源码没有附带 macOS 原生数据库/自动密钥组件，且有独立许可条件。它不是一键补齐Alpha后端的替代品。当前没有导入它的代码，也没有改变本工程的功能目标。
