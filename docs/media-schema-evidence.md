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

`packages/alpha-data-bridge` 目前只接收 `contact.db`、`session.db` 和 `message[_数字].db`，启动时会拒绝不满足这些核心 schema 的数据库，但对目录中的未知文件不建立媒体连接。`account.info` 也不会声明媒体索引或语音能力。Node 层的 `browseConversationMessages`/`browseAccountMedia` 因而只返回消息 DTO 中明确声明的 `refs`、`display` 和来源身份；它不会使用上表推断本地路径、读取 `.dat`、读取 `voice_data`、解码、播放或生成 `media1_...` token。

## 为什么暂不接入 `resolveMessageMedia`

原协议的 `resolveMessageMedia` 请求需要 Alpha `mediaResolveToken`，并带有账号、消息、MD5、时间和大小等交叉校验字段。仅凭上述候选表查询无法证明 token 与数据库行之间的绑定，也无法证明消息 XML 中的 ID 与 `md5`/`file_name` 的对应关系。直接把候选路径或 `voice_data` 接到该请求会把“候选读取线索”误报为原生兼容能力，还会绕过当前工程对密钥、媒体解密和本地文件完整性的边界。

因此，媒体文件定位、解密、缩略图、播放、CDN 补齐和语音转写继续保持显式未实现。后续若要推进，应先增加人工生成的 hardlink/VoiceInfo fixture，验证列类型、路径存在性和字节上限，再设计独立 token/DTO，并保持与原 Alpha token 明确隔离。

