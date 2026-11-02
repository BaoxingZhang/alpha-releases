package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func momentsFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	db, err := sql.Open("sqlite3", filepath.Join(root, "moments.db"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE __alpha_moments_v1 (
id TEXT PRIMARY KEY,
username TEXT NOT NULL,
nickname TEXT NOT NULL DEFAULT '',
created_at_unix_ms INTEGER NOT NULL,
type INTEGER NOT NULL,
text TEXT NOT NULL DEFAULT '',
raw_xml TEXT NOT NULL DEFAULT '',
fields_json TEXT NOT NULL DEFAULT '[]'
)`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO __alpha_moments_v1 (id,username,nickname,created_at_unix_ms,type,text,raw_xml,fields_json) VALUES
('m1','wxid_a','A',1700000000000,1,'hello','<msg>hello</msg>','[{"name":"source","value":"fixture","valueKind":1,"truncated":false}]'),
('m2','wxid_b','B',1700086400000,3,'world','<msg>world</msg>','[]'),
('m3','wxid_a','A',1700172800000,1,'again','','[]')`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestMomentsExplicitSchemaReader(t *testing.T) {
	root := momentsFixture(t)
	b, err := openBridge(root, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "list", Op: "moments.list", Params: json.RawMessage(`{"limit":2,"ascending":true,"keyword":"o"}`)})
	if err != nil {
		t.Fatal(err)
	}
	page := value.(map[string]any)
	items := page["items"].([]momentRecord)
	if len(items) != 2 || items[0].ID != "m1" || items[1].ID != "m2" || page["hasMore"].(bool) {
		t.Fatalf("unexpected moments page: %#v", page)
	}
	authors, err := b.dispatch(context.Background(), request{ID: "authors", Op: "moments.authors", Params: json.RawMessage(`{"limit":10}`)})
	if err != nil {
		t.Fatal(err)
	}
	encodedAuthors, err := json.Marshal(authors)
	if err != nil {
		t.Fatal(err)
	}
	var authorPage struct {
		Items []json.RawMessage `json:"items"`
	}
	if err := json.Unmarshal(encodedAuthors, &authorPage); err != nil {
		t.Fatal(err)
	}
	if len(authorPage.Items) != 2 {
		t.Fatal("expected two authors")
	}
	counts, err := b.dispatch(context.Background(), request{ID: "days", Op: "moments.dayCounts", Params: json.RawMessage(`{"fromUnixMs":"1700000000000","toUnixMs":"1700259200000","utcOffsetMinutes":0}`)})
	if err != nil {
		t.Fatal(err)
	}
	if len(counts.(map[string]any)["days"].([]map[string]string)) != 3 {
		t.Fatalf("unexpected day counts: %#v", counts)
	}
	// Moment ranges are half-open: the row exactly at `toUnixMs` belongs to
	// the following range and must not be returned/counts here.
	bounded, err := b.dispatch(context.Background(), request{ID: "bounded", Op: "moments.list", Params: json.RawMessage(`{"limit":10,"ascending":true,"fromUnixMs":"1700000000000","toUnixMs":"1700086400000"}`)})
	if err != nil {
		t.Fatal(err)
	}
	boundedItems := bounded.(map[string]any)["items"].([]momentRecord)
	if len(boundedItems) != 1 || boundedItems[0].ID != "m1" {
		t.Fatalf("expected half-open moments list, got %#v", bounded)
	}
	boundedDays, err := b.dispatch(context.Background(), request{ID: "bounded-days", Op: "moments.dayCounts", Params: json.RawMessage(`{"fromUnixMs":"1700000000000","toUnixMs":"1700086400000","utcOffsetMinutes":0}`)})
	if err != nil {
		t.Fatal(err)
	}
	if got := boundedDays.(map[string]any)["days"].([]map[string]string); len(got) != 1 || got[0]["count"] != "1" {
		t.Fatalf("expected half-open moments day counts, got %#v", boundedDays)
	}
}

func TestMomentsRejectsUnmarkedDatabase(t *testing.T) {
	root, _ := fixtureDB(t, `CREATE TABLE moments (id TEXT)`)
	// Rename the fixture to the optional moments filename without adding the
	// explicit marker table.  Native WeChat schemas must fail closed here.
	if err := os.Rename(filepath.Join(root, "contact.db"), filepath.Join(root, "moments.db")); err != nil {
		t.Fatal(err)
	}
	_, err := openBridge(root, "fixture")
	expectCode(t, err, "SCHEMA_UNSUPPORTED")
}

func TestMomentsEmojiUsesExplicitSyntheticMapping(t *testing.T) {
	root := momentsFixture(t)
	db, err := sql.Open("sqlite3", filepath.Join(root, "moments.db"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE __alpha_moment_emoji_v1 (source TEXT NOT NULL,sha256 TEXT NOT NULL,size_bytes INTEGER NOT NULL,mime_type TEXT NOT NULL,relative_path TEXT NOT NULL,account_id TEXT NOT NULL DEFAULT '',moment_id TEXT NOT NULL DEFAULT '')`)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO __alpha_moment_emoji_v1 VALUES (?,?,?,?,?,?,?)`, "emoji-xml:__alpha_moment_emoji_v1:smile", "0000000000000000000000000000000000000000000000000000000000000000", 12, "image/png", "media/moment.png", "fixture", "m1")
	if err != nil {
		t.Fatal(err)
	}
	db.Close()
	b, err := openBridge(root, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "emoji", Op: "moments.emoji", Params: json.RawMessage(`{"source":"emoji-xml:__alpha_moment_emoji_v1:smile","limit":100}`)})
	if err != nil {
		t.Fatal(err)
	}
	result := value.(map[string]any)
	if result["status"] != "ready" || result["sha256"] != "0000000000000000000000000000000000000000000000000000000000000000" {
		t.Fatalf("unexpected emoji result: %#v", result)
	}
	_, err = b.dispatch(context.Background(), request{ID: "ambiguous", Op: "moments.emoji", Params: json.RawMessage(`{"source":"emoji-xml:__alpha_moment_emoji_v1:missing","limit":100}`)})
	if err != nil {
		t.Fatal(err)
	}
}
