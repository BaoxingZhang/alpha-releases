package main

// This reader is intentionally limited to the explicit independent favorites
// fixture. It never treats a native favorite.db/favorites.db schema as Alpha
// compatible unless the caller supplies the marker table below.

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

const favoritesTable = "__alpha_favorites_v1"
const favoriteMediaTable = "__alpha_favorite_media_v1"

var favoritesColumns = []string{"id", "type", "updated_at_unix_ms", "title", "description", "source_id", "from_username", "content_xml", "fields_json", "tags_json"}
var favoriteMediaColumns = []string{"favorite_id", "item_index", "role", "token"}

const maxFavoritesRows = 100000

type favoriteField struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	ValueKind uint32 `json:"valueKind"`
	Truncated bool   `json:"truncated"`
}

type favoriteTagValue struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type favoriteRecord struct {
	ID              string             `json:"id"`
	Type            uint32             `json:"type"`
	UpdatedAtUnixMs string             `json:"updatedAtUnixMs"`
	Title           string             `json:"title"`
	Description     string             `json:"description"`
	SourceID        string             `json:"sourceId"`
	FromUsername    string             `json:"fromUsername"`
	ContentXML      string             `json:"contentXml"`
	SourceTable     string             `json:"sourceTable"`
	Fields          []favoriteField    `json:"fields"`
	Tags            []favoriteTagValue `json:"-"`
}

type favoriteMediaSlot struct {
	ItemIndex uint32 `json:"itemIndex"`
	Role      string `json:"role"`
	Token     string `json:"token"`
}

func validateFavoriteString(value string, max int, required bool) error {
	if (required && value == "") || len(value) > max || !utf8.ValidString(value) || strings.IndexByte(value, 0) >= 0 {
		return fail("FAVORITES_SCHEMA_INVALID", "Favorite text contains an invalid or oversized value")
	}
	return nil
}

func decodeFavoriteFields(raw string) ([]favoriteField, error) {
	if raw == "" {
		return []favoriteField{}, nil
	}
	var fields []favoriteField
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&fields); err != nil || len(fields) > 32 {
		return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite fields_json is not a bounded field array")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite fields_json contains trailing data")
	}
	for _, field := range fields {
		if err := validateFavoriteString(field.Name, 256, true); err != nil {
			return nil, err
		}
		if err := validateFavoriteString(field.Value, 4096, false); err != nil {
			return nil, err
		}
		if field.ValueKind > 16 {
			return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite field kind is outside the independent range")
		}
	}
	return fields, nil
}

func decodeFavoriteTags(raw string) ([]favoriteTagValue, error) {
	if raw == "" {
		return []favoriteTagValue{}, nil
	}
	var tags []favoriteTagValue
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&tags); err != nil || len(tags) > 128 {
		return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite tags_json is not a bounded tag array")
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite tags_json contains trailing data")
	}
	seen := map[string]struct{}{}
	for _, tag := range tags {
		if _, err := strconv.ParseUint(tag.ID, 10, 64); err != nil || tag.ID == "" || (len(tag.ID) > 1 && tag.ID[0] == '0') {
			return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite tag id is not a canonical uint64 string")
		}
		if err := validateFavoriteString(tag.Name, 1024, true); err != nil {
			return nil, err
		}
		if _, ok := seen[tag.ID]; ok {
			return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite tags must be unique per item")
		}
		seen[tag.ID] = struct{}{}
	}
	return tags, nil
}

func scanFavoriteRows(rows *sql.Rows, limit int) ([]favoriteRecord, error) {
	items := make([]favoriteRecord, 0, limit)
	for rows.Next() {
		var item favoriteRecord
		var kind int64
		var updated int64
		var fieldsJSON, tagsJSON string
		if err := rows.Scan(&item.ID, &kind, &updated, &item.Title, &item.Description, &item.SourceID, &item.FromUsername, &item.ContentXML, &fieldsJSON, &tagsJSON); err != nil {
			return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite row has an incompatible value")
		}
		if kind < 0 || kind > int64(^uint32(0)) {
			return nil, fail("FAVORITES_SCHEMA_INVALID", "Favorite type is outside uint32 range")
		}
		for _, value := range []struct {
			value    string
			max      int
			required bool
		}{
			{item.ID, 1024, true}, {item.Title, 4096, false}, {item.Description, 4 << 20, false}, {item.SourceID, 1024, false}, {item.FromUsername, 1024, false}, {item.ContentXML, 4 << 20, false},
		} {
			if err := validateFavoriteString(value.value, value.max, value.required); err != nil {
				return nil, err
			}
		}
		fields, err := decodeFavoriteFields(fieldsJSON)
		if err != nil {
			return nil, err
		}
		tags, err := decodeFavoriteTags(tagsJSON)
		if err != nil {
			return nil, err
		}
		item.Type = uint32(kind)
		item.UpdatedAtUnixMs = number(updated)
		item.SourceTable = favoritesTable
		item.Fields = fields
		item.Tags = tags
		items = append(items, item)
		if len(items) >= limit {
			break
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fail("FAVORITES_READ_FAILED", "Unable to read the independent favorites fixture")
	}
	return items, nil
}

func (b *bridge) favoritesList(ctx context.Context, p params) (any, error) {
	if b.favoritesDB == nil {
		return nil, fail("CAPABILITY_UNAVAILABLE", "favorite.db is not present")
	}
	if p.Offset < 0 || p.Offset > maxFavoritesRows {
		return nil, fail("FAVORITES_REQUEST_INVALID", "Favorite offset is outside the bounded range")
	}
	if p.Type != nil && (*p.Type < -1 || *p.Type > 0x7fffffff) {
		return nil, fail("FAVORITES_REQUEST_INVALID", "Favorite type is outside the supported range")
	}
	if p.Query != "" && (len(p.Query) > 512 || !utf8.ValidString(p.Query) || strings.IndexByte(p.Query, 0) >= 0 || strings.TrimSpace(p.Query) != p.Query) {
		return nil, fail("FAVORITES_REQUEST_INVALID", "Favorite query must be bounded literal UTF-8 text")
	}
	if p.TagID != "" {
		if _, err := strconv.ParseUint(p.TagID, 10, 64); err != nil {
			return nil, fail("FAVORITES_REQUEST_INVALID", "Favorite tag id is invalid")
		}
	}
	ascending := p.Ascending == nil || *p.Ascending
	order := "DESC"
	if ascending {
		order = "ASC"
	}
	query := `SELECT id,type,updated_at_unix_ms,COALESCE(title,''),COALESCE(description,''),COALESCE(source_id,''),COALESCE(from_username,''),COALESCE(content_xml,''),COALESCE(fields_json,'[]'),COALESCE(tags_json,'[]') FROM "` + favoritesTable + `" WHERE 1=1`
	args := []any{}
	if p.Type != nil && *p.Type >= 0 {
		query += ` AND type=?`
		args = append(args, *p.Type)
	}
	if p.Query != "" {
		query += ` AND (instr(lower(COALESCE(title,'')),lower(?))>0 OR instr(lower(COALESCE(description,'')),lower(?))>0 OR instr(lower(COALESCE(content_xml,'')),lower(?))>0 OR instr(lower(COALESCE(from_username,'')),lower(?))>0)`
		args = append(args, p.Query, p.Query, p.Query, p.Query)
	}
	query += ` ORDER BY updated_at_unix_ms ` + order + `,id COLLATE BINARY ` + order + ` LIMIT ?`
	args = append(args, maxFavoritesRows+1)
	rows, err := b.favoritesDB.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fail("FAVORITES_READ_FAILED", "Unable to query the independent favorites fixture")
	}
	defer rows.Close()
	all, err := scanFavoriteRows(rows, maxFavoritesRows+1)
	if err != nil {
		return nil, err
	}
	filtered := make([]favoriteRecord, 0, len(all))
	for _, item := range all {
		if p.TagID != "" {
			matched := false
			for _, tag := range item.Tags {
				if tag.ID == p.TagID {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}
		filtered = append(filtered, item)
	}
	total := len(filtered)
	if total > maxFavoritesRows {
		return nil, fail("FAVORITES_TOO_LARGE", "Favorite fixture exceeds the bounded row limit")
	}
	start := p.Offset
	if start > total {
		start = total
	}
	end := start + p.Limit
	if end > total {
		end = total
	}
	items := filtered[start:end]
	typeCounts := []map[string]any{}
	if p.IncludeTypeCounts {
		counts := map[uint32]int{}
		for _, item := range filtered {
			counts[item.Type]++
		}
		types := make([]int, 0, len(counts))
		for value := range counts {
			types = append(types, int(value))
		}
		sort.Ints(types)
		for _, value := range types {
			typeCounts = append(typeCounts, map[string]any{"type": value, "count": counts[uint32(value)]})
		}
	}
	tagCounts := map[string]struct {
		name  string
		count int
	}{}
	for _, item := range filtered {
		for _, tag := range item.Tags {
			entry := tagCounts[tag.ID]
			entry.name = tag.Name
			entry.count++
			tagCounts[tag.ID] = entry
		}
	}
	tagIDs := make([]string, 0, len(tagCounts))
	for id := range tagCounts {
		tagIDs = append(tagIDs, id)
	}
	sort.Slice(tagIDs, func(i, j int) bool {
		a, _ := strconv.ParseUint(tagIDs[i], 10, 64)
		b, _ := strconv.ParseUint(tagIDs[j], 10, 64)
		return a < b
	})
	tags := make([]map[string]any, 0, len(tagIDs))
	for _, id := range tagIDs {
		entry := tagCounts[id]
		tags = append(tags, map[string]any{"id": id, "name": entry.name, "count": entry.count})
	}
	return map[string]any{"items": items, "sourceDatabase": b.favoritesDB.relative, "sourceTable": favoritesTable, "typeCounts": typeCounts, "total": total, "hasMore": end < total, "tags": tags}, nil
}

func validateFavoriteMediaToken(value string) error {
	if !regexp.MustCompile(`^fav1_[0-9a-f]{32}$`).MatchString(value) {
		return fail("FAVORITES_MEDIA_SCHEMA_INVALID", "Favorite media token is not a synthetic token")
	}
	return nil
}

func validateFavoriteMediaRole(value string) error {
	switch value {
	case "thumbnail", "source", "full", "video", "voice", "file":
		return nil
	default:
		return fail("FAVORITES_MEDIA_SCHEMA_INVALID", "Favorite media role is outside the independent range")
	}
}

func (b *bridge) favoritesMediaSlots(ctx context.Context, p params) (any, error) {
	if b.favoritesDB == nil || !b.favoritesDB.tables[favoriteMediaTable] {
		return nil, fail("FAVORITES_MEDIA_UNAVAILABLE", "Synthetic favorites do not include a media-slot table")
	}
	if p.FavoriteID == "" || len(p.FavoriteID) > 1024 || !utf8.ValidString(p.FavoriteID) || strings.IndexByte(p.FavoriteID, 0) >= 0 {
		return nil, fail("FAVORITES_REQUEST_INVALID", "Favorite id is invalid")
	}
	rows, err := b.favoritesDB.db.QueryContext(ctx, `SELECT item_index,role,token FROM "`+favoriteMediaTable+`" WHERE favorite_id=? ORDER BY item_index ASC,token COLLATE BINARY ASC LIMIT 65`, p.FavoriteID)
	if err != nil {
		return nil, fail("FAVORITES_MEDIA_READ_FAILED", "Unable to query the synthetic favorite media slots")
	}
	defer rows.Close()
	slots := make([]favoriteMediaSlot, 0, 16)
	truncated := false
	for rows.Next() {
		var index int64
		var role, token string
		if err := rows.Scan(&index, &role, &token); err != nil || index < 0 || index > 0xffffffff {
			return nil, fail("FAVORITES_MEDIA_SCHEMA_INVALID", "Favorite media slot has an incompatible value")
		}
		if err := validateFavoriteMediaRole(role); err != nil { return nil, err }
		if err := validateFavoriteMediaToken(token); err != nil { return nil, err }
		if len(slots) >= 64 { truncated = true; continue }
		slots = append(slots, favoriteMediaSlot{ItemIndex: uint32(index), Role: role, Token: token})
	}
	if err := rows.Err(); err != nil { return nil, fail("FAVORITES_MEDIA_READ_FAILED", "Unable to read the synthetic favorite media slots") }
	return map[string]any{"status": "ready", "media": map[string]any{"slots": slots, "truncated": truncated}, "sourceTable": favoriteMediaTable}, nil
}

func (b *bridge) favoriteMedia(ctx context.Context, p params) (any, error) {
	if b.favoritesDB == nil || !b.favoritesDB.tables[favoriteMediaTable] {
		return nil, fail("FAVORITES_MEDIA_UNAVAILABLE", "Synthetic favorites do not include a media-slot table")
	}
	if err := validateFavoriteMediaToken(p.MediaToken); err != nil { return nil, err }
	var favoriteID, role string
	var itemIndex int64
	err := b.favoritesDB.db.QueryRowContext(ctx, `SELECT favorite_id,item_index,role FROM "`+favoriteMediaTable+`" WHERE token=? LIMIT 2`, p.MediaToken).Scan(&favoriteID, &itemIndex, &role)
	if err == sql.ErrNoRows { return map[string]any{"status": "missing"}, nil }
	if err != nil { return nil, fail("FAVORITES_MEDIA_READ_FAILED", "Unable to resolve the synthetic favorite media token") }
	if itemIndex < 0 || itemIndex > 0xffffffff { return nil, fail("FAVORITES_MEDIA_SCHEMA_INVALID", "Favorite media slot index is invalid") }
	if err := validateFavoriteMediaRole(role); err != nil { return nil, err }
	return map[string]any{"status": "ready", "favoriteId": favoriteID, "itemIndex": uint32(itemIndex), "role": role, "token": p.MediaToken, "sourceTable": favoriteMediaTable}, nil
}
