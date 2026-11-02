# Type-49 message display recovery

The independent bridge now derives a small display object from decoded `Msg_*`
message XML. For `local_type` 49, the XML app message subtype 5 (link) or 6
(file) is supported; for `local_type` 48, the standard `<location x="..."
y="..." label="..."/>` shape is supported. App message subtype 57 (quote)
now exposes a shallow `quote` projection containing the title preview and
referenced sender/type/server identity. The original XML stays in
`content`; metadata is optional and is discarded when the XML is malformed,
ambiguous, oversized, or disagrees with a packed high subtype.

Quote parsing is metadata-only. It does not recurse into `refermsg/content`,
read a referenced message's media, preserve CDN/AES fields, or create a
`media1_` token. The referenced `type` is mapped only to the existing renderer
labels (`text`, `image`, `voice`, `contact`, `video`, `sticker`, `location`,
`link`, `call`, `system`, or `other`); unknown values remain `other`.

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
57, App.URL, AppAttach.TotalLen, AppAttach.FileExt and ReferMsg identity
fields. The recovered renderer's
`messageFileSize` formats `fileSize` as bytes, while `src/main/index.js`
`projectDisplay` requires HTTPS `linkUrl` and strips query/hash from
origin-only `displayUrl`.
