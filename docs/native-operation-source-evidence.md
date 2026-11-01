# 原生 operation 与源码路径证据

本页记录对随包原生文件做的静态字符串和导出符号检查。它用于安排后续取证，不代表这些 operation 已经在独立后端实现，也不代表静态字符串证明了运行时会成功执行。

## 可复核的文件身份

| 文件 | SHA-256 |
| --- | --- |
| `vendor/runtime/bin/alpha-data-host` | `a594b57bd7ec51efb0ef683808637a17d08ee622ed880db1a4426e7431b282a0` |
| `vendor/runtime/native/wcdb/libalpha_sqlcipher_readonly.dylib` | `90bbfd625de14ceac0b9d47fbe820f4a2bf67c9d9a5f8706a92980bb8144ccfe` |
| `vendor/runtime/manifests/alpha-wcdb.component.json` | `ea2e9f0f56e25538e58b43f752d15969bddebbbac823d4ce7a4caa5f392370a4` |

## `alpha-data-host` 中的 operation 线索

`strings -a vendor/runtime/bin/alpha-data-host` 能观察到以下 operation 名称：

- `native.list_favorites`
- `native.list_moments`
- `native.moments_year_stats`
- `native.resolve_image_media`
- `native.read_voice_blob`
- `native.manage_moments_anti_delete`
- `semantic.favorites`
- `semantic.moments`

同一文件还保留了 Rust 编译路径字符串，例如：

- `workers/data-host/src/media.rs`
- `workers/data-host/src/moment_export_run.rs`
- `workers/data-host/src/moments_year_stats.rs`
- `workers/data-host/src/dataset_export_jobs.rs`

这些路径和 operation 名称可以帮助定位后续请求/响应捕获或授权源码，但随包没有对应 Rust 源文件、wire schema、C ABI 头文件或 locator 结构定义。内嵌的 policy JSON 也只是发行运行时声明；它列出 operation 不等于当前环境通过完整性检查后能调用 operation。

## `libalpha_sqlcipher_readonly.dylib` 的符号线索

Mach-O 导出符号检查可见：

```text
_alpha_moments_project_row_v1
```

目前只知道它是一个导出符号，无法从安装包确定参数个数、`row` 结构、输出编码、缓冲区所有权、返回码含义或线程/生命周期约束。没有这些 ABI 证据时，不能通过 `dlsym` 直接调用，也不能据此实现朋友圈读取。

## 对当前缺口的影响

- 朋友圈读取、作者列表和年度朋友圈统计仍保持 `UNIMPLEMENTED`；见 [朋友圈 schema 证据](moments-schema-evidence.md)。
- 收藏读取、收藏媒体和收藏导出仍保持 `UNIMPLEMENTED`；见 [收藏 schema 证据](favorites-schema-evidence.md)。
- 原生图片定位、语音 blob 读取和媒体 key 获取仍没有可验证的 locator/schema/授权语义。
- 朋友圈防删除 operation 只证明原包存在控制面，不能证明独立 writer 可以安全写入；独立实现继续报告 writer disabled。

## 取得可靠实现所需材料

后续至少需要以下一项，并记录来源、版本和哈希：

1. 授权的明文 moments/favorites 数据库 fixture，包含 `sqlite_master`、索引和代表性行；
2. 在受控数据副本上捕获原生 request/response，连同错误分支和分页边界；
3. 原作者提供的对应版本 Rust/C/C++ 源码、生成 schema 或 ABI 头文件。

在获得材料前，项目继续使用 fail-closed 分支，不通过猜测性 SQL、伪造 token 或空结果来宣称功能已恢复。
