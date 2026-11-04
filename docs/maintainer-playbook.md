# 维护者操作手册

这份手册把恢复工程变成可重复维护的项目流程。它不扩大当前已经验证的功能范围。

## 日常开发

1. 从 `recovery/main` 或维护者自己的分支开始，确认 `git status` 干净。
2. 为新 checkout 配置只读上游远程（已有时只核对 URL）：`git remote add upstream https://github.com/xunchahaha/alpha-releases.git`，随后运行 `git fetch upstream --prune`。个人 fork 使用 `personal` 远程；不要把 `upstream/main` 合并到独立历史的 `recovery/main`，先运行 `npm run audit:upstream` 并按报告核对发行包和 provenance。
3. 运行 `nvm use`、`npm ci`；首次准备 Electron 和 esbuild 时运行 `npm run setup`。
4. 修改 `src/`、`packages/` 或 `scripts/`，同时更新相应测试和文档。
5. 对离线数据功能只使用 `npm run demo`、`npm run demo:encrypted` 或经授权的副本。默认启动器不会自动寻找个人微信目录。
6. 提交前先运行 `npm run verify:maintenance`，再按变更范围执行 [CONTRIBUTING.md](../CONTRIBUTING.md) 的完整检查清单。

需要快速查看当前恢复边界时运行 `npm run status`。它从版本、独立支持矩阵、原生 smoke 诊断和组件 manifest 生成机器可读或人类可读报告；该命令只读，不会扫描个人微信目录，也不会把 synthetic fixture 或协议入口算作原生功能。

接手新机器或新 checkout 时先运行 `npm run doctor`。它只检查 Node.js 24.15–24.x、macOS arm64、`package-lock.json`、`vendor/runtime` 以及 Electron/esbuild 安装；`npm run doctor -- --json` 输出固定的 `alpha-recovery-doctor.v1` 报告。报告的 `dataAccess` 固定为 `none`，不会读取个人微信数据、快照、密钥或 `.runtime` 状态。出现 `blocked` 时，按报告给出的 `nvm use`、`npm ci`、`npm run setup` 顺序修复后再构建。

接入已解密的 v4 副本前，可运行 `npm run inspect:source -- --data-dir /absolute/decrypted-v4 --account-id label --json`。它只对显式目录执行 bridge 的 `schema.inspect`，输出数据库相对路径、表和列元数据；不会读取数据库 key、修改副本或扫描用户目录。诊断始终标记 `complete=false` 与 `native_schema_supported=false`，只能用于决定后续适配工作，不能当作 Alpha 原生 schema 验证。

更完整的接入入口是 `npm run preflight:v4 -- --data-dir /absolute/decrypted-v4 --account-id sanitized-v4 --json`。它先执行 schema-only 诊断，再尝试 bridge；`ready`、`schema-only`、`unavailable` 和 `rejected` 的含义及处理步骤见 [v4 副本接入预检](v4-intake-preflight.md)。预检只接受静止的绝对目录，拒绝符号链接和 SQLite `-wal`/`-shm`/`-journal` 侧文件，不读取密钥或消息内容。

`npm run check:project` 还会核对 `package.json`、`package-lock.json` 和 `provenance/project-metadata.json` 的项目名称与版本；升级版本时必须同步修改三处，避免锁文件或维护元数据滞后。

需要核对上游是否出现新的发行材料时运行 `npm run audit:upstream`。它默认只打印当前公开仓库、release、更新策略和文件树的审计结果；只有确认结果后才使用 `--write` 更新 [`docs/upstream-alpha-releases-current.json`](upstream-alpha-releases-current.json)。如果本地保留原始 DMG，可额外传入 `--artifact` 做大小和 SHA-256 比对。该流程不会把新的发行包自动接入构建，也不会替换原生 runtime、签名、公钥或授权配置。

### 独立状态备份

迁移独立后端的本地元数据时，使用 [`state-backup-recovery.md`](state-backup-recovery.md) 中的显式命令：

```sh
npm run backup:independent-state -- --source /absolute/state --target /absolute/state.alpha-backup
npm run restore:independent-state -- --source /absolute/state.alpha-backup --target /absolute/new-state
```

源、归档和目标都必须由维护者明确指定为规范化绝对路径；源目录要求 `0700`，目标不能已存在，所有父级路径逐级拒绝符号链接。备份包只包含白名单状态 JSON，使用 manifest、逐文件 SHA-256 和聚合摘要；`snapshots/`、数据库/数据密钥、密码锁验证器、`official-plan-intent.v1.json` 和运行时凭据不进入包。未知或敏感文件会让备份失败关闭。恢复会先写入随机 `0700` 暂存目录，在完整校验后一次发布；临时清理按设备/ inode 所有权核对，避免删除并发抢占者创建的同名路径。该流程不复制加密微信源目录，恢复后需要重新绑定已授权数据源。

公开源码或发行材料前，使用 `npm run audit:public-release -- --root <sanitized-tree> --report <external-audit-report> --strict`。它扫描 `docs/` 和 `provenance/` 中的用户目录、临时目录、私钥块和常见访问令牌；取证材料需要显式 `--exclude`，不会自动认为它们安全，也不会改写原文件。

准备公开源码候选目录时，运行 `npm run prepare:public-source -- --output <external-candidate> --report <external-audit-report> --manifest <external-manifest>`。流程会在源仓库外创建一个不存在的新目录，复制时保留完整相对路径并排除生成目录和默认私有证据。默认排除包括机器生成的运行/构建报告、`packages/alpha-data-bridge/.runtime` Go 缓存、原生能力与 provenance 清单、上游本地安装包记录和恢复组件索引；这些文件可以留在内部取证仓库，但不应随公开候选发布。候选保留不含本机路径的 `docs/public-dependency-licenses.json` 和 `docs/chatlog-licenses/` 许可证材料供人工复核。流程随后用严格模式审计；可用重复的 `--exclude relative/path` 加入额外排除。报告和 manifest 只写入调用方指定的外部路径，输出、报告或 manifest 已存在，以及发现 symlink、用户路径或凭据时均失败关闭。`blocked-by-public-audit` 的候选目录可以用于修复和复核，但不修改原始证据；`ready-for-license-and-review` 也不等于许可证已选择或发布已获授权。

## 功能接手顺序

维护优先级按 [MAINTENANCE.md](../MAINTENANCE.md) 的领域表和验收标准确定。一个请求分支的协议绑定、界面入口或静态字符串都不足以证明功能已恢复。新增读取功能必须有：

- 已验证的请求/响应字段来源；
- 合成 fixture 或明确授权的真实样本；
- 成功、边界、损坏输入和数据源变化测试；
- 对 UI、导出或 HTTP/MCP 影响的说明。

缺少这些证据时，保留明确的 `UNIMPLEMENTED` 或 writer-disabled 状态，并在 `docs/source-gaps.md` 中记录需要的材料。

## 发布流程

在 macOS arm64 上按以下顺序运行：

```sh
npm run check:project
npm run verify:dependencies
npm run build:packaged
npm run package:macos-app:from-build
npm run package:macos-dmg:from-build
# 自有独立 flavor（双击启动时由包内 marker 选择独立后端）
npm run package:macos-app:independent:from-build
npm run package:macos-dmg:independent:from-build
npm run verify:packaged-markers
npm run release:manifest
npm run bundle:recovery
```

生成的 App 和 DMG 默认未签名、未公证，也不替代原生授权。发布前需要维护者自行完成代码签名、公证、更新服务和回滚验证；这些步骤当前没有被伪装成已完成。生成 `.runtime/release-manifest.json` 后运行 `npm run verify:release-manifest`，可在发布或归档前重新计算每个产物文件的大小、SHA-256、权限和总摘要。清单覆盖 `dist/app`、`build/runtime-bundle`、`workers/agent/dist` 以及独立 flavor 打包前的 `build/packaged-resources/independent`；后者记录复制进独立 App `Resources/independent` 的完整 backend 输入。

如果已经完成一次 `npm run build:packaged`，两个 `*-from-build` DMG 命令会复用同一套验证过的资源，避免原版和独立 flavor 分别再次重建；完整的一步式流程仍可使用 `npm run package:macos-dmg` 与 `npm run package:macos-dmg:independent`。

独立 flavor 会根据 [`provenance/independent-update-mode.json`](../provenance/independent-update-mode.json) 生成 `Contents/Resources/alpha-update-mode.json`；默认 `mode=disabled`，不会继承原作者的更新公钥和地址。维护者建立自有更新服务、Ed25519 根公钥和策略后，才可以把 provenance 配置改为 `configured`；修改后必须重新生成 manifest，并验证下载、签名、安装和回滚。

Go 数据桥和快照导入器的构建会显式使用 `-trimpath -buildvcs=false`，避免把本地 Git 时间戳和 dirty 状态写入二进制。维护者可运行 `npm run verify:reproducible-builds`，让两个 Go 产物各自连续构建两次并比较 SHA-256；该命令会刷新构建证据文件，但不接触原生运行时或用户数据。CI 将此检查作为 packaged 构建后的固定门禁。

两个 Go 构建脚本共享项目级原子锁 `.runtime/build-lock`，所以不要并行启动会重建 `build/data-bridge-source`、`build/snapshot-import-source` 或其验证报告的 npm 命令。锁记录当前进程 PID 和随机 owner token；进程退出后遗留的无主锁会在下一次构建中清理，等待超过默认 30 分钟则失败关闭。构建脚本释放锁前会完成验证报告写入，避免并行构建互相覆盖中间目录或报告。

## 证据与回滚

每次发布保留 `.runtime/release-manifest.json`、App manifest、恢复源码包 manifest 及 `docs/independent-validation-current.json`。恢复源码包的 archive 内容是可重复的，同一源码状态应产生相同 SHA-256；manifest 还记录项目名称/版本、`package-lock.json` SHA-256、Git 提交和原始 DMG 摘要，便于确认归档对应的依赖和源码状态。manifest 的生成时间仅用于记录本次归档。若验证失败，先回到上一个本地 Git 提交，确认 `npm run test:smoke` 的原生错误和 `npm run test:independent` 的独立后端状态分别记录，再定位变更。不要用删除测试、隐藏菜单或返回空数据来恢复绿色状态。

## 许可证与来源

修改前阅读 [项目元数据](../provenance/project-metadata.json) 和 [原生来源记录](native-runtime-provenance.json)。原包恢复内容、第三方依赖和自有新增代码的许可边界必须分开记录；在维护者选择新代码许可证前，不要对外宣称整个仓库是某个开源许可证下的完整源码。
