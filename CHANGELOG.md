# 变更记录

## 0.3.5-recovery — 2026-11-01

- 建立可编辑的 Electron 应用层、协议模块、独立只读数据桥接和快照导入工程。
- 接通离线微信 v4 数据读取、搜索、定位、联系人/群成员查询、导出、分析、计划任务、应用锁和受控本机 HTTP/MCP。
- 保留原包 native runtime 的来源、签名、哈希和许可证边界；原生二进制没有重新编译。
- 增加构建、隔离 smoke、协议、vendor、维护性和恢复源码包检查。
- 增加独立、无文件系统副作用的 DAT 图片解码基础模块；仅接受调用方字节和显式 key，尚未接入媒体定位、Alpha token 或 UI。
- 增加显式媒体索引写入器、独立 alpha-media URI 的有限媒体解析和通用导出任务视图；两者均有边界文档，不声称原生 token、租约或事件日志兼容。
- 明确记录 62/128 协议分支已实现，完整功能 parity 尚未达到；详见 [当前验证](docs/independent-validation-current.json) 和 [缺口清单](docs/source-gaps.md)。
- 将 Electron 从 44.0.0 升级到 44.10.1，消除当前 npm audit 报告的 high 漏洞；升级后重新完成独立构建、197 项测试和桌面 smoke。
- 增加独立后端 128 项请求分支的机器支持矩阵和漂移校验，明确 62 项实现与 66 项 `UNIMPLEMENTED`。

## 后续版本

后续版本应先更新 `provenance/project-metadata.json`、本文件和 [维护范围](MAINTENANCE.md)，再提交可验证的代码与测试。未经证据支持的朋友圈、收藏、媒体解密、写入、自动取钥和云服务能力保持未实现状态。
