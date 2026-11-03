package main

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

// contactLookupResult is deliberately separate from the paged contacts.list
// response. A lookup has no cursor or ordering contract: the caller's order
// is restored after the SQL result is materialized, and missing usernames are
// omitted rather than represented by a fabricated record.
type contactLookupResult struct {
	Items          []contact `json:"items"`
	SourceDatabase string    `json:"sourceDatabase"`
	SourceTable    string    `json:"sourceTable"`
}

func (b *bridge) contactsLookup(ctx context.Context, usernames []string) (any, error) {
	if err := validateLookupUsernames(usernames); err != nil {
		return nil, err
	}
	d := b.contactDB
	if d == nil {
		return nil, fail("CAPABILITY_UNAVAILABLE", "contact.db is not present")
	}

	placeholders := make([]string, len(usernames))
	args := make([]any, len(usernames))
	for i, username := range usernames {
		placeholders[i] = "?"
		args[i] = username
	}
	columns := d.contactColumns
	if columns == nil {
		return nil, fail("SCHEMA_UNSUPPORTED", "Contact column mapping is unavailable")
	}
	textExpr := func(column string) string {
		if column == "" {
			return `''`
		}
		quoted := quoteIdentifier(column)
		return `CASE WHEN ` + quoted + ` IS NULL OR length(CAST(` + quoted + ` AS BLOB))<=4096 THEN COALESCE(CAST(` + quoted + ` AS TEXT),'') ELSE NULL END`
	}
	usernameColumn := quoteIdentifier(columns.username)
	// Bound all text before SQLite materializes it. A NULL from any CASE is a
	// malformed oversized row and is rejected below rather than silently
	// truncating the contact DTO.
	query := fmt.Sprintf(`SELECT rowid,CASE WHEN %s IS NULL OR length(CAST(%s AS BLOB))<=1024 THEN COALESCE(CAST(%s AS TEXT),'') ELSE NULL END,%s,%s,%s,%s
FROM "contact" WHERE %s COLLATE BINARY IN (%s) ORDER BY rowid ASC`, usernameColumn, usernameColumn, usernameColumn, quoteIdentifier(columns.localType), textExpr(columns.alias), textExpr(columns.remark), textExpr(columns.nickName), usernameColumn, strings.Join(placeholders, ","))
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fail("SCHEMA_UNSUPPORTED", "Cannot query expected contact schema")
	}
	defer rows.Close()
	type foundContact struct {
		item  contact
		count int
	}
	found := make(map[string]foundContact, len(usernames))
	for rows.Next() {
		var (
			item             contact
			row, kind        int64
			username, alias  sql.NullString
			remark, nickName sql.NullString
		)
		if err := rows.Scan(&row, &username, &kind, &alias, &remark, &nickName); err != nil {
			return nil, fail("ROW_INVALID", "Invalid contact record")
		}
		if !username.Valid || !validLookupUsername(username.String) || !alias.Valid || !remark.Valid || !nickName.Valid {
			return nil, fail("ROW_INVALID", "Invalid contact record")
		}
		item.Username = username.String
		item.LocalType = number(kind)
		item.Alias, item.Remark, item.NickName = alias.String, remark.String, nickName.String
		item.Source = sourceRef{Database: d.relative, Table: "contact", RowID: number(row)}
		entry := found[item.Username]
		entry.item, entry.count = item, entry.count+1
		found[item.Username] = entry
	}
	if rows.Err() != nil {
		return nil, fail("QUERY_FAILED", "Contact lookup failed")
	}
	items := make([]contact, 0, len(found))
	for _, username := range usernames {
		entry, exists := found[username]
		if !exists {
			continue
		}
		if entry.count != 1 {
			return nil, fail("CONTACT_LOOKUP_AMBIGUOUS", "Multiple contact rows match a username")
		}
		items = append(items, entry.item)
	}
	return contactLookupResult{Items: items, SourceDatabase: d.relative, SourceTable: "contact"}, nil
}
