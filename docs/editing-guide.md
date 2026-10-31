# Alpha 0.3.5 恢复代码修改指南

本项目以安装包中实际交付的 JavaScript 为可编辑代码。`src/` 中的文件保留了交付产物的模块边界；它们不是原仓库的 TypeScript/TSX 源文件。可读函数名和 React 组件名有助于定位业务，但不能据此推回原始目录、类型定义、注释、测试和构建配置。

## 目录与入口

| 位置 | 用途 | 修改时的注意点 |
| --- | --- | --- |
| `src/main/index.js` | Electron 主进程：窗口、IPC、设置、更新、组件管理、原生引擎和网关调度 | 包含应用与第三方实现；先根据函数名和 IPC 通道定位，避免整包重写 |
| `src/preload/index.js` | 通过 `contextBridge` 暴露 `window.alpha` | 修改桥接方法时，同时检查 renderer 调用和 main 处理器 |
| `src/preload/image-viewer.js` | 图片窗口桥接 `window.alphaImageViewer` | 与图片窗口 renderer 配套 |
| `src/preload/notification.js` | 通知窗口桥接 `window.alphaNotification` | 与通知窗口 renderer 配套 |
| `src/renderer/index.html` | 主窗口 HTML 入口 | 保持 script、CSS 与资源相对路径可解析 |
| `src/renderer/assets/index-DPCwIOAb.js` | 主界面、页面组件、状态和交互 | React JSX 已变为 `jsxRuntimeExports.jsx/jsxs` 调用，可直接修改这些 JavaScript 调用 |
| `src/renderer/assets/client-Bg2hQ5uk.js` | React / ReactDOM 等公共运行时代码 | 通常不需要修改；不能当作业务组件源目录 |
| `src/renderer/assets/message-images-Dl-McHRQ.js` | 共享组件、图像显示与窗口相关辅助代码 | 被多个入口引用，改动需要检查主界面和图片窗口 |
| `src/renderer/assets/image-viewer-BiP1Iv4A.js` | 图片查看窗口 | 与对应 HTML、preload 共同构成独立入口 |
| `src/renderer/assets/notification-BiBtnUUc.js` | 通知窗口界面 | 与对应 HTML、preload 共同构成独立入口 |
| `src/renderer/assets/segments-CBPICGMn.js` | 消息文本分段辅助代码 | 主界面共享依赖 |
| `src/agent-host/index.cjs` | 随包交付的 agent-host JavaScript | 它与本地模型配置、网关和外部工具运行时有依赖关系 |
| `docs/native-source-gaps.json` | 原生运行时源码缺口 | 原生可执行文件可随项目复用，不代表其原始源码已恢复 |

编译输出位于 `dist/app/`；修改源文件应在 `src/` 完成，重新构建会覆盖生成目录。`dist/app/out/{main,preload,renderer}` 的相对层级需要保留：主进程通过自身路径寻找 preload 与 renderer，通过 `app.getAppPath()/../..` 定位开发运行时。新增自己的业务模块时可以使用正常 JavaScript 模块，但不要把这些新增模块描述成从原包恢复的原始文件。

新增模块时还需同步调整 `scripts/build.mjs`：当前 `bundle: false`，主进程和 agent-host 只编译既有固定入口，不会自动收集它们通过 `require()` 引用的新文件。将新增文件列入对应 entryPoints，并保持输出相对路径；新增非 JS 资源也要明确复制到构建产物。

## 从界面定位代码

以下是恢复初始版本的定位点；修改后以重新生成的索引或搜索结果为准。

| 功能 | 主 renderer 文件中的符号 | 初始行号 |
| --- | --- | ---: |
| 聊天 | `ChatPage` | 27664 |
| 联系人 | `ContactsPage` | 29164 |
| 收藏 | `FavoritesPage` | 30607 |
| 导出格式 | `CHAT_EXPORT_FORMATS` | 31910 |
| 朋友圈 | `MomentsPage` | 33590 |
| 媒体 | `MediaPage` | 33831 |
| 统计 | `AnalyticsPage` | 35872 |
| 高级功能 | `PremiumPage` | 40664 |
| 其他记录 | `RecordsPage` | 41886 |
| AI 助手 | `AgentPage` | 44602 |
| 导出 | `ExportPage` | 46321 |
| 设置 | `SettingsPage` | 51937 |
| 应用框架 | `AppShell` | 52502 |
| 应用入口 | `App` | 52827 |

示例：修改聊天页文案，可先搜索中文文案或 `ChatPage`，再检查附近的状态与事件处理。需要更改后端行为时，沿 `window.alpha.<方法>` 到 `src/preload/index.js` 中的 IPC 通道，再到 `src/main/index.js` 的对应处理器。不能仅凭界面按钮存在，就认定后端、授权、动态组件和平台能力已具备；例如高级功能仍受平台及组件可用性限制。

```sh
rg -n 'function ChatPage|function SettingsPage|function AppShell' src/renderer/assets/index-DPCwIOAb.js
rg -n 'contextBridge|ipcRenderer|ipcMain' src/preload/index.js src/main/index.js
```

## 代码索引

索引器只读取文本，不加载或执行目标应用代码，也不需要安装全局依赖。

```sh
npm run index
```

默认扫描项目 `src/`，输出：

- `docs/recovered-code-index.json`：文件摘要、SHA256、格式、静态 import/require、符号行号和范围。
- `docs/recovered-modules.tsv`：可在编辑器或表格工具中打开的文件清单。
- `docs/recovered-functions.tsv`：具名函数、可识别的箭头函数与类。
- `docs/recovered-components.tsv`：具有 React 调用证据的组件候选。

例如查找聊天和设置组件：

```sh
rg 'ChatPage|SettingsPage|AppShell' docs/recovered-components.tsv
```

要同时记录原始交付 bundle 的行号，显式传入保留的原始提取目录：

```sh
node tools/index-recovered-code.mjs \
  --original /Users/baoxingzhang/Desktop/temp/rea-alpha-0.3.5-20261101/extracted/out
```

只有相对路径匹配且整个文件 SHA256 相同，索引器才会标注原始行号。任何修改都会使该文件标为 `changed: original line mapping not asserted`，仍保留当前 `src/` 行号；不会把改动后的行号冒充原始位置。`agent-host/index.cjs` 不在这个 `extracted/out` 对照根中，因此其原始位置为空。重新运行不带 `--original` 的命令时，会更新当前代码导航信息并清空原包位置字段。

初始索引包括 11 个 JavaScript 模块、5806 个函数或类和 562 个 React 组件候选，其中 10 个模块与所给原始对照目录逐字节一致。候选包含第三方组件，数字不代表 Alpha 自有组件数量。索引采用词法规则而非完整 AST；匿名回调、类方法、计算型 import、复杂跨行箭头函数和模板表达式可能遗漏，范围和组件判断应结合代码核对。

## 修改、构建与验证

1. 先保留需要修改文件的基线，作小范围修改。保留 renderer 的 chunk 文件名、导入关系和 HTML 引用，除非同时更新所有引用。
2. 运行 `npm run build` 生成 `dist/app/`。本步骤是重新编译恢复后的 JavaScript；生成的 source map 只能定位到当前恢复代码。
3. 运行 `npm run test:smoke` 检查恢复项目提供的最小启动路径。测试结果仅代表脚本实际覆盖范围；数据读取、动态组件、模型下载和第三方连接需要单独验证。
4. 运行 `npm start` 使用本地恢复项目。原生库与运行时的来源、路径和限制以项目运行文档及 `docs/native-runtime-provenance.json` 为准。
5. 修改结束后重新生成索引；需要保留原始对应关系时使用上面的 `--original` 命令。

原包内没有发现原始 source map、TypeScript/TSX 源码、tsconfig 或 Vite 工程配置。已丢失的类型、原始模块边界、注释、构建插件配置、单元测试和原生工程不能通过格式化 JavaScript 自动还原。可以逐步把业务逻辑迁移到新模块并补齐测试，但应记录为恢复项目的新实现，保留可核对的原始交付文件作为依据。
