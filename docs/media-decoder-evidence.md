# 本地媒体解码器证据边界

`packages/alpha-engine/media-decoder.cjs` 是一个独立、无文件系统副作用的 DAT 图片字节解码器。它只接受调用方已经取得的字节；v4 必须显式提供 AES/XOR key，旧式 DAT 则根据图片 magic 推断 XOR key。它支持：

- WeChat v4 容器头 `07085631` / `07085632` 的 AES-ECB 前段、明文中段和 XOR 尾段；
- 旧式图片 DAT 的 XOR 头推断；
- JPG、PNG、GIF、TIFF、BMP 和 WXGF magic 校验；
- 输入、输出、AES 分组、格式和长度的有界失败关闭。

算法布局与固定的 `vendor/chatlog` Apache-2.0 参考源码 `pkg/util/dat2img` 相互核对，但本模块没有导入 Chatlog 包、二进制或运行时依赖。Chatlog 的完整许可证和依赖清单仍以 [`docs/chatlog-dependency-licenses.json`](chatlog-dependency-licenses.json) 为准。

当前它**没有**接入 Alpha 的 `resolveMessageMedia`、`media1_` token、自动图片 key 获取、CDN 补齐、WXGF 动画转换、语音/视频播放或真实数据目录扫描，也不把纯合成字节测试当成真实微信媒体兼容性证明。后续接入需要授权媒体 fixture、真实 key 验证和明确的本地媒体定位契约；完成这些之前，独立后端的媒体状态仍保持 `mediaReady=false`。

## 集成决策与许可证边界

当前保持 decoder 为独立库边界，不把它注册到 `SUPPORTED`、`resolveMessageMedia` 或任何 Alpha IPC/HTTP 分支，也不由 UI 自动调用。`scripts/build.mjs` 会复制完整的 `packages/alpha-engine` 目录到独立运行时，因此该文件会随源码包携带；这只是构建产物中的未接线模块，不表示 engine 已提供媒体解码能力。只有在拿到授权的真实媒体 fixture、key 获取和文件定位契约后，才应另行设计协议接入，并增加端到端证据。

本模块是本项目独立编写的 Node 纯函数实现，仅参考公开的 `vendor/chatlog/pkg/util/dat2img` 算法布局。没有复制 Chatlog 源码、二进制或运行时依赖；Chatlog 的 Apache-2.0 全文和依赖归属见 `vendor/chatlog/LICENSE` 与 [`docs/chatlog-dependency-licenses.json`](chatlog-dependency-licenses.json)。若未来直接移植 Chatlog 代码，应随移植文件保留 Apache-2.0 的版权、许可证和修改说明；当前模块不因此改变 Alpha 恢复工程的整体许可证或闭源原包的权利边界。

验证：

```sh
node --test tests/media-decoder.test.mjs
```
