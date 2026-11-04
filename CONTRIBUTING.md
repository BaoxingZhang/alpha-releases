# 维护与贡献

这个仓库是 Alpha 0.3.5 macOS arm64 安装包的个人维护工程。它包含从安装包恢复的应用层代码、保留来源的原生运行时，以及独立实现的可维护后端。上游发行仓库没有发布完整应用源码或明确的开源许可证，因此提交不能把恢复代码重新标记为上游开源代码。文件分层和公开发布门槛见 [许可证与来源边界](docs/licensing-and-provenance.md)。

## 开始前

1. 使用 `.nvmrc` 指定的 Node.js 24.21.0，并运行 `npm ci`。
2. 阅读 [项目维护元数据](provenance/project-metadata.json)、[维护范围](MAINTENANCE.md) 和 [缺口清单](docs/source-gaps.md)。
3. 只使用合成 fixture 或已明确授权的测试副本。不要把个人微信数据、密钥、模型凭据或运行时状态提交到仓库。

## 修改边界

- `src/`、`packages/`、`scripts/` 和测试是可维护源码；修改后通过对应构建和测试验证。
- `vendor/runtime/` 是原包二进制来源副本，只能在有证据且能更新 provenance、哈希和许可记录时变更。
- `dist/`、`build/`、`workers/agent/dist/` 和 `.runtime/` 是生成目录，不手工编辑或提交。
- 不用空列表、固定成功值或猜测 SQL 冒充尚未取得 schema/fixture 的功能。未实现能力必须继续返回明确的错误状态。

## 提交前检查

先运行只读维护检查聚合入口：

```sh
npm run verify:maintenance
```

它依次执行项目元数据、维护性、协议绑定、原包 vendor、独立支持矩阵和 HTTP/MCP API 结构检查；它不构建 App、不读取数据目录，也不运行依赖审计。涉及构建、发布、依赖或原生启动的变更仍需继续执行下面的对应检查。

```sh
npm run check:project
npm run check:maintainability
npm test
npm run test:independent
npm run test:packaged-independent
npm run test:packaged-native
npm run test:smoke
npm run audit:api
npm run verify:independent-support
npm run audit:native-abi
npm run audit:public-release -- --root /path/to/sanitized-tree --report /tmp/alpha-public-release-audit.json --strict
npm run verify:protocol
npm run verify:vendor
npm run verify:release-manifest
npm run verify:dependencies
git diff --check
```

如果改动涉及 `src/`、主进程/preload、独立后端或打包资源，必须在 macOS arm64 上先运行 `npm run build:packaged`，再运行两个 packaged smoke。`test:packaged-independent` 证明独立 app 能从打包资源启动并通过 renderer→preload→main IPC 读取合成副本；`test:packaged-native` 只证明临时 HOME 下原生 engine/native-host 握手成功，不证明真实账号、项目 Seatbelt 或业务功能已恢复。涉及发布产物时还要按顺序运行：

```sh
npm run verify:reproducible-builds
npm run package:macos-app:from-build
npm run package:macos-app:independent:from-build
npm run verify:packaged-markers
npm run release:manifest
npm run verify:release-manifest
```

打包和 smoke 会更新 `docs/*-run.*`、build 证据和 `.runtime` 产物；提交前恢复无关生成物，只提交源码、测试和必要的维护文档。

如果变更涉及上游版本、原始安装包或更新策略，先运行 `npm run audit:upstream`；确认公开材料和本地 DMG 一致后，才使用 `npm run audit:upstream -- --write` 更新 provenance。该命令不会自动下载或替换运行时。

如果只修改某一层，也要运行该层的针对性测试，并在提交说明中记录未运行的检查及原因。原包 smoke 的 UI 成功不等于原生 backend ready；请同时记录 `docs/local-run.json` 中的实际 backend 状态。

对外发布前，把待发布的脱敏树作为 `--root` 运行 `npm run audit:public-release`。默认模式只报告问题；加 `--strict` 时发现本机绝对路径、私钥块或明显访问令牌会返回非零状态。REA/Ghidra 取证目录等私有材料只能通过显式重复的 `--exclude relative/path` 排除，并应保留在受控私有归档中。报告只保存相对路径和 `[redacted]` 标记，不会改写源文件。

需要从当前维护树建立可复核的公开源码候选目录时，使用 `npm run prepare:public-source -- --output /tmp/alpha-public-source-candidate --report /tmp/alpha-public-source-audit.json --manifest /tmp/alpha-public-source-manifest.json`。它复制并筛选到源仓库外的新目录后运行严格审计；候选目录、报告和 manifest 都不能覆盖已有路径，也不能位于源仓库内。审计失败会返回非零状态并保留脱敏报告，不修改原始 evidence。通过只代表可以进入许可证和人工审核阶段，不代表已经取得许可证或可以直接发布。

## 提交说明

提交应说明：变更目标、证据来源、测试命令、未恢复的边界，以及是否改变了原包文件或许可证边界。涉及新功能时，先在 `MAINTENANCE.md` 的对应行补充验收标准，再实现代码。
