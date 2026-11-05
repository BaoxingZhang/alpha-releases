# Alpha 0.3.5 恢复工程

这是从 `Alpha-0.3.5-arm64.dmg` 整理出的可编辑工程：重建 Electron 主进程、预加载、React 界面和 AI worker 的 JavaScript，复用原包 macOS arm64 原生二进制。

**已能本地编译，并使用自有后端在原界面中读取、搜索、定位和导出离线微信 v4 聊天数据。** 已接通手动密钥导入与加密快照、联系人/会话/消息读取、联系人查询与有限档案存在性读取、联系人和群成员 CSV/JSON/VCF/HTML/XLSX 导出、跨分库分页、全账号和会话搜索、日期导航、会话/账号媒体元数据浏览及 metadata-only JSON/CSV 导出、显式媒体索引绑定的合成图片读取、显式 file media-index（仅 bounded type=6 + sha256 synthetic marker）的附件保存/打开 fallback、部分消息结构化展示、JSON/Markdown/HTML/TXT/XLSX 会话导出，以及基于已验证消息 DTO 的 `chatlab-json`/`chatlab-jsonl`/`sql`/`weclone` 派生导出、payments/friend_requests/revokes/calls 候选资料的 xlsx/csv/json 导出、年度基础统计、会话关系基础统计、应用锁，以及有界后台定时导出计划和重启恢复。独立后端还接通了消息防撤回和朋友圈防删除的状态控制面，但在没有 verified writer/schema 时明确报告 writer disabled，不声称已启用保全。朋友圈只读目前增加了一个显式 `moments.db`/`__alpha_moments_v1` synthetic fixture 的列表、作者聚合和本地日计数分支；它不兼容真实微信的 `SnsTimeLine`/`snsmessage` schema，真实朋友圈数据仍保持 fail-closed。 独立模式的原朋友圈页面仅在账号同时暴露 `moments`、`moment-authors`、`moment-day-counts` capability 时展示该 fixture，并明确标注 synthetic-only；页面只读文字、作者和日计数，并可通过同一数据源显式索引显示合成评论表情，不开放导出或防删除写入。独立引擎另支持仅显式 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture 的 `listFavorites`，提供有界分页、类型/关键字/标签过滤和类型计数；不提供收藏 source lookup、原生媒体对象或真实收藏库 schema，`includeMedia` 仍返回 `FAVORITES_MEDIA_UNAVAILABLE`；若同一 fixture 另有 `__alpha_favorite_media_v1` 和自有 `media-index.v1.json`，独立 `listFavoriteMediaSlots`/`resolveFavoriteMedia` 可读取并校验合成媒体；独立适配器仅提供同一 synthetic fixture 的只读 `/api/v1/favorites` 与 `alpha-independent.favorites.list_items`。独立适配器另提供 `GET /api/v1/independent/records` 与 `alpha-independent.records.list_candidates`，读取带 `partial/candidate` 标志的消息派生记录并标明不支持原生 schema。另有一个只接受调用方字节的独立 DAT 图片解码模块（v4 要求显式 AES/XOR key，旧式 DAT 按 magic 推断 XOR key）；桌面主进程已将它接入显式 `media-index.v1.json` 的 `encoding=dat` 图片条目，要求手动进程内 key，并已通过 renderer→preload→main→预览闭环验证。它仍不接入原生媒体定位或 Alpha token。派生格式不声称与原 Alpha/native formatter 或第三方工具完全兼容。独立引擎还提供可选的本机受控 HTTP/MCP 适配器（包含已验证 DTO 查询、导出能力/统计、会话文件导出、媒体 JSON/CSV 元数据导出，以及仅面向 `moments.db`/`__alpha_moments_v1` synthetic fixture 的朋友圈时间线/作者/日计数路由和独立 metadata-only 导出任务路由、以及仅面向 `favorite.db` 或 `favorites.db` 中 `__alpha_favorites_v1` synthetic fixture 的收藏列表路由；真实 `SnsTimeLine`/`snsmessage` 和收藏库 schema 仍 fail-closed）。完整 Alpha 功能仍未恢复；真实微信数据、自动取钥、媒体定位与播放、真实云模型和其他导出格式等尚待接手。独立模式另有一个显式 opt-in 的本地 fixture AI worker，仅用于回归演示，不代表模型服务或云端 AI。朋友圈、收藏和“其他资料”记录的证据边界分别见 [朋友圈 schema 证据](docs/moments-schema-evidence.md)、[收藏 schema 证据](docs/favorites-schema-evidence.md) 和 [其他资料记录证据](docs/general-records-schema-evidence.md)；随包原生 operation 和 ABI 线索见 [原生 operation 证据](docs/native-operation-source-evidence.md)。完整接手范围详见 [独立后端与实测](docs/independent-backend.md)、[独立 HTTP/MCP 适配器](docs/http-readonly-adapter-recovery.md)、[加密导入](docs/encrypted-import.md) 和 [搜索导航](docs/search-navigation.md)。

`chatlog-candidate` 研究适配层见 [边界说明](docs/chatlog-candidate-adapter.md)。它只对调用方明确提供的已解密工作目录启动 Chatlog 候选子进程，限制为 loopback 只读 JSON 路由，不自动取钥、不打开媒体/MCP 路由，也不增加 Alpha 官方支持矩阵；它目前是后续真实脱敏副本验收和 DTO 映射的接入点，不能当作 native parity。

可用 `npm run chatlog:preview -- --binary /absolute/chatlog --work-dir /absolute/decrypted-work --kind contacts|sessions|messages` 对显式脱敏工作目录做候选预览；输出会保留 candidate 边界，不读取或保存数据库密钥。

在接入一个已解密的 v4 数据副本前，可以运行 `npm run inspect:source -- --data-dir /absolute/decrypted-v4 --account-id label --json` 查看有界 SQLite 表/列诊断。该命令只调用项目自己的只读 bridge `schema.inspect`，要求显式绝对路径和调用方标签，不读取密钥、不导入快照、不扫描其它目录；输出固定为独立 source-diagnostics，`complete=false`、`native_schema_supported=false`，不能据此宣称真实 native schema 兼容。

如果还不知道微信数据目录，可以先运行 `npm run discover:v4-sources -- --json`。它只检查固定的 macOS 微信容器路径，输出脱敏相对路径、候选标识和 SQLite `-wal/-shm/-journal` 侧文件状态，不读取表内容、不复制文件、不扫描任意用户目录；`active-sidecars` 只表示数据仍可能被微信使用，不能当作可读取副本。需要把候选路径复制到人工预检命令时，可运行不带 `--json` 的 `npm run discover:v4-sources -- --show-path`；绝对路径只在这个明确的人类输出模式出现，`--show-path --json` 会被拒绝。

如果副本的核心 schema 尚未匹配、因此 bridge 还不能启动，可先运行 `npm run inspect:schema-only -- --data-dir /absolute/decrypted-v4 --json`。这个独立诊断只枚举明确目录中的 `.db` 文件并读取表/列元数据，保留无法打开数据库的有界错误；它不启动业务 bridge、不读取密钥、不读取消息内容，也不放宽任何业务 schema。输出固定 `readOnly=true`、`complete=false`、`nativeSchemaSupported=false`，详见 [schema-only 诊断](docs/schema-only-diagnostics.md)。

也可以用 `npm run preflight:v4 -- --data-dir /absolute/decrypted-v4 --account-id sanitized-v4 --json` 一次完成 schema-only 和 bridge 预检。`status=ready` 只表示当前副本被独立 bridge 识别，`status=schema-only` 表示 SQLite 元数据可读但业务 schema 尚未匹配；所有结果仍固定 `complete=false`、`native_schema_supported=false`，详见 [v4 副本接入预检](docs/v4-intake-preflight.md)。

需要把项目外的授权静止副本接入桌面时，可使用 `npm run stage:v4 -- --source-dir /absolute/decrypted-v4 --account-id sanitized-v4 --target-name sanitized-v4 --json`。它会在项目 `.runtime/v4-staged/` 下创建无软链接的副本，拒绝 SQLite 活动 sidecar、特殊文件和超限输入，并在原子发布前运行预检；`published=true` 仍只表示独立 DTO 可读，不代表 native schema 或完整功能。

独立 MCP 适配器当前声明 92 个工具；新增 `alpha-independent.messages.resolve_app_display` 与 `GET /api/v1/independent/message-display` 只按会话和 `server_id` 返回已验证的链接、文件、引用或位置 display 投影，固定 `partial=true`、`complete=false`、`native_schema_supported=false`、`raw_available=false`、`media_ready=false`；不返回原始 XML、原生媒体 token、CDN/key URL，官方 `wechat.chat.resolve_app_message` 仍保持未实现；新增 `alpha-independent.moments.resolve_emoji` 与 `GET /api/v1/independent/moments/emoji` 仅解析显式 `emoji-xml:__alpha_moment_emoji_v1:` synthetic 映射，并用自有 media-index 校验表情文件；响应固定 `synthetic_only=true`、`complete=false`、`native_schema_supported=false`，真实评论 XML 与原生媒体 token 仍不支持。新增 `alpha-independent.moments.get_anti_delete_status` 与 `GET /api/v1/independent/moments/anti-delete/status` 只返回朋友圈防删除 writer 状态，固定 `writer=false`、`complete=false`、`native_schema_supported=false`，不读取或修改原生朋友圈库。新增 `alpha-independent.exports.list` 与 `GET /api/v1/independent/exports`，按已验证账号列出独立 chat/moments/records 导出任务，固定 `scope=alpha-independent-export-jobs`、`complete=false`、`native_schema_supported=false`、`read_only=true`，支持 kind 和数量上限过滤，不兼容原生 Alpha 任务服务或远程历史。新增 `alpha-independent.records.start_export`、`watch_export`、`cancel_export` 及对应独立 records export HTTP 路由，仅导出消息派生的 partial/candidate 记录和 synthetic favorites metadata，固定 `partial=true`、`candidate=true`、`complete=false`、`native_schema_supported=false`，不兼容原生 Alpha 记录库或 formatter；新增 `alpha-independent.contacts.export` 和 `alpha-independent.contacts.export_group_members` 通过账号隔离的 `POST /api/v1/contacts/export`、`POST /api/v1/group-members/export` 将已验证联系人/群成员字段写入调用方指定的新文件，固定 `complete=false`、`native_schema_supported=false`，不导出头像、不兼容原生 formatter，且拒绝源目录、状态目录、符号链接和已有目标。新增 `alpha-independent.telemetry.get_status` 与 `GET /api/v1/independent/telemetry/status` 只返回本地遥测同意和停用状态，固定 `upload_supported=false`、`complete=false`、`native_schema_supported=false`、`read_only=true`，不上传事件、不读取队列或修改同意状态。新增 `alpha-independent.messages.get_anti_recall_status` 与 `GET /api/v1/independent/anti-recall/status` 只返回指定会话的独立防撤回 writer 状态，固定 `writer=false`、`complete=false`、`native_schema_supported=false`，不读取或修改原生撤回库。新增 `alpha-independent.components.get_status` 与 `GET /api/v1/independent/components/status?component=1|2|3|5|6` 只包装引擎已有的高级组件静态诊断，返回 `availability=1`、`INDEPENDENT_ADVANCED_COMPONENT_UNSUPPORTED`、`complete=false` 和 `native_schema_supported=false`；它不动态授权、不读取设备密钥、不下载或启动 native 组件，也不改变 82/128 原生支持矩阵。新增 `alpha-independent.chat.get_incremental_messages` 和 `GET /api/v1/independent/sessions/:conversation_id/messages` 只复用 `listMessages` DTO，支持有界 `since_unix_ms`/`end_unix_ms` 毫秒窗口、`limit`、`cursor` 和 `ascending`，响应使用 `alpha-independent-chatlab-incremental.v1`、`compatibility=alpha-independent-message-v1`，并固定 `chatlab_compatible=false`、`complete=false`、`native_schema_supported=false`；它没有官方 ChatLab `nextSince`、历史水位或冲突解决语义。移动端组合工具 `alpha-independent.mobile.get_session_bundle`、`alpha-independent.mobile.search_chat` 和 `alpha-independent.mobile.get_chat_context` 只覆盖已验证消息 DTO，固定 `complete=false`、`native_schema_supported=false`，不兼容官方移动端 schema；其中 `alpha-independent.analytics.analyze_annual` 仅覆盖可发现会话，`alpha-independent.analytics.analyze_conversation` 仅覆盖指定会话的已验证消息。两者返回独立基础报告并标记 `complete=false`、`native_schema_supported=false`，不复用官方 `wechat.analytics.*` wrapped schema。 新增 `wechat.core.get_lock_status` 与 `GET /api/v1/security/lock-status` 只返回独立密码锁的非敏感状态，不返回密码、失败计数或重试时间，也不提供解锁和配置操作。需要在 Codex 中接入时，使用 [Codex MCP stdio 配置](docs/codex-mcp.md)；`npm run mcp:config -- --format codex-toml` 可生成 Codex CLI 的 TOML 配置片段，默认 JSON 仍用于通用 MCP 客户端。stdio 入口复用同一工具目录，不启动 HTTP 监听。 `alpha-independent.groups.list_pinned_messages` 只读取显式 `__alpha_group_pins_v1` synthetic fixture，固定标记 `synthetic_only=true`、`native_schema_supported=false`、`complete=false`、`writer=false`，不兼容原生群置顶 schema。媒体浏览工具 `alpha-independent.media.browse_conversation` 与 `alpha-independent.media.browse_account` 只返回消息元数据、refs、display 和来源标识，标记 `media_ready=false`，不读取或播放媒体。新增 `alpha-independent.media.get_image_status` 与 `GET /api/v1/independent/media/image-status` 只返回独立图片 DAT 索引/手动进程内 key 的验证状态，固定 `complete=false`、`native_schema_supported=false`、`media_ready=false`，不读取或返回 key，不兼容原生 media1/token。新增 `alpha-independent.media.probe` 与 `GET /api/v1/independent/media/probe` 只读取调用方显式选择的数据目录中的 v4 `hardlink.db`/`media_*.db` 元数据，返回源库 SHA-256、路径和大小，固定标记 `metadata_only=true`、`media_ready=false`、`native_schema_supported=false`，不读取媒体字节、不生成 `media1_` token、不播放。另有 `alpha-independent.media.read_voice_blob` 与 `GET /api/v1/independent/media/voice-blob`，只读取调用方已选择 `media_*.db` 中 `VoiceInfo.voice_data` 的原始字节，响应固定为第三方候选 `complete=false`、`third_party_candidate=true`、`decoded=false`，不解码 SILK、不接原生 `transcribeVoice`。`alpha-independent.media.inspect_asr` 和 `alpha-independent.media.transcribe_indexed_voice` 只对调用方显式提供的 sherpa-onnx runtime/model 与 WAV media-index 工作，固定标记 `complete=false`、`native_schema_supported=false`，不下载模型、不兼容原生 VoiceInfo/SILK；`alpha-independent.media.decode_voice_playback` 与 `GET /api/v1/independent/media/voice-playback` 只解析 `__alpha_voice_playback_v1` synthetic 映射和自有 WAV media-index，标记 `synthetic_only=true`、`native_schema_supported=false`，不兼容真实 VoiceInfo/SILK/native media cache。独立消息来源工具 `alpha-independent.messages.get_source` 与 `GET /api/v1/independent/message-source` 只接受 `independent1_...` canonical base64url source token，返回已解码文本并标记 `raw_available=false`、`native_schema_supported=false`，不读取原始 XML、媒体文件或数据库密钥。独立数据源诊断工具 `alpha-independent.source.get_revision`、`alpha-independent.source.get_watch_targets`、`alpha-independent.source.get_schema` 只返回显式源的稳定 revision、watcher 目录和 SQLite schema 元数据，标记 `scope=alpha-independent-source-diagnostics`、`complete=false`、`native_schema_supported=false`，不扫描用户目录或修改数据。独立 SQLite schema 诊断工具 `alpha-independent.source.get_schema` 与 `GET /api/v1/independent/source/schema` 只列出已选离线副本的相对数据库路径和表/列元数据，固定 `read_only=true`、`complete=false`、`native_schema_supported=false`，不接受路径或 SQL，不扫描用户目录，也不增加 Alpha 支持矩阵。独立撤回候选工具 `alpha-independent.records.list_recall_candidates` 与 `GET /api/v1/independent/recall-records` 只分页读取 `__alpha_general_revokes` 的消息派生候选，固定标记 `partial=true`、`candidate=true`、`native_schema_supported=false`，不兼容 native recall store，也不提供 writer。

新增的独立移动端工具 `alpha-independent.mobile.get_message_media_bundle` 只组合已验证消息 DTO 与声明性媒体引用，返回 metadata-only 的索引状态，固定 `complete=false`、`native_schema_supported=false`、`media_ready=false`、`raw_available=false`、`official_alias=false`；不返回媒体字节、原始 XML、`media1_`、CDN URL 或 key。

新增的独立移动端工具 `alpha-independent.mobile.get_session_bundle`、`alpha-independent.mobile.search_chat` 和 `alpha-independent.mobile.get_chat_context` 只组合已验证的账号、会话和消息 DTO，固定返回独立 scope、`complete=false`、`native_schema_supported=false`；`get_session_bundle` 只提供有界 `listAccounts`/`listConversations`/`listMessages` 结果，不包含未读数、静音、头像缓存、媒体 URL、原始 XML 或 native token。它们不实现官方 mobile snapshot/schema，也不增加 82/128 原生协议支持计数。

公众号计划的 `alpha-independent.official_plans.list_attempts`、`request_attempt`、`get_attempt` 和 `archive_attempt` 只记录本地 blocked-attempt 元数据；接口固定返回 `execution_supported=false` 与 `INDEPENDENT_OFFICIAL_EXECUTION_UNAVAILABLE`，不联网、不抓取、不下载、不执行，也不冒充 Alpha 原生计划运行记录。

原包模式仍保留；项目 Seatbelt smoke 会返回 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`，但在 macOS arm64、临时 HOME/TMP、Electron `--no-sandbox` 且不使用项目 Seatbelt wrapper 的 native smoke 中，原生 engine/native-host 已通过启动握手并返回 ready。两种结果分别记录在 [local-run.json](docs/local-run.json) 和 [native-smoke-validation.json](docs/native-smoke-validation.json)；native smoke 只证明启动和握手，不证明真实微信数据或完整功能。这是恢复后的 JavaScript 工程与新增维护模块，并非作者原始 TypeScript/Rust/C++ 源码仓库。

上游 [`xunchahaha/alpha-releases`](https://github.com/xunchahaha/alpha-releases) 是发行版、文档和更新策略仓库；本地审计没有发现 Alpha 应用源码，也没有公开许可证声明。版本、安装包摘要、公开功能范围和可复用边界记录在 [上游发行审计](docs/upstream-alpha-releases-current.json)。本工程因此保留原包 provenance，独立实现可维护后端和发布流程，不把上游 README 或安装包当作源码授权。

长期维护以尽量完整保留现有功能为目标，范围与逐项验收条件见 [MAINTENANCE.md](MAINTENANCE.md)；按阶段推进和每轮验收门槛见 [独立维护路线图](docs/maintenance-roadmap.md)。独立 stateDir 的白名单备份/恢复命令见 [状态备份与恢复](docs/state-backup-recovery.md)，它不会复制快照数据库、数据库 key、密码锁验证器或运行时凭据。

## 本机使用

接手一台新机器时，先运行 `npm run doctor`。它只检查 Node.js 版本、macOS arm64 平台、锁文件、原生运行时目录和 Electron/esbuild 安装，不扫描个人微信目录、快照、密钥或运行时状态；`--json` 可供 CI 或脚本读取。状态为 `ready` 后，再按下面的构建和合成数据演示步骤操作。

可选的独立 WAV 语音转写见 [optional-asr.md](docs/optional-asr.md)。它只读取调用方明确选择的 `media-index.v1.json` 语音条目，并要求维护者自行安装哈希匹配的 sherpa-onnx 运行时和模型；未安装时会明确报告不可用，不改变原生转写分支。

当前依赖、Electron 和项目内 Go 工具链已安装。先运行合成数据演示：

```sh
npm run build:independent
npm run demo
```

打开后勾选本地数据说明，点击“打开数据副本”，跳过图片密钥步骤并完成向导，即可查看合成会话。演示不读取个人微信数据。

要演示加密副本的手动密钥流程，运行 `npm run demo:encrypted`，将终端显示的合成测试密钥输入首次设置页。解密结果保存在项目内；不持久保存密钥，应用锁不加密磁盘上的明文快照。每次演示使用新配置目录。

`npm run demo:search` 生成包含压缩文本和历史会话的搜索演示。完成向导后搜索“维护”，可以验证分组、发送人筛选、命中定位与日期日历。

如需研究公开 WeFlow 组件，可先编译隔离探针：

```sh
npm run build:wcdb-compat-probe
```

探针只接受调用方明确传入的绝对 helper、WCDB 动态库、账号目录和密钥，当前只支持 `probe` 与 `wcdb_get_sns_timeline`。返回值固定标记 `sourceKind=explicit-third-party-wcdb`、`nativeSchemaSupported=false`、`complete=false`、`writer=false`；它不调用 Alpha 的 `_alpha_native_get_api`，不自动扫描用户目录，也不计入 Alpha 的 82/128 独立支持矩阵。WeFlow 的动态库还需要与其匹配的 `WCDB.framework`，本项目不复制第三方二进制。

独立模式默认保持 AI gateway 和外部 HTTP/MCP 关闭。需要测试本地 AI 对话链路时，明确传入 fixture 开关：

```sh
npm run start:independent -- --agent-fixture
```

该 worker 只提供固定的 `fixture` provider，模型列表为 `fixture`，输入 `hello` 会返回 `fixture:hello`。fixture 开关会给 gateway 注入独立的本地配置，不读取已保存的 provider 或凭据。它不调用网络，也不冒充 OpenAI 或其他云模型。`ALPHA_INDEPENDENT_AGENT` 只接受值 `fixture`；未传开关时独立模式继续返回 `INDEPENDENT_FEATURE_UNIMPLEMENTED`，普通 HTTP API 和外部 MCP 仍保持 fail-closed。

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
npm run verify:release-manifest # 重新计算并核对清单中的每个文件
npm run bundle:recovery  # 生成排除用户数据和构建输出的源码恢复包
```

朋友圈表情的独立恢复边界是 synthetic-only：`resolveMomentEmoji` 只接受 `emoji-xml:__alpha_moment_emoji_v1:` source，并要求 `__alpha_moment_emoji_v1` 与自有 `media-index.v1.json` 唯一匹配 image、SHA-256、大小、MIME、相对路径、账号和 moment；它不解析真实评论 XML、`SnsTimeLine`/`snsmessage` 或原生媒体 token，能力边界固定为 `native_schema_supported=false`。

项目的 `.github/workflows/maintenance.yml` 固定了同一套 macOS arm64 维护基线：递归获取参考子模块、按 `package-lock.json` 安装依赖、构建独立后端和 packaged 资源、组装普通与独立两个未签名 app 及 DMG、运行完整测试及独立/原包 smoke，并校验协议绑定、原包运行时哈希、独立 82/128 支持矩阵和维护边界。构建报告、两个 app manifest 和两个 DMG 会作为 Actions artifact 保留；Go 桥接和快照导入仍只接受项目内固定的 macOS arm64 工具链，不会在 CI 中改用系统 Go。

`npm run release:manifest` 会对 `dist/app`、`build/runtime-bundle`、`workers/agent/dist` 和 `build/packaged-resources/independent` 的每个文件生成 SHA-256 清单与整体摘要，写入 `.runtime/release-manifest.json`，并记录生成时的 Git commit 与已跟踪工作树是否有修改。发布前应确认 `gitWorkingTreeDirty=false`，避免把未提交的源代码误当成可复现发行输入。其中最后一项是独立 flavor 复制到 app `Resources/independent` 前的完整后端资源输入，确保发布清单能够追溯独立引擎、协议、运行时依赖和 Go 桥接产物。清单明确标记目标为 macOS arm64、原生代码未重新编译且项目未签名；它是发布审计材料，不是 DMG、代码签名或公证结果。原生运行时仍必须先通过 `npm run verify:vendor`。

`npm run audit:upstream` 会只读刷新上游 `alpha-releases` 的仓库 HEAD、release 资产、公开文件树、README/stable policy 哈希和可选的本地 DMG 校验。默认只输出报告；加 `--write` 才会原子更新 `docs/upstream-alpha-releases-current.json`，加 `--artifact /absolute/path/Alpha-0.3.5-arm64.dmg` 才会读取并核对本地安装包。该工具不下载发行二进制，也不把上游发行仓库当作源码或许可证来源。

许可证、来源分层和公开发布前的人工门槛见 [许可证与来源边界](docs/licensing-and-provenance.md)。当前 `recovery` 分支保持内部维护定位，不为恢复的上游应用层或原生运行时擅自声明许可证。

个人 fork 还提供 `.github/workflows/upstream-audit.yml`，每周或手动运行一次只读审计，固定使用 `recovery` 分支工具并把结果保存为 Actions artifact，不会自动修改仓库。

公开源码或发行材料前，可运行 `npm run audit:public-release -- --root /path/to/sanitized-tree --report /tmp/alpha-public-release-audit.json --strict`。它只读扫描 `docs/` 和 `provenance/` 中的本机绝对路径、私钥块和明显访问令牌；默认只报告，私有 REA/Ghidra 证据目录需要显式使用 `--exclude`，报告只保留相对路径和 `[redacted]` 标记。

如需准备一份待维护者复核的公开源码候选目录，可运行：

```sh
npm run prepare:public-source -- \
  --output /tmp/alpha-public-source-candidate \
  --report /tmp/alpha-public-source-audit.json \
  --manifest /tmp/alpha-public-source-manifest.json
```

该命令把筛选后的文件复制到调用方指定的新目录，保留嵌套路径，默认排除生成目录（包括 `packages/alpha-data-bridge/.runtime` Go 缓存）和私有 REA/Ghidra 证据，然后执行严格公开审计。候选保留不含本机路径的 `docs/public-dependency-licenses.json` 和 `docs/chatlog-licenses/` 许可证材料供人工复核。`--exclude` 可重复传入源仓库相对路径。输出目录必须在源仓库外且不存在；报告和 manifest 也必须写到源仓库及候选目录之外的指定路径。发现路径或凭据时返回 `blocked-by-public-audit`，保留候选目录与脱敏报告供修复，不修改原始 evidence。`ready-for-license-and-review` 只表示该次审计通过，仍需维护者完成许可证、来源、签名和发布审核，不能据此宣称整个项目已经安全公开。

`npm run build:packaged` 在 `build/packaged-resources/independent/` 生成可复制到 Electron `Resources/independent/` 的独立后端资源。普通 packaged flavor 默认仍使用原包 native runtime；独立 flavor 通过应用包内 marker 选择独立资源，开发启动时只需显式设置 `ALPHA_RECOVERY_BACKEND=independent`（手工模拟已打包进程时再加 `ALPHA_INDEPENDENT_PACKAGED=1`）。资源缺失时会明确失败，不回退到原生 engine，也不把 UI 启动成功当作后端就绪。

`npm run package:macos-app` 会基于本机 Electron 44 生成未签名的 `Alpha Recovered.app`，并写出逐文件清单；已有 `build:packaged` 产物时可直接运行 `npm run package:macos-app:from-build`，避免重复构建；`npm run package:macos-dmg` 进一步使用 macOS `hdiutil` 生成未签名、未公证的 DMG。默认 flavor 写入 `original` backend marker，保留原生启动链路。要生成双击即可选择自有独立后端的明确 flavor，运行 `npm run package:macos-app:independent` 或 `npm run package:macos-dmg:independent`，产物名称为 `Alpha Recovered Independent.app/.dmg`；它只设置本项目自己的 backend 选择，不绕过原生完整性、签名或许可校验。已有 packaged 资源时可使用 `npm run package:macos-app:independent:from-build`。清单始终标记 `projectSigned=false`、`notarized=false`，这些产物用于本地验证和自有发布流程，不能替代代码签名、公证或原生授权。

独立 flavor 另外写入 `alpha-update-mode.json`，内容来自 [`provenance/independent-update-mode.json`](provenance/independent-update-mode.json)，当前默认 `mode=disabled`，因此不会沿用原作者的更新公钥、策略地址或镜像。未来由维护者建立自己的签名更新策略后，应先修改这个 provenance 配置再重新打包和验证；普通 `Alpha Recovered.app` 仍保留原包更新配置。

`npm run bundle:recovery` 会生成 `.runtime/recovery-bundles/alpha-recovered-source.tar.gz` 及同名 manifest。归档会固定文件时间、压缩时间戳、归档所有者和 macOS 扩展元数据，因此在同一源码状态下重复构建时 archive SHA-256 应保持一致；manifest 的 `createdAt` 仍记录本次生成时间。源码包默认包含可编辑源码、测试、脚本、文档、协议材料和原生 provenance，但排除 `node_modules/`、`dist/`、`build/`、`.runtime/`、`.alpha/`、运行日志和截图，也不包含原生 runtime 二进制。需要在受控归档中携带原包二进制时可显式传入 `--include-vendor-runtime`；manifest 会记录 `includesVendorRuntime`、每个源文件的 SHA-256、原始 DMG 摘要，并始终标记 `nativeRecompiled=false`、`projectSigned=false`。这是一份未签名的维护源包，不是可直接安装的 DMG。

Electron 44 的二进制安装是独立步骤，因此保留 `npm run setup`。恢复工程固定 Electron 44.10.1、esbuild 0.28.2、Playwright Core 1.64.1；`package-lock.json` 是此次新增的锁文件。React 19.2.8 等前端运行时已经包含在原 renderer chunks 中，无需再装一份 React。

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

初始整理时提取的 169 个文件与安装包中的恢复内容逐字节对应；当前 `src/` 包含 171 个文件。本轮已修改 main 的独立后端选择/数据目录/网关边界，以及 renderer 的离线连接说明；变更摘要见 [维护来源记录](provenance/maintenance-changes.json)。未将大 bundle 机械拆成假定的原始模块；可使用 [修改指南](docs/editing-guide.md) 和 [代码索引](docs/recovered-code-index.json) 定位。当前索引包括 13 个 JS 模块、5822 个函数/类、564 个 React 组件候选，其中 8 个模块与记录的原始文件逐字节一致；候选包含第三方代码。

esbuild 会重新处理 13 个 JS 文件并生成调试 source map。这里的映射回到 `src/` 中的恢复 JavaScript，不是原始 TS/TSX。renderer chunk 文件名和相互导入路径保留，防止破坏原 HTML、动态加载与资源引用。

## 验证与边界

```sh
npm run verify:protocol # 校验独立协议模块仍与恢复源一致
npm run verify:maintenance # 一次运行只读的项目/协议/vendor/API维护检查
npm run audit:api       # 对照官方 HTTP/MCP 契约与当前独立适配器覆盖面
npm run verify:packaged-markers # 校验普通/独立 App 的 backend marker、manifest 和 Bundle ID
npm run verify:independent-support # 校验128项独立后端支持矩阵未漂移（当前82项已实现）
npm run status              # 从当前证据生成独立完成度、原生状态和剩余分支分类
npm run test:protocol   # 编解码、分帧边界与来源测试
npm run verify:vendor   # 核对43个原包运行时文件的SHA256和权限
npm run audit:native-abi # 只读盘点原生 WCDB dylib 的架构、导出、依赖和签名
npm run verify:dependencies # 对当前锁定依赖实时运行 npm audit（不含 optional）
npm run backup:independent-state -- --source /absolute/state --target /absolute/state.alpha-backup
npm run restore:independent-state -- --source /absolute/state.alpha-backup --target /absolute/new-state
npm run test:smoke      # 隔离检查、实际Electron界面、IPC与后端状态诊断
npm run test:smoke:native # 不使用项目Seatbelt wrapper的原生启动链路，只读临时运行时
npm run check:maintainability # 检查Node/锁文件、源码入口、工具链记录和构建复制边界
npm run test:encrypted  # 原UI手动密钥、错误密钥拒绝、消息读取与重启复用
npm run test:search     # 原UI搜索、发送人筛选、定位、月历和部分结果提示
npm run index          # 根据当前src重新生成导航索引
```

`test:smoke` 的成功退出表示隔离和界面冒烟通过，**不表示后端 ready**；后端结果单独写入 `docs/local-run.json` 的 `checks.backendReady`。新增独立模式已用合成数据验证读取、解密、检索和 JSON/Markdown/HTML/TXT/XLSX/派生格式会话导出；尚未验证真实微信数据，未获取实际密钥、发消息或调用模型。

`test:smoke:native` 与隔离 smoke 分开记录：它使用 `.runtime/<session>/` 临时 HOME/userData，不使用项目的 Seatbelt wrapper（仅沿用现有本地 smoke 的 Electron `--no-sandbox` 启动方式，不修改原生 guard、签名或许可），并要求原生 `engine` 与 `native-host` 报告 `ready`；它不读取真实微信数据、不修改原生文件，也不证明账号、媒体、写入、授权或远端服务可用。两种结果见 [原生 smoke 验证](docs/native-smoke-validation.json) 和 [本地构建运行说明](docs/local-build-and-run.md)。

主要缺口包括原 TS/TSX 与类型、完整开发工作区、原依赖锁、Cargo/Rust 和 C++/CMake 工程、原生协议生成工程、服务端授权实现，以及未随包提供的高级组件和语音模型。原生程序依赖自身的完整性、身份、许可及有效期检查，已有二进制不能保证恢复工程完整可用。

详细见 [缺失部分清单](docs/source-gaps.md)、[本地验证说明](docs/local-build-and-run.md)、[原生资源来源](docs/native-runtime-provenance.json) 和 [许可证与来源边界](docs/licensing-and-provenance.md)。原始商标、第三方许可文件及 bundle 中的许可注释保留；本工程未给恢复代码重新声明开源许可证。

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
