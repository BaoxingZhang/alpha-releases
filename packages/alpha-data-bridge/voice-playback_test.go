package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"strings"
	"testing"
)

func voicePlaybackFixture(t *testing.T) (string, string, string) {
	t.Helper()
	root := t.TempDir()
	path := filepath.Join(root, "message_0.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	// The bridge only needs a valid v4 message table to accept this shard; the
	// playback mapping itself remains an explicit synthetic marker table.
	_, err = db.Exec(`CREATE TABLE Name2Id (user_name TEXT); CREATE TABLE Msg_0123456789abcdef0123456789abcdef (local_id INTEGER PRIMARY KEY,server_id INTEGER,sort_seq INTEGER,local_type INTEGER,create_time INTEGER,real_sender_id TEXT,status INTEGER,message_content TEXT,packed_info_data BLOB); CREATE TABLE __alpha_voice_playback_v1 (media_id TEXT PRIMARY KEY,wav_media_id TEXT NOT NULL)`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	sourceID := "1111111111111111111111111111111111111111111111111111111111111111"
	wavID := "2222222222222222222222222222222222222222222222222222222222222222"
	if _, err = db.Exec(`INSERT INTO __alpha_voice_playback_v1 VALUES (?,?)`, sourceID, wavID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	return root, sourceID, wavID
}

func TestSyntheticVoicePlaybackMapping(t *testing.T) {
	root, sourceID, wavID := voicePlaybackFixture(t)
	b, err := openBridge(root, "voice-fixture")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	info, err := b.dispatch(context.Background(), request{ID: "info", Op: "account.info", Params: json.RawMessage(`{"limit":100}`)})
	if err != nil {
		t.Fatal(err)
	}
	capabilities := info.(map[string]any)["capabilities"].([]string)
	found := false
	for _, capability := range capabilities {
		if capability == "messages.voicePlayback" {
			found = true
		}
	}
	if !found {
		t.Fatalf("voice capability missing: %#v", capabilities)
	}
	value, err := b.dispatch(context.Background(), request{ID: "voice", Op: "voice.playback", Params: json.RawMessage(`{"mediaId":"` + sourceID + `","limit":100}`)})
	if err != nil {
		t.Fatal(err)
	}
	if value.(map[string]any)["wavMediaId"] != wavID {
		t.Fatalf("unexpected mapping: %#v", value)
	}
	missing := strings.Repeat("3", 64)
	missingValue, err := b.dispatch(context.Background(), request{ID: "missing", Op: "voice.playback", Params: json.RawMessage(`{"mediaId":"` + missing + `","limit":100}`)})
	if err != nil || missingValue.(map[string]any)["status"] != "missing" {
		t.Fatalf("unexpected missing result: %#v %v", missingValue, err)
	}
}

func TestSyntheticVoicePlaybackRejectsDuplicateMappingInOneDatabase(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "message_0.db")
	db, err := sql.Open("sqlite3", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE Name2Id (user_name TEXT); CREATE TABLE Msg_0123456789abcdef0123456789abcdef (local_id INTEGER PRIMARY KEY,server_id INTEGER,sort_seq INTEGER,local_type INTEGER,create_time INTEGER,real_sender_id TEXT,status INTEGER,message_content TEXT,packed_info_data BLOB); CREATE TABLE __alpha_voice_playback_v1 (media_id TEXT,wav_media_id TEXT NOT NULL)`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	sourceID := strings.Repeat("a", 64)
	firstWavID := strings.Repeat("b", 64)
	secondWavID := strings.Repeat("c", 64)
	if _, err = db.Exec(`INSERT INTO __alpha_voice_playback_v1 VALUES (?,?), (?,?)`, sourceID, firstWavID, sourceID, secondWavID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	b, err := openBridge(root, "voice-duplicate-fixture")
	if err != nil {
		t.Fatal(err)
	}
	defer b.close()
	_, err = b.dispatch(context.Background(), request{ID: "duplicate", Op: "voice.playback", Params: json.RawMessage(`{"mediaId":"` + sourceID + `","limit":100}`)})
	bridgeErr, ok := err.(*bridgeError)
	if !ok || bridgeErr.Code != "VOICE_PLAYBACK_AMBIGUOUS" {
		t.Fatalf("expected duplicate mapping rejection, got %#v", err)
	}
}
