# 独立文件附件恢复边界

独立后端现在支持显式 `media-index.v1.json` 中 `kind=file` 条目的只读附件保存和打开。它复用消息 `refs` 里的 `alpha-media://sha256/<sha256>` URI，并且只有在账号、会话、消息和 renderer grant 已绑定时才会注册附件权限。

主进程先检查传统的 `files/<sha256>.bin` 缓存；仅当该目录不存在或没有对应文件时，才读取调用方明确选择的数据根目录下的 `media-index.v1.json`。索引 fallback 不扫描其他目录，也不接受 Alpha 原生 `media1_` token。每次定位会重新校验 manifest、账号、唯一条目、相对路径、文件大小、SHA-256、父目录和 symlink；复制过程中还会重新读取并校验文件，锁、generation 或 renderer grant 变化会撤销操作。

附件保存仍使用现有的另存为 IPC，打开仍使用临时目录复制后再调用系统打开或显示位置。文件名沿用消息 display 元数据；可执行扩展名继续禁止直接打开。实现上限为 64 MiB，超过上限、缺失、重复、路径异常、哈希不匹配或索引损坏都会 fail closed。

这条链路证明的是自有 SHA-256 索引和 synthetic/独立消息 DTO 的只读附件能力，不证明真实微信附件表、`media1_` token、DAT/AES 解码、远程补齐、写入或发送语义。测试见 [`tests/file-attachment-index.test.mjs`](../tests/file-attachment-index.test.mjs)。

当前 Go bridge 只在 bounded `type=6` display envelope 已验证且正文带显式 `sha256` synthetic marker 时生成 `kind=file` ref；这条 marker 不是原生 `filemd5` 或路径语义。主进程 fallback 仍不会从任意文件 XML 或本地目录猜测附件。现有测试覆盖 bridge marker gate、索引读取、哈希、路径、账号和 grant 边界；真实 file message schema 和原生 token 仍列为后续缺口。

打包验证还确认独立版 `.app` 的 packaged resources 含有该模块。组装器会把 Electron 模板的可执行文件重命名为 `AlphaRecoveredIndependent` 并同步更新 `CFBundleExecutable`，因此从生成的 `.app` 二进制启动时 `app.isPackaged=true`，实际走 `Resources/independent`。`tests/packaged-independent-smoke.mjs` 进一步通过 packaged renderer→preload→main IPC 读取一次性 fixture，检查 marker、`alpha-independent-engine` ready、账号和消息，并在完成真实离线向导后读取已绑定图片、渲染图片预览和打开文件附件；这只证明自有独立 fixture 链路，不扩大真实微信/native 能力边界。
