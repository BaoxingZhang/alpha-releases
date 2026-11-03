# 独立后端：离线读取、手动密钥导入与原界面

本轮新增自有 Go 数据桥接、Node 协议引擎和密码应用锁，已与恢复的 Electron 主进程/React 界面接通。真实运行使用人工生成的微信 v4 SQLite 数据库，完整走过首次设置并显示聊天消息；没有访问用户微信数据或取密钥。

后续新增自有 Go 加密快照导入器，支持原界面的手动密钥流程。错误密钥拒绝、逐页认证解密、四库明文哈希对照和重启复用已通过加密合成数据的桌面实测，见 [加密导入说明](encrypted-import.md) 与 [运行记录](encrypted-run.json)。

完整维护目标仍是 [MAINTENANCE.md](../MAINTENANCE.md) 中的全部功能。当前交付是可继续开发的第一层实现，不能当作完整 Alpha 替代品。

## 启动

```sh
npm run build:independent
npm run demo
```

`build:independent` 先编译并测试自有 Go 模块，再构建桌面 JavaScript。`demo` 在项目 `.runtime/demo-*/fixture/` 生成合成数据库，启动独立模式。进入界面后勾选本地数据说明，点击“打开数据副本”，跳过图片密钥步骤，完成向导即可看到合成聊天。显式绑定到 `media-index.v1.json` 的图片可在消息中预览；没有用测试缓存或固定账号数据绕过向导。

独立模式的 AI gateway 默认 fail-closed。要验证桌面设置、agent host 和流式 IPC 的本地链路，必须显式启用 deterministic fixture：

```sh
npm run start:independent -- --agent-fixture
```

fixture 只注册 `fixture` provider 和 `fixture` 模型，输入文本会原样以 `fixture:<文本>` 返回，并分成流事件；开关会给 gateway 注入本地配置，不读取已保存的 provider 或凭据。它不访问网络，也不代表任何真实云模型。`ALPHA_INDEPENDENT_AGENT` 的其他值会被启动器拒绝。此开关只放行 Agent 配置/对话所需的本地 bridge；独立模式的普通 HTTP API、外部 MCP 和外部 provider 仍拒绝。未传开关时，AI gateway 仍返回 `INDEPENDENT_FEATURE_UNIMPLEMENTED`。

不加载数据的独立模式为 `npm run start:independent`，真实账号列表为空。显式数据副本可以通过以下命令传入：

```sh
npm run start:independent -- --data-dir /absolute/project/.runtime/your-snapshot --account-id your-dataset-label
```

独立模式的朋友圈页面只有在账号能力同时包含 `moments`、`moment-authors`、`moment-day-counts` 时才读取上述 synthetic fixture。engine 的 `resolveMomentEmoji` 是单独的 synthetic-only 分支：只接受 `__alpha_moment_emoji_v1` 中显式 `emoji-xml:` source，且必须在自有 `media-index.v1.json` 找到唯一的 image、SHA-256、大小、MIME、相对路径、账号和 moment 绑定；它不解析真实评论 XML，也不兼容原生媒体 token。页面会明确标出 `moments.db`/`__alpha_moments_v1` 和 `synthetic-only`，显示文字、作者筛选、本地日计数，以及 projection 中由该 resolver 验证的只读合成评论表情；普通独立账号继续显示不可用状态。synthetic 页面不暴露导出或朋友圈防删除写入入口，未索引媒体仍保持不可用，也不会把聊天消息转换成朋友圈。`startMomentExport` 对显式 `alpha.moment.v1` projection 只导出有界的评论、点赞和媒体元数据；表情只有在 resolver 与 media-index 都核验后才带 `verified`、SHA-256、大小、MIME，raw XML、原生 token 和可下载 URL 会被省略。没有 projection 的行继续只输出基础文字/身份字段并标记 `projectionAvailable=false`。
独立引擎另仅在账号暴露 `favorites` capability 时读取显式 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture，`listFavorites` 支持有界分页、类型/关键字/标签过滤和类型计数，并标记 `sourceTable`；不提供 source lookup、媒体对象或原生收藏 schema，`includeMedia` 返回 `FAVORITES_MEDIA_UNAVAILABLE`。若同一 fixture 显式提供 `__alpha_favorite_media_v1` 和自有 `media-index.v1.json`，`listFavoriteMediaSlots`/`resolveFavoriteMedia` 可读取并重新校验合成媒体；这不代表真实收藏媒体语义。原 UI 的收藏页、真实微信收藏库和真实收藏媒体语义仍保持不可用；独立适配器仅暴露同一 fixture 的只读收藏列表及合成媒体路由。

当前启动器只接受项目 `.runtime/` 内无符号链接的目录，内容须为稳定、已解密的微信 v4 SQLite 副本。`account-id` 是数据集标签，不是经微信验证的登录身份。不会自动寻找个人微信目录。活动 WAL/SHM/journal、目录或数据库变化、加密文件、不兼容 schema 均明确失败。

加密副本须改用 `--encrypted-dir`，不能与 `--data-dir` 混用；首次打开需要已有密钥。`npm run demo:encrypted` 可演示此路径。固定加密格式和明文快照的存储边界见 [encrypted-import.md](encrypted-import.md)。

原包模式默认使用 `npm start` 的项目 Seatbelt；该隔离 smoke 会返回 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`。显式 `npm run start:native` 不使用该 wrapper，`npm run test:smoke:native` 已在临时 HOME/TMP 下验证原生 engine/native-host 启动握手为 ready；两者都没有读取真实微信数据。独立模式使用自己的服务实现，没有修改原二进制 guard、签名、公钥或许可。

原生 ABI 取证仍是单独的证据边界。当前文档记录了 `_alpha_moments_project_row_v1`、`_alpha_native_get_api` 和 `_alpha_sqlite_readonly_get_api` 的静态入口、部分参数检查及残余未知项（见 [`native-operation-source-evidence.md`](native-operation-source-evidence.md)）。这些观察没有执行未知函数表调用，也没有证明朋友圈、收藏或原生媒体能力已可用；独立后端继续使用自有协议和 SQLite 读取实现，并对缺少授权 schema/fixture 的分支 fail-closed。

## 已接通的内容

| 部分 | 当前行为 | 仍有限制 |
| --- | --- | --- |
| 原桌面 UI | 原首次设置和聊天页实际完成，保留全部菜单入口 | 其他菜单对应后端大部分尚未实现 |
| 数据源 | 显式指定一个明文或加密离线副本，验证结构，选择状态持久化 | 默认不自动取钥、无在线微信身份识别、多账号注册或实时变化；显式配置 helper 后可进行受控取钥实验 |
| 手动密钥和解密 | 固定微信 v4 格式，逐页认证、SQLite完整性校验、原子发布明文快照，重启验证后复用 | 自动取钥仍无真实微信样本验收；另支持显式 helper 的受控取钥实验，但不声称原生链路等价；仍无 WAL 合并、其他加密格式和图片媒体解码 |
| 联系人 | 实际查询 username、alias、remark、nick_name；支持精确 username、批量 lookup、字面量子串模糊查询、升序/降序 offset 分页、有限 contact profile 存在性读取、基于 `chat_room.ext_buffer` 的共同群计数/列表，以及 CSV/JSON/VCF/HTML/XLSX 只读导出；directory 已基于 verified contacts.list 派生 friend/group 分页与计数；独立模式 UI 只提供这些已验证的分类和导出格式，并禁用头像选项 | 完整个人资料字段、头像导出、企微/公众号/服务号/曾经好友/黑名单分类和资料编辑仍未实现；directory 请求这些未验证分类会失败关闭，分类证据边界见 [`docs/contact-directory-evidence.md`](contact-directory-evidence.md) |
| 会话 | 实际 session 查询，联系人备注/昵称，稳定分页 | 仅提供存在的数据列；无完整会话资料和群信息 |
| 消息与图片 key | 跨分库排序、正反向分页、时间范围、原始 ID/定位；保留声明性媒体 refs；对可验证的 type-48 位置和 type-49 链接/文件 XML 提供安全 display 元数据；`browseConversationMessages` 支持 media/file/link 元数据筛选，`browseAccountMedia` 支持 media/image/video；`getImageMediaStatus`、`configureImageKey`、`clearImageKey` 提供进程内手动 key 的安全状态生命周期；显式 `media-index.v1.json` 可将已声明且账号/消息绑定的图片和文件 ref 映射为独立 `alpha-media://sha256/...` URI，`writeMediaIndex` 可由调用方给定的相对文件清单生成并原子发布该 manifest；文件附件保存/打开还会复用现有 renderer→preload→main grant 和临时复制链路，边界见 [`media-index-foundation.md`](media-index-foundation.md) 与 [`file-attachment-recovery.md`](file-attachment-recovery.md)；另有只接受调用方字节和显式 key 的纯 DAT 图片 decoder，见 [`media-decoder-evidence.md`](media-decoder-evidence.md)；合成 PNG 已经通过真实 renderer→preload→main IPC 读取并由 `alpha-media://img/...` 预览 | 真实微信附件表、`media1_` token、远程补齐和媒体文件语义仍未恢复；索引附件只接受显式 `kind=file`、64 MiB 以内、唯一账号绑定的 SHA-256 文件，不兼容原生 token；engine 的 raw indexed-media 分支仍不隐式解码或生成原生 token；桌面主进程只对明确 `encoding=dat` 的 image 条目调用 DAT decoder，并要求手动进程内 key；索引已接入一个明确隔离的 `resolveMessageMedia` 分支：只接受 `alpha-media://sha256/<sha256>`，要求唯一账号/会话/消息绑定并重新校验文件和真实消息；它不兼容 Alpha `media1_` token；独立模式的 `messagePageResponse` 会保留 `independent1_` source token，UI 可调用 `getMessageSource` 读取已解码文本，但仍不返回原生 raw/XML；指定会话直接读取真实 `messages.list`，全账号媒体浏览再按可发现 `sessions.list` 扫描；不生成原生 token、不播放语音/视频；music/mini-program/transaction 仍不可用 |
| 群成员与群置顶 | 真实解析 `chat_room.ext_buffer` 的 username/displayName，补充 contact 昵称/备注/别名和群主标记；`getContactProfile(@chatroom)` 汇总真实成员数和唯一群主；若 contact.db 另有项目自有 `__alpha_group_pins_v1` marker 表，`listGeneral(__alpha_group_pins)` 可读取有界 seq/sender/serverId/localType/preview/pinnedBy 只读记录，账号能力明确标记 `group-pins` | 原生 `__alpha_group_pins` schema、`ext_buffer_` 群置顶编码、分页/排序语义和 writer 未恢复；缺少自有 marker 的数据库（包括原生形状表）返回能力不可用，不冒充 native 群置顶；尚无群公告、管理员、头像、其他群资料和完整通讯录分类 |
| 朋友圈与收藏 | 朋友圈只读取显式 `moments.db`/`__alpha_moments_v1` synthetic fixture 的文字、作者和日计数；独立引擎另通过 `listFavorites` 读取显式 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture，提供有界分页、类型/关键字/标签过滤和类型计数，并保留 `sourceTable`；`startRecordExport` 可把同一 fixture 导出为 JSON/CSV/XLSX metadata-only 文件，固定 `syntheticOnly=true`、`nativeSchemaSupported=false` | 真实 `SnsTimeLine`/`snsmessage`/收藏库 schema、收藏 source lookup、原生媒体槽位/解析、朋友圈互动/媒体、真实收藏媒体语义和写入均未实现；独立 synthetic 媒体槽位/解析只接受显式合成表和自有 media-index。favorites 导出省略 contentXml、媒体 token、下载 URL 和 source lookup；`includeMedia` 明确失败关闭，HTTP/MCP 仅提供 synthetic fixture 收藏列表路由 |
| 64 位字段 | serverId 用 BigInt/十进制字符串，引擎 source token 保留完整 localId；独立模式 UI 已接入消息源文本查看 | 原 Alpha DTO 的 localId 仅 int32；超界时该旧字段为 0。完整 localId 仍只保存在独立 source token/engine rawSource 中；该查看能力不等于原生 raw/XML、媒体或写入能力 |
| 压缩内容 | Go 层统一有尺寸上限的 UTF-8/zstd 解码，供列表和搜索复用 | 解码失败显示明确“不支持”占位；不声称全部微信格式可用 |
| 搜索和导航 | 全账号/会话字面搜索、分组计数、发送人/时间筛选、精确上下文和日历消息数 | 暂无持久索引；未知编码/会话表明确提示部分覆盖；真实数据与大库性能未验 |
| 会话导出 | JSON、Markdown、HTML、TXT、XLSX 只读导出，以及基于已验证消息 DTO 的 `chatlab-json`、`chatlab-jsonl`、`sql`、`weclone` 派生导出；保留 64 位 ID、来源和解码状态，支持精确毫秒范围；HTML 使用静态 CSP/转义；XLSX 为固定列的单工作表；新增多会话任务状态、查看、取消及 stateDir 原子任务历史，另将本地 chat/record export 快照映射到通用 `getJob`/`watchJob`/`cancelJob` 的有限 JobSummary/JobEvent 视图，细节见 [`chat-export-jobs-recovery.md`](chat-export-jobs-recovery.md) | 不复制媒体；消息类型/附件/头像、自定义 XLSX 列和语音转写筛选未实现；通用任务视图不声称原生租约、远程通知、跨进程事件日志或其他任务种类兼容；派生格式不声称与原 Alpha/native formatter 或第三方工具完全兼容；进程重启会把未完成任务标记为 `CHAT_EXPORT_PROCESS_RESTARTED`，不会伪造自动续跑 |
| 会话导出计划 | 独立 stateDir 原子持久化计划、CAS、run-now、运行/尝试历史和重试；后台 bounded scheduler 会按到期时间触发，重启最多补一条到期 run，细节见 [`chat-export-schedules-recovery.md`](chat-export-schedules-recovery.md) | 仅支持单一 JSON/Markdown/HTML/TXT/XLSX/四种派生格式、无媒体和无筛选选项；XLSX 不支持自定义列；派生格式兼容边界仍需单独验证；失败仍需手工 retry，未恢复 Alpha 的完整调度冲突语义 |
| 群成员导出 | 基于已验证的 `chat_room.ext_buffer` 和联系人字段导出 CSV、JSON、HTML、XLSX；限制为最多 5000 条成员并保留 `isOwner`、群昵称、备注、昵称和别名 | 头像、群公告、管理员扩展资料和未知成员字段仍未实现 |
| 年度/会话基础统计 | 协议字段 104 基于可发现会话和可读消息生成年度/UTC 偏移统计；字段 24 的 `analyzeConversation` 针对指定会话生成关系报告基础计数；字段 110–112 提供 bounded 内存聚合任务（scope 1 私聊完整年份、scope 2 群聊、scope 3 年度完整年份、scope 4 指定会话双人报告、scope 5 明确正文 mention、scope 6 私聊足迹与同组 mention）及 watch/cancel，报告外壳遵循恢复协议的 `alpha-aggregate-v1` / `alpha-dual-v1` / `alpha-annual-v2` / `alpha-mentions-v1` / `alpha-footprint-v1`，细节见 [`annual-analysis-recovery.md`](annual-analysis-recovery.md) 与 [`conversation-analysis-recovery.md`](conversation-analysis-recovery.md) | 不覆盖 session index 外历史表；scope 5/6 只读取已验证 DTO，不能代表原生 XML mention schema；完整口头禅、朋友圈互动、完整好友名称、旅程 moments 和图片导出仍未实现；协议认可的空字段不代表原始分析语义已恢复；聚合任务默认 TTL 10 分钟，进程重启不恢复 |
| 数据变化监控 | 协议字段 106 返回调用者显式选择的离线数据源根目录，供主进程通知 watcher 使用；路径存在性、符号链接和源快照校验均失败关闭 | 不监控用户目录、在线微信变化或未显式选择的数据源；加密源只监控其显式加密输入目录 |
| 密码锁 | scrypt 校验、配置/修改/关闭、锁定/解锁、失败退避和重启锁定 | 不加密数据库或保存微信/模型凭据；无 Windows Hello、硬件保护或重置服务 |
| 原许可与网关 | capabilities 无原作者 entitlement；原网关保持明确不可用；独立引擎可选提供本机受控 HTTP/MCP 适配器和会话文件导出，当前映射账号、会话、消息、搜索、联系人、群成员、导出能力/统计、scope 1–6 聚合分析、synthetic moments 时间线/作者/日计数和 synthetic favorites 列表；真实收藏库/媒体仍无兼容语义，细节见 [`http-readonly-adapter-recovery.md`](http-readonly-adapter-recovery.md) | 官方其余 HTTP/MCP 路径、真实朋友圈 `SnsTimeLine`/`snsmessage` schema、媒体/朋友圈/收藏/发送语义仍需逐项迁移，不能靠原网关补齐 |

遥测的独立实现边界见 [`telemetry-recovery.md`](telemetry-recovery.md)。

协议层当前实现 82/128 个请求分支，其余 46 个返回 `UNIMPLEMENTED`，清单见 [engine README](../packages/alpha-engine/README.md) 和源码 `SUPPORTED`。新增分支包括显式媒体索引绑定的独立 `resolveMessageMedia` 视图、通用导出任务的有限 `getJob`/`watchJob`/`cancelJob` 视图、只读 `listGeneral` 群成员读取、群成员 CSV/JSON/HTML/XLSX 导出、有限 `getContactProfile` 档案读取（普通联系人存在性、共同群计数/列表，以及群成员数/唯一群主）、联系人 directory 的 friend/group 派生分类、联系人 CSV/JSON/VCF/HTML/XLSX 导出、不复制媒体的 JSON/Markdown/HTML/TXT/XLSX 和四种消息 DTO 派生会话导出、payments/revokes/calls/friend_requests 候选记录读取（好友申请仅为 local_type=37 + VerifyMsg/friend XML 的 partial/candidate 视图）、`listMessageRecallRecords` 的撤回候选分页（仅扫描 `__alpha_general_revokes`，独立 opaque cursor，`unverified-candidate`/`alpha-independent-message-derived-candidate`，不兼容原生 recall store）、payments/friend_requests/revokes/calls 候选记录的 xlsx/csv/json 导出、内存导出任务状态/取消、独立 stateDir 的聊天导出计划 CRUD/CAS、bounded 后台 scheduler（到期触发、单次最多 16 个计划、重启最多补一条到期 run）及运行/准备记录持久化、年度统计基础报告、指定会话的关系基础统计、scope 1/2/3/4/5/6 bounded 聚合分析任务及 watch/cancel、显式数据源 revision/watcher 诊断（只返回已选源的稳定 revision 和目录目标，不扫描用户目录），以及公众号计划本地元数据 CRUD（`official-schedule-plans.v1.json`，账号隔离、原子 0600 写入、includeDisabled/limit、updatedAt CAS；只保存计划元数据，不抓取文章、不下载媒体、不执行调度），以及公众号计划创建意图的三个 opaque 原语（主进程已加密 ciphertext 的单账号 `official-plan-intent.v1.json` 原子持久化、幂等插入和 generation CAS 清理；引擎不解密、不联网），以及独立 HTTP/MCP 的只读 SQLite schema 诊断（`schema.inspect`、`/api/v1/independent/source/schema`、`alpha-independent.source.get_schema`，只列出已选副本的相对数据库路径、表、列、SQLite 类型、NOT NULL 和主键序号；有界、无路径/SQL 输入，固定 `read_only=true`、`complete=false`、`native_schema_supported=false`，不增加 82/128 协议支持）、只返回真实消息 DTO 的会话/账号媒体元数据浏览及 metadata-only JSON/CSV 导出、图片 key 的进程内手动配置/清除状态、静态高级组件不可用状态、本地持久化遥测同意与显式禁用 flush、只读消息防撤回状态查询和防撤回控制面（status/install/uninstall/clear 均明确 `MESSAGE_ANTI_RECALL_WRITER_DISABLED`）、朋友圈防删除控制面的明确禁用状态（status/install/uninstall 均返回 `MOMENTS_ANTI_DELETE_WRITER_DISABLED`）、独立手动加密导入进度的有界 `watchDatabaseKeyAcquisition` 读取（进程内事件、十进制字符串 uint64 游标和终态错误码；历史超过 64 条时旧事件静默淘汰，不自动取钥）、仅接受显式 `moments.db`/`__alpha_moments_v1` synthetic schema 的 `listMoments`/`listMomentAuthors`/`getMomentDayCounts` 只读分支，以及 `startMomentExport` 的 JSON/Markdown/TXT/HTML metadata-only 导出任务（请求媒体明确返回 `MOMENT_EXPORT_MEDIA_UNAVAILABLE`）、显式 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic schema 的 `listFavorites`（分页、类型/关键字/标签过滤、类型计数；请求媒体明确返回 `FAVORITES_MEDIA_UNAVAILABLE`）、显式 `__alpha_favorite_media_v1` synthetic schema 的 `listFavoriteMediaSlots`/`resolveFavoriteMedia`（要求自有 `media-index.v1.json` 重新校验文件，仅返回独立 SHA-256 opaque id，不兼容原生 token），以及使用独立 source token 返回已解码消息文本的 `getMessageSource`。 合成 `__alpha_voice_playback_v1` + WAV media-index 的 `decodeVoicePlayback` 另见 [voice-playback-evidence.md](voice-playback-evidence.md)，不兼容真实 VoiceInfo/SILK。聚合结果默认 10 分钟 TTL、最多 32 个任务、64 MiB 报告上限，进程重启不恢复；原生 XML mention schema 和真实 moments/native 朋友圈等未有证据的领域保持不可用。图片 key 的协议状态仍不宣称原生媒体可用；桌面主进程另对显式 `encoding=dat` 图片索引条目和手动进程内 AES/XOR key 做隔离解码，解码失败保持 fail-closed。派生格式不声称与原 Alpha/native formatter 或第三方工具完全兼容。该 source token 与原 Alpha `media1_` 语义不兼容，raw/XML 和媒体文件仍保持不可用。通用任务视图只包装独立后端已经验证的 chat/record/moments export 快照，不声称原生 Alpha 的租约、远程通知、持久事件日志或其他任务种类。高级组件状态只反映本地独立后端边界，不包含动态授权、设备密钥或 native ready 证明。可选的独立本机受控 HTTP/MCP 适配器映射其中的账号、会话、消息、搜索、联系人、群成员、导出能力/统计和 scope 1–6 聚合分析任务，并支持九种会话文件导出、媒体 JSON/CSV 元数据导出，以及显式数据源诊断 `/api/v1/independent/source/revision`、`/api/v1/independent/source/watch-targets` 和 `alpha-independent.source.get_revision`/`get_watch_targets`；另支持仅面向 `moments.db`/`__alpha_moments_v1` synthetic fixture 的 `/api/v1/sns/timeline`、`/api/v1/sns/usernames`、`/api/v1/sns/day-counts` 和 `alpha-independent.moments.list_timeline`/`list_users`/`day_counts`，以及仅面向 `favorite.db` 或 `favorites.db` 中的 `__alpha_favorites_v1` synthetic fixture 的 `/api/v1/favorites`、`/api/v1/favorites/:favorite_id/media`、`/api/v1/favorites/media/:token` 和 `alpha-independent.favorites.list_items`/`list_media_slots`/`resolve_media`；消息派生的 payments/friend_requests/revokes/calls 候选另通过 `/api/v1/independent/records` 与 `alpha-independent.records.list_candidates` 暴露，响应固定标记 `partial/candidate` 和 `native_schema_supported=false`；撤回候选另通过 `GET /api/v1/independent/recall-records` 与 `alpha-independent.records.list_recall_candidates` 暴露，固定标记 `partial/candidate`、`native_schema_supported=false`、`writer=false`，不兼容原生 recall store；这些 moments/favorites 响应标记 synthetic-only，真实 `SnsTimeLine`/`snsmessage`/收藏 schema 保持不可用，详见 [`http-readonly-adapter-recovery.md`](http-readonly-adapter-recovery.md)。计划 runner 只接受一个已验证的 JSON/Markdown/HTML/TXT/XLSX 或派生格式和无媒体/筛选/头像/自定义 XLSX 列/语音选项，其他协议字段会在保存或执行时 fail-closed；为避免覆盖，每次产物写入 `outputDirectory/run-<runId>/`，Alpha 的 fixed/keep-copies/overwrite/incremental 细粒度目录冲突语义尚未复原。统计报告仅覆盖真实可读消息和有限字段。部分读取请求仍只支持有限参数。支持一个请求分支不代表其整个功能领域已完成，也不代表产品完成比例。

新增的 `listMessageRecallRecords` 是独立后端的只读候选适配器：它只调用 `listGeneral` 读取显式 `__alpha_general_revokes` 表，再从可验证的撤回消息 XML 生成 message-derived record。返回的 `recordId` 是本引擎基于来源身份计算的 opaque id；分页 cursor 绑定账号和会话，扫描和页大小均有上限。每条记录固定带 `confirmation=unverified-candidate`、`provenance=alpha-independent-message-derived-candidate`、`decodeErrorCode=NATIVE_RECALL_SCHEMA_UNSUPPORTED`，`capturedAtUnixMs`/`confirmedAtUnixMs` 为零且不保留压缩/packed 内容。这些记录只用于查阅和导出候选，不兼容原生 recall store，不证明撤回已确认，也不提供 anti-recall writer。覆盖测试见 `tests/engine-message-recall.test.mjs`。

独立 mobile 组合工具 `alpha-independent.mobile.search_chat` 与 `alpha-independent.mobile.get_chat_context` 只覆盖已验证消息 DTO，固定 `complete=false`、`native_schema_supported=false`，不实现官方移动端 snapshot/schema，也不增加 82/128 协议支持。


独立后端 Hello 的 ready 只表示当前服务初始化成功。配置了有效且未锁定的数据源时会实际验证 SQLite；启用密码锁后重启只初始化锁和协议服务，数据访问必须先解锁。账号能力来自真实存在的库；数据源改变后再次查询会失败，不保留旧的就绪结果。

公众号计划的执行请求另有独立的 `official-plan-attempts.v1.json` 本地记录。它只保存账号、计划、时间、revision、归档状态和固定 blocked 原因，所有记录都保持 `executionSupported=false`；HTTP/MCP 入口不联网、不抓取文章、不下载媒体、不创建原生运行记录，也不改变 82/128 协议支持矩阵。

语音转文字仍不属于 native parity。`docs/optional-asr.md` 描述的可选 backend 只接受调用方明确选定的 WAV `media-index.v1.json` 条目，并要求外部提供哈希匹配的 sherpa-onnx runtime 和 zipformer 模型；它不处理真实 VoiceInfo、SILK、`media1_` token 或 native media cache，也不修改 `transcribeVoice`/`transcribeVoiceBatch` 的 `UNIMPLEMENTED` 边界。

## 实测证据

初始阶段合并测试 43/43 通过，历史汇总保留在 [independent-validation.json](independent-validation.json)；当前回归、聚合分析、图片 key 生命周期、独立计划存储测试、记录导出、消息撤回候选分页、遥测同意、防撤回/防删除状态、手动密钥导入进度、账号本地移除/重新发现、synthetic moments/favorites fixture、朋友圈导出任务、收藏列表及 synthetic 媒体边界和 82/128 协议范围见 [independent-validation-current.json](independent-validation-current.json)。加入加密导入后的阶段记录为 [encrypted-validation.json](encrypted-validation.json)。本轮搜索、导航及回归的最新结果见 [search-validation.json](search-validation.json)，各记录分别对应当时的实现范围。

- [桌面运行 JSON](independent-run.json) 与 [聊天截图](independent-run.png)：原 UI、真实 IPC → Protobuf → Go → SQLite，应用锁前后读取，以及数据文件哈希不变。
- [Go 编译与测试](../packages/alpha-data-bridge/build-validation.json)：arm64 原生程序、固定工具链、依赖锁和 schema/只读/分页边界。
- [独立审查](independent-review.md)：网关不回退、账号能力、无源与无效源的区别、锁和源文件变化。
- [源码维护来源](../provenance/maintenance-changes.json)：恢复代码的原始哈希与本轮修改后哈希分别保留。

```sh
npm run test:protocol
npm run test:security
npm run test:bridge
npm run test:engine
npm run test:boundaries
npm run test:independent
npm run test:encrypted
npm run test:search
npm run test:smoke
npm run verify:vendor
```

`test:independent` 退出前关闭自己的进程，`test:smoke` 记录保留原包模式的真实后端失败。二者结果分别记录，不能混为一次完整产品验收。

## 下一层仍需补齐

1. 对授权真实样本验证已有手动密钥、离线解密及查询结果；扩展自动接入、实时快照和 WAL 一致性。
2. 完整通讯录、群资料、消息类型和媒体解析；扩展已实现搜索的内容覆盖与大库索引。
3. 导出任务/媒体打包、统计/朋友圈/收藏、AI 工具与服务端协议；逐个保留已有交互和语义。朋友圈目前仅完成 synthetic fixture 的只读列表/作者/日计数和 schema 证据整理，真实 `SnsTimeLine`/`snsmessage` 仍不可用，见 [`moments-schema-evidence.md`](moments-schema-evidence.md)；收藏的数据库候选、显式 synthetic fixture 和未恢复媒体证据见 [`favorites-schema-evidence.md`](favorites-schema-evidence.md)；“其他资料”六类记录的字段和缺口见 [`general-records-schema-evidence.md`](general-records-schema-evidence.md)。真实微信 schema 仍未接入猜测性 SQL。
4. 凭据安全存储、写入恢复、平台能力、自有签名与更新发布。

当前未连接微信、获取密钥、调用模型、写聊天数据库、发送消息或发布软件。原有完整功能清单继续作为验收范围。
