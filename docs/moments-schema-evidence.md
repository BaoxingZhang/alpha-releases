# 朋友圈读取 schema 证据边界

本页记录 Alpha 0.3.5 中朋友圈读取入口的静态证据。它只使用恢复后的 JavaScript、随包 runtime manifest 和随包原生二进制中的可读字符串；没有打开用户微信目录，也没有把未确认的列或空结果接入独立后端。

## 已确认的 Alpha 接口形状

- `src/main/index.js` 的 `NativeMomentRecord` 包含 `id`、`username`、`nickname`、`createdAtUnixMs`、`type`、`text`、`rawXml`、`sourceTable` 和 `fields`。
- `MomentsRequest` 接受 `accountId`、可选 `username`/`keyword`、`startTimeUnixMs`/`endTimeUnixMs`、`limit`、`offset` 和 `ascending`。作者列表另有 `postCount`、`latestAtUnixMs`、联系人补充字段和 `totalPosts`/`truncated`。
- renderer 只把 `__alpha_moment_details` 字段解析为 `alpha.moment.v1` projection。projection 的可见结构包括文本、图片/视频、链接、位置、点赞、评论、Finder 和音乐；原始 XML 和媒体凭据不会直接返回 renderer。
- `vendor/runtime/manifests/alpha-wcdb.component.json` 声明 `moments_projection: alpha.moment.v1`、`native.list_moments`、`native.list_moment_authors` 和 `native.moments_year_stats`。这些是原生组件的接口/能力声明，不是独立 Go bridge 的实现证明。

## 原生字符串给出的 schema 线索

`vendor/runtime/native/wcdb/libalpha_native.dylib` 中可以观察到朋友圈候选表名：`SnsTimeLine`、`snsmessage`、`snsmessage_tmp3`、`snsmessage_tmp`。同一二进制包含朋友圈错误分类：`wcdb.moments.database_missing`、`wcdb.moments.table_missing`、`wcdb.moments.table_query_failed`、`wcdb.moment_authors.*`、`MOMENTS_DATABASE_NOT_FOUND`、`MOMENTS_TABLE_NOT_FOUND` 和 `MOMENTS_SCHEMA_UNSUPPORTED`。

`vendor/runtime/native/wcdb/libalpha_sqlcipher_readonly.dylib` 还包含一组动态列候选（字符串区段约在 `0x1d1cce`）：

```text
id | sns_id | local_id | tid
username | user_name | from_username
nickname | nick_name | display_name
content_desc | contentdesc | text | description | content
raw_xml | xml | content_xml
created_at_unix_ms | create_time | createtime | timestamp
type | local_type
```

这些字符串是原生 reader 包含候选列探测/兼容逻辑的线索；它们不能证明每个候选表同时存在，也不能确定最终选择的列、类型或优先级。相邻字符串还出现了 `timelineobject`、`localextrainfo`、`like_user_list`、`comment_user_list`、`reply_username`、`reply_nickname`、`emojis` 和 `images`，以及 `moments.xml_invalid`/`moments.xml_budget`，说明原生 reader 会对 XML/富内容做有界投影。

`libalpha_native.dylib` 中另有 anti-delete 影子表的完整 `CREATE TABLE` 片段：

```sql
(source_table TEXT NOT NULL, source_id TEXT NOT NULL, user_name TEXT,
 content BLOB, packed_info BLOB, source_type INTEGER, create_time INTEGER,
 captured_at_unix_ms INTEGER NOT NULL,
 PRIMARY KEY(source_table, source_id))
```

这段 SQL 只描述 `alpha_moments_deleted_v1` 保全表。它不是 `SnsTimeLine` 或 `snsmessage` 的原始表定义，不能作为原表主键、时间单位或内容编码的依据。

## 本轮 REA 对字段和统计入口的补充

REA/Ghidra 在 `alpha-data-host` 的只读字符串中还观察到以下 moments 输出字段：

- `created_at_unix_ms`、`source_database`、`source_table`、`raw_xml`；
- `username`、`owner_username`、`total_posts`、`day_counts`、`truncated`；
- `likes_received`、`top_likers`、`likes_given`、`top_liked_authors`。

同一静态范围保留了年度统计校验字符串 `year must be between 1970 and 2100`、错误标识 `NATIVE_MOMENTS_YEAR_STATS_REQUEST_INVALID` 和源码路径 `workers/data-host/src/moments_year_stats.rs`。这些观察支持“年度统计存在显式范围和截断/排行字段”的结论，但不能闭合表列类型、统计 SQL、分页排序或作者身份规则。相关 Evidence 为 `ev_1b92be03751eee362dd72673e26ac5b7280000eb9adef0014878fda17358d71b`、`ev_9bee35d805d3c6ba92d3a2e1da9b1c70724a4b513a5a27541fcac3149981f553`、`ev_6c6eda90c8440018052550b9a706a46dc2c71fb44e5b021eee1df54cf1310b17`、`ev_295360739c3b77a3059bba4dfc4582a6b46914a459ce44cac58bc9237620d868`、`ev_287fd15c5cc84a51c9bda617fe2cba53d0a25c0405baad994cd187c63e946fac`、`ev_73140bf649022673055c0d6f9981dda7c8b5ba1388f9dea3faa290e63aa9a770`、`ev_5734849788f41807597ad5c446416bb53895c7ec83a7452892231ce6c2fc214f` 和 `ev_02e6767614aa451ba31a2670f9672ee0843ee7e4911a15da7a63d38d6c719537`。

REA 对 `_alpha_moments_project_row_v1` 还给出了一个低置信度的四参数调用形状候选，并观察到长度指针、可选输出缓冲区和内部投影序列化路径。该结果只能作为后续 ABI probe 的定位索引；由于 row 结构、输出编码、所有权和错误码仍未知，当前项目不会直接调用它。

针对 `alpha-data-host` 的 REA procedure 搜索还定位到 `NativeCore::list_moments`、`AccountDataPort::moments_year_stats`、`browse_account_media` 和 `manage_moments_anti_delete`，并观察到 `ListMomentsRequest/Response`、`MomentsYearStatsRequest/Response`、`MomentsDayCountsOptions`、`NativeMomentsDayCount`、`NativeMomentsDayCounts`、`NativeMomentsDayCountsTypeCount` 和 `NativeMomentsDayCountsUserCount` 等协议类型名称。年度统计类型还出现 `struct WireMomentsYearStats` 和 `struct MomentsYearStats`。这些是静态 procedure/type 索引，未提供字段编号或序列化值，不能替代授权 fixture 或原生 request/response 捕获。REA Evidence：`ev_ce99e3f342f8a8eb071b2ebcad8ac4d13ecc73ca2b169062c9fbefcc1468581a`、`ev_5a76bc93f036c83156a5011f4d37f2935529ce94847d817fed555ec6f75e0aed`。

## 关联公开项目的交叉证据

固定提交 `916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73` 的 WeFlow1 也没有公开朋友圈 SQL。`electron/services/backupService.ts` 只提供 `sns/sns.db` 的路径定位，`electron/services/wcdbCore.ts` 通过 `wcdb_get_sns_timeline`、`wcdb_get_sns_annual_stats`、`wcdb_get_sns_usernames` 和 `wcdb_get_sns_export_stats` 调用 native；`src/types/sns.ts` 与 `electron/services/snsService.ts` 只给出应用层 DTO/XML 解析字段。

这组材料可以帮助核对字段命名和媒体元数据，但不能证明 Alpha 的表名、列优先级、ABI、密钥或错误码兼容。WeFlow1 的 `CC BY-NC-SA 4.0` 许可证也不允许在未完成许可评估前复制实现。因此 Alpha 继续保持独立 schema 探测与 fail-closed 行为。

## 仍未得到的关键证据

当前仓库没有可核对的 `moments.db` 样本、朋友圈表的 `CREATE TABLE`/索引定义或原始 native projection 头文件正文。静态证据不能确定：

1. 数据库实际文件名和相对目录，以及是否每个 v4 数据集都有独立 moments 库。
2. `SnsTimeLine` 与 `snsmessage` 的角色差异、去重规则和稳定排序键。
3. `id`、`sns_id`、`local_id`、`tid` 中哪个是稳定 post identity；`create_time`/`timestamp` 的单位。
4. `content`、`raw_xml`、`content_xml` 的 SQLite 类型、压缩/编码和 XML 版本。
5. `username`/`user_name` 对作者、发布者和回复对象的语义，以及 `type`/`local_type` 的取值。

因此，当前独立 Go bridge 仍只发现并验证 contact/session/message 数据库，`listMoments`、`listMomentAuthors` 和 `getMomentDayCounts` 不应被映射为空页或猜测性 SQL。要实现只读读取，至少需要一个授权的明文 moments fixture（包含 `sqlite_master` 和代表性行）或受控的 native host 请求/响应捕获；取得上游源码/头文件也可以替代样本。测试仍应使用合成 SQLite fixture，不访问真实微信目录。
