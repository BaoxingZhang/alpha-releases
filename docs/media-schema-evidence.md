# v4 媒体库证据边界

`vendor/chatlog` 的 v4 数据源给出了媒体库的可复核读取线索，但这些线索还不足以证明 Alpha 0.3.5 的原生媒体协议已经可以复原。本文只记录代码中实际出现的表名、字段和相对路径，不把它们升级成经过 Alpha 验证的兼容实现。

## 已观察到的读取语义

[`vendor/chatlog/internal/wechatdb/datasource/v4/datasource.go`](../vendor/chatlog/internal/wechatdb/datasource/v4/datasource.go) 注册了两类额外文件：`hardlink.db`（媒体索引）和 `media_*.db`（语音库）。`GetMedia` 根据媒体类型尝试以下表，并通过 `dir2id` 的 `rowid` 反查目录用户名：

| 类型 | 首选表 | 回退表 | 查询字段 | 代码拼出的相对路径 |
| --- | --- | --- | --- | --- |
| image | `image_hardlink_info_v3` | `image_hardlink_info_v4` | `md5`, `file_name`, `file_size`, `modify_time`, `dir1`, `dir2` | `msg/attach/<dir1>/<dir2>/Img/<file_name>` |
| video | `video_hardlink_info_v3` | `video_hardlink_info_v4` | 同上 | `msg/video/<dir1>/<file_name>` |
| file | `file_hardlink_info_v3` | `file_hardlink_info_v4` | 同上 | `msg/file/<dir1>/<file_name>` |

`GetVoice` 会在每个 `media_*.db` 中执行 `SELECT voice_data FROM VoiceInfo WHERE svr_id = ?`，返回非空的二进制 `voice_data`。这能证明候选实现曾按 `svr_id` 查找语音数据，但没有证明字节格式、压缩参数、解码链路或 Alpha 的播放缓存协议。

这些信息来自候选项目的查询代码（`GetMedia`/`GetVoice`），而不是 Alpha 的迁移文件或经过本项目验证的真实数据库。vendor 中没有对应的 `CREATE TABLE` 定义；v3/v4 表的版本选择、列类型、唯一性、目录根路径和文件是否存在都仍需真实 fixture 或原厂运行证据确认。

## 当前 bridge 的边界

`packages/alpha-data-bridge` 的常规账号读取仍只接收 `contact.db`、`session.db` 和 `message[_数字].db`，启动时会拒绝不满足这些核心 schema 的数据库。独立 `media.probe` 是一个显式、无参数的只读探针：它在已打开的数据目录下另外枚举 `hardlink.db` 和 `media_*.db`，验证 SQLite `mode=ro&immutable=1&_query_only=1`、拒绝 sidecar/WAL/符号链接，限制单库 512 MiB、单项 1 TiB、最多 4096 项，并为每个源库记录相对路径、大小和 SHA-256。它只读取 hardlink 行的元数据和 `VoiceInfo` 的 `length(voice_data)`，不读取媒体内容。返回始终标记 `nativeSchemaSupported=false`、`metadataOnly=true`、`mediaReady=false`；没有候选库时返回 `status=unavailable`，不会伪造空的“ready”媒体索引。Node 层的 `browseConversationMessages`/`browseAccountMedia` 因而仍只返回消息 DTO 中明确声明的 `refs`、`display` 和来源身份；它不会使用该探针生成 `media1_...` token、读取 `.dat`、解码、播放或联网下载。

## 原生 `resolveMessageMedia` 与独立索引解析的边界

原协议的 `resolveMessageMedia` 请求需要 Alpha `mediaResolveToken`，并带有账号、消息、MD5、时间和大小等交叉校验字段。仅凭上述候选表查询无法证明原 token 与数据库行之间的绑定，也无法证明消息 XML 中的 ID 与 `md5`/`file_name` 的对应关系。当前独立引擎只在调用方显式提供并绑定 `media-index.v1.json` 时，接受自有 `alpha-media://sha256/<sha256>` token，重新读取文件并扫描真实消息 DTO 做一致性验证；这不是 Alpha 原生 token 兼容实现。

因此，媒体解密、缩略图、播放、CDN 补齐和语音转写继续保持显式未实现。独立图片解析要求索引条目同时绑定账号、会话和消息，并拒绝 MD5、远程、pending、live video 及非零 record offset 语义；后续若要推进其他媒体，应先增加人工生成的 hardlink/VoiceInfo fixture，验证列类型、路径存在性和字节上限，并保持与原 Alpha token 明确隔离。

当前独立引擎已接通图片 key 的进程内手动配置、状态查询和清除生命周期，但该状态不会探测 DAT、验证样本或开启媒体解码；`usable=false` 是预期结果，不能把这一步当作 `resolveMessageMedia` 已恢复。


## `decodeVoicePlayback` 的已知契约与阻塞

恢复的 Electron 代码还给出了 field 128 的缓存边界：`decodeVoicePlayback` 只接收账号和 64 位十六进制 `mediaId`，返回同样受校验的 `wavMediaId`；随后播放层只在受控 cache root 的 `av/` 下读取 `<wavMediaId>.wav`，并要求文件 SHA-256 等于该 ID 且通过 WAV 校验。播放缓存还限制输入/输出大小和候选数量，并要求由受控账号/generation 授权。

这只是客户端契约，不是可编译的解码实现。当前原生清单只声明 `native.read_voice_blob`、`native.peek_cached_media` 等能力，没有 VoiceInfo schema/ABI、`voice_data` 编码参数或 SILK→WAV 实现。候选 Chatlog 的 `VoiceInfo(svr_id, voice_data)` 读取和 SILK→MP3 工具也不能证明 Alpha 的 token 绑定、缓存哈希或 WAV 语义。因此独立后端继续拒绝 field 128；要恢复它，需要先取得授权的 VoiceInfo fixture/bridge 操作和可复现的解码、哈希、账号代际测试。
