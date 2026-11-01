# 独立后端：离线读取、手动密钥导入与原界面

本轮新增自有 Go 数据桥接、Node 协议引擎和密码应用锁，已与恢复的 Electron 主进程/React 界面接通。真实运行使用人工生成的微信 v4 SQLite 数据库，完整走过首次设置并显示聊天消息；没有访问用户微信数据或取密钥。

后续新增自有 Go 加密快照导入器，支持原界面的手动密钥流程。错误密钥拒绝、逐页认证解密、四库明文哈希对照和重启复用已通过加密合成数据的桌面实测，见 [加密导入说明](encrypted-import.md) 与 [运行记录](encrypted-run.json)。

完整维护目标仍是 [MAINTENANCE.md](../MAINTENANCE.md) 中的全部功能。当前交付是可继续开发的第一层实现，不能当作完整 Alpha 替代品。

## 启动

```sh
npm run build:independent
npm run demo
```

`build:independent` 先编译并测试自有 Go 模块，再构建桌面 JavaScript。`demo` 在项目 `.runtime/demo-*/fixture/` 生成合成数据库，启动独立模式。进入界面后勾选本地数据说明，点击“打开数据副本”，跳过图片密钥步骤，完成向导即可看到合成聊天。没有用测试缓存或固定账号数据绕过向导。

不加载数据的独立模式为 `npm run start:independent`，真实账号列表为空。显式数据副本可以通过以下命令传入：

```sh
npm run start:independent -- --data-dir /absolute/project/.runtime/your-snapshot --account-id your-dataset-label
```

当前启动器只接受项目 `.runtime/` 内无符号链接的目录，内容须为稳定、已解密的微信 v4 SQLite 副本。`account-id` 是数据集标签，不是经微信验证的登录身份。不会自动寻找个人微信目录。活动 WAL/SHM/journal、目录或数据库变化、加密文件、不兼容 schema 均明确失败。

加密副本须改用 `--encrypted-dir`，不能与 `--data-dir` 混用；首次打开需要已有密钥。`npm run demo:encrypted` 可演示此路径。固定加密格式和明文快照的存储边界见 [encrypted-import.md](encrypted-import.md)。

原包模式仍使用 `npm start`，当前错误仍为 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`。独立模式使用自己的服务实现，没有修改原二进制 guard、签名、公钥或许可。

## 已接通的内容

| 部分 | 当前行为 | 仍有限制 |
| --- | --- | --- |
| 原桌面 UI | 原首次设置和聊天页实际完成，保留全部菜单入口 | 其他菜单对应后端大部分尚未实现 |
| 数据源 | 显式指定一个明文或加密离线副本，验证结构，选择状态持久化 | 无自动取钥、在线微信身份识别、多账号注册或实时变化 |
| 手动密钥和解密 | 固定微信 v4 格式，逐页认证、SQLite完整性校验、原子发布明文快照，重启验证后复用 | 无真实微信样本验证、WAL合并、其他加密格式和图片密钥 |
| 联系人 | 实际查询 username、alias、remark、nick_name；支持精确 username、批量 lookup、字面量子串模糊查询、offset 分页、有限 contact profile 存在性读取、基于 `chat_room.ext_buffer` 的共同群计数/列表，以及 CSV/JSON/VCF/HTML/XLSX 只读导出；directory 已基于 verified contacts.list 派生 friend/group 分页与计数；独立模式 UI 只提供这些已验证的分类和导出格式，并禁用头像选项 | 完整个人资料字段、头像导出、企微/公众号/服务号/曾经好友/黑名单分类和资料编辑仍未实现；directory 请求这些未验证分类会失败关闭，分类证据边界见 [`docs/contact-directory-evidence.md`](contact-directory-evidence.md) |
| 会话 | 实际 session 查询，联系人备注/昵称，稳定分页 | 仅提供存在的数据列；无完整会话资料和群信息 |
| 消息 | 跨分库排序、正反向分页、时间范围、原始 ID/定位；保留声明性媒体 refs；对可验证的 type-48 位置和 type-49 链接/文件 XML 提供安全 display 元数据；`browseConversationMessages` 支持 media/file/link 元数据筛选，`browseAccountMedia` 支持 media/image/video；`getMessageSource` 可用本引擎 `independent1_` token 重新定位并返回已解码文本 | 引用/卡片/附件/媒体文件等语义未完整解析；`getMessageSource` 不接受原 Alpha `media1_` token，也不返回 raw/XML 或媒体文件；指定会话直接读取真实 `messages.list`，全账号媒体浏览再按可发现 `sessions.list` 扫描；不建立媒体索引、不读文件、不生成 token、不播放；music/mini-program/transaction 仍不可用 |
| 群成员 | 真实解析 `chat_room.ext_buffer` 的 username/displayName，补充 contact 昵称/备注/别名和群主标记；`getContactProfile(@chatroom)` 汇总真实成员数和唯一群主 | 尚无群公告、管理员、头像、其他群资料和完整通讯录分类 |
| 64 位字段 | serverId 用 BigInt/十进制字符串，引擎 source token 保留完整 localId | 原 Alpha DTO 的 localId 仅 int32；超界时该旧字段为 0。旧 UI 还会过滤独立 token，完整定位保留在桥接/引擎层，未接 UI 原始消息查看或任何修改 |
| 压缩内容 | Go 层统一有尺寸上限的 UTF-8/zstd 解码，供列表和搜索复用 | 解码失败显示明确“不支持”占位；不声称全部微信格式可用 |
| 搜索和导航 | 全账号/会话字面搜索、分组计数、发送人/时间筛选、精确上下文和日历消息数 | 暂无持久索引；未知编码/会话表明确提示部分覆盖；真实数据与大库性能未验 |
| 会话导出 | JSON、Markdown、HTML、TXT、XLSX 只读导出，以及基于已验证消息 DTO 的 `chatlab-json`、`chatlab-jsonl`、`sql`、`weclone` 派生导出；保留 64 位 ID、来源和解码状态，支持精确毫秒范围；HTML 使用静态 CSP/转义；XLSX 为固定列的单工作表；新增多会话任务状态、查看、取消及 stateDir 原子任务历史，细节见 [`chat-export-jobs-recovery.md`](chat-export-jobs-recovery.md) | 不复制媒体；消息类型/附件/头像、自定义 XLSX 列和语音转写筛选未实现；派生格式不声称与原 Alpha/native formatter 或第三方工具完全兼容；进程重启会把未完成任务标记为 `CHAT_EXPORT_PROCESS_RESTARTED`，不会伪造自动续跑 |
| 会话导出计划 | 独立 stateDir 原子持久化计划、CAS、run-now、运行/尝试历史和重试；后台 bounded scheduler 会按到期时间触发，重启最多补一条到期 run，细节见 [`chat-export-schedules-recovery.md`](chat-export-schedules-recovery.md) | 仅支持单一 JSON/Markdown/HTML/TXT/XLSX/四种派生格式、无媒体和无筛选选项；XLSX 不支持自定义列；派生格式兼容边界仍需单独验证；失败仍需手工 retry，未恢复 Alpha 的完整调度冲突语义 |
| 群成员导出 | 基于已验证的 `chat_room.ext_buffer` 和联系人字段导出 CSV、JSON、HTML、XLSX；限制为最多 5000 条成员并保留 `isOwner`、群昵称、备注、昵称和别名 | 头像、群公告、管理员扩展资料和未知成员字段仍未实现 |
| 年度/会话基础统计 | 协议字段 104 基于可发现会话和可读消息生成年度/UTC 偏移统计；字段 24 的 `analyzeConversation` 针对指定会话生成关系报告基础计数，细节见 [`annual-analysis-recovery.md`](annual-analysis-recovery.md) 与 [`conversation-analysis-recovery.md`](conversation-analysis-recovery.md) | 不覆盖 session index 外历史表；口头禅、回复速度、朋友圈互动、完整好友名称、旅程 moments 和图片导出仍未实现 |
| 数据变化监控 | 协议字段 106 返回调用者显式选择的离线数据源根目录，供主进程通知 watcher 使用；路径存在性、符号链接和源快照校验均失败关闭 | 不监控用户目录、在线微信变化或未显式选择的数据源；加密源只监控其显式加密输入目录 |
| 密码锁 | scrypt 校验、配置/修改/关闭、锁定/解锁、失败退避和重启锁定 | 不加密数据库或保存微信/模型凭据；无 Windows Hello、硬件保护或重置服务 |
| 原许可与网关 | capabilities 无原作者 entitlement；原网关保持明确不可用；独立引擎可选提供本机受控 HTTP/MCP 适配器和会话文件导出，细节见 [`http-readonly-adapter-recovery.md`](http-readonly-adapter-recovery.md) | 官方其余 HTTP/MCP 路径、媒体/朋友圈/收藏/发送语义仍需逐项迁移，不能靠原网关补齐 |

协议层当前实现 46/128 个请求分支，其余 82 个返回 `UNIMPLEMENTED`，清单见 [engine README](../packages/alpha-engine/README.md) 和源码 `SUPPORTED`。新增分支包括只读 `listGeneral` 群成员读取、群成员 CSV/JSON/HTML/XLSX 导出、有限 `getContactProfile` 档案读取（普通联系人存在性、共同群计数/列表，以及群成员数/唯一群主）、联系人 directory 的 friend/group 派生分类、联系人 CSV/JSON/VCF/HTML/XLSX 导出、不复制媒体的 JSON/Markdown/HTML/TXT/XLSX 和四种消息 DTO 派生会话导出、payments/revokes/calls 候选记录的 xlsx/csv/json 导出、内存导出任务状态/取消、独立 stateDir 的聊天导出计划 CRUD/CAS、bounded 后台 scheduler（到期触发、单次最多 16 个计划、重启最多补一条到期 run）及运行/准备记录持久化、年度统计基础报告、指定会话的关系基础统计、显式数据源变化监控目标、只返回真实消息 DTO 的会话/账号媒体元数据浏览及 metadata-only JSON/CSV 导出、静态高级组件不可用状态，以及使用独立 source token 返回已解码消息文本的 `getMessageSource`。派生格式不声称与原 Alpha/native formatter 或第三方工具完全兼容。该 source token 与原 Alpha `media1_` 语义不兼容，raw/XML 和媒体文件仍保持不可用。高级组件状态只反映本地独立后端边界，不包含动态授权、设备密钥或 native ready 证明。可选的独立本机受控 HTTP/MCP 适配器映射其中的账号、会话、消息、搜索、联系人和群成员 DTO，并支持九种会话文件导出和媒体 JSON/CSV 元数据导出，详见 [`http-readonly-adapter-recovery.md`](http-readonly-adapter-recovery.md)。计划 runner 只接受一个已验证的 JSON/Markdown/HTML/TXT/XLSX 或派生格式和无媒体/筛选/头像/自定义 XLSX 列/语音选项，其他协议字段会在保存或执行时 fail-closed；为避免覆盖，每次产物写入 `outputDirectory/run-<runId>/`，Alpha 的 fixed/keep-copies/overwrite/incremental 细粒度目录冲突语义尚未复原。统计报告仅覆盖真实可读消息和有限字段。部分读取请求仍只支持有限参数。支持一个请求分支不代表其整个功能领域已完成，也不代表产品完成比例。

独立后端 Hello 的 ready 只表示当前服务初始化成功。配置了有效且未锁定的数据源时会实际验证 SQLite；启用密码锁后重启只初始化锁和协议服务，数据访问必须先解锁。账号能力来自真实存在的库；数据源改变后再次查询会失败，不保留旧的就绪结果。

## 实测证据

初始阶段合并测试 43/43 通过，历史汇总保留在 [independent-validation.json](independent-validation.json)；当前回归、独立计划存储测试、记录导出和 46/128 协议范围见 [independent-validation-current.json](independent-validation-current.json)。加入加密导入后的阶段记录为 [encrypted-validation.json](encrypted-validation.json)。本轮搜索、导航及回归的最新结果见 [search-validation.json](search-validation.json)，各记录分别对应当时的实现范围。

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
3. 导出任务/媒体打包、统计/朋友圈/收藏、AI 工具与服务端协议；逐个保留已有交互和语义。朋友圈目前仅完成 schema 证据整理，见 [`moments-schema-evidence.md`](moments-schema-evidence.md)；收藏的数据库候选和接口证据见 [`favorites-schema-evidence.md`](favorites-schema-evidence.md)；“其他资料”六类记录的字段和缺口见 [`general-records-schema-evidence.md`](general-records-schema-evidence.md)。这些领域都未接入猜测性 SQL。
4. 凭据安全存储、写入恢复、平台能力、自有签名与更新发布。

当前未连接微信、获取密钥、调用模型、写聊天数据库、发送消息或发布软件。原有完整功能清单继续作为验收范围。
