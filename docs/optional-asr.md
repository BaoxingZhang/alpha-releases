# 独立可选语音转写

恢复包没有随附 Alpha 的 `alpha-transcription-worker`、ASR 运行时或模型权重，因此原生 `transcribeVoice` 与 `transcribeVoiceBatch` 仍保持 `UNIMPLEMENTED`。`packages/alpha-engine/optional-asr.cjs` 提供一个隔离的可选 backend：只有调用方明确选择 `media-index.v1.json` 中的 `kind=voice`、WAV 文件和已安装的模型目录时，才会尝试调用 `sherpa-onnx-node`。

当前只登记了 catalog 中有完整文件哈希的 `zipformer-zh-small`。模型目录必须包含四个经过 SHA-256 校验的文件：`encoder.int8.onnx`、`decoder.onnx`、`joiner.int8.onnx` 和 `tokens.txt`。项目不会自动下载 npm 运行时、模型或音频，也不会扫描用户目录。未安装可选 addon 或模型时，`asr:inspect` 返回 `ready=false` 和明确错误码。

示例：

```sh
npm run asr:inspect -- --model-root /absolute/path/to/zipformer-zh-small
npm run asr:transcribe -- \
  --model-root /absolute/path/to/zipformer-zh-small \
  --media-index-root /absolute/path/to/selected-media-index-root \
  --media-id <voice-id> \
  --account-id <account-id>
```

输出固定标记 `scope=alpha-independent-optional-asr`、`complete=false`、`native_schema_supported=false` 和 `explicit_index_only=true`。它只能处理自有 WAV media-index；真实微信 VoiceInfo、SILK、`media1_` token 和原生媒体缓存仍未接入，不能据此宣称 Alpha 原生语音转写已经恢复。

独立 HTTP/MCP 适配器也提供同一能力：`GET /api/v1/independent/media/asr/status`、`POST /api/v1/independent/media/asr/transcribe`，以及 `alpha-independent.media.inspect_asr`、`alpha-independent.media.transcribe_indexed_voice`。这些入口只接受调用方明确给出的绝对模型目录和 media-index 根目录，复用相同的文件哈希、路径和 WAV 校验；它们不会读取默认用户目录或把结果注册为原生 `transcribeVoice` 分支。
