# 群成员导出接手记录

独立引擎现在实现协议字段 `exportGroupMembers`（139）。它读取已验证的 `chat_room.ext_buffer` RoomData，再通过 `listGeneral` 保留真实成员字段：用户名、群昵称、联系人昵称、备注、别名和 `isOwner`。

支持 CSV、JSON、HTML 和一个依赖无关的 XLSX/OOXML 导出。XLSX 使用单工作表、内联字符串和 ZIP Store 归档，输出限制为最多 5000 名成员和 64 MiB；这是有效的表格文件格式，不包含头像或未知群资料。输出使用现有安全路径检查：不允许写入数据源、状态目录、符号链接或已有文件，并在原子发布前重新检查锁和路径。

导出范围只覆盖当前可解析的 RoomData。群公告、管理员扩展资料、头像和未取得 schema 证据的成员字段仍保持不可用；没有成员或缺少 `chat_room` 表时会返回明确错误，不返回伪造的空成功结果。

验证使用合成微信 v4 SQLite fixture，经 Node stdio → protobuf → Go bridge，检查四种格式、成员条数、XLSX ZIP/worksheet 内容、XLSX 以外的格式拒绝以及路径边界。未读取真实微信目录，也未修改聊天数据库。
