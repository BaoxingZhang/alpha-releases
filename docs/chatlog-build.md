# Chatlog 候选源码构建记录

2026-11-01，本机已成功从固定 Chatlog 源码编译出 macOS arm64 可执行文件。**这完成了候选数据层的源码构建验证，尚未替换 Alpha engine，也未证明真实微信数据可读。**

| 项目 | 实际结果 |
| --- | --- |
| 源码 | `vendor/chatlog`，`imldy/chatlog` 提交 `a7162bca9454fa43b5950a2414670983fe180e56` |
| Go 工具链 | 官方 Go 1.24.13 darwin/arm64，安装在项目 `.runtime/toolchains/go1.24.13` |
| 工具链校验 | 官方 tar.gz 大小 76,442,495 字节，SHA-256 与 `provenance/go-toolchain.json` 一致后才解压 |
| 构建 | `CGO_ENABLED=1`、`GOTOOLCHAIN=local`、`go build -mod=readonly -trimpath`；本机 Apple Clang/SDK |
| 隔离 | `GOCACHE`、`GOMODCACHE`、`GOPATH`、`GOTMPDIR` 均位于项目 `.runtime/chatlog-go/`；关闭 Go 用户配置读取；未改变系统 PATH、HOME 或 SIP |
| 产物 | `build/candidates/chatlog`，Mach-O 64-bit arm64，41,953,346 字节 |
| 产物 SHA-256 | `f9c8ac5c137e2da0b05283b7fb1f21ee57fbf996388cb2675001cee0ae82c92a` |
| 源码/依赖锁 | 子模块工作区未修改，go.mod/go.sum 构建前后 SHA-256 相同；没有 `go get @latest` 或 `go mod tidy` |
| 动态链接 | `file`/`otool` 确认 arm64，列出的动态依赖只有系统库/框架；并未加载 Alpha 原厂 dylib |
| 运行 | 没有启动候选的 TUI、key、dumpmemory、server 或其他功能，没有访问用户微信数据/进程 |

在工程根目录可重复构建：

```sh
node scripts/build-chatlog.mjs
```

该脚本先调用 [setup-go.mjs](../scripts/setup-go.mjs) 校验或安装固定工具链，再以 [build-chatlog.mjs](../scripts/build-chatlog.mjs) 编译、检查产物、检查源码是否变化并保存报告。工具链使用项目文件中的固定版本/摘要；已验证安装可复用，缺失时下载到项目目录。不会写用户 Go 配置或修改候选源码。

机器结果见 [chatlog-build-results.json](chatlog-build-results.json)，模块构建信息见 [chatlog-build-info.txt](chatlog-build-info.txt)，完整构建日志见 [chatlog-build.log](chatlog-build.log)。报告中的 `candidateExecuted=false` 与编译通过分别记录。

已保存实际编译相关的 57 个源码模块（包含候选主模块）的 70 个独立许可文件，另保存 LAME 与 SILK 的内嵌 C 源文件声明；索引与逐文件哈希见 [chatlog-dependency-licenses.json](chatlog-dependency-licenses.json)，正文位于 `docs/chatlog-licenses/`。Chatlog 根为 Apache 2.0；LAME 内嵌代码及 SILK 原始代码还有各自条款，不能只引用 Go wrapper 的根许可证。许可清单不是对全部依赖的法律结论或代码审计。

剩余工作包括 Alpha DTO/分页/媒体授权适配、数据库副本与实时一致性、已授权样本验收、现代微信版本兼容，以及朋友圈/收藏/导出/统计/AI/写入等完整功能补齐。Chatlog 原自动 macOS 取密钥实现要求 SIP 状态变化，本次没有使用，也没有提供自动更改系统安全设置的脚本。后续边界见 [候选源码评估](native-backend-candidates.md) 和 [全功能维护方案](independent-maintenance-native.md)。
