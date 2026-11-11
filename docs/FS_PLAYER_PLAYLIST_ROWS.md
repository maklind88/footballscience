# FS Player Playlist Rows

Owner: FS Player / Video Analysis. Release status is reported separately by the owning task after production verification.

## Product Contract

- CMD/Ctrl-click adds or removes timeline rows or individual clips from one selection.
- Double-clicking a selected item opens the complete selection, deduplicated by source clip ID.
- The review playlist is a separate band below the video, outside the playback form.
- Clip order is independent of match time. Drag or Alt+Left/Right changes playlist order.
- Editing in the popup changes only that playlist's clip version. It must never call `save-clip`.
- Removing an item from the popup removes its playlist reference, never the source clip.
- Save playlist persists a named row in the current match Timeline. Copy playlist creates a separate draft; changing the name and saving renames the existing row.
- A saved row reopens with its own order, clip timing, tags, notes and MG principles. Original source rows retain their original timing and metadata.

## Saving Interaction

- Save playlist in the clip editor, MG principles popup and playlist band uses the same persistence action. There is no intermediate Apply step or second required save.
- Saving includes every pending clip draft and the playlist's current order and name. Every draft is validated before any local clip version is replaced.
- The editor stays open on failure, retaining the edited values and a visible error. A successful, verified save returns to the same video position.
- Pending saves disable editing and reject duplicate submissions. Saved appears only after the existing server-response verification succeeds.
- Header and playlist band share the same status: Not saved, Unsaved, Saving..., or Saved.
- Closing changed work offers Keep editing, Discard, or Save and close. Save and close leaves the popup open if validation or persistence fails.
- A copied playlist remains unsaved even when its name and contents match the saved source playlist.
- No autosave, source-clip write, new persistence contract or migration is introduced.

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

The previously diagnosed original-clip relation-save defect is separate. A local PostgreSQL diagnostic on 2026-11-11 reproduced `save-clip` attempting a hard delete of clip labels, rejected by the archive-only trigger after timing/revision had already changed. Archive and restore passed in the same diagnostic. This feature does not change that API or its database rules, and passing diagnostic tests confirm the defect rather than resolving it. Playlist persistence uses the separate atomic timeline RPC.

### Local Candidate Verification, 2026-11-11

- Base: `92fdbf47a8347e8633267fa7b96ec40fb33c6e07` (`origin/main` and `origin/staging` when inspected).
- Isolated branch: `codex/fs-player-playlist-reliability-20261111`. Unrelated root-worktree changes were left untouched.
- `npm run check`, syntax checks of all four changed product files, and `git diff --check`: passed.
- Chromium: 94 passed across playlist selection, clip popup, clip review, MG principles, actual-video preview, playback, tag feedback and timeline row ordering. Screenshots and video-pixel checks cover desktop and mobile; no CSS/layout or tagging implementation changes.
- API contracts: 28 passed across playlist selection, clip popup, clip review and tag feedback.
- Native PostgreSQL: playlist persistence tests passed against committed migrations with synthetic data, including source-record isolation, ordered overrides, conflict rollback and team scoping. The separate original-clip diagnostic reproduced the known defect described above.
- No production writes, migration, staging deploy, main integration or production deploy. A later release must use Safe Lane because the save interaction changes, despite reusing the existing persistence contract.
