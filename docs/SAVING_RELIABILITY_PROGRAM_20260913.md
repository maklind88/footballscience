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
| 2. Stabilize recovery | First checkpoint Live at `4996e806`; retained queue can resume on external retry. Acknowledgement/cache checkpoint below is local only | Further recovery hardening remains; this is not proof the original timeout is fully resolved |
| 3. Shared invariants | Written here; existing save contracts inspected | Module-by-module compliance evidence, not a second generic save framework |
| 4. Reduce redundant saves | In-flight replay-trigger coalescing candidate below; journal compaction not enabled | Atomic claim/replace semantics and old-client compatibility before compacting unsent compatible text edits |
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

## 2026-09-14: Replay-Trigger Coalescing Checkpoint

Base: `4996e80657503aca7ec9462968ad1913525863a4`, the completed first
stabilization release. Its production verification passed all seven authenticated
live checks. This next checkpoint is local/candidate work only, not another
deployment. System owns this narrow save-client boundary inside Sessions;
Sessions content, controls, drawing/medical rules, API, and database are unchanged.

The existing serial replay queue can multiply identical failed attempts:
18 concurrent `replay()` calls against one durable operation caused 18 sends
for network status 0, HTTP 403, and HTTP 503. This is a synthetic reproduction,
not a measured explanation of the user's original incident. It is distinct
from the 18-character/18-unique-operation example above.

The candidate shares an in-flight result only for the same scope, staging
barrier, observed central snapshot generation, and serial-queue tail. A new
stage, fresh observation, or explicit review resolution retains its own place
in the queue. Awaiting that stage ensures its durable row is available before
delivery. Each caller receives an independent result object because the auth
bridge customizes returned view fields.

A joined trigger during successful delivery causes a fresh journal read, so
another tab's newly persisted row is not missed. A failed network/permission
attempt does not repeat merely because several callers joined. A later external
retry remains allowed. The existing single 409 CAS retry and review handling
are unchanged; no timer, timeout, permission bypass, or background loop is added.
An empty recheck retains receipt metadata only for the same confirmed revision.

Unchanged compatibility and safety boundaries:

- Journal rows, operation IDs, before/after payloads and IndexedDB schema/prefix
  are unchanged. Nothing is compacted, deleted early, or moved to a new queue.
- A's acknowledgement cannot clear B's separate durable row. Errors, unknown
  receipts and account changes leave unresolved data in place.
- Two contexts of this client can still independently send the same immutable
  operation. This is not a cross-tab claim protocol or exactly-once guarantee.
- An old client can still read the same journal. It does not benefit from the
  new in-memory optimization, but there is no storage format migration to undo.
- This change does not reduce writes for distinct keystrokes, guarantee lower
  production latency, or remove the full-calendar server-write bottleneck.

Regressions cover retry bursts, thrown errors, 403/503, double 409, mismatched
receipts, external recovery, B while A is in flight, pending staging, fresh
observations, account change, review ordering and independent receipt objects.
Browser tests use real IndexedDB, reload, and two real Pages in one shared
BrowserContext, with a single revision-checked synthetic server. No real coaching
data is used. Tests live in `qa/session-replay-coalescing.api.spec.mjs` and
`qa/session-replay-coalescing.smoke.spec.mjs`.

Final local evidence for this candidate:

- All 16 new API/browser risk cases repeated ten times: 160/160 passed.
- Full `npm run qa:api`: 2,782 passed.
- Central revisions, recovery stability, durable store/review and replay browser
  matrix: 33/33 passed. This includes the real two-page journal interleave.
- `npm run qa:static` passed, including check, release rules, incident readiness,
  storage/security, migration policy, performance and architecture guards.
- Explicit changed-module syntax and `git diff --check` passed. Existing large
  module size warnings remain; no budgets were changed.

These are local synthetic checks, not new staging or production verification.

Next: versioned claim/replace semantics and mixed-version proof before any
durable text-operation compaction. Do not change a `pending` row simply because
it looks unsent. The large-document commit path remains a separate subsequent
step, with transactional receipt/audit/outbox guarantees before removing any
awaited safety work.

## 2026-09-16: Acknowledgement And Browser Reconciliation

Base: `5c28c83e731094e6bef26abf3d2f4d6c438cd3f8`. System owns this
checkpoint: three shared core runtime files, focused QA and this record. No
module business rules, API, database schema, permissions, journal format,
release scripts, other task's files or real coaching content are changed.
This checkpoint is not deployed. The eight-step program remains incomplete.

### Evidence And Root-Cause Limits

The reported sequence was Saving, then "Training saved centrally; browser cache
could not be refreshed", then "Local changes need review". The first failure
message was generated after a successful Sessions bridge result. Its catch
covered native storage, recovery manifest, snapshot scheduling AND rendering,
and discarded the original error. It cannot prove quota was the user's cause.
Review status can independently mean a real conflicting journal operation or a
legacy recovery snapshot at a different revision. Never auto-resolve either.

The user opened and signed in to a new in-app browser tab. Read-only navigation
to Sessions showed no active sync warning. No training was edited to provoke
one; no original failing request/stack was recovered. This observation does not
establish that pending data in another browser/tab is safe or resolved.

Deterministic regressions reproduced two additional common-boundary defects:
an acknowledgement followed by a callback's newer B edit could clear B's pending
flag, and a non-Sessions view exception could abort the flush after its memory
queue was emptied, leaving later writes unsent. These are synthetic proofs of
specific defects, not attribution of all historical data-loss reports.

### Narrow Fix And Invariants

- Both initial and successful 409-retry receipts use the same acknowledgement
  completion boundary. Recheck the current raw value and same-key queue after
  callbacks, before clearing pending or reporting Saved. A newer B remains
  pending. An earlier receipt does not acknowledge B.
- Preserve the caller's hydration flag around the internal cache write.
- Cache, manifest, snapshot and view exceptions have distinct, bounded
  diagnostics: key, phase and allowlisted error class only. Never log payloads,
  raw exception messages, player names, tokens or coaching text. Surface a local
  refresh issue without resending an already acknowledged operation or dropping
  the remaining modules' queue.
- Only the Sessions acknowledged-cache path gets quota fallback in this pilot.
  It reuses the existing central read-cache metadata: serverBacked true,
  durable false. It never converts an unsent edit to memory-only success.
  Ordinary local writes still fail on quota, and non-quota errors remain errors.
- A previous native value is retained as a recovery copy. Backup export still
  describes that native copy, never the newer memory value as durable local
  storage. On reload, fetch the verified central value. This is NOT a guarantee
  of offline access to all previously acknowledged data after eviction/restart.
  That requires the separately planned bounded durable offline read cache.
- No journal row is compacted, discarded, auto-reviewed or adopted by another
  account. No 403/409 check, timeout, permission or budget is weakened.

### Closure Matrix

| Contract | Evidence |
| --- | --- |
| A cannot acknowledge B during refresh | Deterministic service callback interleave, with view failure; raw B/pending survive |
| Successful conflict retry cannot acknowledge newer raw B | Revisioned 409/200 service case, exact B manifest preserved |
| Local display failure cannot drop the next module | Medical view exception followed by a queued Schedule write |
| Error classification is truthful and non-sensitive | ReferenceError reports view phase, raw error message excluded |
| Quota fallback requires a server acknowledgement | Data-safety tests plus unchanged ordinary-write quota rejection |
| Missing cache bridge/security error fail closed | No accepting bridge and SecurityError cases retain native value |
| Real product cache/merge/reload | Full app, real IndexedDB and quota injection; one revision-guarded mock for every Sessions POST/409 retry; compatible colleague field and local field survive, pending clears, reload has no false review |
| Repetition | New full-app browser case passed 10/10 |
| Wider regressions | 2,803/2,803 API/contracts and 34/34 relevant browser tests passed |

The new full-app test follows the actual protected writer, immutable journal,
auth bridge, central runtime, cache and renderer. It does not mock the renderer
or accept stale POST base revisions. It uses synthetic data, not Live writes.

Final local checks also passed: `npm run check`, `security:platform`,
`storage:guard`, `release:rules`, `architecture:budgets`, `qa:perf` and
`git diff --check`. Existing architecture/long-term CSS size warnings remain;
no limits were raised. A fresh fetch still matched the base above. There was
no staging, production, database migration or real-data write verification.

The first browser run exposed a fixture label mismatch, and the next exposed
an assertion reading before post-reload hydration. The test now uses its
existing boot fixture and polls for actual hydration; no timeout, permission,
product behavior or final assertion was weakened to accommodate the harness.

### Remaining Work In Order

1. Verify this exact candidate through Safe Lane and authenticated save/reload
   only after a new direct user deploy command. Capture phase diagnostics if
   the original Live symptom recurs; do not label it resolved without proof.
2. Certify shared pending/receipt/durability contracts, starting with Schedule,
   Medical and Squad, then Periodization and Exercise Library. Their differing
   permission/clinical/roster semantics must remain intact. Dedicated Chat,
   Scouting, IDP, Video and Leaderboard APIs need their own equivalent proofs,
   not replacement with the document sync writer.
3. Proceed with versioned journal claim/coalescing and server receipt
   idempotency. Require cross-tab, old-client, lost-response, tombstone and
   parent-dependency tests before reducing writes for distinct keystrokes.
4. Continue the existing additive domain-record pilot and transactional short
   commit path, with backup, dry-run count/hash verification, staging drill and
   explicit migration/release authorization. No new paid infrastructure is
   required by this checkpoint.
5. Expand module by module using the inventory above. Keep offline readiness,
   new team/player/exercise/session IDs and dependency ordering as mandatory
   gates. Do not declare all modules certified from aggregate test counts.

## 2026-09-16: Shared Rejection Contract Checkpoint (Not A Release)

The preceding acknowledgement/cache checkpoint was subsequently released as
`1061639cefedcbe3040724a14068637459d81f20`: Safe Lane completed, production run
`35104065432` succeeded, and authenticated Live smoke passed 7/7. This updates
the historical "not deployed" status above, not the entire program's status.
That release does not certify every module's saving behavior. Seven app-state
409 responses were observed during the live-smoke window (six Home stale-write
guards and one Medical destructive-reduction guard). They are evidence of
refused operations, not proof of data loss or of the original user's cause.

Current isolated investigation: `codex/system-save-contracts-20260916`, based
on that same SHA. System owns shared save/receipt/hydration contracts; affected
module boundaries are Schedule, Medical, Squad/Player Profiles, Periodization,
Exercise Library and Home Tasks. No module business rules, API permissions,
database schema, real coaching content or production configuration were edited.
No new release was authorized for this checkpoint.

### Reproductions And Limits

| Contract | Current evidence on unchanged product code |
| --- | --- |
| Refusal is not a save receipt | 403 clears `pendingCentralSync` in the shared runtime for non-Sessions keys; six parameterized service cases fail |
| Conflict must not replace/acknowledge an unsaved draft | Shared non-Schedule/non-Sessions 409 handling calls force hydration, then may clear pending without a successful POST; realistic service hydration writes an older raw snapshot |
| Refused operation must not replay automatically at a fresh base | Acceptance cases require a persisted review hold across runtime restart; not implemented, and the tests stop at earlier failed assertions, so restart is not yet certified |
| One refusal must not acknowledge that key while another saves | Queued Medical denial plus Schedule acceptance sends both but incorrectly clears Medical pending |
| Late A refusal must not block queued B | New deterministic deferred-response service case passes |
| Actual Medical protected storage pipeline | Chromium, real app and protected `localStorage.setItem`, synthetic injury plan, HTTP 403: plan remains local but pending becomes false |
| Actual Squad protected storage pipeline | Chromium, real app, synthetic player-name edit, HTTP 409: name remains local but pending becomes false |
| Schedule negative path | Real training event survives the tested 409, reload, fresh force hydration and focus, with pending true and one refused POST |

The browser tests observe the real auth bridge result without replacing it;
their HTTP endpoints and auth accounts are synthetic. Medical and Squad fail
before reload, so their later reload/focus assertions remain unverified. The
first fixture used an unknown test field and a transient global error string;
the final fixture uses actual injury-plan/name/training fields and observes
the relevant bridge result. Unknown-field normalization is not reported as
lost training. No user browser storage was cleared or altered.

Terminal local results:

- Core sync/facade/data-safety matrix: 62 passed, 13 failed. All 61 pre-existing
  cases passed; the 13 failures belong to the 14 newly added acceptance cases.
- Focused real-app browser matrix: 1 passed, 2 failed.
- Both edited QA files pass `node --check`; `git diff --check` passes.
- These failures represent missing protections, not a green release gate.
  No commit, push, staging, deploy, migration or remote user-data write occurred.

### Blocker And Next Safe Change

The tool security review rejected the proposed shared runtime/hydration/manifest
patch before it was applied, citing the cross-module recovery risk and need for
a narrower, better-proven change. Product code remains byte-identical to the
base. Only QA and this checkpoint are modified. The user was asked to approve
an isolated correction of the common rejection/reload boundary, without deploy.

Next implementation must preserve rejected pending generations, prevent forced
hydration from treating them as acknowledged, and stop automatic replay of the
same refused operation without poisoning a later legitimate explicit edit.
Retain server 403/409 checks and allow unrelated keys to save. A hold must not
be imposed on newer B by A's late refusal. Persisted review state, normal
Medical merges, Schedule revision guards, tombstones and explicit recovery all
need tests before this can be a candidate. Do not silently turn a fresh server
revision into permission to overwrite a colleague's changes.

Remaining subsequent stages are unchanged: generation-bound durable storage
(including quota/crash/cross-tab cases), versioned coalescing/idempotency, and
the additive domain-record/short-commit pilot before broader module rollout.
The existing whole-manifest storage mutations do not prove atomic cross-tab
durability; this checkpoint must not be presented as solving that separate risk.

## 2026-09-16: Approved Narrow Rejection Preservation

The user approved the isolated common-boundary correction ("Ja, om det ar det
basta"), explicitly without deploy. This supersedes the implementation stop in
the preceding investigation checkpoint. Owner: System. The same six files are
in scope: this record, shared sync service/facade, the hydration boundary in
`platform-auth-boot.js`, and the two existing central-state QA files. No module
product file, server authorization, API handler, migration or Live data changes.

### Behavior

- A rejected non-Sessions 403 or unresolved 409 stays pending. Its manifest
  entry carries `centralSyncReview` with status and the actual attempted base
  revision, not a fetched revision that would silently rebase the draft.
- Only the still-current raw value, queue and manifest generation may receive
  this hold. A late refusal for A cannot mark newer queued B, or a same-value
  manifest generation with a different hash/write-count/timestamp/deletion token.
- Automatic retry checks the hold both when queueing and before sending. A
  fresh access snapshot does not override an operation-level refusal. Other
  keys continue through the queue and successful saves keep their normal path.
- Fresh/forced hydration does not replace, acknowledge, merge/write back or
  advance the base of a held draft. It is excluded from automatic empty-state
  seeding. The server remains the source of truth for confirmed shared data.
- A new ordinary protected write clears its previous hold and is judged by the
  unchanged backend. It is not an overwrite override: unresolved revision
  conflicts can still return 409 and require an explicit domain-aware review.
- Delete holds remain tombstones, with no automatic resurrection or retry.
  A later new set clears the tombstone and uses the normal acknowledged path.
- Sessions keeps its existing immutable journal/review protocol and bounded
  conflict retry. Presentation's existing one-retry policy is unchanged; an
  unresolved refusal no longer turns forced hydration into a false receipt.

The older two-client simulator test previously required replacement of the
refused local draft. Its server revision/isolation assertions are retained; the
last assertion now requires both the accepted server version AND the pending
local draft to survive, including an explicit fresh force-hydration.

### Scope Limits

This is a rejection-preservation fix, not a complete conflict-resolution UI or
a new durable offline journal for every module. A review hold must never be
removed automatically merely to make an indicator green. Resolving genuinely
divergent documents needs the separately planned domain-aware review/merge.

The existing manifest remains whole-object localStorage with known quota,
crash and cross-tab atomicity limits. The new generation comparison is not a
claim of cross-tab transactionality. Older clients that do not understand the
review field and generic cross-account/tenant pending storage still need the
versioned/scoped journal gates in the next durability phase; they are not
certified by this checkpoint. No guarantee of universal offline readiness or
of recovery of the user's historical lost training is made.

Release risk remains Safe Lane. No main/staging integration, database mutation
or production deployment is authorized by this implementation approval.

### Terminal Local Verification

- Full API/contracts project: 2,821 passed. This includes six shared storage
  keys under both 403 and 409, runtime restart, independent-key progress,
  late rejection versus newer generation, tombstones and send-time hold checks.
- Central-state and Sessions storage browser files: 33 passed, using the
  canonical Chromium configuration and a local QA server with synthetic data.
  The empty-state seeding case also proves a held draft is not included in the
  seed request and both the pending draft and newer server value survive.
- Medical 403, Squad 409, Schedule 409 and the two-client revision conflict:
  ten repetitions each, 40/40 passed.
- `check`, `security:platform`, `release:rules`, `storage:guard`, `qa:supabase`,
  `qa:perf`, `architecture:budgets` and `git diff --check` passed. Existing
  long-term size warnings are unchanged; no threshold or timeout was raised.
- Fresh `git fetch origin` still resolves `origin/main` to
  `1061639cefedcbe3040724a14068637459d81f20`. Only the six intended files differ.

The implementation checkpoint is ready to preserve on its isolated candidate
branch, not yet production verified. No full-platform browser run or new Live
test is claimed. Overall program completion remains approximately 30%; the
next checkpoint is generation-bound durable storage and its quota/crash,
cross-tab and account/team-change acceptance tests before broader rollout.
