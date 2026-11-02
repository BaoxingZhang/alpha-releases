# Synthetic voice playback boundary

独立后端现在支持 `decodeVoicePlayback`（协议 field 128）的合成只读路径。它只在消息数据库显式包含 `__alpha_voice_playback_v1` 表时启用；表字段为 `media_id` 和 `wav_media_id`，两个值都必须是 64 位小写十六进制字符串。桥接层按 `media_id` 读取至多两个候选，并显式校验返回的 source id 与请求一致；同一数据库或多个分片出现重复映射、非法值和变化中的只读副本都会失败关闭。

`wav_media_id` 必须同时对应数据目录 `media-index.v1.json` 中唯一的 `kind=voice`、`rendition=wav`、`audio/wav` 或 `audio/x-wav` 条目；条目的 `id` 与 SHA-256 必须等于 `wav_media_id`。Engine 会重新读取并哈希该文件后，才返回原 Alpha `DecodeVoicePlaybackResponse` 所需的 `wavMediaId`。

该路径不解析真实微信 `VoiceInfo`、SILK、DAT/AES、FFmpeg 或 native media cache，也不接受原生媒体 token。没有 marker 表、映射或已验证 WAV 文件时返回明确错误。合成表是本项目测试契约，不代表真实微信语音 schema 或 Alpha 运行时兼容性。

验证覆盖：`packages/alpha-data-bridge/voice-playback_test.go` 检查 marker schema、capability、唯一映射和同一数据库内重复映射拒绝；`tests/engine-voice-playback.test.mjs` 检查 media-index 哈希绑定、WAV MIME/rendition 和缺失文件的 fail-closed 行为。
