# 独立聊天导出任务接手记录

独立引擎现已接通恢复协议中的聊天导出任务字段 121–125：

- `getChatExportCapabilities` 宣布最多 500 个会话；独立模式的格式策略允许 JSON、Markdown、HTML、TXT 和 XLSX。媒体、消息类型筛选、头像、语音转写和 CDN 补齐明确不可用。
- `startChatExport` 创建任务并按会话顺序调用已经验证的 `exportConversation`。每个会话输出到调用者提供的目录，文件名包含安全化的会话标识和稳定摘要；格式可选 JSON、Markdown、HTML、TXT 或 XLSX。XLSX 输出为单个 `Messages` 工作表，使用已验证消息 DTO 的固定列，不接受自定义列。
- `listChatExports`、`watchChatExport` 和 `cancelChatExport` 返回任务状态、每个会话的消息计数、输出路径和错误码。

任务历史现在原子保存到独立 `stateDir/chat-export-jobs.v1.json`，保留终态任务及每个会话的计数、路径和错误码。进程退出时若任务仍在执行，重启后会将其转换为明确的 `CHAT_EXPORT_PROCESS_RESTARTED` 失败记录，避免伪造继续执行或永久 running；当前实现不自动重跑，用户可依据记录手工重新发起。取消会在当前会话的单次只读导出结束后停止后续会话；不会中断已经发布的文件。仍没有覆盖策略或媒体复制。HTML 单次导出使用 CSP 和 HTML 转义，不嵌入媒体或执行脚本。输出路径仍由单次导出的源目录、状态目录、符号链接和“不得覆盖已有文件”检查保护。

验证使用合成 SQLite 数据，经 Node stdio → protobuf → Go bridge 读取；任务生成的 JSON 与单次导出条数一致。没有连接真实微信目录、读取本地媒体、获取 CDN 登录态或写入聊天数据库。
