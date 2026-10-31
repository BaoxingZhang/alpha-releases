// Alpha independent SQLCipher v4 offline snapshot importer.
// Key acquisition and active-process inspection are intentionally out of scope.
package main

import (
	"bufio"
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/pbkdf2"
	"crypto/sha256"
	"crypto/sha512"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"syscall"

	_ "github.com/mattn/go-sqlite3"
)

const (
	pageSize               = 4096
	reserve                = 80
	ivSize                 = 16
	hmacSize               = 64
	iterations             = 256000
	maxDatabaseBytes int64 = 128 << 30
	maxTotalBytes    int64 = 512 << 30
)

var databaseName = regexp.MustCompile(`^(contact\.db|session\.db|message(?:_[0-9]+)?\.db)$`)
var hexKey = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

type bridgeError struct {
	Code    string
	Message string
}

func (e *bridgeError) Error() string  { return e.Code + ": " + e.Message }
func fail(code, message string) error { return &bridgeError{Code: code, Message: message} }

type keyInput struct {
	KeyHex string `json:"keyHex"`
}
type fileStamp struct {
	relative, path string
	info           os.FileInfo
	hash           string
}
type sourceInventory struct {
	root    string
	entries []*fileStamp
	files   []*fileStamp
}
type databaseSummary struct {
	RelativePath string `json:"relativePath"`
	SourceSHA256 string `json:"sourceSha256"`
	OutputSHA256 string `json:"outputSha256"`
	Bytes        int64  `json:"bytes"`
	Pages        int64  `json:"pages"`
}
type summary struct {
	OK                  bool              `json:"ok"`
	Profile             string            `json:"profile"`
	OutputDir           string            `json:"outputDir"`
	SourceFingerprint   string            `json:"sourceFingerprint"`
	SourceUnchanged     bool              `json:"sourceUnchanged"`
	ReservedBytesZeroed bool              `json:"reservedBytesZeroed"`
	Databases           []databaseSummary `json:"databases"`
}

func checkCleanAbsolute(name string) error {
	if name == "" || !filepath.IsAbs(name) || filepath.Clean(name) != name || name == filepath.VolumeName(name)+string(os.PathSeparator) {
		return fail("PATH_INVALID", "explicit clean absolute path required")
	}
	current := filepath.VolumeName(name) + string(os.PathSeparator)
	for _, part := range strings.Split(strings.TrimPrefix(strings.TrimPrefix(name, current), string(os.PathSeparator)), string(os.PathSeparator)) {
		if part == "" {
			continue
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return fail("PATH_UNAVAILABLE", "path is missing or inaccessible")
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return fail("SYMLINK_DENIED", "symlink paths are not allowed")
		}
	}
	return nil
}
func checkNewAbsolute(name string) error {
	if name == "" || !filepath.IsAbs(name) || filepath.Clean(name) != name || name == filepath.VolumeName(name)+string(os.PathSeparator) {
		return fail("PATH_INVALID", "explicit clean absolute path required")
	}
	if info, err := os.Lstat(name); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return fail("SYMLINK_DENIED", "output symlink is not allowed")
		}
		return fail("OUTPUT_EXISTS", "output directory already exists")
	} else if !os.IsNotExist(err) {
		return fail("OUTPUT_UNAVAILABLE", "output path cannot be checked")
	}
	return checkCleanAbsolute(filepath.Dir(name))
}
func rejectSidecar(path string) error {
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		if _, err := os.Lstat(path + suffix); err == nil {
			return fail("ACTIVE_DATABASE_DENIED", "WAL, SHM and journal sidecars are not allowed")
		} else if !os.IsNotExist(err) {
			return fail("PATH_UNAVAILABLE", "cannot inspect database sidecars")
		}
	}
	return nil
}
func canceled(ctx context.Context) error {
	if ctx.Err() != nil {
		return fail("IMPORT_CANCELED", "import canceled")
	}
	return nil
}
func sameStamp(expected, current os.FileInfo) bool {
	return current != nil && os.SameFile(expected, current) && expected.Mode() == current.Mode() && expected.Size() == current.Size() && expected.ModTime().Equal(current.ModTime())
}
func inventory(ctx context.Context, root string) (*sourceInventory, error) {
	if err := checkCleanAbsolute(root); err != nil {
		return nil, err
	}
	info, err := os.Stat(root)
	if err != nil || !info.IsDir() {
		return nil, fail("PATH_INVALID", "source-dir must be a directory")
	}
	result := &sourceInventory{root: root}
	var totalBytes int64
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if err := canceled(ctx); err != nil {
			return err
		}
		if walkErr != nil {
			return fail("PATH_UNAVAILABLE", "source member inaccessible")
		}
		if entry.Type()&os.ModeSymlink != 0 {
			return fail("SYMLINK_DENIED", "source contains symlink")
		}
		relative, e := filepath.Rel(root, path)
		if e != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(os.PathSeparator)) {
			return fail("PATH_ESCAPE", "source escaped root")
		}
		if strings.Count(relative, string(os.PathSeparator)) > 8 || len(result.entries) >= 10000 {
			return fail("DATASET_TOO_LARGE", "source inventory exceeds limits")
		}
		stat, e := entry.Info()
		if e != nil {
			return fail("PATH_UNAVAILABLE", "source metadata unavailable")
		}
		if !stat.IsDir() && !stat.Mode().IsRegular() {
			return fail("SOURCE_TYPE_DENIED", "source members must be regular files or directories")
		}
		stamp := &fileStamp{relative: filepath.ToSlash(relative), path: path, info: stat}
		result.entries = append(result.entries, stamp)
		if stat.IsDir() {
			return nil
		}
		for _, suffix := range []string{"-wal", "-shm", "-journal"} {
			if strings.HasSuffix(entry.Name(), suffix) && databaseName.MatchString(strings.TrimSuffix(entry.Name(), suffix)) {
				return fail("ACTIVE_DATABASE_DENIED", "WAL, SHM and journal sidecars are not allowed")
			}
		}
		if !databaseName.MatchString(entry.Name()) {
			return nil
		}
		if err := checkDatabaseSize(stat.Size(), totalBytes); err != nil {
			return err
		}
		totalBytes += stat.Size()
		if err := rejectSidecar(path); err != nil {
			return err
		}
		result.files = append(result.files, stamp)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(result.files) == 0 {
		return nil, fail("NO_DATABASES", "no supported SQLCipher v4 databases found")
	}
	sort.Slice(result.entries, func(i, j int) bool { return result.entries[i].relative < result.entries[j].relative })
	sort.Slice(result.files, func(i, j int) bool { return result.files[i].relative < result.files[j].relative })
	return result, nil
}
func checkDatabaseSize(size, alreadyInventoried int64) error {
	if size < 0 || size > maxDatabaseBytes || alreadyInventoried < 0 || alreadyInventoried > maxTotalBytes-size {
		return fail("DATASET_TOO_LARGE", "source exceeds 128 GiB per database or 512 GiB total")
	}
	return nil
}

// O_NONBLOCK avoids a FIFO-open hang if a path is replaced after inventory.
// Fstat then rejects every nonregular or replaced source descriptor.
func openSource(file *fileStamp) (*os.File, error) {
	if err := checkCleanAbsolute(file.path); err != nil {
		return nil, err
	}
	fd, err := syscall.Open(file.path, syscall.O_RDONLY|syscall.O_CLOEXEC|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, fail("SOURCE_UNAVAILABLE", "source database cannot be opened")
	}
	f := os.NewFile(uintptr(fd), file.path)
	current, err := f.Stat()
	if err != nil || !current.Mode().IsRegular() || !sameStamp(file.info, current) {
		f.Close()
		return nil, fail("SOURCE_CHANGED", "source database changed during import")
	}
	return f, nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := canceled(r.ctx); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}
func sourceHash(ctx context.Context, file *fileStamp) (string, error) {
	f, err := openSource(file)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, contextReader{ctx, f}); err != nil {
		if e := canceled(ctx); e != nil {
			return "", e
		}
		return "", fail("SOURCE_UNAVAILABLE", "source database cannot be hashed")
	}
	current, err := f.Stat()
	if err != nil || !sameStamp(file.info, current) {
		return "", fail("SOURCE_CHANGED", "source database changed while hashing")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func validateInventory(ctx context.Context, original *sourceInventory) error {
	current, err := inventory(ctx, original.root)
	if err != nil {
		return err
	}
	if len(original.entries) != len(current.entries) {
		return fail("SOURCE_CHANGED", "source directory membership changed during import")
	}
	for i, entry := range original.entries {
		candidate := current.entries[i]
		if entry.relative != candidate.relative || !sameStamp(entry.info, candidate.info) {
			return fail("SOURCE_CHANGED", "source member changed during import")
		}
	}
	for _, file := range original.files {
		hash, err := sourceHash(ctx, file)
		if err != nil {
			return err
		}
		if hash != file.hash {
			return fail("SOURCE_CHANGED", "source database hash changed during import")
		}
	}
	return canceled(ctx)
}
func wipe(buffer []byte) { clear(buffer) }
func derive(key, salt []byte) ([]byte, []byte, error) {
	enc, err := pbkdf2.Key(sha512.New, string(key), salt, iterations, 32)
	if err != nil {
		return nil, nil, fail("DECRYPT_FAILED", "cannot derive encryption key")
	}
	masked := make([]byte, len(salt))
	defer wipe(masked)
	for i := range salt {
		masked[i] = salt[i] ^ 0x3a
	}
	mac, err := pbkdf2.Key(sha512.New, string(enc), masked, 2, 32)
	if err != nil {
		wipe(enc)
		return nil, nil, fail("DECRYPT_FAILED", "cannot derive authentication key")
	}
	return enc, mac, nil
}
func pageMAC(page []byte, macKey []byte, pageNumber int64) []byte {
	h := hmac.New(sha512.New, macKey)
	offset := 0
	if pageNumber == 1 {
		offset = 16
	}
	h.Write(page[offset : pageSize-reserve+ivSize])
	var number [4]byte
	number[0] = byte(pageNumber)
	number[1] = byte(pageNumber >> 8)
	number[2] = byte(pageNumber >> 16)
	number[3] = byte(pageNumber >> 24)
	h.Write(number[:])
	return h.Sum(nil)
}
func decryptPage(input []byte, enc, mac []byte, pageNumber int64) ([]byte, error) {
	offset := 0
	if pageNumber == 1 {
		offset = 16
	}
	expected := pageMAC(input, mac, pageNumber)
	if !hmac.Equal(expected, input[pageSize-reserve+ivSize:pageSize-reserve+ivSize+hmacSize]) {
		return nil, fail("KEY_AUTHENTICATION_FAILED", "database page authentication failed")
	}
	block, err := aes.NewCipher(enc)
	if err != nil {
		return nil, fail("DECRYPT_FAILED", "cannot initialize AES")
	}
	iv := input[pageSize-reserve : pageSize-reserve+ivSize]
	payload := append([]byte(nil), input[offset:pageSize-reserve]...)
	if len(payload)%block.BlockSize() != 0 {
		return nil, fail("TRUNCATED_DATABASE", "encrypted page payload is not block aligned")
	}
	cipher.NewCBCDecrypter(block, iv).CryptBlocks(payload, payload)
	out := append(payload, make([]byte, reserve)...)
	return out, nil
}
func decryptDatabase(ctx context.Context, file *fileStamp, key []byte, temp string) (databaseSummary, error) {
	f, err := openSource(file)
	if err != nil {
		return databaseSummary{}, err
	}
	defer f.Close()
	stat := file.info
	if stat.Size() < pageSize || stat.Size()%pageSize != 0 {
		return databaseSummary{}, fail("TRUNCATED_DATABASE", "database is not a complete page sequence")
	}
	salt := make([]byte, 16)
	if _, err := io.ReadFull(f, salt); err != nil {
		return databaseSummary{}, fail("TRUNCATED_DATABASE", "database salt is missing")
	}
	enc, mac, err := derive(key, salt)
	if err != nil {
		return databaseSummary{}, err
	}
	defer wipe(enc)
	defer wipe(mac)
	if err := canceled(ctx); err != nil {
		return databaseSummary{}, err
	}
	outputPath := filepath.Join(temp, filepath.FromSlash(file.relative))
	if err := os.MkdirAll(filepath.Dir(outputPath), 0700); err != nil {
		return databaseSummary{}, fail("OUTPUT_UNAVAILABLE", "temporary output cannot be created")
	}
	out, err := os.OpenFile(outputPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return databaseSummary{}, fail("OUTPUT_UNAVAILABLE", "temporary output cannot be opened")
	}
	defer out.Close()
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return databaseSummary{}, fail("SOURCE_UNAVAILABLE", "database cannot seek")
	}
	buf := make([]byte, pageSize)
	pages := stat.Size() / pageSize
	if pages > int64(^uint32(0)) {
		return databaseSummary{}, fail("DATASET_TOO_LARGE", "database exceeds 32-bit page numbering")
	}
	for page := int64(1); page <= pages; page++ {
		if err := canceled(ctx); err != nil {
			return databaseSummary{}, err
		}
		if _, err := io.ReadFull(f, buf); err != nil {
			return databaseSummary{}, fail("TRUNCATED_DATABASE", "database page is incomplete")
		}
		allZero := true
		for _, value := range buf {
			if value != 0 {
				allZero = false
				break
			}
		}
		if allZero {
			return databaseSummary{}, fail("KEY_AUTHENTICATION_FAILED", "unverified all-zero database page")
		}
		plain, err := decryptPage(buf, enc, mac, page)
		if err != nil {
			return databaseSummary{}, err
		}
		if page == 1 {
			if len(plain) < 5 || plain[0] != 0x10 || plain[1] != 0 || plain[4] != reserve {
				wipe(plain)
				return databaseSummary{}, fail("SCHEMA_PROFILE_UNSUPPORTED", "decrypted header does not match fixed page profile")
			}
			if _, err := out.Write([]byte("SQLite format 3\x00")); err != nil {
				return databaseSummary{}, fail("OUTPUT_UNAVAILABLE", "temporary output write failed")
			}
		}
		if _, err := out.Write(plain); err != nil {
			wipe(plain)
			return databaseSummary{}, fail("OUTPUT_UNAVAILABLE", "temporary output write failed")
		}
		wipe(plain)
	}
	current, err := f.Stat()
	if err != nil || !sameStamp(stat, current) {
		return databaseSummary{}, fail("SOURCE_CHANGED", "source database changed while decrypting")
	}
	if err := out.Sync(); err != nil {
		return databaseSummary{}, fail("OUTPUT_UNAVAILABLE", "temporary output sync failed")
	}
	if err := out.Close(); err != nil {
		return databaseSummary{}, fail("OUTPUT_UNAVAILABLE", "temporary output close failed")
	}
	hash, err := shaFile(ctx, outputPath)
	if err != nil {
		return databaseSummary{}, err
	}
	return databaseSummary{RelativePath: file.relative, SourceSHA256: file.hash, OutputSHA256: hash, Bytes: stat.Size(), Pages: pages}, nil
}
func shaFile(ctx context.Context, path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", fail("OUTPUT_UNAVAILABLE", "output cannot be read")
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, contextReader{ctx, f}); err != nil {
		if e := canceled(ctx); e != nil {
			return "", e
		}
		return "", fail("OUTPUT_UNAVAILABLE", "output cannot be hashed")
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
func integrityCheck(ctx context.Context, root string, files []databaseSummary) error {
	for _, file := range files {
		if err := canceled(ctx); err != nil {
			return err
		}
		uri := url.URL{Scheme: "file", Path: filepath.Join(root, filepath.FromSlash(file.RelativePath))}
		query := url.Values{"mode": {"ro"}, "immutable": {"1"}, "_query_only": {"1"}}
		uri.RawQuery = query.Encode()
		db, err := sql.Open("sqlite3", uri.String())
		if err != nil {
			return fail("SQLITE_INTEGRITY_FAILED", "cannot open decrypted database")
		}
		db.SetMaxOpenConns(1)
		var result string
		err = db.QueryRowContext(ctx, "PRAGMA integrity_check").Scan(&result)
		db.Close()
		if e := canceled(ctx); e != nil {
			return e
		}
		if err != nil || result != "ok" {
			return fail("SQLITE_INTEGRITY_FAILED", "decrypted database integrity check failed")
		}
	}
	return nil
}
func fingerprint(files []databaseSummary) string {
	h := sha256.New()
	for _, file := range files {
		fmt.Fprintf(h, "%s\x00%s\n", file.RelativePath, file.SourceSHA256)
	}
	return hex.EncodeToString(h.Sum(nil))
}
func parseInput(input io.Reader) ([]byte, error) {
	scanner := bufio.NewScanner(input)
	scanner.Buffer(make([]byte, 1024), 16*1024)
	if !scanner.Scan() {
		return nil, fail("KEY_INPUT_INVALID", "one JSON key object is required")
	}
	var value keyInput
	line := append([]byte(nil), scanner.Bytes()...)
	defer wipe(line)
	decoder := json.NewDecoder(bytes.NewReader(line))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil || !hexKey.MatchString(value.KeyHex) {
		return nil, fail("KEY_INPUT_INVALID", "keyHex must be exactly 64 hexadecimal characters")
	}
	if decoder.Decode(new(any)) != io.EOF {
		return nil, fail("KEY_INPUT_INVALID", "one JSON key object is required")
	}
	if scanner.Scan() {
		return nil, fail("KEY_INPUT_INVALID", "only one key object is accepted")
	}
	if scanner.Err() != nil {
		return nil, fail("KEY_INPUT_INVALID", "key input is unreadable or exceeds limit")
	}
	key, err := hex.DecodeString(value.KeyHex)
	value.KeyHex = ""
	if err != nil {
		return nil, fail("KEY_INPUT_INVALID", "keyHex is invalid")
	}
	return key, nil
}

// stdin can be a blocking OS descriptor that Close does not interrupt. The
// one-shot CLI can return on cancellation without waiting for that read; any
// parser result that loses the cancellation race has its key bytes cleared.
func parseInputContext(ctx context.Context, input io.Reader) ([]byte, error) {
	type parsed struct {
		key []byte
		err error
	}
	results := make(chan parsed)
	go func() {
		key, err := parseInput(input)
		select {
		case results <- parsed{key, err}:
		case <-ctx.Done():
			wipe(key)
		}
	}()
	select {
	case result := <-results:
		return result.key, result.err
	case <-ctx.Done():
		return nil, canceled(ctx)
	}
}
func cleanTemp(path string) {
	if path != "" {
		_ = os.RemoveAll(path)
	}
}
func nestedPath(parent, child string) bool {
	relative, err := filepath.Rel(parent, child)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(os.PathSeparator))
}
func run(ctx context.Context, source, output string, input io.Reader) (summary, error) {
	if err := canceled(ctx); err != nil {
		return summary{}, err
	}
	if err := checkCleanAbsolute(source); err != nil {
		return summary{}, err
	}
	if nestedPath(source, output) || nestedPath(output, source) {
		return summary{}, fail("PATH_OVERLAP", "source and output directories must be disjoint")
	}
	if err := checkNewAbsolute(output); err != nil {
		return summary{}, err
	}
	original, err := inventory(ctx, source)
	if err != nil {
		return summary{}, err
	}
	for _, file := range original.files {
		file.hash, err = sourceHash(ctx, file)
		if err != nil {
			return summary{}, err
		}
	}
	key, err := parseInputContext(ctx, input)
	if key != nil {
		defer wipe(key)
	}
	if e := canceled(ctx); e != nil {
		return summary{}, e
	}
	if err != nil {
		return summary{}, err
	}
	if err := validateInventory(ctx, original); err != nil {
		return summary{}, err
	}
	parent := filepath.Dir(output)
	parentInfo, err := os.Stat(parent)
	if err != nil || !parentInfo.IsDir() {
		return summary{}, fail("OUTPUT_UNAVAILABLE", "output parent must be an existing directory")
	}
	temp, err := os.MkdirTemp(parent, ".alpha-snapshot-")
	if err != nil {
		return summary{}, fail("OUTPUT_UNAVAILABLE", "temporary output cannot be created")
	}
	defer func() { cleanTemp(temp) }()
	if err := os.Chmod(temp, 0700); err != nil {
		return summary{}, fail("OUTPUT_UNAVAILABLE", "temporary output permissions failed")
	}
	result := summary{Profile: "wechat-v4-sqlcipher4-4096-kdf256000", OutputDir: output, ReservedBytesZeroed: true}
	for _, file := range original.files {
		item, err := decryptDatabase(ctx, file, key, temp)
		if err != nil {
			return summary{}, err
		}
		result.Databases = append(result.Databases, item)
	}
	if err := validateInventory(ctx, original); err != nil {
		return summary{}, err
	}
	if err := integrityCheck(ctx, temp, result.Databases); err != nil {
		return summary{}, err
	}
	if err := validateInventory(ctx, original); err != nil {
		return summary{}, err
	}
	if err := checkCleanAbsolute(parent); err != nil {
		return summary{}, err
	}
	currentParent, err := os.Stat(parent)
	if err != nil || !os.SameFile(parentInfo, currentParent) {
		return summary{}, fail("OUTPUT_UNAVAILABLE", "output parent changed during import")
	}
	if err := canceled(ctx); err != nil {
		return summary{}, err
	}
	result.SourceFingerprint = fingerprint(result.Databases)
	// The successful exclusive rename is the commit point. A cancellation received
	// afterwards cannot turn the already complete published snapshot into a partial one.
	if err := publishExclusive(temp, output); err != nil {
		return summary{}, err
	}
	temp = ""
	result.SourceUnchanged = true
	result.OK = true
	return result, nil
}
func main() {
	log.SetFlags(0)
	log.SetOutput(os.Stderr)
	source := flag.String("source-dir", "", "explicit encrypted offline source directory")
	output := flag.String("output-dir", "", "new output directory")
	flag.Parse()
	if flag.NArg() != 0 {
		log.Print("KEY_INPUT_INVALID: no positional arguments accepted")
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result, err := run(ctx, *source, *output, os.Stdin)
	if err != nil {
		var known *bridgeError
		if errors.As(err, &known) {
			log.Print(known.Code + ": " + known.Message)
		} else {
			log.Print("IMPORT_FAILED: import failed")
		}
		os.Exit(2)
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(result); err != nil {
		log.Print("OUTPUT_FAILED: summary write failed")
		os.Exit(1)
	}
}
