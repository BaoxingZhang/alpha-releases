package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const contactSchema = `CREATE TABLE contact (username TEXT, local_type INTEGER, alias TEXT, remark TEXT, nick_name TEXT)`

func fixtureDB(t *testing.T, schema string) (string, string) {
	t.Helper()
	root := t.TempDir()
	name := filepath.Join(root, "contact.db")
	db, err := sql.Open("sqlite3", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	return root, name
}
func expectCode(t *testing.T, err error, code string) {
	t.Helper()
	var actual *bridgeError
	if !errors.As(err, &actual) || actual.Code != code {
		t.Fatalf("expected %s; got %v", code, err)
	}
}
func TestSQLiteReadOnlyAtDriverLevel(t *testing.T) {
	root, name := fixtureDB(t, contactSchema)
	before, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	if _, err := b.contactDB.db.Exec("CREATE TABLE prohibited (id INTEGER)"); err == nil {
		t.Fatal("query_only allowed a write")
	}
	// Even after changing the connection pragma internally, mode=ro remains an independent boundary.
	if _, err := b.contactDB.db.Exec("PRAGMA query_only=OFF"); err != nil {
		t.Fatal(err)
	}
	if _, err := b.contactDB.db.Exec("CREATE TABLE still_prohibited (id INTEGER)"); err == nil {
		t.Fatal("mode=ro allowed a write")
	}
	if _, err := b.contactDB.db.Exec("PRAGMA query_only=ON"); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	if sha256.Sum256(before) != sha256.Sum256(after) {
		t.Fatal("database bytes changed")
	}
	files, _ := os.ReadDir(root)
	if len(files) != 1 {
		t.Fatal("SQLite created sidecars")
	}
}
func TestSchemaValidatedBeforeAccountInfo(t *testing.T) {
	root, _ := fixtureDB(t, "CREATE TABLE contact (username TEXT)")
	_, err := openBridge(root, "synthetic")
	expectCode(t, err, "SCHEMA_UNSUPPORTED")
	t.Run("without-rowid", func(t *testing.T) {
		root, _ := fixtureDB(t, `CREATE TABLE contact (username TEXT PRIMARY KEY,local_type INTEGER,alias TEXT,remark TEXT,nick_name TEXT) WITHOUT ROWID`)
		_, err := openBridge(root, "synthetic")
		expectCode(t, err, "SCHEMA_UNSUPPORTED")
	})
	t.Run("shadowed-rowid", func(t *testing.T) {
		root, _ := fixtureDB(t, `CREATE TABLE contact (rowid INTEGER,username TEXT,local_type INTEGER,alias TEXT,remark TEXT,nick_name TEXT)`)
		_, err := openBridge(root, "synthetic")
		expectCode(t, err, "SCHEMA_UNSUPPORTED")
	})
}

func TestContactCompatibilityAliasesRemainReadOnlyAndBounded(t *testing.T) {
	root := t.TempDir()
	name := filepath.Join(root, "contact.db")
	db, err := sql.Open("sqlite3", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE contact (user_name TEXT, localType INTEGER, WCDB_CT_remark TEXT)`); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO contact(user_name,localType,WCDB_CT_remark) VALUES('wxid_alias',1,'Alias Remark')`); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "alias-list", Op: "contacts.list", Params: json.RawMessage(`{"limit":10}`)})
	if err != nil {
		t.Fatal(err)
	}
	result, ok := value.(page[contact])
	if !ok || len(result.Items) != 1 {
		t.Fatalf("unexpected alias page: %#v", value)
	}
	if result.Items[0].Username != "wxid_alias" || result.Items[0].LocalType != "1" || result.Items[0].Remark != "Alias Remark" || result.Items[0].Alias != "" || result.Items[0].NickName != "" {
		t.Fatalf("unexpected alias projection: %#v", result.Items[0])
	}
	lookup, err := b.dispatch(context.Background(), request{ID: "alias-lookup", Op: "contacts.lookup", Params: json.RawMessage(`{"usernames":["wxid_alias"]}`)})
	if err != nil {
		t.Fatal(err)
	}
	lookupResult, ok := lookup.(contactLookupResult)
	if !ok || len(lookupResult.Items) != 1 || lookupResult.Items[0].Remark != "Alias Remark" {
		t.Fatalf("unexpected alias lookup: %#v", lookup)
	}
	if _, err := b.contactDB.db.Exec("CREATE TABLE denied (id INTEGER)"); err == nil {
		t.Fatal("compatibility reader allowed a write")
	}
}

func TestContactCompatibilityAliasesRequireIdentityColumns(t *testing.T) {
	root := t.TempDir()
	name := filepath.Join(root, "contact.db")
	db, err := sql.Open("sqlite3", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE contact (nickname TEXT, remark TEXT)`); err != nil {
		db.Close()
		t.Fatal(err)
	}
	db.Close()
	_, err = openBridge(root, "synthetic")
	expectCode(t, err, "SCHEMA_UNSUPPORTED")
}

func TestContactCompatibilityAliasesRejectMalformedLocalType(t *testing.T) {
	root := t.TempDir()
	name := filepath.Join(root, "contact.db")
	db, err := sql.Open("sqlite3", name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE contact (user_name TEXT, localType TEXT, remark TEXT)`); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO contact(user_name,localType,remark) VALUES('wxid_bad','not-a-number','Bad')`); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "bad-local-type", Op: "contacts.list", Params: json.RawMessage(`{"limit":10}`)})
	expectCode(t, err, "ROW_INVALID")
}
func TestStableDatasetAndSidecarBoundary(t *testing.T) {
	t.Run("new-shard", func(t *testing.T) {
		root, _ := fixtureDB(t, contactSchema)
		b, err := openBridge(root, "synthetic")
		if err != nil {
			t.Fatal(err)
		}
		defer b.close()
		if err := os.WriteFile(filepath.Join(root, "message_99.db"), []byte("new shard"), 0600); err != nil {
			t.Fatal(err)
		}
		expectCode(t, b.verify(), "DATASET_CHANGED")
	})
	t.Run("changed", func(t *testing.T) {
		root, name := fixtureDB(t, contactSchema)
		b, err := openBridge(root, "synthetic")
		if err != nil {
			t.Fatal(err)
		}
		defer b.close()
		f, err := os.OpenFile(name, os.O_APPEND|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		f.Write([]byte{0})
		f.Close()
		expectCode(t, b.verify(), "DATASET_CHANGED")
	})
	t.Run("journal", func(t *testing.T) {
		root, name := fixtureDB(t, contactSchema)
		if err := os.WriteFile(name+"-wal", []byte{}, 0600); err != nil {
			t.Fatal(err)
		}
		_, err := openBridge(root, "synthetic")
		expectCode(t, err, "ACTIVE_DATABASE_DENIED")
	})
	t.Run("symlink", func(t *testing.T) {
		root, _ := fixtureDB(t, contactSchema)
		other := t.TempDir()
		link := filepath.Join(other, "link")
		if err := os.Symlink(root, link); err != nil {
			t.Fatal(err)
		}
		_, err := openBridge(link, "synthetic")
		expectCode(t, err, "SYMLINK_DENIED")
	})
	t.Run("member-link", func(t *testing.T) {
		root, name := fixtureDB(t, contactSchema)
		if err := os.Symlink(name, filepath.Join(root, "unexpected")); err != nil {
			t.Fatal(err)
		}
		_, err := openBridge(root, "synthetic")
		expectCode(t, err, "SYMLINK_DENIED")
	})
}
func TestProtocolRejectsUnknownWriteAndContinues(t *testing.T) {
	root, _ := fixtureDB(t, contactSchema)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	input := strings.NewReader("bad json\n{\"id\":\"2\",\"op\":\"sql.exec\",\"params\":{}}\n{\"id\":\"3\",\"op\":\"account.info\"}\n")
	var out bytes.Buffer
	if err := serve(b, input, &out); err != nil {
		t.Fatal(err)
	}
	decoder := json.NewDecoder(&out)
	var first, second, third response
	for _, value := range []*response{&first, &second, &third} {
		if err := decoder.Decode(value); err != nil {
			t.Fatal(err)
		}
	}
	if first.Error == nil || first.Error.Code != "INVALID_REQUEST" {
		t.Fatalf("%+v", first)
	}
	if second.Error == nil || second.Error.Code != "UNSUPPORTED_OPERATION" {
		t.Fatalf("%+v", second)
	}
	if !third.OK {
		t.Fatalf("%+v", third)
	}
	_, err = b.dispatch(context.Background(), request{ID: "4", Op: "contacts.list", Params: json.RawMessage(`{"mode":"rw"}`)})
	expectCode(t, err, "INVALID_REQUEST")
}
