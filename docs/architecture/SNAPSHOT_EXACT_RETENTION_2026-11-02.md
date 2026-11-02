# Exact local snapshot replacement — 2 November 2026

Owner: System / Security, shared snapshot reliability. Affected boundary: Platform
Shell's history writer. Sessions, Medical and other module owners retain their data,
save paths, central receipts and review semantics. Governance:
`distributed-specialist-v4` and `docs/ENGINEERING_OPERATING_SYSTEM.md`.

Candidate: `codex/snapshot-exact-retention-20261102`, isolated worktree
`/Users/maklind/.codex/worktrees/save-combined-review/New project`. Base updated to
`0470a74414d518bfd37b63c7e65a04db0eb3e18b`; the earlier growth/admission commits are
rebased on this candidate. Their original published branch remains unchanged.
No root-worktree specialist edits are included.

## Decision

The preceding [admission guard](SNAPSHOT_ADMISSION_BUDGET_2026-11-02.md) stopped all
new distinct history at capacity. Server-backed projected views still do not prove
that all exact local fields are durably stored centrally; inspecting the hydration
paths confirmed merges of local UI/media. This candidate does not invent that proof
or alter auth, transport, module writes or database schema.

Instead, permit the first provable automatic retirement case: a future eligible
history row may be replaced when its **exact recoverable contents and save metadata
are also in the incoming row**, committed atomically. This is proof of local
replacement, not proof of a server acknowledgement. It helps repeated visits to the
same saved version (A → B → A), including non-consecutive duplicates; distinct saved
versions and receipt/generation changes still consume separate history slots.

## Eligibility

Only newly created automatic snapshots can acquire the policy marker
`exact-local-replacement-v1`. Existing historical rows are never retroactively marked.
The replacement predicate validates the stored row again, rather than trusting the
marker alone. Required conditions include:

- Known envelope schema/fields, known policy version and automatic reason:
  `autosave`, `startup`, `central-merge` or `pagehide`.
- Nonempty principal scope; every stored key has corresponding known save metadata
  owned by that scope. Unknown, missing or extra entry coverage is protected.
- Explicit `pendingCentralSync: false`, positive integer server revision and write
  generation, present hash/time metadata, no prepared local write or deletion.
- Empty recovery copies, recovery state and recovery separations.
- Exact equality of storage strings, scope and all save/recovery metadata and summary
  between the old row and its replacement. Hash collision alone never suffices.

Manual exports, restore/clear/remove checkpoints, Sessions quota-prefix recovery,
pending work, foreign ownership, unknown fields/policies and unmarked legacy rows
cannot be retired by this policy. The presence of a positive revision is a
conservative eligibility condition only; exact local equality is the preservation
proof. No assumption that the revision or short hash proves central coverage.

A consecutive exact duplicate continues to reuse the existing history/latest pair;
that does not classify or delete the existing row. Comparison now includes unknown
additional content fields: a later format's new recovery field cannot silently be
suppressed. IDs, capture time/reason/source and internal retention/latest-pointer
metadata remain non-content fields.

## Atomic replacement and limits

The existing read/write transaction scans snapshots, gathers exact eligible
replacement IDs and evaluates the existing count/serialized-byte budgets. It keeps
all history when capacity is sufficient. Under pressure it deletes only as many
eligible duplicates as necessary, then adds history and updates latest within that
same transaction. A failure rolls back queued deletions as well as inserts. Two tabs
serialize the complete decision. History IDs cannot overwrite an existing row.

The 16 MiB per-copy, 64 MiB aggregate serialized UTF-16 and 30 ordinary-row ceilings
are unchanged. Protected rows count toward the byte ceiling. Existing protected
history above the budget can still prevent new snapshots entirely; this candidate
does not free that storage or guarantee refreshed history on an already-full device.
Module journals remain independent. Old open application versions still have their
old writer/pruning behavior; this is not a mixed-version retirement guarantee.

## Validation

The browser acceptance suite exercises forty alternating saved versions with a
bounded two-row history, exact aggregate-byte replacement, no deletion below budget,
pending/review/prepared/deletion/scope/schema-policy/generation protection, identical
short hashes with different payloads, preservation of manual and legacy copies,
rollback after queued deletion, two-tab contention, offline replacement, reload,
actual runtime integration and future recovery-field comparison. It also reruns the
existing snapshot-budget, growth, distinct, save-status and Sessions storage controls.

Tests use disposable local browser storage and synthetic contents. Offline reload
loads code online; physical disk exhaustion, eviction and offline app-shell startup
are not claimed. No real user history is modified. No release or production
verification is performed in this checkpoint.

## Remaining work

Different saved generations cannot yet rotate safely. Per-module exact central
receipt/read evidence, protected recovery lifecycles, mixed-version rollout and
long-running usage need separate acceptance before a broader policy. This candidate
is a safe subset of automatic retention, not completion of the platform storage plan.
Any future release requires direct user authorization and Safe Lane validation.

### Completed checks

- 102 browser cases passed: 51 Chromium and 51 WebKit, including 22 new retention
  cases per engine and the existing preservation/budget/status/Sessions controls.
- 89 data-safety and central-runtime facade contract cases passed.
- `npm run check`, `npm run release:rules`, `npm run storage:guard`,
  `npm run architecture:budgets`, explicit syntax checks for changed/new JS modules
  and the new test, and `git diff --check` passed. Existing unrelated architecture
  size warnings remain; the guard passes.
- Payload capture is cloned before yielding to IndexedDB. A dedicated test mutates
  the caller's object during the pending write and verifies that the measured,
  classified original payload is the one committed.

Local evidence logs:
`/private/tmp/snapshot-retention-{chromium,webkit,contracts,check,rules,storage,architecture}-20261102.log`.
This completes the exact-duplicate subset locally. It does not certify different-
generation retention, all-module saving, production behavior or the full storage plan.
