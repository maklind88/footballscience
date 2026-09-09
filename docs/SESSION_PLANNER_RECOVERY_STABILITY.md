# Session Planner Recovery Stability

Candidate prepared 2026-09-08 from `origin/main` at `f4b36bf7`.
Owner: Sessions. Shared boundary: Sessions-specific central reload wiring.
Risk: Safe Lane (local persistence, recovery and central-state consumption).
Status: user-authorized Safe Lane release in progress; no production release yet.

## Problem and scope

The previous background recovery path scanned historical IndexedDB snapshots after
central reloads. A larger historical snapshot could reintroduce old content. Its
asynchronous completion could also replace a newer UI selection or state object.
Central reload preserved the selected day only if that day existed in incoming
Sessions data, so browsing an empty day could jump to another date.

This change does not modify the server API, database schema, authentication,
permissions, merge field contracts, frame format, or another module's writes.
It does not repair or restore existing production content.

## Recovery contract

- Central content remains authoritative. Background recovery never scans or
  promotes historical or legacy unscoped backups. Existing snapshots are retained.
- New quota-fallback snapshots use an IndexedDB ID scoped to user, organization,
  club and team, and record the central revision at the time of the local write.
  These are identifiers only, not credentials or authentication tokens.
- A signed-in editor may automatically recover a scoped pending snapshot only
  after hydration and against the same central revision. Equal timestamps favor
  the current content; explicit deletion tombstones still apply.
- A newer central revision with differing local content produces
  `Local changes need review`. The local snapshot stays intact; nothing is silently
  replayed. Already-acknowledged content is a no-op even if its revision advanced.
- Recovery rechecks user/team/revision, hydration, current state, storage content,
  pending writes, active editing and overlays after the asynchronous read. An
  interrupted read does not mark that context complete and can retry on a later
  reload. A failed write retains the prior in-memory view and the snapshot.
- Quota writes still wait for the IndexedDB transaction to complete before
  enqueueing central sync. If the actor/team changes meanwhile, the snapshot stays
  local and is not queued under the new scope. Rapid writes retain the latest edit.
- Missing, unreadable or corrupt local storage can use the central in-memory cache;
  this is not treated as an empty server session.

## UI stability

- Central reload retains the current selected date, including empty dates, even
  while another workspace is active. It retains the selected block only if that
  block still exists. It does not copy content to the empty date or resurrect blocks.
- Identical acknowledged metadata, user and Sessions selection do not rebuild the
  current Sessions DOM. A changed dependency revision or user still refreshes it.
  Other workspaces and reloads without revision metadata keep existing behavior.
- Browsing, playback and read-only views do not acquire new save behavior.
  All 24 frames, custom marker labels, roster identity and Player Board placement
  continue using their existing persisted contracts.

## Validation

Local synthetic data only, no production writes or user-browser cache changes:

- `npm run check`: passed.
- `npm run qa:static`: passed, including isolation, release/security rules,
  storage, migrations, performance and architecture guards.
- `git diff --check` and syntax check of the new recovery controller: passed.
- 271 targeted API/contract tests: passed. Filter:
  `(session-planner|session-player|central-|data-safety-|workspace-runtime-composer).*\.api\.spec\.mjs`.
  Used the repository Playwright configuration with the web server disabled and
  a separate output directory for contract-only tests.
- 59 Chromium tests: passed on an isolated local QA server (port 4296), using
  `session-planner-recovery-stability`, `session-planner-frame-capacity`,
  `session-planner-tactical-playback`, `session-planner-readonly-playback`,
  `session-planner-tactical-roster` and `central-state-revision` smoke specs.
  Includes desktop/mobile day selection, real IndexedDB history exclusion,
  quota saving, save/reload, 24 frames, labels, preview, Presentation and print.
- New deterministic tests reproduce late recovery after navigation/editing,
  scope changes, newer revisions, deletion, fallback failure/retry and durable
  quota write followed by recovery in a fresh runtime.

The existing quota browser test now verifies the scoped ID, organization and
baseline revision rather than looking up the legacy unscoped ID. Its central
write and durability assertions remain in place.

Static QA reports existing module-size warnings and absent live/staging QA login
environment in this isolated worktree. Authenticated release checks run in GitHub.

### Release validation follow-up

- Full local QA passed twice: 2,868 passed, 3 existing fixture-dependent skips.
  The isolated installation first needed `npm rebuild ffmpeg-static` to install
  its already-locked executable; no dependency or package changes were made.
- Staging run `34296418760` stopped before deployment. API/static checks and
  browser shards 1/2 passed. Two Sessions Presentation tests used 8 September
  fixture data but opened today's presentation after UTC midnight on 9 September.
  Both failures were reproduced locally with `TZ=UTC`.
- Those two fixture helpers now fix the browser date to the fixture date only for
  Presentation. Playback timers still run. No production code, assertion, timeout,
  or test coverage was weakened to fix this setup mismatch.
- An unchanged standalone Video Analysis spatial-workbench test also timed out in
  staging. Its code is outside this candidate. Three local UTC repetitions of both
  affected Sessions specs and the unchanged Video spec passed: 33 tests total.
  A new full Safe Lane run must still pass, including staging and production gates.

## Release and recovery cautions

Before release, fetch/rebase the isolated candidate on the current main, repeat
the relevant regression checks, and run the official Safe Lane after direct user
authorization. Verify production saving/reload and selected-day stability.

Legacy backups and revision-mismatched pending snapshots need an explicit scoped
comparison before any recovery. This change does not add a new conflict-review UI
or automate recovery of ambiguous historical data. Do not clear browser storage,
purge backups, or bypass this check to remove a warning.

Rolling back the runtime to a version that scans all snapshots restores the original
automatic-recovery risk. Prefer a focused forward fix retaining the recovery guard;
do not perform an automatic application-data rollback as part of code rollback.
