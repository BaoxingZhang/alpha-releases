# Alpha 离线 SQLCipher v4 快照导入器

这是独立维护的手动密钥导入模块。它接收用户已经合法取得的 32 字节 key，不自动扫描进程、不读取 Keychain、不修改 SIP，也不访问实时微信数据库。输入必须是静止的 macOS 微信 v4 SQLCipher4 数据库副本；输出完成后可交给 `alpha-data-bridge` 做只读查询。

## 构建

在工程根目录执行：

```sh
node scripts/build-snapshot-import.mjs
```

构建使用项目内已校验的 Go 1.24.13、CGo 和缓存，测试源码副本后生成 [macOS arm64 程序](../../build/candidates/alpha-snapshot-import)。构建报告在 `build/candidates/snapshot-import-build.json`，不会运行解密操作，也不会读取真实数据。

## 输入和输出

```sh
build/candidates/alpha-snapshot-import \
  --source-dir /absolute/encrypted-copy \
  --output-dir /absolute/new-output < key.json
```

stdin 只能有一行 JSON：

```json
{"keyHex":"64位十六进制数据库密钥"}
```

密钥不接受 argv 或环境变量，日志不回显密钥。成功时 stdout 只有一条不含密钥的 summary：

```json
{"ok":true,"profile":"wechat-v4-sqlcipher4-4096-kdf256000","outputDir":"/absolute/new-output","sourceFingerprint":"…","sourceUnchanged":true,"reservedBytesZeroed":true,"databases":[{"relativePath":"contact/contact.db","sourceSha256":"…","outputSha256":"…","bytes":4096,"pages":1}]}
```

输出保留输入库相对路径，目录权限 0700、文件权限 0600。输出父目录必须已经存在，输出路径必须不存在；全部数据库先写入该父目录下随机的 `.alpha-snapshot-*` 私有临时目录。完成每页认证、SQLite 完整性检查及源目录复核后，用 macOS SDK 的 `renamex_np(..., RENAME_EXCL)` 一次发布整个目录。输出可见性以这一次重命名为提交点：目标出现时包含完整快照，并发创建的目标也不会被覆盖。程序不采用逐文件移动或可覆盖的 rename 降级。

提交点前失败或收到 SIGINT/SIGTERM 会取消操作并清理临时明文；等待 stdin 时也可取消，固定 PBKDF2 运算会在返回后检查取消。提交点后的取消不回滚已完整发布的快照。SIGKILL、断电和系统崩溃不能保证执行清理；engine 因此应使用独占工作目录并负责其生命周期。目录发布的原子可见性不等于断电耐久性保证。

## 固定算法边界

本模块实现的是已限定 profile，不声称覆盖其他 SQLCipher 版本：4096 字节页、每页保留 80 字节、PBKDF2-HMAC-SHA512 迭代 256000、32 字节 key、AES-256-CBC、16 字节 IV、64 字节 HMAC-SHA512。数据库第一页前 16 字节是 salt；MAC key 是以 `salt XOR 0x3a` 再做两轮 PBKDF2 的派生值。每页 HMAC 覆盖该页待解密区域、IV 和小端 32 位页号（从 1 开始）。页 1 从 salt 后开始验证，其他页从页首验证。

每一页必须完整读取、HMAC 验证、AES 解密；截断、错误 key、错误 HMAC、全零页和非块对齐输入均失败。加密文件中保存的 80 字节 reserve 区包含 IV/HMAC，解密输出将这段区清零，然后用只读 SQLite `PRAGMA integrity_check` 验证所有数据库。这里的解密副本属于用户授权输入，不能把“能解密”理解成已完成 Alpha 的 schema、媒体或业务功能。

源目录及所有祖先/成员拒绝符号链接；目标库的 WAL/SHM/journal、路径逃逸、FIFO/设备/socket 等特殊成员均被拒绝。普通非目标文件不复制，仍纳入成员元数据快照。完整目录路径集、inode、权限、大小和 mtime 在导入前后复核；所有目标库额外复核 SHA-256，新增分库或其他成员也失败。打开源文件使用只读、O_NOFOLLOW、O_NONBLOCK，并通过 fstat 确认常规文件及原 inode，避免 FIFO 替换导致阻塞。源与输出目录不能互相包含；已有输出绝不覆盖。单库上限 128 GiB，总目标库上限 512 GiB，目录树最多 10,000 个成员、最多 8 层分隔符；这些是拒绝阈值，未代表大数据性能已经验收。静态副本检查不能代替文件系统快照，也不保证对同权限恶意进程瞬时交换路径的完全防护。`sourceFingerprint` 是按相对路径排序后连接 `relativePath + NUL + sourceSha256 + LF` 的 SHA-256，不含 key。

输入限制为一行 JSON 后 EOF（最多 16 KiB），拒绝额外对象、额外行及流读取错误；SQLite 文件 URI 正确编码 `?`、`#`、`%` 等路径字符。原始 key、派生 AES/HMAC 字节缓冲区会在退出作用域时清零；Go JSON/字符串转换、密码库内部副本与运行时内存不能承诺彻底清零，因此不把此措施描述为硬件级密钥隔离。

错误只写 stderr 的固定错误码和短消息，退出码 2。重点错误包括 `KEY_INPUT_INVALID`、`KEY_AUTHENTICATION_FAILED`、`TRUNCATED_DATABASE`、`SOURCE_CHANGED`、`SYMLINK_DENIED`、`ACTIVE_DATABASE_DENIED`、`OUTPUT_EXISTS`、`PATH_OVERLAP`、`SOURCE_TYPE_DENIED`、`DATASET_TOO_LARGE`、`IMPORT_CANCELED`、`SCHEMA_PROFILE_UNSUPPORTED`、`SQLITE_INTEGRITY_FAILED` 和 `OUTPUT_PUBLISH_FAILED`。当前没有真实 key/数据库测试；测试应使用 `tests/encrypted-fixture.mjs` 生成的合成数据库，并将成功输出交给 bridge 验证。

## 针对边界的验证

```sh
node scripts/build-snapshot-import.mjs
node --test tests/snapshot-import.test.mjs tests/import-boundary.test.mjs
```

构建运行 Go 单测，覆盖独占目录发布/已存在空目标、严格 key 输入、成员/哈希变更、取消与容量阈值。Node 测试使用独立生成的合成 SQLCipher 多页库，检查正确 key 的完整输出及真实 bridge 查询、错误 key/损坏/全零页/截断失败、路径及只读边界。发布测试在私有临时明文已经出现后暂停真实导入进程，确认最终目标仍不存在，再恢复并监测完整目标出现；另实际发送 SIGTERM 检查取消和清理，并并发创建目标、添加源分库/目录/普通文件验证失败路径。测试不访问真实账号/密钥/微信数据库。最终结果以实际命令输出为准。
