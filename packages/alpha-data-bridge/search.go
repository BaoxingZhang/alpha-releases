package main

import (
	"bytes"
	"container/heap"
	"context"
	"crypto/md5"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/klauspost/compress/zstd"
)

const maxTextBytes = 4 << 20
const maxSearchRows = 1000000
const maxSearchBytes = 512 << 20
const maxSearchResultBytes = 64 << 20
const maxBridgeResponseBytes = 12 << 20

func messageTableName(name string) bool {
	if len(name) != 36 || !strings.HasPrefix(name, "Msg_") {
		return false
	}
	for _, c := range name[4:] {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return true
}
func validConversation(name string) bool {
	return name != "" && len(name) <= 1024 && strings.TrimSpace(name) == name && strings.IndexFunc(name, unicode.IsControl) < 0
}
func validLookupUsername(name string) bool {
	return name != "" && len(name) <= 1024 && utf8.ValidString(name) && strings.TrimSpace(name) == name && strings.IndexFunc(name, unicode.IsControl) < 0
}
func validateLookupUsernames(usernames []string) error {
	if len(usernames) < 1 || len(usernames) > 500 {
		return fail("CONTACT_LOOKUP_INVALID", "Lookup requires between 1 and 500 usernames")
	}
	seen := make(map[string]struct{}, len(usernames))
	for _, username := range usernames {
		if !validLookupUsername(username) {
			return fail("CONTACT_LOOKUP_INVALID", "Lookup usernames must be bounded, trimmed UTF-8 strings")
		}
		if _, exists := seen[username]; exists {
			return fail("CONTACT_LOOKUP_INVALID", "Lookup usernames must be unique")
		}
		seen[username] = struct{}{}
	}
	return nil
}
func conversationTable(name string) string {
	sum := md5.Sum([]byte(name))
	return "Msg_" + hex.EncodeToString(sum[:])
}
func boolPointer(v bool) *bool { return &v }
func validateOperationParams(op string, p *params) error {
	switch op {
	case "general.list", "contacts.list", "sessions.list", "messages.list", "messages.search", "messages.locate", "messages.dayCounts", "messages.stats", "moments.list", "moments.authors", "moments.dayCounts", "moments.emoji", "favorites.list", "favorites.mediaSlots", "favorites.media", "voice.playback":
	default:
		return fail("UNSUPPORTED_OPERATION", "This read-only operation is not implemented")
	}
	if strings.HasPrefix(op, "moments.") {
		if p.Cursor != "" || p.TableName != "" || p.ConversationID != "" || p.UsernameExact != "" || p.Sender != "" || p.GroupByConversation || p.ServerID != "" || p.AfterTime != "" || p.BeforeTime != "" {
			return fail("INVALID_PARAMS", "Moment operations do not accept message or cursor parameters")
		}
		if p.Username != "" && !validLookupUsername(p.Username) {
			return fail("MOMENTS_REQUEST_INVALID", "Moment username is not a bounded UTF-8 string")
		}
		if p.Keyword != "" && (len(p.Keyword) > 512 || !utf8.ValidString(p.Keyword) || strings.IndexByte(p.Keyword, 0) >= 0 || strings.IndexFunc(p.Keyword, unicode.IsControl) >= 0 || strings.TrimSpace(p.Keyword) != p.Keyword) {
			return fail("MOMENTS_REQUEST_INVALID", "Moment keyword must be bounded literal UTF-8 text")
		}
		if p.Offset < 0 || p.Offset > maxMomentsRows {
			return fail("MOMENTS_REQUEST_INVALID", "Moment offset is outside the bounded range")
		}
		if op == "moments.emoji" {
			if p.Limit != 100 || p.Offset != 0 || p.Cursor != "" || p.Username != "" || p.Keyword != "" || p.FromUnixMs != "" || p.ToUnixMs != "" || p.UTCOffsetMinutes != nil || p.Ascending != nil || p.Source == "" {
				return fail("MOMENT_EMOJI_REQUEST_INVALID", "Moment emoji lookup accepts only a source")
			}
			return nil
		}
		if op == "moments.authors" && (p.Offset != 0 || p.Keyword != "" || p.FromUnixMs != "" || p.ToUnixMs != "" || p.UTCOffsetMinutes != nil || p.Ascending != nil) {
			return fail("MOMENTS_REQUEST_INVALID", "Moment author lookup accepts only account and limit")
		}
		if op == "moments.dayCounts" && (p.Limit != 100 || p.Offset != 0 || p.Keyword != "" || p.Ascending != nil) {
			return fail("MOMENTS_REQUEST_INVALID", "Moment day counts do not accept paging parameters")
		}
		if op == "moments.list" && p.Ascending != nil && *p.Ascending != true && *p.Ascending != false {
			return fail("MOMENTS_REQUEST_INVALID", "Moment sort order is invalid")
		}
		if p.UTCOffsetMinutes != nil && (*p.UTCOffsetMinutes < -24*60 || *p.UTCOffsetMinutes > 24*60) {
			return fail("MOMENTS_REQUEST_INVALID", "Moment UTC offset is outside the bounded range")
		}
		if _, _, err := parseMomentRange(*p); err != nil {
			return err
		}
		return nil
	}
	if op == "favorites.list" {
		if p.Cursor != "" || p.TableName != "" || p.ConversationID != "" || p.UsernameExact != "" || p.Sender != "" || p.GroupByConversation || p.ServerID != "" || p.AfterTime != "" || p.BeforeTime != "" || p.FromUnixMs != "" || p.ToUnixMs != "" || p.UTCOffsetMinutes != nil {
			return fail("FAVORITES_REQUEST_INVALID", "Favorite lookup does not accept message or cursor parameters")
		}
		if p.Offset < 0 || p.Offset > maxFavoritesRows {
			return fail("FAVORITES_REQUEST_INVALID", "Favorite offset is outside the bounded range")
		}
		if p.Query != "" && (len(p.Query) > 512 || !utf8.ValidString(p.Query) || strings.IndexByte(p.Query, 0) >= 0 || strings.IndexFunc(p.Query, unicode.IsControl) >= 0 || strings.TrimSpace(p.Query) != p.Query) {
			return fail("FAVORITES_REQUEST_INVALID", "Favorite query must be bounded literal UTF-8 text")
		}
		if p.Type != nil && (*p.Type < -1 || *p.Type > 0x7fffffff) {
			return fail("FAVORITES_REQUEST_INVALID", "Favorite type is outside the supported range")
		}
		if p.IncludeMedia {
			return fail("FAVORITES_MEDIA_UNAVAILABLE", "Synthetic favorites do not include media")
		}
		if p.TagID != "" {
			if _, err := strconv.ParseUint(p.TagID, 10, 64); err != nil {
				return fail("FAVORITES_REQUEST_INVALID", "Favorite tag id is invalid")
			}
		}
		return nil
	}
	if op == "favorites.mediaSlots" {
		if p.FavoriteID == "" || p.Limit != 100 || p.Offset != 0 || p.Cursor != "" || p.Query != "" || p.TagID != "" || p.Type != nil || p.IncludeMedia || p.IncludeTypeCounts {
			return fail("FAVORITES_REQUEST_INVALID", "Favorite media slot lookup accepts only a favorite id")
		}
		return nil
	}
	if op == "favorites.media" {
		if p.MediaToken == "" || p.Limit != 100 || p.Offset != 0 || p.Cursor != "" || p.Query != "" || p.TagID != "" || p.Type != nil || p.IncludeMedia || p.IncludeTypeCounts {
			return fail("FAVORITES_REQUEST_INVALID", "Favorite media lookup accepts only a token")
		}
		return nil
	}
	if op == "voice.playback" {
		if p.MediaID == "" || p.Limit != 100 || p.Offset != 0 || p.Cursor != "" || p.Query != "" || p.TagID != "" || p.Type != nil || p.IncludeMedia || p.IncludeTypeCounts {
			return fail("VOICE_PLAYBACK_REQUEST_INVALID", "Voice playback lookup accepts only a media id")
		}
		return nil
	}
	if p.Username != "" || p.Keyword != "" {
		return fail("INVALID_PARAMS", "username and keyword filters require a moments operation")
	}
	isMessage := strings.HasPrefix(op, "messages.")
	if op == "general.list" {
		if p.Cursor != "" || p.TableName == "" || p.Offset < 0 || p.Offset > maxGeneralRecords || p.ConversationID != "" || p.UsernameExact != "" || p.AfterTime != "" || p.BeforeTime != "" || p.Sender != "" || p.GroupByConversation || p.ServerID != "" || p.FromUnixMs != "" || p.ToUnixMs != "" || p.UTCOffsetMinutes != nil {
			return fail("INVALID_PARAMS", "Invalid general record parameters")
		}
		if p.TableName != groupMembersTable && p.TableName != groupPinsTable && !verifiedGeneralRecordTable(p.TableName) {
			return fail("UNSUPPORTED_OPERATION", "This general record table is not implemented")
		}
		if p.TableName == groupPinsTable {
			if p.Query == "" {
				return fail("INVALID_PARAMS", "Synthetic group pin records require a chatroom query")
			}
			if p.Ascending == nil || !*p.Ascending {
				return fail("INVALID_PARAMS", "Synthetic group pin records require ascending order")
			}
		} else if verifiedGeneralRecordTable(p.TableName) {
			if p.Ascending == nil {
				return fail("INVALID_PARAMS", "General record tables require an explicit sort order")
			}
			if p.Query != "" && (len(p.Query) > 512 || !utf8.ValidString(p.Query) || strings.IndexByte(p.Query, 0) >= 0 || strings.IndexFunc(p.Query, unicode.IsControl) >= 0 || strings.TrimSpace(p.Query) != p.Query) {
				return fail("INVALID_PARAMS", "General record search requires bounded literal UTF-8 text")
			}
		} else if p.Ascending == nil || !*p.Ascending {
			return fail("INVALID_PARAMS", "Group member records require ascending order")
		}
		if p.TableName == groupMembersTable && p.Query == "" {
			return fail("INVALID_PARAMS", "Group member records require a chatroom query")
		}
		return nil
	}
	if p.Offset != 0 || p.TableName != "" {
		return fail("INVALID_PARAMS", "General record parameters require general.list")
	}
	if !isMessage && (p.ConversationID != "" || p.AfterTime != "" || p.BeforeTime != "" || p.Ascending != nil) {
		return fail("INVALID_PARAMS", "Message filters require a message operation")
	}
	if p.UsernameExact != "" && (op != "contacts.list" || !validConversation(p.UsernameExact)) {
		return fail("INVALID_PARAMS", "usernameExact requires a bounded contact lookup")
	}
	if op == "contacts.list" && p.Query != "" {
		if len(p.Query) > 512 || !utf8.ValidString(p.Query) || strings.IndexByte(p.Query, 0) >= 0 || strings.TrimSpace(p.Query) == "" {
			return fail("INVALID_PARAMS", "Contact search requires bounded literal UTF-8 text")
		}
	}
	if p.Query != "" || p.Sender != "" || p.GroupByConversation {
		if op != "messages.search" && op != "contacts.list" {
			return fail("INVALID_PARAMS", "Search filters require messages.search")
		}
		if op == "contacts.list" && (p.Sender != "" || p.GroupByConversation) {
			return fail("INVALID_PARAMS", "Contact search does not accept message filters")
		}
	}
	if p.ServerID != "" && op != "messages.locate" {
		return fail("INVALID_PARAMS", "serverId requires messages.locate")
	}
	if (p.FromUnixMs != "" || p.ToUnixMs != "" || p.UTCOffsetMinutes != nil) && op != "messages.dayCounts" {
		return fail("INVALID_PARAMS", "Calendar filters require messages.dayCounts")
	}
	if op != "messages.list" && op != "messages.search" && (p.AfterTime != "" || p.BeforeTime != "" || p.Ascending != nil) {
		return fail("INVALID_PARAMS", "This operation has no message range or sort filters")
	}
	if (op == "messages.locate" || op == "messages.dayCounts" || op == "messages.stats") && p.Cursor != "" {
		return fail("INVALID_PARAMS", "This operation does not accept a cursor")
	}
	if isMessage && op != "messages.search" && op != "messages.stats" && !validConversation(p.ConversationID) {
		return fail("INVALID_PARAMS", "conversationId is required")
	}
	if p.ConversationID != "" && !validConversation(p.ConversationID) {
		return fail("INVALID_PARAMS", "Invalid conversationId")
	}
	if op == "messages.search" {
		if strings.TrimSpace(p.Query) == "" || len(p.Query) > 512 || !utf8.ValidString(p.Query) || strings.IndexByte(p.Query, 0) >= 0 {
			return fail("INVALID_PARAMS", "Search requires bounded literal UTF-8 text")
		}
		if p.Sender != "" && !validConversation(p.Sender) {
			return fail("INVALID_PARAMS", "Invalid sender")
		}
		if p.Ascending == nil {
			p.Ascending = boolPointer(false)
		}
	}
	if op == "messages.list" && p.Ascending == nil {
		p.Ascending = boolPointer(true)
	}
	for _, value := range []string{p.AfterTime, p.BeforeTime} {
		if value != "" {
			if _, err := parseInteger(value); err != nil {
				return err
			}
		}
	}
	if p.AfterTime != "" && p.BeforeTime != "" {
		a, _ := parseInteger(p.AfterTime)
		z, _ := parseInteger(p.BeforeTime)
		if a > z {
			return fail("INVALID_PARAMS", "afterTime exceeds beforeTime")
		}
	}
	return nil
}

var decoderOnce sync.Once
var textDecoder *zstd.Decoder
var textDecoderError error

func decodedContent(content []byte) (text, encoding, compression, status string) {
	encoding = "binary"
	status = "unreadable"
	if len(content) > maxTextBytes {
		return "", encoding, "", "too-large"
	}
	if bytes.HasPrefix(content, []byte{0x28, 0xb5, 0x2f, 0xfd}) {
		compression = "zstd"
		decoderOnce.Do(func() {
			textDecoder, textDecoderError = zstd.NewReader(nil, zstd.WithDecoderConcurrency(1), zstd.WithDecoderLowmem(true), zstd.WithDecoderMaxMemory(maxTextBytes), zstd.WithDecoderMaxWindow(maxTextBytes))
		})
		if textDecoderError != nil {
			return "", encoding, compression, "decoder-unavailable"
		}
		output, err := textDecoder.DecodeAll(content, nil)
		if err != nil || len(output) > maxTextBytes {
			return "", encoding, compression, "invalid-or-oversized-zstd"
		}
		if !utf8.Valid(output) {
			return "", encoding, compression, "invalid-utf8"
		}
		return string(output), "utf8", compression, "decoded"
	}
	if utf8.Valid(content) {
		return string(content), "utf8", "", "decoded"
	}
	return "", encoding, "", "invalid-utf8"
}

// Bound SQLite materialization as well as decompression. Oversized content is
// explicitly unreadable; oversized auxiliary metadata is explicitly omitted.
const messageColumns = `m.local_id,m.server_id,m.sort_seq,m.local_type,m.create_time,CASE WHEN length(CAST(n.user_name AS BLOB))<=1024 THEN n.user_name ELSE '' END,m.real_sender_id,m.status,CASE WHEN length(CAST(m.message_content AS BLOB))<=4194304 THEN m.message_content ELSE NULL END,CASE WHEN length(CAST(m.packed_info_data AS BLOB))<=4194304 THEN m.packed_info_data ELSE NULL END,COALESCE(length(CAST(m.message_content AS BLOB)),0),COALESCE(length(CAST(m.packed_info_data AS BLOB)),0)`

func messageQuery(table string) string {
	return `SELECT ` + messageColumns + ` FROM "` + table + `" m LEFT JOIN Name2Id n ON m.real_sender_id=n.rowid`
}

type messageScanner interface{ Scan(...any) error }

type mediaRef struct {
	Kind      string `json:"kind"`
	ID        string `json:"id,omitempty"`
	URI       string `json:"uri,omitempty"`
	MimeType  string `json:"mimeType,omitempty"`
	Rendition string `json:"rendition,omitempty"`
}

var mediaHashPattern = regexp.MustCompile(`(?i)(?:md5|rawmd5)=["']([0-9a-f]{32})["']`)
var mediaSHA256Pattern = regexp.MustCompile(`(?i)(?:sha256|sha-256)=["']([0-9a-f]{64})["']`)
var mediaURLPattern = regexp.MustCompile(`(?i)(cdnthumburl|cdnurl|url)=["']([^"'<>\x00-\x1f]{1,1000})["']`)

// mediaReferences only exposes identifiers that are present in the decoded
// message itself. It never turns an inferred path into a local file URI or a
// mediaResolveToken; resolving bytes requires a separately verified media
// index and is deliberately left unavailable in the independent backend.
//
// explicitFile is only set after parseMessageDisplay has verified a bounded
// type=6 file envelope. It accepts the independent synthetic sha256 marker,
// matching the synthetic voice path above; it does not infer a native file
// identifier from a filename, path or arbitrary appmsg XML.
func mediaReferences(localType, serverID, content string, explicitFile ...bool) []mediaRef {
	localTypeValue, localTypeErr := strconv.ParseUint(localType, 10, 64)
	if localTypeErr == nil && localTypeValue&0xffffffff == 49 && len(explicitFile) > 0 && explicitFile[0] {
		matches := mediaSHA256Pattern.FindAllStringSubmatch(content, -1)
		if len(matches) == 1 && len(matches[0]) == 2 {
			return []mediaRef{{Kind: "file", ID: strings.ToLower(matches[0][1]), MimeType: "application/octet-stream", Rendition: "source"}}
		}
		return nil
	}
	kind := ""
	mime := ""
	switch localType {
	case "3":
		kind, mime = "image", "image/*"
	case "34":
		// An independently supplied SHA-256 attribute is accepted only as a
		// content-addressed synthetic voice identity. Real WeChat voice rows
		// continue to use their verified server_id below.
		if match := mediaSHA256Pattern.FindStringSubmatch(content); len(match) == 2 {
			return []mediaRef{{Kind: "voice", ID: strings.ToLower(match[1]), MimeType: "audio/amr", Rendition: "voice-data"}}
		}
		if serverID == "" || serverID == "0" {
			return nil
		}
		return []mediaRef{{Kind: "voice", ID: serverID, MimeType: "audio/amr", Rendition: "voice-data"}}
	case "43":
		kind, mime = "video", "video/*"
	default:
		return nil
	}
	hashes := mediaHashPattern.FindAllStringSubmatch(content, -1)
	urls := mediaURLPattern.FindAllStringSubmatch(content, -1)
	if len(hashes) == 0 && len(urls) == 0 {
		return nil
	}
	refs := make([]mediaRef, 0, 2)
	seen := map[string]bool{}
	for _, match := range hashes {
		id := strings.ToLower(match[1])
		if seen[id] {
			continue
		}
		seen[id] = true
		refs = append(refs, mediaRef{Kind: kind, ID: id, MimeType: mime, Rendition: "source"})
		if len(refs) == 2 {
			break
		}
	}
	for _, match := range urls {
		if len(refs) >= 2 {
			break
		}
		r := "source"
		if strings.EqualFold(match[1], "cdnthumburl") {
			r = "thumbnail"
		}
		refs = append(refs, mediaRef{Kind: kind, URI: match[2], MimeType: mime, Rendition: r})
	}
	return refs
}

func scanMessage(rows messageScanner, d *database, table, conversation string) (message, error) {
	var item message
	var local, server, seq, kind, created, senderID, status int64
	var content, packed []byte
	var contentSize, packedSize int64
	if err := rows.Scan(&local, &server, &seq, &kind, &created, &item.Sender, &senderID, &status, &content, &packed, &contentSize, &packedSize); err != nil {
		return item, fail("ROW_INVALID", "Invalid message record")
	}
	item.ConversationID = conversation
	item.LocalID = number(local)
	item.ServerID = number(server)
	item.SortSeq = number(seq)
	item.LocalType = number(kind)
	item.CreateTime = number(created)
	item.RealSenderID = number(senderID)
	item.Status = number(status)
	item.ContentBase64 = base64.StdEncoding.EncodeToString(content)
	item.PackedInfoBase64 = base64.StdEncoding.EncodeToString(packed)
	item.Content, item.ContentEncoding, item.ContentCompression, item.ContentDecodeStatus = decodedContent(content)
	if contentSize > maxTextBytes {
		item.Content = ""
		item.ContentEncoding = "binary"
		item.ContentDecodeStatus = "too-large"
	}
	item.PackedInfoOmitted = packedSize > maxTextBytes
	if item.ContentDecodeStatus == "decoded" {
		item.Display = parseMessageDisplay(item.LocalType, item.Content, item.ConversationID, item.Sender)
	}
	// Voice references are carried by the row's real server_id and remain
	// verifiable even when the encoded audio payload is not UTF-8 text.
	if item.ContentDecodeStatus == "decoded" || item.LocalType == "34" {
		item.Refs = mediaReferences(item.LocalType, item.ServerID, item.Content)
	}
	// A file ref is accepted only after the bounded display parser proves that
	// this is an appmsg type=6 envelope. The sha256 marker is an explicit
	// independent fixture identity; no native filemd5/path semantics are
	// inferred here.
	if item.ContentDecodeStatus == "decoded" && item.Display != nil && item.Display.Kind == "file" {
		item.Refs = mediaReferences(item.LocalType, item.ServerID, item.Content, true)
	}
	item.Source = sourceRef{Database: d.relative, Table: table, LocalID: item.LocalID}
	return item, nil
}
func messageFilters(p params) ([]string, []any) {
	clauses, args := []string{"1=1"}, []any{}
	if p.AfterTime != "" {
		value, _ := parseInteger(p.AfterTime)
		clauses = append(clauses, "m.create_time>=?")
		args = append(args, value)
	}
	if p.BeforeTime != "" {
		value, _ := parseInteger(p.BeforeTime)
		clauses = append(clauses, "m.create_time<=?")
		args = append(args, value)
	}
	if p.Sender != "" {
		clauses = append(clauses, "n.user_name=?")
		args = append(args, p.Sender)
	}
	return clauses, args
}
func compareMessage(a, z message) int {
	an, _ := strconv.ParseInt(a.CreateTime, 10, 64)
	zn, _ := strconv.ParseInt(z.CreateTime, 10, 64)
	if an < zn {
		return -1
	}
	if an > zn {
		return 1
	}
	if n := strings.Compare(a.Source.Database, z.Source.Database); n != 0 {
		return n
	}
	if n := strings.Compare(a.Source.Table, z.Source.Table); n != 0 {
		return n
	}
	an, _ = strconv.ParseInt(a.LocalID, 10, 64)
	zn, _ = strconv.ParseInt(z.LocalID, 10, 64)
	if an < zn {
		return -1
	}
	if an > zn {
		return 1
	}
	return 0
}
func orderedMessage(a, z message, ascending bool) bool {
	n := compareMessage(a, z)
	if ascending {
		return n < 0
	}
	return n > 0
}
func messageCursor(item message) cursor {
	return cursor{Number: item.CreateTime, Database: item.Source.Database, Table: item.Source.Table, RowID: item.LocalID}
}
func cursorMessage(c *cursor) message {
	return message{CreateTime: c.Number, LocalID: c.RowID, Source: sourceRef{Database: c.Database, Table: c.Table}}
}
func pastCursor(item message, c *cursor, ascending bool) bool {
	return c == nil || orderedMessage(cursorMessage(c), item, ascending)
}
func resultBytes(item message) int {
	return len(item.Content) + len(item.ContentBase64) + len(item.PackedInfoBase64) + len(item.ConversationID) + len(item.Sender) + 1024
}

// Check actual JSON escaping per item before constructing a complete page
// response. Reserve space for the envelope, cursor, coverage and separators.
func checkMessagePageBudget(items []message) error {
	used := 16 << 10
	for _, item := range items {
		encoded, err := json.Marshal(item)
		if err != nil {
			return fail("RESPONSE_ENCODING_FAILED", "Message cannot be encoded")
		}
		used += len(encoded) + 1
		if used > maxBridgeResponseBytes {
			return fail("RESPONSE_TOO_LARGE", "Message page exceeds protocol size; reduce limit or filters")
		}
	}
	return nil
}
func encodeBoundedResponse(out response) ([]byte, error) {
	encoded, err := json.Marshal(out)
	if err != nil {
		return nil, err
	}
	if len(encoded) > maxBridgeResponseBytes {
		return json.Marshal(response{ID: out.ID, Error: &bridgeError{"RESPONSE_TOO_LARGE", "Response exceeds bounded protocol frame size"}})
	}
	return encoded, nil
}

type searchSource struct {
	d                   *database
	table, conversation string
}

// All Name2Id mappings participate, even when the session has been deleted.
func (b *bridge) conversationNames(ctx context.Context) (map[string]string, error) {
	names := map[string]string{}
	identityBytes := 0
	add := func(name string) error {
		if !validConversation(name) {
			return nil
		}
		table := conversationTable(name)
		if old, ok := names[table]; ok && old != name {
			return fail("SEARCH_CONVERSATION_AMBIGUOUS", "Conflicting conversation table identities")
		}
		if _, exists := names[table]; !exists {
			identityBytes += len(table) + len(name) + 128
			if identityBytes > maxSearchResultBytes {
				return fail("SEARCH_LIMIT_EXCEEDED", "Conversation identities exceed memory limit")
			}
		}
		names[table] = name
		return nil
	}
	inputs := []struct {
		d     *database
		query string
	}{}
	for _, d := range b.messageDBs {
		inputs = append(inputs, struct {
			d     *database
			query string
		}{d, "SELECT user_name FROM Name2Id WHERE user_name IS NOT NULL AND length(CAST(user_name AS BLOB))<=1024"})
	}
	if b.contactDB != nil {
		inputs = append(inputs, struct {
			d     *database
			query string
		}{b.contactDB, "SELECT username FROM contact WHERE username IS NOT NULL AND length(CAST(username AS BLOB))<=1024"})
	}
	if b.sessionDB != nil {
		inputs = append(inputs, struct {
			d     *database
			query string
		}{b.sessionDB, "SELECT username FROM SessionTable WHERE username IS NOT NULL AND length(CAST(username AS BLOB))<=1024"})
	}
	count := 0
	for _, input := range inputs {
		rows, err := input.d.db.QueryContext(ctx, input.query)
		if err != nil {
			return nil, fail("QUERY_FAILED", "Cannot read conversation identities")
		}
		for rows.Next() {
			var name string
			if err := rows.Scan(&name); err != nil {
				rows.Close()
				return nil, fail("ROW_INVALID", "Invalid conversation identity")
			}
			count++
			if count > 1000000 {
				rows.Close()
				return nil, fail("SEARCH_LIMIT_EXCEEDED", "Conversation identity scan exceeds limit")
			}
			if err := add(name); err != nil {
				rows.Close()
				return nil, err
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, fail("QUERY_FAILED", "Conversation identity query failed")
		}
	}
	return names, nil
}
func (b *bridge) searchSources(ctx context.Context, p params) ([]searchSource, error) {
	sources := []searchSource{}
	if p.ConversationID != "" {
		table := conversationTable(p.ConversationID)
		for _, d := range b.messageDBs {
			if d.tables[table] {
				sources = append(sources, searchSource{d, table, p.ConversationID})
			}
		}
		return sources, nil
	}
	names, err := b.conversationNames(ctx)
	if err != nil {
		return nil, err
	}
	for _, d := range b.messageDBs {
		for table := range d.tables {
			if messageTableName(table) {
				sources = append(sources, searchSource{d, table, names[table]})
			}
		}
	}
	sort.Slice(sources, func(i, j int) bool {
		if sources[i].d.relative != sources[j].d.relative {
			return sources[i].d.relative < sources[j].d.relative
		}
		return sources[i].table < sources[j].table
	})
	return sources, nil
}

type searchCoverage struct {
	Complete           bool   `json:"complete"`
	UnreadableMessages string `json:"unreadableMessages"`
	UnmappedTables     int    `json:"unmappedTables"`
}
type searchPage struct {
	Items      []message      `json:"items"`
	NextCursor string         `json:"nextCursor"`
	HasMore    bool           `json:"hasMore"`
	Coverage   searchCoverage `json:"coverage"`
}
type messageHeap struct {
	items     []message
	ascending bool
	bytes     int
}

func (h messageHeap) Len() int           { return len(h.items) }
func (h messageHeap) Less(i, j int) bool { return orderedMessage(h.items[j], h.items[i], h.ascending) }
func (h messageHeap) Swap(i, j int)      { h.items[i], h.items[j] = h.items[j], h.items[i] }
func (h *messageHeap) Push(v any) {
	item := v.(message)
	h.items = append(h.items, item)
	h.bytes += resultBytes(item)
}
func (h *messageHeap) Pop() any {
	last := h.items[len(h.items)-1]
	h.items = h.items[:len(h.items)-1]
	h.bytes -= resultBytes(last)
	return last
}
func (h *messageHeap) offer(item message, limit int) error {
	if h.Len() < limit {
		heap.Push(h, item)
	} else if orderedMessage(item, h.items[0], h.ascending) {
		heap.Pop(h)
		heap.Push(h, item)
	}
	if h.bytes > maxSearchResultBytes {
		return fail("SEARCH_LIMIT_EXCEEDED", "Search result exceeds memory limit")
	}
	return nil
}
func (b *bridge) search(ctx context.Context, p params, key string, c *cursor) (any, error) {
	if len(b.messageDBs) == 0 {
		return nil, fail("CAPABILITY_UNAVAILABLE", "No message database is present")
	}
	ascending := *p.Ascending
	if c != nil && (c.Number == "" || c.Database == "" || !messageTableName(c.Table)) {
		return nil, fail("INVALID_CURSOR", "Search cursor requires complete source identity")
	}
	sources, err := b.searchSources(ctx, p)
	if err != nil {
		return nil, err
	}
	result := searchPage{Items: []message{}, Coverage: searchCoverage{Complete: true, UnreadableMessages: "0"}}
	best := &messageHeap{ascending: ascending}
	heap.Init(best)
	type group struct {
		item  message
		count int64
	}
	groups := map[string]*group{}
	groupBytes := 0
	query := strings.ToLower(p.Query)
	var unreadable int64
	scanned, scannedBytes := 0, 0
	for _, source := range sources {
		clauses, args := messageFilters(p)
		if source.conversation == "" {
			var one int
			err := source.d.db.QueryRowContext(ctx, `SELECT 1 FROM "`+source.table+`" m LEFT JOIN Name2Id n ON m.real_sender_id=n.rowid WHERE `+strings.Join(clauses, " AND ")+` LIMIT 1`, args...).Scan(&one)
			if err == nil {
				result.Coverage.UnmappedTables++
			} else if err != sql.ErrNoRows {
				return nil, fail("QUERY_FAILED", "Cannot inspect unmapped message table")
			}
			continue
		}
		rows, err := source.d.db.QueryContext(ctx, messageQuery(source.table)+" WHERE "+strings.Join(clauses, " AND "), args...)
		if err != nil {
			return nil, fail("QUERY_FAILED", "Cannot search message table")
		}
		for rows.Next() {
			if ctx.Err() != nil {
				rows.Close()
				return nil, fail("QUERY_TIMEOUT", "Message search timed out")
			}
			item, err := scanMessage(rows, source.d, source.table, source.conversation)
			if err != nil {
				rows.Close()
				return nil, err
			}
			scanned++
			scannedBytes += resultBytes(item)
			if scanned > maxSearchRows || scannedBytes > maxSearchBytes {
				rows.Close()
				return nil, fail("SEARCH_LIMIT_EXCEEDED", "Search scan exceeds bounded resource limits")
			}
			if item.ContentDecodeStatus != "decoded" {
				unreadable++
				continue
			}
			if !strings.Contains(strings.ToLower(item.Content), query) {
				continue
			}
			item.MatchCount = "1"
			if p.GroupByConversation {
				g := groups[item.ConversationID]
				if g == nil {
					groups[item.ConversationID] = &group{item: item, count: 1}
					groupBytes += resultBytes(item)
				} else {
					g.count++
					if orderedMessage(item, g.item, ascending) {
						groupBytes += resultBytes(item) - resultBytes(g.item)
						g.item = item
					}
				}
				if groupBytes > maxSearchResultBytes {
					rows.Close()
					return nil, fail("SEARCH_LIMIT_EXCEEDED", "Search groups exceed memory limit")
				}
			} else if pastCursor(item, c, ascending) {
				if err := best.offer(item, p.Limit+1); err != nil {
					rows.Close()
					return nil, err
				}
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			if ctx.Err() != nil {
				return nil, fail("QUERY_TIMEOUT", "Message search timed out")
			}
			return nil, fail("QUERY_FAILED", "Message search failed")
		}
	}
	if p.GroupByConversation {
		for _, g := range groups {
			g.item.MatchCount = number(g.count)
			if pastCursor(g.item, c, ascending) {
				if err := best.offer(g.item, p.Limit+1); err != nil {
					return nil, err
				}
			}
		}
	}
	result.Items = best.items
	if result.Items == nil {
		result.Items = []message{}
	}
	sort.Slice(result.Items, func(i, j int) bool { return orderedMessage(result.Items[i], result.Items[j], ascending) })
	if len(result.Items) > p.Limit {
		result.HasMore = true
		result.Items = result.Items[:p.Limit]
		result.NextCursor = b.encodeCursor(key, messageCursor(result.Items[len(result.Items)-1]))
	}
	result.Coverage.UnreadableMessages = number(unreadable)
	result.Coverage.Complete = unreadable == 0 && result.Coverage.UnmappedTables == 0
	if err := checkMessagePageBudget(result.Items); err != nil {
		return nil, err
	}
	return result, nil
}
func (b *bridge) locate(ctx context.Context, p params) (any, error) {
	if len(b.messageDBs) == 0 {
		return nil, fail("CAPABILITY_UNAVAILABLE", "No message database is present")
	}
	unsigned, err := strconv.ParseUint(p.ServerID, 10, 64)
	if err != nil || unsigned == 0 || strconv.FormatUint(unsigned, 10) != p.ServerID {
		return nil, fail("INVALID_PARAMS", "serverId must be a positive uint64 decimal string")
	}
	table := conversationTable(p.ConversationID)
	var found *message
	for _, d := range b.messageDBs {
		if !d.tables[table] {
			continue
		}
		rows, err := d.db.QueryContext(ctx, messageQuery(table)+" WHERE m.server_id=? LIMIT 2", int64(unsigned))
		if err != nil {
			return nil, fail("QUERY_FAILED", "Cannot locate message")
		}
		for rows.Next() {
			if found != nil {
				rows.Close()
				return nil, fail("MESSAGE_LOCATE_AMBIGUOUS", "serverId identifies more than one stored message")
			}
			item, err := scanMessage(rows, d, table, p.ConversationID)
			if err != nil {
				rows.Close()
				return nil, err
			}
			found = &item
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, fail("QUERY_FAILED", "Message location failed")
		}
	}
	if found == nil {
		return map[string]any{"message": nil, "beforeCursor": "", "afterCursor": ""}, nil
	}
	if err := checkMessagePageBudget([]message{*found}); err != nil {
		return nil, err
	}
	before := params{ConversationID: p.ConversationID, Ascending: boolPointer(false)}
	after := params{ConversationID: p.ConversationID, Ascending: boolPointer(true)}
	return map[string]any{"message": found, "beforeCursor": b.encodeCursor(queryKey("messages.list", before), messageCursor(*found)), "afterCursor": b.encodeCursor(queryKey("messages.list", after), messageCursor(*found))}, nil
}
func (b *bridge) dayCounts(ctx context.Context, p params) (any, error) {
	if len(b.messageDBs) == 0 {
		return nil, fail("CAPABILITY_UNAVAILABLE", "No message database is present")
	}
	from, err := parseInteger(p.FromUnixMs)
	if err != nil {
		return nil, err
	}
	to, err := parseInteger(p.ToUnixMs)
	if err != nil {
		return nil, err
	}
	if from < 0 || to <= from || to-from > 62*86400000 || p.UTCOffsetMinutes == nil || *p.UTCOffsetMinutes < -720 || *p.UTCOffsetMinutes > 840 {
		return nil, fail("INVALID_PARAMS", "Invalid calendar interval or UTC offset")
	}
	lower, upper := from/1000, to/1000
	if from%1000 != 0 {
		lower++
	}
	if to%1000 != 0 {
		upper++
	}
	offset := int64(*p.UTCOffsetMinutes) * 60
	table := conversationTable(p.ConversationID)
	counts := map[int64]int64{}
	for _, d := range b.messageDBs {
		if !d.tables[table] {
			continue
		}
		day := `CASE WHEN create_time+?>=0 THEN (create_time+?)/86400 ELSE (create_time+?-86399)/86400 END`
		rows, err := d.db.QueryContext(ctx, `SELECT `+day+`,COUNT(*) FROM "`+table+`" WHERE create_time>=? AND create_time<? GROUP BY 1`, offset, offset, offset, lower, upper)
		if err != nil {
			return nil, fail("QUERY_FAILED", "Cannot count message days")
		}
		for rows.Next() {
			var date, count int64
			if err := rows.Scan(&date, &count); err != nil {
				rows.Close()
				return nil, fail("ROW_INVALID", "Invalid calendar count")
			}
			counts[date] += count
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, fail("QUERY_FAILED", "Calendar query failed")
		}
	}
	keys := []int64{}
	for date := range counts {
		keys = append(keys, date)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	days := []map[string]string{}
	for _, date := range keys {
		days = append(days, map[string]string{"localDay": number(date), "count": number(counts[date])})
	}
	return map[string]any{"days": days}, nil
}
func (b *bridge) stats(ctx context.Context, p params) (any, error) {
	if len(b.messageDBs) == 0 {
		return nil, fail("CAPABILITY_UNAVAILABLE", "No message database is present")
	}
	var total int64
	var first, last sql.NullInt64
	counts := map[int64]int64{}
	for _, d := range b.messageDBs {
		for table := range d.tables {
			if !messageTableName(table) || p.ConversationID != "" && table != conversationTable(p.ConversationID) {
				continue
			}
			rows, err := d.db.QueryContext(ctx, `SELECT local_type,COUNT(*),MIN(create_time),MAX(create_time) FROM "`+table+`" GROUP BY local_type`)
			if err != nil {
				return nil, fail("QUERY_FAILED", "Cannot read message statistics")
			}
			for rows.Next() {
				var kind, count, min, max int64
				if err := rows.Scan(&kind, &count, &min, &max); err != nil {
					rows.Close()
					return nil, fail("ROW_INVALID", "Invalid message statistics")
				}
				total += count
				counts[kind] += count
				if !first.Valid || min < first.Int64 {
					first = sql.NullInt64{Int64: min, Valid: true}
				}
				if !last.Valid || max > last.Int64 {
					last = sql.NullInt64{Int64: max, Valid: true}
				}
			}
			err = rows.Err()
			rows.Close()
			if err != nil {
				return nil, fail("QUERY_FAILED", "Message statistics failed")
			}
		}
	}
	firstTime, lastTime := "", ""
	if first.Valid {
		firstTime = number(first.Int64)
		lastTime = number(last.Int64)
	}
	keys := []int64{}
	for kind := range counts {
		keys = append(keys, kind)
	}
	sort.Slice(keys, func(i, j int) bool { return keys[i] < keys[j] })
	kinds := []map[string]string{}
	for _, kind := range keys {
		kinds = append(kinds, map[string]string{"localType": number(kind), "count": number(counts[kind])})
	}
	return map[string]any{"conversationId": p.ConversationID, "messageCount": number(total), "firstTime": firstTime, "lastTime": lastTime, "counts": kinds}, nil
}
