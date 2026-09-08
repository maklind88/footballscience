# Exercise Board Frame Playback

## Scope

Session Planner's Exercise Board can animate player, ball, and equipment positions between frames. This is browser playback, not an exported video file. The same engine serves the read-only Exercise Visual Preview and block slides in Presentation Mode. Player Board formations and printed coach sheets are unchanged.

## Workflow

- Open Exercise Board **Edit** and arrange the first frame.
- **Next frame** copies the current frame immediately after it, retaining object IDs.
- Move the same objects to their next positions. Earlier frames remain independent.
- Play/pause, restart, loop, speed, and the scrubber control a read-only preview.
- Stop or select a numbered frame to return to editing. Deleting a frame requires confirmation; at least one frame remains.

New sequences support up to 24 frames. The frame strip stays one row high, scrolls to the active frame, and provides a direct frame selector. Reading, normalizing, copying, or editing an existing longer sequence never truncates its frames; only creating an additional frame is capped.

Before duplicating a frame, its projected block payload must fit within 240 KiB, leaving headroom under the existing 256 KiB server block limit. Growing board edits, including roster assignments across all frames, use the same budget. Oversized additions are refused with a visible warning and no saved changes; reducing an existing larger board remains allowed. This is not an increase in backend payload limits or a guarantee that later large image/text edits will fit. 60 frames with 26 photo-linked markers exceeded the server budget in validation, so that higher creation limit is deliberately deferred pending a separately reviewed storage design.

A transition takes 1.5 seconds at 1x speed. Loop holds the final frame briefly, then restarts without inventing a return movement. New, removed, or type-changed objects change at frame boundaries. Drawn lines/zones are frame snapshots; custom movement paths, per-frame timing, and MP4/GIF export are outside this version.

## Read-Only Viewing

- Preview and Presentation Mode always open on the first saved frame, regardless of the editor's last selected frame or compatibility mirror.
- The Session Planner overview and coach sheet use the same first-frame projection for still images. An empty first frame stays empty; legacy boards without frames keep their existing image and objects. Editing and animation retain their own current-frame views.
- A compact transport row below the pitch provides play/pause, back to start, stop, loop, seek and speed. Single-frame and legacy boards have no inactive transport bar.
- Stop returns to the first frame. Pausing holds the current position. Back to start preserves the playing/paused state.
- Neither surface offers object/frame editing. The existing Presentation Mode text/deck tools retain their separate behavior; they cannot edit the exercise board.
- Native keyboard controls do not activate slide navigation. Space on the viewing area toggles playback; presentation arrows and Escape keep their existing navigation behavior outside the transport controls.
- Equivalent background renders/fullscreen changes preserve the current playback node and focus. A different date/block or changed visual content invalidates playback. Closing or hiding the view stops it.

The read-only renderer projects visual fields only. Its lifecycle adapter clones that projection and passes it to the existing playback engine with no write callback. Static and animated boards share uniform scaling, uploaded-image geometry and pitch mode. The controls stay outside the pitch and compact on narrow surfaces.

Session Planner explicitly opts into the enhanced preview through its runtime renderer adapter. Other consumers of the shared visual renderer, including IDP, keep the existing static preview and modal layout until their own controller supports playback.

## Data And Safety

`session-planner-tactical-frames-controller.mjs` owns an isolated editor view. Selecting frames never changes persisted `tacticalActiveFrameId` or the `tacticalElements` compatibility mirror. Only real edits/additions/deletions enter the existing save pipeline. Frame content, active ID, and compatibility mirror retain a common field timestamp, preserving the existing merge contract.

Legacy single-image boards acquire a first frame only on an actual edit. No migration, new storage key, API endpoint, or independent write pipeline is introduced. The existing exercise-library normalization, central revision checks, permissions, and board undo/redo remain responsible for their existing boundaries. This does not introduce collaborative editing of the same frame or resolve unseen server conflicts independently of central sync.

Changed source content/date/block invalidates stale editor drafts. Destructive confirmation rechecks the current frame and edit permission. Playback clones the editor view and has no persistence callback. Transient animation positions, speed, loop, and scrub position never enter saved data. Equivalent background renders retain the playback overlay; changed board content or permissions stop it.

Native Web Animations interpolate marker coordinates. The entire rendered board is scaled uniformly to fit playback, preserving pitch and marker proportions. Editing retains its existing dimensions and scroll position. Reduced-motion users see frame steps. Leaving the workspace or hiding the tab stops playback and releases animations/observers. Editor shortcuts and tools cannot alter the hidden source during playback.

## Validation And Release

Focused coverage lives in:

- `qa/session-planner-tactical-playback-contract.api.spec.mjs`
- `qa/session-planner-tactical-playback.smoke.spec.mjs`
- `qa/session-planner-readonly-playback.api.spec.mjs`
- `qa/session-planner-readonly-playback.smoke.spec.mjs`
- `qa/session-planner-frame-capacity.api.spec.mjs`
- `qa/session-planner-frame-capacity.smoke.spec.mjs`
- Existing Presentation Mode renderer, end-to-end and responsive/theme matrix tests.
- Existing Sessions/IDP contracts and Session Planner critical-flow smoke tests.

Checks include no-op/browsing writes, legacy compatibility, identity retention, independent frames, stale source rejection, permission checks, frame limits/deletion, reload, undo/redo, read-only playback, loop/pause, all pitch modes, small-screen fit, and reduced motion.

Candidate implementation only; not a production verification record. Release requires the user's explicit Deploy/Live instruction. Use Safe Lane because the edit-to-save boundary changed, even though the persisted schema and backend remain unchanged. Before production, verify authenticated saving/reloading and conflict handling through the existing release gates. Existing open editor tabs must load the new client before working with longer sequences: older normalizers cap reads at 12 frames. Any rollback must retain non-truncating frame normalization; reverting that reader after coaches save longer sequences risks losing their later frames. The stored fields themselves retain the prior format.

### Frame Capacity Candidate, 2026-09-08

- Isolated branch: `codex/session-frame-capacity-labels-20260908`, based on `af7ec247`.
- All Sessions API/contract tests plus Exercise Library/IDP module contracts: 232 passed.
- Frames, roster markers, editor/readonly playback browser regression: 37 passed.
- Sessions critical flows and mocked central revision/storage-quota/two-tab checks: 11 passed.
- `npm run check`, `git diff --check`, architecture guard and performance budget check passed. Existing global CSS and file-size advisory warnings remain outside this change.
- Coverage includes 24-frame saving/reload/library copies, preservation of existing 30/60-frame sequences, four-character labels across frames, unchanged-value/no-browsing writes, clipboard/undo, first-frame stills, photo fallback, desktop/mobile layout, and refusal of oversized changes without saved-data mutation.
- Fixed an existing Sessions callback wiring gap exposed by the size-limit browser test: board warnings now use the module-owned toast controller directly. This does not change central synchronization or authentication.
- These are local tests, including mocked network responses. No production deploy or authenticated Live saving verification was performed for this candidate. The separately reported platform auth/central-sync incident remains with System/Security.
