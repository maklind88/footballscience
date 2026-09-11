# Tactical Frame Storage

Sessions owns this persistence boundary. Drawing, playback and library record
ownership remain unchanged.

## Contract

- The creation limit is still 24 frames. Existing longer sequences are retained.
- The editor keeps the full normalized object model in memory.
- `session-tactical-storage.mjs` omits only exact, established defaults from the
  saved representation. Existing readers restore them using the tactical helpers.
- Ids, order, coordinates (including zero and full precision), non-default styles,
  paths, player identity/photo links, coaching text and uploaded visuals remain.
- There is no new encoding, migration or runtime-only source of truth. The existing
  local cache, durable save journal, central save and recovery paths remain active.
- Only changed boards are compacted. Unchanged boards keep their previous stored
  representation, so a text edit cannot rewrite another date's frames.
- Cache normalization on read preserves compact data without queuing a save.
- These omitted defaults are a storage compatibility contract. A future change
  to tactical defaults must preserve decoding of existing compact records.
- Frame creation and growth checks measure the same compact representation that
  is persisted, with current coaching text rather than a stale editor snapshot.
- The 240 KiB creation budget and 256 KiB domain block limit are unchanged. Very
  large uploaded visuals, roster links or drawing paths can still reach the size
  limit before 24 frames; the existing warning must preserve all prior content.

## Regression Proof

The synthetic 64-object fixture in `qa/fixtures/session-tactical-capacity.mjs`
reproduces the reported boundary: 12 expanded frames fit (229,720 bytes), while
13 exceed the creation budget (247,350 bytes). The original controller refuses
frame 13 with the reported warning. The compact representation fits 24 frames
(171,936 bytes), without changing the normalized object model.

Checks cover all tool defaults and custom values, legacy compatibility, a domain
record round-trip, unchanged writes, concurrent coaching text, 12-to-24 creation,
reload, undo/redo, library save, print, read-only preview and presentation playback.

No live training is used as a test fixture or rewritten by this change.

## Validation Note (2026-09-11)

The frame, playback, marker, recovery and durable-storage browser suite passed
29 tests. Another 13 browser tests passed for central saves, two-tab stale-write
protection, reload, pending edits, view dates and read-only browsing. All 29
focused capacity, storage and runtime-state contract tests passed. Syntax and
architecture-budget checks also passed.

A broader API run also exposed two failures in unchanged Video Analysis code at
base `99c06420`: the module contract still expects the removed
`timeline.focus.renderer.js` file and an inline `data-video-analysis-prepare-playback`
attribute that has moved into `PlayerHeaderActions.js`. The user explicitly
approved correcting only these two tests as a release prerequisite. A separate
test-only commit checks the current clip-editor files and verifies the rendered
fallback action, without changing Video Analysis runtime code. All 37 focused
module-contract and clip-popup tests pass after that correction. The full release
gate still has to pass; no tests are skipped or bypassed.

After rebasing onto `f5cad1f4`, upstream already includes the mobile clip-popup
layout polling fix and the current player-component contract assertions. The
approved Code Mode browser test now waits for native fullscreen before opening
Settings: Code Mode's class changes before its asynchronous fullscreen/layout
update finishes. Escape is sent from the focused menu item, with assertions for
menu closure, trigger focus and retained Code Mode. No Video Analysis product
code is changed. This test passed 20 consecutive runs. The combined Sessions
storage/frame/recovery/playback/marker and Video Analysis header/clip-popup/module
contract regression passed all 123 tests. Production verification remains part
of the official Safe Lane release, not a claim from these local results.
