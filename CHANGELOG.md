# 变更记录

## 0.3.5-recovery — 2026-11-01

- 建立可编辑的 Electron 应用层、协议模块、独立只读数据桥接和快照导入工程。
- 接通离线微信 v4 数据读取、搜索、定位、联系人/群成员查询、导出、分析、计划任务、应用锁和受控本机 HTTP/MCP。
- 保留原包 native runtime 的来源、签名、哈希和许可证边界；原生二进制没有重新编译。
- 增加构建、隔离 smoke、协议、vendor、维护性和恢复源码包检查。
- 增加独立、无文件系统副作用的 DAT 图片解码基础模块；仅接受调用方字节和显式 key，尚未接入媒体定位、Alpha token 或 UI。
- 增加显式媒体索引写入器、独立 alpha-media URI 的有限媒体解析和通用导出任务视图；两者均有边界文档，不声称原生 token、租约或事件日志兼容。
- 初始恢复 checkpoint 记录 68/128 个协议分支已实现；该数字属于历史记录，当前支持矩阵见 [当前验证](docs/independent-validation-current.json) 和 [缺口清单](docs/source-gaps.md)。
- 将 Electron 从 44.0.0 升级到 44.10.1，消除当前 npm audit 报告的 high 漏洞；升级后重新完成独立构建、207 项测试和桌面 smoke。
- 增加独立后端 128 项请求分支的机器支持矩阵和漂移校验；当时的 68 项实现与 60 项 `UNIMPLEMENTED` 保留为历史 checkpoint。
- 用 Electron 44.10.1 生成未签名的 macOS arm64 `Alpha Recovered.app`，并记录 packaged 独立资源清单。
- 增加明确的 `Alpha Recovered Independent.app/.dmg` 打包 flavor；包内 `alpha-backend-mode.json` 选择自有独立后端，普通 `Alpha Recovered.app` 保留原生 backend marker。
- 增加 `verify:packaged-markers`，在维护检查和 CI 中核对两个 flavor 的 marker、manifest 与 Bundle ID。

## 0.3.5-recovery 维护增补 — 2026-11-02

- 历史 checkpoint 曾记录独立引擎 69/128、71/128 和 72/128 个请求分支；这些数字保留为历史记录。该 2026-11-02 checkpoint 当时的支持矩阵为 73/128，剩余 55 个明确返回 `UNIMPLEMENTED`。
- 增加仅面向显式 `favorite.db`/`favorites.db`/`__alpha_favorites_v1` synthetic fixture 的 `listFavorites` 只读能力，支持分页、类型/关键字/标签过滤和类型计数；同时接入只读 HTTP `/api/v1/favorites` 与 MCP `alpha-independent.favorites.list_items`。在同一 fixture 提供 `__alpha_favorite_media_v1` 和自有 `media-index.v1.json` 时，另支持 synthetic 媒体槽位/解析；真实收藏库 schema、原生媒体语义和 UI 仍不可用。
- 增加 `audit:upstream` 可重复审计命令，按需核对上游仓库 HEAD、release 资产、公开文件树、更新策略/README 哈希和本地 DMG；默认只读，写回 provenance 需要显式 `--write`。
- 独立 packaged flavor 新增 `alpha-update-mode.json`，默认关闭原作者更新源；只有维护者配置自有签名策略后才允许启用更新。
- 增加合成 `__alpha_voice_playback_v1` 到自有 WAV media-index 的语音播放解析，并通过独立 HTTP/MCP 适配器暴露；真实 VoiceInfo/SILK/native media cache 仍未恢复。
- 该 2026-11-02 checkpoint 的独立 MCP 适配器为 45 个工具、协议支持矩阵为 72/128、完整回归为 233/233；随后 checkpoint 的适配器声明 58 个工具、支持矩阵为 73/128、完整回归为 241/241。新增 `alpha-independent.media.probe`，只读取显式 v4 媒体库元数据并保持 metadata-only/native-schema 边界；消息显示新增 App.Type=57 的引用消息浅层投影；独立媒体墙对未绑定媒体保持 metadata-only，并保留已验证本地图片索引的预览；新增 `verify:release-manifest`，发布前会重算产物文件哈希、大小、权限和 artifactDigest。
- 增加 `prepare:public-source` 候选流程：复制到调用方指定的源仓库外新目录，默认筛选生成目录和私有 REA/Ghidra 证据，并以严格公开审计生成脱敏 report/manifest；审计失败关闭且不改写原始 evidence。通过仅表示进入许可证与人工审核阶段，不代表当前树已经可以公开发布。

## 0.3.5-recovery 维护增补 — 2026-11-03

- 该 checkpoint 的独立协议支持矩阵为 74/128，剩余 54 个请求分支明确返回 `UNIMPLEMENTED`；校验来源为当时生成的 `docs/independent-support-matrix.json`。
- 该 checkpoint 的本机 HTTP/MCP 适配器由 `toolDefinitions()` 声明 60 个工具，工具存在不代表原生 schema、真实数据或写入能力已恢复。
- CI 维护基线继续要求普通与独立 packaged app、独立 Electron smoke、原生 smoke、依赖/API/public-release 审计、发布清单和恢复源码包检查；原生 smoke 仍单独记录完整性错误，不能改写为 ready。

## 0.3.5-recovery 维护增补 — 2026-11-03（后续）

- 当前独立协议支持矩阵为 75/128，完整回归为 256/256；新增的离线 SQLite schema 诊断只面向调用方已选副本，固定标记 `complete=false`、`native_schema_supported=false`，不把 schema 盘点计入 Alpha 协议支持矩阵。
- 增加 `audit:native-abi`，只读核对随包两个 arm64 WCDB dylib 的来源哈希、权限、Mach-O 架构、代码签名、系统依赖和已知导出，不调用未知函数表、不访问账号目录。
- 公开候选导出默认隔离机器生成的运行/构建/原生 provenance 证据，并把维护文档中的本机路径改为公开占位符；实测候选为 652 个文件、0 个 public-release audit findings，状态为 `ready-for-license-and-review`。
- 上游来源审计继续确认公开仓库没有 Alpha 原生源码；被 GitHub DMCA 限制访问的 WeFlow fork 不作为源码、二进制或依赖来源，仍公开的 WeFlow 只作许可证和 ABI 对照材料。

## 0.3.5-recovery 维护增补 — 2026-11-03（当前）

- 独立支持矩阵更新为 82/128；新增显式数据源诊断、合成/候选媒体边界、VoiceInfo 原始字节候选读取和 packaged independent smoke 证据。候选读取仍标记 `complete=false`、`native_schema_supported=false`，不解码 SILK、不生成原生媒体 token。
- 完成独立 App 从生成的 Electron bundle 实际启动、renderer → preload → main IPC 读取合成副本和媒体索引的验证；普通原生 flavor 与独立 flavor 继续分开记录。
- 新增 `npm run verify:maintenance` 只读聚合入口，顺序校验项目元数据、维护性、协议绑定、原包 vendor、独立支持矩阵和 HTTP/MCP API 结构；它不构建 App、不读取用户数据，也不扩大原生能力边界。
- 当前完整回归为 288/288；新增独立 Go 构建的项目级原子锁，避免并行构建覆盖共享临时目录和验证报告；发布清单校验现在拒绝与当前 `package.json` 版本不一致的旧清单。原生授权、自动取钥、真实微信媒体/朋友圈/收藏 schema、写入能力和云服务仍保持明确未恢复状态。
- 项目版本、macOS bundle 版本、启动页、日志和更新状态统一读取 `package.json`/Electron runtime；构建证据和 App manifest 记录实际安装的 Electron/esbuild 版本，避免维护者升级项目后出现版本漂移。
- 恢复源码包 manifest 增加项目身份和 `package-lock.json` SHA-256，归档可以追溯到具体依赖锁定状态；归档内容和重复构建校验保持不变。
- 新增只读 `npm run status`，从当前支持矩阵、原生 smoke 诊断和组件 manifest 生成独立完成度与剩余缺口分类；纳入 `verify:maintenance`，并以测试锁定 82/128、原生完整性错误和真实数据未验证边界。

## 后续版本

后续版本应先更新 `provenance/project-metadata.json`、本文件和 [维护范围](MAINTENANCE.md)，再提交可验证的代码与测试。未经证据支持的真实朋友圈、真实收藏库/媒体解密、写入、自动取钥和云服务能力保持未实现状态；synthetic favorites 仅限显式 fixture 的 listFavorites 读取。
