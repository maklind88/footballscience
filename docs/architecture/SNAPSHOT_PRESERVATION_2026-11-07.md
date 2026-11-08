# Snapshot preservation beyond 30 versions — 7 November 2026

Owner: System / Security, shared recovery storage.
Base: `d6adb92e9e3c2253b037267be300b7f49b216c07`.
Candidate branch: `codex/snapshot-preservation-20261107`.
Medical, Sessions and Library are consumers; their source data, permissions,
write/replay contracts and central APIs are unchanged. No user data, production
browser profile, historical cache or recovery row was cleaned up. This task is
implementation and local verification; no new release is authorized or claimed.

## Reproduced defects

The previous `pruneSnapshots` read only keys, retained the latest 30 ordinary
keys globally, and exempted the Sessions fallback prefix. It did not inspect
payload ownership, pending generations, recovery metadata or unknown formats.
Key selection and deletion also used separate transactions.

Native Chromium/WebKit tests against the real runtime reproduced both defects:

- One unique pending actor-A copy followed by 40 actor-B versions: the actor-A
  history row and its exact export were lost after rotation/reload. The current
  native value and separate Sessions pending journal remained intact.
- 45 distinct pending versions across two synthetic scopes: only 30 survived.
- A second real IndexedDB connection replaced selected old history with pending
  work between inspection and deletion; the previous implementation deleted it.
  This regression failed on unchanged base code in a separate baseline worktree.

These reproduce recovery-history loss in isolated synthetic profiles, not a
claim that any particular production user's records were lost. Scope transitions
in the runtime fixture are supplied explicitly, not through authenticated UI.

## Minimal correction

The runtime delegates rotation to `src/core/snapshot-retention-store.mjs`.
An ordinary automatic snapshot is eligible only when its recognized envelope,
scope, complete entry metadata and payload consistency are all known. Every
payload must have the same owner, explicitly non-pending/non-prepared status,
positive server revision beyond its pending base, valid generation/time metadata,
no deletion marker, and a matching existing content checksum.

This uses the existing manifest acknowledgement contract and checks its internal
consistency. A checksum alone never grants eligibility; this is not a new remote
receipt verification protocol or a general cache-eviction proof.

Pending, prepared, unknown, legacy, cross-owner, recovery-bearing, manual,
restore-related and future-format copies are retained. An absent payload with
deletion metadata is also retained. Current latest and remembered scope targets
are pinned. Selection and deletion run in one readwrite transaction covering
history and latest; another connection cannot mutate a selected row in a gap.

The newest 30 eligible ordinary historical snapshots remain subject to the
existing rotation policy. Protected rows do not consume those 30 places; pinned
older targets may increase the retained count. No retained row is rewritten,
retagged or treated as a newly acknowledged save. Latest, Sessions journals and
shared offline operations are not rewritten or deleted. No database upgrade,
migration, extra store or automatic historical repair is introduced.

Inspection uses a cursor and keeps only keys of eligible rows in memory. A scan
over 3,000 records or 100 MiB of estimated serialized UTF-16 data stops before
issuing any deletion. Failures abort the transaction; queued deletions roll back.
These limits favor preservation and may leave ordinary history above its target.

## Verification

- Initial two regressions: **4 expected failures before / 4 passes after**, across
  Chromium and WebKit.
- Expanded preservation checks: **58 passed**, covering 21 protected formats,
  continued rotation of acknowledged ordinary history, scope/latest pinning,
  exact export after reload, 45 pending versions, two real tabs, failed reads,
  aborted deletes and scan limits.
- Full snapshot/history/storage-health suite: **251 passed** (55.2s), including
  those 58 preservation checks and the existing deduplication, privacy, export,
  save-status and diagnostic coverage.
- Added deterministic replacement race: **2 expected failures on unchanged base**,
  **2 passes on candidate** (2.2s). It queues another connection at the first
  inspection response and checks the exact replacement survives a subsequent pass.
- Sessions journal, version-transition and database compatibility suites:
  **25 passed in Chromium** (7.1s), **25 passed in WebKit** (17.0s).
- Total distinct scoped checks: **303 passed**, zero failed/skipped on candidate.
- `npm run qa:static`, including check/security/storage/architecture gates: passed.
  New module and final test syntax checks and `git diff --check`: passed.
- `origin/main` was fetched again after verification and remained at the base SHA.

The existing Sessions pruning test now supplies complete acknowledged snapshot
fixtures instead of ID-only shells. Its assertion remains three ordinary history
rows plus the protected fallback; queued frames, cross-scope isolation and the
pending journal assertions remain unchanged. Unknown snapshots now have their
own explicit preservation coverage rather than being treated as disposable.

Logs: `/private/tmp/snapshot-preservation-before-20261107.log`,
`/private/tmp/snapshot-preservation-full-20261107.log`,
`/private/tmp/snapshot-preservation-race-before-20261107.log`,
`/private/tmp/snapshot-preservation-race-20261107.log`,
`/private/tmp/snapshot-preservation-journal-chromium-20261107.log`,
`/private/tmp/snapshot-preservation-journal-webkit-20261107.log`,
`/private/tmp/snapshot-preservation-static-20261107.log`.

## Limits and release considerations

This fixes preservation in the updated implementation. An already-loaded older
tab still contains the old pruning code and can still rotate these same rows.
Unchanged database compatibility is not protection against an older destructive
writer. Release planning must account for old tabs; do not force reload an unsaved
editor or claim mixed-version protection from these tests.

Protected history can grow beyond 30, and pending metadata on a historical copy
does not become safe merely because a later edit was acknowledged. A future
bounded-retention policy needs explicit proof of safe supersession/recoverability.
No automatic acknowledgement, hidden cleanup or new byte quota is added here.
Existing pressure diagnostics and write failures remain in force.

The test suite does not certify cold offline application startup, browser-driven
eviction, real multi-user server traffic or all modules' durability. A future
release must follow Safe Lane and verify the served module and production checks.
