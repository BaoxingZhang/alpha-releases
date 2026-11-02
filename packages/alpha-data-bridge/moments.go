package main

// This reader is intentionally limited to the explicit independent moments
// fixture schema declared below.  It does not guess WeChat's native SnsTimeLine
// or snsmessage schema and therefore cannot accidentally reinterpret a real
// database as a compatible Alpha moments source.

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"strings"
	"unicode/utf8"
)

const momentsTable = "__alpha_moments_v1"

var momentsColumns = []string{"id", "username", "nickname", "created_at_unix_ms", "type", "text", "raw_xml", "fields_json"}

const (
	maxMomentsRows  = 100000
	maxMomentFields = 32
)

type momentField struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	ValueKind uint32 `json:"valueKind"`
	Truncated bool   `json:"truncated"`
}

type momentRecord struct {
	ID             string        `json:"id"`
	Username       string        `json:"username"`
	Nickname       string        `json:"nickname"`
	CreatedAtUnixMs string       `json:"createdAtUnixMs"`
	Type           uint32        `json:"type"`
	Text           string        `json:"text"`
	RawXML         string        `json:"rawXml"`
	SourceTable    string        `json:"sourceTable"`
	Fields         []momentField `json:"fields"`
}

func validateMomentString(value string, max int, required bool) error {
	if required && value == "" || len(value) > max || !utf8.ValidString(value) || strings.IndexByte(value, 0) >= 0 {
		return fail("MOMENTS_SCHEMA_INVALID", "Moment text contains an invalid or oversized value")
	}
	return nil
}

func decodeMomentFields(raw string) ([]momentField, error) {
	if raw == "" {
		return []momentField{}, nil
	}
	var fields []momentField
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&fields); err != nil || len(fields) > maxMomentFields {
		return nil, fail("MOMENTS_SCHEMA_INVALID", "Moment fields_json is not a bounded field array")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fail("MOMENTS_SCHEMA_INVALID", "Moment fields_json is not a bounded field array")
	}
	for _, field := range fields {
		if err := validateMomentString(field.Name, 256, true); err != nil {
			return nil, err
		}
		if err := validateMomentString(field.Value, 4096, false); err != nil {
			return nil, err
		}
		if field.ValueKind > 16 {
			return nil, fail("MOMENTS_SCHEMA_INVALID", "Moment field kind is outside the independent range")
		}
	}
	return fields, nil
}

func scanMomentRows(rows *sql.Rows, sourceTable string, limit int) ([]momentRecord, error) {
	items := make([]momentRecord, 0, limit)
	for rows.Next() {
		var id, username, nickname, text, rawXML, fieldsJSON string
		var createdAt int64
		var kind int64
		if err := rows.Scan(&id, &username, &nickname, &createdAt, &kind, &text, &rawXML, &fieldsJSON); err != nil {
			return nil, fail("MOMENTS_SCHEMA_INVALID", "Moment row has an incompatible value")
		}
		if kind < 0 || kind > int64(^uint32(0)) {
			return nil, fail("MOMENTS_SCHEMA_INVALID", "Moment type is outside uint32 range")
		}
		for _, value := range []struct{ value string; max int; required bool }{
			{id, 1024, true}, {username, 1024, true}, {nickname, 4096, false}, {text, 4 << 20, false}, {rawXML, 4 << 20, false},
		} {
			if err := validateMomentString(value.value, value.max, value.required); err != nil {
				return nil, err
			}
		}
		fields, err := decodeMomentFields(fieldsJSON)
		if err != nil {
			return nil, err
		}
		items = append(items, momentRecord{ID: id, Username: username, Nickname: nickname, CreatedAtUnixMs: number(createdAt), Type: uint32(kind), Text: text, RawXML: rawXML, SourceTable: sourceTable, Fields: fields})
		if len(items) >= limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fail("MOMENTS_READ_FAILED", "Unable to read the independent moments fixture")
	}
	return items, nil
}

func parseMomentRange(p params) (from, to *int64, err error) {
	if p.FromUnixMs != "" {
		value, e := parseInteger(p.FromUnixMs)
		if e != nil {
			return nil, nil, fail("MOMENTS_REQUEST_INVALID", "fromUnixMs must be a signed decimal integer")
		}
		from = &value
	}
	if p.ToUnixMs != "" {
		value, e := parseInteger(p.ToUnixMs)
		if e != nil {
			return nil, nil, fail("MOMENTS_REQUEST_INVALID", "toUnixMs must be a signed decimal integer")
		}
		to = &value
	}
	if from != nil && to != nil && *to < *from {
		return nil, nil, fail("MOMENTS_REQUEST_INVALID", "toUnixMs must be greater than or equal to fromUnixMs")
	}
	return from, to, nil
}

func (b *bridge) momentsList(ctx context.Context, p params) (any, error) {
	if b.momentsDB == nil {
		return nil, fail("CAPABILITY_UNAVAILABLE", "moments.db is not present")
	}
	from, to, err := parseMomentRange(p)
	if err != nil {
		return nil, err
	}
	query := `SELECT id,username,COALESCE(nickname,''),created_at_unix_ms,type,COALESCE(text,''),COALESCE(raw_xml,''),COALESCE(fields_json,'[]') FROM "` + momentsTable + `" WHERE 1=1`
	args := []any{}
	if p.Username != "" {
		query += ` AND username COLLATE BINARY=?`
		args = append(args, p.Username)
	}
	if from != nil {
		query += ` AND created_at_unix_ms>=?`
		args = append(args, *from)
	}
	if to != nil {
		// Time ranges use the same half-open [from,to) contract as the
		// message calendar reader.  Keeping the upper bound exclusive lets
		// adjacent pages/ranges compose without duplicating a moment whose
		// timestamp equals the next range's start.
		query += ` AND created_at_unix_ms<?`
		args = append(args, *to)
	}
	if p.Keyword != "" {
		query += ` AND (instr(lower(text),lower(?))>0 OR instr(lower(raw_xml),lower(?))>0 OR instr(lower(username),lower(?))>0 OR instr(lower(nickname),lower(?))>0)`
		args = append(args, p.Keyword, p.Keyword, p.Keyword, p.Keyword)
	}
	if p.Ascending != nil && *p.Ascending {
		query += ` ORDER BY created_at_unix_ms ASC,id COLLATE BINARY ASC`
	} else {
		query += ` ORDER BY created_at_unix_ms DESC,id COLLATE BINARY DESC`
	}
	query += ` LIMIT ? OFFSET ?`
	args = append(args, p.Limit+1, p.Offset)
	rows, err := b.momentsDB.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fail("MOMENTS_READ_FAILED", "Unable to query the independent moments fixture")
	}
	defer rows.Close()
	items, err := scanMomentRows(rows, momentsTable, p.Limit+1)
	if err != nil {
		return nil, err
	}
	hasMore := len(items) > p.Limit
	if hasMore {
		items = items[:p.Limit]
	}
	return map[string]any{"items": items, "sourceDatabase": "moments.db", "sourceTable": momentsTable, "hasMore": hasMore}, nil
}

func (b *bridge) momentsAuthors(ctx context.Context, p params) (any, error) {
	if b.momentsDB == nil {
		return nil, fail("CAPABILITY_UNAVAILABLE", "moments.db is not present")
	}
	query := `SELECT username,COALESCE(MAX(nickname),''),COUNT(*),MAX(created_at_unix_ms) FROM "` + momentsTable + `" GROUP BY username ORDER BY MAX(created_at_unix_ms) DESC,username COLLATE BINARY ASC LIMIT ?`
	rows, err := b.momentsDB.db.QueryContext(ctx, query, p.Limit)
	if err != nil {
		return nil, fail("MOMENTS_READ_FAILED", "Unable to query moment authors")
	}
	defer rows.Close()
	type author struct {
		Username string `json:"username"`
		Nickname string `json:"nickname"`
		PostCount uint32 `json:"postCount"`
		LatestAtUnixMs string `json:"latestAtUnixMs"`
		IsContact bool `json:"isContact"`
		Remark string `json:"remark"`
		ContactNickname string `json:"contactNickname"`
		Alias string `json:"alias"`
		AvatarRef string `json:"avatarRef"`
		QuanPin string `json:"quanPin"`
		RemarkQuanPin string `json:"remarkQuanPin"`
	}
	items := make([]author, 0, p.Limit)
	var total uint64
	for rows.Next() {
		var username, nickname string
		var count, latest int64
		if err := rows.Scan(&username, &nickname, &count, &latest); err != nil || count < 0 || count > int64(^uint32(0)) {
			return nil, fail("MOMENTS_SCHEMA_INVALID", "Moment author aggregate is invalid")
		}
		if err := validateMomentString(username, 1024, true); err != nil { return nil, err }
		if err := validateMomentString(nickname, 4096, false); err != nil { return nil, err }
		items = append(items, author{Username: username, Nickname: nickname, PostCount: uint32(count), LatestAtUnixMs: number(latest)})
		total += uint64(count)
	}
	if err := rows.Err(); err != nil { return nil, fail("MOMENTS_READ_FAILED", "Unable to read moment authors") }
	return map[string]any{"items": items, "totalPosts": number(int64(total)), "truncated": false, "sourceDatabase": "moments.db", "sourceTable": momentsTable}, nil
}

func localMomentDay(unixMs int64, offsetMinutes int) int64 {
	shifted := unixMs + int64(offsetMinutes)*60000
	if shifted >= 0 { return shifted / 86400000 }
	return -((-shifted + 86400000 - 1) / 86400000)
}

func (b *bridge) momentsDayCounts(ctx context.Context, p params) (any, error) {
	if b.momentsDB == nil { return map[string]any{"available": false, "days": []any{}}, nil }
	from, to, err := parseMomentRange(p)
	if err != nil { return nil, err }
	query := `SELECT created_at_unix_ms FROM "` + momentsTable + `" WHERE 1=1`
	args := []any{}
	if p.Username != "" { query += ` AND username COLLATE BINARY=?`; args = append(args, p.Username) }
	if from != nil { query += ` AND created_at_unix_ms>=?`; args = append(args, *from) }
	if to != nil { query += ` AND created_at_unix_ms<?`; args = append(args, *to) }
	rows, err := b.momentsDB.db.QueryContext(ctx, query, args...)
	if err != nil { return nil, fail("MOMENTS_READ_FAILED", "Unable to query moment day counts") }
	defer rows.Close()
	counts := map[int64]int64{}
	for rows.Next() {
		var value int64
		if err := rows.Scan(&value); err != nil { return nil, fail("MOMENTS_SCHEMA_INVALID", "Moment timestamp is invalid") }
		day := localMomentDay(value, dereferenceInt(p.UTCOffsetMinutes))
		counts[day]++
	}
	if err := rows.Err(); err != nil { return nil, fail("MOMENTS_READ_FAILED", "Unable to read moment day counts") }
	keys := make([]int64, 0, len(counts))
	for key := range counts { keys = append(keys, key) }
	for i := 1; i < len(keys); i++ { for j := i; j > 0 && keys[j] < keys[j-1]; j-- { keys[j], keys[j-1] = keys[j-1], keys[j] } }
	days := make([]map[string]string, 0, len(keys))
	for _, key := range keys { days = append(days, map[string]string{"localDay": number(key), "count": number(counts[key])}) }
	return map[string]any{"available": true, "days": days}, nil
}

func dereferenceInt(value *int) int { if value == nil { return 0 }; return *value }
