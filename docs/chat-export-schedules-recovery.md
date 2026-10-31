# 独立聊天导出计划接手记录

独立引擎现已接通聊天导出计划及历史记录字段 89–98。计划存储在 `stateDir/chat-export-schedules.v1.json`，通过原子替换保存，支持按账号隔离、创建/替换的乐观并发检查、读取、删除、显式 `runChatExportScheduleNow`、运行/准备记录查询和失败尝试重试。重启后可以读回计划与已落盘的记录。

执行 runner 复用已经验证的单次会话导出路径，只允许一个 JSON、Markdown、HTML 或 TXT 格式，且不包含媒体、消息类型筛选、媒体种类筛选、头像、XLSX 或语音转写。输出目录必须是绝对路径；计划和历史状态损坏、账号不匹配、未知格式或未验证选项都会 fail-closed。

当前恢复范围包含 bounded 后台定时器：按到期时间触发独立文本导出，单次最多准备 16 个计划；进程重启后最多补一条到期 run，避免离线期间无限重放。`runChatExportScheduleNow` 仍支持显式的一次执行请求；计划中的 `nextRunUnixMs`、间隔、终止时间和最大成功次数会被保存。正在执行的独立导出在引擎关闭前等待其任务结束，不会写入聊天数据库或媒体文件。失败仍需手工 retry，完整 Alpha 调度冲突语义尚未复原。

验证只使用合成 SQLite 和临时输出目录：

```sh
node --test tests/schedule-export.test.mjs
```
