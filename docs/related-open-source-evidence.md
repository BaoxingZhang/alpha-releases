# 相关公开项目与可复用边界

2026-11-01 对公开仓库做了补充核查。结论是：目前没有找到 Alpha 的 `alpha`、`alpha-wcdb`、`alpha-xkey` 或 `alpha-wxproto` 原生源码；但发现了作者维护的 WeFlow fork 和其他公开实现，可以作为协议、数据字段和替代后端的研究材料。

## `xunchahaha/WeFlow1`

[xunchahaha/WeFlow1](https://github.com/xunchahaha/WeFlow1) 是 Alpha 作者账号下的公开 WeFlow fork，页面显示它 fork 自 [hicccc77/WeFlow](https://github.com/hicccc77/WeFlow)，当前浅克隆包含 1,819 个提交和完整的 `electron/`、`src/`、`shared/`、`resources/` 目录。

它提供了若干可用于交叉核对的接口名称和字段模型，例如：

- `wcdb_get_sns_timeline`、`wcdb_get_sns_annual_stats`、`wcdb_get_sns_usernames`、`wcdb_get_sns_export_stats`；
- `wcdb_get_messages_by_type`、媒体扫描、语音读取和图片/视频硬链接解析；
- `SnsPost`、媒体、点赞、评论、位置和原始 XML 的应用层结构。

这些材料证明作者的另一个公开项目确实有朋友圈和媒体的应用层设计，但不能证明它与 Alpha 0.3.5 的 native ABI、数据库 schema、授权策略或协议字段相同。其仓库 LICENSE 是 **CC BY-NC-SA 4.0**，因此本工程没有复制源码、没有把它加入依赖，也没有把它作为可直接合并的后端。

## `334456777/WeFlow`

[334456777/WeFlow](https://github.com/334456777/WeFlow) 的公开分支包含 `crates/`、`weflow-native` 和 `weflow-wcdb-ffi` 等 Rust 后端材料，并描述了消息、联系人、朋友圈、媒体、分析和 HTTP/MCP 能力。它的 [native-cli 文档](https://github.com/334456777/WeFlow/blob/main/docs/native-cli.md) 和 [desktop Rust layer 文档](https://github.com/334456777/WeFlow/blob/main/docs/desktop-rust-layer.md) 可用于比较独立原生层的职责。

该仓库同样使用 CC BY-NC-SA 4.0，并明确真实数据验证主要集中在 Windows；README 没有证明 macOS arm64 已通过。因此它只能作为独立参考或后续许可评估对象，不能直接替换当前项目的 Alpha runtime，也不能被当作已验证的 macOS 兼容后端。

## `xunchahaha/alpha-build` 与 Alpha release 仓库

[alpha-build](https://github.com/xunchahaha/alpha-build) 是公开打包仓：它消费 `xunchahaha/alpha` 的版本锁，并在有权限时拉取私有 `alpha-wcdb`、`alpha-xkey`、`alpha-wxproto` 等组件。它本身没有这些组件的源代码，不能闭合本工程的原生编译链。

[alpha-releases](https://github.com/xunchahaha/alpha-releases) 继续提供发行材料和 [HTTP API](https://github.com/xunchahaha/alpha-releases/blob/main/docs/api/http-api.md)、[MCP](https://github.com/xunchahaha/alpha-releases/blob/main/docs/api/mcp.md) 契约。它们可用于补齐接口清单和验收字段，但不包含 Alpha 原生实现或服务端源码。

## 对本工程的处理

相关仓库已经放在工作区外的只读研究目录 `/Users/baoxingzhang/Desktop/temp/research/WeFlow1`，没有导入构建、没有修改许可证声明、没有替换 Alpha runtime。后续若要利用其中的代码，必须先单独确认许可证、署名、非商业和相同方式共享义务，并重新验证 ABI、微信版本、平台和数据安全边界。

