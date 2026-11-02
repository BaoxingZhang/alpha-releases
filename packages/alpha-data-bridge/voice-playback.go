package main

// Synthetic-only voice playback mapping. This is deliberately separate from
// WeChat VoiceInfo/SILK schemas: it maps a caller supplied source media id to
// a caller supplied WAV media id that must be verified by the engine's own
// media-index.v1.json. No decoder or native media path is involved.

import (
	"context"
	"regexp"
)

const voicePlaybackTable = "__alpha_voice_playback_v1"

var voicePlaybackColumns = []string{"media_id", "wav_media_id"}
var voicePlaybackID = regexp.MustCompile(`^[0-9a-f]{64}$`)

func (b *bridge) voicePlayback(ctx context.Context, p params) (any, error) {
	if !voicePlaybackID.MatchString(p.MediaID) {
		return nil, fail("VOICE_PLAYBACK_REQUEST_INVALID", "Voice media id must be a canonical synthetic SHA-256 id")
	}
	var wav string
	found := 0
	for _, d := range b.messageDBs {
		if !d.tables[voicePlaybackTable] {
			continue
		}
		// Read both columns even though the WHERE clause already binds media_id.
		// The explicit identity check keeps a malformed view/table from being
		// treated as a valid mapping and documents the source-id invariant.
		rows, err := d.db.QueryContext(ctx, `SELECT media_id, wav_media_id FROM "`+voicePlaybackTable+`" WHERE media_id=? LIMIT 2`, p.MediaID)
		if err != nil {
			return nil, fail("VOICE_PLAYBACK_READ_FAILED", "Unable to read the synthetic voice playback mapping")
		}
		candidates := make([]string, 0, 2)
		for rows.Next() {
			var source, candidate string
			if err := rows.Scan(&source, &candidate); err != nil {
				rows.Close()
				return nil, fail("VOICE_PLAYBACK_READ_FAILED", "Unable to read the synthetic voice playback mapping")
			}
			if source != p.MediaID {
				rows.Close()
				return nil, fail("VOICE_PLAYBACK_SCHEMA_INVALID", "Synthetic voice playback mapping returned a different source media id")
			}
			if !voicePlaybackID.MatchString(candidate) {
				rows.Close()
				return nil, fail("VOICE_PLAYBACK_SCHEMA_INVALID", "Synthetic voice playback mapping contains an invalid WAV media id")
			}
			candidates = append(candidates, candidate)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, fail("VOICE_PLAYBACK_READ_FAILED", "Unable to read the synthetic voice playback mapping")
		}
		rows.Close()
		if len(candidates) > 1 {
			return nil, fail("VOICE_PLAYBACK_AMBIGUOUS", "Synthetic voice playback media id maps to multiple WAV objects")
		}
		if len(candidates) == 1 {
			found++
			wav = candidates[0]
		}
	}
	if found == 0 {
		return map[string]any{"status": "missing"}, nil
	}
	if found != 1 {
		return nil, fail("VOICE_PLAYBACK_AMBIGUOUS", "Synthetic voice playback media id maps to multiple WAV objects")
	}
	return map[string]any{"status": "ready", "mediaId": p.MediaID, "wavMediaId": wav, "sourceTable": voicePlaybackTable}, nil
}
