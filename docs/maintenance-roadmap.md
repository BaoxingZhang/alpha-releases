# Alpha 独立维护路线图

这份路线图把“从安装包恢复了什么”和“还需要哪些外部条件”分开。它服务于长期维护目标，不把合成 fixture、协议字段或启动画面当成功能完成证据。

## 当前基线

当前分支 `recovery/main` 已能在 macOS arm64 从本项目源码构建独立 flavor，并通过 Electron renderer → preload → main → Go bridge → SQLite 的离线读取链路。独立协议支持矩阵为 **82/128**；完整回归为 **380/380**，packaged independent smoke 已通过。独立 stateDir 核心备份/恢复回归为 7/7，CLI 进程回归为 2/2；Chatlog candidate 预览回归为 5/5，真实 source inspection CLI 回归为 2/2，并通过真实 arm64 Chatlog candidate 对合成 v4 SQLite 的联系人、会话、消息 smoke。新机器 doctor 回归为 3/3。快照、数据库 key、密码锁验证器和运行时凭据明确排除。原始 flavor 在临时 HOME/TMP、无项目 Seatbelt wrapper 的 disposable smoke 中能完成 `engine` 与 `native-host` 握手，但没有真实账号数据。

当前可交付的是可维护的独立离线读取版，包含会话、消息、联系人、搜索、只读导出、合成数据边界、媒体 metadata/index、任务调度、HTTP/MCP 和 Codex stdio 接入。原生源码、真实微信数据、写入/发送、真实媒体解码、AI 服务和授权服务仍未恢复。

## 下一阶段的验收顺序

| 阶段 | 目标 | 必须具备的证据 | 通过条件 |
| --- | --- | --- | --- |
| A. 独立只读稳定性 | 继续维护当前离线后端和 UI | `npm test`、`npm run test:independent`、packaged smoke、支持矩阵、release manifest | 每次变更都有可重复测试；失败时保持 fail-closed；不污染真实数据 |
| B. 授权真实数据接入 | 读取指定版本的脱敏微信副本 | 用户明确授权的数据副本、`npm run preflight:v4` 的 schema/source 报告、对应 schema/密钥来源、账号和源快照证据 | 先区分 `ready` 与 `schema-only`，再对联系人、会话、消息数量/排序/字段做抽样对账；不自动扫描用户目录，不写回原库 |
| C. 真实媒体链路 | 图片、文件、语音、视频的定位和解码 | 每种格式的授权样本、密钥生命周期、路径/哈希/容器证据 | 能在账号/消息绑定下播放或导出；缺失、损坏、越权和错误密钥均有明确失败结果 |
| D. AI 与外部服务 | gateway、模型、记忆、审批和 MCP 的可维护替代实现 | 用户选择的 provider、凭据边界、可重复的本地/远端测试 | 流式、取消、重试、重启恢复、账号隔离和工具审批均可验证；默认仍不联网 |
| E. 写入与实时能力 | 捕获、发送、编辑、防撤回、防删除和公众号执行 | 合法 writer/capture ABI 或自研协议、可回滚副本、事务和确认语义 | 只在隔离副本先验收幂等、回滚、并发和失败恢复；真实发送需单独授权 |
| F. 自主发行 | 不依赖作者签发更新的长期发布 | 自有许可证、签名/公证身份、版本迁移和发布密钥 | 干净 macOS arm64 环境可从本项目构建、升级、回滚并验证 manifest |

## 已确认的阻塞项

以下 46 个请求分支目前没有足够证据安全实现，保持 `UNIMPLEMENTED` 或独立边界错误：

- License 激活/刷新/注销：缺少原作者 entitlement 服务和签发状态。
- 语音转写：安装包只有模型目录清单，缺 worker、ASR runtime 和权重。
- 实时捕获、发送、编辑、资源维护：缺 live WeChat session、writer ABI、事务和发送确认。
- 原生锁 provision/reset/账户密钥：缺 native vault、系统安全 provider 和 key lifetime 语义。
- 公众号/官方计划执行：缺联网文章、媒体、job record 和授权服务。
- Persona、高级组件和 CDN：缺设备密钥、授权、下载服务或原生 media token。

证据清单见 [native-capability-blockers.json](native-capability-blockers.json)、[source-gaps.md](source-gaps.md) 和 [independent-backend.md](independent-backend.md)。这些阻塞项不能通过返回空数组、静态 ready 或 synthetic receipt 绕过。

## 每次迭代的交付门槛

修改独立后端、Go bridge 或协议绑定后，至少运行：

```sh
npm test
npm run check:maintainability
npm run verify:protocol
npm run verify:independent-support
npm run audit:api -- --check
npm run test:packaged-independent
```

涉及原生 flavor 时再运行 `npm run test:smoke:native` 和 `npm run test:packaged-native`。这两个命令只证明 disposable runtime handshake，不证明真实账号或业务功能。涉及发布时还要运行 `npm run verify:vendor`、`npm run release:manifest` 和 `npm run verify:release-manifest`。

每次提交前检查工作树，只提交源码、测试和必要文档；`.runtime`、原始 DMG、候选公开源码目录、真实微信数据和凭据不得进入仓库。
