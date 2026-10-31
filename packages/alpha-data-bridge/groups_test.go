package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"testing"
)

func appendRoomVarint(dst []byte, value uint64) []byte {
	for value >= 0x80 {
		dst = append(dst, byte(value)|0x80)
		value >>= 7
	}
	return append(dst, byte(value))
}

func appendRoomBytes(dst []byte, field uint64, value []byte) []byte {
	dst = appendRoomVarint(dst, field<<3|2)
	dst = appendRoomVarint(dst, uint64(len(value)))
	return append(dst, value...)
}

func roomUserBytes(username, displayName string) []byte {
	var user []byte
	user = appendRoomBytes(user, 1, []byte(username))
	if displayName != "" {
		user = appendRoomBytes(user, 2, []byte(displayName))
	}
	return user
}

func roomDataBytes(users ...[2]string) []byte {
	var room []byte
	for _, user := range users {
		room = appendRoomBytes(room, 1, roomUserBytes(user[0], user[1]))
	}
	return room
}

func groupFixture(t *testing.T, room []byte) string {
	t.Helper()
	root, name := fixtureDB(t, `CREATE TABLE contact (username TEXT, local_type INTEGER, alias TEXT, remark TEXT, nick_name TEXT);
CREATE TABLE chat_room (id INTEGER PRIMARY KEY, username TEXT, owner TEXT, ext_buffer BLOB)`)
	db, err := sql.Open("sqlite3", name)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO contact VALUES
('wxid_owner',1,'owner_alias','Owner remark','Owner Nick'),
('wxid_member',1,'member_alias','Member remark','Member Nick')`)
	if err == nil {
		_, err = db.Exec(`INSERT INTO chat_room(username,owner,ext_buffer) VALUES(?,?,?)`, "room@chatroom", "wxid_owner", room)
	}
	if closeErr := db.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		t.Fatal(err)
	}
	return root
}

func TestRoomDataParserAndGroupMembers(t *testing.T) {
	room := roomDataBytes([2]string{"wxid_owner", "Owner in room"}, [2]string{"wxid_member", "Member in room"})
	users, err := parseRoomData(room)
	if err != nil || len(users) != 2 || users[0].Username != "wxid_owner" || users[0].DisplayName != "Owner in room" {
		t.Fatalf("unexpected RoomData parse: %#v, %v", users, err)
	}
	root := groupFixture(t, room)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	info := b.info().(map[string]any)
	foundCapability := false
	for _, capability := range info["capabilities"].([]string) {
		if capability == "groups.members" {
			foundCapability = true
		}
	}
	if !foundCapability {
		t.Fatal("group member capability was not advertised")
	}
	value, err := b.dispatch(context.Background(), request{ID: "group", Op: "general.list", Params: json.RawMessage(`{"tableName":"__alpha_group_members","query":"room@chatroom","limit":1000,"offset":0,"ascending":true}`)})
	if err != nil {
		t.Fatal(err)
	}
	page := value.(generalPage)
	if len(page.Items) != 2 || page.Items[0].Actor != "wxid_owner" || page.Items[0].Fields[1].Value != "Owner in room" {
		t.Fatalf("unexpected group member page: %#v", page)
	}
	owner := false
	for _, field := range page.Items[0].Fields {
		if field.Name == "isOwner" && field.Value == "true" {
			owner = true
		}
	}
	if !owner {
		t.Fatal("owner marker missing")
	}
	value, err = b.dispatch(context.Background(), request{ID: "page", Op: "general.list", Params: json.RawMessage(`{"tableName":"__alpha_group_members","query":"room@chatroom","limit":1,"offset":1,"ascending":true}`)})
	if err != nil || len(value.(generalPage).Items) != 1 || value.(generalPage).Items[0].Actor != "wxid_member" {
		t.Fatalf("offset page failed: %#v, %v", value, err)
	}
}

func TestRoomDataParserRejectsMalformedInput(t *testing.T) {
	if _, err := parseRoomData([]byte{0x0a, 0x05, 0x0a, 0x03, 'x'}); err == nil {
		t.Fatal("truncated RoomData was accepted")
	}
	room := roomDataBytes([2]string{"wxid_owner", ""})
	root := groupFixture(t, room)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "bad", Op: "general.list", Params: json.RawMessage(`{"tableName":"__alpha_group_members","query":"room@chatroom","limit":1,"ascending":false}`)})
	expectCode(t, err, "INVALID_PARAMS")
}
