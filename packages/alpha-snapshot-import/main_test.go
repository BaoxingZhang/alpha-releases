package main

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func codeIs(t *testing.T, err error, expected string) {
	t.Helper()
	var known *bridgeError
	if !errors.As(err, &known) || known.Code != expected {
		t.Fatalf("expected %s, got %v", expected, err)
	}
}
func TestExclusiveDirectoryPublish(t *testing.T) {
	root := t.TempDir()
	source, output := filepath.Join(root, "pending"), filepath.Join(root, "snapshot")
	if err := os.Mkdir(source, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "complete"), []byte("all files"), 0600); err != nil {
		t.Fatal(err)
	}
	// Destination appears after the caller's preflight, including an empty directory.
	if err := os.Mkdir(output, 0700); err != nil {
		t.Fatal(err)
	}
	codeIs(t, publishExclusive(source, output), "OUTPUT_EXISTS")
	if files, err := os.ReadDir(output); err != nil || len(files) != 0 {
		t.Fatal("existing destination changed")
	}
	if _, err := os.Stat(filepath.Join(source, "complete")); err != nil {
		t.Fatal("source disappeared on failed publication")
	}
	if err := os.Remove(output); err != nil {
		t.Fatal(err)
	}
	if err := publishExclusive(source, output); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(source); !os.IsNotExist(err) {
		t.Fatal("source name remained after atomic rename")
	}
	if value, err := os.ReadFile(filepath.Join(output, "complete")); err != nil || string(value) != "all files" {
		t.Fatal("complete destination missing")
	}
}

type errorReader struct{ data []byte }

func (r *errorReader) Read(p []byte) (int, error) {
	if len(r.data) == 0 {
		return 0, io.ErrUnexpectedEOF
	}
	n := copy(p, r.data)
	r.data = r.data[n:]
	return n, nil
}
func TestStrictKeyInput(t *testing.T) {
	valid := `{"keyHex":"` + strings.Repeat("01", 32) + `"}`
	for _, bad := range []string{valid + "\n" + strings.Repeat("x", 17000), valid + " {}", valid + "\n{}\n", strings.Repeat("x", 17000), `{"keyHex":"00","extra":1}`} {
		_, err := parseInput(strings.NewReader(bad))
		codeIs(t, err, "KEY_INPUT_INVALID")
	}
	_, err := parseInput(&errorReader{data: []byte(valid + "\n")})
	codeIs(t, err, "KEY_INPUT_INVALID")
	key, err := parseInput(strings.NewReader(valid + "\n"))
	if err != nil || len(key) != 32 {
		t.Fatal("valid input rejected", err)
	}
	wipe(key)
	for _, value := range key {
		if value != 0 {
			t.Fatal("wipe failed")
		}
	}
}
func TestInventoryDetectsMembersAndSameMetadataContentChange(t *testing.T) {
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(root, "contact.db")
	if err := os.WriteFile(file, []byte("synthetic initial bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	original, err := inventory(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	original.files[0].hash, err = sourceHash(context.Background(), original.files[0])
	if err != nil {
		t.Fatal(err)
	}
	stamp := original.files[0].info
	if err := os.WriteFile(file, []byte("synthetic changed bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(file, stamp.ModTime(), stamp.ModTime()); err != nil {
		t.Fatal(err)
	}
	codeIs(t, validateInventory(context.Background(), original), "SOURCE_CHANGED")
	if err := os.Mkdir(filepath.Join(root, "new-member"), 0700); err != nil {
		t.Fatal(err)
	}
	codeIs(t, validateInventory(context.Background(), original), "SOURCE_CHANGED")
}
func TestCanceledBeforeInput(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := run(ctx, "unused", "unused", strings.NewReader(""))
	codeIs(t, err, "IMPORT_CANCELED")
}
func TestDatabaseSizeLimits(t *testing.T) {
	for count := int64(0); count < 4; count++ {
		if err := checkDatabaseSize(maxDatabaseBytes, count*maxDatabaseBytes); err != nil {
			t.Fatal(err)
		}
	}
	codeIs(t, checkDatabaseSize(maxDatabaseBytes+1, 0), "DATASET_TOO_LARGE")
	codeIs(t, checkDatabaseSize(1, maxTotalBytes), "DATASET_TOO_LARGE")
	codeIs(t, checkDatabaseSize(-1, 0), "DATASET_TOO_LARGE")
}
