# 维护者操作手册

这份手册把恢复工程变成可重复维护的项目流程。它不扩大当前已经验证的功能范围。

## 日常开发

1. 从 `recovery/main` 或维护者自己的分支开始，确认 `git status` 干净。
2. 运行 `nvm use`、`npm ci`；首次准备 Electron 和 esbuild 时运行 `npm run setup`。
3. 修改 `src/`、`packages/` 或 `scripts/`，同时更新相应测试和文档。
4. 对离线数据功能只使用 `npm run demo`、`npm run demo:encrypted` 或经授权的副本。默认启动器不会自动寻找个人微信目录。
5. 提交前执行 [CONTRIBUTING.md](../CONTRIBUTING.md) 的检查清单。

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
npm run build:packaged
npm run package:macos-app:from-build
npm run package:macos-dmg
npm run release:manifest
npm run bundle:recovery
```

生成的 App 和 DMG 默认未签名、未公证，也不替代原生授权。发布前需要维护者自行完成代码签名、公证、更新服务和回滚验证；这些步骤当前没有被伪装成已完成。

## 证据与回滚

每次发布保留 `.runtime/release-manifest.json`、App manifest、恢复源码包 manifest 及 `docs/independent-validation-current.json`。若验证失败，先回到上一个本地 Git 提交，确认 `npm run test:smoke` 的原生错误和 `npm run test:independent` 的独立后端状态分别记录，再定位变更。不要用删除测试、隐藏菜单或返回空数据来恢复绿色状态。

## 许可证与来源

修改前阅读 [项目元数据](../provenance/project-metadata.json) 和 [原生来源记录](native-runtime-provenance.json)。原包恢复内容、第三方依赖和自有新增代码的许可边界必须分开记录；在维护者选择新代码许可证前，不要对外宣称整个仓库是某个开源许可证下的完整源码。
