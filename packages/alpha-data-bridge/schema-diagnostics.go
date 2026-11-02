package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"sort"
	"strings"
)

// Schema diagnostics are an evidence aid for an explicitly selected offline
// copy. They describe the SQLite files that the bridge already opened; they do
// not infer Alpha/native compatibility from table names or columns.
const (
	maxSchemaDiagnosticTables   = 4096
	maxSchemaDiagnosticColumns  = 256
	maxSchemaDiagnosticResponse = 4 << 20
)

type schemaDiagnosticColumn struct {
	Name       string `json:"name"`
	Type       string `json:"type"`
	NotNull    bool   `json:"notNull"`
	PrimaryKey int    `json:"primaryKey"`
	Default    any    `json:"defaultValue,omitempty"`
}

type schemaDiagnosticTable struct {
	Name    string                   `json:"name"`
	Columns []schemaDiagnosticColumn `json:"columns"`
}

type schemaDiagnosticDatabase struct {
	Path   string                  `json:"path"`
	Tables []schemaDiagnosticTable `json:"tables"`
}

func quoteSQLiteIdentifier(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

func inspectSchemaTable(ctx context.Context, db *sql.DB, table string) (schemaDiagnosticTable, error) {
	rows, err := db.QueryContext(ctx, `PRAGMA table_info(`+quoteSQLiteIdentifier(table)+`)`)
	if err != nil {
		return schemaDiagnosticTable{}, fail("SCHEMA_DIAGNOSTICS_READ_FAILED", "Cannot inspect SQLite table metadata")
	}
	defer rows.Close()
	result := schemaDiagnosticTable{Name: table, Columns: make([]schemaDiagnosticColumn, 0, 16)}
	for rows.Next() {
		if len(result.Columns) >= maxSchemaDiagnosticColumns {
			return schemaDiagnosticTable{}, fail("SCHEMA_DIAGNOSTICS_TOO_LARGE", "SQLite table has too many columns")
		}
		var cid, notNull, primaryKey int
		var name, kind string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &kind, &notNull, &defaultValue, &primaryKey); err != nil {
			return schemaDiagnosticTable{}, fail("SCHEMA_DIAGNOSTICS_READ_FAILED", "Invalid SQLite table metadata")
		}
		result.Columns = append(result.Columns, schemaDiagnosticColumn{
			Name: name, Type: kind, NotNull: notNull != 0, PrimaryKey: primaryKey, Default: defaultValue,
		})
	}
	if err := rows.Err(); err != nil {
		return schemaDiagnosticTable{}, fail("SCHEMA_DIAGNOSTICS_READ_FAILED", "Cannot finish SQLite table metadata")
	}
	return result, nil
}

func (b *bridge) schemaDiagnostics(ctx context.Context) (any, error) {
	databases := append([]*database(nil), b.databases...)
	sort.Slice(databases, func(i, j int) bool { return databases[i].relative < databases[j].relative })
	result := make([]schemaDiagnosticDatabase, 0, len(databases))
	tableCount := 0
	for _, database := range databases {
		tables := make([]string, 0, len(database.tables))
		for table := range database.tables {
			tables = append(tables, table)
		}
		sort.Strings(tables)
		if tableCount+len(tables) > maxSchemaDiagnosticTables {
			return nil, fail("SCHEMA_DIAGNOSTICS_TOO_LARGE", "SQLite schema has too many tables")
		}
		entry := schemaDiagnosticDatabase{Path: database.relative, Tables: make([]schemaDiagnosticTable, 0, len(tables))}
		for _, table := range tables {
			value, err := inspectSchemaTable(ctx, database.db, table)
			if err != nil {
				return nil, err
			}
			entry.Tables = append(entry.Tables, value)
		}
		tableCount += len(tables)
		result = append(result, entry)
	}
	value := map[string]any{
		"status":                "ready",
		"sourceKind":            "explicit-offline-sqlite-schema",
		"snapshotId":            b.snapshot,
		"readOnly":              true,
		"nativeSchemaSupported": false,
		"complete":              false,
		"databases":             result,
		"tableCount":            tableCount,
		"limits": map[string]int{
			"maxDatabases":       128,
			"maxTables":          maxSchemaDiagnosticTables,
			"maxColumnsPerTable": maxSchemaDiagnosticColumns,
			"maxResponseBytes":   maxSchemaDiagnosticResponse,
		},
	}
	encoded, err := json.Marshal(value)
	if err != nil || len(encoded) > maxSchemaDiagnosticResponse {
		return nil, fail("SCHEMA_DIAGNOSTICS_TOO_LARGE", "SQLite schema diagnostics exceed the response bound")
	}
	return value, nil
}
