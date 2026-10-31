# Alpha 协议模块

这是从恢复代码经 AST 依赖闭包提取的独立 Node.js 模块。它保留真实 protobuf 编解码器、4 字节大端长度分帧器和 preload IPC 通道常量。导入时只加载 `@bufbuild/protobuf/wire`，不导入 Electron，不执行 `src/main/index.js`，不启动原生进程。

本模块不提供后端实现、许可、握手证明或伪造的 ready 状态。能编解码一个请求不表示该请求已被原生引擎接受。

维护扩展：独立搜索在 `SearchMessagesResponse` 中增加字段 100 `incomplete`、101 `unreadableMessages`（uint64）、102 `unmappedTables`（uint32），用于明确部分搜索结果。原包不提供这些字段；缺省值为 false/0/0，原模式桌面转换忽略它们。它们是本项目新增协议，并非从原 Alpha 恢复出来的功能。具体定义先修改 `src/main/index.js`，再运行提取器，使桌面和独立引擎使用同一编解码。来源清单记录的是当前维护后的源码，原提取哈希另见 `provenance/`。

## 使用

在工程根目录的 CommonJS 代码中：

```js
const {
  EngineClientFrame,
  EngineServerFrame,
  encodeLengthDelimitedFrame,
  LengthDelimitedFrameDecoder,
  IPC_CHANNELS
} = require('./packages/alpha-protocol');

const request = EngineClientFrame.fromPartial({
  requestId: 1n,
  listAccounts: {}
});
const payload = EngineClientFrame.encode(request).finish();
const framedRequest = encodeLengthDelimitedFrame(payload);
// 由调用方将 framedRequest 发送到已授权并真实建立的传输连接。

const decoder = new LengthDelimitedFrameDecoder();
function receive(chunk) {
  for (const bytes of decoder.push(chunk)) {
    const reply = EngineServerFrame.decode(bytes);
    // 按 requestId 关联请求，并处理 reply.error；不能将收到任意帧视为 ready。
  }
}
function endOfStream() {
  decoder.finish(); // 不完整 header/body 会抛出 TRUNCATED_FRAME。
}
```

`fromPartial` 会补齐生成代码要求的默认字段。64 位整数使用 BigInt；如需 JSON，使用对应 codec 的 `toJSON` / `fromJSON` 保留大整数和字节字段。大端 4 字节长度是应用传输封装，不是 protobuf 自带的 varint-delimited 格式。

默认接收帧上限是 16 MiB，可在构造 decoder 时降低。发送编码器保留原始 u32 长度行为，**不会自动执行同样的 16 MiB 限制**；调用方应在写入传输连接前实施自己的发送大小上限。分帧失败后，当前 decoder 清空未完成的缓冲；真实连接应由调用方决定关闭或重连。

公开 API 还包括 `FrameProtocolError` 与 `DEFAULT_MAX_FRAME_BYTES`。`IPC_CHANNELS` 是冻结的原 preload 字符串映射；其事件、请求及返回类型仍需要建立更高层契约，不能将每个常量都视为可 invoke 的处理器。

## 复用全部恢复绑定

默认入口只导出稳定的协议根与分帧 API。构建迁移或分析工具可以显式使用：

```js
const recovered = require('./packages/alpha-protocol/bindings.cjs');
const { EngineClientFrame, EngineServerFrame, HelloRequest } = recovered;
```

本包作为命名依赖安装后，对应 subpath 是 `@alpha-recovered/protocol/bindings`。此入口导出全部 900 个经分析选中的顶层绑定，包括 codec、默认值函数和辅助函数。它们保留交付文件中的名字，属于内部兼容接口，不保证未来恢复版本稳定。两个入口共用同一份 `bindings.cjs`，不会重复实例化 codec。

## 重新提取与检查

在工程根目录运行：

```sh
npm run extract:protocol
npm run verify:protocol
npm run test:protocol
```

`tools/extract-protocol.mjs` 使用固定版本 `@babel/parser` / `@babel/traverse` 8.0.10。它从四个根符号追踪 Program 作用域绑定依赖，按原顺序输出完整声明，核对唯一允许的外部映射，并拒绝未知全局、可变顶层绑定、未审查初始化与其他外部 require。它没有对整段代码作“无依赖”假设，也不会加载原始文件。依赖改变时提取失败应先检查原因，不应补空对象或 stub。

`source-manifest.json` 记录源文件 SHA256、提取器 SHA256、每个声明的名字、直接依赖、AST `node.start/end`（UTF-16 偏移，end 不含）、原始行号、生成行号与内容哈希。完整 `selectedBindings` 列表及 `node` 范围可用于后续构建层替换；`original` 范围还包含关联的前导注释。`--check` 不写文件，检查所有生成产物是否仍与当前源码/提取器完全一致。

应修改提取器、维护源中的协议定义或在本包外增加维护代码，再重新生成；不要直接手改 `bindings.cjs`。原始提取来源和维护后的 `src/` 分别记录。源码来源与原许可不因提取而改变，本包没有为恢复代码重新声明开源许可。

## 当前验证范围

测试覆盖已知 protobuf 字节向量、全部根消息分支的实际编码/解码、嵌套消息与大整数/字节 JSON 往返、畸形载荷、任意传输切分、粘包、空帧、截断和超长拒绝，以及来源校验、可重复提取与未知外部依赖拒绝。

这些测试验证通信基础模块，不验证原生引擎启动、授权、真实聊天读取、业务操作或最终后端兼容性。
