package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"
	"testing"
)

func insertContacts(t *testing.T, name string, rows ...[]any) {
	t.Helper()
	db, err := sql.Open("sqlite3", name)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, row := range rows {
		if _, err := db.Exec(`INSERT INTO contact(username,local_type,alias,remark,nick_name) VALUES(?,?,?,?,?)`, row...); err != nil {
			t.Fatal(err)
		}
	}
}

func TestContactsLookupPreservesOrderAndOmitsMissing(t *testing.T) {
	root, name := fixtureDB(t, contactSchema)
	insertContacts(t, name,
		[]any{"wxid_beta", 1, "beta_alias", "Beta remark", "Beta"},
		[]any{"wxid_alpha", 1, "alpha_alias", "Alpha remark", "Alpha"},
		[]any{"literal_%_", 1, "", "percent", "Percent"},
	)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "lookup", Op: "contacts.lookup", Params: json.RawMessage(`{"usernames":["literal_%_","missing","wxid_alpha"]}`)})
	if err != nil {
		t.Fatal(err)
	}
	result, ok := value.(contactLookupResult)
	if !ok {
		t.Fatalf("unexpected result type %T", value)
	}
	if result.SourceDatabase != filepath.ToSlash("contact.db") || result.SourceTable != "contact" {
		t.Fatalf("unexpected source: %+v", result)
	}
	if len(result.Items) != 2 || result.Items[0].Username != "literal_%_" || result.Items[1].Username != "wxid_alpha" {
		t.Fatalf("unexpected ordered items: %+v", result.Items)
	}
	if result.Items[0].Remark != "percent" || result.Items[1].NickName != "Alpha" {
		t.Fatalf("fields were not preserved: %+v", result.Items)
	}
}

func TestContactsLookupRejectsDuplicateRequestAndDatabaseRows(t *testing.T) {
	root, name := fixtureDB(t, contactSchema)
	insertContacts(t, name, []any{"duplicate", 1, "", "first", ""}, []any{"duplicate", 1, "", "second", ""})
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "duplicate-request", Op: "contacts.lookup", Params: json.RawMessage(`{"usernames":["duplicate","duplicate"]}`)})
	expectCode(t, err, "CONTACT_LOOKUP_INVALID")
	_, err = b.dispatch(context.Background(), request{ID: "duplicate-row", Op: "contacts.lookup", Params: json.RawMessage(`{"usernames":["duplicate"]}`)})
	expectCode(t, err, "CONTACT_LOOKUP_AMBIGUOUS")
	_, err = b.dispatch(context.Background(), request{ID: "mixed", Op: "contacts.lookup", Params: json.RawMessage(`{"usernames":["duplicate"],"query":"x"}`)})
	expectCode(t, err, "INVALID_REQUEST")
}

func TestContactsLookupBounds(t *testing.T) {
	root, _ := fixtureDB(t, contactSchema)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	tooMany := make([]string, 501)
	for i := range tooMany {
		tooMany[i] = fmt.Sprintf("wxid_%03d", i)
	}
	raw, _ := json.Marshal(map[string]any{"usernames": tooMany})
	_, err = b.dispatch(context.Background(), request{ID: "too-many", Op: "contacts.lookup", Params: raw})
	expectCode(t, err, "CONTACT_LOOKUP_INVALID")
	_, err = b.dispatch(context.Background(), request{ID: "bad-name", Op: "contacts.lookup", Params: json.RawMessage(`{"usernames":["  wxid_alpha"]}`)})
	expectCode(t, err, "CONTACT_LOOKUP_INVALID")
}
