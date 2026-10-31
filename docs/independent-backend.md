# 独立后端：离线读取、手动密钥导入与原界面

本轮新增自有 Go 数据桥接、Node 协议引擎和密码应用锁，已与恢复的 Electron 主进程/React 界面接通。真实运行使用人工生成的微信 v4 SQLite 数据库，完整走过首次设置并显示聊天消息；没有访问用户微信数据或取密钥。

后续新增自有 Go 加密快照导入器，支持原界面的手动密钥流程。错误密钥拒绝、逐页认证解密、四库明文哈希对照和重启复用已通过加密合成数据的桌面实测，见 [加密导入说明](encrypted-import.md) 与 [运行记录](encrypted-run.json)。

完整维护目标仍是 [MAINTENANCE.md](../MAINTENANCE.md) 中的全部功能。当前交付是可继续开发的第一层实现，不能当作完整 Alpha 替代品。

## 启动

```sh
npm run build:independent
npm run demo
```

`build:independent` 先编译并测试自有 Go 模块，再构建桌面 JavaScript。`demo` 在项目 `.runtime/demo-*/fixture/` 生成合成数据库，启动独立模式。进入界面后勾选本地数据说明，点击“打开数据副本”，跳过图片密钥步骤，完成向导即可看到合成聊天。没有用测试缓存或固定账号数据绕过向导。

不加载数据的独立模式为 `npm run start:independent`，真实账号列表为空。显式数据副本可以通过以下命令传入：

```sh
npm run start:independent -- --data-dir /absolute/project/.runtime/your-snapshot --account-id your-dataset-label
```

当前启动器只接受项目 `.runtime/` 内无符号链接的目录，内容须为稳定、已解密的微信 v4 SQLite 副本。`account-id` 是数据集标签，不是经微信验证的登录身份。不会自动寻找个人微信目录。活动 WAL/SHM/journal、目录或数据库变化、加密文件、不兼容 schema 均明确失败。

加密副本须改用 `--encrypted-dir`，不能与 `--data-dir` 混用；首次打开需要已有密钥。`npm run demo:encrypted` 可演示此路径。固定加密格式和明文快照的存储边界见 [encrypted-import.md](encrypted-import.md)。

原包模式仍使用 `npm start`，当前错误仍为 `SECURITY_RUNTIME_POLICY_REJECTED_INTEGRITY`。独立模式使用自己的服务实现，没有修改原二进制 guard、签名、公钥或许可。

## 已接通的内容

| 部分 | 当前行为 | 仍有限制 |
| --- | --- | --- |
| 原桌面 UI | 原首次设置和聊天页实际完成，保留全部菜单入口 | 其他菜单对应后端大部分尚未实现 |
| 数据源 | 显式指定一个明文或加密离线副本，验证结构，选择状态持久化 | 无自动取钥、在线微信身份识别、多账号注册或实时变化 |
| 手动密钥和解密 | 固定微信 v4 格式，逐页认证、SQLite完整性校验、原子发布明文快照，重启验证后复用 | 无真实微信样本验证、WAL合并、其他加密格式和图片密钥 |
| 联系人 | 实际查询联系人字段；精确 username 查找及 offset 分页 | 完整通讯录页面用到的分类、资料、模糊搜索等未实现 |
| 会话 | 实际 session 查询，联系人备注/昵称，稳定分页 | 仅提供存在的数据列；无完整会话资料和群信息 |
| 消息 | 跨分库排序、正反向分页、时间范围、原始 ID/定位 | 引用/卡片/附件/媒体等语义未完整解析；原始字节由 Go 层保留 |
| 64 位字段 | serverId 用 BigInt/十进制字符串，引擎 source token 保留完整 localId | 原 Alpha DTO 的 localId 仅 int32；超界时该旧字段为 0。旧 UI 还会过滤独立 token，完整定位保留在桥接/引擎层，未接 UI 原始消息查看或任何修改 |
| 压缩内容 | Node 层可尝试有尺寸上限的 zstd 解码 | 解码失败显示明确“不支持”占位；不声称全部微信格式可用 |
| 密码锁 | scrypt 校验、配置/修改/关闭、锁定/解锁、失败退避和重启锁定 | 不加密数据库或保存微信/模型凭据；无 Windows Hello、硬件保护或重置服务 |
| 原许可与网关 | capabilities 无原作者 entitlement；独立网关入口明确不可用 | AI、HTTP/MCP 服务尚未迁移，不能靠原网关补齐 |

协议层当前实现 14/128 个请求分支，其余 114 个返回 `UNIMPLEMENTED`，清单见 [engine README](../packages/alpha-engine/README.md) 和源码 `SUPPORTED`。部分读取请求仍只支持有限参数；支持一个请求分支不代表其整个功能领域已完成，也不代表产品完成比例。

独立后端 Hello 的 ready 只表示当前服务初始化成功。配置了有效且未锁定的数据源时会实际验证 SQLite；启用密码锁后重启只初始化锁和协议服务，数据访问必须先解锁。账号能力来自真实存在的库；数据源改变后再次查询会失败，不保留旧的就绪结果。

## 实测证据

上一阶段合并测试 43/43 通过，历史汇总保留在 [independent-validation.json](independent-validation.json)。加入加密导入后的最新测试与三种桌面路径结果见 [encrypted-validation.json](encrypted-validation.json)。两份记录分别对应当时的实现范围。

- [桌面运行 JSON](independent-run.json) 与 [聊天截图](independent-run.png)：原 UI、真实 IPC → Protobuf → Go → SQLite，应用锁前后读取，以及数据文件哈希不变。
- [Go 编译与测试](../packages/alpha-data-bridge/build-validation.json)：arm64 原生程序、固定工具链、依赖锁和 schema/只读/分页边界。
- [独立审查](independent-review.md)：网关不回退、账号能力、无源与无效源的区别、锁和源文件变化。
- [源码维护来源](../provenance/maintenance-changes.json)：恢复代码的原始哈希与本轮修改后哈希分别保留。

```sh
npm run test:protocol
npm run test:security
npm run test:bridge
npm run test:engine
npm run test:boundaries
npm run test:independent
npm run test:encrypted
npm run test:smoke
npm run verify:vendor
```

`test:independent` 退出前关闭自己的进程，`test:smoke` 记录保留原包模式的真实后端失败。二者结果分别记录，不能混为一次完整产品验收。

## 下一层仍需补齐

1. 对授权真实样本验证已有手动密钥、离线解密及查询结果；扩展自动接入、实时快照和 WAL 一致性。
2. 完整通讯录、搜索/定位/上下文、群信息、消息类型和媒体解析。
3. 导出/任务/统计/朋友圈、AI 工具与服务端协议；逐个保留已有交互和语义。
4. 凭据安全存储、写入恢复、平台能力、自有签名与更新发布。

当前未连接微信、获取密钥、调用模型、写聊天数据库、发送消息或发布软件。原有完整功能清单继续作为验收范围。
