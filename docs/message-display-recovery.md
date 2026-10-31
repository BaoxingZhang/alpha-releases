# Type-49 message display recovery

The independent bridge now derives a small display object from decoded `Msg_*`
message XML. For `local_type` 49, the XML app message subtype 5 (link) or 6
(file) is supported; for `local_type` 48, the standard `<location x="..."
y="..." label="..."/>` shape is supported. The original XML stays in
`content`; metadata is optional and is discarded when the XML is malformed,
ambiguous, oversized, or disagrees with a packed high subtype.

For links, only an HTTPS URL without credentials, control characters, or
known encrypted/CDN query keys becomes actionable. A display origin is derived
only from an origin-only URL. File `appattach/totallen` is treated as a decimal
byte count and checked against the full unsigned 64-bit range; `fileext` is
bounded to 1–12 ASCII letters/digits. Location x/y coordinates are checked as
finite latitude/longitude values in their geographic ranges. No local path is
inferred and no remote resource is fetched.

The engine validates the bridge DTO with the same `displayJson` field limits
used by the recovered main process before encoding protobuf. JSON exports carry
the optional `display` object; Markdown and text exports continue to use the
raw XML content.

Evidence: `vendor/chatlog/internal/model/mediamessage.go` declares App.Type 5/6,
App.URL, AppAttach.TotalLen and AppAttach.FileExt. The recovered renderer's
`messageFileSize` formats `fileSize` as bytes, while `src/main/index.js`
`projectDisplay` requires HTTPS `linkUrl` and strips query/hash from
origin-only `displayUrl`.
