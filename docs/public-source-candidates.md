# 公共源码与替代后端候选

检查日期：2026-11-06。本文只记录公开页面中能直接核对的材料，不把第三方项目的功能宣称当成 Alpha 兼容性证明。

## Alpha 官方公开仓库

公开的 [alpha-releases](https://github.com/xunchahaha/alpha-releases) 主要包含发行说明、安装包、HTTP API/MCP 文档和更新材料。其 README 明确说明 0.3.5 大概率是最后一个版本，并列出聊天、导出、分析、朋友圈、AI、媒体、其他资料和高级发送能力等产品范围。该仓库没有 Alpha 的 TypeScript、Rust、C/C++ 原生源码工程。

截至 2026-11-04 的只读审查记录见 [`upstream-alpha-releases-current.json`](upstream-alpha-releases-current.json)。公开仓库 `main` HEAD 为 `09232cbca892241fd3d2046957832a6b4d764ddc`，`v0.3.5` 标签指向 `f4294fe7ba95aab5796c7ed32398c2879add5ca4`；根目录可见内容仍是 README、截图/图标、HTTP API/MCP 文档和 `update/stable.json`，递归树没有 TypeScript、Rust、C/C++、Cargo 或 CMake 源文件。README 的产品清单还明确提到收藏、媒体墙、朋友圈日历、年度/双人报告、AI 总结与分享图、消息防撤回/朋友圈防删除、通知、多账号/自动取钥、发送文字、公众号导出、消息编辑及微信 CDN 媒体补齐。`v0.3.5` 发布说明写明停更公告，媒体补齐目前仅 Windows x64 可用，并给出四个平台安装包的哈希。

该记录也保存了公开 issue 的交叉证据（例如引擎启动 `status -6`、macOS 通讯录、取钥鉴权、推送崩溃及 `SECURITY_RUNTIME_POLICY_REJECTED`）。这些是用户报告或历史闭环问题，不能推出安装包在所有机器上的必现行为，也不能替代源码或授权证明。

[alpha-build](https://github.com/xunchahaha/alpha-build) 的 README 进一步说明它只是公开打包仓：构建流程消费 `xunchahaha/alpha` 中的版本锁，正式组件来自私有的 `alpha-wcdb`、`alpha-xkey`、`alpha-wxproto` 仓库，不 checkout 或编译这些私有源码。因而它不能作为原生源码来源。

当前没有找到可核验的公开 Alpha 原生源码、Cargo/CMake 工程或可直接重建的组件 release。随安装包提取的二进制、manifest、签名和公钥材料仍保留在 [`vendor/runtime`](../vendor/runtime/) 及 [`docs/native-runtime-provenance.json`](native-runtime-provenance.json)；它们只能支撑复用和来源核对，不能补回源码。

2026-11-03 通过 GitHub 仓库搜索 `alpha user:xunchahaha` 复核作者账号的公开仓库清单，结果只有 `xunchahaha/alpha-releases` 与 `xunchahaha/alpha-build`。这次搜索结果只能说明当前公开索引中没有新增 Alpha 源码仓库，不能证明私有、删除或改名的仓库不存在；因此仍不能把 release 仓或打包仓当作原生源码来源。

## WeFlow 及其 fork

公开的 [hicccc77/WeFlow](https://github.com/hicccc77/WeFlow) 当前主分支（2026-11-03 固定为 `91adcfdbb24e8e147d8332440b8c6ac899ad2abf`，package 版本 `5.0.0`）公开了完整的 Electron/TypeScript 应用层和 `docs/third-party-components.md`。当前树没有 `Cargo.toml`、Rust 源文件或 WCDB 实现源码；它把数据库、图片解密和批量导出拆成调用方显式配置的第三方组件。

该组件文档提供了可复核的接口契约：`wcdb_init`/`wcdb_open_account`/`wcdb_close_account`/`wcdb_free_string` 生命周期，消息/联系人/媒体/语音/朋友圈查询以及写入和防删除函数；图片插件通过 `decryptDatNative`，批量导出组件通过 stdin/stdout NDJSON。它们是 WeFlow 自有组件接口，不是 Alpha 的 `_alpha_native_get_api` API 表，也没有给出 Alpha 的数据库 schema、授权或 macOS arm64 行为。

作者账号下的 [xunchahaha/WeFlow](https://github.com/xunchahaha/WeFlow) 当前由 GitHub 按 DMCA 请求限制访问，匿名页面返回 HTTP 451；对应的 [GitHub DMCA 记录](https://github.com/github/dmca/blob/master/2026/07/2026-07-07-wechat.md) 将该仓库列为被处理的 WeFlow 网络的一部分。它不能作为本工程的可复用源码、二进制或依赖来源。该事实不改变对仍公开的 `hicccc77/WeFlow` 的许可证和 ABI 分析，也不证明任何 Alpha 原生组件已经公开。

作者账号的 [xunchahaha/WeFlow1](https://github.com/xunchahaha/WeFlow1) fork 当前固定为 `916b7c2c57d81de02d3b3f965f7c84bfa6bc7c73`，随仓库带有一个预编译的 `resources/wcdb/macos/universal/libwcdb_api.dylib`。该文件实际是 arm64 Mach-O，SHA-256 为 `e6b52eb896f0fa4eb337b338a5a2ad477880832d7fbb60a7175ee5e2a5042429`，导出 `wcdb_*` 符号并依赖 `WCDB.framework`；它没有 Alpha 导出的 `_alpha_native_get_api`，不能直接替换 Alpha runtime。该二进制也不包含可重建的源代码或头文件。

两个仓库的 [`LICENSE`](https://github.com/hicccc77/WeFlow/blob/main/LICENSE) 是 CC BY-NC-SA 4.0。该许可允许非商业复制和改编，但要求署名、相同方式共享，并限制商业用途。当前 Alpha 恢复工程没有把 WeFlow 代码、二进制或依赖引入，也没有把它当作 Alpha 后端替代品。若将来考虑做可选适配，必须单独完成许可证兼容性评估、来源锁定、ABI/数据语义对照和 macOS arm64 验证，并保持显式路径配置和 fail-closed 错误边界。

## 对原包问题的公开交叉证据

- Alpha issue [#29](https://github.com/xunchahaha/alpha-releases/issues/29) 记录了完整安装包、组件哈希全部匹配，且仍出现 `KEY_PROVIDER_AUTH_FAILED` 的情况；报告日期处于组件 manifest 的有效期内，没有公开的源码修复或更细错误码。
- Alpha issue [#32](https://github.com/xunchahaha/alpha-releases/issues/32) 记录 macOS 0.3.5 的通讯录目录请求出现 `NATIVE_QUERY_RESULT_TOO_LARGE`，并有 Windows 用户报告相同问题。这与本项目独立后端采用有界分页和错误显式化的方向一致，但不能证明两者行为完全相同。

这些 issue 是公开问题报告，不是 Alpha 内部实现或授权状态的完整证明。它们只用于解释为什么本项目保留原始 runtime，同时建设自有只读后端和独立错误边界。

## 维护决策

1. 保留恢复的 Alpha 应用层、协议、页面和原生 provenance。
2. 对没有真实 schema 或响应样本的领域继续 fail-closed，不从 WeFlow 的接口名称猜测 Alpha 数据库结构。
3. 将 WeFlow 作为研究和对照材料；只有在得到明确许可并完成 ABI/数据/平台验证后，才评估隔离适配，不直接复制到本项目。
4. 后续若获得用户授权的脱敏数据 fixture、Alpha 原生请求/响应捕获或作者公开源码，再逐项扩大独立后端覆盖范围。

