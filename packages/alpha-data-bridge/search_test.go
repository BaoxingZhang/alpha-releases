package main

import (
	"bytes"
	"github.com/klauspost/compress/zstd"
	"testing"
)

func TestBoundedSharedTextDecoder(t *testing.T) {
	encoder, err := zstd.NewWriter(nil)
	if err != nil {
		t.Fatal(err)
	}
	defer encoder.Close()
	text := "Unicode 中文 Needle"
	encoded := encoder.EncodeAll([]byte(text), nil)
	decoded, encoding, compression, status := decodedContent(encoded)
	if decoded != text || encoding != "utf8" || compression != "zstd" || status != "decoded" {
		t.Fatal("valid compressed text not decoded")
	}
	oversized := encoder.EncodeAll(bytes.Repeat([]byte{'a'}, maxTextBytes+1), nil)
	if _, _, _, status := decodedContent(oversized); status == "decoded" {
		t.Fatal("oversized decompressed content accepted")
	}
	if _, _, _, status := decodedContent([]byte{0x28, 0xb5, 0x2f, 0xfd, 0}); status == "decoded" {
		t.Fatal("invalid frame accepted")
	}
	if _, _, _, status := decodedContent([]byte{0xff}); status == "decoded" {
		t.Fatal("invalid UTF-8 accepted")
	}
}

func TestSyntheticVoiceReferenceAcceptsContentAddressedIdentity(t *testing.T) {
	const id = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	refs := mediaReferences("34", "500", `<msg sha256="`+id+`"/>`)
	if len(refs) != 1 || refs[0].Kind != "voice" || refs[0].ID != id || refs[0].Rendition != "voice-data" {
		t.Fatalf("unexpected synthetic voice refs: %#v", refs)
	}
	legacy := mediaReferences("34", "500", "")
	if len(legacy) != 1 || legacy[0].ID != "500" {
		t.Fatalf("legacy voice identity changed: %#v", legacy)
	}
}
