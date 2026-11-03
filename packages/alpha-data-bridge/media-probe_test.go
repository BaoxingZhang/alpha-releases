package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func mediaProbeContactFixture(t *testing.T) string {
	t.Helper()
	root, _ := fixtureDB(t, contactSchema)
	return root
}

func createMediaProbeDB(t *testing.T, path string, schema string) {
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

func TestMediaProbeReturnsBoundedMetadataOnlyIndex(t *testing.T) {
	root := mediaProbeContactFixture(t)
	createMediaProbeDB(t, filepath.Join(root, "hardlink.db"), `
CREATE TABLE dir2id (username TEXT);
INSERT INTO dir2id(rowid,username) VALUES (1,'acct'),(2,'2026-01');
CREATE TABLE image_hardlink_info_v4 (md5 TEXT,file_name TEXT,file_size INTEGER,modify_time INTEGER,dir1 INTEGER,dir2 INTEGER);
INSERT INTO image_hardlink_info_v4 VALUES ('0123456789abcdef0123456789abcdef','image.dat',123,1700000000,1,2);`)
	createMediaProbeDB(t, filepath.Join(root, "media_01.db"), `
CREATE TABLE VoiceInfo (svr_id TEXT,voice_data BLOB);
INSERT INTO VoiceInfo VALUES ('voice-1',zeroblob(24));`)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "probe", Op: "media.probe", Params: json.RawMessage(`{}`)})
	if err != nil {
		t.Fatal(err)
	}
	result := value.(map[string]any)
	if result["status"] != "ready" || result["nativeSchemaSupported"] != false || result["metadataOnly"] != true || result["mediaReady"] != false {
		t.Fatalf("unexpected probe result: %#v", result)
	}
	files := result["files"].([]mediaProbeFileSummary)
	if len(files) != 2 || files[0].Path != "hardlink.db" || len(files[0].SHA256) != 64 || files[0].Bytes <= 0 {
		t.Fatalf("expected bounded source file hashes, got %#v", files)
	}
	items := result["items"].([]mediaProbeItem)
	if len(items) != 2 {
		t.Fatalf("expected image and voice metadata, got %#v", items)
	}
	if items[0].Kind != "image" || items[0].Path != "msg/attach/acct/2026-01/Img/image.dat" || items[0].Size != 123 {
		t.Fatalf("unexpected image metadata: %#v", items[0])
	}
	if items[1].Kind != "voice" || items[1].Key != "voice-1" || items[1].DataBytes != 24 {
		t.Fatalf("unexpected voice metadata: %#v", items[1])
	}
	if _, err := b.dispatch(context.Background(), request{ID: "unknown", Op: "media.probe", Params: json.RawMessage(`{"path":"outside"}`)}); err == nil {
		t.Fatal("expected strict probe parameters to be rejected")
	}
}

func TestMediaProbeUnavailableDoesNotInventIndex(t *testing.T) {
	root := mediaProbeContactFixture(t)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "probe", Op: "media.probe"})
	if err != nil {
		t.Fatal(err)
	}
	result := value.(map[string]any)
	if result["status"] != "unavailable" || result["mediaReady"] != false {
		t.Fatalf("unexpected unavailable result: %#v", result)
	}
	if len(result["items"].([]mediaProbeItem)) != 0 {
		t.Fatal("unavailable probe returned invented metadata")
	}
}

func TestMediaProbeRejectsInvalidMediaSchema(t *testing.T) {
	root := mediaProbeContactFixture(t)
	createMediaProbeDB(t, filepath.Join(root, "hardlink.db"), `
CREATE TABLE dir2id (username TEXT);
CREATE TABLE image_hardlink_info_v4 (md5 TEXT,file_name TEXT,file_size INTEGER,modify_time INTEGER,dir1 INTEGER,dir2 INTEGER);
INSERT INTO image_hardlink_info_v4 VALUES ('not-an-md5','image.dat',123,1700000000,1,1);`)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "probe", Op: "media.probe"})
	var bridgeErr *bridgeError
	if !errors.As(err, &bridgeErr) || bridgeErr.Code != "MEDIA_SCHEMA_INVALID" {
		t.Fatalf("expected MEDIA_SCHEMA_INVALID, got %v", err)
	}
}

func TestMediaProbeRejectsSymlinkDatabase(t *testing.T) {
	root := mediaProbeContactFixture(t)
	target := filepath.Join(root, "target.db")
	createMediaProbeDB(t, target, `CREATE TABLE VoiceInfo (svr_id TEXT,voice_data BLOB)`)
	if err := os.Symlink(target, filepath.Join(root, "media_01.db")); err != nil {
		t.Fatal(err)
	}
	// The bridge itself rejects symlinks before the probe can be selected.
	if _, err := openBridge(root, "synthetic"); err == nil {
		t.Fatal("expected symlink dataset to be rejected")
	}
}

func TestReadVoiceBlobIsExplicitCandidateOnly(t *testing.T) {
	root := mediaProbeContactFixture(t)
	createMediaProbeDB(t, filepath.Join(root, "media_01.db"), `
CREATE TABLE VoiceInfo (svr_id TEXT,voice_data BLOB);
INSERT INTO VoiceInfo VALUES ('voice-1',X'53494C4B');`)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	value, err := b.dispatch(context.Background(), request{ID: "voice", Op: "media.read_voice", Params: json.RawMessage(`{"key":"voice-1"}`)})
	if err != nil {
		t.Fatal(err)
	}
	result := value.(*voiceBlobResult)
	if result.Status != "ready" || result.SourceKind != "explicit-v4-voice-database-candidate" || result.Complete || result.NativeSchemaSupported || !result.ThirdPartyCandidate || result.Decoded || result.MediaReady {
		t.Fatalf("unexpected voice candidate boundary: %#v", result)
	}
	if result.Key != "voice-1" || result.SourceDatabase != "media_01.db" || result.SourceTable != "VoiceInfo" || result.DataBytes != 4 || result.Encoding != "unknown-voice-data" || string(result.Data) != "SILK" {
		t.Fatalf("unexpected voice candidate data: %#v", result)
	}
	if result.SHA256 == "" || len(result.SHA256) != 64 {
		t.Fatalf("missing voice blob digest: %#v", result)
	}
}

func TestReadVoiceBlobRejectsAmbiguousKeys(t *testing.T) {
	root := mediaProbeContactFixture(t)
	for _, name := range []string{"media_01.db", "media_02.db"} {
		createMediaProbeDB(t, filepath.Join(root, name), `
CREATE TABLE VoiceInfo (svr_id TEXT,voice_data BLOB);
INSERT INTO VoiceInfo VALUES ('voice-1',X'01');`)
	}
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "voice", Op: "media.read_voice", Params: json.RawMessage(`{"key":"voice-1"}`)})
	var bridgeErr *bridgeError
	if !errors.As(err, &bridgeErr) || bridgeErr.Code != "MEDIA_VOICE_AMBIGUOUS" {
		t.Fatalf("expected MEDIA_VOICE_AMBIGUOUS, got %v", err)
	}
}

func TestReadVoiceBlobRejectsDuplicateRowsInOneDatabase(t *testing.T) {
	root := mediaProbeContactFixture(t)
	createMediaProbeDB(t, filepath.Join(root, "media_01.db"), `
CREATE TABLE VoiceInfo (svr_id TEXT,voice_data BLOB);
INSERT INTO VoiceInfo VALUES ('voice-1',X'01'),('voice-1',X'02');`)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "voice", Op: "media.read_voice", Params: json.RawMessage(`{"key":"voice-1"}`)})
	var bridgeErr *bridgeError
	if !errors.As(err, &bridgeErr) || bridgeErr.Code != "MEDIA_VOICE_AMBIGUOUS" {
		t.Fatalf("expected MEDIA_VOICE_AMBIGUOUS, got %v", err)
	}
}

func TestReadVoiceBlobRequiresStrictKey(t *testing.T) {
	root := mediaProbeContactFixture(t)
	b, err := openBridge(root, "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "voice", Op: "media.read_voice", Params: json.RawMessage(`{"key":"voice-1","path":"outside"}`)})
	var bridgeErr *bridgeError
	if !errors.As(err, &bridgeErr) || bridgeErr.Code != "INVALID_REQUEST" {
		t.Fatalf("expected INVALID_REQUEST, got %v", err)
	}
}
