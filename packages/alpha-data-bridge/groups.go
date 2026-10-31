package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"unicode/utf8"
)

const (
	groupMembersTable = "__alpha_group_members"
	maxRoomDataBytes  = 8 << 20
	maxRoomMembers    = 5000
	maxRoomTextBytes  = 1024
)

type generalField struct {
	Name      string `json:"name"`
	Value     string `json:"value"`
	ValueKind uint32 `json:"valueKind"`
	Truncated bool   `json:"truncated"`
}

type generalRecord struct {
	TableName     string         `json:"tableName"`
	ID            string         `json:"id"`
	EventAtUnixMs string         `json:"eventAtUnixMs"`
	Actor         string         `json:"actor"`
	Content       string         `json:"content"`
	Fields        []generalField `json:"fields"`
}

type generalPage struct {
	Items          []generalRecord `json:"items"`
	SourceDatabase string          `json:"sourceDatabase"`
}

type roomUser struct {
	Username    string
	DisplayName string
}

func validChatroom(name string) bool {
	return len(name) > len("@chatroom") && len(name) <= 256 && strings.HasSuffix(name, "@chatroom") && validConversation(name)
}

func readRoomVarint(data []byte, pos *int) (uint64, error) {
	var value uint64
	for shift := uint(0); shift < 64; shift += 7 {
		if *pos >= len(data) {
			return 0, fail("ROOM_DATA_INVALID", "RoomData ends inside a varint")
		}
		b := data[*pos]
		(*pos)++
		if shift == 63 && b > 1 {
			return 0, fail("ROOM_DATA_INVALID", "RoomData varint overflows")
		}
		value |= uint64(b&0x7f) << shift
		if b&0x80 == 0 {
			return value, nil
		}
	}
	return 0, fail("ROOM_DATA_INVALID", "RoomData varint is too long")
}

func skipRoomField(data []byte, pos *int, wireType byte) error {
	switch wireType {
	case 0:
		_, err := readRoomVarint(data, pos)
		return err
	case 1:
		if len(data)-*pos < 8 {
			return fail("ROOM_DATA_INVALID", "RoomData fixed64 field is truncated")
		}
		*pos += 8
		return nil
	case 2:
		n, err := readRoomVarint(data, pos)
		if err != nil || n > uint64(len(data)-*pos) {
			return fail("ROOM_DATA_INVALID", "RoomData length field is invalid")
		}
		*pos += int(n)
		return nil
	case 5:
		if len(data)-*pos < 4 {
			return fail("ROOM_DATA_INVALID", "RoomData fixed32 field is truncated")
		}
		*pos += 4
		return nil
	default:
		return fail("ROOM_DATA_INVALID", "RoomData uses an unsupported wire type")
	}
}

func roomText(raw []byte) (string, error) {
	if len(raw) > maxRoomTextBytes || !utf8.Valid(raw) || strings.IndexByte(string(raw), 0) >= 0 {
		return "", fail("ROOM_DATA_INVALID", "RoomData text is invalid or oversized")
	}
	return string(raw), nil
}

func parseRoomUser(data []byte) (roomUser, error) {
	var user roomUser
	for pos := 0; pos < len(data); {
		tag, err := readRoomVarint(data, &pos)
		if err != nil || tag == 0 {
			return user, fail("ROOM_DATA_INVALID", "RoomData user tag is invalid")
		}
		field, wireType := tag>>3, byte(tag&7)
		if wireType == 4 {
			return user, fail("ROOM_DATA_INVALID", "RoomData user has an end-group tag")
		}
		if field == 1 || field == 2 || field == 4 {
			if wireType != 2 {
				return user, fail("ROOM_DATA_INVALID", "RoomData user text field has the wrong wire type")
			}
			n, err := readRoomVarint(data, &pos)
			if err != nil || n > uint64(len(data)-pos) {
				return user, fail("ROOM_DATA_INVALID", "RoomData user text length is invalid")
			}
			value, err := roomText(data[pos : pos+int(n)])
			if err != nil {
				return user, err
			}
			pos += int(n)
			switch field {
			case 1:
				user.Username = value
			case 2:
				user.DisplayName = value
			}
			continue
		}
		if err := skipRoomField(data, &pos, wireType); err != nil {
			return user, err
		}
	}
	if user.Username == "" {
		return user, fail("ROOM_DATA_INVALID", "RoomData user has no username")
	}
	return user, nil
}

func parseRoomData(data []byte) ([]roomUser, error) {
	if len(data) == 0 {
		return []roomUser{}, nil
	}
	if len(data) > maxRoomDataBytes {
		return nil, fail("ROOM_DATA_INVALID", "RoomData exceeds the bounded size")
	}
	users := make([]roomUser, 0)
	for pos := 0; pos < len(data); {
		tag, err := readRoomVarint(data, &pos)
		if err != nil || tag == 0 {
			return nil, fail("ROOM_DATA_INVALID", "RoomData tag is invalid")
		}
		field, wireType := tag>>3, byte(tag&7)
		if field != 1 {
			if err := skipRoomField(data, &pos, wireType); err != nil {
				return nil, err
			}
			continue
		}
		if wireType != 2 {
			return nil, fail("ROOM_DATA_INVALID", "RoomData users field has the wrong wire type")
		}
		n, err := readRoomVarint(data, &pos)
		if err != nil || n > uint64(len(data)-pos) || n > maxRoomDataBytes {
			return nil, fail("ROOM_DATA_INVALID", "RoomData user length is invalid")
		}
		user, err := parseRoomUser(data[pos : pos+int(n)])
		if err != nil {
			return nil, err
		}
		pos += int(n)
		if len(users) >= maxRoomMembers {
			return nil, fail("GROUP_MEMBERS_LIMIT_EXCEEDED", "RoomData contains too many members")
		}
		users = append(users, user)
	}
	return users, nil
}

func boundedRoomContact(ctx context.Context, d *database, username string) (contact, bool, error) {
	var item contact
	var kind int64
	const query = `SELECT local_type,
COALESCE(CASE WHEN length(CAST(alias AS BLOB))<=1024 THEN alias ELSE '' END,''),
COALESCE(CASE WHEN length(CAST(remark AS BLOB))<=1024 THEN remark ELSE '' END,''),
COALESCE(CASE WHEN length(CAST(nick_name AS BLOB))<=1024 THEN nick_name ELSE '' END,'')
FROM contact WHERE username COLLATE BINARY=? LIMIT 1`
	err := d.db.QueryRowContext(ctx, query, username).Scan(&kind, &item.Alias, &item.Remark, &item.NickName)
	if err == sql.ErrNoRows {
		return contact{}, false, nil
	}
	if err != nil {
		return contact{}, false, fail("QUERY_FAILED", "Contact lookup failed")
	}
	item.Username = username
	item.LocalType = number(kind)
	return item, true, nil
}

func roomField(name, value string) generalField {
	return generalField{Name: name, Value: value, ValueKind: 1}
}

func (b *bridge) general(ctx context.Context, p params) (any, error) {
	if p.TableName != groupMembersTable {
		return nil, fail("UNSUPPORTED_OPERATION", "Only group member general records are available")
	}
	if b.contactDB == nil || !b.contactDB.tables["chat_room"] {
		return nil, fail("CAPABILITY_UNAVAILABLE", "contact.db chat_room is not present")
	}
	if !validChatroom(p.Query) {
		return nil, fail("INVALID_PARAMS", "A chatroom query is required")
	}
	if p.Ascending == nil || !*p.Ascending {
		return nil, fail("INVALID_PARAMS", "Group member records require ascending order")
	}
	var owner string
	var ext []byte
	var extSize int64
	err := b.contactDB.db.QueryRowContext(ctx, `SELECT COALESCE(CASE WHEN length(CAST(owner AS BLOB))<=1024 THEN owner ELSE '' END,''),CASE WHEN length(CAST(ext_buffer AS BLOB))<=8388608 THEN ext_buffer ELSE NULL END,COALESCE(length(CAST(ext_buffer AS BLOB)),0) FROM chat_room WHERE username COLLATE BINARY=? LIMIT 1`, p.Query).Scan(&owner, &ext, &extSize)
	if err == sql.ErrNoRows {
		return generalPage{Items: []generalRecord{}, SourceDatabase: b.contactDB.relative}, nil
	}
	if err != nil {
		return nil, fail("QUERY_FAILED", "Chatroom lookup failed")
	}
	if extSize > maxRoomDataBytes {
		return nil, fail("ROOM_DATA_INVALID", "RoomData exceeds the bounded size")
	}
	users, err := parseRoomData(ext)
	if err != nil {
		return nil, err
	}
	start := p.Offset
	if start > len(users) {
		start = len(users)
	}
	end := start + p.Limit
	if end > len(users) {
		end = len(users)
	}
	items := make([]generalRecord, 0, end-start)
	for _, member := range users[start:end] {
		fields := []generalField{roomField("username", member.Username)}
		if member.DisplayName != "" {
			fields = append(fields, roomField("groupNickname", member.DisplayName))
		}
		if item, found, err := boundedRoomContact(ctx, b.contactDB, member.Username); err != nil {
			return nil, err
		} else if found {
			if item.NickName != "" {
				fields = append(fields, roomField("nickname", item.NickName))
			}
			if item.Remark != "" {
				fields = append(fields, roomField("remark", item.Remark))
			}
			if item.Alias != "" {
				fields = append(fields, roomField("alias", item.Alias))
			}
		}
		if owner != "" {
			fields = append(fields, roomField("isOwner", fmt.Sprintf("%t", member.Username == owner)))
		}
		items = append(items, generalRecord{TableName: groupMembersTable, ID: p.Query + ":" + member.Username, EventAtUnixMs: "0", Actor: member.Username, Fields: fields})
	}
	return generalPage{Items: items, SourceDatabase: b.contactDB.relative}, nil
}
