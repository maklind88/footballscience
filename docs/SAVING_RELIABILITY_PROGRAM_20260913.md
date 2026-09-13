# Saving Reliability Program

Date: 2026-09-13. Owner: this System / Security task.
Base examined: `b2a2fc1109f873d8606e64f4a4458e891fbf26df`.

## Authorization And Scope

The user authorized the eight-step implementation sequence, not a new release.
No staging/production deploy, main integration, remote migration, restored
training, or other task activation is part of this checkpoint. Lost-training
recovery was explicitly paused by the user. Do not clear browser storage,
discard pending edits, or mark migration events processed to hide a backlog.

System owns the common save boundary, API diagnostics, invariants, and migration
safety. Sessions owns session/block semantics; Exercise Library owns exercise
versions; Squad owns roster identity; Medical owns clinical recommendations.
Schedule, Periodization, Chat, Scouting, and other dedicated APIs retain their
own permissions and business rules. This candidate changes no module UI/source.

## Current State And Evidence

Confirmed locally:

- Sessions input changes reach its runtime state writer on each edit.
- The durable Sessions client journals immutable date changes in IndexedDB.
  A synthetic 18-character edit produced 18 journal rows and 18 sends before
  this checkpoint. This is write amplification, not proof of the user's exact
  timeout cause. The central in-memory queue's debounce does not compact an
  already persisted journal.
- `/api/app-state` applies the date change to a fresh full-calendar record,
  commits that record, awaits the Storage compatibility copy, data audit, and
  Sessions history work before replying. A small network change therefore
  still causes large persistence operations.
- `apiRequest` has a 15-second default timeout. A timeout means the client does
  not know whether the server committed, not that it is safe to discard/rebase
  the edit or declare it saved.
- `retryCentral` previously returned merely because a failed write remained in
  the memory queue. An external recovery call could not resume that queue.
  The candidate schedules one drain instead. A repeated failure stays pending
  without a self-scheduled network retry loop.

Read-only production observation at 2026-09-13 19:20:40 UTC:

| Check | Result |
| --- | --- |
| Central Sessions record | One legacy `global` record, revision 18847 |
| Source bytes | 3,893,802 |
| Recorded content hash | Matches raw source |
| Sessions / blocks | 89 / 267 |
| Missing / duplicate block-ID groups | 0 / 0 |
| Missing selected-block references | 0 |
| Largest block, PostgreSQL JSONB text representation | 241,117 bytes |
| Existing domain block limit | 262,144 bytes; no block exceeded it in this sample |
| Largest session excluding blocks | 182 bytes |
| Active platform identity counts, earlier same-day check | 1 organization, 1 team, 20 memberships |
| `session_planner_sessions` / `session_planner_blocks` | Absent in production |

JSONB text size differs from the JavaScript serialized-byte check. These are
readiness measurements, not a completed transformation/backfill proof. Near-limit
blocks need realistic frame-growth testing before activation; do not raise the
budget or drop tactical content merely to make a migration pass.

Earlier same-day Storage metadata showed an approximately 10.7 MB Sessions
history object and backup objects. Contents/restore correctness were NOT
verified. Prior observed write responses took approximately 3.5-8.3 seconds;
the original failing request was not correlated to its server phases.

The exact original timeout cause is still unproven. This candidate adds bounded
`Server-Timing` phases: auth, bucket, read, authorize, receipt, state, database,
compatibility, audit, history, activity. `state` includes database/compatibility;
do not sum nested measurements. Repeated authorization measurements accumulate.
GET is unchanged. There is no payload, actor, token, or coaching text in this
header. Timing/header failure must not change a write result. Batch/delete
detail and work outside these phases are not fully instrumented; a disconnected
client may not receive the header. These limits must not be mistaken for proof
that every timeout is a database problem.

## Risks And Alternatives

Do not raise the timeout as the sole fix, hide the status indicator, bypass
403/409, delete pending rows, or remove history/backup writes. Do not replace
awaited persistence with a fire-and-forget serverless task.

A new microservice fleet, event-sourcing rewrite, or generic document store is
not needed. Reuse the modular monolith, existing Postgres, module contracts,
IndexedDB journal, and additive domain-record foundation. Durable background
work is appropriate only with transactional enqueue and verified consumers.

## Recommended Invariants

These are acceptance requirements, not a claim all modules satisfy them today.

1. Local durability and server acknowledgement are separate states. Never say
   Saved before validating the exact operation/record/scope/revision receipt.
2. Persist a local operation before depending on network delivery. Quota or
   transaction failure is an explicit failure, not durable memory fallback.
3. Bind pending records to account, canonical organization/team, operation ID,
   schema version, base revision, and entity ID. A new login never adopts old
   pending data. Server authorization is checked at execution, not trusted from
   offline browser metadata. Medical cache retention needs a separate policy.
4. Retry the same immutable operation after a lost response. Server-side
   deduplication must cover audit and side effects too; content-idempotent merge
   alone does not prove exactly-once effects.
5. An acknowledgement for A cannot clear or overwrite later B, including another
   tab's B. Conflicting field edits require review; compatible changes may merge
   only under that module's contract. No blanket last-write-wins.
6. Offline-created players, exercises, sessions, and blocks receive stable IDs.
   Dependent commands wait for parent creation or commit together. New team
   creation is authorized online; provisional local team IDs grant no access.
7. Deletes have versioned tombstones. Device reload, delayed replay, and an old
   app version cannot resurrect deleted records. Tombstone retention must cover
   the supported offline window; expired clients reconcile before replay.
8. Read bounded date/team/record ranges with appropriate indexes and pagination.
   Do not download millions of recommendations into a browser calendar blob.
9. Synchronization is bidirectional: fetch changes after a verified cursor,
   handle deletions, and catch up after missed notifications. Realtime is an
   invalidation hint, never the sole record of a change.
10. Each module has one authoritative write path. Compatibility projections
    cannot become a second independently writable source of truth.

## Implementation Sequence And Closure

| Step | Current state | Required exit evidence |
| --- | --- | --- |
| 1. Diagnose and measure | Partial: code/reproduction/read-only size and schema evidence; timing implemented locally | Correlate an authorized synthetic save with queue age, network response, phase timings and fresh read; original timeout not yet attributed |
| 2. Stabilize recovery | Local candidate: retained queue can resume on external retry | Timeout/lost reply/repeated retry/newer edit/revoked access tests; staging and live verification after direct authorization |
| 3. Shared invariants | Written here; existing save contracts inspected | Module-by-module compliance evidence, not a second generic save framework |
| 4. Reduce redundant saves | Hazard analyzed; no coalescing change yet | Atomic claim/replace semantics and old-client compatibility before compacting unsent compatible text edits |
| 5. Domain-record pilot | Existing inert schema/transformer/read adapter/dry-run retained; readiness checked | Identity and library dependencies, verified backup, exact hash/count round trip, local DB transaction tests, authorized staging backfill/shadow/canary |
| 6. Short commit path | Not implemented | Data + receipt + mandatory audit + background outbox enqueue atomic; bounded worker retry, monitoring and restore proof |
| 7. Realistic pilot proof | Existing local browser/contracts plus new failure-chain regression | Cross-tab/two-account/offline/crash/quota/permissions/load/rolling-version cases against the actual selected pipeline |
| 8. Selective expansion | Registry/API boundary inventory below, no module migration | Prioritize remaining large documents; preserve already database-primary paths and validate each module before cutover |

Step 4 must not mutate an already journaled row merely because its status is
`pending`: another tab or an older client may already have sent it. The current
store has no atomic replay-claim marker. Preserve immutable rows until an
explicit versioned claim/coalescing protocol is tested. Compatible edits may be
grouped before delivery; separate actions, deletes, medical decisions, different
actors/scopes, and already attempted operations must not be merged blindly.

For step 5 reuse `docs/SESSION_PLANNER_DOMAIN_RECORDS_V1.md`,
`api/_lib/session-planner-domain-records.js`,
`api/_lib/session-planner-database.js`, and
`scripts/session-planner-domain-dry-run.mjs`. The adapter currently only reads;
the production table absence is not fixed by flipping an environment flag.
The older document's empty-identity observation was from July, not this audit.
The newer identity counts do not prove correct legacy ownership or restore.

Respect `docs/PLATFORM_SCALE_PROGRAM.md`: prove Exercise Library identity,
folders, versions, and references before a Sessions cutover. Stabilizing the
existing Sessions save path need not wait for that migration. Resolve legacy
`global` data to an explicitly verified tenant; new tenants must never inherit
it through a default/fallback. No staged dual-write experiment may introduce
two independent authorities.

## Module Inventory

This covers the 21 registered modules plus RTP and the planned desktop offline
boundary. It is a source-code/contract inventory, not an authenticated live
save certification for every module. Registry `futureTables` are not evidence
of deployed tables. No other module's product files were edited.

| Modules | Inspected boundary / next action |
| --- | --- |
| Session Planner | Durable date journal + central full document; first reliability pilot and later bounded session/block records |
| Exercise Library | Four protected library/folder/backup keys; preserve versions and reference mapping before Sessions promotion |
| Schedule | Protected event document and database adapter; verify actual runtime mode, per-event revisions and offline conflicts |
| Squad / player-profiles | Protected roster/profile document plus dedicated age API; canonical player/team membership before dependent module migrations |
| Medical Team | Protected clinical document plus medical adapter/RTP APIs; verify active paths; never consume migration events or migrate decisions without reconciliation/audit |
| Periodization | Protected planning document; preserve date/local-view separation and references into Sessions |
| Scouting | Dedicated Scouting/FSDB adapters plus protected compatibility state; determine per-operation authority rather than re-migrate the whole module |
| Chat | Dedicated `/api/chat` and database-primary contract; preserve message/receipt ownership; checkpoint table alone is misleading |
| Football Science DB | Dedicated player identity/search API; retain server-side paging and source identities |
| Home | Task/preferences/presentation protected keys; separate shared task edits from per-user seen/preferences data |
| Gameplan | Protected match-preparation document; split by verified match/team boundary only after consumption audit |
| Set Pieces Room | Protected plan document; preserve drawing/order/version semantics |
| Transfer Room | Protected recruitment document; requires strict team projection and independent financial/access review before migration |
| Game Simulator | Protected sequence/library documents; preserve engine behavior, not an extraction target in this checkpoint |
| Video Analysis | Dedicated API/database family; media remains object/local file storage, metadata only in sync |
| IDP | Dedicated API/database service; verify relation/receipt/offline policy without replacing its write path |
| Leaderboard | Dedicated database ledger; reversals/audit are actions, never text-coalesced operations |
| Platform Identity | Canonical organization/team/membership tables; authorization prerequisite, not a browser-owned queue |
| Platform Shell | Workspace/structure protected keys; legacy global defaults require explicit tenant migration gates |
| Platform Appearance | Protected admin config; small bounded records, lower migration priority |
| Platform Readiness | Derived diagnostics/contracts; do not turn health state into coaching data ownership |
| RTP (additional boundary) | Dedicated RTP/library API used by Medical; protect clinical/library ownership |
| FS Desktop/offline (additional boundary) | Checked local-video sync-bridge README reserves metadata-only sync, not full videos; complete desktop offline design still needs alignment before implementation |

The database checkpoint table currently reports all inspected rows with reads
and writes disabled and `last_verified_at = null`, including Chat/Scouting.
This conflicts with dedicated database-first contracts. Treat the table as an
unverified migration register, not as proof that actual product reads are off.
Do not update its rows just to make a dashboard green.

## Validation And Expected Impact

The immediate change should make a retained failed queue resumable without
altering saved content, revision rules, authorization, history, or UI. It does
not yet reduce network write volume or remove the full-calendar bottleneck.

Local evidence for this checkpoint:

- Red-before proof for retained-queue retry; five added recovery regressions.
- Real Sessions client/protocol with revision-checked synthetic server: lost
  reply, retained journal, stale revision rejection, exact receipt before clear.
  Ten repeated runs pass. Replay may still increment the revision for an already
  applied identical change: server-side receipt deduplication remains future work.
- New timing unit tests and API integration assertions in Storage/database modes.
- Full `npm run qa:api`: 2,764 passed on the final product/test diff (1.3 minutes).
- Final 28 browser tests passed: central revisions, hydration, IndexedDB reload and
  review UI at desktop/mobile sizes. These are local tests, not live smoke.
- Syntax, security, storage, release rules, migration policy and architecture
  guards passed. Existing architecture size warnings remain unchanged.
- `git diff --check` passed; a final fetch still has `origin/main` at the base
  above. No merge/rebase is needed. This is a candidate for Safe Lane validation,
  not production approval or a completed live incident resolution.

Pilot acceptance must additionally cover no false Saved on failed persistence,
two-page and two-account writes, offline new entities/dependencies, lost receipt
after commit, repeated 409/403, clock skew, tenant change, reload/crash, revocation,
storage eviction, preserved tactical frames, and representative load. Measure
p50/p95/p99 queue-to-ack latency, request bytes, oldest pending operation,
conflicts, worker backlog and read-after-write consistency without logging PII.
Performance objectives become acceptance thresholds after a measured baseline;
no promise of zero failures or millions of records without workload evidence.

Deployment is a separate checkpoint requiring this user's direct `Deploy safe`
instruction, clean exact-SHA scope, Safe Lane, designated synthetic QA accounts,
staging/production isolation, backup/restore readiness, fresh authenticated
save/reload/read proof, and no changes to real coaching content. A code rollback
must remain compatible with pending operations; never restore old data merely
to roll back code. Do not call the whole eight-step program complete at the
first green candidate or first release.
