# Team Information text integrity

Task owner: Presentation Mode. Operating model: `distributed-specialist-v4`.
Base: `09e9ccbcc8758a3879f49bbea582e3d4c4a3a531` (`origin/main`, 2026-10-21).
This is a local candidate; no staging, main integration or production release is authorized.

## Confirmed failure

The isolated Chromium reproduction used the same controller/renderer bytes as Live at diagnosis time.
An input draft was not committed until blur. `render()` built a model from the previous saved text,
then replaced the root DOM. Chromium dispatched change/focusout during replacement: the draft could
be saved while the new DOM was still built from the older model. A subsequent unchanged blur then
saved the older text back over the user's newer text. Both information title and body were affected
in Team Meeting and Technical Staff Meeting.

The regression failed on the unmodified candidate base with `Original saved text` visible instead
of `New intentional text` immediately after refresh.

## Actual background paths

- `presentation-mode-controller.mjs`: `scheduleLeaderboardRefresh()` calls `render()` every 250 ms
  while any Leaderboard slide is loading, even when the user is editing an information slide.
- The same controller: `scheduleLocalMediaHydration()` calls `render()` in the asynchronous media
  resolution's `finally` callback.
- `central-sync-runtime-service.mjs`: `applyCentralSyncedStateValue()` applies the module's merged
  value and calls `handleSyncedStateValue()`. In `app-runtime.js`, the presentation storage-key handler
  calls `presentationModeController.render()`.

The browser tests exercise the real Leaderboard timer, deferred local-media resolution and real
central acknowledgement application service. The delayed network response and competing coach values
are controlled local fixtures; they are not writes to production accounts or data. This establishes
valid triggers, not which particular event happened in the user's original browser session.

## Scoped correction

- Keep the focused field's actual DOM node, selection and scroll position across same-record refreshes.
  Suppress change/focusout commits caused by the replacement itself. Other parts of the view still refresh.
- Bind edits to the original user scope, date, meeting type, slide and field, and commit at navigation,
  modal close and browser-unload boundaries. Input events only update recovery drafts.
- Commit only dirty fields whose saved base still matches, preserving independent field updates.
  Read back the local save rather than trusting a writer that can swallow storage exceptions.
- Retain the latest tab-local draft per field after local read-back; this is not treated as proof of a
  server acknowledgement. Preserve the existing draft key and legacy serialized entries.
- On conflicting or shortened/failed writes, preserve the draft and expose its complete copy with
  explicit `Use my draft` / `Keep saved text` actions. No older value is silently written back.
- On actual tab closure, commit ordinary edits locally first. If a draft remains outside the saved
  record, request the browser's leave decision because sessionStorage cannot outlive a closed tab.
- Explicit local deletion discards only its matching recovery copy after deletion is read back; remote deletions do not discard drafts.
- Warn if recovery storage fails. Do not evict other unsaved drafts to meet a count limit.

All implementation is inside Presentation Mode plus its existing presentation stylesheet import.
No changes to source modules, central sync, APIs, auth, database contracts or release tooling.

## Validation

`qa/presentation-text-integrity.smoke.spec.mjs` covers both meeting types, title/body, retained caret,
actual background callbacks, delayed acknowledgement, simultaneous edits, unchanged fields, independent
field merges, empty text, click/programmatic navigation, meeting/date separation, modal/tab closure,
immediate reload, swallowed local-write failures, recovery-storage failures, explicit conflict choices,
legacy drafts, user-scope separation, saved-field limits and contenteditable selection.

Also run the existing Presentation Mode renderer, interaction-policy, full presentation smoke,
local-media and reordering suites. Static checks: `npm run check`, `npm run storage:guard`,
`npm run architecture:budgets`, explicit syntax checks for the new module and `git diff --check`.

Recovery remains browser/tab-local, and abrupt browser/OS crashes or deliberate clearing of browser
storage are outside the guarantee. Authenticated production verification belongs to a separately
authorized Safe Lane release.

Final local result: 43 tests passed (21 new text-integrity browser cases plus 22 existing
Presentation Mode/interaction-policy cases). Full `npm run check`, storage guard, architecture
guard and diff whitespace check passed. Architecture guard reports existing oversized-module
warnings; the new editing module stays below 300 lines. Conflict recovery was visually inspected
in Chromium with the production stylesheets. No release commands or production writes were run.
