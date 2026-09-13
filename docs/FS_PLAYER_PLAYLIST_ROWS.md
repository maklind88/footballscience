# FS Player Playlist Rows

Owner: FS Player / Video Analysis. Release status is reported separately by the owning task after production verification.

## Product Contract

- CMD/Ctrl-click adds or removes timeline rows or individual clips from one selection.
- Double-clicking a selected item opens the complete selection, deduplicated by source clip ID.
- The review playlist is a separate band below the video, outside the playback form.
- Clip order is independent of match time. Drag or Alt+Left/Right changes playlist order.
- Applying edits in the popup changes only that playlist's clip version. It must never call `save-clip`.
- Removing an item from the popup removes its playlist reference, never the source clip.
- Save playlist persists a named row in the current match Timeline. New playlist creates a separate copy; changing the name and saving renames the existing row.
- A saved row reopens with its own order, clip timing, tags, notes and MG principles. Original source rows retain their original timing and metadata.

## Persistence

Reuse `timelineWorkspaceRepository.save` and the existing atomic `video_analysis_save_timeline` RPC. No new tables, migrations, clip duplication, or browser-only persistence.

Playlist rows use `kind: manual`, ordered `clipIds`, and the existing query JSON contract:

```json
{
  "source": "fs-player-playlist",
  "playlistKey": "stable-client-generated-key",
  "clipEdits": {
    "source-clip-id": {
      "startMs": 1000,
      "endMs": 2500,
      "phase": "Out of Possession",
      "subPhase": "High Press",
      "outcome": "Neutral",
      "tags": ["review"],
      "note": "Playlist-specific note",
      "miniGamePrincipleIds": ["trigger"]
    }
  }
}
```

Only allowlisted fields enter clip overrides; IDs, permissions, source media and ownership cannot be overridden. Other saved rows and settings are preserved. Writes require the current match, edit permission, a loaded timeline, no unrelated pending timeline edits, and the expected revision. A conflict leaves the popup draft intact. Saved status requires a verified server response, including ordered membership and overrides.

## Verification

- `qa/video-analysis-playlist-selection.api.spec.mjs`: selection, isolation, payloads, revisions, context and permission guards.
- `qa/video-analysis-playlist-selection.smoke.spec.mjs`: CMD selection, drag/keyboard ordering, independent edits, save/rename/copy, failures, desktop/mobile and real video pixels.
- `qa/video-analysis-playlist-persistence.test.mjs`: existing RPC against a synthetic local PostgreSQL database using committed migrations; verifies original records remain byte-for-byte unchanged, ordering/overrides round-trip, conflicts roll back, and team scope is enforced.

The previously diagnosed original-clip relation-save defect is separate. This feature does not change that API or its database rules.
