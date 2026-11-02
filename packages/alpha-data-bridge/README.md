# Alpha offline data bridge

这是自有 Go 读取模块，不依赖 Alpha 原厂 engine/guard，也不导入 Chatlog 的 internal 包。当前支持用户显式指定的、已经解密的离线微信 v4 SQLite 副本：账号信息、联系人、会话、分页消息、全文搜索、消息定位、日期计数与消息类型统计。另支持一个明确标记的独立朋友圈 fixture（`moments.db` 中的 `__alpha_moments_v1` 表），提供朋友圈列表、作者聚合和日计数；不会把真实微信的 `SnsTimeLine`/`snsmessage` 表猜测成兼容 schema。Node 引擎的媒体浏览复用 `sessions.list`/`messages.list` 做真实元数据筛选；bridge 另提供严格独立的 `media.probe`，只扫描显式 root 下的 `hardlink.db`/`media_*.db`，输出带相对路径、大小和 SHA-256 的 metadata-only 索引，不读取媒体字节、不生成 `media1_...` token、不播放。该探针以 Chatlog v4 公开代码中的表名和字段为候选证据，返回 `nativeSchemaSupported=false`；真实 Alpha 媒体 parity 仍未宣称。这是完整 Alpha 后端的第一批数据依赖，不代表完整功能已经恢复。v4 候选媒体库的表名、字段与路径线索见 [`docs/media-schema-evidence.md`](../../docs/media-schema-evidence.md)。

源码的 schema 参考固定 [Chatlog v4 数据源](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechatdb/datasource/v4/datasource.go)，查询、验证、协议和分页代码为本项目实现。固定 Go module 依赖为 `github.com/mattn/go-sqlite3 v1.14.32` 与 `github.com/klauspost/compress v1.18.0`（有界 zstd 解码）；使用已校验的 go.sum，不更新到 latest。源码和许可证保留在项目内依赖缓存及 [已有依赖许可索引](../../docs/chatlog-dependency-licenses.json)，另保留 [zstd 依赖许可证](licenses/klauspost-compress-LICENSE)。没有复制上游实现或改动 `vendor/chatlog`。

在工程根目录构建与测试：

```sh
node scripts/build-data-bridge.mjs
node --test tests/data-bridge.test.mjs tests/data-bridge-search.test.mjs
```

构建脚本复用已经校验的 Go 1.24.13，在 `build/data-bridge-source/` 创建构建副本，使用 `-mod=readonly`、CGo 和项目内缓存。它先运行 Go 测试，再生成 [原生程序](../../build/candidates/alpha-data-bridge) 和 [实际构建报告](../../build/candidates/data-bridge-build.json)，并保存包内 [验证记录副本](build-validation.json)。源码目录的 go.mod/go.sum 不会由构建改写。Node 集成测试使用生成的真实 Go 程序和人工 SQLite 数据，没有访问微信用户目录。

启动必须明确传入两项参数：

```text
build/candidates/alpha-data-bridge --data-dir /absolute/offline-copy --account-id dataset-label
```

`account-id` 是调用者指定的数据源标签，不是自动发现或验证的微信登录身份。`account.info` 返回 `idProvenance=caller-supplied-dataset-label`、`sourceKind=offline-wechat-v4`、`readOnly=true`、`live=false`、snapshotId、相对数据库路径和实际可用操作。目录没有兼容数据库、schema 缺列、路径含符号链接、存在 WAL/SHM/journal 时启动失败，错误在 stderr，退出码为 2；不能将该状态映射成成功的空账号。

## 合成朋友圈表情

`moments.emoji` 只读取 `moments.db` 中显式的 `__alpha_moment_emoji_v1` 表，并只接受 `emoji-xml:` source。表中的 source、SHA-256、大小、图片 MIME、相对路径、账号和 moment 字段都经过边界检查；重复 source 会失败关闭，真实 `SnsTimeLine`/`snsmessage`、评论 XML 和原生媒体 token 不会被猜测。Go bridge 只返回映射元数据，Node 引擎还必须使用同一数据源的自有 `media-index.v1.json` 重新校验文件；因此该能力固定为 synthetic-only，能力边界为 `native_schema_supported=false`。

## JSON-lines 协议

每行一个请求/响应，stdout 只输出 JSON。错误不会终止后续有效请求；超大或损坏的传输导致进程失败。每条请求最多 1 MiB，查询超时 15 秒，分页 limit 为 1 至 500，默认 100。

```json
{"id":"1","op":"messages.list","params":{"conversationId":"wxid_alpha","limit":100,"ascending":true,"cursor":""}}
{"id":"1","ok":true,"result":{"items":[],"nextCursor":"","hasMore":false}}
{"id":"2","ok":false,"error":{"code":"CAPABILITY_UNAVAILABLE","message":"contact.db is not present"}}
```

上面的空 items 只是协议示例；程序只在真实查询没有结果时返回空列表。

| op | 参数 | 返回 |
| --- | --- | --- |
| `account.info`（兼容别名 `accounts.info`） | 无 | 数据源信息；只有打开并验证实际数据库后才能返回 |
| `contacts.list` | `limit`、`cursor`、可选 `usernameExact`、`query` | 联系人页；`usernameExact` 精确查找，`query` 在 username/alias/remark/nick_name 上做有界、大小写敏感的字面量子串匹配 |
| `contacts.lookup` | `usernames`（1–500 个唯一值） | 批量精确 username 查找；保留请求顺序并省略缺失项，重复数据库行明确报歧义；不提供 directory 分类/counts |
| `groups.common` | `username`、`limit`（0–100） | 扫描 `chat_room.ext_buffer` 的 RoomData，返回真实共同群 username、contact 表可证明的显示名、完整 count 和 truthful truncated；不伪造头像 |
| `sessions.list` | `limit`、`cursor` | 会话页，按 sort_timestamp 降序、username/rowid 升序 |
| `messages.list` | `conversationId`、`limit`、`cursor`、`ascending`、可选 `afterTime`/`beforeTime` | 消息页；时间边界是十进制字符串形式的 Unix 秒，包含边界；默认升序 |
| `sessions.list` + `messages.list` | 由 Node 引擎组合调用 | 为 `browseConversationMessages`/`browseAccountMedia` 提供真实会话和消息元数据；不提供媒体文件索引、路径、下载或播放 |
| `media.probe` | 无参数；只针对启动时显式选择的数据目录 | 只读扫描 `hardlink.db` 的 image/video/file hardlink 表和 `media_*.db` 的 `VoiceInfo`；返回相对路径、大小、修改时间、voice data 长度、源库/表和源库 SHA-256。结果始终 `metadataOnly=true`、`mediaReady=false`、`nativeSchemaSupported=false`；没有候选库返回 `status=unavailable` |
| `messages.search` | 非空 `query`、可选 `conversationId`、`senderId`、`afterTime`/`beforeTime`、`ascending`、`groupByConversation`、`limit`、`cursor` | 同消息 DTO、matchCount 字符串及 coverage；默认降序，时间双端包含 |
| `messages.locate` | `conversationId`、`serverId`（正 uint64 十进制字符串） | message 或 null，及 beforeCursor/afterCursor |
| `messages.dayCounts` | `conversationId`、`fromUnixMs`、`toUnixMs`（十进制字符串）、`utcOffsetMinutes`（整数） | `{days:[{localDay,count}]}`，数字为字符串；毫秒范围半开、最多 62 天 |
| `messages.stats` | 可选 `conversationId`，空表示整个账号 | `{conversationId,messageCount,firstTime,lastTime,counts:[{localType,count}]}`；first/last 为秒字符串，空集合为空字符串 |
| `moments.list` | `limit`、`offset`、可选 `username`、`keyword`、`fromUnixMs`、`toUnixMs`、`ascending` | 仅读取 `moments.db` 的显式 `__alpha_moments_v1` fixture；时间范围为半开 `[fromUnixMs,toUnixMs)`；返回 `NativeMomentRecord` 对应字段、`sourceDatabase= moments.db` 和 `hasMore` |
| `moments.authors` | `limit` | 对显式 moments fixture 按 username 聚合，返回 postCount/latestAtUnixMs；不补联系人头像或备注 |
| `moments.dayCounts` | 可选 `username`、`fromUnixMs`、`toUnixMs`、`utcOffsetMinutes` | 显式 moments fixture 的本地日计数；时间范围为半开 `[fromUnixMs,toUnixMs)`；无 fixture 返回 `CAPABILITY_UNAVAILABLE`/不可用边界 |
| `general.list` | `tableName=__alpha_group_members`、`query=<chatroom>@chatroom`、`offset`、`limit`（单页最多 1000）、`ascending=true`；显式 synthetic 群置顶还接受 `tableName=__alpha_group_pins`、`query=<chatroom>@chatroom`、显式 `ascending=true`、`offset`、`limit`；或 `__alpha_general_payments`/`__alpha_general_friend_requests`/`__alpha_general_revokes`/`__alpha_general_calls`、可选不超过 512 字节的 UTF-8 字面 `query`、显式 `ascending`、`offset`、`limit` | 群成员从 v4 `chat_room.ext_buffer` 解析真实成员，补充 contact 表中的昵称/备注/别名和 `isOwner`；显式 `__alpha_group_pins_v1` marker 只读投影为自有 `__alpha_group_pins` 记录，字段限于 seq/senderId/serverId/localType/preview/pinnedBy，并保持 synthetic-only；支付、好友申请、撤回和通话候选只从可验证的消息 XML 生成带 `partial=1,candidate=1` 字段的记录，查询只在已派生的记录 ID、内容、actor、字段名和值上做不区分大小写的字面包含匹配。好友申请仅接受 `local_type=37` 且 XML `sysmsg` 类型为 `VerifyMsg`/`friend`/`friendmsg`，通话仅接受 `local_type=50` 且包含明确 `voipmsg`/`voipinvitemsg` 元素；保留来源库/表/行号，不猜测请求方向、状态、标签、媒体、时长或通话状态；不伪造 Alpha 完整记录库、头像、管理员或原消息恢复；缺少 marker 的原生形状表返回 `CAPABILITY_UNAVAILABLE` |

Cursor 是 bridge 产生的不透明 base64url 字符串，绑定本次数据快照和全部筛选/排序参数；调用者原样传回，不能拿另一个查询的 cursor 继续读取。limit 可以调整。消息跨所有分库按 `(create_time, database, table, local_id)` 全局排序，再截取一页；反向分页反转完整排序，不依赖分库的 Timestamp 范围声明。`sort_seq` 作为原始信息保留，不参与新排序。这样原界面按时间跳转、搜索上下文读取与分页保持一致；本轮并未证明原厂 native 的全部排序细节。cursor-v2 绑定新排序语义，旧 cursor 明确拒绝。查询不存在的 `Msg_<MD5(conversationId)>` 表会返回真实空页；缺失整个消息库则返回明确不可用。

## 数据与身份

所有整数（包括原始 local_id、server_id、sort_seq、时间、类型和行号）均序列化为十进制字符串，不经过 JavaScript Number。消息不使用 `server_id` 作为唯一键，因为本地记录可以为 0，且跨分库可能重复。

- Contact：`username, localType, alias, remark, nickName, source:{database,table,rowId}`。
- Session：`username, summary, lastTimestamp, sortTimestamp, lastMsgSender, lastSenderDisplayName, source:{database,table,rowId}`。lastSenderDisplayName 是最后发言人名，不是会话名称。
- Message：`conversationId, localId, serverId, sortSeq, localType, createTime, sender, realSenderId, status, content, contentBase64, contentEncoding, packedInfoBase64, refs, source:{database,table,localId}`。

`source.database` 是相对输入根目录的路径。外层 Alpha 协议如果只允许 int32 localId，必须把完整字符串和 source locator 保存在自己的 opaque source token/映射里，不能截断、取模或转成失真的 Number。`status` 保留原值，不代表已验证的消息方向；方向需要明确自己的 username。

`contentBase64` 和 `packedInfoBase64` 在各自不超过 4 MiB 时保留原始字节。SQL 查询在物化前拦截更大的字段；超大 content 返回 `contentDecodeStatus=too-large`、空 content/raw，超大 packed metadata 返回空字段及 `packedInfoOmitted=true`。UTF-8 和正常 zstd 帧由列表、搜索和定位共享同一解码器，成功时 `contentEncoding=utf8`，zstd 额外标记 `contentCompression=zstd`；压缩输入、解压结果、窗口均最多 4 MiB。解码失败保留 `binary` 与具体 `contentDecodeStatus`，调用方不能再次采用更宽松解码然后声称搜索完整。XML/卡片/protobuf 业务内容仍未完整解析；当前只对已验证的链接、文件、位置和引用（type 57）做有界 display projection，引用不读取嵌套媒体/原文。搜索的是实际显示的原始可读文本，未知消息类型不会被假定为文本类型。

### 媒体引用（只读声明）

`refs` 只在消息内容明确声明媒体标识或 URL 时出现，字段为 `kind`（`image`、`video`、`voice` 或受独立 synthetic marker 限制的 `file`）、可选 `id`、可选 `uri`、可选 `mimeType` 和 `rendition`。图片（`localType=3`）提取文本中的 `md5`/`rawmd5` 与 `cdnthumburl`/`cdnurl`/`url` 属性；视频（`localType=43`）使用相同规则；语音（`localType=34`）仅使用该行真实 `serverId` 作为引用 ID；文件只在 bounded `type=6` display envelope 已验证且正文带显式 `sha256` synthetic marker 时返回 `application/octet-stream` 的 `source` ref。每条消息最多返回两条引用，重复哈希去重，属性和长度均有上限。

这些是消息内容中的声明性引用，不是已经验证的文件。bridge 不推断本地路径、不读取或解密 `.dat`/语音/视频/文件、不联网下载 CDN，也不生成 `media1_...` 解析令牌。图片/视频没有可解析声明、内容损坏或超限时返回空 `refs`；语音的 `serverId` 引用独立于正文编码状态；文件 marker 只用于显式 independent fixture。任何情况下都不会伪造路径或 token；上层若收到不支持的 URI scheme 会明确拒绝该消息 DTO。

## 读取边界

识别的文件是递归目录内 `contact.db`、`session.db`、`message.db`/`message_<数字>.db`；同一数据源不能有多个 contact/session 库。深度、成员数、分库数均有上限。首次打开验证 SQLite 文件头、核心表和所需列；未知 schema 明确拒绝。

SQLite URI 固定 `mode=ro&immutable=1&_query_only=1`。没有原始 SQL、写入、解密、取密钥、附加库、发送或联网接口。测试直接在连接上尝试写入被拒绝，并证明即使内部关闭 query_only，mode=ro 仍拒绝写入。读取前后检测文件身份/大小/修改时间、目录身份/修改时间和副文件，变化后要求重新打开稳定副本，不热更新。

路径检查拒绝全部祖先和目录成员的符号链接，使用固定数据库命名和参数化条件，不接受请求提供的数据库路径或 SQL 表名。该模块面向调用者控制的稳定离线副本；文件系统检查不是针对恶意并发目录交换的 OS 沙箱，也不宣称为活跃微信数据库提供快照一致性。主程序应继续限制授权目录和数据访问权限。

合成数据入口为 [createFixture](../../tests/data-bridge-fixture.mjs)，也可使用 Python CLI `tests/data-bridge-fixtures.py --output ABS_NEW_EMPTY_DIR`。它创建 4 个数据库，3 个联系人、2 个会话、6 条跨分库消息，包括同 sort_seq、最大有符号 int64、超过 2^53 的 local_id 和二进制内容。测试也覆盖查询参数错误、cursor 绑定、symlink/WAL/坏 schema、运行中修改和新增分库的拒绝。

媒体浏览回归在 Node 层使用 [createMediaBrowseFixture](../../tests/media-browse-fixture.mjs) 对该基础 fixture 增加图片、视频、语音、贴纸、链接、文件、epoch-zero 和额外会话；这些行仍通过本 bridge 的真实 `messages.list`/`sessions.list` 读取。

手动密钥离线解密已在单独的 [alpha-snapshot-import](../alpha-snapshot-import/README.md) 模块实现：源文件只读，页认证与完整性检查后原子发布给本 bridge。桥接本身不负责解密/取钥，也不修改系统安全设置。

## 搜索、定位与日期统计

搜索是 Unicode 小写后字面包含匹配，不解释正则、SQL 通配符或布尔表达式；query 最多 512 字节。完整扫描时间/sender/会话过滤范围后取稳定排序前一页。groupByConversation 按真实会话聚合，代表记录是所选升降序的第一条，`matchCount` 为符合过滤与字面匹配的消息行数，不是关键词出现次数。游标绑定 query、sender、时间、会话、排序、分组和快照；每页重新扫描静止副本以得出一致分组计数，当前没有持久 FTS 索引。

全账号搜索合并所有分库 `Name2Id`、contact 与 SessionTable 用户名（SQL 层只读非空且最多 1024 字节的值，身份映射累计估算最多 64 MiB），通过真实 username 的 MD5 匹配 Msg 表；已从会话表移除但仍能从 Name2Id 映射的会话仍能搜索。无法反推真实 username 的表不会伪造会话 ID。返回 `coverage={complete,unreadableMessages,unmappedTables}`：unreadableMessages 是时间/sender/会话范围内不可读文本行数的十进制字符串；unmappedTables 是全局搜索中存在符合时间/sender 范围记录、但无法确认会话归属的表数。complete=false 时可读结果与组计数仅代表已覆盖范围，界面必须明确提示部分结果。搜索不把不支持内容的占位说明当成原始消息匹配。超过扫描行数 1,000,000、累计扫描估算 512 MiB、候选/组内存估算 64 MiB 或 15 秒超时会整体失败，不发布已截断页。单条响应 JSON 超过 12 MiB 时返回 `RESPONSE_TOO_LARGE`，不会发送可能让 Node 16 MiB 行缓冲断连的部分结果；调用方应减小 page limit 或先筛选时间/会话。关联发送者名称在 SQL 层限制为 1024 字节，超长值按空 sender 处理并不用于身份映射。这些是资源阈值，不是大库性能验收。

定位接受 uint64 字符串并按 SQLite 有符号位表示匹配 server_id，保留原始 local_id 和来源路径。当同一会话有多个相同 server_id 时返回 `MESSAGE_LOCATE_AMBIGUOUS`，不随意选中。缺失时返回 `{message:null,beforeCursor:"",afterCursor:""}`；存在时两个 cursor 均非空，即使目标在首尾。beforeCursor 只能供无时间过滤、ascending=false 的 messages.list 使用；afterCursor 则 ascending=true，均排除锚点本身。

日期统计严格采用 `[fromUnixMs,toUnixMs)`，对秒数据库做精确 ceil 边界转换，按 `floor((create_time + utcOffsetMinutes*60)/86400)` 聚合；UTC offset 范围为 -720 至 +840，负 localDay 也向负无穷取整。只返回 count>0 的日，按 localDay 升序。stats 直接计原始 local_type，并提供真实最早/最晚时间；上层负责将已知类型归类，未知 subtype 不能伪装成已解析类型。

新增合成数据入口为 [createSearchFixture](../../tests/search-fixture.mjs)，生成 10 条、3 个会话、9 条“维护”命中，含合法 zstd、无 session 的 Name2Id 会话、跨库重复 server_id、64 位 ID、时间与 sort_seq 故意不一致的消息。新增测试覆盖全局/会话/分组/筛选/分页、定位两侧游标、uint64、日期半开边界/时区、partial coverage、超大字段和声明性媒体 refs；没有读取真实微信数据。
