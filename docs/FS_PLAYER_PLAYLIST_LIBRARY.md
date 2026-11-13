# FS Player Playlist Library

Owner: FS Player / Video Analysis. This is a local candidate until the user explicitly authorizes a release in the owning chat.

## Product Contract

- The Analysis Room tab previously labeled Presentation is now **Playlists**. Its internal route remains `presentation` for compatibility.
- Timeline shows only original tag rows. CMD/Ctrl selection, clip timing, row order and live tagging keep their existing behavior.
- Saving a popup selection creates or updates a named playlist in Playlists. Order, timing, notes, tags and MG principles remain independent of original clips.
- Playlists includes existing popup lists and existing presentation records. Search, name/date/clip-count sorting and 50-item display pages support larger libraries.
- Clicking a popup playlist opens its saved membership in the existing video-first review popup. Pending selections in Timeline cannot add unrelated clips.
- Previous presentation records retain their existing builder and presenter flows. The global Presentation Mode module is not changed.
- All new interface text is English.

## Preservation

This is a navigation and read-path change, not a data migration. There is no automatic write, copy, archive or delete when opening Playlists.

Popup lists retain their existing `video_timelines` / manual row records, stable playlist keys, ordered clip references and `query.clipEdits`. Previous presentation records retain their IDs, sections, drawing layers and existing save contracts. No schema or permission change is required.

Discovery reads all accessible timeline and presentation pages within the API's existing offset boundary. Hidden popup rows and lists in non-active timelines remain discoverable. Failed reads retain the last loaded library and display an error rather than replacing it with an empty result.

Discovery and opening use the same metadata-read eligibility guard as the existing Video Analysis controllers, including local-static isolation.

Opening a saved popup list re-reads its exact parent timeline, fetches the source match when needed, and hydrates source clips without current Timeline filters. If any member is unavailable, opening fails closed with a visible message; there is no partial playlist save that drops missing members. Concurrent workspace changes also prevent replacement.

Timeline child reads page through memberships and rows so large saved collections are not silently truncated. Match and timeline lookup filters only narrow existing organization/team-scoped queries. Existing atomic save/revision checks remain in force. Source matches that are archived or inaccessible remain unavailable, but their library entries are not deleted.

## Verification

- `qa/video-analysis-playlist-library.api.spec.mjs`: read-only discovery, hidden and non-active lists, original-data preservation, search/order/pagination, unavailable-source protection, pending-work protection, paged loading and tenant-scoped complete membership reads.
- `qa/video-analysis-playlist-selection.smoke.spec.mjs`: save/reopen/reload from Playlists, independent edits, rename/copy, original isolation, older presentation access, 75 saved lists, another-match opening, focus return and video playback, desktop/mobile screenshots.
- Existing clip-popup/review/principles/playback suites continue to cover live tagging and editing behavior.
- Native playlist persistence tests cover the unchanged atomic storage contract with synthetic data only; they were not rerun for this read-path/UI candidate because local PostgreSQL binaries were unavailable.

Implementation baseline verification on 2026-11-12:

- `npm run check`, `npm run architecture:budgets`, and `git diff --check` passed.
- Video Analysis API contracts and Chromium smoke suites: 634 passed (487 contracts, 147 browser tests); 2 private-match-video tests skipped because the source file was unavailable.
- Saved-list playback was verified with generated video. Desktop and mobile library screenshots were inspected.
- Focus returns to the originating row or playlist and survives background repaint. No saved content was copied, deleted, or modified in production.

## Release

Safe Lane is required because read endpoints and saved-list opening changed. No deployment or live data write is authorized by the implementation request alone. Rollback can restore the old UI without data conversion because persisted formats are unchanged.
