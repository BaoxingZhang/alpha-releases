# 维护者操作手册

这份手册把恢复工程变成可重复维护的项目流程。它不扩大当前已经验证的功能范围。

## 日常开发

1. 从 `recovery/main` 或维护者自己的分支开始，确认 `git status` 干净。
2. 运行 `nvm use`、`npm ci`；首次准备 Electron 和 esbuild 时运行 `npm run setup`。
3. 修改 `src/`、`packages/` 或 `scripts/`，同时更新相应测试和文档。
4. 对离线数据功能只使用 `npm run demo`、`npm run demo:encrypted` 或经授权的副本。默认启动器不会自动寻找个人微信目录。
5. 提交前执行 [CONTRIBUTING.md](../CONTRIBUTING.md) 的检查清单。

需要核对上游是否出现新的发行材料时运行 `npm run audit:upstream`。它默认只打印当前公开仓库、release、更新策略和文件树的审计结果；只有确认结果后才使用 `--write` 更新 [`docs/upstream-alpha-releases-current.json`](upstream-alpha-releases-current.json)。如果本地保留原始 DMG，可额外传入 `--artifact` 做大小和 SHA-256 比对。该流程不会把新的发行包自动接入构建，也不会替换原生 runtime、签名、公钥或授权配置。

公开源码或发行材料前，使用 `npm run audit:public-release -- --root <sanitized-tree> --report <external-audit-report> --strict`。它扫描 `docs/` 和 `provenance/` 中的用户目录、临时目录、私钥块和常见访问令牌；取证材料需要显式 `--exclude`，不会自动认为它们安全，也不会改写原文件。

准备公开源码候选目录时，运行 `npm run prepare:public-source -- --output <external-candidate> --report <external-audit-report> --manifest <external-manifest>`。流程会在源仓库外创建一个不存在的新目录，复制时保留完整相对路径并排除生成目录和默认私有证据。默认排除包括机器生成的运行/构建报告、原生能力与 provenance 清单、上游本地安装包记录和恢复组件索引；这些文件可以留在内部取证仓库，但不应随公开候选发布。流程随后用严格模式审计；可用重复的 `--exclude relative/path` 加入额外排除。报告和 manifest 只写入调用方指定的外部路径，输出、报告或 manifest 已存在，以及发现 symlink、用户路径或凭据时均失败关闭。`blocked-by-public-audit` 的候选目录可以用于修复和复核，但不修改原始证据；`ready-for-license-and-review` 也不等于许可证已选择或发布已获授权。

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
npm run package:macos-dmg
# 自有独立 flavor（双击启动时由包内 marker 选择独立后端）
npm run package:macos-app:independent:from-build
npm run package:macos-dmg:independent
npm run verify:packaged-markers
npm run release:manifest
npm run bundle:recovery
```

生成的 App 和 DMG 默认未签名、未公证，也不替代原生授权。发布前需要维护者自行完成代码签名、公证、更新服务和回滚验证；这些步骤当前没有被伪装成已完成。生成 `.runtime/release-manifest.json` 后运行 `npm run verify:release-manifest`，可在发布或归档前重新计算每个产物文件的大小、SHA-256、权限和总摘要。清单覆盖 `dist/app`、`build/runtime-bundle`、`workers/agent/dist` 以及独立 flavor 打包前的 `build/packaged-resources/independent`；后者记录复制进独立 App `Resources/independent` 的完整 backend 输入。

独立 flavor 会根据 [`provenance/independent-update-mode.json`](../provenance/independent-update-mode.json) 生成 `Contents/Resources/alpha-update-mode.json`；默认 `mode=disabled`，不会继承原作者的更新公钥和地址。维护者建立自有更新服务、Ed25519 根公钥和策略后，才可以把 provenance 配置改为 `configured`；修改后必须重新生成 manifest，并验证下载、签名、安装和回滚。

## 证据与回滚

每次发布保留 `.runtime/release-manifest.json`、App manifest、恢复源码包 manifest 及 `docs/independent-validation-current.json`。恢复源码包的 archive 内容是可重复的，同一源码状态应产生相同 SHA-256；manifest 的生成时间仅用于记录本次归档。若验证失败，先回到上一个本地 Git 提交，确认 `npm run test:smoke` 的原生错误和 `npm run test:independent` 的独立后端状态分别记录，再定位变更。不要用删除测试、隐藏菜单或返回空数据来恢复绿色状态。

## 许可证与来源

修改前阅读 [项目元数据](../provenance/project-metadata.json) 和 [原生来源记录](native-runtime-provenance.json)。原包恢复内容、第三方依赖和自有新增代码的许可边界必须分开记录；在维护者选择新代码许可证前，不要对外宣称整个仓库是某个开源许可证下的完整源码。
