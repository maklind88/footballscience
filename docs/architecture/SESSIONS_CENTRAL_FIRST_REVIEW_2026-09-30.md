# Sessions Central-First Review

Owner: this System / Security task, with the user's explicit authorization to
start in Sessions. The bounded Schedule release-gate follow-up below is the only
additional module change.

## Observed Incident

The existing production Sessions review UI displayed 110 local versions. Several
versions concerned the same date. This is not evidence of 110 lost sessions.
The UI also logged cache-capacity warnings; their causal relationship to the
review backlog has not been established. No local version was deleted, selected
as a winner, or uploaded as part of the inspection.

Two regressions reproduced independently of the user's data:

- Projecting review rows and dependent successors replaced accepted central
  fields in the read view.
- Choosing the central version for one review called the general drain and
  could upload an unrelated pending change.

The prior automatic text-conflict rebase also contradicted the newly authorized
policy. Tests now explicitly reject automatic local victory for recent text
edits, including after a failed fresh read.

## Contract

- The accepted server snapshot is the shared baseline. Read projections may add
  non-conflicting pending deltas and the active typing draft, not reviewed
  conflicts or their dependent successors. No read acknowledges a write.
- Real same-field conflicts remain durable until explicit review. A newer read
  is not authorization to retry with a locally preferred value.
- Keeping central is a local archival operation. It does not drain other edits.
  IndexedDB compares the exact review generation inside its write transaction;
  a changed generation aborts archival.
- Bulk keep-central acts only on the listed versions and checks account and
  central state before resolving them. It stops on failure. A partial archive
  remains recoverable; close/reopen the review to refresh the remaining list.
- New drafts, other principals, and other modules are not bulk-discard targets.
- Historical local copies remain archived. This is not physical deletion and
  is not a cache-quota remediation.

## Rollout Checklist

1. Sessions baseline versus review projection: implemented; targeted tests.
2. New edits, receipt confirmation, and non-conflicting merges: existing
   mechanisms retained; regression tests required.
3. Same-field conflict policy: automatic overwrite removed; explicit review
   retained.
4. Offline/reload and cross-tab generation preservation: targeted IndexedDB and
   service tests; not a claim of platform-wide offline support.
5. Current user's local backlog: NOT cleared. The currently deployed review
   handler can drain unrelated pending writes, so it is not used for bulk
   cleanup. The corrected UI must first pass release gates and be explicitly
   authorized for deployment. The user's request covers clearing the current
   Sessions backlog, not future edits or other modules' local data.
6. Wider modules: NOT implemented or activated. Audit each public read/write
   contract and owner boundary before applying this standard elsewhere.

## Verification

Tests cover real two-page IndexedDB mutation, reload, failed persistence,
account changes during lookup, stale central review, fresh-read failure, and a
new pending edit arriving after bulk-review display. Keep central emits zero
POSTs from the resolver. The actual two-editor product flow also verifies central
title/revision, exact request count, review archival, pending flag and reload.

| Check | Result |
| --- | --- |
| Sessions durable save, storage, recovery, receipts and backup selection | 132/132 passed |
| Archival/bulk failure cases repeated ten times in Chromium | 50/50 passed |
| Shared central browser and sync-service integration | 175/175 passed |
| Four actual two-editor scenarios repeated ten times | 40/40 passed |
| Sessions storage/review in WebKit | 14/14 passed |
| Syntax and complete static guards | Passed |

The first integration run was not green: its old same-field test expected
automatic local victory, and overlapping QA runs shared a result directory,
causing trace-file failures. A Medical receipt timeout also occurred. The
same-field test now proves the explicit central-first policy and real review
flow; the Medical case passed three isolated repetitions without any edits.
The complete integration rerun passed sequentially, without changing Medical
tests, timeouts, retry budgets or product code. Browser suites must not share an
output directory while running concurrently.

These are scoped synthetic checks, not full repository QA, real Supabase
authorization verification, physical iPad proof or Live verification. Static
architecture checks retain existing size warnings; budgets were not increased.

No production migration, deployment, server-data mutation, or browser-storage
purge is authorized by this implementation step.

## Release-Gate Follow-Up

The later user-authorized Safe Lane stopped in staging QA run 36768308377:
the unchanged Schedule deletion test did not find the Clear note confirmation.
The deploy job was skipped; main and production were not updated. The original
test passed 10 local repetitions and 15 CPU-throttled repetitions, so the CI
trigger is not proven from its available logs.

A deterministic regression reproduced the same missing confirmation when a
resize debounce replaced the note's DOM between pointer down and pointer up.
It also exposed loss of unsaved note text during layout-only rendering.
Schedule now defers layout-only grid replacement while a note is open; closing
or saving the note renders the current layout. Semantic renders, permissions,
central persistence and confirmation requirements are unchanged.

The new browser test uses the real resize handler and a controlled clock, checks
the same button node, draft/focus preservation, cancel without persisted change,
confirmed deletion and the updated month count after closing. It fails before
the fix at the missing confirmation, and passes with the fix. The original
deletion test is unchanged; neither timeouts nor retries were increased.

QA run 36813702630 passed both Schedule note tests but stopped at the delayed
previous-account users-response receipt test. CPU-throttled reproduction showed
that its minimal `{ events: [...] }` write removed the Schedule import marker.
`readScheduleState` then merged 220 bundled NCC events, producing a different
221-event local generation and a second stale-base POST. Acknowledging that newer
generation would be incorrect; the receipt and pending safeguards are unchanged.

Both delayed-account receipt fixtures now use `cloneScheduleState`, retain the
completed import marker and write normalized event fields. They still require
one POST under the new principal, revision 2, an unchanged principal/read scope
and a cleared pending flag, and additionally require byte-exact local/server
equality with the intended draft. All 20 CPU-throttled repetitions passed.
Temporary diagnostic logging and CPU throttling were removed from the candidate.
