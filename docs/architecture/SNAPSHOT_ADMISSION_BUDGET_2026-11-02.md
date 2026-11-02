# Non-destructive snapshot admission budget — 2 November 2026

Owner: System / Security (shared storage reliability). Affected boundary: Platform
Shell's optional full-envelope history. Sessions recovery records remain owned by
Sessions. No module source data, central writes, auth, database migrations or recovery
resolution is changed. Implementation is isolated on
`codex/storage-growth-evidence-20261102`, following QA checkpoint `9a57ac370`.

## Why the original recommendation needed narrowing

The growth baseline is documented in
[SNAPSHOT_GROWTH_EVIDENCE_2026-11-02.md](SNAPSHOT_GROWTH_EVIDENCE_2026-11-02.md).
The proposed automatic retirement of verified replaceable snapshots cannot safely
be implemented from the currently exposed metadata alone:

- `platform-auth-boot.js` can mark a cached projection `serverBacked` after merging
  local UI fields; some paths preserve local media before a later write-back.
- `pendingCentralSync: false`, a short hash, global sync status or equality with
  this projected cache is not proof that every exact field in an envelope has a
  durable central counterpart for the same principal and generation.
- Existing historical envelopes have no versioned proof of eligibility. The old
  count-only pruning exempted the Sessions quota prefix but otherwise deleted old
  rows irrespective of pending/recovery metadata.

This candidate therefore **does not implement automatic retention/classification**.
It is an interim admission guard: stop additional full copies at a bounded budget,
retain everything already committed and expose the pause. That tradeoff is explicit:
when full, extra history stops advancing, including the latest history copy. Module
save paths and their journals continue independently. This is not a final continuous
backup solution and must not be described as completion of the all-module plan.

## Policy and measurement

Defaults in `src/core/snapshot-budget.mjs`:

| Limit | Value | Meaning |
| --- | ---: | --- |
| Individual copy | 16 MiB | Applies separately to incoming history and latest copy |
| Aggregate | 64 MiB | All existing snapshot-store rows plus incoming history and replacement latest |
| Ordinary count | 30 | Existing ordinary rows plus incoming row; Sessions quota-prefix rows exempt only from count |

Bytes are `JSON.stringify(row).length * 2`: logical serialized UTF-16, not measured
physical disk usage, browser quota, eviction protection or available memory. Sessions
fallback rows count toward aggregate bytes and are never deleted. Unknown and legacy
rows are counted without assigning them a new retention classification. An existing
store above either ceiling remains untouched and refuses further distinct copies.
Consecutive exact duplicates need no new space and still succeed at capacity.

The ceilings are provisional engineering defaults, not browser guarantees. The
observed affected-browser latest envelope was about 8.61 MiB in the earlier scan;
16 MiB admits a copy of that scale and 64 MiB prevents multiplication into thirty
such envelopes. A synthetic four-module envelope of about 8 MiB admits six history
copies plus latest, then stops below 64 MiB. The choice favors preservation over
history freshness; real usage should inform later tuning. localStorage has its own
separate limit and is not made larger by this guard.

## Transaction and preservation boundaries

Admission reads history through a cursor inside the same read/write transaction
as duplicate comparison, history insertion and latest replacement. Concurrent tabs
using this writer serialize their checks. No separate cleanup transaction and no
pre-deletion are used. The cursor stops early when a ceiling is exceeded; it does
not load the whole database into one array. A failed write aborts both inserts.

The candidate removes the unclassified history-pruning method. Before replacing a
latest copy with different contents, its matching history row must still exist;
an orphaned latest is retained and reported for recovery. An exactly matching new
copy can repair a missing history row if it fits. Existing ID collisions fail
without overwriting history. Comparison still includes ownership, pending metadata
and recovery contents; no short-hash substitution or metadata suppression.

The budget covers this writer's snapshots store and canonical latest copy. Other
journals/writers, already-open older application versions and browser-managed caches
can still grow. This is not a global origin quota enforcement mechanism. No DB schema
upgrade is required. Old code can still prune using its old rules, so mixed-version
behavior remains a release consideration, not a claimed solved guarantee.

Snapshot failure changes only `lastSnapshotError`; it does not acknowledge a module
save or advance `lastSnapshotAt`. The status shows `Local history needs attention`
when central/module errors or pending sync do not have higher priority. Pending sync
keeps priority and includes the history warning in its title. The warning never
recommends clearing storage or choosing a review version. An exact duplicate can
clear a prior snapshot warning because that exact envelope is already retained.

## Validation and limits

Targeted real IndexedDB browser tests cover individual/aggregate boundaries,
exact aggregate admission, two-tab contention, protected pending/review/unknown
records, orphaned latest, realistic larger synthetic envelopes, failure rollback,
retry, duplicate suppression and offline persistence across a closed browser profile.
Runtime coverage verifies module edits can still be queued while extra history is
refused, snapshot success timestamps do not advance, and warnings cannot acknowledge
Medical save failures. Sessions tests preserve 40 unknown legacy rows and the quota
recovery record when admission is refused.

The historical growth test now verifies non-destructive refusal at 30 rows. Its
original count-rotation measurements remain evidence for checkpoint `9a57ac370`;
those measurements must not be presented as the behavior of this candidate.

Offline restart tests load assets online before reading offline. Fault-injected
quota refusal is not physical disk exhaustion. No production user data is changed.
The isolated runtime test's synthetic central receipt is not proof of remote saving.

## Required follow-up

1. Define exact, scoped, generation-specific retirement evidence with each owning
   module. Do not infer it from existing `serverBacked` flags. Keep pending, review,
   unknown and legacy copies protected.
2. Implement atomic rotation only for newly proven eligible copies, including
   mixed-version behavior and repeated offline/online cycles. This is required for
   continuous history freshness once this interim admission budget is reached.
3. Validate user-device storage diagnostics and module-by-module acceptance
   separately. No promise that cache exhaustion or local review is eliminated.
4. Before any release, use the Safe Lane with direct user deployment authorization;
   verify required gates and production. No release is included in this checkpoint.

## Completed local checks

- 58 distinct browser cases passed: 29 Chromium and 29 WebKit across snapshot
  budget/growth, distinct snapshot, save-status and Sessions storage suites.
- 89 targeted API-contract cases passed for data-safety runtime/contracts and
  central runtime facade.
- `npm run check`, `npm run release:rules`, `npm run storage:guard`,
  `npm run architecture:budgets`, explicit syntax checks for the new modules/test,
  and `git diff --check` passed. Architecture reports existing oversized-module
  warnings outside this change; the guard passes.
- A new status test initially expected the history label while its fake transport
  still left the edit pending. The fixture now checks the priority of pending sync
  first, then supplies an explicit synthetic receipt to check the history label.
  Both engines pass; no product behavior was weakened to satisfy that expectation.

Local logs: `/private/tmp/snapshot-budget-{chromium,status-chromium,webkit,contracts,check,rules,storage,architecture}-20261102.log`.
Full release/staging/live checks were not run; this is an isolated implementation
candidate. No production completion percentage is assigned to the broader plan.
