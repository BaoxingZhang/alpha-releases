package main

// Group pins are exposed only through an explicit, project-owned fixture
// schema.  The native Alpha table is deliberately not treated as compatible:
// native __alpha_group_pins rows require an unavailable schema/ABI and must
// continue to fail closed.

import (
	"context"
	"regexp"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	groupPinsFixtureTable = "__alpha_group_pins_v1"
	groupPinsTable        = "__alpha_group_pins"
	maxGroupPinsRows      = 100000
	maxGroupPinPreview    = 64 << 10
	maxGroupPinSeq        = uint64(1<<53 - 1)
)

var groupPinUint64 = regexp.MustCompile(`^(?:0|[1-9][0-9]{0,19})$`)

func validGroupPinText(value string, max int, required bool) bool {
	return (!required || value != "") && len(value) <= max && utf8.ValidString(value) &&
		strings.TrimSpace(value) == value && strings.IndexByte(value, 0) < 0 &&
		strings.IndexFunc(value, unicode.IsControl) < 0
}

func validGroupPinUint(value string, maximum uint64, nonZero bool) bool {
	if !groupPinUint64.MatchString(value) {
		return false
	}
	n, err := strconv.ParseUint(value, 10, 64)
	return err == nil && n <= maximum && (!nonZero || n != 0)
}

// groupPins reads the project-owned marker table and maps it to the wire
// table name expected by the recovered renderer.  The marker table is kept
// separate so a native database cannot accidentally be advertised as Alpha
// compatible.
func (b *bridge) groupPins(ctx context.Context, p params) (any, error) {
	if b.contactDB == nil || !b.contactDB.tables[groupPinsFixtureTable] {
		return nil, fail("CAPABILITY_UNAVAILABLE", "Synthetic group pins are not present")
	}
	if !validChatroom(p.Query) {
		return nil, fail("GROUP_PINS_REQUEST_INVALID", "A chatroom query is required")
	}
	if p.Ascending == nil || !*p.Ascending {
		return nil, fail("GROUP_PINS_REQUEST_INVALID", "Synthetic group pins require ascending order")
	}
	if p.Offset < 0 || p.Offset > maxGroupPinsRows {
		return nil, fail("GROUP_PINS_REQUEST_INVALID", "Group pin offset is outside the bounded range")
	}
	rows, err := b.contactDB.db.QueryContext(ctx, `SELECT rowid,seq,sender_id,server_id,local_type,preview,COALESCE(pinned_by,'') FROM "`+groupPinsFixtureTable+`" WHERE chatroom_id=? ORDER BY seq ASC,server_id COLLATE BINARY ASC,rowid ASC LIMIT ? OFFSET ?`, p.Query, p.Limit, p.Offset)
	if err != nil {
		return nil, fail("GROUP_PINS_READ_FAILED", "Unable to query the synthetic group pins fixture")
	}
	defer rows.Close()
	items := make([]generalRecord, 0, p.Limit)
	for rows.Next() {
		var rowID, localType int64
		var seq string
		var sender, serverID, preview, pinnedBy string
		if err := rows.Scan(&rowID, &seq, &sender, &serverID, &localType, &preview, &pinnedBy); err != nil {
			return nil, fail("GROUP_PINS_SCHEMA_INVALID", "Synthetic group pin row has an incompatible value")
		}
		if rowID < 1 || !validGroupPinUint(seq, maxGroupPinSeq, false) {
			return nil, fail("GROUP_PINS_SCHEMA_INVALID", "Synthetic group pin sequence is invalid")
		}
		if !validGroupPinUint(serverID, ^uint64(0), true) {
			return nil, fail("GROUP_PINS_SCHEMA_INVALID", "Synthetic group pin server id is invalid")
		}
		if localType < 0 || localType > int64(^uint32(0)) || !validGroupPinText(sender, 256, true) || !validGroupPinText(preview, maxGroupPinPreview, false) || !validGroupPinText(pinnedBy, 256, false) {
			return nil, fail("GROUP_PINS_SCHEMA_INVALID", "Synthetic group pin text or type is invalid")
		}
		fields := []generalField{
			{Name: "seq", Value: seq, ValueKind: 1},
			{Name: "senderId", Value: sender, ValueKind: 1},
			{Name: "serverId", Value: serverID, ValueKind: 1},
			{Name: "localType", Value: strconv.FormatInt(localType, 10), ValueKind: 1},
			{Name: "preview", Value: preview, ValueKind: 1},
			{Name: "pinnedBy", Value: pinnedBy, ValueKind: 1},
		}
		items = append(items, generalRecord{
			TableName:     groupPinsTable,
			ID:            p.Query + ":" + seq + ":" + serverID + ":" + strconv.FormatInt(rowID, 10),
			EventAtUnixMs: "0",
			Actor:         sender,
			Content:       preview,
			Fields:        fields,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, fail("GROUP_PINS_READ_FAILED", "Unable to read the synthetic group pins fixture")
	}
	return generalPage{Items: items, SourceDatabase: b.contactDB.relative}, nil
}
