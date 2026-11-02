# 本地媒体解码器证据边界

`packages/alpha-engine/media-decoder.cjs` 是一个独立、无文件系统副作用的 DAT 图片字节解码器。它只接受调用方已经取得的字节；v4 必须显式提供 AES/XOR key，旧式 DAT 则根据图片 magic 推断 XOR key。它支持：

- WeChat v4 容器头 `07085631` / `07085632` 的 AES-ECB 前段、明文中段和 XOR 尾段；
- 旧式图片 DAT 的 XOR 头推断；
- JPG、PNG、GIF、TIFF、BMP 和 WXGF magic 校验；
- 输入、输出、AES 分组、格式和长度的有界失败关闭。

算法布局与固定的 `vendor/chatlog` Apache-2.0 参考源码 `pkg/util/dat2img` 相互核对，但本模块没有导入 Chatlog 包、二进制或运行时依赖。Chatlog 的完整许可证和依赖清单仍以 [`docs/chatlog-dependency-licenses.json`](chatlog-dependency-licenses.json) 为准。

当前它**没有**接入 Alpha 的 `media1_` token、自动图片 key 获取、CDN 补齐、WXGF 动画转换、语音/视频播放或真实数据目录扫描，也不把纯合成字节测试当成真实微信媒体兼容性证明。独立桌面主进程已经有一条严格隔离的接入：只有 `media-index.v1.json` 条目明确写入 `encoding: "dat"`，且调用方通过手动图片 key 配置提供进程内 AES/XOR key 时，图片 grant 读取会先校验原始文件 SHA-256，再解码后做图片 magic 校验。manifest 的哈希和大小仍绑定密文；`readIndexedMedia`、HTTP/MCP indexed-media 路径继续返回原始索引字节。该接入不生成原生 token，也不改变 `native_schema_supported=false` 边界。

## 集成决策与许可证边界

decoder 仍保持独立库边界，不注册到 `SUPPORTED` 或原生 `resolveMessageMedia` 协议分支；桌面主进程的图片 grant 只在显式 `encoding: "dat"` 条目和手动 key 同时存在时调用它。协议层的 `readIndexedMedia`、HTTP/MCP indexed-media 路径不隐式解码，避免改变密文 SHA-256 的索引语义。真实微信媒体定位、key 获取和 native schema 仍未恢复。

本模块是本项目独立编写的 Node 纯函数实现，仅参考公开的 `vendor/chatlog/pkg/util/dat2img` 算法布局。没有复制 Chatlog 源码、二进制或运行时依赖；Chatlog 的 Apache-2.0 全文和依赖归属见 `vendor/chatlog/LICENSE` 与 [`docs/chatlog-dependency-licenses.json`](chatlog-dependency-licenses.json)。若未来直接移植 Chatlog 代码，应随移植文件保留 Apache-2.0 的版权、许可证和修改说明；当前模块不因此改变 Alpha 恢复工程的整体许可证或闭源原包的权利边界。

验证：

```sh
node --test tests/media-decoder.test.mjs
node --test tests/indexed-image.test.mjs
```
