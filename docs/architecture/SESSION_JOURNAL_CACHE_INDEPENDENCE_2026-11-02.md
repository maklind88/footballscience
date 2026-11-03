# Sessions journal replay with unavailable cache metadata

## Scope and decision

Task/release owner: System / Security, shared save/sync reliability. Affected
module owner: Sessions Planner, consumed through its existing public journal
contract. No Sessions source data, journal format, permissions, conflict policy,
API or database code is changed. Medical and other module writes keep their
existing mandatory metadata checks.

Candidate branch: `codex/session-journal-cache-independence-20261102`.
Base: `0470a74414d518bfd37b63c7e65a04db0eb3e18b` from `origin/main`.
This candidate excludes the earlier snapshot-budget and retention branches.
No staging, main integration or production release is part of this checkpoint.

The revised priority is reliable new work before further snapshot cleanup.
A hard history budget must not be presented as a fix for actual saving when
protected legacy copies already exceed it. No historical user copies are
removed, repaired or replayed by this work.

## Reproduced defect

The real Sessions editor commits an operation to its scoped IndexedDB journal,
then requests shared central replay with `sessionReplay: true`. The shared
queue previously rejected this request when `football-data-safety-v1` could
not be persisted in localStorage. The journal already contained the work,
but cache metadata prevented central delivery and could produce an inaccurate
not-saved-on-device warning.

The new full-app regression failed before the runtime change: zero server
writes applied, expected one. The fixture rejects the Sessions localStorage
cache, shared metadata and optional whole-app history while allowing the
independent journal transaction to commit.

## Smallest compatible correction

Only a non-deletion Sessions replay may proceed after metadata failure, and
only through the existing bridge capabilities. An asynchronous read verifies
pending committed journal work, unchanged owner/team scope and write access.
A newer memory-only working copy blocks this fallback. No pending journal,
unreadable journal, missing capabilities or changed permission/scope permits
transmission. Generic writes and deletions remain fail-closed.

The existing Sessions client sends its immutable operations and validates
receipts. Even a revision-race retry uses `sessionStaged: true`; it cannot
turn a cached whole calendar into a new write. Journal-only acknowledgements
do not require the failed metadata path or clear legacy pending entries.
Generation guards remain in place, and a newer volatile working copy cannot
be marked saved by an older receipt. Optional history still has its own
failure status. Existing review rows remain review rows.

This fallback is intentionally narrow. A conflicting legacy prepared-write
marker still blocks enqueueing. This work does not migrate legacy metadata
or make all shared saves independent of localStorage.

## Verification

- Before-change full-app regression: failed as expected, zero applied writes.
- After-change focused regression: passed.
- 214 shared central-sync and data-safety contract cases passed, including
  13 new cases for journal eligibility, permission/scope changes, absent or
  unreadable storage, unchanged generic writes/deletions, retry safety and
  newer volatile work during an earlier acknowledgement.
- 16 Chromium and 16 WebKit cases passed across full-app storage failure,
  two-editor offline editing, new-work visibility with reload/lost receipts,
  and working-copy recovery/export. All three new fault-injection cases
  passed in both browsers. An initial test assertion targeted the exercise
  title after changing the session title; it was corrected to exercise the
  same field on both sides before the complete passing runs.
- `npm run check`, `npm run release:rules`, `npm run storage:guard`,
  `npm run architecture:budgets`, explicit syntax checks for all changed JS
  and `git diff --check` passed.

The browser fixture uses actual editor/runtime code and real browser IndexedDB
with synthetic HTTP/auth and injected storage faults. It proves the tested
failure boundaries locally, not production permissions, production database
behavior or browser eviction resistance. The same-field peer conflict stays
in review; an independent peer edit is preserved alongside local work.

## Remaining acceptance and next work

| Surface | Evidence in this checkpoint | Still required |
| --- | --- | --- |
| Sessions | Committed journal can bypass unavailable shared cache metadata; generic safety remains | Release validation and deployed verification of this candidate; broader platform matrix remains open |
| Medical | Code inspection: localStorage-first saving plus an independent draft-recovery path | Establish durable pending-work semantics and accurate save/retry status without depending on cache; rescue copies alone are not automatic offline delivery |
| Library | Existing module-owned journal path observed during audit | Explicit module acceptance against the same matrix; not certified by this Sessions fix |
| Other modules | No new acceptance claim | Inventory actual save ownership and run module-specific reopen, offline/reconnect and concurrent-editor cases |

If journal storage and central saving both fail, browser memory is not durable.
Existing recovery/export checks must keep that visible rather than claim saved.
Origin eviction, manually cleared site data, a lost device and indefinitely
retained unsynced work cannot be solved by a cache-size threshold. They remain
explicit recovery/retention requirements, not guarantees from this change.

## Release attempt and deterministic fault precondition

The first authorized Safe Lane attempt passed local static/security checks and
4,374 tests (three configured skips). GitHub staging run 41569564320 stopped
before deployment: the new cache/history case timed out waiting for a history
write failure, after central application, journal acknowledgement and saved
status had already passed. All other CI jobs passed. Main remained unchanged.

The test enabled history failure only after app readiness. A successful startup
snapshot could therefore precede the fault, and exact-content deduplication could
legitimately avoid the later write the test expected. History failure is now
installed before startup and observed before editing; the manifest failure,
central write, committed-journal acknowledgement, saved status and reload
assertions remain. No product logic or release guard was changed. The six-case
suite passed five consecutive Chromium runs (30 cases) and all six WebKit cases.
