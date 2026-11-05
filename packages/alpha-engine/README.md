# 独立 Node 协议引擎
支持矩阵由 `npm run verify:independent-support` 从 `SUPPORTED`/`ALL_METHODS` 生成并校验，见 [`docs/independent-support-matrix.json`](../../docs/independent-support-matrix.json)。

这是自有后端的真实适配层。输入为恢复的 `EngineClientFrame`，输出为 `EngineServerFrame`，均使用 4 字节大端长度前缀。数据库读取委托同项目的 Go `alpha-data-bridge`，应用锁委托 `alpha-security`；不加载 Electron、恢复后的整份 main 或原闭源引擎。独立 HTTP/MCP 适配器另提供本地 `getDataSchemaDiagnostics`，包装 bridge 的私有 `schema.inspect` 只读诊断；它只列出显式选定副本的 SQLite 表/列元数据，固定 `complete=false` 与 `native_schema_supported=false`，不属于 Alpha 协议方法，也不增加支持矩阵。

当前实现 128 个请求分支中的 82 个，其余 46 个明确返回 `UNIMPLEMENTED`。新增公众号计划提供独立本地元数据 CRUD（`listOfficialSchedulePlans`/`getOfficialSchedulePlan`/`saveOfficialSchedulePlan`/`deleteOfficialSchedulePlan`），使用账号隔离、原子 0600 状态文件和 updatedAt CAS；它只保存计划元数据，不抓取文章、不下载媒体、不执行调度。公众号计划创建意图的三个独立 opaque 存储原语：`putPendingOfficialPlanCreate`/`getPendingOfficialPlanCreate`/`clearPendingOfficialPlanCreate` 将主进程已加密的 ciphertext 以 `official-plan-intent.v1.json` 原子持久化，限制为单账号一条、幂等插入和 generation CAS 清理；引擎不解密、不生成、不联网，也不实现公众号计划或文章导出。已接入基础聊天、搜索、日期导航、群成员读取、群成员 CSV/JSON/HTML/XLSX 只读导出、有限联系人档案（含基于 RoomData 的共同群）、联系人目录的 friend/group 分类、联系人 CSV/JSON/VCF/HTML/XLSX 只读导出、文本/JSON/Markdown/HTML/TXT/XLSX 及 `chatlab-json`/`chatlab-jsonl`/`chatlab-v0-json`/`chatlab-v0-jsonl`/`sql`/`weclone` 派生导出、消息中的声明性媒体引用、会话媒体/文件/链接元数据浏览、账号图片/视频元数据浏览、独立 source token 的已解码文本读取、显式 media-index 绑定的 `resolveMessageMedia`（仅自有 `alpha-media://sha256/...` token，重新校验文件和真实消息，不兼容原生 `media1_`），以及独立 HTTP/MCP 的 `readIndexedMedia`（仅完整绑定的 media-index 字节，HTTP 二进制/MCP 有界 Base64，不兼容 `media1_`）、只读取显式 `VoiceInfo.voice_data` 原始字节的第三方候选 `readVoiceBlob`（不解码、不兼容原生 VoiceInfo/SILK/transcribeVoice），以及合成 `__alpha_voice_playback_v1` + WAV media-index 的 `decodeVoicePlayback`（不兼容真实 VoiceInfo/SILK）、只读聊天导出任务状态、synthetic moments 的 JSON/Markdown/TXT/HTML metadata-only 导出任务、chat/record/moments 导出映射的通用 getJob/watchJob/cancelJob 视图、独立 stateDir 的聊天导出计划 CRUD/CAS、显式 run-now 运行/准备记录和重试、显式数据源变化监控目标、年度统计基础报告、会话关系基础统计、图片 key 的进程内手动配置/清除状态；若显式 DAT 索引样本解码成功，状态才报告 `usable=true`，否则保持 fail-closed、独立手动加密导入进度的有界读取（`watchDatabaseKeyAcquisition`，仅保留进程内事件，不自动取钥且进程重启不恢复）、显式 `moments.db`/`__alpha_moments_v1` fixture 的朋友圈列表、作者聚合和本地日计数（仅 synthetic schema，不兼容真实 `SnsTimeLine`/`snsmessage`；媒体请求明确返回 `MOMENT_EXPORT_MEDIA_UNAVAILABLE`）、显式 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture 的收藏列表、类型计数和标签过滤（不提供 source lookup、真实收藏 schema，`includeMedia` 明确返回 `FAVORITES_MEDIA_UNAVAILABLE`）、显式自有 `contact.db`/`__alpha_group_pins_v1` fixture 的群置顶投影（仅 seq/sender/serverId/localType/preview/pinnedBy，输出固定 `__alpha_group_pins` 记录名并标记账号 `group-pins` capability；不兼容原生群置顶 schema）、以及同一 fixture 中显式 `__alpha_favorite_media_v1` + 自有 `media-index.v1.json` 的 synthetic 收藏媒体槽位/解析、以及一个由桌面主进程显式接入的独立 DAT 图片 decoder（仅对 `encoding=dat` 的 image 索引条目、手动进程内 AES/XOR key 生效；协议 indexed-media 仍返回密文字节，边界见 `docs/media-decoder-evidence.md`）、bounded 内存聚合分析任务（scope 1 私聊完整年份、scope 2 群聊、scope 3 年度完整年份、scope 4 指定会话双人报告，支持 watch/cancel；scope 5/6 分别生成独立正文 mention 和私聊足迹报告，固定标记 `complete=false`、`native_schema_supported=false`）、本地持久化遥测同意状态和显式禁用的 flush、只读消息防撤回状态查询及其 status/install/uninstall/clear 控制面（均明确 `MESSAGE_ANTI_RECALL_WRITER_DISABLED`），以及朋友圈防删除控制面的明确禁用状态（均不声称 writer 可用）。聚合任务最多保留 32 个、结果上限 64 MiB、默认 TTL 10 分钟，进程重启不恢复；scope 1/2/4 报告使用原协议认可的 `alpha-aggregate-v1` / `alpha-dual-v1` JSON 外壳，scope 3 使用 `alpha-annual-v2`，scope 5/6 使用 `alpha-mentions-v1` / `alpha-footprint-v1` 独立外壳，统计值只来自已验证消息/session DTO，未恢复的 NLP、回复、朋友圈等字段保持空值，不声称与原 Alpha 完全等价。六种派生格式均带独立兼容标记，基于已验证消息 DTO 生成，不声称与原 Alpha/native formatter 或第三方工具完全兼容。`listGeneral` 支持经真实 `chat_room.ext_buffer` 解析的 `__alpha_group_members`，显式 `__alpha_group_pins_v1` 仅投影为自有 synthetic `__alpha_group_pins` 记录，以及从消息 XML 提取并明确标记为 `partial/candidate` 的 payments/revokes/calls/friend_requests；friend requests 仅匹配 local_type=37 且 XML 为 `VerifyMsg`/`friend` 的消息，字段保持未知或候选，不声称完整记录库。moments interactions 和 searches 仍保持不可用。`startRecordExport` 已接入独立内存任务管理器，接受 payments/friend_requests/revokes/calls、以及仅面向 `__alpha_favorites_v1` synthetic fixture 的 favorites，支持 xlsx/csv/json，并把每类写成独立文件；候选记录输出保留 partial/candidate/source 字段，favorites 输出为 `syntheticOnly=true`、`nativeSchemaSupported=false`、`metadataOnly=true` 的有界元数据投影，不输出 contentXml、媒体 token、下载 URL 或 source lookup，其他分类和未知格式明确拒绝，证据见 [`docs/general-records-schema-evidence.md`](../../docs/general-records-schema-evidence.md)。`http-server.cjs` 可选地把其中的已验证 DTO、独立消息来源文本（`GET /api/v1/independent/message-source`、`alpha-independent.messages.get_source`）、导出能力/统计、scope 1–6 聚合分析任务、九种会话文件导出、媒体 JSON/CSV 元数据导出，以及仅面向 `moments.db`/`__alpha_moments_v1` synthetic fixture 的朋友圈时间线/作者/日计数路由、独立 metadata-only moments 导出任务的 start/watch/cancel 路由、以及仅面向 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture 的收藏列表与 synthetic 收藏媒体槽位/解析路由暴露给本机 HTTP/MCP；另提供独立 `/api/v1/independent/records` 与 `alpha-independent.records.list_candidates`，只返回消息派生的 partial/candidate 记录并标记不支持原生 schema；`GET /api/v1/independent/recall-records` 与 `alpha-independent.records.list_recall_candidates` 只分页暴露 `listMessageRecallRecords` 的 `__alpha_general_revokes` 撤回候选，固定标记 `partial/candidate`、`native_schema_supported=false`、`writer=false`，不兼容原生 recall store；其 MCP 工具还提供 `alpha-independent.analytics.analyze_annual` 与 `alpha-independent.analytics.analyze_conversation`，分别覆盖可发现会话和指定会话的已验证消息，统一标记 `complete=false`、`native_schema_supported=false`，不复用官方 `wechat.analytics.*` wrapped schema；真实 `SnsTimeLine`/`snsmessage` 和收藏库 schema 仍不可用，详见 `docs/http-readonly-adapter-recovery.md`。聚合报告使用独立算法版本和 64 MiB 上限，不声称与原 Alpha 报告兼容；媒体元数据导出只保留 metadata-only DTO，不读取本地媒体；媒体文件解析/播放、原 Alpha `media1_`/raw/XML source、真实朋友圈、完整调度冲突与跨进程租约、AI、原生自动取钥完整链路和写入、防撤回写入、防删除写入等功能仍需逐项实现，不把页面能打开视作功能完成。遥测分支的状态边界见 [`docs/telemetry-recovery.md`](../../docs/telemetry-recovery.md)。完整范围仍见 `docs/backend-compatibility-map.json`。

## 启动与模块边界

入口为 `cli.cjs`。要求 Node 24.15+、已构建 Go bridge，以及已存在且不含符号链接的状态目录。目录和数据库只接受调用者显式配置；不扫描用户目录或运行中的微信。

| 环境变量 | 含义 |
| --- | --- |
| `ALPHA_INDEPENDENT_STATE_DIR` | 必填，应用锁和选中数据源的独立状态目录 |
| `ALPHA_INDEPENDENT_BRIDGE_PATH` | 配置数据时必填，Go 可执行文件绝对路径 |
| `ALPHA_INDEPENDENT_DATA_DIR` | 可选，经过授权的离线 SQLite 副本目录绝对路径 |
| `ALPHA_INDEPENDENT_ENCRYPTED_DIR` | 可选，显式加密源绝对路径；与 DATA_DIR 互斥 |
| `ALPHA_INDEPENDENT_IMPORTER_PATH` | 配置加密源时必填，Go importer 可执行文件绝对路径 |
| `ALPHA_INDEPENDENT_ACCOUNT_ID` | 配置数据时必填，调用者指定的数据集标识，不代表验证过的微信登录身份 |
| `ALPHA_INDEPENDENT_SELF_USERNAME` | 可选，显式提供的自身 username；缺失时消息方向为 unknown |

自动取钥是显式 opt-in 的 macOS 实验能力。设置 `ALPHA_INDEPENDENT_KEY_HELPER_PATH` 为经过校验的绝对可执行文件路径后，`acquireDatabaseKey` 才会调用兼容 Chatlog 的 helper（`key --pid <pid> --force`，解析 `Data Key: [64hex]`）；helper 只接收显式 PID 和 1–900 秒超时，运行在临时 `CHATLOG_DIR`，输出的 32 字节 key 只在内存中短暂存在，随后交给现有加密导入流程验证。helper 的配置目录、key、stdout/stderr 和路径不会写入 stateDir、manifest 或日志；微信进程不存在、SIP/权限限制、超时和模式不支持都会失败关闭。未设置该变量时返回 `KEY_ACQUISITION_UNAVAILABLE`。开发启动器和 packaged Electron 启动器都会透传这个绝对路径，但不会从用户目录自动发现或替换 helper。该路径有 fake-helper 回归测试，但当前没有真实微信进程取钥验收，也不代表原生 Alpha 的完整取钥链路。随包的 `vendor/runtime/bin/alpha_xkey_helper` 属于另一条原生 Alpha xkey 链路，需要 `alpha-xkey-helper-v1` 的 loopback challenge、security-host/Native Vault ticket 和 runtime policy；不能直接配置为上述 Chatlog helper，也不能伪造 `ALPHA_XKEY_AUTH_*`。

明文数据源根目录可以额外放置 `media-index.v1.json`，也可以通过 `writeMediaIndex` 从调用方明确给出的根目录内相对文件清单生成它。引擎不会扫描其他位置；它只把已声明且绑定到当前账号/会话/消息的图片引用映射为独立 `alpha-media://sha256/...` URI。条目 `encoding` 默认是 `raw`，也可明确标记为 `dat`；DAT 只允许 `image` 条目，桌面主进程在独立模式收到手动 AES/XOR key 后才会解码图片 grant，协议层 `readIndexedMedia` 仍返回原始密文字节。索引文件和媒体文件仍属于数据源快照，源变化会触发既有的不可变数据集检查。

无数据配置时，账号清单真实为空。配置错误或 Go 退出会返回错误，不变成成功的空清单。明文源在未锁定启动时，只有 `account.info` 验证实际 SQLite 成功后才接受 Hello。加密源的 Hello 仅声明自有协议层可用；首次未锁定账号/数据请求再验证源和已有快照，导入前账号为 discovered / waiting_for_key。已锁定启动不访问加密源或明文快照，所有账号和数据请求受锁限制。

模块用途：

- `index.cjs`：方法分派、协议 DTO 映射、账号选择及 `runStdio`。`createEngine` 要求真实 `lock`，每个数据请求在异步工作前后检查访问状态。
- `bridge-client.cjs`：独立 Go 子进程、JSONL 请求相关性、大小/超时限制和故障传播。
- `snapshot-store.cjs`：有界目录清单、异步分块哈希、严格 manifest、源和解密快照的完整性验证。
- `importer-client.cjs`：一次性 stdin 密钥缓冲、导入器超时/输出上限、取消并等待子进程退出。
- `cli.cjs`：读取明确配置、创建真实安全模块、传输生命周期；EOF、SIGINT、SIGTERM 都关闭 Go 子进程。

stdout 只输出二进制协议。stderr 仅输出初始化错误码，不转发 Go 的源路径或数据内容。

## 已实现的协议

Hello 身份为 `alpha-independent-engine`，协议 1.0。`supportedMethodIds` 使用恢复协议中 `EngineClientFrame` 的字段编号，测试直接对照静态覆盖清单校验。

| 方法 | 字段编号 | 实际行为 |
| --- | ---: | --- |
| hello | 10 | 自有引擎版本协商；不冒充原引擎的 bootstrap 证明 |
| getCapabilities | 11 | 无原产品 entitlements，返回空对象 |
| getTelemetryStatus | 21 | 返回 stateDir 中已持久化的本地同意选择；队列、字节数和下一次尝试恒为 0，已同意时明确报告 `INDEPENDENT_TELEMETRY_DISABLED` |
| setTelemetryConsent | 22 | 校验并原子保存 `granted`/`revoked`、分类和版本到 `telemetry-consent.v1.json`；不启动网络发送 |
| flushTelemetry | 23 | 返回 `outcome=disabled` 和全 0 计数；没有遥测端点或事件队列，不伪造上传成功 |
| putPendingOfficialPlanCreate | 86 | 只保存主进程已加密的 opaque ciphertext 到 `official-plan-intent.v1.json`；单账号单条、幂等重复和冲突拒绝；不解密、不生成、不联网 |
| getPendingOfficialPlanCreate | 87 | 返回已保存的 opaque entry 或空响应；严格校验账号、UUID、大小和 state 文件权限；不声称公众号计划已存在 |
| clearPendingOfficialPlanCreate | 88 | 按 account/schedule/generation 做 CAS 清理并返回 `removed`；generation 不匹配不会删除；`removeAccount` 会同步清除该状态 |
| getAdvancedComponentStatus | 65 | 对协议中的五种高级组件返回独立后端的静态 `UNSUPPORTED_TARGET` 状态；不读取或伪造动态授权、设备密钥、下载进度或 native ready |
| getMessageAntiRecallStatuses | 119 | 对最多 500 个会话返回独立后端的只读防撤回状态；当前无 retention writer/trigger，逐项返回 `MESSAGE_ANTI_RECALL_WRITER_DISABLED`，不读取或修改消息库 |
| manageMessageAntiRecall | 99 | 保留防撤回 status/install/uninstall/clear 控制面；所有动作均返回 `MESSAGE_ANTI_RECALL_WRITER_DISABLED`、`enabled=false`，不读取或修改消息库 |
| manageMomentsAntiDelete | 47 | 保留朋友圈防删除控制面；status/install/uninstall 均返回 `MOMENTS_ANTI_DELETE_WRITER_DISABLED`、`enabled=false`，不读取或修改朋友圈数据库 |
| getImageMediaStatus | 52 | 返回独立后端的图片媒体静态状态；原生 key/媒体定位仍不可用。显式 `encoding=dat` 的桌面 grant 解码属于主进程隔离路径，不改变该协议状态或支持矩阵 |
| configureImageKey / clearImageKey | 53 / 54 | 仅支持显式手动 16 字节 AES + 0..255 XOR key 的进程内暂存和清除；key 不写入 stateDir、日志或环境，协议层仍不宣称原生媒体可用；桌面主进程另对显式 `encoding=dat` 图片索引条目和手动进程内 AES/XOR key 做隔离解码，自动/内存扫描模式明确拒绝 |
| listAccounts | 12 | 显式离线数据源的实时验证及账号状态 |
| selectAccount | 13 | 成功验证后持久保存选择 |
| removeAccount | 70 | 仅移除独立后端本地状态，原始 dataDir 保留；写入 removed-account.v1.json、清理选择/任务/分析缓存，显式 discoverAccounts 验证同一源后可重新加入 |
| listConversations | 14 | 真实会话表分页，联系人备注/昵称为名称；无 contact.db 时回退 username |
| listMessages | 15 | 跨分库稳定分页、顺序和排他毫秒时间范围；保留可验证的消息 `refs` |
| getMessageSource | 107 | 仅接受本引擎生成的 `independent1_` source token，最多重新扫描 128 个 100 条消息页来定位同一账号/库/表/完整 localId 的已验证消息，返回其已解码文本（`format=text`）；原 Alpha `media1_` token、raw/XML 和媒体文件读取明确不可用 |
| decodeVoicePlayback | 128 | 仅接受消息库显式 `__alpha_voice_playback_v1` synthetic 映射和自有 `media-index.v1.json` 中唯一、重新校验的 WAV 条目；重复 source→WAV 映射、非 WAV rendition/MIME、哈希或账号不一致均失败关闭，不兼容真实 VoiceInfo/SILK/native media cache |
| resolveMessageMedia | 103 | 仅接受显式索引产生的 `alpha-media://sha256/<sha256>` token；要求图片条目绑定当前账号、会话和消息，并重新校验文件哈希/大小和消息 ref；原 Alpha `media1_`、MD5、远程补齐、pending、live video 和非零 record offset 明确不可用 |
| browseConversationMessages | 137 | 真实 `messages.list` 的降序元数据筛选；支持 `media`、`file`、`link`，保留消息 refs/display；`music`、`mini-program`、`transaction` 明确返回不可用 |
| browseAccountMedia | 138 | 直接读取指定会话，或按真实 session index 扫描账号范围的 `media`、`image`、`video`、`file`、`link` 元数据；支持分页和毫秒范围，不读媒体文件、不生成 token、不播放；消息中的图片 ref 可按显式 `media-index.v1.json` 绑定为独立 `alpha-media://sha256/...` URI，主进程按大小、哈希、路径边界和图片 magic 读取，显式 `encoding=dat` 条目另需手动进程内 key；详情见 [`docs/media-index-foundation.md`](../../docs/media-index-foundation.md) |
| exportConversation | 16 | 只读 JSON/Markdown/HTML/TXT/XLSX 和六种消息 DTO 派生格式导出，支持精确毫秒范围和安全新文件发布；ChatLab v0 JSON/JSONL 对 `@chatroom` 会话附带最多 5000 条 `__alpha_group_members` verified projection，私聊成员为空；HTML 是安全转义的静态页面，XLSX 是固定列的单工作表，SQL/CSV/JSON 派生文件只含验证过的文本和元数据，不含媒体 |
| searchMessages | 17 | 全局/会话搜索、Unicode 小写字面匹配、发送者/闭区间时间筛选、按会话分组及真实数量 |
| discoverAccounts | 29 | 仅接受与已配置源路径完全一致的 sourceLocation |
| importDatabaseKey | 30 | 仅对显式加密源接收一次性 32 字节 key；导入成功前保持 waiting_for_key |
| watchDatabaseKeyAcquisition | 129 | 读取当前进程内手动加密导入事件（accountId + afterEventSeq 游标）；事件有界、单调递增，包含阶段/进度/终态错误码，不保存 key、路径或凭据；桌面边界以十进制字符串传递 uint64 游标；进程重启后历史丢失，超过 64 条的旧事件会被淘汰且响应不提供 gap 标记；自动取钥仅在显式配置 helper 后以受控实验方式运行，未配置时不可用 |
| listContacts | 42 | 升序/降序、offset/limit、联系人字段字面量模糊查询和 `__alpha_contact_exact:` 精确 username 查询；带 `directory` 时基于同一 verified contacts.list 派生 friend/group 分类与完整八类计数，其他分类明确拒绝 |
| listMoments | 43 | 仅读取显式 `moments.db`/`__alpha_moments_v1` synthetic fixture，支持有界分页、作者/关键字/时间筛选；不读取或猜测真实 `SnsTimeLine`/`snsmessage` |
| listFavorites | 44 | 仅读取显式 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture，支持有界分页、类型/关键字/标签筛选和类型计数；不读取真实收藏库 schema，`includeMedia` 仍返回 `FAVORITES_MEDIA_UNAVAILABLE` |
| resolveFavoriteMedia | 113 | 仅解析显式 `__alpha_favorite_media_v1` synthetic token，并要求同一数据目录中的 `media-index.v1.json` 条目重新校验文件；返回独立 SHA-256 opaque id，不兼容原生收藏 token |
| listFavoriteMediaSlots | 116 | 仅读取显式 `__alpha_favorite_media_v1` synthetic 表的有界槽位；没有该表返回 `FAVORITES_MEDIA_UNAVAILABLE`，不推断真实收藏 schema |
| listMomentAuthors | 114 | 仅对 `__alpha_moments_v1` fixture 按 username 聚合作者和发帖数；不补联系人资料、头像或原生 moments 身份 |
| resolveMomentEmoji | 118 | 仅解析 `__alpha_moment_emoji_v1` 的 `emoji-xml:` synthetic source，并要求自有 `media-index.v1.json` 唯一匹配、重新校验 image 的 SHA-256/大小/MIME/相对路径/账号/moment；不解析真实评论 XML 或原生媒体 token，固定 `native_schema_supported=false` |
| getMomentDayCounts | 141 | 仅对 `__alpha_moments_v1` fixture 返回带 UTC 偏移的本地日计数；真实微信 moments schema 仍不可用 |
| exportContacts | 117 | 基于真实联系人字段导出 CSV、JSON、VCF、HTML、XLSX；当前仅支持 `local_type=1` 好友和 `local_type=2`/`@chatroom` 群聊，头像及其他分类明确返回不可用 |
| exportGroupMembers | 139 | 基于真实 `chat_room.ext_buffer` 成员记录导出 CSV、JSON、HTML、XLSX；每次完整读取最多 5000 条，头像和未知群资料明确不可用 |
| getContactProfile | 115 | 普通联系人基于真实 contact 表返回精确存在性和 username；若有 `groups.members`，共同群来自 `chat_room.ext_buffer` 全表扫描，返回真实 count/limit/truncated 及 contact 表可证明的显示名；`@chatroom` 返回真实成员数和唯一群主；未知个人资料、头像、标签、公告和好友验证保持为空 |
| listGeneral | 45 | `__alpha_group_members` 从 v4 `chat_room.ext_buffer` 解析群成员；显式自有 `__alpha_group_pins_v1` marker 只读投影为 `__alpha_group_pins` synthetic 记录（seq/senderId/serverId/localType/preview/pinnedBy），账号具备 `group-pins` capability 时才开放，固定要求 chatroom + ascending；`__alpha_general_payments`、`__alpha_general_friend_requests`、`__alpha_general_revokes` 和 `__alpha_general_calls` 仅返回消息 XML 能证明的 partial/candidate 记录，保留 source fields，并支持最多 512 字节的大小写不敏感字面查询和稳定升降序 offset/limit；缺少自有 marker 的原生形状表返回 `CAPABILITY_UNAVAILABLE`，其他记录分类仍不可用 |
| listMessageRecallRecords | 100 | 只读扫描 `__alpha_general_revokes` 的消息 XML 候选，返回独立 opaque cursor、`original*` 字段、`confirmation=unverified-candidate`、`provenance=alpha-independent-message-derived-candidate` 和 `NATIVE_RECALL_SCHEMA_UNSUPPORTED`；不兼容原生 recall store，不证明 captured/confirmed，也不提供 writer |
| getApplicationLockStatus | 48 | 真实独立密码锁状态 |
| unlockApplication | 50 | 真实密码校验、失败退避和持久状态 |
| lockApplication | 51 | 关闭数据桥并锁定访问 |
| getDataRevision | 105 | 由真实已验证 snapshotId 导出的 16 位十六进制 revision |
| getDataWatchTargets | 106 | 仅返回调用者显式选择的离线数据源根目录，供主进程通知 watcher 使用；不扫描用户目录，源改变或路径失效时失败关闭 |
| getChatExportStats | 120 | 1–100 个会话的真实消息数量、类型计数和首末时间；不表示导出功能已实现 |
| getChatExportCapabilities | 121 | 声明独立任务最多支持 500 个会话；独立导出策略允许无媒体 JSON/Markdown/HTML/TXT/XLSX 和六种消息 DTO 派生格式，XLSX 使用固定已验证消息列；消息类型筛选、附件、头像和自定义 XLSX 列保持不可用；原生语音转写分支仍未实现，独立适配器另提供显式 WAV media-index + caller-installed sherpa-onnx 模型的可选 ASR 工具，固定 `complete=false`、`native_schema_supported=false` |
| startChatExport | 122 | 为已验证会话创建只读导出任务；任务逐会话调用 `exportConversation`，输出目录和文件发布仍受安全路径检查，终态任务与计数原子保存到独立 stateDir；重启将未完成任务标记为 `CHAT_EXPORT_PROCESS_RESTARTED` |
| listChatExports | 123 | 列出指定账号的已持久化导出任务历史与当前任务快照；未完成任务在重启后显式标记失败，不伪造续跑 |
| watchChatExport | 124 | 读取当前内存任务快照，包含会话状态、消息计数、输出路径和错误码 |
| cancelChatExport | 125 | 请求取消尚未完成的任务；当前导出调用完成后停止后续会话，任务状态明确为 `canceled` |
| startMomentExport | 135 | 仅为 `moments.db`/`__alpha_moments_v1` synthetic fixture 创建 metadata-only JSON/Markdown/HTML/TXT 导出任务；显式 `alpha.moment.v1` projection 只输出有界只读字段，表情需经 resolver + 自有 media-index 核验后才输出 verified SHA-256/大小/MIME；raw XML、原生 token 和可下载 URL 会被省略；媒体类型明确返回 `MOMENT_EXPORT_MEDIA_UNAVAILABLE`，不兼容真实微信朋友圈 schema 或原生 formatter |
| startRecordExport | 136 | 为 payments/friend_requests/revokes/calls 候选记录及 `__alpha_favorites_v1` synthetic favorites 创建内存导出任务；每类一个 xlsx/csv/json 文件，favorites 固定 metadata-only/synthetic-only 标记并省略 contentXml、媒体 token、下载 URL 和 source lookup，其他分类和格式明确拒绝 |
| locateMessage | 126 | uint64 serverId 精确定位及无时间筛选的双向游标；重复 ID 明确报歧义 |
| getConversationDayCounts | 127 | 按 UTC offset 汇总最多 62 天半开时间区间内的消息数 |
| analyzeConversation | 24 | 基于指定会话 `messages.list` DTO 的关系报告基础统计（总数、方向、活跃天/小时、月分布、媒体/消息类型、首末消息）；NLP、完整回复语义和 moments 明确为空，详见 `docs/conversation-analysis-recovery.md` |
| startAggregateAnalysis | 110 | 创建 bounded 内存聚合分析任务；scope 1/3 要求本地时区完整年份 `[Jan 1,next Jan 1)`，scope 2/4 要求 `conversationId`（scope 4 可带时间范围）；scope 1/3 支持排除会话；返回 `analysisId`、会话总数和 TTL 到期时间；scope 5/6 分别生成独立正文 mention 和私聊足迹报告，固定标记 `complete=false`、`native_schema_supported=false` |
| watchAggregateAnalysis | 111 | 返回任务状态 1/2/3/4（running/completed/failed/canceled）、会话进度、失败数、报告 JSON 或稳定错误码；任务默认 10 分钟 TTL，进程重启不恢复 |
| cancelAggregateAnalysis | 112 | 请求取消尚未终止的聚合任务；任务结束后返回 `canceled=false`，取消期间报告不发布 |
| configureApplicationLock | 131 | enable_password / change_password / disable，交给真实安全模块 |

账号 capabilities 来自 Go 实际可用数据库；只有 session.db 的副本不会宣布 contacts 或 messages。每次查询账号状态或 revision 都重新调用 Go 验证不可变快照，文件变动不会沿用缓存 ready。

搜索、列表与定位共用消息 ID/内容转换。Go 对消息按 `create_time, database, table, localId` 排序，保证原搜索上下文算法能在时间相同的连续记录中找到命中；旧排序游标不混用。搜索时间范围双端包含，列表 after/before 双端排除，日期统计为 `[from,to)`；列表允许 after=-1 以定位 Unix epoch 的第一天。分页与分组游标绑定账号快照、查询、范围、发送者、方向和分组方式。

独立搜索协议增加字段 100 `incomplete`、101 `unreadableMessages`、102 `unmappedTables`。本次范围中存在无法解码的载荷或不能映射到真实会话的消息表时，仍返回已扫描的可读命中并明确部分覆盖；扫描上限或超时则返回错误。分组的数量是已读匹配记录的真实数量。原 UI 的覆盖说明由独立适配层展示，不把部分结果称为完整。合法 UTF-8/zstd 内容的读取与搜索共用 Go 解码状态；不支持的内容不会被 Node 二次解码成另一套结果。

`detectAccountDataSources` 是桌面 main 的本地 IPC，不在这 128 个协议方法中，需由桌面独立适配器把验证过的账号映射成候选。原许可证、在线密钥获取、锁 provision/reset 均未模拟；重置必须先设计安全状态清理语义。

加密源通过 `ALPHA_INDEPENDENT_ENCRYPTED_DIR` 和 `ALPHA_INDEPENDENT_IMPORTER_PATH` 显式配置，并与明文 `ALPHA_INDEPENDENT_DATA_DIR` 互斥。导入器只从 stdin 接收 key，Node 不把 key 放入参数、环境、日志或快照 manifest。成功后在状态目录的 `snapshots/` 下原子发布 0600 manifest 和 0600 数据文件；重启仅在加密源指纹相同且已有快照通过 Go `account.info` 验证时复用，绝不自动重新解密。失败或锁定会删除未发布目录。

manifest 文件名保持 `snapshots/manifest.v1.json`，内容版本为 2，严格限定输出到 `snapshots/snapshot-UUID/data`。重启复用前重新验证源和输出文件的 SHA-256、大小、页数与路径；损坏 manifest 或输出不当作成功。输入文件流式读取，最多 10,000 个目录成员、8 层子目录、单库 128 GiB、总库 512 GiB。目录祖先和成员拒绝符号链接，非普通文件及活动 SQLite sidecar 被拒绝。

完整导入流程最长 115 秒，stdout 限 2 MiB、stderr 限 4 KiB。仅 importDatabaseKey 与其他协议处理并行，其他请求顺序执行；导入进行中拒绝重复导入和数据读取，锁状态查询与锁定保持可用。锁定、EOF 和进程关闭等待导入器退出后清理整个私有工作目录。原子 manifest rename 是提交点；若锁定恰好发生在提交之后，保留已经完整验证的快照，关闭访问并不返回 ready 响应，避免悬空 manifest。

## 数据与兼容限制

查询使用 Go bridge 支持的离线明文 SQLite v4 schema；加密导入支持独立 importer 的 SQLCipher 4 / 4096 字节页 / PBKDF2-HMAC-SHA512 256000 次 profile。缺库、schema 不兼容、目录或文件改变、活动 WAL/SHM/journal 均按真实错误传播。已打开的源发生变化后，本次引擎会话保持错误，不自动重新打开以认可变化。

- Go 游标保留原不透明字符串，放入 protobuf bytes；不修改其内部 snapshot/query 绑定。
- serverId 保持 int64 BigInt。原协议 Message.localId 是 int32，超过范围时此旧字段为 0（不可用），完整字符串保存在独立 `sourceToken`，稳定消息 ID 也包含数据库/表/完整 localId。独立模式的桌面 DTO 现在保留 canonical `independent1_` source token，并可通过“查看源码”读取已解码文本；原生模式仍只接受 `media1_`。这不等价于原媒体/写入 token，所有写入方法目前均未实现。
- 消息文本保持原 UTF-8。zstd 内容在当前运行时支持并能安全解压时读取，否则返回 kind=`unsupported` 和明确的占位说明“[未支持的二进制消息内容]”；占位文本不是原始消息内容。`refs` 仅承载消息中明确提供的图片/视频/语音 ID 或 http(s) URI，字段可选但至少含 ID 或 URI；Node 会限制类型、字符集、长度和 URI scheme。正文不可读时仍可保留由真实语音 `serverId` 验证的 voice ref，图片/视频 refs 则为空。媒体浏览只复用这些真实消息 DTO；账号范围按可发现的 `sessions.list` 会话逐个扫描，不能宣称覆盖 session index 之外的历史表。refs 不代表本地文件可用，媒体文件不自动读取、解密、下载或播放，也不会生成原 Alpha 的 `media1_...` token。
- 消息方向仅依赖显式 SELF_USERNAME 与真实 sender；缺失任一时为 unknown，不从状态字段猜测。
- 联系人 directory 现在复用 verified `contacts.list`，只把 `local_type=1` 映射为 friend、`local_type=2` 或 username 以 `@chatroom` 结尾映射为 group；页面返回这两类的真实分页与计数，并为协议要求的其他六类填充 0。其他 `local_type` 没有可靠分类映射，若请求这些分类会返回 `CONTACT_DIRECTORY_CATEGORY_UNSUPPORTED`，不会猜测为企微、公众号、服务号、曾经好友或黑名单。`listContacts.lookup` 已接入 bridge 的批量精确 username 查找（1–500 个唯一值，缺失项省略，保留真实 DTO）；普通 `query` 会在 username、alias、remark、nick_name 四个字段做有界、大小写敏感的字面量子串匹配；`%`、`_` 不作为通配符。每次页大小最多 500；会话名称解析按页批量 lookup，并在旧 bridge 上回退逐个精确查询。`exportContacts` 只读取真实联系人分页，支持 CSV/JSON/VCF/HTML/XLSX；头像及其余未验证分类仍不可用。
- `getContactProfile` 对普通联系人返回 contact 表能够证明的精确 username/found 状态，并在 `groups.members` 可用时读取所有 `chat_room` RoomData；共同群最多按请求返回 20 个，`commonGroupCount` 是完整扫描数量，`commonGroupsTruncated` 只在确有更多群时为 true。群显示名仅按 remark、nick_name、alias 回退到 username，avatarRef 保持空。对 `@chatroom` 会复用 `chat_room.ext_buffer` 的真实成员记录，返回成员数和唯一 `isOwner=true` 的群主。gender=0 代表未知，个人资料、头像、标签、公告和好友验证字段为空；缺少 RoomData 的群不会被当作已找到，坏 RoomData 会失败关闭。
- 密码请求的 Uint8Array 在分派 finally 中清零，安全模块不持久保存明文；该锁是应用访问控制，不是对离线数据库的磁盘加密。

## 验证

在项目根目录，先构建 `build/candidates/alpha-data-bridge` 和 `build/candidates/alpha-snapshot-import`，再运行：

```sh
node --test tests/engine.test.mjs tests/engine-import.test.mjs tests/engine-search.test.mjs tests/independent-boundary-engine.test.mjs tests/import-security-boundary.test.mjs
```

测试只使用合成普通/加密/搜索/moments/favorites SQLite 数据，主路径使用真实 Node stdio → protobuf → Go importer / Go bridge。覆盖分片/粘包、协议编号、当前 46 个未实现分支、显式 moments fixture 的列表/作者/日计数/JSON/Markdown/TXT/HTML metadata-only 导出边界、显式 favorites fixture 的列表/类型计数/标签过滤、媒体槽位/解析和媒体拒绝边界、手动加密导入进度的事件游标/终态/取消/超时、遥测同意持久化/重启恢复/禁用 flush、只读防撤回候选分页、原生 writer 禁用状态和朋友圈防删除状态边界、64 位 ID、分页、独立 source token 文本读取、联系人档案存在性、通讯录 directory 分类、群成员 RoomData、群成员 CSV/JSON/HTML/XLSX 导出、联系人 CSV/JSON/VCF/HTML/XLSX 导出、JSON/Markdown/HTML/TXT/XLSX 导出、payments/friend_requests/revokes/calls 的 xlsx/csv/json 候选记录导出、内存导出任务状态、持久计划 CAS/run-now/历史记录、显式数据源 watcher 目标、静态高级组件状态、年度及会话分析统计、全局与会话搜索、分组/筛选/覆盖、日期与定位、声明性媒体 refs DTO 校验、媒体索引路径/大小/hash 边界、会话/账号媒体元数据浏览、锁/重启、真实加密源导入、错误密钥、manifest 越界/篡改、导入中状态查询/锁定/EOF、提交时锁定、超时和源改变。小脚本仅用于故障注入，不作为正常导入或数据实现。
