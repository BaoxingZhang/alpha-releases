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

截至 2026-11-06，仓库 `main` 的 [LICENSE](https://github.com/334456777/WeFlow/blob/main/LICENSE) 文本声明为 Unlicense/公有领域；提交历史同时显示该仓库长期合并了来自其他 WeFlow 仓库的代码，而相关来源曾使用 CC BY-NC-SA 4.0。单个当前 LICENSE 文件不足以清除这些混合来源的逐文件版权和许可证义务，因此本工程不把整仓复制或作为依赖，也不把它的 Unlicense 声明扩展到历史继承代码。该仓库还明确真实数据验证主要集中在 Windows；README 没有证明 macOS arm64 已通过。因此它只能作为独立参考或后续逐文件 provenance/许可评估对象，不能直接替换当前项目的 Alpha runtime，也不能被当作已验证的 macOS 兼容后端。

## `xunchahaha/alpha-build` 与 Alpha release 仓库

[alpha-build](https://github.com/xunchahaha/alpha-build) 是公开打包仓：它消费 `xunchahaha/alpha` 的版本锁，并在有权限时拉取私有 `alpha-wcdb`、`alpha-xkey`、`alpha-wxproto` 等组件。它本身没有这些组件的源代码，不能闭合本工程的原生编译链。

[alpha-releases](https://github.com/xunchahaha/alpha-releases) 继续提供发行材料和 [HTTP API](https://github.com/xunchahaha/alpha-releases/blob/main/docs/api/http-api.md)、[MCP](https://github.com/xunchahaha/alpha-releases/blob/main/docs/api/mcp.md) 契约。它们可用于补齐接口清单和验收字段，但不包含 Alpha 原生实现或服务端源码。

截至 2026-11-06 的公开审计显示，`alpha-releases` 的 `main` HEAD 仍为 `09232cbca892241fd3d2046957832a6b4d764ddc`，递归树只有 README、截图、API 文档和更新清单；[latest release](https://github.com/xunchahaha/alpha-releases/releases/tag/v0.3.5) 仍是 v0.3.5。官方说明高级 CDN 媒体补齐只面向 Windows x64，macOS arm64 没有对应实现；公开的 [issue #29](https://github.com/xunchahaha/alpha-releases/issues/29)、[issue #32](https://github.com/xunchahaha/alpha-releases/issues/32) 和 [issue #25](https://github.com/xunchahaha/alpha-releases/issues/25) 也没有提供可复用源码或修复提交。因此这次审计没有闭合当前 41 个独立协议缺口，仍需保持原生 schema、ABI、授权和实时服务边界为 fail-closed。

## 对本工程的处理

相关仓库已经放在工作区外的只读研究目录 `<external-research-root>/WeFlow1`，没有导入构建、没有修改许可证声明、没有替换 Alpha runtime。复核中没有找到收藏功能、收藏表名或收藏 API 的证据，因此收藏不能从 WeFlow1 推导实现。后续若要利用其中的代码，必须先单独确认许可证、署名、非商业和相同方式共享义务，并重新验证 ABI、微信版本、平台和数据安全边界。

## 2026-11-06 新增公开候选复核

本轮重新检查了作者账号下的 [xunchahaha/WeFlow1](https://github.com/xunchahaha/WeFlow1)。仓库仍公开 TypeScript/Electron 应用层和预编译资源，但 GitHub 的许可证元数据为 `NOASSERTION`，固定提交的 `LICENSE` 文本是 **CC BY-NC-SA 4.0**；最近的 `nightly-dev` 发布只提供 Windows/Linux 安装包和调试构建，没有 macOS 资产。它不是 Alpha 源码，也没有证明与 Alpha 的数据库、ABI、授权或完整性策略兼容，因此本工程不复制代码、不引入二进制、不提高支持矩阵。

另发现 [xunchahaha/echotrace](https://github.com/xunchahaha/echotrace)，仓库明确带 MIT LICENSE，包含 Flutter/Dart 的 `wcdb_*` FFI 声明和 Windows v4 解密参考；当前发布物只有 Windows，预编译 WCDB 二进制的来源和许可证仍未闭合。它可以作为 MIT 许可下的接口分类参考，但不是 macOS Alpha 后端，不能直接接入本项目或替代 `_alpha_native_get_api` 函数表。

这两项材料都没有提供合法、可重放的 Alpha macOS 取钥/真实数据证据。原生取钥、真实朋友圈/收藏/媒体和 writer 能力继续保持 `native_schema_supported=false` 或 `UNIMPLEMENTED`。

同轮还复核了 [xunchahaha/WeChatMsg_fix](https://github.com/xunchahaha/WeChatMsg_fix)。它是 Windows-only 的 Python v4 数据库解析/导出 fork，根目录带 MIT 文本但继承来源的逐文件许可需要另行核查；README 只覆盖 Windows WeChat 4.0.3.22 及以前版本，没有 macOS、Alpha ABI 或取钥授权证据。它最多作为 PBKDF2/SQLite 页面和字段模型的参考，不进入 Alpha 构建，也不能提高 macOS/native 支持计数。

[xunchahaha/WeChatDataAnalysis](https://github.com/xunchahaha/WeChatDataAnalysis) 也只有无许可证元数据的公开 fork，包含 Windows v4 解密、聊天/联系人/朋友圈和导出代码及预编译组件。由于继承代码和二进制的再分发许可未闭合，本工程只记录其功能线索，不复制源码或资源。

## 2026-11-06 原生组件与许可证复核

本轮对两个公开仓库的固定提交做了文件级复核：`xunchahaha/WeFlow1` 为
`916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73`，`hicccc77/WeFlow` 为
`91adcfdbb24e8e147d8332440b8c6ac899ad2abf`。两者的仓库 `LICENSE` 都是
**CC BY-NC-SA 4.0**，复核范围内没有发现 `NOTICE` 或 `COPYING` 文件。许可证原文分别见
[`WeFlow1/LICENSE`](https://raw.githubusercontent.com/xunchahaha/WeFlow1/916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73/LICENSE) 和
[`WeFlow/LICENSE`](https://raw.githubusercontent.com/hicccc77/WeFlow/91adcfdbb24e8e147d8332440b8c6ac899ad2abf/LICENSE)。因此，Alpha
工程只记录行为和接口证据，不复制其 TypeScript、原生二进制或媒体/取钥实现；任何未来的代码复用都必须单独完成逐文件署名、非商业、相同方式共享和来源核查。

`WeFlow1` 的 `electron/services/keyServiceMac.ts` 通过 `koffi` 动态绑定
`GetDbKey`/`ListWeChatProcesses`，并调用 `xkey_helper`、检查 SIP、请求管理员授权，处理
`task_for_pid`、进程 attach/hook 等失败。它依赖微信进程、调试权限和随仓库发布的
`libwx_key.dylib`/helper，不能被当作离线 key 推导器或 Alpha 的授权替代；相关代码只作为
行为证据保留在审计记录中（[keyServiceMac.ts](https://raw.githubusercontent.com/xunchahaha/WeFlow1/916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73/electron/services/keyServiceMac.ts)）。

其 `nativeImageDecrypt.ts` 仅加载平台原生 addon 并调用
`decryptDatNative(inputPath, xorKey, aesKey)`，没有在 TypeScript 中实现 DAT/AES 解码算法；
`wcdbCore.ts` 同样通过 C ABI 加载 `libwcdb_api.dylib`。父仓库现在改为第三方可插拔组件，
明确要求用户自行配置 WCDB/媒体/WeLive 实现，且未配置时直接返回“未配置”错误（见
[`third-party-components.md`](https://raw.githubusercontent.com/hicccc77/WeFlow/91adcfdbb24e8e147d8332440b8c6ac899ad2abf/docs/third-party-components.md)）。
其中列出的 `wcdb_*` 函数只能作为能力分类和行为对照，不能证明与 Alpha 的
`_alpha_native_get_api(version,size,out_api)` 函数表、数据库 schema、授权 permit 或媒体 token
兼容。Alpha 继续对真实朋友圈、收藏、媒体和自动取钥保持 fail-closed。

本轮没有把上述仓库、二进制或真实数据加入依赖、构建产物或发布包，也没有用它们提高独立
后端的支持计数。可移植范围限于自行重写的 DTO/导出映射、能力分类和错误边界；生产实现必须
保持 `native_schema_supported=false`，直到获得独立且合法的 schema、ABI、授权和真实数据证据。

