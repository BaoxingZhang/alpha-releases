package main

// This is an explicitly selected, read-only VoiceInfo candidate reader. It
// exposes the stored voice_data bytes without decoding them and never claims
// Alpha's native VoiceInfo/SILK/media1_ semantics.

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// The bridge protocol caps encoded responses at 12 MiB. []byte values are
// JSON-base64 encoded, so keep raw VoiceInfo blobs below that frame even
// before the result metadata is added.
const maxVoiceBlobBytes int64 = 8 << 20

type voiceBlobParams struct {
	Key string `json:"key"`
}

type voiceBlobResult struct {
	Status                string `json:"status"`
	SourceKind            string `json:"sourceKind"`
	Complete              bool   `json:"complete"`
	NativeSchemaSupported bool   `json:"nativeSchemaSupported"`
	ThirdPartyCandidate   bool   `json:"thirdPartyCandidate"`
	Decoded               bool   `json:"decoded"`
	MediaReady            bool   `json:"mediaReady"`
	Key                   string `json:"key"`
	SourceDatabase        string `json:"sourceDatabase"`
	SourceTable           string `json:"sourceTable"`
	DataBytes             int64  `json:"dataBytes"`
	SHA256                string `json:"sha256"`
	Encoding              string `json:"encoding"`
	Data                  []byte `json:"data"`
}

func (b *bridge) readVoiceBlob(ctx context.Context, params json.RawMessage) (any, error) {
	var request voiceBlobParams
	if len(params) == 0 || string(params) == "null" {
		return nil, fail("INVALID_PARAMS", "Voice blob lookup requires a key")
	}
	if err := decodeStrict(params, &request); err != nil {
		return nil, err
	}
	if !mediaProbeValidText(request.Key, false) || len(request.Key) > maxMediaProbeText {
		return nil, fail("MEDIA_VOICE_KEY_INVALID", "VoiceInfo key is not a bounded text value")
	}
	files, err := mediaProbeFiles(b.root)
	if err != nil {
		return nil, err
	}
	var found *voiceBlobResult
	for _, file := range files {
		if !mediaProbeVoiceName.MatchString(file.relative) {
			continue
		}
		db, err := openMediaProbeDB(file)
		if err != nil {
			return nil, err
		}
		if !db.tables["VoiceInfo"] {
			db.close()
			continue
		}
		if err := validateColumns(db.db, "VoiceInfo", []string{"svr_id", "voice_data"}); err != nil {
			db.close()
			return nil, fail("MEDIA_SCHEMA_UNSUPPORTED", "VoiceInfo schema is unsupported")
		}
		lengthRows, err := db.db.QueryContext(ctx, `SELECT length(voice_data) FROM "VoiceInfo" WHERE CAST(svr_id AS TEXT)=? AND typeof(voice_data)='blob' AND voice_data IS NOT NULL LIMIT 2`, request.Key)
		if err != nil {
			db.close()
			return nil, fail("MEDIA_READ_FAILED", "Cannot read VoiceInfo blob length")
		}
		lengths := make([]int64, 0, 2)
		for lengthRows.Next() {
			var dataLength sql.NullInt64
			if err := lengthRows.Scan(&dataLength); err != nil || !dataLength.Valid {
				_ = lengthRows.Close()
				db.close()
				return nil, fail("MEDIA_READ_FAILED", "Cannot read VoiceInfo blob length")
			}
			lengths = append(lengths, dataLength.Int64)
		}
		if err := lengthRows.Err(); err != nil {
			_ = lengthRows.Close()
			db.close()
			return nil, fail("MEDIA_READ_FAILED", "Cannot finish reading VoiceInfo blob length")
		}
		_ = lengthRows.Close()
		if len(lengths) == 0 {
			db.close()
			continue
		}
		if len(lengths) > 1 {
			db.close()
			return nil, fail("MEDIA_VOICE_AMBIGUOUS", "VoiceInfo key maps to multiple rows in one media database")
		}
		dataLength := lengths[0]
		if dataLength < 0 || dataLength > maxVoiceBlobBytes {
			db.close()
			return nil, fail("MEDIA_VOICE_TOO_LARGE", fmt.Sprintf("VoiceInfo blob exceeds %d bytes", maxVoiceBlobBytes))
		}
		var data []byte
		err = db.db.QueryRowContext(ctx, `SELECT voice_data FROM "VoiceInfo" WHERE CAST(svr_id AS TEXT)=? AND typeof(voice_data)='blob' AND voice_data IS NOT NULL LIMIT 1`, request.Key).Scan(&data)
		if err != nil || int64(len(data)) != dataLength {
			db.close()
			return nil, fail("MEDIA_READ_FAILED", "Cannot read VoiceInfo blob")
		}
		db.close()
		digest := sha256.Sum256(data)
		candidate := &voiceBlobResult{
			Status:                "ready",
			SourceKind:            "explicit-v4-voice-database-candidate",
			Complete:              false,
			NativeSchemaSupported: false,
			ThirdPartyCandidate:   true,
			Decoded:               false,
			MediaReady:            false,
			Key:                   request.Key,
			SourceDatabase:        file.relative,
			SourceTable:           "VoiceInfo",
			DataBytes:             int64(len(data)),
			SHA256:                hex.EncodeToString(digest[:]),
			Encoding:              "unknown-voice-data",
			Data:                  data,
		}
		if found != nil {
			return nil, fail("MEDIA_VOICE_AMBIGUOUS", "VoiceInfo key exists in multiple media databases")
		}
		found = candidate
	}
	if found == nil {
		return nil, fail("MEDIA_VOICE_NOT_FOUND", "VoiceInfo key was not found in the selected media databases")
	}
	if err := mediaProbeStable(files); err != nil {
		return nil, err
	}
	return found, nil
}
