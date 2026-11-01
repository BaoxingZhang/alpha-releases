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

### 本轮 REA 对 operation 和语义字符串的补充

REA/Ghidra 对同一 `alpha-data-host` arm64 文件的只读检查又确认了以下入口和语义族：

- `native.list_favorites`、`native.list_moments`、`native.list_moment_authors`、`native.moments_year_stats`；
- `native.resolve_image_media`、`native.read_image_media`、`native.read_voice_blob`、`native.cdn_media_transfer`；
- `native.manage_moments_anti_delete`、`semantic.favorites`、`semantic.favorite_xml`、`semantic.moments`。

这些是二进制中的字符串观察，不是运行时调用记录。对应 REA Evidence 为 `ev_b3c5dd36bda3b097b94881d1c35aeabefc3cdf50964a80d928c1e48f559b8b0d`、`ev_f1acd49d61402815c03fe786bee5e0c5323110cc6d5e71be27de66f3fdff04f0`、`ev_e05ad3bf6d4092cec26ec32a284c2cf2f447a379cfd9561f40c2b6728e8a263c`、`ev_aade22a182abf4af9240dc4eabeab0aa1b5c1449a5c9c5f4717e783102b0fbe8` 和 `ev_5cc76c2c5afaa105d69a4d7cd3fdd975ea25476b472cbc55e556de72cb7024ce`。Evidence 保存的是静态扫描范围和文件身份；它没有证明任何 operation 在当前授权、完整性检查和真实数据下成功。

### REA 符号和协议类型索引

针对同一 `alpha-data-host` 的 procedure 搜索还返回了原生符号入口：`NativeCore::list_moments`、`NativeCore::list_favorites`、`parse_favorite`、`favorite_record_field`、`locate_favorite_media`、`lookup_favorite_source`、`resolve_image_media_with_preference`、`resolve_record_media`、`AccountDataPort::moments_year_stats`、`browse_account_media`、`manage_moments_anti_delete`、`resolve_favorite_image_media` 和 `resolve_favorite_object_media`。同一 retained native inventory 还观察到 `ListMomentsRequest/Response`、`ListFavoritesRequest/Response`、`NativeFavoriteRecord`、`FavoriteTypeCount`、`FavoriteTag`、`NativeFavoriteSourceMessage`、`NativeFavoriteMediaLocator/Object`、`MomentsYearStatsRequest/Response`、`MomentsDayCountsOptions`、`ResolveImageMediaRequest/Response`、`PeekCachedMedia*`、`ReadImageMedia*` 和 `ManageMomentsAntiDelete*` 等协议类型名称。

这比普通字符串搜索更接近原生实现的入口索引，但没有提供字段编号、完整 ABI、真实请求/响应、数据库 fixture 或授权状态。因此它只用于安排后续取证，不能据此调用这些入口或把独立实现标为已兼容。REA Evidence：`ev_ce99e3f342f8a8eb071b2ebcad8ac4d13ecc73ca2b169062c9fbefcc1468581a`；年度统计相关类型的补充字符串 Evidence：`ev_5a76bc93f036c83156a5011f4d37f2935529ce94847d817fed555ec6f75e0aed`。

## `libalpha_sqlcipher_readonly.dylib` 的符号线索

Mach-O 导出符号检查可见：

```text
_alpha_moments_project_row_v1
```

目前只知道它是一个导出符号，无法从安装包确定参数个数、`row` 结构、输出编码、缓冲区所有权、返回码含义或线程/生命周期约束。没有这些 ABI 证据时，不能通过 `dlsym` 直接调用，也不能据此实现朋友圈读取。

### REA/Ghidra 对导出函数的进一步证据

使用 REA 的 Ghidra 12.1.4 对同一 arm64 文件（SHA-256 `90bbfd625de14ceac0b9d47fbe820f4a2bf67c9d9a5f8706a92980bb8144ccfe`）做了只读分析。`_alpha_moments_project_row_v1` 的入口为 `0x81a8`，函数体是连续的 `0x1c8` 字节（`0x81a8..0x836f`），共 30 个基本块。REA Evidence：`ev_59591dcdf846afd6afbdb878ffca2037486a23403597a19664176d75b15b7dbb`（函数体/入口元数据）、`ev_4877a1f2b9d46fc7cd69ab11217b78acdb305edcbf4410f386c30c97382c7c2e`（Ghidra 伪代码）和 `ev_5cb3fa685afca667ba1d913a542b1a7d7afb2b360044ea9e0cae5e405a963aa7`（REA 组合 API 边界分析）。

Ghidra/REA 观察到的调用约定候选是四个参数：`param_1` 为内部 row/projection 上下文指针，`param_2` 为可选输出缓冲区，`param_3` 为缓冲区容量，`param_4` 为必需的输出长度指针；函数返回 64 位整数错误码。控制流显示它会先清零 `*param_4`，在有容量时清零输出首字节，调用内部 moments projection/serialization helper，成功时写回长度并复制投影字节。静态路径还观察到 `0x12`、`0x15`、`0x17` 等返回值，尚未能和公开 wire 错误枚举建立映射。REA 将五个类型都标为低置信度推断，且明确保留“需要 ABI probe 或导入元数据确认”的 residual unknowns。

这比“只有一个导出名字”更接近可验证的 ABI 边界，但仍缺少 `param_1` 的结构、SQLite statement 绑定方式、projection JSON 的完整约束、内存所有权和线程生命周期。因此不能把这段函数直接接到 Go bridge，也不能把它当作 Alpha 朋友圈读取已经恢复；当前仍只把它作为后续取得授权 row fixture/头文件时的定位线索。

### 原生 API 表获取函数的 ABI 边界

同一轮 REA/Ghidra 只读分析还检查了两个返回函数表的导出入口。它们提供了更具体的调用前置条件，但没有把未知函数指针暴露成可安全调用的 API。

`vendor/runtime/native/wcdb/libalpha_sqlcipher_readonly.dylib` 中的 `_alpha_sqlite_readonly_get_api`（文件 SHA-256 同上）入口为 `0x2260`，函数体范围为 `0x2260..0x246f`，长度 `0x210` 字节。REA 观察到它接受 `version`、`size` 和 `out_api` 三个参数；静态路径要求 `version == 1` 且 `size == 0xf8`，随后初始化一组 SQLite 只读函数指针。Evidence：`ev_31fe2a7da954c43b41166886bb8851fa75d1cfb89c86ecd4fac4dd4e30d4e0ff`（入口和函数边界）与 `ev_ea287d1f01e63baf41508ac0e5dde2481ebc062b33f20e9e75f31a262933bc01`（伪代码和 API 边界）。这只能证明版本/结构大小检查和函数表填充路径；具体结构字段顺序、每个指针的签名、返回码语义及调用后的对象生命周期仍未知。

`vendor/runtime/native/wcdb/libalpha_native.dylib`（SHA-256 `be2407e9e928cdf8ced0593834c680d3d49bf90926d2ebbe3abde82fdc5c011c`）中的 `_alpha_native_get_api` 入口为 `0x1cb0`，函数体范围为 `0x1cb0..0x1e17`，长度 360 字节。REA 推断其参数形状同样是 `(int version, uint32_t size, void *out_api)`：接受 `version == 1`，要求 `size >= 0x50`，最多按 `0x90` 初始化并写入多个内部函数指针；静态路径可见 `0`、`-2`、`-6` 等返回值候选。Evidence：`ev_2e912dcf0c66c750de4a23547dcc4629a68edcaf7e151950450008d0086fefe`（入口和函数边界）与 `ev_d1b8484debe650ce19d9d3b29186cbfabfc877afb4633d6cf3b6988e77bc2ed1`（伪代码和 API 边界）。参数类型、表字段语义、返回码映射和内部函数的线程/所有权约束仍是低置信度推断。

`vendor/runtime/manifests/alpha-wcdb.component.json` 只声明这两个 API 入口的 version 1 能力；manifest 名称和版本字段不等于完整 C ABI 签名，也不能替代随包当前复制范围内缺失的头文件正文。

这两个入口均未在本轮执行未知 ABI 调用，也没有向独立 bridge 注入返回的函数表。没有对应头文件、版本匹配的调用方或受控 fixture 前，不应仅凭 `size`/`version` 条件通过 `dlsym` 调用；否则无法判定崩溃、内存所有权或结果错误来自调用方还是原生组件。

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
