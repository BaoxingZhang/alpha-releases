# 独立状态备份与恢复

独立后端的 `stateDir` 保存账号选择、导出任务/计划、遥测同意等本地状态。可以使用项目自有的备份格式保存这些状态，用于迁移到另一个空目录：

```sh
npm run backup:independent-state -- --source /absolute/path/to/independent-state --target /absolute/path/to/alpha-state.alpha-backup
npm run restore:independent-state -- --source /absolute/path/to/alpha-state.alpha-backup --target /absolute/path/to/new-independent-state
```

两个命令都要求调用方提供规范化的绝对路径。源目录必须已存在且为私有目录（`0700`）；目标及其父目录不能是符号链接，目标必须不存在。备份目标不会覆盖已有文件，恢复先写入同级随机临时目录，完成逐文件 SHA-256/大小校验后以一次目录重命名发布。备份包和文件使用 `0600`，恢复目录使用 `0700`。

格式为 `alpha-independent-state-backup.v1`，manifest 记录状态 schema、项目版本、相对文件名、大小、模式、逐文件 SHA-256 和聚合摘要。manifest 不记录源绝对路径。备份仅接受当前独立后端的白名单状态文件；源目录中的 `snapshots/` 会被明确跳过，因为它们绑定原始数据源、可能包含明文 SQLite 副本，应通过显式快照导入重新生成。任意未知文件都会 fail-closed。

`password-lock.v1.json`、`official-plan-intent.v1.json`、数据库/数据密钥、密码、凭据、token、secret、临时和运行时文件均不会备份。该流程不扫描 `stateDir` 之外的目录，也不复制加密微信源目录、数据库 key 或真实运行时凭据。恢复不会覆盖已有目录；需要先由维护者明确选择一个新的空目标目录。

这是独立状态迁移工具，不代表原生 Alpha 的数据库备份、密钥导出或完整运行时恢复能力。恢复后仍需重新选择已授权数据源并按 [本地构建和运行说明](local-build-and-run.md) 做隔离验证。
