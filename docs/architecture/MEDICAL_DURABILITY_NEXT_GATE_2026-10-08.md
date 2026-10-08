# Medical durability: next bounded acceptance gate

Owner: System / Security for the cross-module save boundary. Affected owners:
Medical for clinical state and access rules, Platform Shell for truthful save
status. Existing source ownership and release authorization remain unchanged.

## Observed implementation

Medical's quota fallback calls the guarded central queue with a serialized draft.
The queue retains that draft in memory. Existing native manifest metadata can
record pending intent but is not a durable copy of the queued value. Sessions
and Set Pieces have module-specific staging/replay steps; Medical does not.
A scheduled whole-browser snapshot reads recoverable stored/cache values, which
can still be the previous Medical value. Starting an asynchronous snapshot on
pagehide is not proof that the draft committed before the page exited.

Sources: medical-runtime-state-service.mjs, central-sync-runtime-service.mjs,
data-safety-runtime-service.mjs, platform-global-runtime-bindings.mjs.
The current candidate fixes snapshot-induced dismissal of a reported save error;
it does not turn the memory queue into persistent draft storage.

## Implementation constraints before extending the offline promise

- Keep central accepted state authoritative. Retained work is a draft with explicit
  account, organization/team scope, base revision and immutable generation identity.
- Prove local transaction completion for the actual draft and its ownership before
  claiming it survives reopening. A cache entry, pending marker or started request
  cannot supply that proof. If both local stores fail, show unconfirmed saving.
- Never reuse old clinical content under a different identity, write permission,
  read-only coach projection or unknown historical ownership. Scope/access changes
  preserve the copy but block presentation and replay until access is verified.
- Retain the previous value and unresolved generations until a generation-specific
  acknowledgement or explicit review decision makes retirement safe. Do not reuse
  rotating backup retention for unresolved Medical work.
- Keep clinical merge/archive rules within Medical. Reusing a journal storage
  primitive does not imply that Sessions' replay or conflict policy is valid here.
- Integrate recovery with the normal Medical view and explain central, local,
  pending and failed states. Merely writing an invisible IndexedDB row is incomplete.
- Treat global error ownership as a separate review item: recordWrite also clears
  aggregate errors. The snapshot correction does not certify that a successful write
  in another module cannot mask an outstanding issue. Reproduce and scope this
  lifecycle before claiming comprehensive save-status correctness.

## Required proof

| Scenario | Required result |
| --- | --- |
| LocalStorage full, IndexedDB works, central unavailable | Exact committed draft reopens under its original authorized scope; no false central receipt |
| Both local stores unavailable | Explicit unconfirmed state; no claim of crash survival; current editor content retained while open |
| Close before and after local commit | Before commit is unconfirmed; after commit recovers; never label a started transaction durable |
| Server accepts but response is lost | Receipt reconciliation does not duplicate or overwrite newer work |
| Older/newer edits and two tabs | Generation ordering and conflicts preserve both legitimate variants |
| Logout, account/team switch or revoked access | No wrong-scope display or replay; preserved copies remain protected |
| Upgrade/rollback with pending drafts | No destructive schema change, expiry or cache cleanup of unresolved work |
| Old saved value plus newer in-memory draft | Cache snapshots cannot acknowledge or replace the newer unsaved draft |

Run this matrix with synthetic data first. Keep the already-reviewed diagnostic
candidate separate from adding Medical offline activation. Candidate publication
and affected-device storage measurement require the normal authorized Safe Lane.
No database schema, automatic replay, migration or cleanup is introduced by this
planning document.
