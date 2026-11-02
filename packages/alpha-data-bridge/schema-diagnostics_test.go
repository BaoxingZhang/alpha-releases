package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"testing"
)

func TestSchemaDiagnosticsListsSelectedSQLiteMetadata(t *testing.T) {
	root, _ := fixtureDB(t, `CREATE TABLE contact (username TEXT NOT NULL, local_type INTEGER, alias TEXT, remark TEXT, nick_name TEXT, PRIMARY KEY(username));
CREATE TABLE diagnostic_extra (id INTEGER PRIMARY KEY, label TEXT DEFAULT 'x')`)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "schema", Op: "schema.inspect", Params: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	result := value.(map[string]any)
	if result["status"] != "ready" || result["sourceKind"] != "explicit-offline-sqlite-schema" || result["nativeSchemaSupported"] != false || result["complete"] != false || result["readOnly"] != true {
		t.Fatalf("unexpected schema boundary: %#v", result)
	}
	databases := result["databases"].([]schemaDiagnosticDatabase)
	if len(databases) != 1 || databases[0].Path != "contact.db" || len(databases[0].Tables) != 2 {
		t.Fatalf("unexpected database inventory: %#v", databases)
	}
	var contactTable *schemaDiagnosticTable
	for i := range databases[0].Tables {
		if databases[0].Tables[i].Name == "contact" {
			contactTable = &databases[0].Tables[i]
		}
	}
	if contactTable == nil || contactTable.Columns[0].Name != "username" || !contactTable.Columns[0].NotNull || contactTable.Columns[0].PrimaryKey != 1 {
		t.Fatalf("unexpected contact metadata: %#v", databases[0].Tables)
	}
	if result["tableCount"] != 2 {
		t.Fatalf("tableCount = %#v", result["tableCount"])
	}
	if _, err := b.dispatch(context.Background(), request{ID: "bad", Op: "schema.inspect", Params: json.RawMessage(`{"unexpected":true}`)}); err == nil {
		t.Fatal("expected strict schema diagnostics parameters")
	}
}

func TestSchemaDiagnosticsReadsMessageAndSessionTables(t *testing.T) {
	root, _ := fixtureDB(t, contactSchema)
	createSchemaDiagnosticsDB(t, filepath.Join(root, "session.db"), `CREATE TABLE SessionTable (username TEXT,summary TEXT,last_timestamp INTEGER,sort_timestamp INTEGER,last_msg_sender TEXT,last_sender_display_name TEXT)`)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "schema", Op: "schema.inspect", Params: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	databases := value.(map[string]any)["databases"].([]schemaDiagnosticDatabase)
	if len(databases) != 2 || databases[0].Path != "contact.db" || databases[1].Path != "session.db" {
		t.Fatalf("expected sorted selected databases: %#v", databases)
	}
}

func createSchemaDiagnosticsDB(t *testing.T, path, schema string) {
	t.Helper()
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
}
