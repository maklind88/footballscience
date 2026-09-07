# Exercise Board Frame Playback

## Scope

Session Planner's Exercise Board can animate player, ball, and equipment positions between frames. This is browser playback, not an exported video file. Player Board formations, printed coach sheets, and other modules are unchanged.

## Workflow

- Open Exercise Board **Edit** and arrange the first frame.
- **Next frame** copies the current frame immediately after it, retaining object IDs.
- Move the same objects to their next positions. Earlier frames remain independent.
- Play/pause, restart, loop, speed, and the scrubber control a read-only preview.
- Stop or select a numbered frame to return to editing. Deleting a frame requires confirmation; at least one frame remains.

Frames use the existing limit (12). A transition takes 1.5 seconds at 1x speed. Loop holds the final frame briefly, then restarts without inventing a return movement. New, removed, or type-changed objects change at frame boundaries. Drawn lines/zones are frame snapshots; custom movement paths, per-frame timing, and MP4/GIF export are outside this version.

## Data And Safety

`session-planner-tactical-frames-controller.mjs` owns an isolated editor view. Selecting frames never changes persisted `tacticalActiveFrameId` or the `tacticalElements` compatibility mirror. Only real edits/additions/deletions enter the existing save pipeline. Frame content, active ID, and compatibility mirror retain a common field timestamp, preserving the existing merge contract.

Legacy single-image boards acquire a first frame only on an actual edit. No migration, new storage key, API endpoint, or independent write pipeline is introduced. The existing exercise-library normalization, central revision checks, permissions, and board undo/redo remain responsible for their existing boundaries. This does not introduce collaborative editing of the same frame or resolve unseen server conflicts independently of central sync.

Changed source content/date/block invalidates stale editor drafts. Destructive confirmation rechecks the current frame and edit permission. Playback clones the editor view and has no persistence callback. Transient animation positions, speed, loop, and scrub position never enter saved data. Equivalent background renders retain the playback overlay; changed board content or permissions stop it.

Native Web Animations interpolate marker coordinates. The entire rendered board is scaled uniformly to fit playback, preserving pitch and marker proportions. Editing retains its existing dimensions and scroll position. Reduced-motion users see frame steps. Leaving the workspace or hiding the tab stops playback and releases animations/observers. Editor shortcuts and tools cannot alter the hidden source during playback.

## Validation And Release

Focused coverage lives in:

- `qa/session-planner-tactical-playback-contract.api.spec.mjs`
- `qa/session-planner-tactical-playback.smoke.spec.mjs`
- Existing Sessions/IDP contracts and Session Planner critical-flow smoke tests.

Checks include no-op/browsing writes, legacy compatibility, identity retention, independent frames, stale source rejection, permission checks, frame limits/deletion, reload, undo/redo, read-only playback, loop/pause, all pitch modes, small-screen fit, and reduced motion.

Candidate implementation only; not a production verification record. Release requires the user's explicit Deploy/Live instruction. Use Safe Lane because the edit-to-save boundary changed, even though the persisted schema and backend remain unchanged. Before production, verify authenticated saving/reloading and conflict handling through the existing release gates. Rollback the isolated feature commit; existing saved frame records remain compatible with the prior format.
