# 维护与贡献

这个仓库是 Alpha 0.3.5 macOS arm64 安装包的个人维护工程。它包含从安装包恢复的应用层代码、保留来源的原生运行时，以及独立实现的可维护后端。上游发行仓库没有发布完整应用源码或明确的开源许可证，因此提交不能把恢复代码重新标记为上游开源代码。

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

```sh
npm run check:project
npm run check:maintainability
npm test
npm run test:independent
npm run test:smoke
npm run verify:protocol
npm run verify:vendor
git diff --check
```

如果只修改某一层，也要运行该层的针对性测试，并在提交说明中记录未运行的检查及原因。原包 smoke 的 UI 成功不等于原生 backend ready；请同时记录 `docs/local-run.json` 中的实际 backend 状态。

## 提交说明

提交应说明：变更目标、证据来源、测试命令、未恢复的边界，以及是否改变了原包文件或许可证边界。涉及新功能时，先在 `MAINTENANCE.md` 的对应行补充验收标准，再实现代码。
