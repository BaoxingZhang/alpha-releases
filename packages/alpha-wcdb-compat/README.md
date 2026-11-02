# 可选第三方 WCDB 兼容探针

这个目录提供一个**显式路径、隔离、只读优先**的 WeFlow `wcdb_*` C ABI 探针。它不复制 WeFlow 源码或二进制，也不自动发现用户目录中的库；调用方必须明确传入探针可执行文件、动态库、账号目录和数据库密钥。

探针当前支持：

- 检查生命周期符号和已知可选符号是否存在；
- 在调用方明确提供账号目录和 64 位十六进制密钥时，调用 `wcdb_get_sns_timeline` 并返回原始 JSON；
- 将结果固定标记为 `sourceKind=explicit-third-party-wcdb`、`nativeSchemaSupported=false`、`complete=false`、`writer=false`。

它不能证明 WeFlow ABI 与 Alpha 原生 ABI 相同，也不会调用 Alpha 的 `_alpha_native_get_api`。没有真实账号目录、密钥和版本匹配的第三方库时，功能保持不可用。

编译 macOS arm64 探针：

```sh
npm run build:wcdb-compat-probe
```

构建产物只写入 `.runtime/candidates/`，不会进入 Git。WeFlow 及其 fork 的源码和组件通常使用 CC BY-NC-SA 4.0；本探针不因此改变 Alpha 恢复工程的许可证边界。
