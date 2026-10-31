# 收藏读取 schema 证据边界

本文记录 Alpha 0.3.5 收藏功能的静态证据，以及为什么独立后端暂时没有猜测性实现收藏 SQL。证据来自恢复的 JavaScript、独立协议绑定、随包 WCDB 原生二进制的可读字符串和组件 manifest；没有读取真实微信目录，也没有把原生运行时的接口声明当作运行成功证据。

## 已确认的接口形状

- `FavoritesRequest` 接受 `accountId`、`type`、`limit`、`offset`、`ascending`、`skipSourceContext`、`query`、`includeTypeCounts`、`includeMedia` 和 `tagId`。定义见 `packages/alpha-protocol/bindings.cjs` 中恢复自 `src/main/index.js` 的 `FavoritesRequest`。
- `NativeFavoriteRecord` 的可见字段包括 `id`、`type`、`updatedAtUnixMs`、`title`、`description`、`sourceId`、`fromUsername`、`contentXml`、`sourceTable`、结构化 `fields`、可选 source lookup、媒体对象和 `detailsTruncated`。
- 主进程保留了 `listFavorites`、`favoritePage`、`favoriteMediaSlots` 和 `resolveFavoriteMedia` 的 IPC/engine 调用；renderer 会对收藏详情 JSON 做 `projection`/`error_code` 校验，并限制媒体 token、角色和 MIME 类型。相关入口见 `src/main/index.js` 的 `favoritePageOptions`、`favoriteFromWire`、`favoritePageFromWire` 和 IPC handlers。

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

## 当前缺失的关键证据

仓库中没有可核对的授权 `favorite.db`/`favorites.db` 明文副本，也没有收藏表的 `sqlite_master`、索引定义或代表性行。因此目前无法可靠确定：

1. 收藏库相对数据目录、是否每个微信版本都使用同一数据库文件，以及是否存在多库合并规则；
2. `fav_db_item` 与 `fav_item` 的角色、主键、删除/排序规则，以及 `update_time` 的秒/毫秒单位；
3. `type` 的取值和 `contentXml` 的 XML/压缩/二进制编码；
4. `fields` 如何从原始列投影，详情 JSON 的 `alpha.favorite.v1` 结构及截断规则；
5. `fav_bind_tag_db_item` 的连接列、标签计数去重规则和 `tagId` 过滤语义；
6. 媒体对象如何对应本地资源数据库、opaque token、文件路径和过期状态。

因此独立引擎目前继续对 `listFavorites`、`listFavoriteMediaSlots` 和 `resolveFavoriteMedia` 返回明确的 `UNIMPLEMENTED`，不返回空收藏页，也不伪造媒体 ready/expired 状态。

## 下一步取证条件

实现基础只读收藏至少需要以下一种可追溯材料：

- 用户授权的明文收藏数据库 fixture，保留 `sqlite_master`、索引和代表性 XML/媒体行；
- 在受控合成或授权数据环境中，对原生 reader 做请求/响应捕获，并记录其选择的数据库、表、列和错误分支；
- 原作者或上游公开的收藏 reader 源码/头文件与对应版本说明。

取得材料后仍应先实现无媒体的分页、类型计数和标签过滤，再单独验证 XML projection 与媒体资源解析。所有测试继续使用合成 SQLite/资源 fixture；真实微信目录、密钥、网络模型和写入操作不属于当前验收范围。

