# 通讯录 directory 分类证据边界

本文记录当前独立后端如何以保守投影实现 Alpha 的 `listContacts.directory`。
结论只针对本工程已有的固定 Chatlog 源码、合成 SQLite fixture，以及已恢复的
Alpha main/renderer/protocol 契约。真实微信数据没有作为本工程验收输入。

REA 对 Alpha 0.3.5 包的静态证据只确认“原生数据组件声明了联系人能力”，没有恢复
分类算法或 Rust/WCDB 源码；对应记录为 `native-findings.json` 的
`ev_6c17b28a4e220f30d4de9f708636a5b599575faefc7551c9b280a2cb9fd3dfc0`，且 JavaScript
调用图明确是 partial。组件 capability 声明不能替代字段语义或运行时验收。

## 已确认的字段

| 来源 | 可确认的事实 | 能支持的行为 |
| --- | --- | --- |
| `vendor/chatlog/internal/model/contact_v4.go:3-25` | `contact` 表包含 `username`、`local_type`、`alias`、`remark`、`nick_name`，以及模型注释列出的头像、flag、verify、extra buffer 等字段 | 只读查询基础联系人字段；未使用的列不能假定已经被 bridge 读取 |
| `vendor/chatlog/internal/model/contact_v4.go:32` | 注释明确 `local_type=2` 为群聊、`3` 为群聊成员（非好友）、`5/6` 为企业微信 | 识别这些原始类型并保留到 DTO；不能从该注释推导 Alpha 的全部分类 |
| `vendor/chatlog/internal/model/contact_v4.go:35-42` | `Wrap` 仅把 `local_type != 3` 归为 `IsFriend` | 说明 Chatlog 的好友布尔值不是 Alpha 的八分类；不能把它直接当作 `friend`/`former_friend`/`blocked` |
| `packages/alpha-data-bridge/main.go` | 独立 bridge 对显式 `contact.db`/`contact` 表通过固定 `PRAGMA table_info` 白名单解析联系人列；`username`/`local_type` 接受已在兼容探针中观察到的别名，展示列缺失时返回空字符串 | 缺少身份列、无 SQLite rowid 或出现被显式 shadow 的 `rowid` 时明确失败；SQL 标识符不来自请求，也没有扩大到任意表 |

兼容读取器接受的列别名是：`username`、`user_name`、`WCDB_CT_username`；`local_type`、`localType`、`WCDB_CT_local_type`、`type`；以及 `alias`/`WCDB_CT_alias`、`remark`/`WCDB_CT_remark`、`nick_name`/`nickname`/`WCDB_CT_nick_name`。这些别名只扩大离线只读副本的列名兼容性，不证明它们来自同一 native schema，也不改变 `90/128` 协议支持计数。
| `packages/alpha-data-bridge/main.go:535-578` | `contacts.list` 只查询上述五列并保留 `local_type` 与来源 rowid | 支持精确 username、字面量查询和分页；不产生 category/counts |

## Alpha 契约要求

恢复的 main 将分类固定为 `friend`、`group`、`enterprise_friend`、
`enterprise_group`、`official`、`service`、`former_friend`、`blocked`
（`src/main/index.js:8019-8037`）。`contactDirectoryFromWire` 要求返回八个分类各一条
合法 count；缺任一分类会返回 `CONTACT_DIRECTORY_RESPONSE_INVALID`
（`src/main/index.js:11602-11617`）。renderer 还会以这些 count 渲染主分类和“更多分类”
（`src/renderer/assets/index-DPCwIOAb.js:25427-25454`、`28933-28979`）。

因此，当前实现只把 friend/group 作为可查询分类；协议要求的另外六个 count 会带 `0` 以
保持响应形状，但这六个零是“未实现分类的占位”，不能解释为真实数据为空。请求这些未验证
分类会返回 `CONTACT_DIRECTORY_CATEGORY_UNSUPPORTED`，不会把未知记录归入其中。UI 的
friend/group 页面可以使用这层投影，其他分类保持明确不可用。

## 分类证据矩阵

| Alpha 分类 | 当前可验证映射 | 结论 |
| --- | --- | --- |
| `group` | `local_type=2` 的注释；用户名以 `@chatroom` 结尾是稳定结构线索 | 独立 directory 与导出都只按这两个已验证线索派生 group；其他类型不猜测 |
| `friend` | `local_type=1` 目前只出现在合成 fixture 和现有导出实现中；vendor 注释没有“1=好友”定义 | 独立 directory 与导出沿用这一明确、受限映射；不把它扩展为完整 Alpha 好友状态语义 |
| `enterprise_friend` / `enterprise_group` | `local_type=5/6` 仅被注释为企业微信，未定义联系人/群聊细分 | 不实现；不能用 `@chatroom` 或数字类型猜测二者之一 |
| `official` / `service` | 当前 contact DTO 没有公众号类型字段；Alpha 的 `officialAccountKind` 只是响应字段，不是数据库列映射 | 不实现；不能凭 `gh_`、alias 或昵称推断公众号身份/服务号 |
| `former_friend` | 没有删除/解除好友的已验证字段与时间语义；`local_type=3` 明确是群成员（非好友），不是历史好友 | 不实现 |
| `blocked` | 没有黑名单来源、标志位语义或可验证状态机；消息通知设置里的 `blocked` 是本应用规则，不是微信通讯录黑名单 | 不实现 |

## 当前行为与后续入口

`packages/alpha-engine/index.cjs` 的 `listContacts.directory` 现在完整扫描有界的
`contacts.list` 分页，按 `local_type=1` 和 `local_type=2`/`@chatroom` 生成 friend/group
分页与计数，并带齐协议要求的八类 count；六个未验证类别的零值只是响应占位。目录请求包含
其他分类时返回 `CONTACT_DIRECTORY_CATEGORY_UNSUPPORTED`，同一 username 出现多行时返回
`CONTACT_DIRECTORY_AMBIGUOUS`。基础联系人分页、批量 lookup、有限 profile 和只读
CSV/JSON/VCF/HTML/XLSX 导出继续使用真实五列（XLSX 使用同样的列集）；导出层与目录层都不会把未知类型归入其他分类。

要实现 directory，至少需要一份可追溯的 Alpha 数据组件 schema/源码或合成 fixture，明确
证明：

1. 企业微信联系人与企业微信群的区分字段及其取值；
2. 公众号/服务号身份和 `officialAccountKind` 的来源；
3. 历史好友与黑名单的状态字段、删除语义和去重规则；
4. 全部辅助表的稳定分页、快照和一致性边界。

在这些证据出现前，不应把其他工作区中的实验性 fallback、一次真实数据统计或 UI 能加载
作为当前独立后端的 schema 证明；那些材料不能替代合成 fixture 与固定源码证据。
