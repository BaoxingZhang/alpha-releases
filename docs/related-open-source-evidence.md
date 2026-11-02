# 相关公开项目与可复用边界

2026-11-01 至 2026-11-03 对公开仓库做了补充核查。结论是：目前没有找到 Alpha 的 `alpha`、`alpha-wcdb`、`alpha-xkey` 或 `alpha-wxproto` 原生源码；但发现了作者维护的 WeFlow fork 和其他公开实现，可以作为协议、数据字段和替代后端的研究材料。

## `xunchahaha/WeFlow1`

[xunchahaha/WeFlow1](https://github.com/xunchahaha/WeFlow1) 是 Alpha 作者账号下的公开 WeFlow fork，页面显示它 fork 自 [hicccc77/WeFlow](https://github.com/hicccc77/WeFlow)，当前浅克隆包含 1,819 个提交和完整的 `electron/`、`src/`、`shared/`、`resources/` 目录。

本次复核固定在提交 `916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73`，只读副本位于工作区外的 `<external-research-root>/WeFlow1`（同一提交的临时副本为 `<external-research-root>/WeFlow1-research`）。它提供了若干可用于交叉核对的接口名称和字段模型，例如：

- `wcdb_get_sns_timeline`、`wcdb_get_sns_annual_stats`、`wcdb_get_sns_usernames`、`wcdb_get_sns_export_stats`；
- `wcdb_get_messages_by_type`、媒体扫描、语音读取和图片/视频硬链接解析；
- `SnsPost`、媒体、点赞、评论、位置和原始 XML 的应用层结构。

进一步核对得到的文件级证据是：`electron/services/backupService.ts` 会把朋友圈库定位为 `sns/sns.db`（同时尝试数据目录下的同名相对路径）；`electron/services/wcdbCore.ts` 的朋友圈读取、统计和防删除操作全部通过 `wcdb_get_sns_*`/`wcdb_*_sns_*` native ABI 完成，没有公开的 `CREATE TABLE` 或可直接复用的 SQL。`src/types/sns.ts` 和 `electron/services/snsService.ts` 能确认帖子、媒体、评论、位置以及 XML 中的 token/key/md5/enc_idx 字段形状，但这些属于 WeFlow 自己的 native 输出契约。

这些材料证明作者的另一个公开项目确实有朋友圈和媒体的应用层设计，但不能证明它与 Alpha 0.3.5 的 native ABI、数据库 schema、授权策略或协议字段相同。其仓库 LICENSE 是 **CC BY-NC-SA 4.0**，因此本工程没有复制源码、没有把它加入依赖，也没有把它作为可直接合并的后端。

本轮又对该 fork 的预编译资源做了 ABI 对照。固定提交 `916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73` 中的 `resources/wcdb/macos/universal/libwcdb_api.dylib` SHA-256 为 `e6b52eb896f0fa4eb337b338a5a2ad477880832d7fbb60a7175ee5e2a5042429`，实际是 arm64 Mach-O；它直接导出 `wcdb_get_sns_timeline`、`wcdb_get_voice_data`、`wcdb_resolve_image_hardlink`、`wcdb_scan_media_stream`、`wcdb_update_message` 等 `wcdb_*` 符号，并依赖 `WCDB.framework`。Alpha 的 `vendor/runtime/native/wcdb/libalpha_native.dylib`（SHA-256 `be2407e9e928cdf8ced0593834c680d3d49bf90926d2ebbe3abde82fdc5c011c`）只导出 `_alpha_native_get_api`，由 `version`/`size`/`out_api` 参数获取函数表；没有同名导出或已验证的 ABI 兼容关系。该二进制对照支持后续研究隔离适配器，但不支持替换 Alpha runtime 或宣称真实 moments/media 已恢复。

## `hicccc77/WeFlow`（2026-11-03 复核）

本次又固定检查了公开仓库 [hicccc77/WeFlow](https://github.com/hicccc77/WeFlow) 的提交 `91adcfdbb24e8e147d8332440b8c6ac899ad2abf`（package 版本 5.0.0）。仓库 LICENSE 为 **CC BY-NC-SA 4.0**，包含署名、非商业、相同方式共享和许可证传递条件；本工程没有复制其源码、没有加入依赖，也没有把该许可证默认为 Alpha 项目的整体授权。

该仓库的朋友圈功能仍是应用层对自有 WCDB native DLL 的封装。`electron/services/wcdbCore.ts` 动态绑定 `wcdb_get_sns_timeline`、`wcdb_get_sns_annual_stats`、`wcdb_get_sns_usernames`、`wcdb_get_sns_export_stats` 以及防删除/删除函数；`electron/services/snsService.ts` 再把 native 返回的通用 JSON/XML 投影为帖子、媒体、点赞、评论、位置和 token/key/md5/enc_idx 字段。仓库没有公开 `SnsTimeLine`/`snsmessage` 的 SQL DDL、迁移、样本数据库或明确的微信版本证据，也没有暴露 Alpha `libalpha_native.dylib` 的 ABI。仓库本身也没有提交这些 WCDB native 二进制，只依赖外部运行时库。

针对收藏的限定搜索没有发现实际收藏数据库、收藏表或独立收藏服务；聊天中的分享消息不能证明存在微信收藏库。因此该仓库只能作为字段和应用层行为的候选研究材料，不能闭合 Alpha 的真实朋友圈/收藏 schema、原生 ABI、媒体 key 或 macOS arm64 兼容性。本工程保持真实 moments/favorites 分支 fail-closed。

作者账号下的 [xunchahaha/WeFlow](https://github.com/xunchahaha/WeFlow) 当前由 GitHub 按 DMCA 请求限制访问，匿名页面返回 HTTP 451；GitHub 的 [DMCA 记录](https://github.com/github/dmca/blob/master/2026/07/2026-07-07-wechat.md) 将其列为被处理的 WeFlow 网络的一部分。因此本工程不把该仓库、其 fork、release 或附件作为可复用来源，也不尝试绕过访问限制。仍公开的 `hicccc77/WeFlow` 只作为许可证和接口边界参考。

## `334456777/WeFlow`

[334456777/WeFlow](https://github.com/334456777/WeFlow) 的公开分支包含 `crates/`、`weflow-native` 和 `weflow-wcdb-ffi` 等 Rust 后端材料，并描述了消息、联系人、朋友圈、媒体、分析和 HTTP/MCP 能力。它的 [native-cli 文档](https://github.com/334456777/WeFlow/blob/main/docs/native-cli.md) 和 [desktop Rust layer 文档](https://github.com/334456777/WeFlow/blob/main/docs/desktop-rust-layer.md) 可用于比较独立原生层的职责。

该仓库同样使用 CC BY-NC-SA 4.0，并明确真实数据验证主要集中在 Windows；README 没有证明 macOS arm64 已通过。因此它只能作为独立参考或后续许可评估对象，不能直接替换当前项目的 Alpha runtime，也不能被当作已验证的 macOS 兼容后端。

## `xunchahaha/alpha-build` 与 Alpha release 仓库

[alpha-build](https://github.com/xunchahaha/alpha-build) 是公开打包仓：它消费 `xunchahaha/alpha` 的版本锁，并在有权限时拉取私有 `alpha-wcdb`、`alpha-xkey`、`alpha-wxproto` 等组件。它本身没有这些组件的源代码，不能闭合本工程的原生编译链。

[alpha-releases](https://github.com/xunchahaha/alpha-releases) 继续提供发行材料和 [HTTP API](https://github.com/xunchahaha/alpha-releases/blob/main/docs/api/http-api.md)、[MCP](https://github.com/xunchahaha/alpha-releases/blob/main/docs/api/mcp.md) 契约。它们可用于补齐接口清单和验收字段，但不包含 Alpha 原生实现或服务端源码。

## 对本工程的处理

相关仓库已经放在工作区外的只读研究目录 `<external-research-root>/WeFlow1`，没有导入构建、没有修改许可证声明、没有替换 Alpha runtime。复核中没有找到收藏功能、收藏表名或收藏 API 的证据，因此收藏不能从 WeFlow1 推导实现。后续若要利用其中的代码，必须先单独确认许可证、署名、非商业和相同方式共享义务，并重新验证 ABI、微信版本、平台和数据安全边界。

