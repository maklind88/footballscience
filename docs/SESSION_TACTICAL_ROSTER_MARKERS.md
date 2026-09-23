# Session Tactical Roster Markers

## Scope

Sessions/Exercise Board owns this feature. Squad remains the source of player identity; its existing authorized profile projection is read without adding network calls, changing roster records, or reading clinical data. Presentation Mode and coach sheets consume the shared visual renderer. IDP and Set Pieces do not gain a new assignment workflow.

Select a player marker in the editor to reveal the Player inspector. Find/select a Squad player and choose Label, Initials or Photo. Initials are the default for linked players. The Number / position field accepts a custom label of up to four ASCII letters/digits, such as 1, 12, CB, RW or LCB. Enter or leaving the field commits it; an unchanged value does not save. Label uses the existing persisted `number` display mode and `playerNumber` field. Generic markers need no Squad link to use labels. Existing keyboard badges, drawing tools and frame controls remain available. Multiple selected markers can change label or display mode together. Choosing Generic player unlinks a marker, preserving its current number.

## Persisted Fields

Only player marker types may carry these optional additive fields:

```json
{
  "playerIdentity": {
    "squadPlayerId": "canonical-squad-player-id",
    "name": "Alice Smith",
    "initials": "AS",
    "number": "9",
    "photoUrl": "https://approved-profile-image-url"
  },
  "playerDisplay": "initials"
}
```

- The tactical `id`, not the Squad id, remains animation identity. Several independent markers may reference one player.
- Assignment/display/custom-label changes affect that marker id wherever it already exists in this block's frames, including generic markers. They never recreate absent markers or change geometry, team colour, or other blocks.
- The current-frame compatibility mirror and frames pass through the existing guarded persistence transaction, field timestamps and history. No new storage key, API, sync path or migration is introduced.
- The bounded identity snapshot records the coach's choice. Rendering does not silently replace old names/numbers or save after Squad changes. Re-select a player to explicitly refresh the saved display values. Missing roster entries remain readable and can be unlinked/replaced.
- Clone/normalize, library copies, clipboard and board history preserve independent snapshots. Generic legacy markers gain no identity fields.

## Safety And Display

- Identity snapshots allow only id (160 characters), name (100), initials (6), number (2) and an HTTPS photo URL (2048). Private profile fields are not copied.
- Initials reuse Player Board's disambiguation rules. Temporary eligibility uses Squad's public selected-date helper; this picker does not redefine Medical clearance.
- Inline images, credentials in URLs, non-HTTPS URLs and local file URLs are excluded. The fallback is initials, including for unavailable or failed photos. Legacy inline Squad photos are not duplicated into every frame.
- Label/Initials/Photo share the existing player marker dimensions in each surface. Photos are clipped inside the team-coloured marker; changing display never enlarges it. Label text fits within that footprint. The editor retains its existing touch sizing; read-only playback retains canonical pitch scaling and print retains existing print size adjustments.
- Frame creation and growing board edits check a 240 KiB payload budget below the existing server limit. An oversized assignment is refused with a visible warning before saved content is changed. Existing longer sequences can still be read and reduced; no silent truncation is allowed.
- The animation engine retains native coordinate interpolation. Rendering only replaces a segment at frame boundaries, not each animation tick. Browsers reuse normal HTTPS image caching.
- No assignment controls exist in read-only previews/presentations. Both the inspector and existing frame persistence enforce edit permission. Search/selection/playback are not saves.
- Read-only frames reconcile the saved active-frame element mirror exactly as the editor does before choosing frame one. This preserves older drawings with stale frame snapshots without writing a migration or filling deliberately empty non-active frames.

## Verification

`qa/session-planner-tactical-roster.api.spec.mjs` covers normalization, safe URLs, privacy, duplicate initials, temporary dates, frame identity, no-op/stale writes, read-only permissions and library cloning.

`qa/session-planner-tactical-roster.smoke.spec.mjs` covers actual assignment, display choices, badge keyboard input, clipboard, undo, unlink, reload, marker size against generic markers, mobile/desktop layout, image loading/fallback, preview, print and Presentation playback without writes.

The frame-capacity API/browser suites additionally cover custom numbers/positions, unchanged-value input, all-frame consistency, oversized roster assignments and 24-frame persistence. Current candidate validation and rollback restrictions are recorded in `docs/SESSION_PLANNER_FRAME_PLAYBACK.md`.

Release classification: Safe Lane because optional persisted exercise data is added. No production release without a direct user command.

### Local Validation, 2026-09-08

- `npm run check` and `git diff --check`: passed.
- `npm run qa`: all static gates passed; browser/contract run finished with 2635 passed, 1 skipped and 2 failures. One was the Sessions navigation harness missing DOM `addEventListener` (mock updated); the other was Playwright tracing teardown (`Tracing is already stopping`), not a failed sync assertion.
- Final focused regression: 82 passed, including both formerly failing tests, all new roster tests, first-frame stills, editor/readonly playback and central revision protection.
- The unchanged central revision test then passed three additional isolated repetitions. No central sync production code was changed.
- Desktop (1470px) and mobile (390px) screenshots inspected. Marker footprint, initial-label fit, photo loading/fallback, library persistence, selected-player bulk mode and a 26-player/12-frame server projection round-trip are covered.
- No production deployment or authenticated Live write test was performed for this candidate.
