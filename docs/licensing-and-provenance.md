# 许可证与来源边界

这份恢复工程可以由维护者继续编译、测试和修改，但当前仓库没有整体许可证，也没有证据表明上游 `alpha-releases` 发布了 Alpha 应用源码或再分发许可。严格公开候选审计通过，只表示候选树不含已检测的本机路径、私钥块和明显访问令牌；它不等于取得上游代码、二进制、商标或安装包的授权。

## 文件来源分层

| 层 | 当前内容 | 当前处理 | 公开发布前的门槛 |
| --- | --- | --- | --- |
| 恢复的上游应用层 | `src/` 中从 Alpha 安装包提取的 JavaScript、页面资源和对应 provenance | 保留原始哈希与来源记录；不把它标成新的开源代码 | 取得权利人许可，或从候选中移除/替换 |
| 上游原生运行时 | `vendor/runtime/` 中的可执行文件、动态库、签名和 manifest | 只做哈希核验和兼容性研究；不重新签名、不改变字节 | 取得再分发许可，或发布时排除 |
| 本项目独立实现 | `packages/`、`scripts/`、新增测试和维护文档中由本项目编写的代码 | 可继续内部维护；当前没有声明具体许可证 | 维护者选择许可证并明确适用文件范围 |
| 第三方依赖 | npm 锁定依赖、Go 模块、Electron、protobuf、Chatlog 子模块和保留的许可文件 | 保留上游版权、许可证和 NOTICE；以 `docs/public-dependency-licenses.json` 和 `docs/chatlog-licenses/` 为索引 | 重新核对版本、许可证和 NOTICE，按各自条款随发行物提供 |
| 品牌和安装包材料 | Alpha 名称、图标、截图、原始 DMG 摘要和发行文档 | 用于来源识别和兼容性记录；不表示商标或发行授权 | 发布前完成品牌、商标和安装包再分发审查 |

## 当前结论

- `package.json` 保持 `private: true`，没有 `license`、`author` 或 `repository` 字段；这反映当前权利边界，不是遗漏的开源许可。
- `provenance/project-metadata.json` 记录了原始 DMG 摘要，并将上游应用许可证标为 `not-published-in-release-repository`。
- `README.md`、`CONTRIBUTING.md` 和 [公共源码候选](public-source-candidates.md) 均要求把恢复代码、原生 runtime、独立实现和第三方材料分开处理。
- 个人 fork 的 `recovery` 分支适合作为内部维护和人工审阅分支。公开候选即使严格审计为 0 findings，也仍需完成许可证、来源、品牌、依赖和二进制再分发审查。

## 维护者的公开发布决策

在创建公开源码发行版前，维护者需要逐项记录：

1. 本项目独立实现的文件范围和拟采用的许可证；
2. 恢复的上游应用层是否获得书面许可，或是否从发行树中移除；
3. `vendor/runtime/`、原始 DMG、签名材料和品牌资源是否获得再分发许可；
4. 第三方依赖的许可证、版权声明和 NOTICE 是否随发行物保留；
5. 发布树是否经过 `npm run prepare:public-source` 和 `npm run audit:public-release -- --strict`，以及人工复核是否通过。

在这些事项完成前，不应把当前 recovery 分支标为“完整开源 Alpha”或公开可再分发安装包。此文档是工程维护记录，不构成法律意见；涉及上游代码、二进制、商标或个人数据时，应取得相应权利人的明确许可并进行独立审查。
