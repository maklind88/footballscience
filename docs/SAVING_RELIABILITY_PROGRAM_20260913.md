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
| 6. Short commit path | Inactive atomic state/receipt/effect foundation and guarded server adapter; no deployed caller or effect consumer | Data + receipt + mandatory audit + background outbox enqueue atomic; bounded worker retry, monitoring and restore proof |
| 7. Realistic pilot proof | Local real PostgreSQL + browser journal pilot, plus existing active-flow regressions; not a staging/production proof | Cross-tab/two-account/offline/crash/quota/permissions/load/rolling-version cases against the actual selected pipeline |
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

## 2026-09-16: Transactional Journal Pilot (Not A Release)

The user's "Kor basta steg" authorizes the next isolated implementation, not a
deploy. System owns this persistence checkpoint. Sessions is the existing pilot;
no Sessions UI, coaching semantics, other module writer, API authorization or
database migration changes. Continue on `codex/system-save-contracts-20260916`,
after the pushed rejection-preservation checkpoint `3f90d9c3`.

### Decision And Invariants

Reuse the existing Sessions IndexedDB journal, database version and record
format. Do not add a second platform-wide save framework or switch every module
to a new writer at once. The previous store allowed a plain `put` to replace a
pending operation's scope/payload and removed rows by ID without comparing the
read generation. Multi-date staging and review replacement used separate
transactions. Five new negative browser contracts failed against that boundary.

- Stage all date operations from one local edit in one read/write transaction.
  A later request failure aborts the whole batch; no partial new batch is sent.
- Snapshot/validate journal records before awaiting database access. Existing pending
  operation IDs cannot be reused for another payload, owner or status. Exact
  duplicate insertions remain idempotent.
- Compare the complete scoped expected record and update/remove it in the SAME
  read/write transaction. A newer review/status/payload generation survives a
  delayed receipt. A mismatch remains an explicit failure, not a save receipt.
- Archive a reviewed row and insert its chosen replacement atomically. A quota
  failure or competing review cannot leave a replacement without its archive,
  or archive the only retained version without its replacement.
- Wait for transaction completion, not individual request success. Request
  strict transaction durability; do not use memory as a durable fallback.
  IndexedDB completion/durability constraints are documented by
  [MDN](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction).
- Preserve the existing account/team scope, and recheck it after asynchronous
  reads/commits before publishing a receipt or sending a reviewed replacement.
  Missing/mixed scope batches are rejected; an existing unscoped record cannot
  be silently adopted by an insertion with the same ID.

### Evidence And Remaining Boundaries

The risk suite uses real Chromium IndexedDB and two Pages in one BrowserContext
with shared origin storage. Both competing transactions queue behind a held
IndexedDB transaction before it is released. No production lock or storage
lease was added. The interrupted-tab case closes a Page after a successful
request but before transaction completion and checks the survivor after reload.
Quota/abort cases inject explicit failures into real transactions; they do not
claim to reproduce every browser/OS disk-full condition or a machine power loss.

Fourteen focused browser cases passed 10 times each (140/140). They cover batch
abort and reload, late receipt versus peer review, simultaneous distinct rows
and same-ID collisions, atomic review failure/retry, quota rejection with zero
network sends followed by successful recovery, account/team switch/reload and
failed local acknowledgement cleanup followed by retry of the same operation.
The existing conflict/merge, tombstone and payload rules remain unchanged.

This is local journal atomicity, not an all-dates server transaction or an
exactly-once side-effect guarantee. Server receipt idempotency, cross-tab replay
claiming, compatible unsent-edit compaction and old-client rollout still need
their own protocol/tests. No new claim is made about canonical organization
resolution: the existing bridge scope is unchanged. Local scope partitioning
does not replace server authorization or provide encrypted storage on a shared
device. Browser storage eviction and full offline app loading are separate risks.

Other modules' whole-document localStorage pending records are NOT migrated by
this pilot. Medical retention/permissions, Squad identity, offline parent-child
creation and module-specific conflict resolution remain explicit later gates.
Overall program completion is approximately 35%, not completion of all eight
steps. No main/staging/production or real coaching data was changed.

Terminal validation: full API/contracts 2,823/2,823; all four relevant Chromium
files 47/47; risk repetitions 140/140; `check`, `release:rules`,
`security:platform`, `storage:guard`, `qa:supabase`, `qa:perf`,
`architecture:budgets` and `git diff --check` passed. The first broad API run had
one outdated memory-store test double; its method contract was updated without
changing recovery/server assertions, and the full matrix then passed. The
test-only transaction barrier initially opened the database before the normal
store initialization; fixing that harness ordering required no product change.
Existing architecture warnings remain unchanged. No budget, timeout or
permission was relaxed. Safari/iPad and mixed old/new deployed clients are not
certified by this local Chromium checkpoint.

The increment contains two product files (`session-save-store.mjs` and
`session-save-client.mjs`), five related QA files and this program record.
Fresh `origin/main` remains `1061639cefedcbe3040724a14068637459d81f20`.
Next: versioned cross-tab replay claiming and server receipt idempotency before
unsent-edit compaction or applying this journal pattern to another module.

## 2026-09-16: Atomic Server Receipt Foundation (Inactive)

The next-step instruction authorizes an isolated implementation/proof, not a
release or remote schema/data write. System remains the owner; Sessions domain
merge, UI, permissions and the active API route are unchanged. Base is the
transactional local journal checkpoint `ed4a9791` on Live base `1061639c`.

### Decision

The active date-change path in `api/app-state.js` still merges against a fresh
calendar, writes it through the revision RPC, then separately awaits Storage,
audit, history and activity. It has no persistent operation-ID receipt. A
content-idempotent merge does not make revision/history work exactly once.

Prepare an additive, **unwired** database primitive first. The CLI-created
`20260916163623_session_save_atomic_receipts.sql` installs a server-only
`commit_session_save_operation` RPC and private append-only receipt/effect
tables. There is no feature flag or runtime caller enabling it. No remote
migration was run. This is not an active fix for retries in Live.

- One transaction takes the existing calendar row lock, checks active canonical
  org/team/club/profile/membership after waiting, applies the revision CAS, and
  inserts the immutable receipt plus a durable before/after date effect intent.
  Failure inserting either record rolls back the state write too.
- Receipt identity is `(organization, team, actor, operation ID)` plus a hash
  of the immutable date change. JSONB normalizes object key order. A reused ID
  with different content is refused. A replay returns the original receipt,
  not a new revision or a stale rewrite of the current calendar.
- The RPC only accepts an existing, nondeleted, canonical org record with an
  exact `metadata.teamId`. It cannot seed/adopt `global`, another team's state,
  or an unbound calendar. It forbids changes outside the operation's date.
- Private tables have RLS, no anon/authenticated/public privileges, and only
  server SELECT/INSERT grants. The public RPC is SECURITY INVOKER and executable
  only by service_role. Explicit server SELECT grants on identity tables avoid
  depending on Supabase default privileges. No client grant was broadened.

PostgREST executes each RPC request transactionally and rolls back on database
failure: [transaction contract](https://docs.postgrest.org/en/stable/references/transactions.html).
The Supabase changelog was checked; the relevant Data API exposure change does
not replace table grants/RLS. See also the official
[database function security guidance](https://supabase.com/docs/guides/database/functions).

### Real PostgreSQL Evidence

`node --test qa/session-save-receipts-native.test.mjs` requires `FS_RECOVERY_PG_BIN` pointing to a
verified PostgreSQL 17 toolchain. It reuses the existing synthetic recovery
harness: a new private Unix-socket instance, no TCP listener, inherited PG
credentials excluded, no external URL accepted, and cleanup in `finally`.
It applies the real dependency migrations and this migration, not SQL mocks.

Twenty-two behavioral cases cover transactional schema rollback, committed
response loss plus database restart, identical receipt replay, different-content
ID collision, actor/tenant separation, paused principal/scope, missing/global/
deleted state, unrelated-date rejection, receipt/effect insert failures, real
role denial, concurrent same/different operations, access revoke during lock
wait, legacy CAS competition, and disconnect before COMMIT. Two independent
psql processes must both be visibly waiting on a held row before the barrier
is released. The SQLSTATE is asserted for negative database cases.

An initial native run caught missing explicit service-role identity SELECT
grants and another caught SQL JSON operator precedence; both were corrected
in the migration, not bypassed in the fixture. Native tests are a separate
required migration proof, not silently skipped or counted as part of ordinary
Playwright API QA. No claim of full Supabase migration-history replay is made.

### Activation Gates And Limitations

This checkpoint proves at-most-one committed state/receipt/effect-intent per
scoped operation in this RPC. It does NOT prove exactly-once delivery of history
or compatibility effects: no consumer exists yet. Existing history/audit/backup
work is not removed, bypassed or moved into fire-and-forget work.

Before any caller/cutover is enabled, all of the following remain required:

1. Prove canonical server actor/org/team resolution and the existing Sessions
   edit permission on every initial request AND receipt replay. Membership in
   the RPC is defense in depth, not a replacement for module authorization.
2. Resolve the legacy global calendar through an explicitly reviewed data
   migration/shadow comparison. Do not copy/adopt it in a normal GET or write.
   The current app-state primary key still holds one document per org/key; this
bridge is **not** the multi-team bounded-record architecture. New teams and
   millions of records require the existing domain-record plan before rollout.
3. Implement and verify idempotent effect consumers, operational retry/status,
   audit/history/backup compatibility and retention/offline replay policy.
   Receipt/effect rows currently have no automatic deletion or processing.
4. Integrate the API's existing validation and three-way merge with this RPC;
   the supplied full value must be server-computed/authorized, never taken as
   authoritative browser input. Replayed older receipts require fresh client
   reconciliation without overwriting newer local/server work.
5. Verify real browser/API cross-tab replay, old/new clients, tenant isolation,
   backup readiness and staging migration under a user-authorized Safe Lane.

Cross-tab send claiming, edit compaction, and other modules remain later steps.
The full-calendar commit cost is unchanged. This foundation is safe to review
in isolation, not a claim the complete saving program is ready for release.

Terminal checkpoint: 22 native PostgreSQL cases passed in each of 10 runs
(220 behavioral case executions; the Node runner also counts its parent test).
The 130 targeted API, sync, transport, domain, facade and data-safety contracts
passed. `check`, `security:platform`, `release:rules`, `storage:guard`,
`qa:supabase` (68 migration files), `qa:perf`, `architecture:budgets` and diff
checks passed; existing 83 architecture warnings are unchanged. No browser
suite was rerun for this SQL-only increment; the preceding local-journal
browser evidence is recorded above and is not reclassified as fresh evidence.
All synthetic database processes and data directories were closed/removed.

Scope: one additive migration, its native integration test, one package command,
and this record. Fresh `origin/main` remains `1061639c`. Overall program estimate
is approximately 38%. No real training content, remote database, main, staging,
production, runtime caller or permission matrix was changed.

## Canonical Scope And Receipt-Backed History Checkpoint (2026-09-16)

### Decision And Boundary

The active `api/session-history.js` remains admin-only and its Storage history
remains global, bounded to 160 entries. It is not replaced or migrated here.
The new receipt transaction already persists complete before/after date evidence.
For the pilot, read history metadata directly from those immutable receipts
instead of adding another history worker, queue, or independently mutable copy.
This removes a future dual-write dependency for this list only, not the existing
audit, backup, activity, Storage compatibility or restore responsibilities.

The additive `20260916165132_session_save_scope_history.sql` is inactive:

- `resolve_session_save_scope` requires an explicit team UUID and a server-verified
  actor UUID. It derives organization/club/team and matching roles from canonical
  database rows. Active, nondeleted profile, membership, organization, team and
  any parent club are required. Membership must cover that exact team's canonical
  ancestry; inconsistent club/org references fail closed. No display aliases,
  profile primary-team preference, JWT role, user_metadata or global fallback is
  authorization. New teams need a matching active membership, not a code change.
- `read_session_save_history` rechecks that scope on every request and requires a
  matching canonical `admin` membership. Coach, Medical, team-admin or admin of a
  different team cannot read this history. This preserves the existing history
  role boundary while narrowing it to canonical membership. Legacy admins without
  a canonical membership must be onboarded explicitly; no automatic adoption.
- Reads use one statement snapshot, not a cross-request permission cache. Both
  functions are STABLE, SECURITY INVOKER, pin `pg_catalog` and allow execution only
  by service_role. Browser roles cannot call them with a forged actor ID. A future
  API caller must authenticate the actor and run the existing security/module
  guards; the scope resolver deliberately makes no Sessions edit-access claim.
- A date-scoped, indexed revision cursor returns 25 metadata entries by default,
  at most 50. Only operation ID, actor ID, date, revision and commit time appear
  in the list. Full coaching values stay in the existing private evidence rows.
  Older-page cursors exclude newer commits without offset skips or duplicates.
  The limit bounds each response; it does not delete older/offline evidence.

This follows the official [Supabase function security guidance](https://supabase.com/docs/guides/database/functions)
and [PostgreSQL STABLE snapshot contract](https://www.postgresql.org/docs/17/xfunc-volatility.html).
The current Supabase changelog was checked; no relevant API change requires a
different function security or read snapshot contract.

### Regression Evidence And Remaining Gates

`node --test qa/session-save-history-native.test.mjs` applies the actual SQL to the existing isolated
PostgreSQL 17 synthetic harness, never Supabase. The existing receipt native
suite now also applies this additive migration, so its collision, lock-wait,
revoke, restart and legacy-CAS cases exercise the new history index too.

The history cases prove canonical ancestry, metadata/role spoof rejection,
missing/inactive/deleted identities, different-team admin isolation, new team
onboarding, per-page revocation, committed response replay, restart persistence,
before/after retention, metadata-only output, date/org/team filtering, cursor
paging across newer commits, the 50-entry ceiling, input validation, actual
browser-role denial and read-only transactions with byte-identical evidence
before/after. EXPLAIN demonstrates an indexable bounded date/revision query, not
a claim of million-record load testing. Initial additional fixtures attempted
hard deletion of identity rows; the existing guard correctly rejected them.
Fixtures now use incomplete synthetic identities and transaction rollback,
without disabling any trigger or changing product behavior.

The resolver is not yet wired to the commit RPC, API, browser journal or old
history. In particular, current browser scopes are not silently rekeyed to a new
organization, existing global training is not adopted, and legacy history is
not imported/deleted. The one-org/calendar pilot still needs the bounded
multi-team record migration plan. No claiming, compaction, consumer, permission
matrix rewrite, detail/restore endpoint, retention job or feature flag was added.

Next: prove a server adapter that combines the canonical scope with the current
Sessions edit/security guards on both initial writes and replays; validate the
merge/receipt/history path together without activating it. Shadow comparison,
explicit legacy migration, compatibility effects, offline/cross-tab end-to-end
tests, backup readiness and user-authorized Safe Lane remain cutover gates.

Terminal evidence: 20 history/scope cases plus 22 receipt cases passed in each
of 10 local PostgreSQL runs (420 behavioral case executions; the Node runner
counts two additional parent tests per run). All 146 targeted API, identity,
history, domain, facade, data-safety and sync contracts passed. `check`,
`security:platform`, `storage:guard`, `release:rules`, `qa:supabase` (69 migration
files), `qa:perf`, `architecture:budgets` and diff checks passed. The existing
83 architecture warnings are unchanged. No fresh browser or remote Supabase
advisor/staging proof is claimed for this inactive database-only increment.
All owned test processes finished and synthetic instances cleaned up.

Scope is five files: this record, the additive SQL, its native test, applying
the new SQL in the existing receipt tests, and one package command. Latest
fetched `origin/main` remains `1061639c`; no rebase is needed. Overall saving
program estimate is approximately 40%, not a claim that the Live saving issue
or all modules are fixed. No remote migration, main/staging change or deploy.

## Authorized Server Adapter Checkpoint (2026-09-16)

### Decision And Scope

System/Security owns this inactive saving adapter. Sessions keeps its existing
workspace permission matrix, date-change protocol, merge semantics and content
filters; no module UI or active HTTP route changes. The previous canonical
membership resolver does not grant Sessions edit permission by itself.

`api/_lib/session-save-pilot.js` now combines the actual date-change protocol
with an authorization callback supplied by `api/app-state.js`. That factory
reuses `canActorEditWorkspace`, `protectSessionPlannerStateValue` and
`validateCentralStateContent`; options cannot override it. The existing HTTP
handler is byte-identical to the preceding checkpoint. Only an unused factory
export is appended. There is no feature flag, new route or automatic caller.

The adapter captures immutable operation bytes before awaiting, obtains the
canonical actor/team scope from the database, authorizes both initial writes
and receipt replay, merges only the requested date, and checks exact receipt
identity, revision, hash and value. One fresh, reauthorized reconcile is allowed
after a CAS/context conflict. Transport/body-read uncertainty is not silently
retried or reported as saved. A later call must reuse the same operation ID.
An older replayed receipt is immutable evidence, not permission to overwrite
newer server or browser state.

`20260916170114_session_save_authorized_context.sql` adds server-only functions
for a fresh context and guarded commit. Both calendar and workspace-hub records
must already exist in the canonical organization and carry the exact team ID;
missing/global/removed/unbound records are not seeded or adopted. The context
token binds canonical scope/roles and the hub revision/value. A commit acquires
the existing calendar row lock, identity read locks and the hub read lock,
then rechecks the context after waiting. Revoke cannot cross the final
authorization/commit boundary. The underlying state/receipt/effect transaction
remains all-or-nothing.

Only the small identity-lock helper is SECURITY DEFINER, in `app_private` with
fully qualified tables and pinned `pg_catalog`. It performs no data mutation.
It avoids granting identity UPDATE to service_role merely for FOR SHARE.
Public functions remain SECURITY INVOKER; all three revoke public/anon/
authenticated execution and grant only service_role. The native test proves
identity UPDATE is still denied. This follows the official
[Supabase function security guidance](https://supabase.com/docs/guides/database/functions)
and [PostgreSQL row-lock semantics](https://www.postgresql.org/docs/17/explicit-locking.html).
These are short database transaction locks, not a local release lock or
cross-request browser lease. Deadlock/timeout remains a failed/uncertain
transaction, never a successful receipt.

### Evidence And Boundaries

`qa/session-save-pilot-native.test.mjs` executes the actual JavaScript adapter,
app-state authorization/content functions and real PostgreSQL RPCs in the
existing private local synthetic harness. Fifteen cases include real role
and workspace revoke during row-lock waits, same-ID concurrent saves, committed
response loss, newer colleague edits, one fresh conflict merge, invalid content,
cross-scope rejection, new training, explicit exercise deletion, and an effect
insert failure that rolls back the whole save before a successful same-ID retry.
The lock-retention case deliberately holds an outer test transaction after SQL
returns; it proves locks, not HTTP acknowledgement before COMMIT.

Together with 20 history/scope and 22 receipt cases, 57 behavioral cases passed
in each of 10 PostgreSQL runs: 570 case executions. Node reports 60 per run
because it also counts three parent tests. The 27 new API contracts cover
malformed context/receipt, stale acknowledgement, immutable request capture,
two consecutive conflicts, mandatory existing authorization and bounded,
sanitized transport. No fresh browser end-to-end or remote Supabase advisor
evidence is claimed for this inactive server increment.

The first full API run returned 2849/2850. Its sole failure was a historical
release contract disallowing the three optional native-test package aliases.
Those aliases (two from earlier checkpoints and this increment's one) were
removed, not allowlisted; the guard and lockfile remain unchanged and
`package.json` now exactly matches origin/main. Native tests remain intact:

```sh
FS_RECOVERY_PG_BIN=<verified-local-pg17-bin> node --test \
  qa/session-save-pilot-native.test.mjs \
  qa/session-save-history-native.test.mjs \
  qa/session-save-receipts-native.test.mjs
```

Before activation, the real HTTP caller must verify the token, derive actor ID
from trusted authentication (never request JSON), run `guardApiRequest`, enforce
body/response size and compression limits, and connect the receipt to the
durable browser journal without clearing newer generations. Backup, audit,
activity/Storage compatibility, retention, shadow comparison, explicit legacy
onboarding and old/new-client tests remain cutover gates. No compatibility
effect consumer is activated here. The full-calendar org/key bridge is still
not the bounded multi-team/million-record architecture.

Next: prove the API-to-browser journal acknowledgement/reconciliation contract
with real authentication guards and uncertain/old receipt cases, still without
enabling this pilot on Live. Overall program estimate is approximately 44%.
No remote migration, real training data, main, staging or production changed.

Terminal evidence: the corrected full API suite passed 2850/2850. `check`,
`security:platform`, `release:rules`, `storage:guard`, `qa:supabase` (70 migration
files), `qa:perf`, `architecture:budgets` and diff checks passed. The 83 existing
architecture warnings are unchanged. All owned tests ended; no test server on
the isolated port 4349 or owned native database run remains. Unrelated running
servers were not touched. Fresh origin/main is still `1061639c`, behind 0.

Increment scope is seven files: app-state's unused policy factory, the new
server adapter, the additive SQL, two test files, removal of optional package
aliases and this evidence record. The cumulative candidate is not Live and
still requires the activation gates above, review and explicit deploy approval.

## Browser Receipt Boundary Checkpoint (2026-09-16)

### Implementation And Ownership

System owns the saving/authentication boundary in this checkpoint; Sessions
date/block semantics, workspace permissions and UI remain unchanged. Two new
constructors are deliberately unwired: `session-save-pilot-http.js` and
`session-save-pilot-client.mjs`. No active route, auth-boot import, feature flag,
database mode, migration or legacy scope adoption is added.

The HTTP constructor uses the existing `getCurrentActor`, `guardApiRequest`,
bounded body parser and Sessions compression. Actor ID comes only from the
verified Auth response, never body/JWT metadata; canonical SQL checks still
decide active membership, organization/team and module edit access. Browser
claims about roles/org cannot replace those checks. It accepts POST date
operations only, emits no-store, preserves rate limiting, and preflights the
merged/replayed receipt's encoded size before any commit. The actual response
is bounded again after commit. Uncertainty leaves the same immutable operation
available to replay, never an invented successful acknowledgement.

The browser constructor requires a verified actor/org/club/team context plus
an auth epoch. It uses a distinct `sessions-receipts-v1` journal namespace and
never rekeys legacy rows. Scope and epoch are checked across asynchronous
encoding, request and receipt decoding, including logout/relogin as the same
actor. Its send adapter validates receipt identity, operation/date, revision,
hash format and date payload before the existing exact-row IndexedDB deletion
transaction can run. Pilot conflicts are not retried again by the client
because its server adapter already permits at most one fresh reconcile.
Existing live client behavior keeps its default retry policy.

A date receipt alone cannot cover a calendar revision gap. The pilot retains
the immutable journal row and reports `reconcileRequired` when the commit
skipped over the client's baseline, or a replay is newer than that baseline.
Only after authenticated hydration observes that committed revision can the
same operation be acknowledged. A real two-date case proves that a colleague's
other date survives the resulting fresh read/replay. The read in that local
test is supplied from PostgreSQL to `observe`; wiring an authenticated canonical
read/hydration caller remains a mandatory pre-activation step. This is not an
automatic fresh-read implementation or a claim about byte-identical browser
serialization of the server's full-calendar hash.

One narrow correction affects the shared client: it now retains the complete
latest observed metadata with its baseline. A late older receipt can acknowledge
its own immutable journal row but cannot attach its old hash/time to a newer
revision. A later local row or peer-updated review row is still protected by
the existing IndexedDB transaction/CAS, not by a memory-only comparison.

### Realistic Verification Boundary

The opt-in `qa/session-save-pilot.playwright.config.mjs` reuses the canonical
Chromium/static-server configuration and fails if the verified PG17 toolchain
is missing. It is separate from ordinary full QA because it requires a native
database binary, not a silently skipped test. Its harness starts the existing
private Unix-socket PostgreSQL instance, applies the real dependency migrations
and receipt/context SQL, and uses the actual server policy/protocol/RPCs.
Browser IndexedDB, two pages, independent browser storage, HTTP encode/decode,
handler authentication parsing, rate guard and database transactions are real.
The external Auth response and browser-to-handler routing are synthetic; no
real Supabase token, TLS/network availability or live login proof is claimed.
All unexpected Auth fetches fail instead of reaching an external service.

Cases cover A's delayed acknowledgement with newer durable B, committed response
loss followed by reload/same-ID replay, newer colleague observation and exact
hash/revision retention, a peer moving A to review while its receipt waits,
journal delete abort after its request succeeded, logout/relogin epoch change,
canonical permission revoke, and compressed training round trip. Every case
checks the final database and journal, not just a green UI status. Synthetic
Auth metadata deliberately disagrees with the canonical membership role.

Additional API contracts reject unauthenticated/forged requests, invalid methods
and bodies, oversize input, rate-limit exhaustion, malformed scoped receipts,
missing canonical organization, multiplied retries and receipt preflight
failure before database commit. Supabase's current changelog and
[server-verified user guidance](https://supabase.com/docs/reference/javascript/auth-getuser)
were checked; no new relevant API change requires replacing the existing
authentication helper. Its existing short actor cache is unchanged; canonical
database permission checks are fresh on every pilot request/replay.

Next: finish the authenticated canonical fresh-read/reconciliation boundary,
then versioned cross-tab replay ownership and compatible unsent-edit compaction,
followed by effects/backup compatibility and the bounded-record cutover.
This checkpoint does not make the full-calendar bridge scalable to
millions of records, process existing pending migration events, activate offline
rollout, or prove the original user's timeout is eliminated. Pilot activation
still requires legacy onboarding, canonical identity verification, read-path
integration, old/new-client and staging/restore evidence plus explicit release
authorization. Overall program estimate is approximately 48%, not completion.

### Terminal Checkpoint Evidence

- Full API suite: 2873/2873 passed, including 23 new HTTP/receipt contracts.
- Real PostgreSQL plus Chromium/IndexedDB: nine scenarios repeated ten times,
  90/90 passed. This includes the calendar revision-gap/fresh-observation case.
- Existing Sessions storage/replay/atomicity and central revision browser
  regressions: 47/47 passed.
- Native receipt/history/authorization SQL regression: 57 behavioral cases and
  three parent tests passed (Node reports 60/60), with no skip or cancellation.
- Final `check`, `security:platform`, `storage:guard`, `release:rules`,
  `qa:supabase`, `qa:perf`, `architecture:budgets` and diff checks passed.
  Migration count remains 70 and the 83 architecture warnings are pre-existing.
- Increment: nine intended files, comprising four runtime/server files, four
  QA/config/helper files and this evidence record. Active `api/app-state.js`,
  `platform-auth-boot.js` and package scripts are unchanged in this increment.
- Latest fetched main remains `1061639cefedcbe3040724a14068637459d81f20`;
  candidate is behind 0. No main/staging integration, migration, remote data
  write, pilot activation or production deployment was performed.

Risk classification remains Safe Lane for future activation: this is an
inactive tested foundation, not a rollout-ready or production-verified save
path. The next checkpoint must prove authenticated canonical read/reconcile
without adopting legacy pending rows or discarding newer local operations.

## Authenticated Recovery Read Checkpoint (2026-09-16)

### Decision And Boundaries

The receipt-boundary checkpoint deliberately held pending operations when a
date receipt skipped a full-calendar revision. A receipt proves that one
operation committed; it does not contain a colleague's other-date changes.
This checkpoint closes that recovery-read gap in the inactive pilot, not in
the deployed client. System remains the saving-boundary owner. No Sessions
UI/business rules, active auth wiring, other module, SQL migration or remote
data is changed. The existing live save client and API handler are unchanged.

Reuse the existing service-only `read_session_save_context` RPC rather than
introducing another database function or a cached/global fallback. The HTTP
constructor now accepts an explicit `action: "reconcile"` carrying the same
immutable operation. This uses POST solely to carry the bounded operation
body, not to commit data. The existing verified Auth actor, API guard/rate
limit, canonical active membership/team resolution, current workspace policy
and content validation all still run. The operation must already have a
matching committed receipt. Missing, uncommitted, reused-ID or wrong-team
operations cannot receive a snapshot. Recovery is deliberately restricted to
authorized editors, not a new general-purpose reader or read-only-role grant.

The response includes the raw current calendar, its stored SHA-256/revision,
canonical actor/org/club/team and the exact operation/date. It is no-store,
uses existing bounded gzip transport and never invokes the commit RPC, writes
history/effects or changes a journal. The browser verifies the complete scope,
auth epoch, safe integer revision at least as new as the receipt, decoded size,
SHA-256 of the exact raw server bytes and calendar/date/block structure. A
same-revision snapshot must also match the receipt hash and date value. Raw
hash verification happens before parse/observe; this does not claim that later
browser JSON serialization has identical key ordering to server text.

### Recovery Invariants

- A revision gap or newer replay performs at most one recovery read in that
  send attempt. It never automatically repeats the write or starts a timer.
- A failed read, corrupt hash, oversized/invalid snapshot, scope/epoch change
  or authorization revoke leaves the exact durable journal row pending. An
  available HTTP failure status is retained rather than converted to a timeout.
- Only a verified snapshot reaches `observe`. The existing monotonic observer
  rejects a delayed snapshot when a newer calendar is already observed.
- Applying a fresh server baseline does not overwrite the journal, rebase an
  immutable edit or touch browser raw/localStorage cache. The later receipt
  acknowledgement still uses the existing exact-row IndexedDB transaction.
- B staged while A's read waits survives A's acknowledgement unchanged; B
  subsequently commits once with its original before/after semantics.
- A read failure after server commit survives reload. Replay uses the same
  operation ID, reads current authorized state and cannot duplicate its effect.

### Evidence And Remaining Work

The real local PostgreSQL/Chromium harness now crosses the HTTP recovery
boundary instead of supplying `db.state()` directly to the revision-gap case.
It also covers denied/uncommitted recovery without writes, held read plus B,
read failure/reload, permission revoke, auth epoch change, compressed snapshots
and a delayed read overtaken by a newer observation from a second canonical
account in an independent browser context. The second editor cannot read the
first actor's private operation receipt through the recovery route. A test fixture
initially compared reserialized PostgreSQL JSONB to the raw server string;
the correction checks both parsed content and the hash of the exact returned
bytes against the stored hash. No product check was loosened for this fixture.
External Auth and browser-to-handler routing remain synthetic. This is not
proof of deployed login, real Supabase network latency or production recovery.

Current Supabase changelog and server `getUser` guidance were rechecked; no
relevant breaking change affects this checkpoint's existing Auth/RPC APIs.

Next: versioned cross-tab replay ownership and safe compaction of compatible,
never-attempted edits. Keep already journaled operations immutable until that
protocol and old-client handling are proven. Initial authenticated bootstrap,
legacy identity/onboarding, module integration, effect consumers and backup/
restore compatibility, bounded domain records, staging/canary and explicit
Safe Lane authorization remain mandatory before any pilot activation. Full
calendar recovery is a compatibility bridge, not the final scalable read model.

Terminal evidence:

- Full API suite on the final tree: 2898/2898 passed, including 25 new
  snapshot/reconcile contracts. The earlier targeted API run passed 74/74.
- Fifteen native PostgreSQL/Chromium cases passed 10 repetitions (150/150).
  After strengthening two cases to use distinct canonical actors/tokens, those
  cases passed another 10 repetitions (20/20); the complete final 15/15 also
  passed. Auth-service replies remain synthetic, not production login proof.
- Existing storage/replay/atomicity/central revision browser cases: 47/47.
- Native SQL receipt/history/authorization regressions: 57 behavioral cases
  plus three parent tests, Node 60/60, no skipped or cancelled tests.
- `check`, touched-file syntax, `security:platform`, `storage:guard`,
  `release:rules`, `qa:supabase`, `qa:perf`, `architecture:budgets` and diff
  checks passed. The 70 migrations and 83 prior size warnings are unchanged.
- Exactly nine intended files: four inactive runtime/server files, four
  QA/helper files and this document. Active API/auth wiring, shared legacy
  client, package scripts and all migrations are unchanged in this increment.
- Latest fetched main is `1061639cefedcbe3040724a14068637459d81f20`, behind 0.
  No production/staging action, remote database write or pilot activation.

Overall program estimate: approximately 52%. Risk remains Safe Lane on future
activation; this checkpoint is prepared locally, not a finished platform-wide
rollout. Remaining limitations above still apply, including the unproven
original timeout attribution and the need for bounded domain-record reads.

## Versioned Cross-Tab Queue Checkpoint (2026-09-16)

### Decision And Scope

System owns this incremental save-boundary change. No Sessions UI, coaching
semantics, active API route, database schema or other module is changed. The
queued pilot remains unwired. The shared Sessions save client has optional
store coordination/iteration/acknowledgement hooks; the existing v1 store does
not implement these and retains its existing behavior. Its regressions must
remain green before this candidate is saved.

Do not compact a v1 operation: an older tab might already have sent it without
a durable claim. Use a separate `football-science-session-outbox-v2` IndexedDB
database and `sessions-queue-v2` protocol. Existing v1 pending rows and legacy
recovery copies are not adopted, rekeyed, migrated or deleted. Legacy recovery
requires an explicit reviewed onboarding path before activation.

### Invariants

- Edits become durable through a strict IndexedDB transaction before network
  scheduling. Stage errors propagate; no memory-only fallback claims success.
- A per-scope Web Lock serializes replay and review resolution across real
  same-origin pages. Scope includes actor, organization, club and team. It is
  unrelated to release orchestration and is not a machine-wide release lock.
  Waiting is bounded to 15 seconds; an active owner is never stolen. Missing
  Web Locks fails closed with local changes retained. Page closure releases
  browser ownership; a lost response reuses the exact immutable operation ID.
- Each next-row claim completes its read/write IDB transaction before send.
  `attempted: true` is permanent, including timeout, permission denial and
  response loss. Every subsequent iteration reads the current queue, not a
  stale array captured before another edit was compacted.
- Compaction requires one writer, scope, date, continuous before/after values,
  a never-attempted pending tail and the same single existing text field within
  two seconds. Allowed fields are session title and block title/objective.
  Creates, deletes/tombstones, reorder, numeric/mixed changes, other writers and
  reviews remain separate. The original before and newest after form the new
  operation; server merge/conflict/receipt rules are unchanged.
- The surviving operation receives the newest ID. A small immutable ID/hash
  ledger retains retired/acknowledged IDs, so delayed stages cannot resurrect
  discarded intermediate edits. Compaction, ID evidence and durable ordinal
  allocation share one transaction. Ordinals, not wall clocks, order delivery.
- Queue acknowledgement is exact-row CAS. Row removal and the scope's highest
  confirmed server revision commit atomically. Review changes prevent stale
  acknowledgements from clearing the new row. Corrupt ordering/claim/revision
  metadata stops replay without deleting the underlying payload.
- If another tab drained this tab's edit, an empty queue is not proof that its
  old view is current. A newer durable confirmed revision returns
  `reconcileRequired` without a stale `value`; `isSettled` also remains false
  until a fresh observation reaches that revision. This is a fail-closed guard,
  not automatic cross-tab view refresh or a new authenticated bootstrap API.
- Only network delivery uses a 250ms quiet period, capped at a one-second
  typing window. Each local stage is independently durable. Account/epoch
  changes during the wait retain the previous account's operation and do not
  post it with a new principal. Network/permission failures do not start an
  automatic retry loop.

The browser transaction and ownership choices follow the documented
[IndexedDB transaction completion](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)
and [Web Locks lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).
Neither is an authentication boundary; the existing canonical server checks
and atomic receipt/effect transaction still authorize every request.

### Activation Boundaries

This improves the inactive pilot, not today's deployed keystroke behavior. A
single text field plus domain timestamp/default changes deliberately does not
compact yet. Domain-specific normalization needs explicit integration evidence;
do not ignore real field differences just to reduce request counts.

Before activation: authenticated initial/fresh reads (including passive tabs),
legacy identity/review onboarding, module integration, bounded domain records,
effect consumers, backup/restore compatibility, cross-browser/offline support,
staging/canary and user-authorized Safe Lane still remain. Web Lock acquisition
is bounded, but the injected authenticated transport must also remain bounded.
ID-ledger retention/compaction requires a reviewed policy; no automatic pruning
or silent queue cap is introduced. Browser eviction/private-mode durability is
not guaranteed by these local tests. The original production timeout still has
not been causally attributed by this pilot.

### Terminal Evidence

- Full final API suite: 2914/2914 passed (16 new compaction/protocol contracts).
- Thirteen real IndexedDB/Web Locks cases passed ten repetitions: 130/130.
  Includes real shared-origin pages writing different dates, owner closure,
  bounded wait without theft, durable claim, exact review/ack CAS, transaction
  abort, retired IDs, malformed ordering and preserved v1 data.
- Ten new PostgreSQL/Chromium cases passed ten final repetitions: 100/100.
  Full combined pilot browser suite passed 25/25. Includes 18 edits to one
  server effect, continuous typing, A in flight plus compacted B/C, two-page
  replay and newer-view detection, owner closure, response loss/reload,
  aborted claim, account change and real HTTP rate limiting without retries.
- Existing storage/replay/atomicity/central revision browser cases: 47/47.
  Native SQL history/receipt/authorization tests: 60/60 (57 cases plus parents).
- The first combined browser run exposed a test-isolation error: independent
  synthetic databases shared a process-local actor rate bucket and hit 429.
  The fixture now starts each independent synthetic server with empty counters.
  No production limits changed. The new real-limit case exhausts the actual
  allowance within one case and proves the durable draft survives 429 with no
  retry timer or database commit. Final full and repeated runs both pass.
- `check`, changed-file syntax, `security:platform`, `storage:guard`,
  `release:rules`, `qa:supabase`, `qa:perf`, `architecture:budgets` and diff
  checks passed. Seventy migrations and 83 existing size warnings are unchanged.
- Ten intended files: four save-boundary runtime files, five QA/config/helper
  files and this document. No CSS/UI/business-rule, active API/auth, SQL,
  package/release configuration or other module changes in this increment.
- Latest fetched main: `1061639cefedcbe3040724a14068637459d81f20`, behind 0.
  No remote database writes, staging/production action or pilot activation.

Overall saving-program estimate: approximately 58%, not a platform-wide rollout.
Next checkpoint: authenticated initial/fresh-read lifecycle with scope/epoch
validation, including passive-tab reconciliation. Preserve pending generations
through that lifecycle before enabling this queue in the Sessions runtime.
