# 手动密钥与离线加密快照

独立后端新增 `importDatabaseKey`：在原首次设置页输入已有数据库密钥，将显式配置的微信 v4 加密离线副本解密为本机快照，再通过自有只读桥接显示联系人、会话和消息。原生导入器是新编写的可编译 Go 模块，不调用原 Alpha 的密钥组件。

## 本地演示

```sh
npm run build:independent
npm run demo:encrypted
```

终端会显示一把**仅用于合成演示数据**的密钥。界面中勾选本地数据说明，输入该密钥并点击“验证并连接”，跳过图片密钥步骤，完成向导后打开“合成联系人甲”。每次演示使用独立配置目录，不读取个人微信数据。

显式离线副本入口：

在新 checkout 或尚未构建本地独立后端的环境中，先运行 `npm run build:independent`；构建完成后再执行下面的启动命令。

```sh
npm run start:independent -- --session my-offline-copy \
  --encrypted-dir /absolute/project/.runtime/my-encrypted-copy \
  --account-id my-dataset-label
```

目录必须位于本工程 `.runtime/` 内，路径不能包含符号链接。账号标签只标识该数据集，不表示经过微信登录认证。密钥从页面输入，不应写入命令参数、环境变量或持久配置。

如果源目录仍是加密状态且需要先生成一个静止副本，可运行：

```sh
npm run stage:encrypted-v4 -- \
  --source-dir /absolute/authorized-encrypted-v4 \
  --account-id my-dataset-label \
  --target-name my-dataset-label \
  --json
```

该命令会把 regular files 原子复制到项目内
`.runtime/v4-encrypted-static/my-dataset-label`，排除 `-wal`、`-shm` 和
`-journal`，并写入带 SHA-256 的相对路径 manifest。它不会解密，也不证明数据库
schema 可读；发布结果必须再通过本节的合法 key 导入流程，不能把该目录直接作为
明文 `--data-dir` 使用。加密副本和 key 都不应提交到 Git。

当前支持一个固定格式：4096 字节页、80 字节 reserve、PBKDF2-HMAC-SHA512 256000 次、AES-256-CBC、逐页 HMAC-SHA512。仅导入 `contact.db`、`session.db`、`message.db` 和 `message_N.db`，保留目录层级。它还不是通用 SQLCipher 导入器；其他版本、每库不同密钥、活动 WAL/SHM/journal 和实时数据库均不支持。

## 处理与存储

1. 账号先报告 `discovered / waiting_for_key`，此时不能选择成可读账号。
2. 密钥通过子进程 stdin 传递。每页先验 HMAC，再解密；任何页失败则拒绝整个导入。
3. 所有数据库必须通过只读 `PRAGMA integrity_check`，并重新核对源文件集合、身份和哈希。源文件不修改。
4. 原生导入器在私有临时目录完成输出，用 macOS 不覆盖目标的整目录原子重命名发布。引擎验证实际输出哈希及桥接读取后才保存快照索引、报告账号可读。
5. 重启复用之前会核对源指纹、快照路径、文件权限与明文哈希。开启应用锁后，必须先解锁才会检查和打开数据。
6. 导入期间仍可查询锁状态或锁定应用；取消/关闭会停止导入子进程、等待退出并清理本次临时目录。错误密钥可重新输入。

快照位于 `.runtime/<session>/userData/independent/snapshots/snapshot-<uuid>/data/`。快照索引仍沿用文件名 `manifest.v1.json`，内容 schema 为 version 2。目录权限 0700，文件权限 0600。密钥不会写入快照索引、应用配置或日志；可变密钥缓冲区在请求结束时清零，但不承诺清除 JavaScript/Go 运行时中的全部内存副本。

**快照是明文 SQLite，应用锁不加密磁盘文件。** 锁保护应用读取接口；磁盘访问保护依赖本机权限和系统磁盘加密。当前没有凭据保险库。强制杀死整个应用进程树、断电或系统崩溃可能留下私有未完成目录；正常失败、取消及关闭路径会清理，不承诺所有崩溃情形都能回滚。

## 验证与后续缺口

```sh
npm test
npm run test:encrypted
npm run test:independent
npm run test:smoke
```

早期加密导入阶段记录的 `npm test` 共 79 项全部通过，另有导入器 5 组 Go 单测通过；当前仓库全量回归为 367/367，详见[维护路线图](maintenance-roadmap.md)。加密测试数据由 Node crypto 独立生成；SQLite C API 先分配 reserve 80，随后重新组织数据库页，不截断普通 SQLite 页。Go 解密后的四个库与独立明文基准逐字节一致。测试覆盖错误密钥、篡改页、路径/符号链接/活动日志、取消、锁、manifest 篡改、重启复用和密钥未持久化，汇总见 [encrypted-validation.json](encrypted-validation.json)。

桌面队列在独立模式下允许导入与锁控制同时在途；原模式仍使用原队列策略。实际 Electron 测试暂停本应用的 Go 导入子进程，确认锁状态仍可返回、锁定可取消导入并清理工作目录；解锁后此前已提交的快照仍可读取。

桌面实测保存为 [encrypted-run.json](encrypted-run.json)、[截图](encrypted-run.png) 和 [日志](encrypted-run.log)。原包模式的后端状态仍单独记录在 [local-run.json](local-run.json)。

本阶段没有取得原作者 Rust/C++ 源码，也没有验证真实微信样本、自动取钥、实时快照与 WAL 合并、媒体解密、完整消息语义、搜索、导出、AI 或写入操作。全部功能仍按 [MAINTENANCE.md](../MAINTENANCE.md) 保留在接手范围内；本阶段增加一个已实现请求分支，不能据此换算完整产品的完成百分比。
