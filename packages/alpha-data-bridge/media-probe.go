package main

// This file contains a deliberately narrow metadata probe for the v4 media
// databases described by the pinned Chatlog evidence. It never reads media
// bytes, follows paths supplied by a caller, or creates Alpha media1 tokens.

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxMediaProbeFiles     = 16
	maxMediaProbeItems     = 4096
	maxMediaProbeBytes     = int64(1 << 40)
	maxMediaProbeFileBytes = int64(512 << 20)
	maxMediaProbeText      = 1024
)

var mediaProbeVoiceName = regexp.MustCompile(`^media_([0-9]?[0-9])?\.db$`)
var mediaProbeMD5 = regexp.MustCompile(`^[0-9a-fA-F]{32}$`)

type mediaProbeTable struct {
	name string
	kind string
}

var mediaProbeTables = []mediaProbeTable{
	{name: "image_hardlink_info_v3", kind: "image"},
	{name: "image_hardlink_info_v4", kind: "image"},
	{name: "video_hardlink_info_v3", kind: "video"},
	{name: "video_hardlink_info_v4", kind: "video"},
	{name: "file_hardlink_info_v3", kind: "file"},
	{name: "file_hardlink_info_v4", kind: "file"},
}

type mediaProbeFile struct {
	relative string
	path     string
	info     os.FileInfo
	digest   string
}

type mediaProbeFileSummary struct {
	Path   string `json:"path"`
	Bytes  int64  `json:"bytes"`
	SHA256 string `json:"sha256"`
}

type mediaProbeDB struct {
	file   mediaProbeFile
	db     *sql.DB
	tables map[string]bool
}

type mediaProbeItem struct {
	Kind         string `json:"kind"`
	Key          string `json:"key"`
	Name         string `json:"name,omitempty"`
	Path         string `json:"path,omitempty"`
	Size         int64  `json:"size,omitempty"`
	DataBytes    int64  `json:"dataBytes,omitempty"`
	ModifyTime   int64  `json:"modifyTime,omitempty"`
	Dir1         string `json:"dir1,omitempty"`
	Dir2         string `json:"dir2,omitempty"`
	SourceDB     string `json:"sourceDatabase"`
	SourceTable  string `json:"sourceTable"`
	Ambiguous    bool   `json:"ambiguous,omitempty"`
	NativeSchema bool   `json:"nativeSchemaSupported"`
	MetadataOnly bool   `json:"metadataOnly"`
}

func mediaProbeUnavailable(reason string, files []mediaProbeFileSummary) map[string]any {
	return map[string]any{
		"status":                "unavailable",
		"reason":                reason,
		"sourceKind":            "explicit-v4-media-database-probe",
		"nativeSchemaSupported": false,
		"metadataOnly":          true,
		"mediaReady":            false,
		"files":                 files,
		"items":                 []mediaProbeItem{},
	}
}

func mediaProbeValidText(value string, allowEmpty bool) bool {
	if !allowEmpty && value == "" {
		return false
	}
	return len(value) <= maxMediaProbeText && utf8.ValidString(value) &&
		strings.IndexByte(value, 0) < 0 && strings.IndexFunc(value, unicode.IsControl) < 0 &&
		strings.TrimSpace(value) == value
}

func mediaProbeSegment(value string) bool {
	return mediaProbeValidText(value, false) && value != "." && value != ".." &&
		!strings.ContainsAny(value, `/\\`)
}

func mediaProbeKey(value string) (string, error) {
	if !mediaProbeValidText(value, false) || !mediaProbeMD5.MatchString(value) {
		return "", fail("MEDIA_SCHEMA_INVALID", "Media index key is not a bounded MD5")
	}
	return strings.ToLower(value), nil
}

func mediaProbePath(kind, dir1, dir2, name string) (string, error) {
	if !mediaProbeSegment(dir1) || !mediaProbeSegment(dir2) || !mediaProbeSegment(name) {
		return "", fail("MEDIA_SCHEMA_INVALID", "Media path components are invalid")
	}
	var parts []string
	switch kind {
	case "image":
		parts = []string{"msg", "attach", dir1, dir2, "Img", name}
	case "video":
		parts = []string{"msg", "video", dir1, name}
	case "file":
		parts = []string{"msg", "file", dir1, name}
	default:
		return "", fail("MEDIA_SCHEMA_INVALID", "Unknown media kind")
	}
	joined := filepath.ToSlash(filepath.Join(parts...))
	if joined == "." || joined == "" || strings.HasPrefix(joined, "../") || strings.Contains(joined, "../") {
		return "", fail("MEDIA_SCHEMA_INVALID", "Media path escaped the relative data root")
	}
	return joined, nil
}

func mediaProbeFiles(root string) ([]mediaProbeFile, error) {
	files := make([]mediaProbeFile, 0, 4)
	entries := 0
	err := filepath.WalkDir(root, func(name string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return fail("PATH_UNAVAILABLE", "Media probe could not inspect the selected root")
		}
		entries++
		if entries > 10000 {
			return fail("MEDIA_INDEX_TOO_LARGE", "Media probe directory inventory exceeds limits")
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fail("SYMLINK_DENIED", "Media probe refuses symlink members")
		}
		if entry.IsDir() {
			relative, err := filepath.Rel(root, name)
			if err != nil || relative != "." && strings.Count(relative, string(os.PathSeparator)) > 8 {
				return fail("MEDIA_INDEX_TOO_LARGE", "Media probe path depth exceeds the bound")
			}
			return nil
		}
		base := entry.Name()
		if base != "hardlink.db" && !mediaProbeVoiceName.MatchString(base) {
			return nil
		}
		if len(files) >= maxMediaProbeFiles {
			return fail("MEDIA_INDEX_TOO_LARGE", "Too many media databases")
		}
		relative, err := filepath.Rel(root, name)
		if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
			return fail("PATH_ESCAPE", "Media database escaped the selected root")
		}
		info, err := os.Stat(name)
		if err != nil || !info.Mode().IsRegular() {
			return fail("DATABASE_INVALID", "Media database must be a regular file")
		}
		if info.Size() < 0 || info.Size() > maxMediaProbeFileBytes {
			return fail("MEDIA_INDEX_TOO_LARGE", "Media database exceeds the bounded probe size")
		}
		digest, err := mediaProbeDigest(name, info.Size())
		if err != nil {
			return err
		}
		files = append(files, mediaProbeFile{relative: filepath.ToSlash(relative), path: name, info: info, digest: digest})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].relative < files[j].relative })
	return files, nil
}

func mediaProbeDigest(name string, expectedBytes int64) (string, error) {
	file, err := os.Open(name)
	if err != nil {
		return "", fail("DATABASE_UNAVAILABLE", "Cannot hash media database")
	}
	defer file.Close()
	hash := sha256.New()
	read, err := io.CopyN(hash, file, maxMediaProbeFileBytes+1)
	if err != nil && err != io.EOF {
		return "", fail("DATABASE_UNAVAILABLE", "Cannot hash media database")
	}
	if read > maxMediaProbeFileBytes || read != expectedBytes {
		return "", fail("DATASET_CHANGED", "Media database changed while it was hashed")
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}

func openMediaProbeDB(file mediaProbeFile) (*mediaProbeDB, error) {
	if err := rejectSidecars(file.path); err != nil {
		return nil, err
	}
	f, err := os.Open(file.path)
	if err != nil {
		return nil, fail("DATABASE_UNAVAILABLE", "Cannot read media database")
	}
	header := make([]byte, 16)
	_, readErr := io.ReadFull(f, header)
	_ = f.Close()
	if readErr != nil || string(header) != "SQLite format 3\x00" {
		return nil, fail("NOT_PLAINTEXT_SQLITE", "Media probe accepts only decrypted SQLite copies")
	}
	uri := url.URL{Scheme: "file", Path: file.path}
	query := uri.Query()
	query.Set("mode", "ro")
	query.Set("immutable", "1")
	query.Set("_query_only", "1")
	query.Set("_busy_timeout", "1000")
	uri.RawQuery = query.Encode()
	db, err := sql.Open("sqlite3", uri.String())
	if err != nil {
		return nil, fail("DATABASE_UNAVAILABLE", "Cannot open media database read-only")
	}
	db.SetMaxOpenConns(1)
	closeOnError := true
	defer func() {
		if closeOnError {
			_ = db.Close()
		}
	}()
	var queryOnly int
	if err := db.QueryRow("PRAGMA query_only").Scan(&queryOnly); err != nil || queryOnly != 1 {
		return nil, fail("READONLY_REQUIRED", "Media probe could not verify SQLite read-only mode")
	}
	rows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table'")
	if err != nil {
		return nil, fail("DATABASE_INVALID", "Cannot read media database schema")
	}
	tables := map[string]bool{}
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			_ = rows.Close()
			return nil, fail("DATABASE_INVALID", "Invalid media table metadata")
		}
		tables[table] = true
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return nil, fail("DATABASE_INVALID", "Cannot finish reading media schema")
	}
	_ = rows.Close()
	closeOnError = false
	return &mediaProbeDB{file: file, db: db, tables: tables}, nil
}

func (d *mediaProbeDB) close() {
	if d != nil && d.db != nil {
		_ = d.db.Close()
	}
}

func mediaProbeStable(files []mediaProbeFile) error {
	for _, file := range files {
		current, err := os.Stat(file.path)
		if err != nil || !os.SameFile(file.info, current) || file.info.Size() != current.Size() || !file.info.ModTime().Equal(current.ModTime()) {
			return fail("DATASET_CHANGED", "Media database changed; reopen a stable copy")
		}
		if err := rejectSidecars(file.path); err != nil {
			return err
		}
	}
	return nil
}

func (b *bridge) mediaProbe(ctx context.Context) (any, error) {
	files, err := mediaProbeFiles(b.root)
	if err != nil {
		return nil, err
	}
	fileNames := make([]mediaProbeFileSummary, 0, len(files))
	for _, file := range files {
		fileNames = append(fileNames, mediaProbeFileSummary{Path: file.relative, Bytes: file.info.Size(), SHA256: file.digest})
	}
	if len(files) == 0 {
		return mediaProbeUnavailable("No explicit hardlink.db or media_*.db was found under the selected dataset", fileNames), nil
	}
	items := make([]mediaProbeItem, 0, 64)
	seen := map[string]int{}
	for _, file := range files {
		db, err := openMediaProbeDB(file)
		if err != nil {
			return nil, err
		}
		if strings.HasSuffix(file.relative, "hardlink.db") {
			if !db.tables["dir2id"] {
				db.close()
				return nil, fail("MEDIA_SCHEMA_UNSUPPORTED", "hardlink.db is missing dir2id")
			}
			if err := validateColumns(db.db, "dir2id", []string{"username"}); err != nil {
				db.close()
				return nil, fail("MEDIA_SCHEMA_UNSUPPORTED", "hardlink.db dir2id schema is unsupported")
			}
			recognizedHardlinkTable := false
			for _, candidate := range mediaProbeTables {
				if !db.tables[candidate.name] {
					continue
				}
				recognizedHardlinkTable = true
				if err := validateColumns(db.db, candidate.name, []string{"md5", "file_name", "file_size", "modify_time", "dir1", "dir2"}); err != nil {
					db.close()
					return nil, fail("MEDIA_SCHEMA_UNSUPPORTED", "hardlink.db media table schema is unsupported")
				}
				query := `SELECT COALESCE(f.md5,''),COALESCE(f.file_name,''),f.file_size,f.modify_time,COALESCE(d1.username,''),COALESCE(d2.username,'') FROM "` + candidate.name + `" f LEFT JOIN "dir2id" d1 ON d1.rowid=f.dir1 LEFT JOIN "dir2id" d2 ON d2.rowid=f.dir2 ORDER BY f.md5 COLLATE BINARY,f.file_name COLLATE BINARY,f.rowid LIMIT ?`
				rows, err := db.db.QueryContext(ctx, query, maxMediaProbeItems+1)
				if err != nil {
					db.close()
					return nil, fail("MEDIA_READ_FAILED", "Cannot read hardlink media metadata")
				}
				for rows.Next() {
					if len(items) >= maxMediaProbeItems {
						_ = rows.Close()
						db.close()
						return nil, fail("MEDIA_INDEX_TOO_LARGE", "Media metadata exceeds the bounded index")
					}
					var key, name, dir1, dir2 string
					var size, modify int64
					if err := rows.Scan(&key, &name, &size, &modify, &dir1, &dir2); err != nil {
						_ = rows.Close()
						db.close()
						return nil, fail("MEDIA_SCHEMA_INVALID", "Hardlink metadata row has an invalid value")
					}
					key, err = mediaProbeKey(key)
					if err != nil {
						_ = rows.Close()
						db.close()
						return nil, err
					}
					if size < 0 || size > maxMediaProbeBytes || modify < 0 || !mediaProbeValidText(name, false) {
						_ = rows.Close()
						db.close()
						return nil, fail("MEDIA_SCHEMA_INVALID", "Hardlink metadata row is outside the bound")
					}
					path, err := mediaProbePath(candidate.kind, dir1, dir2, name)
					if err != nil {
						_ = rows.Close()
						db.close()
						return nil, err
					}
					item := mediaProbeItem{Kind: candidate.kind, Key: key, Name: name, Path: path, Size: size, ModifyTime: modify, Dir1: dir1, Dir2: dir2, SourceDB: file.relative, SourceTable: candidate.name, MetadataOnly: true, NativeSchema: false}
					identity := item.Kind + "\x00" + item.Key
					if previous, ok := seen[identity]; ok {
						items[previous].Ambiguous = true
						item.Ambiguous = true
					}
					seen[identity] = len(items)
					items = append(items, item)
				}
				if err := rows.Err(); err != nil {
					_ = rows.Close()
					db.close()
					return nil, fail("MEDIA_READ_FAILED", "Cannot finish reading hardlink metadata")
				}
				_ = rows.Close()
			}
			if !recognizedHardlinkTable {
				db.close()
				return nil, fail("MEDIA_SCHEMA_UNSUPPORTED", "hardlink.db has no supported media index table")
			}
		} else {
			if !db.tables["VoiceInfo"] {
				db.close()
				return nil, fail("MEDIA_SCHEMA_UNSUPPORTED", "Voice database is missing VoiceInfo")
			}
			if err := validateColumns(db.db, "VoiceInfo", []string{"svr_id", "voice_data"}); err != nil {
				db.close()
				return nil, fail("MEDIA_SCHEMA_UNSUPPORTED", "VoiceInfo schema is unsupported")
			}
			rows, err := db.db.QueryContext(ctx, `SELECT CAST(svr_id AS TEXT),length(voice_data) FROM "VoiceInfo" WHERE voice_data IS NOT NULL ORDER BY CAST(svr_id AS TEXT) COLLATE BINARY LIMIT ?`, maxMediaProbeItems+1)
			if err != nil {
				db.close()
				return nil, fail("MEDIA_READ_FAILED", "Cannot read VoiceInfo metadata")
			}
			for rows.Next() {
				if len(items) >= maxMediaProbeItems {
					_ = rows.Close()
					db.close()
					return nil, fail("MEDIA_INDEX_TOO_LARGE", "Media metadata exceeds the bounded index")
				}
				var key string
				var bytes sql.NullInt64
				if err := rows.Scan(&key, &bytes); err != nil || !bytes.Valid {
					_ = rows.Close()
					db.close()
					return nil, fail("MEDIA_SCHEMA_INVALID", "VoiceInfo metadata row has an invalid value")
				}
				if !mediaProbeValidText(key, false) || bytes.Int64 < 0 || bytes.Int64 > maxMediaProbeBytes {
					_ = rows.Close()
					db.close()
					return nil, fail("MEDIA_SCHEMA_INVALID", "VoiceInfo metadata row is outside the bound")
				}
				item := mediaProbeItem{Kind: "voice", Key: key, DataBytes: bytes.Int64, SourceDB: file.relative, SourceTable: "VoiceInfo", MetadataOnly: true, NativeSchema: false}
				identity := item.Kind + "\x00" + item.Key
				if previous, ok := seen[identity]; ok {
					items[previous].Ambiguous = true
					item.Ambiguous = true
				}
				seen[identity] = len(items)
				items = append(items, item)
			}
			if err := rows.Err(); err != nil {
				_ = rows.Close()
				db.close()
				return nil, fail("MEDIA_READ_FAILED", "Cannot finish reading VoiceInfo metadata")
			}
			_ = rows.Close()
		}
		db.close()
	}
	if err := mediaProbeStable(files); err != nil {
		return nil, err
	}
	ambiguous := 0
	for _, item := range items {
		if item.Ambiguous {
			ambiguous++
		}
	}
	return map[string]any{"status": "ready", "sourceKind": "explicit-v4-media-database-probe", "nativeSchemaSupported": false, "metadataOnly": true, "mediaReady": false, "files": fileNames, "items": items, "itemCount": len(items), "ambiguousItems": ambiguous}, nil
}
