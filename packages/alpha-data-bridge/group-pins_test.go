package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
)

func groupPinsFixture(t *testing.T, withFixture bool) string {
	t.Helper()
	root, name := fixtureDB(t, `CREATE TABLE contact (username TEXT, local_type INTEGER, alias TEXT, remark TEXT, nick_name TEXT);`)
	db, err := sql.Open("sqlite3", name)
	if err != nil {
		t.Fatal(err)
	}
	if withFixture {
		_, err = db.Exec(`CREATE TABLE __alpha_group_pins_v1 (
chatroom_id TEXT NOT NULL,
seq TEXT NOT NULL,
sender_id TEXT NOT NULL,
server_id TEXT NOT NULL,
local_type INTEGER NOT NULL,
preview TEXT NOT NULL,
pinned_by TEXT NOT NULL
)`)
		if err == nil {
			_, err = db.Exec(`INSERT INTO __alpha_group_pins_v1 VALUES
('room@chatroom','1','wxid_alpha','9223372036854775808',1,'第一条置顶','wxid_owner'),
('room@chatroom','2','wxid_beta','9',49,'第二条置顶','wxid_alpha')`)
		}
	}
	if err == nil {
		_, err = db.Exec(`INSERT INTO contact VALUES (?,?,?,?,?)`, "room@chatroom", 2, "", "合成群聊", "")
	}
	if closeErr := db.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		t.Fatal(err)
	}
	_ = filepath.Base(name)
	return root
}

func TestSyntheticGroupPinsFixture(t *testing.T) {
	root := groupPinsFixture(t, true)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	info := b.info().(map[string]any)
	capabilities := info["capabilities"].([]string)
	found := false
	for _, capability := range capabilities {
		if capability == "groups.pinnedMessages" {
			found = true
		}
	}
	if !found {
		t.Fatalf("synthetic group pin capability missing: %#v", capabilities)
	}
	value, err := b.dispatch(context.Background(), request{ID: "pins", Op: "general.list", Params: json.RawMessage(`{"tableName":"__alpha_group_pins","query":"room@chatroom","limit":100,"offset":0,"ascending":true}`)})
	if err != nil {
		t.Fatal(err)
	}
	page := value.(generalPage)
	if len(page.Items) != 2 || page.Items[0].TableName != groupPinsTable || page.Items[0].Actor != "wxid_alpha" || page.Items[0].Content != "第一条置顶" {
		t.Fatalf("unexpected synthetic group pins: %#v", page.Items)
	}
	fields := map[string]string{}
	for _, field := range page.Items[0].Fields {
		fields[field.Name] = field.Value
	}
	if fields["seq"] != "1" || fields["senderId"] != "wxid_alpha" || fields["serverId"] != "9223372036854775808" || fields["pinnedBy"] != "wxid_owner" {
		t.Fatalf("unexpected synthetic group pin fields: %#v", fields)
	}
	if _, err := b.dispatch(context.Background(), request{ID: "bad-order", Op: "general.list", Params: json.RawMessage(`{"tableName":"__alpha_group_pins","query":"room@chatroom","limit":100,"offset":0,"ascending":false}`)}); err == nil {
		t.Fatal("descending synthetic group pins should fail closed")
	}
}

func TestNativeGroupPinsTableDoesNotBecomeSyntheticCapability(t *testing.T) {
	root := groupPinsFixture(t, false)
	db, err := sql.Open("sqlite3", filepath.Join(root, "contact.db"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE __alpha_group_pins (chatroom_id TEXT, seq INTEGER, sender_id TEXT, server_id TEXT, local_type INTEGER, preview TEXT, pinned_by TEXT)`)
	if closeErr := db.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		t.Fatal(err)
	}
	b, err := openBridge(root, "native-shaped")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	info := b.info().(map[string]any)
	for _, capability := range info["capabilities"].([]string) {
		if capability == "groups.pinnedMessages" {
			t.Fatal("native-shaped table must not advertise synthetic group pins")
		}
	}
	_, err = b.dispatch(context.Background(), request{ID: "native-shaped", Op: "general.list", Params: json.RawMessage(`{"tableName":"__alpha_group_pins","query":"room@chatroom","limit":100,"offset":0,"ascending":true}`)})
	expectCode(t, err, "CAPABILITY_UNAVAILABLE")
}
