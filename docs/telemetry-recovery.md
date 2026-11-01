# 遥测协议的独立实现边界

Alpha 的 `EngineClientFrame` 有三个遥测请求：`getTelemetryStatus`（field 21）、`setTelemetryConsent`（field 22）和 `flushTelemetry`（field 23）。恢复的主进程还保留了对应 IPC channel 和状态映射，但 DMG 中没有可复用的遥测服务端、事件队列或上传协议；`docs/backend-compatibility-map.json` 因此仍把原生兼容标记为缺失。

独立引擎实现了这三个协议分支，目的是保存用户选择并给出可验证的停用状态：

- `setTelemetryConsent` 只接受 `granted` 或 `revoked`，分类去重且限制长度，版本缺省为 `telemetry-v1`。它在 stateDir 以 0600 权限原子写入 `telemetry-consent.v1.json`，文件包含版本、选择、分类和同意版本；不会把同意内容写入日志、数据副本或子进程环境。
- `getTelemetryStatus` 从该文件读取并校验版本、权限和字段。初始状态为 `configured=false`；配置后保留选择和分类，队列条数/字节数/下一次尝试时间均为 0。`granted` 会带 `lastErrorCode=INDEPENDENT_TELEMETRY_DISABLED`，明确表示本地后端没有发送能力。
- `flushTelemetry` 始终返回 `outcome=disabled`，所有计数和下一次尝试时间为 0。它不联网、不删除或伪造事件、不声称上传成功。撤销同意也不会产生待发送队列。

三个分支均受独立应用锁保护，锁定时返回 `APP_LOCK_LOCKED`。状态文件损坏、权限过宽、符号链接或未知字段值会失败关闭为 `TELEMETRY_STATE_INVALID`；进程重启会重新读取并验证状态。该实现完成的是本地同意状态管理，不代表 Alpha 原遥测服务、端点、事件 schema、重试调度或上传行为已恢复。
