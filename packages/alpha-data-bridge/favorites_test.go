package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func favoritesFixture(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	db, err := sql.Open("sqlite3", filepath.Join(root, "favorite.db"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE __alpha_favorites_v1 (
id TEXT PRIMARY KEY,
type INTEGER NOT NULL,
updated_at_unix_ms INTEGER NOT NULL,
title TEXT NOT NULL DEFAULT '',
description TEXT NOT NULL DEFAULT '',
source_id TEXT NOT NULL DEFAULT '',
from_username TEXT NOT NULL DEFAULT '',
content_xml TEXT NOT NULL DEFAULT '',
fields_json TEXT NOT NULL DEFAULT '[]',
tags_json TEXT NOT NULL DEFAULT '[]'
)`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO __alpha_favorites_v1 (id,type,updated_at_unix_ms,title,description,source_id,from_username,content_xml,fields_json,tags_json) VALUES
('f1',1,1700000000000,'第一条','描述一','msg-1','wxid_a','<msg>one</msg>','[{"name":"__alpha_synthetic_only","value":"true","valueKind":1,"truncated":false}]','[{"id":"7","name":"工作"}]'),
('f2',3,1700086400000,'第二条','描述二','msg-2','wxid_b','<msg>two</msg>','[]','[{"id":"8","name":"阅读"}]'),
('f3',1,1700172800000,'第三条','描述三','msg-3','wxid_a','<msg>three</msg>','[]','[{"id":"7","name":"工作"},{"id":"8","name":"阅读"}]')`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	return root
}

func TestFavoritesExplicitSchemaReader(t *testing.T) {
	root := favoritesFixture(t)
	b, err := openBridge(root, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "list", Op: "favorites.list", Params: json.RawMessage(`{"limit":2,"ascending":true,"includeTypeCounts":true}`)})
	if err != nil {
		t.Fatal(err)
	}
	page := value.(map[string]any)
	items := page["items"].([]favoriteRecord)
	if len(items) != 2 || items[0].ID != "f1" || items[1].ID != "f2" || !page["hasMore"].(bool) {
		t.Fatalf("unexpected favorite page: %#v", page)
	}
	if page["total"].(int) != 3 || len(page["typeCounts"].([]map[string]any)) != 2 || len(page["tags"].([]map[string]any)) != 2 {
		t.Fatalf("unexpected favorite aggregates: %#v", page)
	}
	tagged, err := b.dispatch(context.Background(), request{ID: "tag", Op: "favorites.list", Params: json.RawMessage(`{"limit":10,"tagId":"7","ascending":true}`)})
	if err != nil {
		t.Fatal(err)
	}
	tagItems := tagged.(map[string]any)["items"].([]favoriteRecord)
	if len(tagItems) != 2 || tagItems[0].ID != "f1" || tagItems[1].ID != "f3" {
		t.Fatalf("unexpected tag filter: %#v", tagged)
	}
	queried, err := b.dispatch(context.Background(), request{ID: "query", Op: "favorites.list", Params: json.RawMessage(`{"limit":10,"query":"第二","ascending":true}`)})
	if err != nil {
		t.Fatal(err)
	}
	queryItems := queried.(map[string]any)["items"].([]favoriteRecord)
	if len(queryItems) != 1 || queryItems[0].ID != "f2" {
		t.Fatalf("unexpected query filter: %#v", queried)
	}
}

func TestFavoritesRejectsUnmarkedDatabase(t *testing.T) {
	root, _ := fixtureDB(t, `CREATE TABLE fav_item (id TEXT)`)
	if err := os.Rename(filepath.Join(root, "contact.db"), filepath.Join(root, "favorite.db")); err != nil {
		t.Fatal(err)
	}
	_, err := openBridge(root, "fixture")
	expectCode(t, err, "NO_DATABASES")
}

func TestFavoritesPreservesAlternateDatabaseName(t *testing.T) {
	root := favoritesFixture(t)
	if err := os.Rename(filepath.Join(root, "favorite.db"), filepath.Join(root, "favorites.db")); err != nil {
		t.Fatal(err)
	}
	b, err := openBridge(root, "fixture")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "alternate", Op: "favorites.list", Params: json.RawMessage(`{"limit":1,"ascending":true}`)})
	if err != nil {
		t.Fatal(err)
	}
	if got := value.(map[string]any)["sourceDatabase"]; got != "favorites.db" {
		t.Fatalf("sourceDatabase = %#v, want favorites.db", got)
	}
}

func TestFavoriteMediaSlotsUseExplicitSyntheticTable(t *testing.T) {
	root := favoritesFixture(t)
	db, err := sql.Open("sqlite3", filepath.Join(root, "favorite.db"))
	if err != nil { t.Fatal(err) }
	_, err = db.Exec(`CREATE TABLE __alpha_favorite_media_v1 (favorite_id TEXT NOT NULL, item_index INTEGER NOT NULL, role TEXT NOT NULL, token TEXT NOT NULL UNIQUE, PRIMARY KEY (favorite_id,item_index,role))`)
	if err != nil { db.Close(); t.Fatal(err) }
	_, err = db.Exec(`INSERT INTO __alpha_favorite_media_v1 VALUES ('f1',0,'source','fav1_0123456789abcdef0123456789abcdef')`)
	if err != nil { db.Close(); t.Fatal(err) }
	if err := db.Close(); err != nil { t.Fatal(err) }
	b, err := openBridge(root, "fixture")
	if err != nil { t.Fatal(err) }
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "slots", Op: "favorites.mediaSlots", Params: json.RawMessage(`{"favoriteId":"f1"}`)})
	if err != nil { t.Fatal(err) }
	page := value.(map[string]any)
	media := page["media"].(map[string]any)
	slots := media["slots"].([]favoriteMediaSlot)
	if len(slots) != 1 || slots[0].Token != "fav1_0123456789abcdef0123456789abcdef" { t.Fatalf("unexpected slots: %#v", value) }
	resolved, err := b.dispatch(context.Background(), request{ID: "media", Op: "favorites.media", Params: json.RawMessage(`{"token":"fav1_0123456789abcdef0123456789abcdef"}`)})
	if err != nil { t.Fatal(err) }
	if resolved.(map[string]any)["status"] != "ready" { t.Fatalf("unexpected resolution: %#v", resolved) }
	missing, err := b.dispatch(context.Background(), request{ID: "missing", Op: "favorites.media", Params: json.RawMessage(`{"token":"fav1_ffffffffffffffffffffffffffffffff"}`)})
	if err != nil { t.Fatal(err) }
	if missing.(map[string]any)["status"] != "missing" { t.Fatalf("unexpected missing result: %#v", missing) }
}
