# 收藏读取 schema 证据边界

本文记录 Alpha 0.3.5 收藏功能的静态证据，以及独立后端仅基于自有 synthetic fixture 的实现边界。证据来自恢复的 JavaScript、独立协议绑定、随包 WCDB 原生二进制的可读字符串和组件 manifest；没有读取真实微信目录，也没有把原生运行时的接口声明当作运行成功证据。

当前独立引擎只接受显式 `favorite.db`/`favorites.db` 中的 `__alpha_favorites_v1` 表，并已验证 `listFavorites` 的分页、类型计数、文字查询和标签过滤。这个表是本项目自有测试契约，不是从原生收藏库推导出的兼容声明；真实收藏 schema、source lookup 和真实媒体语义仍保持不可用。独立模式另接受同一数据库中的可选 `__alpha_favorite_media_v1` 合成表，用于有界媒体槽位查询；媒体文件必须同时由本项目自有 `media-index.v1.json` 绑定并重新校验。

## 已确认的接口形状

- `FavoritesRequest` 接受 `accountId`、`type`、`limit`、`offset`、`ascending`、`skipSourceContext`、`query`、`includeTypeCounts`、`includeMedia` 和 `tagId`。定义见 `packages/alpha-protocol/bindings.cjs` 中恢复自 `src/main/index.js` 的 `FavoritesRequest`。
- `NativeFavoriteRecord` 的可见字段包括 `id`、`type`、`updatedAtUnixMs`、`title`、`description`、`sourceId`、`fromUsername`、`contentXml`、`sourceTable`、结构化 `fields`、可选 source lookup、媒体对象和 `detailsTruncated`。
- 主进程保留了 `listFavorites`、`favoritePage`、`favoriteMediaSlots` 和 `resolveFavoriteMedia` 的 IPC/engine 调用；renderer 会对收藏详情 JSON 做 `projection`/`error_code` 校验，并限制媒体 token、角色和 MIME 类型。相关入口见 `src/main/index.js` 的 `favoritePageOptions`、`favoriteFromWire`、`favoritePageFromWire` 和 IPC handlers。
- 独立引擎实现了 `listFavoriteMediaSlots`（仅 `__alpha_favorite_media_v1`）和 `resolveFavoriteMedia`（仅 `fav1_<32 hex>` token + 自有 media-index）。返回的 `opaqueId` 是本地文件 SHA-256，媒体读取仍通过独立 `alpha-media://sha256/...` 边界完成，不兼容原生 `media1_`/真实微信 token。

这些材料证明了客户端契约和安全边界，不能证明独立桥接所需的 SQLite 表结构。

## 原生二进制给出的候选线索

`vendor/runtime/native/wcdb/libalpha_native.dylib` 的 `__cstring` 区段包含以下收藏相关字符串：

| 线索 | 可观察内容 | 证据强度 |
| --- | --- | --- |
| 数据库候选 | `favorite.db`、`favorites.db`、`favorite` | 证明 reader 会尝试这些名称；不能确定具体数据集使用哪个文件 |
| 主表候选 | `fav_db_item`、`fav_item` | 证明存在候选表名；没有 `CREATE TABLE` 正文 |
| 主字段候选 | `update_time`、`updateTime`、`item_id` | 可作为未来 schema 探测候选；没有类型、单位或唯一性证明 |
| 标签表候选 | `fav_tag_db_item`、`fav_bind_tag_db_item`、`tag_local_id`、`fav_local_id` | 证明标签绑定路径存在候选名称；连接方向和重复规则未知 |
| 搜索字段候选 | `title`、`desc`、`favtitle`、`pagetitle`、`datatitle`、`pagedesc`、`datadesc`、`sourcename`、`sourcedisplayname`、`datasrcname`、`singer`、`poiname`、`locationname`、`label`、`address`、`tag`、`tagname`、`link`、`clean_url`、`stream_weburl` | 证明原生 reader 会在多个版本字段中探测文本；不能确定哪些列同时存在或其优先级 |
| 结果/错误标识 | `wcdb.favorites.*`、`type_counts`、`tags`、`count` | 证明原生功能有计数、标签和错误分支；不是数据 schema |

`vendor/runtime/manifests/alpha-wcdb.component.json` 还声明 `native.list_favorites`、`format.favorites`、`format.favorites-json`、`semantic.favorites` 和 `semantic.favorite_xml`。这些是随包组件能力/格式声明，不能替代 reader 源码或数据库样本。

## 本轮 REA 对收藏和媒体入口的补充

REA/Ghidra 又确认了收藏/媒体相关 operation 字符串：`native.list_favorites`、`native.resolve_image_media`、`native.read_image_media`、`native.read_voice_blob`、`native.cdn_media_transfer`、`semantic.favorites` 和 `semantic.favorite_xml`。这组 Evidence 还同时保留了朋友圈 operation，因此只能说明同一 data-host 包含这些语义入口，不能证明收藏 reader 已经在当前独立后端可调用。对应 Evidence 为 `ev_b3c5dd36bda3b097b94881d1c35aeabefc3cdf50964a80d928c1e48f559b8b0d`、`ev_f1acd49d61402815c03fe786bee5e0c5323110cc6d5e71be27de66f3fdff04f0`、`ev_e05ad3bf6d4092cec26ec32a284c2cf2f447a379cfd9561f40c2b6728e8a263c`、`ev_aade22a182abf4af9240dc4eabeab0aa1b5c1449a5c9c5f4717e783102b0fbe8` 和 `ev_5cc76c2c5afaa105d69a4d7cd3fdd975ea25476b472cbc55e556de72cb7024ce`。

静态 operation 名称与前文候选数据库/列名之间没有可验证的映射。尤其是原生媒体 operation 的 locator、token、文件所有权和过期状态仍未取得；因此真实/native schema 路径继续保持不可用。独立后端的 `resolveFavoriteMedia` 和媒体 slot 分支只对本项目自有 `__alpha_favorite_media_v1` synthetic fixture 开放，并不构成真实收藏媒体兼容证据。

REA procedure 搜索还定位到 `NativeCore::list_favorites`、`parse_favorite`、`favorite_record_field`、`locate_favorite_media`、`lookup_favorite_source`、`resolve_image_media_with_preference`、`resolve_record_media`、`resolve_favorite_image_media` 和 `resolve_favorite_object_media`。原生 inventory 同时保留了 `ListFavoritesRequest/Response`、`NativeFavoriteRecord`、`FavoriteTypeCount`、`FavoriteTag`、`NativeFavoriteSourceMessage`、`NativeFavoriteMediaLocator/Object`、`ResolveImageMediaRequest/Response`、`PeekCachedMedia*` 和 `ReadImageMedia*` 等协议类型名称。它们确认原包存在收藏、来源查找和媒体定位的实现入口，但没有闭合字段编号、数据库选择、token 所有权或实际文件读取语义。REA Evidence：`ev_ce99e3f342f8a8eb071b2ebcad8ac4d13ecc73ca2b169062c9fbefcc1468581a`。

函数级伪代码显示 `list_favorites` 使用 `ALPHA_WCDB_FAVORITES_V1` 请求 envelope，响应要求 `ALPHA_DB_JSON_RESPONSE_V1`，最大读取长度为 16 MiB；页大小和 offset 有界，结果限制观察到最多 10,000 行，之后由 `favorite_page::split` 分页并映射为 JSON。该结果只建立 wire 封装和容量边界，没有建立收藏表、XML 字段、标签连接或媒体 token 语义，独立后端继续 fail-closed。REA Evidence：summary `ev_09e8d64d355b9aa4096d0a3a542a0ead0d4d8d27fdad4175f6e15fda60655044`。

## 关联公开项目的反查结果

固定提交 `916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73` 的 WeFlow1 反查了 `electron/`、`src/`、`shared/`、`resources/` 和公开 HTTP API 文档，没有找到收藏读取服务、收藏表名或收藏 API。它的公开朋友圈/媒体 DTO 不能补齐 Alpha 收藏的 `fav_db_item`、标签绑定、XML projection 或媒体 token 语义；因此“没有在 WeFlow1 发现收藏实现”本身也是本轮证据边界的一部分，不能被解释为收藏数据库不存在。

## 当前缺失的关键证据

仓库中没有可核对的授权 `favorite.db`/`favorites.db` 明文副本，也没有收藏表的 `sqlite_master`、索引定义或代表性行。因此目前无法可靠确定：

1. 收藏库相对数据目录、是否每个微信版本都使用同一数据库文件，以及是否存在多库合并规则；
2. `fav_db_item` 与 `fav_item` 的角色、主键、删除/排序规则，以及 `update_time` 的秒/毫秒单位；
3. `type` 的取值和 `contentXml` 的 XML/压缩/二进制编码；
4. `fields` 如何从原始列投影，详情 JSON 的 `alpha.favorite.v1` 结构及截断规则；
5. `fav_bind_tag_db_item` 的连接列、标签计数去重规则和 `tagId` 过滤语义；
6. 媒体对象如何对应本地资源数据库、opaque token、文件路径和过期状态。

因此独立引擎实现的是显式 synthetic fixture 的 `listFavorites`、`listFavoriteMediaSlots` 和 `resolveFavoriteMedia`；没有媒体槽表时仍返回 `FAVORITES_MEDIA_UNAVAILABLE`，没有对应 media-index 文件时返回 `missing`，不返回空的真实收藏页，也不伪造原生媒体 ready/expired 状态。

## 下一步取证条件

实现基础只读收藏至少需要以下一种可追溯材料：

- 用户授权的明文收藏数据库 fixture，保留 `sqlite_master`、索引和代表性 XML/媒体行；
- 在受控合成或授权数据环境中，对原生 reader 做请求/响应捕获，并记录其选择的数据库、表、列和错误分支；
- 原作者或上游公开的收藏 reader 源码/头文件与对应版本说明。

取得材料后仍应在独立 fixture 之外单独验证真实库的分页、类型计数、标签过滤、XML projection 与媒体资源解析。所有测试继续使用合成 SQLite/资源 fixture；真实微信目录、密钥、网络模型和写入操作不属于当前验收范围。

