# Save/sync growth and bounded exact-copy reuse — 8 November 2026

Owner: System / Security, shared recovery storage. Medical, Sessions and other
modules consume this contract; their data ownership, APIs, permissions, writes,
receipt handling and replay rules are unchanged.

Base: `00ab0d8d0610edb5732e59dde15a13fbc6b61a92`.
Candidate branch: `codex/save-sync-growth-20261108`.
This is implementation and scoped local verification, not a deployment.
No user database, browser profile, cache or historical record was cleaned up.

## Evidence before changing production code

The new browser fixture exercises the actual `createDataSafetyRuntimeService`
and `createCentralSyncRuntimeService` with native localStorage and IndexedDB.
It follows edits, persisted pending metadata, backup capture, failed sends,
retries, successful responses and subsequent capture. Timers and server replies
are controlled explicitly. Scope restoration is synthetic, not an authenticated
account-switch test. This does not test real Supabase/API transport, server
conflict resolution or production multi-user activity.

Both Chromium and WebKit reproduced the following on unchanged base code:

1. **40 distinct edit/offline/retry/receipt cycles:** 40 pending historical
   versions remained recoverable alongside 30 ordinary acknowledged copies.
   Repeated unchanged capture and offline retries added no duplicate history.
   Estimated serialized history grew to about 4.70 MB for 32 KiB payloads.
   The pending originals did not become disposable merely because later state
   was acknowledged. This growth was retained intentionally.
2. **12 unchanged scopes, five return cycles:** the history grew from 12 rows
   (about 0.814 MB) to 72 rows (about 4.884 MB). Each scope had a centrally
   acknowledged primary value plus a separate pending note. All original rows
   survived, but the same content and recovery metadata were copied repeatedly.
   The bounded eight-scope hint list evicted the next revisited scope each time.

Before the fix: two baseline tests passed and the two scope-growth regressions
failed (one per browser). Counts and estimated bytes are logged; these are
serialized UTF-16 estimates, not measured physical disk allocation or quota.

## Minimal change

Only `src/core/distinct-snapshot-store.mjs` changes production behavior.
When the eight-entry hint window is full and lacks the incoming nonempty scope,
the existing readwrite transaction searches recent history for an exact match.
It checks the actual row, primary key, scope, complete payload, generation,
receipt, recovery fields and unknown metadata through the existing exact-content
comparison. A checksum, hint or later receipt alone never permits reuse.

The exceptional lookup examines at most 32 rows and stops once its accumulated
serialized UTF-16 estimate exceeds 8 MiB. These are local lookup-work budgets,
not a maximum history size. One oversized row must be decoded to measure it;
this is not a hard peak-memory or execution-time guarantee. Exhausting either
budget appends the new copy normally. A read/write failure aborts the transaction
and reports failure. No concurrent writer can change a candidate between its
verification and the latest-pointer update.

Reusing an exact stored copy updates only the existing latest row and hints.
No existing history row is deleted, rewritten or reclassified by the new code.
Missing or invalid referenced rows retain the previous conservative append path.
No database version, schema, export format, pending flag or central receipt
contract changes. Existing ordinary-history rotation is unchanged.

## Results

- Same 12-scope scenario after the fix: **12 rows remain 12**, with history bytes
  unchanged through all five cycles. No original row is removed or modified.
- All 40 distinct pending generations remain, even after successful later sync.
- Expanded targeted suite: **46 passed** across Chromium/WebKit (10.5 seconds).
  Includes delayed receipts, full native storage, reload/replay/exact export,
  distinct metadata, concurrent connections, failed cursor/aborted reuse, and
  lookup budgets. Full storage rejects the replacement, preserves saved data
  and exposes the save issue instead of reporting a successful write.
- Full affected history/storage suite: **299 passed**, zero failed/skipped
  (1.1 minutes), including those 46 tests and existing preservation, dedup,
  export/privacy and storage-health checks.
- Final stronger lookup-budget assertions: **4 passed** (3.2 seconds). The
  record-limited case reads exactly 32 rows; an oversized first row stops after
  one. This is a repeat of four of the 299 tests, not four additional cases.
- `npm run qa:static`: passed, including security/storage/architecture checks.
- `git diff --check`: passed. `origin/main` was fetched again after verification
  and remained at the exact base SHA.

Logs: `/private/tmp/save-sync-growth-before-20261108.log`,
`/private/tmp/save-sync-growth-after-20261108.log`,
`/private/tmp/save-sync-growth-expanded-20261108.log`,
`/private/tmp/save-sync-growth-history-20261108.log`,
`/private/tmp/save-sync-growth-budget-20261108.log`,
`/private/tmp/save-sync-growth-static-20261108.log`.

## Remaining limits and next boundary

This prevents a measured source of new duplicates; it does not reclaim existing
bytes or impose a universal storage ceiling. More than 32 intervening rows or
large payloads can exceed the lookup budget, in which case preservation takes
precedence and growth continues. Protected genuinely distinct versions remain
unbounded by this change.

A future history-retirement policy requires explicit proof of safe
supersession/recoverability for the exact owner and generation. It should first
report proposed decisions without deleting anything. No automatic relabelling
of pending history or cleanup was added to obtain a smaller growth measurement.

Older clients that lack this optimization can still append duplicate copies.
The existing storage/export contract remains compatible; this change does not
retroactively update already-loaded JavaScript or certify pre-preservation
versions. Cold offline application loading and browser eviction are outside
this verification.

Any release of this candidate requires the user's direct release command,
Safe Lane validation and production verification. The prior command released
the separate preservation candidate and is not authorization for this task.
