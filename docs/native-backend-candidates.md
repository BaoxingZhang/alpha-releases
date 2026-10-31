# macOS 原生数据后端候选：有限源码核查

核查日期：2026-11-01。候选筛选通过 GitHub 连接器只读检查两个仓库的元数据、完整文件树、许可证和关键源码。随后主工程将固定 Chatlog 提交作为子模块引入，使用项目内 Go 工具链实际编译通过，详见 [候选构建记录](chatlog-build.md)。没有启动候选程序、获取密钥或修改 SIP；静态源码范围和构建结果不能代替真实数据验收。

**建议把 `imldy/chatlog` 的固定历史提交作为 Alpha 兼容数据后端的候选起点。** 它保留可编译工程材料、真实 macOS 微信 4 数据库解密/查询/媒体代码及 Apache 2.0 许可证，来源能追溯到 `sjzar/chatlog`。它不是完整 Alpha 替代品，也没有证明能处理当前用户的微信版本。第二个候选 `sbgayhub/wechat_decrypt_go` 不适合当前目标：没有可见许可证，实际实现面向 Windows，与仓库简介的跨平台说法不一致。

## 1. 候选比较

| 项目 | 固定提交与来源 | 真实源码/许可 | macOS arm64 判断 | 处置建议 |
| --- | --- | --- | --- | --- |
| [imldy/chatlog](https://github.com/imldy/chatlog/tree/a7162bca9454fa43b5950a2414670983fe180e56) | `a7162bca9454fa43b5950a2414670983fe180e56`，2025-10-14；GitHub 元数据确认 `fork=true`，`parent` 和 `source` 均为 `sjzar/chatlog`；Go module 仍为原上游路径 | 完整树 208 项、131 个 `.go`；有 go.mod/go.sum、构建脚本、macOS 解密/取密钥实现、数据库查询、媒体处理和 protobuf；[LICENSE](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/LICENSE) 为 Apache 2.0 | Makefile 和 GoReleaser 明确 darwin/arm64；源码有 macOS v4 分支。随后本机源码编译通过，真实兼容性未验证 | 已固定引入并编译；下一步验证合成样本、编写 Alpha adapter |
| [sbgayhub/wechat_decrypt_go](https://github.com/sbgayhub/wechat_decrypt_go/tree/d848a5c509218e030a4257e6701b2df5818968eb) | `d848a5c509218e030a4257e6701b2df5818968eb`，2026-04-28；唯一 initial 提交，GitHub 未标为 fork | 有 Go 数据库/媒体/MCP 代码，但完整树无 LICENSE/COPYING/NOTICE，仓库 license 元数据为 null；未核实它与其提及的 Python 原项目的许可关系 | README 明确 Windows 10/11；实际代码导入 `golang.org/x/sys/windows`，没有发现对应 darwin 实现 | 不作为本轮源码复用或 macOS 构建基础；不能以公开可读推定获得复用许可 |

这两个候选的完整递归树均返回 `truncated=false`。不把搜索排名、仓库简介、体积或 release 可下载等同于真实源码可用。

## 2. Chatlog 的数据库链路确实有代码

### 解密、解析与查询

[internal/wechat/decrypt/darwin/v4.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechat/decrypt/darwin/v4.go#L19) 包含 macOS v4 的页大小、密钥派生、校验和逐页解密实现；共同的 AES/HMAC/文件读取逻辑在 [common.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechat/decrypt/common/common.go)。它是实际 Go 实现，不是调用一个未公开的解密 dylib。

[datasource.go:39](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechatdb/datasource/datasource.go#L39) 将 `darwin + version 4` 路由到共享 v4 数据源。[v4/datasource.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechatdb/datasource/v4/datasource.go#L184) 真实实现了消息分库查询、时间范围、联系人、群聊、会话和媒体定位；消息查询包含 `Msg_*`、`Name2Id` 等表映射，关键词在已取出的消息中做正则过滤。[message_v4.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/model/message_v4.go) 包含消息结构、zstd 和 packed protobuf 处理。因此可以复用/适配其已知 schema 经验，但搜索性能、游标和 ID 语义仍需对齐 Alpha，不能直接宣布协议兼容。

它采用“读取加密文件 → 在 work dir 写出解密副本 → 查询普通 SQLite”的链路。[service.go:146](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/chatlog/wechat/service.go#L146) 写入 `.tmp` 后改名；自动解密通过文件监测触发。Alpha 的 manifest 则声明 SQLCipher live readonly provider，二者不是同一种实时读取架构。副本产生时机、WAL/并发写入、更新一致性、明文副本生命周期和磁盘占用均需单独实现/验证。

另外，[dbm.go:114](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechatdb/datasource/dbm/dbm.go#L114) 使用普通 `sql.Open("sqlite3", tempPath)`，没有显式只读 DSN。即使主要查询是 SELECT，也不能把该实现自动认定为操作系统层面只读。用于 Alpha 时，应明确源目录只读、工作目录独立、数据库连接只读，并在取消/解密失败时避免把未完成的副本当成有效数据。

### 密钥来源和 SIP

这是“有实现但限制明显”的部分。[darwin/v4.go:55](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechat/key/darwin/v4.go#L55) 的自动提取器先检查 SIP，未关闭则返回 `ErrSIPEnabled`；[glance.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/wechat/key/darwin/glance/glance.go#L230) 使用 LLDB 读取指定进程内存。它不是一个已证明可在保持 SIP 开启时自动工作的方案。

[README:21](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/README.md#L21) 仅声明自动获取数据库/图片密钥支持 `macOS WeChat < 4.0.3.80`。这是该历史版本的声明范围，不能据此承诺当前微信版本可用。源码还有输出密钥的 debug 日志路径（同一 extractor 的 `:183`、`:197`、`:271`、`:342`），实际集成时必须移除敏感日志，不能直接用于常驻服务。

密钥获取与数据库解密可以分离。[cmd_decrypt.go:14](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/cmd/chatlog/cmd_decrypt.go#L14) 接受外部指定的平台、数据库版本、data key 和输入/工作目录；解密函数直接接收密钥。因此有合理的首阶段路线：用用户已合法持有的密钥和授权数据库副本验证读取，保持系统安全设置原状。本项目应用层应通过本地受保护输入/存储传递密钥，不要求用户在聊天中提供密钥，也不把命令行明文参数作为正式凭据方案。自动获取仍需独立工程与明确授权，不因已有源码就默认执行。

### 媒体、服务和依赖

| 能力 | 实际来源 | 可用判断与限制 |
| --- | --- | --- |
| 图片 DAT | [dat2img.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/pkg/util/dat2img/dat2img.go) | 有旧 XOR 和 v4 AES/XOR 处理及图片 key 设置；代码中的默认值/FIXME、不同版本格式与真实 key 仍需样本验证 |
| WXGF/动画 | [wxgf.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/pkg/util/dat2img/wxgf.go) | 有分区、HEVC/MP4 处理和 FFmpeg 转换分支；不是只有文件扩展名判断。部分转换依赖外部 FFmpeg，不能仅由 Go 编译成功证明完整媒体可用 |
| 语音 | [silk.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/pkg/util/silk/silk.go) | 调用 go-silk 与 go-lame 的 CGo 包；是解码/编码，不是语音识别 |
| HTTP/MCP | [route.go](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/internal/chatlog/http/route.go#L47) | 有 chatlog/contact/chatroom/session、图片/视频/文件/语音和 MCP 路由。它的协议、权限和文件访问规则不能直接代替 Alpha 的 Bearer token、媒体 grant 和操作白名单 |
| 生成代码 | `internal/model/wxproto/{bytesextra,packedinfo,roomdata}.pb.go` 及对应 `.proto` 已在仓库中 | 现有源码构建无需先取得私有 protobuf 工程或另行生成这三个文件；修改协议后的生成工具仍需固定版本 |

`go.mod` 固定 `github.com/mattn/go-sqlite3 v1.14.32`、`github.com/sjzar/go-lame v0.0.9`、`github.com/sjzar/go-silk v0.0.1` 等依赖。本次也确认后二者指定 tag 仍公开，分别有内嵌 C/C 头文件树和 `import "C"` 的封装。后续项目内首次下载依赖并启用 CGo 编译已通过，没有引入作者的封闭 dylib。实际使用的模块、摘要和工具链见构建记录；全部依赖的代码审计、跨机器复现及媒体运行仍未完成。

许可证必须按实际文件保存：Chatlog 根为 Apache 2.0；go-lame 根有 MIT 风格许可，但其 [clame/encoder.c](https://github.com/sjzar/go-lame/blob/v0.0.9/clame/encoder.c#L1) 明确带 GNU Library GPL v2 或后续版本条款；go-silk 根为 MIT，但其 [SILK C 源文件](https://github.com/sjzar/go-silk/blob/v0.0.1/csilk/SKP_Silk_CNG.c#L1) 带 Skype 的再分发及专利声明。不能把整个产物统一标成 Apache/MIT；发布时需要逐依赖核对和履行适用条款。

## 3. 最小构建准备

[go.mod:3](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/go.mod#L3) 要求 Go 1.24.0；[Makefile:42](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/Makefile#L42) 的单独 build 目标启用 CGo，编译 `main.go`。darwin/arm64 列在 Makefile 和 [.goreleaser.yaml:29](https://github.com/imldy/chatlog/blob/a7162bca9454fa43b5950a2414670983fe180e56/.goreleaser.yaml#L29)。本机 Apple Silicon 构建需 Go 和可用的 C 编译器/SDK；GoReleaser 中的交叉编译器名称不是本机构建必须安装的程序。

在固定提交的源码根目录，最小构建命令的形态如下；本工程实际采用下一节构建说明中的脚本，额外固定缓存、工具链及 `-mod=readonly`：

```sh
CGO_ENABLED=1 go build -trimpath -o ./bin/chatlog-candidate main.go
```

只编译不需要运行 `key`、`dumpmemory`、`server` 或默认 TUI，也不需要更改 SIP。不要直接执行 `make all`，它还会清理、tidy、lint 和运行测试；不要照搬 README 中指向已变化上游的 `go install github.com/sjzar/chatlog@latest`。固定 fork 提交、保留 `go.sum`、记录工具链/依赖与输出哈希，才能知道本地构建使用的实际材料。

引入后需明确标注为候选源码：与 `src/` 的 Alpha 发布 JS 和 `vendor/runtime/` 的原厂二进制分开记录，不能直接覆盖同名 `alpha-engine` 或宣称已经完成后端替换。

## 4. 第二候选为何不选

`sbgayhub/wechat_decrypt_go` 的仓库简介声称多平台，但 [README:3](https://github.com/sbgayhub/wechat_decrypt_go/blob/d848a5c509218e030a4257e6701b2df5818968eb/README.md#L3) 自称 Windows 工具，系统要求也是 Windows 10/11。[keys/keyscan.go:19](https://github.com/sbgayhub/wechat_decrypt_go/blob/d848a5c509218e030a4257e6701b2df5818968eb/keys/keyscan.go#L19) 直接依赖 `winproc` 和 `golang.org/x/sys/windows`；[winproc.go](https://github.com/sbgayhub/wechat_decrypt_go/blob/d848a5c509218e030a4257e6701b2df5818968eb/winproc/winproc.go) 使用 Windows 进程 API。完整树没有匹配的 darwin 实现或明确许可文件。因此没有证据支持将它选为本次 macOS arm64 可复用后端，本文不继续扩展第三个候选。

## 5. 与完整 Alpha 仍有多大距离

Chatlog 的已验证优势集中在底层读取、部分数据结构和媒体处理。它不提供 Alpha 的 Engine protobuf 兼容服务，也没有由本次源码检查证明完整覆盖以下模块：

- Alpha 的账户/锁/凭据生命周期、opaque cursor、原始消息定位 token、跨账号缓存及媒体授权。
- 朋友圈、收藏、其他资料的完整语义；年度/双人报告、画像、关系旅程等全部算法与展示契约。
- Alpha 全格式导出、任务恢复、定时任务和增量策略。
- Alpha AI gateway、长期记忆、工具审批、模型设置和运行恢复；MCP 的存在不代表这些能力已经有了。
- 本地 ASR、微信 CDN 补齐、公众号导出、发送、消息编辑/恢复、防撤回/防删除；这些不能作为普通读取扩展自动开启。

因此建议采用“保留 Alpha UI → 自有 adapter → 固定 Chatlog 读取/媒体模块 → 逐项补齐功能”的路线。先实现明确的 capability 清单和错误语义，复用 Alpha 已恢复的 DTO/接口，按 [完整维护方案](independent-maintenance-native.md) 保留所有目标功能的待办和验收状态。

验收应依次分开记录：候选 Go 源码能编译；合成加密库与已知密钥能读；用户授权副本在指定微信版本下能读且数据一致；接入 Alpha 页面/搜索/媒体；补齐全部业务能力。真实账号访问、进程密钥获取、联网 AI、写入和发送各按对应授权范围处理。候选构建成功只完成其中第一项，不能据此称完整 Alpha 已可独立运行。
