// Alpha's independent offline data bridge. This is an original implementation;
// schema references are documented in README.md, not imported from Chatlog internals.
package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type bridgeError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *bridgeError) Error() string  { return e.Code + ": " + e.Message }
func fail(code, message string) error { return &bridgeError{code, message} }

type request struct {
	ID     string          `json:"id"`
	Op     string          `json:"op"`
	Params json.RawMessage `json:"params"`
}
type response struct {
	ID     string       `json:"id"`
	OK     bool         `json:"ok"`
	Result any          `json:"result,omitempty"`
	Error  *bridgeError `json:"error,omitempty"`
}
type params struct {
	Limit               int    `json:"limit"`
	Offset              int    `json:"offset"`
	Cursor              string `json:"cursor"`
	TableName           string `json:"tableName"`
	ConversationID      string `json:"conversationId"`
	Ascending           *bool  `json:"ascending"`
	AfterTime           string `json:"afterTime"`
	BeforeTime          string `json:"beforeTime"`
	UsernameExact       string `json:"usernameExact"`
	Username            string `json:"username"`
	Query               string `json:"query"`
	Keyword             string `json:"keyword"`
	Sender              string `json:"senderId"`
	GroupByConversation bool   `json:"groupByConversation"`
	ServerID            string `json:"serverId"`
	FromUnixMs          string `json:"fromUnixMs"`
	ToUnixMs            string `json:"toUnixMs"`
	UTCOffsetMinutes    *int   `json:"utcOffsetMinutes"`
	Type                *int   `json:"type"`
	IncludeTypeCounts   bool   `json:"includeTypeCounts"`
	IncludeMedia        bool   `json:"includeMedia"`
	TagID               string `json:"tagId"`
	FavoriteID          string `json:"favoriteId"`
	MediaToken          string `json:"token"`
	MediaID             string `json:"mediaId"`
	Source              string `json:"source"`
}
type sourceRef struct {
	Database string `json:"database"`
	Table    string `json:"table"`
	LocalID  string `json:"localId,omitempty"`
	RowID    string `json:"rowId,omitempty"`
}
type contact struct {
	Username  string    `json:"username"`
	LocalType string    `json:"localType"`
	Alias     string    `json:"alias"`
	Remark    string    `json:"remark"`
	NickName  string    `json:"nickName"`
	Source    sourceRef `json:"source"`
}
type session struct {
	Username              string    `json:"username"`
	Summary               string    `json:"summary"`
	LastTimestamp         string    `json:"lastTimestamp"`
	SortTimestamp         string    `json:"sortTimestamp"`
	LastMsgSender         string    `json:"lastMsgSender"`
	LastSenderDisplayName string    `json:"lastSenderDisplayName"`
	Source                sourceRef `json:"source"`
}
type message struct {
	ConversationID      string          `json:"conversationId"`
	LocalID             string          `json:"localId"`
	ServerID            string          `json:"serverId"`
	SortSeq             string          `json:"sortSeq"`
	LocalType           string          `json:"localType"`
	CreateTime          string          `json:"createTime"`
	Sender              string          `json:"sender"`
	RealSenderID        string          `json:"realSenderId"`
	Status              string          `json:"status"`
	Content             string          `json:"content"`
	ContentBase64       string          `json:"contentBase64"`
	ContentEncoding     string          `json:"contentEncoding"`
	ContentCompression  string          `json:"contentCompression,omitempty"`
	ContentDecodeStatus string          `json:"contentDecodeStatus"`
	MatchCount          string          `json:"matchCount,omitempty"`
	PackedInfoBase64    string          `json:"packedInfoBase64"`
	PackedInfoOmitted   bool            `json:"packedInfoOmitted,omitempty"`
	Display             *messageDisplay `json:"display,omitempty"`
	Refs                []mediaRef      `json:"refs,omitempty"`
	Source              sourceRef       `json:"source"`
}
type page[T any] struct {
	Items      []T    `json:"items"`
	NextCursor string `json:"nextCursor"`
	HasMore    bool   `json:"hasMore"`
}
type cursor struct {
	Snapshot string `json:"snapshot"`
	Query    string `json:"query"`
	Name     string `json:"name,omitempty"`
	Number   string `json:"number,omitempty"`
	Database string `json:"database,omitempty"`
	Table    string `json:"table,omitempty"`
	RowID    string `json:"rowId"`
}
type database struct {
	relative, path string
	info           os.FileInfo
	db             *sql.DB
	tables         map[string]bool
}
type directoryStamp struct {
	path string
	info os.FileInfo
}
type bridge struct {
	root, accountID, snapshot                    string
	databases                                    []*database
	contactDB, sessionDB, momentsDB, favoritesDB *database
	messageDBs                                   []*database
	directories                                  []directoryStamp
}

var messageName = regexp.MustCompile(`^message(?:_[0-9]+)?\.db$`)
var integer = regexp.MustCompile(`^-?(0|[1-9][0-9]*)$`)

func checkPath(name string) error {
	if !filepath.IsAbs(name) || filepath.Clean(name) != name || name == string(os.PathSeparator) {
		return fail("PATH_INVALID", "An explicit clean absolute dataset path is required")
	}
	current := string(os.PathSeparator)
	for _, part := range strings.Split(strings.TrimPrefix(name, current), string(os.PathSeparator)) {
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return fail("PATH_UNAVAILABLE", "Dataset path is missing or inaccessible")
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fail("SYMLINK_DENIED", "Symlink paths are not allowed")
		}
	}
	return nil
}

func openBridge(root, accountID string) (_ *bridge, err error) {
	if len(accountID) == 0 || len(accountID) > 256 || strings.IndexByte(accountID, 0) >= 0 {
		return nil, fail("ACCOUNT_ID_REQUIRED", "An explicit dataset account ID is required")
	}
	if err := checkPath(root); err != nil {
		return nil, err
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil, fail("PATH_INVALID", "Dataset path must be a directory")
	}
	b := &bridge{root: root, accountID: accountID}
	defer func() {
		if err != nil {
			b.close()
		}
	}()
	count := 0
	err = filepath.WalkDir(root, func(name string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fail("PATH_UNAVAILABLE", "Dataset member is inaccessible")
		}
		count++
		relative, e := filepath.Rel(root, name)
		if e != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
			return fail("PATH_ESCAPE", "Dataset member escaped its root")
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fail("SYMLINK_DENIED", "Dataset cannot contain symlinks")
		}
		if count > 10000 || strings.Count(relative, string(os.PathSeparator)) > 8 {
			return fail("DATASET_TOO_LARGE", "Dataset directory inventory exceeds limits")
		}
		if entry.IsDir() {
			directoryInfo, err := entry.Info()
			if err != nil {
				return fail("PATH_UNAVAILABLE", "Dataset directory is inaccessible")
			}
			b.directories = append(b.directories, directoryStamp{name, directoryInfo})
			return nil
		}
		base := entry.Name()
		if base != "contact.db" && base != "session.db" && base != "moments.db" && base != "favorite.db" && base != "favorites.db" && !messageName.MatchString(base) {
			return nil
		}
		if len(b.databases) >= 128 {
			return fail("DATASET_TOO_LARGE", "Too many database shards")
		}
		var d *database
		var openErr error
		if base == "favorite.db" || base == "favorites.db" {
			d, openErr = openDatabase(root, relative, true)
			if openErr != nil {
				return openErr
			}
			if d == nil {
				return nil
			}
		} else {
			d, openErr = openDatabase(root, relative)
		}
		if openErr != nil {
			return openErr
		}
		b.databases = append(b.databases, d)
		switch base {
		case "contact.db":
			if b.contactDB != nil {
				return fail("AMBIGUOUS_DATABASE", "Multiple contact databases require separate datasets")
			}
			if !d.tables["contact"] {
				return fail("SCHEMA_UNSUPPORTED", "contact table is missing")
			}
			if d.tables["chat_room"] {
				if err := validateColumns(d.db, "chat_room", []string{"username", "owner", "ext_buffer"}); err != nil {
					return err
				}
			}
			if d.tables[groupPinsFixtureTable] {
				if err := validateColumns(d.db, groupPinsFixtureTable, []string{"chatroom_id", "seq", "sender_id", "server_id", "local_type", "preview", "pinned_by"}); err != nil {
					return err
				}
			}
			b.contactDB = d
		case "session.db":
			if b.sessionDB != nil {
				return fail("AMBIGUOUS_DATABASE", "Multiple session databases require separate datasets")
			}
			if !d.tables["SessionTable"] {
				return fail("SCHEMA_UNSUPPORTED", "SessionTable is missing")
			}
			b.sessionDB = d
		case "moments.db":
			if b.momentsDB != nil {
				return fail("AMBIGUOUS_DATABASE", "Multiple moments databases require separate datasets")
			}
			if !d.tables[momentsTable] {
				return fail("SCHEMA_UNSUPPORTED", "The explicit independent moments schema marker is missing")
			}
			if d.tables[momentsEmojiTable] {
				if err := validateColumns(d.db, momentsEmojiTable, momentsEmojiColumns); err != nil {
					return err
				}
			}
			b.momentsDB = d
		case "favorite.db", "favorites.db":
			if b.favoritesDB != nil {
				return fail("AMBIGUOUS_DATABASE", "Multiple favorites databases require separate datasets")
			}
			b.favoritesDB = d
		default:
			b.messageDBs = append(b.messageDBs, d)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(b.databases) == 0 {
		return nil, fail("NO_DATABASES", "No supported offline WeChat v4 databases were found")
	}
	sort.Slice(b.databases, func(i, j int) bool { return b.databases[i].relative < b.databases[j].relative })
	sort.Slice(b.messageDBs, func(i, j int) bool { return b.messageDBs[i].relative < b.messageDBs[j].relative })
	digest := sha256.New()
	fmt.Fprintf(digest, "%s\x00%s\x00", root, accountID)
	for _, d := range b.databases {
		fmt.Fprintf(digest, "%s\x00%d\x00%d\n", d.relative, d.info.Size(), d.info.ModTime().UnixNano())
	}
	b.snapshot = hex.EncodeToString(digest.Sum(nil))
	if err := b.verify(); err != nil {
		return nil, err
	}
	return b, nil
}

func openDatabase(root, relative string, optionalFavorites ...bool) (_ *database, err error) {
	name := filepath.Join(root, relative)
	if err := checkPath(name); err != nil {
		return nil, err
	}
	info, err := os.Stat(name)
	if err != nil || !info.Mode().IsRegular() {
		return nil, fail("DATABASE_INVALID", "Database must be a regular file")
	}
	if err := rejectSidecars(name); err != nil {
		return nil, err
	}
	file, err := os.Open(name)
	if err != nil {
		return nil, fail("DATABASE_UNAVAILABLE", "Cannot read database")
	}
	header := make([]byte, 16)
	_, err = io.ReadFull(file, header)
	file.Close()
	if err != nil || string(header) != "SQLite format 3\x00" {
		return nil, fail("NOT_PLAINTEXT_SQLITE", "Only offline decrypted SQLite copies are supported")
	}
	uri := url.URL{Scheme: "file", Path: name}
	q := uri.Query()
	q.Set("mode", "ro")
	q.Set("immutable", "1")
	q.Set("_query_only", "1")
	q.Set("_busy_timeout", "1000")
	uri.RawQuery = q.Encode()
	db, err := sql.Open("sqlite3", uri.String())
	if err != nil {
		return nil, fail("DATABASE_UNAVAILABLE", "Cannot open read-only SQLite")
	}
	defer func() {
		if err != nil {
			db.Close()
		}
	}()
	db.SetMaxOpenConns(1)
	var queryOnly int
	if e := db.QueryRow("PRAGMA query_only").Scan(&queryOnly); e != nil || queryOnly != 1 {
		return nil, fail("READONLY_REQUIRED", "Read-only SQLite connection could not be verified")
	}
	tables := map[string]bool{}
	rows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table'")
	if err != nil {
		return nil, fail("DATABASE_INVALID", "Cannot read database schema")
	}
	for rows.Next() {
		var table string
		if e := rows.Scan(&table); e != nil {
			rows.Close()
			return nil, fail("DATABASE_INVALID", "Invalid table metadata")
		}
		tables[table] = true
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, fail("DATABASE_INVALID", "Cannot finish reading schema")
	}
	d := &database{relative: filepath.ToSlash(relative), path: name, info: info, db: db, tables: tables}
	required := map[string][]string{}
	isOptionalFavorite := len(optionalFavorites) > 0 && optionalFavorites[0] && (filepath.Base(relative) == "favorite.db" || filepath.Base(relative) == "favorites.db")
	if isOptionalFavorite && !tables[favoritesTable] {
		db.Close()
		return nil, nil
	}
	switch filepath.Base(relative) {
	case "contact.db":
		required["contact"] = []string{"username", "local_type", "alias", "remark", "nick_name"}
	case "session.db":
		required["SessionTable"] = []string{"username", "summary", "last_timestamp", "sort_timestamp", "last_msg_sender", "last_sender_display_name"}
	case "moments.db":
		required[momentsTable] = momentsColumns
	case "favorite.db", "favorites.db":
		required[favoritesTable] = favoritesColumns
		if tables[favoriteMediaTable] {
			required[favoriteMediaTable] = favoriteMediaColumns
		}
	default:
		required["Name2Id"] = []string{"user_name"}
		for table := range tables {
			if regexp.MustCompile(`^Msg_[0-9a-f]{32}$`).MatchString(table) {
				required[table] = []string{"local_id", "server_id", "sort_seq", "local_type", "create_time", "real_sender_id", "status", "message_content", "packed_info_data"}
			}
		}
		if tables[voicePlaybackTable] {
			required[voicePlaybackTable] = voicePlaybackColumns
		}
	}
	for table, columns := range required {
		if err := validateColumns(db, table, columns); err != nil {
			return nil, err
		}
	}
	if e := d.verify(); e != nil {
		return nil, e
	}
	return d, nil
}

func validateColumns(db *sql.DB, table string, required []string) error {
	// Table names here are fixed literals or an exact Msg_<hex-md5> identifier.
	rows, err := db.Query(`PRAGMA table_info("` + table + `")`)
	if err != nil {
		return fail("SCHEMA_UNSUPPORTED", "Cannot inspect expected table")
	}
	columns := map[string]bool{}
	primaryColumns, localIDPrimary := 0, false
	rowIDShadowed := false
	for rows.Next() {
		var cid, notnull, pk int
		var name, kind string
		var defaultValue any
		if err := rows.Scan(&cid, &name, &kind, &notnull, &defaultValue, &pk); err != nil {
			rows.Close()
			return fail("SCHEMA_UNSUPPORTED", "Invalid column metadata")
		}
		columns[name] = true
		if pk > 0 {
			primaryColumns++
		}
		if name == "local_id" && pk == 1 && strings.EqualFold(kind, "INTEGER") {
			localIDPrimary = true
		}
		if strings.EqualFold(name, "rowid") {
			rowIDShadowed = true
		}
	}
	rowError := rows.Err()
	rows.Close()
	if rowError != nil {
		return fail("SCHEMA_UNSUPPORTED", "Cannot finish inspecting table")
	}
	for _, name := range required {
		if !columns[name] {
			return fail("SCHEMA_UNSUPPORTED", "Missing expected column in "+table+": "+name)
		}
	}
	if strings.HasPrefix(table, "Msg_") {
		if !localIDPrimary || primaryColumns != 1 {
			return fail("SCHEMA_UNSUPPORTED", "Message local_id must be a single INTEGER primary key")
		}
	} else {
		if rowIDShadowed {
			return fail("SCHEMA_UNSUPPORTED", "Expected SQLite rowid cannot be shadowed")
		}
		probe, err := db.Query(`SELECT rowid FROM "` + table + `" LIMIT 0`)
		if err != nil {
			return fail("SCHEMA_UNSUPPORTED", "Expected SQLite rowid is unavailable")
		}
		probe.Close()
	}
	return nil
}

func rejectSidecars(name string) error {
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		if _, err := os.Lstat(name + suffix); err == nil {
			return fail("ACTIVE_DATABASE_DENIED", "Offline copies must not contain WAL, SHM or journal sidecars")
		} else if !os.IsNotExist(err) {
			return fail("PATH_UNAVAILABLE", "Cannot validate database sidecars")
		}
	}
	return nil
}
func (d *database) verify() error {
	if err := checkPath(d.path); err != nil {
		return err
	}
	current, err := os.Stat(d.path)
	if err != nil || !os.SameFile(d.info, current) || d.info.Size() != current.Size() || !d.info.ModTime().Equal(current.ModTime()) {
		return fail("DATASET_CHANGED", "Offline dataset changed; reopen a stable copy")
	}
	return rejectSidecars(d.path)
}
func (b *bridge) close() {
	for _, d := range b.databases {
		d.db.Close()
	}
}
func (b *bridge) verify() error {
	for _, directory := range b.directories {
		current, err := os.Lstat(directory.path)
		if err != nil || !current.IsDir() || !os.SameFile(directory.info, current) || !directory.info.ModTime().Equal(current.ModTime()) {
			return fail("DATASET_CHANGED", "Offline dataset directory changed; reopen a stable copy")
		}
	}
	for _, d := range b.databases {
		if err := d.verify(); err != nil {
			return err
		}
	}
	return nil
}

func (b *bridge) info() any {
	capabilities := []string{"account.info"}
	if b.contactDB != nil {
		capabilities = append(capabilities, "contacts.list")
		if b.contactDB.tables["chat_room"] {
			capabilities = append(capabilities, "groups.members")
		}
		if b.contactDB.tables[groupPinsFixtureTable] {
			capabilities = append(capabilities, "groups.pinnedMessages")
		}
	}
	if b.sessionDB != nil {
		capabilities = append(capabilities, "sessions.list")
	}
	if len(b.messageDBs) > 0 {
		capabilities = append(capabilities, "messages.list", "messages.search", "messages.locate", "messages.dayCounts", "messages.stats")
	}
	if b.momentsDB != nil {
		capabilities = append(capabilities, "moments.list", "moments.authors", "moments.dayCounts")
		if b.momentsDB.tables[momentsEmojiTable] {
			capabilities = append(capabilities, "moments.emoji")
		}
	}
	if b.favoritesDB != nil {
		capabilities = append(capabilities, "favorites.list")
		if b.favoritesDB.tables[favoriteMediaTable] {
			capabilities = append(capabilities, "favorites.media")
		}
	}
	for _, d := range b.messageDBs {
		if d.tables[voicePlaybackTable] {
			capabilities = append(capabilities, "messages.voicePlayback")
			break
		}
	}
	files := []string{}
	for _, d := range b.databases {
		files = append(files, d.relative)
	}
	return map[string]any{"id": b.accountID, "idProvenance": "caller-supplied-dataset-label", "sourceKind": "offline-wechat-v4", "readOnly": true, "snapshotId": b.snapshot, "capabilities": capabilities, "databases": files, "live": false}
}

func decodeStrict(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fail("INVALID_REQUEST", "Invalid JSON fields or types")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return fail("INVALID_REQUEST", "Expected one JSON value")
	}
	return nil
}
func parseInteger(text string) (int64, error) {
	if !integer.MatchString(text) {
		return 0, fail("INVALID_PARAMS", "Expected a decimal integer string")
	}
	value, err := strconv.ParseInt(text, 10, 64)
	if err != nil {
		return 0, fail("INVALID_PARAMS", "Integer is outside signed 64-bit range")
	}
	return value, nil
}
func number(n int64) string { return strconv.FormatInt(n, 10) }
func queryKey(op string, p params) string {
	p.Cursor = ""
	p.Limit = 0
	data, _ := json.Marshal(p)
	sum := sha256.Sum256(append([]byte("bridge-cursor-v2\x00"+op+"\x00"), data...))
	return hex.EncodeToString(sum[:])
}
func (b *bridge) readCursor(p params, key string) (*cursor, error) {
	if p.Cursor == "" {
		return nil, nil
	}
	if len(p.Cursor) > 4096 {
		return nil, fail("INVALID_CURSOR", "Cursor exceeds size limit")
	}
	raw, err := base64.RawURLEncoding.DecodeString(p.Cursor)
	if err != nil {
		return nil, fail("INVALID_CURSOR", "Malformed cursor")
	}
	var c cursor
	if decodeStrict(raw, &c) != nil || c.Snapshot != b.snapshot || c.Query != key {
		return nil, fail("INVALID_CURSOR", "Cursor does not match this dataset and query")
	}
	if _, err := parseInteger(c.RowID); err != nil {
		return nil, fail("INVALID_CURSOR", "Invalid row cursor")
	}
	if c.Number != "" {
		if _, err := parseInteger(c.Number); err != nil {
			return nil, fail("INVALID_CURSOR", "Invalid order cursor")
		}
	}
	return &c, nil
}
func (b *bridge) encodeCursor(key string, c cursor) string {
	c.Snapshot = b.snapshot
	c.Query = key
	raw, _ := json.Marshal(c)
	return base64.RawURLEncoding.EncodeToString(raw)
}

func (b *bridge) contacts(ctx context.Context, p params, key string, c *cursor) (any, error) {
	d := b.contactDB
	if d == nil {
		return nil, fail("CAPABILITY_UNAVAILABLE", "contact.db is not present")
	}
	query := `SELECT rowid,username,local_type,COALESCE(alias,''),COALESCE(remark,''),COALESCE(nick_name,'') FROM contact WHERE 1=1`
	args := []any{}
	if p.UsernameExact != "" {
		query += ` AND username COLLATE BINARY=?`
		args = append(args, p.UsernameExact)
	}
	if p.Query != "" {
		// instr() keeps the user's text literal; unlike LIKE it does not treat
		// '%' or '_' as wildcards. Matching remains deterministic across pages.
		query += ` AND (instr(username,?)>0 OR instr(COALESCE(alias,''),?)>0 OR instr(COALESCE(remark,''),?)>0 OR instr(COALESCE(nick_name,''),?)>0)`
		args = append(args, p.Query, p.Query, p.Query, p.Query)
	}
	if c != nil {
		query += ` AND (username COLLATE BINARY>? OR (username COLLATE BINARY=? AND rowid>?))`
		args = append(args, c.Name, c.Name, c.RowID)
	}
	query += ` ORDER BY username COLLATE BINARY ASC,rowid ASC LIMIT ?`
	args = append(args, p.Limit+1)
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fail("SCHEMA_UNSUPPORTED", "Cannot query expected contact schema")
	}
	defer rows.Close()
	result := page[contact]{Items: []contact{}}
	for rows.Next() {
		var item contact
		var row, kind int64
		if err := rows.Scan(&row, &item.Username, &kind, &item.Alias, &item.Remark, &item.NickName); err != nil {
			return nil, fail("ROW_INVALID", "Invalid contact record")
		}
		item.LocalType = number(kind)
		item.Source = sourceRef{Database: d.relative, Table: "contact", RowID: number(row)}
		result.Items = append(result.Items, item)
	}
	if rows.Err() != nil {
		return nil, fail("QUERY_FAILED", "Contact query failed")
	}
	if len(result.Items) > p.Limit {
		result.HasMore = true
		result.Items = result.Items[:p.Limit]
		last := result.Items[len(result.Items)-1]
		result.NextCursor = b.encodeCursor(key, cursor{Name: last.Username, RowID: last.Source.RowID})
	}
	return result, nil
}
func (b *bridge) sessions(ctx context.Context, p params, key string, c *cursor) (any, error) {
	d := b.sessionDB
	if d == nil {
		return nil, fail("CAPABILITY_UNAVAILABLE", "session.db is not present")
	}
	query := `SELECT rowid,username,COALESCE(summary,''),last_timestamp,sort_timestamp,COALESCE(last_msg_sender,''),COALESCE(last_sender_display_name,'') FROM SessionTable`
	args := []any{}
	if c != nil {
		if c.Number == "" {
			return nil, fail("INVALID_CURSOR", "Session cursor requires timestamp")
		}
		query += ` WHERE (sort_timestamp<? OR (sort_timestamp=? AND (username COLLATE BINARY>? OR (username COLLATE BINARY=? AND rowid>?))))`
		args = append(args, c.Number, c.Number, c.Name, c.Name, c.RowID)
	}
	query += ` ORDER BY sort_timestamp DESC,username COLLATE BINARY ASC,rowid ASC LIMIT ?`
	args = append(args, p.Limit+1)
	rows, err := d.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fail("SCHEMA_UNSUPPORTED", "Cannot query expected session schema")
	}
	defer rows.Close()
	result := page[session]{Items: []session{}}
	for rows.Next() {
		var item session
		var row, last, order int64
		if err := rows.Scan(&row, &item.Username, &item.Summary, &last, &order, &item.LastMsgSender, &item.LastSenderDisplayName); err != nil {
			return nil, fail("ROW_INVALID", "Invalid session record")
		}
		item.LastTimestamp = number(last)
		item.SortTimestamp = number(order)
		item.Source = sourceRef{Database: d.relative, Table: "SessionTable", RowID: number(row)}
		result.Items = append(result.Items, item)
	}
	if rows.Err() != nil {
		return nil, fail("QUERY_FAILED", "Session query failed")
	}
	if len(result.Items) > p.Limit {
		result.HasMore = true
		result.Items = result.Items[:p.Limit]
		last := result.Items[len(result.Items)-1]
		result.NextCursor = b.encodeCursor(key, cursor{Name: last.Username, Number: last.SortTimestamp, RowID: last.Source.RowID})
	}
	return result, nil
}

func (b *bridge) messages(ctx context.Context, p params, key string, c *cursor) (any, error) {
	if len(b.messageDBs) == 0 {
		return nil, fail("CAPABILITY_UNAVAILABLE", "No message database is present")
	}
	if !validConversation(p.ConversationID) {
		return nil, fail("INVALID_PARAMS", "conversationId is required")
	}
	ascending := p.Ascending == nil || *p.Ascending
	order, greater := "ASC", ">"
	if !ascending {
		order, greater = "DESC", "<"
	}
	table := conversationTable(p.ConversationID)
	result := page[message]{Items: []message{}}
	best := &messageHeap{ascending: ascending}
	for _, d := range b.messageDBs {
		if !d.tables[table] {
			continue
		}
		clauses, args := messageFilters(p)
		if c != nil {
			if c.Number == "" || c.Database == "" || c.Table != table {
				return nil, fail("INVALID_CURSOR", "Message cursor requires source and order")
			}
			if d.relative == c.Database {
				clauses = append(clauses, "(m.create_time"+greater+"? OR (m.create_time=? AND m.local_id"+greater+"?))")
				args = append(args, c.Number, c.Number, c.RowID)
			} else {
				op := greater
				if ascending && d.relative > c.Database || !ascending && d.relative < c.Database {
					op += "="
				}
				clauses = append(clauses, "m.create_time"+op+"?")
				args = append(args, c.Number)
			}
		}
		query := messageQuery(table) + " WHERE " + strings.Join(clauses, " AND ") + " ORDER BY m.create_time " + order + ",m.local_id " + order + " LIMIT ?"
		args = append(args, p.Limit+1)
		rows, err := d.db.QueryContext(ctx, query, args...)
		if err != nil {
			return nil, fail("QUERY_FAILED", "Cannot query expected message schema")
		}
		for rows.Next() {
			item, err := scanMessage(rows, d, table, p.ConversationID)
			if err != nil {
				rows.Close()
				return nil, err
			}
			if err := best.offer(item, p.Limit+1); err != nil {
				rows.Close()
				return nil, err
			}
		}
		err = rows.Err()
		rows.Close()
		if err != nil {
			return nil, fail("QUERY_FAILED", "Message query failed")
		}
	}
	result.Items = best.items
	if result.Items == nil {
		result.Items = []message{}
	}
	sort.Slice(result.Items, func(i, j int) bool { return orderedMessage(result.Items[i], result.Items[j], ascending) })
	if len(result.Items) > p.Limit {
		result.HasMore = true
		result.Items = result.Items[:p.Limit]
		result.NextCursor = b.encodeCursor(key, messageCursor(result.Items[len(result.Items)-1]))
	}
	if err := checkMessagePageBudget(result.Items); err != nil {
		return nil, err
	}
	return result, nil
}

func (b *bridge) handle(ctx context.Context, r request) response {
	out := response{ID: r.ID}
	result, err := b.dispatch(ctx, r)
	if err == nil {
		out.OK = true
		out.Result = result
		return out
	}
	var known *bridgeError
	if errors.As(err, &known) {
		out.Error = known
	} else {
		out.Error = &bridgeError{"INTERNAL_ERROR", "Request failed"}
		log.Print("Internal bridge request failure")
	}
	return out
}
func (b *bridge) dispatch(ctx context.Context, r request) (any, error) {
	if r.ID == "" || len(r.ID) > 128 {
		return nil, fail("INVALID_REQUEST", "A bounded string request id is required")
	}
	if err := b.verify(); err != nil {
		return nil, err
	}
	// contacts.lookup has its own strict request shape. It intentionally does
	// not share the paged params object so query/cursor/offset fields cannot be
	// mixed into an exact bulk lookup.
	if r.Op == "contacts.lookup" {
		var lookup struct {
			Usernames []string `json:"usernames"`
		}
		if len(r.Params) == 0 || string(r.Params) == "null" {
			return nil, fail("CONTACT_LOOKUP_INVALID", "Lookup requires usernames")
		}
		if err := decodeStrict(r.Params, &lookup); err != nil {
			return nil, err
		}
		if err := validateLookupUsernames(lookup.Usernames); err != nil {
			return nil, err
		}
		value, err := b.contactsLookup(ctx, lookup.Usernames)
		if err != nil {
			return nil, err
		}
		if err := b.verify(); err != nil {
			return nil, err
		}
		return value, nil
	}
	// groups.common has a deliberately separate strict request shape. It scans
	// chat_room RoomData and therefore must not accept unrelated paging fields.
	if r.Op == "groups.common" {
		var common struct {
			Username string `json:"username"`
			Limit    int    `json:"limit"`
		}
		if len(r.Params) == 0 || string(r.Params) == "null" {
			return nil, fail("INVALID_PARAMS", "Common group lookup requires username")
		}
		if err := decodeStrict(r.Params, &common); err != nil {
			return nil, err
		}
		if !validLookupUsername(common.Username) {
			return nil, fail("INVALID_PARAMS", "Invalid username")
		}
		if common.Limit < 0 || common.Limit > maxCommonGroups {
			return nil, fail("INVALID_PARAMS", fmt.Sprintf("limit must be between 0 and %d", maxCommonGroups))
		}
		value, err := b.commonGroups(ctx, common.Username, common.Limit)
		if err != nil {
			return nil, err
		}
		if err := b.verify(); err != nil {
			return nil, err
		}
		return value, nil
	}
	// media.probe is intentionally a separate strict operation. It inspects
	// only explicitly named v4 hardlink/voice databases and never accepts a
	// caller-supplied path, token, or media byte request.
	if r.Op == "media.probe" {
		var probe struct{}
		if len(r.Params) > 0 && string(r.Params) != "null" {
			if err := decodeStrict(r.Params, &probe); err != nil {
				return nil, err
			}
		}
		value, err := b.mediaProbe(ctx)
		if err != nil {
			return nil, err
		}
		if err := b.verify(); err != nil {
			return nil, err
		}
		return value, nil
	}
	if r.Op == "media.read_voice" {
		value, err := b.readVoiceBlob(ctx, r.Params)
		if err != nil {
			return nil, err
		}
		if err := b.verify(); err != nil {
			return nil, err
		}
		return value, nil
	}
	// schema.inspect is a bounded, read-only inventory of the already selected
	// SQLite snapshot. It is intentionally outside the Alpha protobuf methods;
	// the desktop adapter exposes it only as an independent diagnostic route.
	if r.Op == "schema.inspect" {
		var inspect struct{}
		if len(r.Params) == 0 || string(r.Params) == "null" {
			return nil, fail("INVALID_PARAMS", "schema.inspect requires an empty JSON object")
		}
		if err := decodeStrict(r.Params, &inspect); err != nil {
			return nil, err
		}
		value, err := b.schemaDiagnostics(ctx)
		if err != nil {
			return nil, err
		}
		if err := b.verify(); err != nil {
			return nil, err
		}
		return value, nil
	}
	var p params
	if len(r.Params) > 0 && string(r.Params) != "null" {
		if err := decodeStrict(r.Params, &p); err != nil {
			return nil, err
		}
	}
	if p.Limit == 0 {
		p.Limit = 100
	}
	maxLimit := 500
	if r.Op == "general.list" {
		// Keep each JSON response bounded. Callers needing a complete RoomData
		// snapshot can page through the parser's maxRoomMembers bound.
		maxLimit = 1000
	}
	if p.Limit < 1 || p.Limit > maxLimit {
		return nil, fail("INVALID_PARAMS", fmt.Sprintf("limit must be between 1 and %d", maxLimit))
	}
	if r.Op == "account.info" || r.Op == "accounts.info" {
		if p.Limit != 100 || p.Offset != 0 || p.TableName != "" || p.Cursor != "" || p.ConversationID != "" || p.AfterTime != "" || p.BeforeTime != "" || p.Ascending != nil || p.UsernameExact != "" || p.Query != "" || p.Sender != "" || p.GroupByConversation || p.ServerID != "" || p.FromUnixMs != "" || p.ToUnixMs != "" || p.UTCOffsetMinutes != nil {
			return nil, fail("INVALID_PARAMS", "account.info has no query parameters")
		}
		return b.info(), nil
	}
	if err := validateOperationParams(r.Op, &p); err != nil {
		return nil, err
	}
	key := queryKey(r.Op, p)
	c, err := b.readCursor(p, key)
	if err != nil {
		return nil, err
	}
	var value any
	switch r.Op {
	case "general.list":
		value, err = b.general(ctx, p)
	case "contacts.list":
		value, err = b.contacts(ctx, p, key, c)
	case "sessions.list":
		value, err = b.sessions(ctx, p, key, c)
	case "messages.list":
		value, err = b.messages(ctx, p, key, c)
	case "messages.search":
		value, err = b.search(ctx, p, key, c)
	case "messages.locate":
		value, err = b.locate(ctx, p)
	case "messages.dayCounts":
		value, err = b.dayCounts(ctx, p)
	case "messages.stats":
		value, err = b.stats(ctx, p)
	case "moments.list":
		value, err = b.momentsList(ctx, p)
	case "moments.authors":
		value, err = b.momentsAuthors(ctx, p)
	case "moments.dayCounts":
		value, err = b.momentsDayCounts(ctx, p)
	case "moments.emoji":
		value, err = b.momentsEmoji(ctx, p)
	case "favorites.list":
		value, err = b.favoritesList(ctx, p)
	case "favorites.mediaSlots":
		value, err = b.favoritesMediaSlots(ctx, p)
	case "favorites.media":
		value, err = b.favoriteMedia(ctx, p)
	case "voice.playback":
		value, err = b.voicePlayback(ctx, p)
	}
	if err != nil {
		return nil, err
	}
	if err := b.verify(); err != nil {
		return nil, err
	}
	return value, nil
}

func serve(b *bridge, input io.Reader, output io.Writer) error {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 4096), 1024*1024)
	for scanner.Scan() {
		var r request
		var out response
		if err := decodeStrict(scanner.Bytes(), &r); err != nil {
			out = response{ID: r.ID, Error: &bridgeError{"INVALID_REQUEST", "Invalid JSON request"}}
		} else {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			out = b.handle(ctx, r)
			cancel()
		}
		encoded, err := encodeBoundedResponse(out)
		if err != nil {
			return err
		}
		if _, err := output.Write(append(encoded, '\n')); err != nil {
			return err
		}
	}
	return scanner.Err()
}
func main() {
	log.SetOutput(os.Stderr)
	log.SetFlags(0)
	root := flag.String("data-dir", "", "Explicit absolute directory of offline decrypted WeChat v4 copies")
	account := flag.String("account-id", "", "Caller-assigned dataset account identifier")
	flag.Parse()
	if flag.NArg() != 0 {
		log.Print("INVALID_ARGUMENTS: no positional arguments are accepted")
		os.Exit(2)
	}
	b, err := openBridge(*root, *account)
	if err != nil {
		log.Print(err)
		os.Exit(2)
	}
	defer b.close()
	if err := serve(b, os.Stdin, os.Stdout); err != nil {
		log.Print("TRANSPORT_ERROR: input/output failed")
		os.Exit(1)
	}
}
