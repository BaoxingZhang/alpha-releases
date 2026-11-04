# Alpha × Chatlog 后端兼容性映射

固定候选：`a7162bca9454fa43b5950a2414670983fe180e56`。覆盖 Alpha `EngineClientFrame` 的 **128/128** 请求分支；逐项codec、wire字段号、源码行号和证据位于 [JSON清单](backend-compatibility-map.json)。此为静态映射，未读取用户数据，未验证真实微信环境。

分类：读取基础 5 项，需组合或新实现 34 项，候选缺失 89 项。**0 项认定为可直接替换 Alpha 接口；这些数量不是功能完成率。**

Chatlog适合作为会话、消息、联系人、群、本地媒体的读取底座。完整Alpha目标仍包括朋友圈/收藏、导出任务与调度、统计、AI、写入、安全和许可，不能将读取底座交付成全功能后端。

本表的“候选缺失”针对 Alpha 原生协议语义。当前 recovery 分支另有独立的本地公众号计划 metadata CRUD、blocked-attempt 记录和独立导出调度；这些能力不改变本表的原生兼容分类，也不连接公众号服务或执行远程计划。具体边界见 [独立 HTTP/MCP 接手记录](http-readonly-adapter-recovery.md)。

## 必须先处理的差异

- **消息身份与分页**：v4查询要求会话；regexp keyword；秒时间范围；offset分页；跨库/会话满足数量可提前返回，不能证明全局稳定排序。消息归一未保留完整server/local/source身份，IsSelf有源码FIXME。
- **多账号**：运行中账号发现与单WorkDir数据库服务不能替代持久多账号句柄和选择事务。
- **接口保护**：默认0.0.0.0:5030，所见路由未配置认证；不应按默认HTTP配置直接接入桌面产品。需loopback/受控子进程、调用方认证、账号scope和媒体路径授权。
- **图片密钥**：图片key是全局状态；空值设置不清除。Alpha逐账号key和clear协议必须新实现。
- **AI与写入**：MCP查询工具不等于AI对话/画像/审批服务；无候选发送、消息变更与防撤回实现。
- **全功能目标**：朋友圈、收藏、公众号、任务调度、ASR、许可和应用锁仍保留在路线图，不因首轮读取基础可用而裁剪或假报支持。

优先以固定commit的库级fork或受控进程构建adapter，保留稳定消息身份并实现账号与分页契约，再扩展所有业务域。Go `internal` 包不能从任意外部module直接导入。原Alpha许可/握手证明不由候选提供；自有能力实现应明确来源，不伪造原发行授权。

## 128请求逐项覆盖

| 请求 | wire字段 | 分类 | 领域 | 依据与仍需完成的部分 |
| --- | ---: | --- | --- | --- |
| `hello` | 10 | 候选缺失 | protocol | Chatlog没有Alpha protobuf会话、版本协商、nonce/bootstrap proof或组件Hello协议。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/database/service.go:45` |
| `getCapabilities` | 11 | 候选缺失 | license | Alpha这些分支承载entitlements/激活/刷新/注销；Chatlog未实现原产品授权服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/http/service.go:33` |
| `listAccounts` | 12 | 组合/新实现 | accounts | 候选能发现运行中的微信进程及目录；不能等价Alpha已保存账号清单、手动目录发现与读取状态。 证据：`internal/wechat/manager.go:52`、`internal/wechat/wechat.go:14`、`internal/wechatdb/wechatdb.go:23` |
| `selectAccount` | 13 | 组合/新实现 | accounts | 存在打开/关闭单一WorkDir的DB服务，无多账号选择事务、旧请求撤销与持久移除操作。 证据：`internal/chatlog/database/service.go:45`、`internal/wechatdb/wechatdb.go:23`、`internal/wechat/wechat.go:14` |
| `listConversations` | 14 | 读取基础 | conversations | 存在真实SessionTable读取；缺cursor、账号scope及置顶/折叠/未读等Alpha完整字段。 证据：`internal/wechatdb/datasource/v4/datasource.go:543`、`internal/model/session.go:8` |
| `listMessages` | 15 | 读取基础 | messages | 存在真实消息读取与解析；候选是offset/秒时间范围且会话必填，Alpha为cursor/双向/毫秒边界。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/model/message_v4.go:36`、`internal/model/message.go:108`、`internal/model/message_v4.go:47` |
| `exportConversation` | 16 | 组合/新实现 | export | 已有消息CSV/JSON/文本输出，可复用数据与格式化基础；非Alpha完整导出任务。 证据：`internal/chatlog/http/route.go:90`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `searchMessages` | 17 | 读取基础 | search | 存在sender和regexp keyword过滤，但不提供Alpha全账号搜索、分会话聚合和稳定cursor。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/model/message.go:108` |
| `activateLicense` | 18 | 候选缺失 | license | Alpha这些分支承载entitlements/激活/刷新/注销；Chatlog未实现原产品授权服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/http/service.go:33` |
| `refreshLicense` | 19 | 候选缺失 | license | Alpha这些分支承载entitlements/激活/刷新/注销；Chatlog未实现原产品授权服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/http/service.go:33` |
| `deactivateLicense` | 20 | 候选缺失 | license | Alpha这些分支承载entitlements/激活/刷新/注销；Chatlog未实现原产品授权服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/http/service.go:33` |
| `getTelemetryStatus` | 21 | 候选缺失 | telemetry | Chatlog没有Alpha遥测同意、队列和发送协议。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `setTelemetryConsent` | 22 | 候选缺失 | telemetry | Chatlog没有Alpha遥测同意、队列和发送协议。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `flushTelemetry` | 23 | 候选缺失 | telemetry | Chatlog没有Alpha遥测同意、队列和发送协议。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `analyzeConversation` | 24 | 组合/新实现 | analytics | 真实消息、联系人和群读取可作为统计输入；候选没有Alpha年度/关系/汇总分析算法。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/wechatdb/repository/contact.go:105`、`internal/wechatdb/repository/chatroom.go:99` |
| `startOfficialExport` | 25 | 候选缺失 | official_export | 读取本地聊天分享链接不等于连接公众号历史文章并在线导出；未见对应实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `getJob` | 26 | 组合/新实现 | jobs | 独立后端将已验证的 chat/record export 快照映射为通用 JobSummary；不声称原生 Alpha 通用任务、租约或跨进程事件日志兼容。 证据：`packages/alpha-engine/generic-jobs.cjs`、`tests/chat-export-jobs.test.mjs`、`tests/engine-record-export.test.mjs` |
| `watchJob` | 27 | 组合/新实现 | jobs | 独立后端提供有界的状态变化/进度事件视图；没有把它当作原生持久事件订阅或远程通知。 证据：`packages/alpha-engine/generic-jobs.cjs`、`tests/chat-export-jobs.test.mjs`、`tests/engine-record-export.test.mjs` |
| `cancelJob` | 28 | 组合/新实现 | jobs | 独立后端将取消请求转发到已验证的本地导出任务管理器；原生租约、跨进程取消和其他任务种类仍未恢复。 证据：`packages/alpha-engine/generic-jobs.cjs`、`tests/chat-export-jobs.test.mjs`、`tests/engine-record-export.test.mjs` |
| `discoverAccounts` | 29 | 组合/新实现 | accounts | 候选能发现运行中的微信进程及目录；不能等价Alpha已保存账号清单、手动目录发现与读取状态。 证据：`internal/wechat/manager.go:52`、`internal/wechat/wechat.go:14`、`internal/wechatdb/wechatdb.go:23` |
| `importDatabaseKey` | 30 | 组合/新实现 | account_keys | 存在密钥验证和解密器；无Alpha按账号导入、受保护存储、复核与句柄结果。 证据：`internal/wechat/decrypt/validator.go:51`、`internal/wechat/decrypt/darwin/v4.go:79`、`internal/chatlog/conf/server.go:7` |
| `transcribeVoice` | 31 | 候选缺失 | voice_transcription | SILK转MP3只是音频转换，候选未实现ASR、模型选择或批量转写。 证据：`internal/wechatdb/datasource/v4/datasource.go:705`、`pkg/util/silk/silk.go:10`、`internal/wechatdb/datasource/datasource.go:16` |
| `transcribeVoiceBatch` | 32 | 候选缺失 | voice_transcription | SILK转MP3只是音频转换，候选未实现ASR、模型选择或批量转写。 证据：`internal/wechatdb/datasource/v4/datasource.go:705`、`pkg/util/silk/silk.go:10`、`internal/wechatdb/datasource/datasource.go:16` |
| `startMessageCapture` | 33 | 候选缺失 | capture | 进程发现/密钥提取不是消息或公众号材料采集协议；无相应会话与事件。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechat/wechat.go:67` |
| `watchMessageCapture` | 34 | 候选缺失 | capture | 进程发现/密钥提取不是消息或公众号材料采集协议；无相应会话与事件。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechat/wechat.go:67` |
| `reportMessageActivity` | 35 | 候选缺失 | capture | 进程发现/密钥提取不是消息或公众号材料采集协议；无相应会话与事件。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechat/wechat.go:67` |
| `cancelMessageCapture` | 36 | 候选缺失 | capture | 进程发现/密钥提取不是消息或公众号材料采集协议；无相应会话与事件。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechat/wechat.go:67` |
| `openMessageSession` | 37 | 候选缺失 | writer_send | 候选没有发消息或受控发送会话；现有业务接口是查询。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `closeMessageSession` | 38 | 候选缺失 | writer_send | 候选没有发消息或受控发送会话；现有业务接口是查询。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `sendMessage` | 39 | 候选缺失 | writer_send | 候选没有发消息或受控发送会话；现有业务接口是查询。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `watchMessageSend` | 40 | 候选缺失 | writer_send | 候选没有发消息或受控发送会话；现有业务接口是查询。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `cancelMessageSend` | 41 | 候选缺失 | writer_send | 候选没有发消息或受控发送会话；现有业务接口是查询。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `listContacts` | 42 | 读取基础 | contacts | 存在联系人与群缓存查询基础；字段和查询前缀语义不同。 证据：`internal/wechatdb/repository/contact.go:105`、`internal/model/contact.go:3`、`internal/wechatdb/repository/chatroom.go:99` |
| `listMoments` | 43 | 候选缺失 | moments | 候选数据源及HTTP路由中无朋友圈记录/作者/日期统计/表情/导出/防删除实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `listFavorites` | 44 | 候选缺失 | favorites | 聊天中的收藏式分享消息不等于微信收藏库；未见收藏库及媒体槽位实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `listGeneral` | 45 | 组合/新实现 | records | 该分支复用其他资料、群成员和群置顶；候选仅有部分聊天解析和群成员基础，8个虚拟表的差异另列于JSON。 证据：`internal/model/message.go:108`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `applyMessageMutation` | 46 | 候选缺失 | writer_local | 未见消息编辑/插入/还原或资源修复事务；临时DB副本读取不是writer。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/wechatdb/datasource/dbm/dbm.go:114` |
| `manageMomentsAntiDelete` | 47 | 候选缺失 | moments | 候选数据源及HTTP路由中无朋友圈记录/作者/日期统计/表情/导出/防删除实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `getApplicationLockStatus` | 48 | 候选缺失 | application_security | 候选未实现Alpha应用锁、安全会话或受保护凭据存储。 证据：`internal/chatlog/http/service.go:33`、`internal/chatlog/http/middleware.go:10`、`internal/chatlog/conf/server.go:7` |
| `provisionApplicationLock` | 49 | 候选缺失 | application_security | 候选未实现Alpha应用锁、安全会话或受保护凭据存储。 证据：`internal/chatlog/http/service.go:33`、`internal/chatlog/http/middleware.go:10`、`internal/chatlog/conf/server.go:7` |
| `unlockApplication` | 50 | 候选缺失 | application_security | 候选未实现Alpha应用锁、安全会话或受保护凭据存储。 证据：`internal/chatlog/http/service.go:33`、`internal/chatlog/http/middleware.go:10`、`internal/chatlog/conf/server.go:7` |
| `lockApplication` | 51 | 候选缺失 | application_security | 候选未实现Alpha应用锁、安全会话或受保护凭据存储。 证据：`internal/chatlog/http/service.go:33`、`internal/chatlog/http/middleware.go:10`、`internal/chatlog/conf/server.go:7` |
| `getImageMediaStatus` | 52 | 组合/新实现 | media_keys | 有图像解码、全局AES key设置和校验；没有Alpha逐账号状态、手动/内存模式及验证证明。 证据：`pkg/util/dat2img/dat2img.go:48`、`pkg/util/dat2img/dat2img.go:192`、`pkg/util/dat2img/imgkey.go:62` |
| `configureImageKey` | 53 | 组合/新实现 | media_keys | 有图像解码、全局AES key设置和校验；没有Alpha逐账号状态、手动/内存模式及验证证明。 证据：`pkg/util/dat2img/dat2img.go:48`、`pkg/util/dat2img/dat2img.go:192`、`pkg/util/dat2img/imgkey.go:62` |
| `clearImageKey` | 54 | 组合/新实现 | media_keys | SetAesKey(空串)直接返回，无法充当清除；需自行实现密钥和缓存撤销。 证据：`pkg/util/dat2img/dat2img.go:192`、`internal/chatlog/conf/server.go:7` |
| `startMaterialCapture` | 55 | 候选缺失 | capture | 进程发现/密钥提取不是消息或公众号材料采集协议；无相应会话与事件。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechat/wechat.go:67` |
| `watchMaterialCapture` | 56 | 候选缺失 | capture | 进程发现/密钥提取不是消息或公众号材料采集协议；无相应会话与事件。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechat/wechat.go:67` |
| `cancelMaterialCapture` | 57 | 候选缺失 | capture | 进程发现/密钥提取不是消息或公众号材料采集协议；无相应会话与事件。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechat/wechat.go:67` |
| `startPersonaProfile` | 62 | 候选缺失 | ai_persona | MCP只暴露查询工具；无画像构建、模型推理、审批与运行生命周期。 证据：`internal/chatlog/http/mcp.go:20`、`internal/wechatdb/datasource/datasource.go:16` |
| `watchPersonaProfile` | 63 | 候选缺失 | ai_persona | MCP只暴露查询工具；无画像构建、模型推理、审批与运行生命周期。 证据：`internal/chatlog/http/mcp.go:20`、`internal/wechatdb/datasource/datasource.go:16` |
| `cancelPersonaProfile` | 64 | 候选缺失 | ai_persona | MCP只暴露查询工具；无画像构建、模型推理、审批与运行生命周期。 证据：`internal/chatlog/http/mcp.go:20`、`internal/wechatdb/datasource/datasource.go:16` |
| `getAdvancedComponentStatus` | 65 | 候选缺失 | advanced_components | 候选没有Alpha按平台动态组件清单、下载校验和激活生命周期。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `startAdvancedComponent` | 66 | 候选缺失 | advanced_components | 候选没有Alpha按平台动态组件清单、下载校验和激活生命周期。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `watchAdvancedComponent` | 67 | 候选缺失 | advanced_components | 候选没有Alpha按平台动态组件清单、下载校验和激活生命周期。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `cancelAdvancedComponent` | 68 | 候选缺失 | advanced_components | 候选没有Alpha按平台动态组件清单、下载校验和激活生命周期。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `acquireDatabaseKey` | 69 | 组合/新实现 | account_keys | 有按平台提取/验证密钥实现，但无Alpha超时、操作身份和结构化证据封装。 证据：`internal/wechat/wechat.go:67`、`internal/wechat/key/darwin/v4.go:55`、`internal/wechat/decrypt/validator.go:51` |
| `watchDatabaseKeyAcquisition` | 129 | 组合/新实现 | account_keys | 候选提取函数返回最终结果，未见Alpha序列化进度事件/afterEventSeq重放。 证据：`internal/wechat/wechat.go:67`、`internal/wechat/key/darwin/v4.go:55` |
| `removeAccount` | 70 | 组合/新实现 | accounts | 存在打开/关闭单一WorkDir的DB服务，无多账号选择事务、旧请求撤销与持久移除操作。 证据：`internal/chatlog/database/service.go:45`、`internal/wechatdb/wechatdb.go:23`、`internal/wechat/wechat.go:14` |
| `startMaterialTextSend` | 71 | 候选缺失 | writer_send | 候选没有发消息或受控发送会话；现有业务接口是查询。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `startMaterialOfficialExport` | 72 | 候选缺失 | official_export | 读取本地聊天分享链接不等于连接公众号历史文章并在线导出；未见对应实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `beginMaterialOfficialExport` | 73 | 候选缺失 | official_export | 读取本地聊天分享链接不等于连接公众号历史文章并在线导出；未见对应实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `getMaterialOfficialExport` | 74 | 候选缺失 | official_export | 读取本地聊天分享链接不等于连接公众号历史文章并在线导出；未见对应实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `cancelMaterialOfficialExport` | 75 | 候选缺失 | official_export | 读取本地聊天分享链接不等于连接公众号历史文章并在线导出；未见对应实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `listMaterialOfficialExports` | 76 | 候选缺失 | official_export | 读取本地聊天分享链接不等于连接公众号历史文章并在线导出；未见对应实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `listOfficialScheduleRecords` | 77 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `getOfficialScheduleRecord` | 78 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `cancelOfficialScheduleRecord` | 79 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `archiveOfficialScheduleRecord` | 80 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `listOfficialSchedulePlans` | 81 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `getOfficialSchedulePlan` | 82 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `saveOfficialSchedulePlan` | 83 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `deleteOfficialSchedulePlan` | 84 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `runOfficialSchedulePlanNow` | 85 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `putPendingOfficialPlanCreate` | 86 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `getPendingOfficialPlanCreate` | 87 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `clearPendingOfficialPlanCreate` | 88 | 候选缺失 | official_jobs | 未见公众号导出计划、执行记录或pending创建意图存储。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `listChatExportSchedules` | 89 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `getChatExportSchedule` | 90 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `saveChatExportSchedule` | 91 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `deleteChatExportSchedule` | 92 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `runChatExportScheduleNow` | 93 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `listChatExportRuns` | 94 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `getChatExportRun` | 95 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `listChatExportAttempts` | 96 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `getChatExportAttempt` | 97 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `retryChatExportAttempt` | 98 | 候选缺失 | scheduled_exports | fsnotify/Webhook不是定时导出计划、运行记录和重试尝试系统。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/webhook/webhook.go:159` |
| `manageMessageAntiRecall` | 99 | 候选缺失 | retention | 文件变化Webhook不是防撤回保全、撤回记录库或逐会话保全状态。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/webhook/webhook.go:159` |
| `listMessageRecallRecords` | 100 | 候选缺失 | retention | 文件变化Webhook不是防撤回保全、撤回记录库或逐会话保全状态。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/webhook/webhook.go:159` |
| `maintainMessageResource` | 101 | 候选缺失 | writer_local | 未见消息编辑/插入/还原或资源修复事务；临时DB副本读取不是writer。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/wechatdb/datasource/dbm/dbm.go:114` |
| `discoverPendingMessageResources` | 102 | 候选缺失 | writer_local | 未见消息编辑/插入/还原或资源修复事务；临时DB副本读取不是writer。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/wechatdb/datasource/dbm/dbm.go:114` |
| `resolveMessageMedia` | 103 | 组合/新实现 | media | 独立后端只对显式 `media-index.v1.json` 条目提供 `alpha-media://sha256/<sha256>` 解析，要求唯一账号/会话/消息绑定并重新校验文件和真实消息；不兼容原生 `media1_`、MD5、远程补齐或语音/视频。 证据：`packages/alpha-engine/index.cjs`、`packages/alpha-engine/media-index.cjs`、`tests/engine-media-index.test.mjs` |
| `analyzeAnnual` | 104 | 组合/新实现 | analytics | 真实消息、联系人和群读取可作为统计输入；候选没有Alpha年度/关系/汇总分析算法。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/wechatdb/repository/contact.go:105`、`internal/wechatdb/repository/chatroom.go:99` |
| `getDataRevision` | 105 | 组合/新实现 | live_data | 存在文件组监控与回调，但没有Alpha revision、targets身份与账号epoch协议。 证据：`internal/wechatdb/wechatdb.go:129`、`pkg/filemonitor/filegroup.go:106`、`internal/chatlog/webhook/webhook.go:159` |
| `getDataWatchTargets` | 106 | 组合/新实现 | live_data | 存在文件组监控与回调，但没有Alpha revision、targets身份与账号epoch协议。 证据：`internal/wechatdb/wechatdb.go:129`、`pkg/filemonitor/filegroup.go:106`、`internal/chatlog/webhook/webhook.go:159` |
| `getMessageSource` | 107 | 组合/新实现 | message_identity | 底层表含server_id等线索，但归一模型未保留完整原始身份和source；没有对应定位API。 证据：`internal/model/message_v4.go:36`、`internal/model/message_v4.go:47`、`internal/model/message.go:108`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `readAccountDataKey` | 108 | 组合/新实现 | account_keys | 候选对象/配置可持有Key，不等于经过解锁与调用方校验的安全读取接口。 证据：`internal/wechat/wechat.go:14`、`internal/chatlog/conf/server.go:7` |
| `recoverMaterialTextSend` | 109 | 候选缺失 | writer_send | 候选没有发消息或受控发送会话；现有业务接口是查询。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `startAggregateAnalysis` | 110 | 组合/新实现 | analytics | 真实消息、联系人和群读取可作为统计输入；候选没有Alpha年度/关系/汇总分析算法。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/wechatdb/repository/contact.go:105`、`internal/wechatdb/repository/chatroom.go:99` |
| `watchAggregateAnalysis` | 111 | 候选缺失 | analytics_jobs | 未见聚合分析作业、进度与取消服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `cancelAggregateAnalysis` | 112 | 候选缺失 | analytics_jobs | 未见聚合分析作业、进度与取消服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `resolveFavoriteMedia` | 113 | 候选缺失 | favorites | 聊天中的收藏式分享消息不等于微信收藏库；未见收藏库及媒体槽位实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `listMomentAuthors` | 114 | 候选缺失 | moments | 候选数据源及HTTP路由中无朋友圈记录/作者/日期统计/表情/导出/防删除实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `getContactProfile` | 115 | 组合/新实现 | contacts | 基础联系人和群成员可组合档案，但commonGroupLimit等完整个人档案未实现。 证据：`internal/wechatdb/repository/contact.go:96`、`internal/model/contact.go:3`、`internal/wechatdb/repository/chatroom.go:99`、`internal/model/chatroom.go:9` |
| `listFavoriteMediaSlots` | 116 | 候选缺失 | favorites | 聊天中的收藏式分享消息不等于微信收藏库；未见收藏库及媒体槽位实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `exportContacts` | 117 | 组合/新实现 | export | 候选已有联系人输出基础，Alpha格式、路径校验和完整字段仍需实现。 证据：`internal/chatlog/http/route.go:158`、`internal/wechatdb/repository/contact.go:105` |
| `resolveMomentEmoji` | 118 | 候选缺失 | moments | 候选数据源及HTTP路由中无朋友圈记录/作者/日期统计/表情/导出/防删除实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `getMessageAntiRecallStatuses` | 119 | 候选缺失 | retention | 文件变化Webhook不是防撤回保全、撤回记录库或逐会话保全状态。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/webhook/webhook.go:159` |
| `getChatExportStats` | 120 | 组合/新实现 | export | 可从读取数据组合统计；没有按类别/会话范围的现成导出统计服务。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/wechatdb/datasource/v4/datasource.go:543` |
| `getChatExportCapabilities` | 121 | 组合/新实现 | export | 只有TXT/JSON/CSV输出事实，没有Alpha format/options/capabilities协议。 证据：`internal/chatlog/http/route.go:90` |
| `startChatExport` | 122 | 组合/新实现 | export | 已有消息CSV/JSON/文本输出，可复用数据与格式化基础；非Alpha完整导出任务。 证据：`internal/chatlog/http/route.go:90`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `listChatExports` | 123 | 候选缺失 | jobs | 候选HTTP输出是同步请求；未见Alpha任务ID、快照、订阅、取消和持久历史服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/http/route.go:90` |
| `watchChatExport` | 124 | 候选缺失 | jobs | 候选HTTP输出是同步请求；未见Alpha任务ID、快照、订阅、取消和持久历史服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/http/route.go:90` |
| `cancelChatExport` | 125 | 候选缺失 | jobs | 候选HTTP输出是同步请求；未见Alpha任务ID、快照、订阅、取消和持久历史服务。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/chatlog/http/route.go:90` |
| `locateMessage` | 126 | 组合/新实现 | message_identity | 底层表含server_id等线索，但归一模型未保留完整原始身份和source；没有对应定位API。 证据：`internal/model/message_v4.go:36`、`internal/model/message_v4.go:47`、`internal/model/message.go:108`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `getConversationDayCounts` | 127 | 组合/新实现 | analytics | 可基于真实消息组合日期计数，无现成按本地时区的日计数接口。 证据：`internal/wechatdb/datasource/v4/datasource.go:184` |
| `decodeVoicePlayback` | 128 | 读取基础 | voice_playback | 有本地语音读取和SILK转MP3，不包含Alpha完整媒体身份与播放缓存协议。 证据：`internal/wechatdb/datasource/v4/datasource.go:705`、`pkg/util/silk/silk.go:10` |
| `configureApplicationLock` | 131 | 候选缺失 | application_security | 候选未实现Alpha应用锁、安全会话或受保护凭据存储。 证据：`internal/chatlog/http/service.go:33`、`internal/chatlog/http/middleware.go:10`、`internal/chatlog/conf/server.go:7` |
| `resetApplicationLock` | 132 | 候选缺失 | application_security | 候选未实现Alpha应用锁、安全会话或受保护凭据存储。 证据：`internal/chatlog/http/service.go:33`、`internal/chatlog/http/middleware.go:10`、`internal/chatlog/conf/server.go:7` |
| `startMomentExport` | 135 | 候选缺失 | moments | 候选数据源及HTTP路由中无朋友圈记录/作者/日期统计/表情/导出/防删除实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `startRecordExport` | 136 | 组合/新实现 | records_export | 可复用部分消息记录与输出基础；无Alpha其他资料全类别导出任务。 证据：`internal/model/message.go:108`、`internal/chatlog/http/route.go:90` |
| `browseConversationMessages` | 137 | 组合/新实现 | media_browse | 可读取消息并识别媒体类型，但无按类型/全账号聚合的稳定分页接口。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/model/message.go:108`、`internal/wechatdb/datasource/v4/datasource.go:601` |
| `browseAccountMedia` | 138 | 组合/新实现 | media_browse | 可读取消息并识别媒体类型，但无按类型/全账号聚合的稳定分页接口。 证据：`internal/wechatdb/datasource/v4/datasource.go:184`、`internal/model/message.go:108`、`internal/wechatdb/datasource/v4/datasource.go:601` |
| `exportGroupMembers` | 139 | 组合/新实现 | export | 候选有群成员数据，但HTTP只导出群摘要；不能当作群成员导出已完成。 证据：`internal/wechatdb/repository/chatroom.go:99`、`internal/model/chatroom.go:9`、`internal/chatlog/http/route.go:203` |
| `previewMaterialOfficialArticles` | 140 | 候选缺失 | official_export | 读取本地聊天分享链接不等于连接公众号历史文章并在线导出；未见对应实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55`、`internal/wechatdb/datasource/v4/datasource.go:184` |
| `getMomentDayCounts` | 141 | 候选缺失 | moments | 候选数据源及HTTP路由中无朋友圈记录/作者/日期统计/表情/导出/防删除实现。 证据：`internal/wechatdb/datasource/datasource.go:16`、`internal/chatlog/http/route.go:55` |
| `startCdnMediaFetch` | 142 | 候选缺失 | media_cdn | 候选是本地媒体读取；未见利用登录微信补齐CDN资源的会话、任务与取消实现。 证据：`internal/wechatdb/datasource/v4/datasource.go:601`、`internal/chatlog/http/route.go:295`、`internal/wechatdb/datasource/datasource.go:16` |
| `getCdnMediaFetch` | 143 | 候选缺失 | media_cdn | 候选是本地媒体读取；未见利用登录微信补齐CDN资源的会话、任务与取消实现。 证据：`internal/wechatdb/datasource/v4/datasource.go:601`、`internal/chatlog/http/route.go:295`、`internal/wechatdb/datasource/datasource.go:16` |
| `cancelCdnMediaFetch` | 144 | 候选缺失 | media_cdn | 候选是本地媒体读取；未见利用登录微信补齐CDN资源的会话、任务与取消实现。 证据：`internal/wechatdb/datasource/v4/datasource.go:601`、`internal/chatlog/http/route.go:295`、`internal/wechatdb/datasource/datasource.go:16` |

## JS服务与复用子请求

- **agent-chat/model-config/memory/external-mcp/chat-summary**：保留Alpha可恢复的JS编排，Chatlog仅能作为读取工具底座；本矩阵128是engine请求，不覆盖267个main IPC的全部JS服务。
- **window/cache/notification/export-file-dialog**：属于Electron桌面层，应继续独立维护，不要求Go数据候选接管。
- **listGeneral复用子域**：群成员经 `EngineClient.listGroupMembers`（main:64564）发送 `listGeneral + __alpha_group_members`；还有群置顶和6类其他资料。JSON已逐项标出8个虚拟表：群成员、支付、通话、撤回事件可组合；群置顶、好友请求、朋友圈互动和搜索历史缺少对应实现。

本报告没有改动 `src/`、Chatlog源码或当前启动行为。编译及运行结果由对应构建证据单独记录；本表中的 `runtimeValidated` 均为 false。
