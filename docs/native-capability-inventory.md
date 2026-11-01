# 原生组件能力清单（静态证据）

这份清单从安装包内 `alpha-wcdb.component.json` 固定生成，记录 Alpha 0.3.5 原生数据 host 声明的操作、组件工件和运行保护信息。它用于维护范围和替代实现的排期，不是运行时能力报告。

## 证据边界

- `policies.data-host.operations` 声明了原生 host 的调用名，覆盖账号/联系人/会话/消息、搜索、媒体、朋友圈、收藏、年度统计、分析、写入和授权等域。
- `release_qualified=false`，并且清单给出了 `not_before_utc`、`expires_at_utc`、签名策略和原生镜像封存信息。原包启动时已经观察到完整性策略拒绝，因此这些声明不能直接当作当前机器可调用的 native backend。
- `readonly_provider` 只描述 SQLCipher 只读 ABI；`retention_writer` 默认关闭且 `message_mutations=false`。这两个字段不能推导出消息发送、编辑或完整防撤回功能。
- manifest 里没有 ABI 头文件、完整 JSON schema、SQL 映射和原始 Rust/C/C++ 工程；静态操作名也不能证明真实微信版本兼容性。

逐字段、工件摘要和 SHA-256 见同目录的 [`native-capability-inventory.json`](native-capability-inventory.json)。更完整的原生来源、公开候选和替代路线见 [`native-backend-candidates.md`](native-backend-candidates.md) 与 [`independent-maintenance-native.md`](independent-maintenance-native.md)。

## 对独立后端的约束

独立后端只把已验证的 Node/Go 实现列入 `SUPPORTED`；原生清单中的 `native.list_moments`、`native.list_favorites`、`native.resolve_image_media`、`native.read_voice_blob`、写入/发送和自动密钥等操作，必须在取得可复现 schema、密钥和真实数据验收前保持显式不可用。这样既保留 Alpha 的完整功能待办，也避免用空列表或伪造 token 把“有声明”误报成“已恢复”。
