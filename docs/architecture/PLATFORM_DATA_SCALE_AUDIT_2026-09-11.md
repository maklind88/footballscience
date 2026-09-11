# Platform Data Scale Baseline

Date: 2026-09-11. Task owner: System / Security / Release.
Source baseline: `d7e263ec594af4c48f59553ed5087bd12a7d60fe` from fetched `origin/main`.
Scope: storage architecture, ownership, growth risks and migration prerequisites across the platform.
This is not a completed modernization, penetration test, production health certificate or million-record benchmark.

## Decision

Keep the existing product and stack. Finish the transition from large shared state documents to appropriately sized, server-owned domain records where growth or concurrency justifies it. Do not convert every JSON object into separate tables: an individual exercise/board or bounded appearance configuration can remain an aggregate.

The first delivery is this evidence baseline plus a read-only inventory validator and its regression tests. There are no application, API, database, feature-mode or deployment changes. The root worktree's Squad branch and untracked Video Analysis work are untouched. No other chat is instructed or activated.

## Method And Limits

- Read current governance, module contracts, protected storage registry, module folders, key API/runtime paths and migration sources.
- Query production `bustidorxevacosqhkcz` read-only for aggregate sizes/counts, table presence, RLS flags and migration checkpoints. No recommendation contents, patient/player names, credentials or full payloads were exported.
- Source inspection is of `origin/main`; no claim that every source file/feature flag is the deployed version. Production data observations and source observations are explicitly separate.
- Exact counts are labeled exact. `pg_stat_user_tables.n_live_tup` is only an estimate. Table existence and nonzero counts alone do not prove a client uses those tables.
- No login, save, load test, permission attack, recovery drill or production mutation was run in this audit. Active feature modes, browser network costs and latency remain to be measured.
- Coverage is 21 registered platform modules, all 21 current module directories, all 24 protected key contracts, plus four additional owner-grouped surfaces including RTP and account/staff.
- Coverage of those boundaries is not a line-by-line review of every implementation or every function.

## Verified Production Metadata

The inspected central table has 18 state rows, all with the legacy `global` storage namespace. Aggregate uncompressed text payload is 9,556,112 bytes. This is NOT a measured page download: permissions, batching, transport compression and selected read paths affect wire size.

| Central key / surface | Raw payload bytes | Latest revision observed |
| --- | ---: | ---: |
| Sessions | 3,986,823 | 18,696 |
| Medical | 1,940,833 | 14,775 |
| Exercise Library primary | 1,197,798 | 211 |
| Exercise Library backup mirror | 1,197,915 | 213 |
| Squad / Player Profiles | 650,345 | 1,205 |
| Periodization | 209,210 | 2,611 |
| Scouting workflow | 129,948 | 268 |
| Presentation Mode | 62,024 | 2,102 |
| Transfer Room | 50,153 | 117 |
| Gameplan | 41,084 | 283 |
| Schedule | 32,402 | 2,050 |

Do not delete the library mirror to reduce this total. Its preservation/recovery role must be understood and replaced with proven equivalent recovery first. Revisions are not a request-rate metric and do not by themselves demonstrate idle autosaves.

Other observations:

- Medical journal: exact 4,454 events; 4,037 pending, 415 processed, 2 ignored; no failed-status rows in the grouped result. Pending events span May 9 to August 25. This is not proof that those events are either lost or safely reconciled.
- Medical journal total relation size including indexes/TOAST: 54,624,256 bytes. It is the largest public relation in the inspected metadata, not necessarily the largest storage/billing consumer.
- Exact normalized recommendation/plan counts: 0 / 0. Exact `schedule_events`: 0.
- Exact `squad_players` / `squad_roster_memberships`: 29 / 29. These are projection rows, not proof all profile fields and temporary players are migrated.
- Exact `scouting_players` / `scouting_player_seasons`: 0 / 0; exact `fsdb_players`: 1,000.
- `session_planner_sessions`, `session_planner_blocks`, `exercises`, `exercise_versions`, `exercise_folders`, `periodization_days`, `tasks`, versioned Scouting dataset/source/staging tables and proposed Gameplan/Transfer/Set Pieces/Simulator tables were absent in the inspected production schema.
- All 149 inspected public tables had RLS enabled. This does not validate policy correctness, grants, RPC authorization or tenant filtering through the server role.
- All ten migration-checkpoint rows were last updated on May 17. Chat's checkpoint says reads/writes false although source contracts describe dedicated database-first Chat. Treat checkpoints as stale administrative records until reconciled with runtime evidence.

## Findings And Priority

Priority labels identify growth/recovery prerequisites, not newly reproduced production incidents. Fix implementation only after the scoped evidence and owner review establish the exact change required.

### P1: Tenant And Identity Proof Before Multi-Club Expansion

`api/app-state.js::listStateObjects` explicitly calls `listAppStateRecords("global", ...)`. Medical projection also selects that shared namespace with `FOR UPDATE`. Backend read filtering exists, but shared physical scope is not a proven multi-tenant primary data model.

Required: one server-owned organization/team identity chain; stable player-to-membership crosswalk; explicit legacy owner; negative reads/writes/deletes/exports/restores for a second organization. Do not infer an active leak solely from the word global. Do not make another organization inherit legacy data.

Sources: `api/app-state.js`, `api/_lib/app-state-records-database.js`, `api/_lib/platform-identity.js`, `supabase/migrations/20260901103202_medical_plan_canonical_projection.sql`.

### P1: Shared Documents Remain Growth And Contention Points

Medical's event RPC locks the same compatibility state row, merges JSON and updates the aggregate. Squad writes serialize the whole profile state. Sessions already has a more precise durable local change protocol, but central aggregate storage remains and its proposed domain tables are not installed in production. Preserve the existing protections; they are useful but not evidence of unlimited throughput.

Required: independent recommendation/plan/profile/session identities, bounded aggregates, transactional writes and explicit per-record conflict policy. Millions of historical records must not imply downloading or rewriting millions of records for one daily edit.

Sources: `api/_lib/medical-database.js`, Medical projection SQL, `src/modules/squad/player-profile-runtime-state-service.mjs::writePlayerProfilesState`, `src/modules/session-planner/session-save-client.mjs`, `api/_lib/session-planner-database.js`.

### P1: Recovery Coverage Must Follow Each Source Of Truth

`api/app-state-backup.js::collectCentralStateBackupEntries` covers the protected central key registry. It does not establish a restore guarantee for dedicated Chat, IDP, Video, Leaderboard, FSDB or RTP tables, nor for device-local video/tracking assets.

Required: inventory actual managed Postgres backup/PITR configuration, independently stored assets, retention and recovery objectives. Restore into an isolated environment and verify relationships/permissions as well as counts/hashes. Existing app-state restore-readiness checks are valuable but not a full platform disaster-recovery drill. No backup settings were changed or independently certified here.

### P2: Scouting Pagination Is Necessary But Not Sufficient

`api/_lib/scouting-database.js::fetchMetricFilteredSeasonRows` iterates to an offset below 50,000 in chunks of 1,000 and computes metric distributions in memory before paging. At scale this risks expensive requests and incomplete results beyond the cap. It is a source-path risk; its live use was not reproduced here.

The client prefers a ready API dataset and otherwise uses a worker/script fallback. Production's original Scouting tables were empty and versioned tables absent, so a completed server dataset migration cannot be claimed. FSDB is a separate paginated path with real rows.

Required: preserve percentile definitions, grouping and sort semantics; move filtering/ranking to measured SQL/indexes or versioned precomputed summaries. Compare results against the old calculation before switching. Do not silently change the statistical population or remove fallback prematurely.

Sources: `api/_lib/scouting-database.js:1112`, `scouting-workspace.js:2917`, `api/_lib/football-science-db.js::buildPlayerSearchParams`.

### P2: Bootstrap And Read Models Need Bounds

`platform-auth-boot.js::readCentralStateBatches` starts batches for the protected key set and combines results. Large-key isolation and Sessions gzip transport already exist; neither eliminates parsing/memory cost or all-module coupling.

The staged Sessions database reader has optional date filters, no explicit complete pagination, and one block query with all returned session IDs. The RTP library reads up to 300 profiles then filters in application code. These need completeness and bounded-query proofs before growth, not arbitrary higher limits.

Required: small auth/shell bootstrap; explicit workspace data readiness; team/date/page-scoped reads; bounded caches invalidated by principal and revision; no eager whole-history load. Clinical and coaching consumers must still read the correct selected-date source.

### P2: Documentation And Checkpoints Can Mislead

`docs/AI_HANDOFF.md` still describes app-state Storage as the general primary path and several old navigation/runtime details. `platformModules.futureTables` and migration checkpoints are aspirational, not a deployment ledger. This audit adds a dated reference without rewriting unrelated governance or toggling runtime checkpoints.

Required: distinguish schema present, data backfilled, shadow compared, primary read enabled, primary write enabled, rollback proven and compatibility retired. Record each with exact candidate/deployment/schema evidence.

### P2: Functional QA Is Not Capacity Evidence

Existing syntax, security, source contracts, browser smoke and file-size budgets protect real behavior. They do not establish database p95/p99, contention, egress, hot-team writes or a multi-million-record storage ceiling. The architecture guard currently passes with warnings about 82 module files above 500 lines; `app.js` is 6 lines and `app-runtime.js` 4,966. Further extraction alone will not solve persistence scaling.

## Module Decision Matrix

The machine-readable inventory contains source paths and responsible owners. Categories describe inspected implementation, not verified capacity.

| Module/surface | Keep | Next evidence/work |
| --- | --- | --- |
| System/auth/identity | Canonical identity foundation, guarded APIs | Tenant crosswalk, revocation, principal change, backup coverage |
| Shell/readiness/appearance | Small config and source-derived views | Separate access records from presentation and personal preferences |
| Admin/Profile/Staff | Server accounts and separate image upload | Bounded listings, lifecycle consistency, no roster duplication |
| Home/Presentation | Existing tasks/preferences and presentation sources | Tasks by owner; presentations reference source data, not snapshots as primary truth |
| Squad Room | Roster UI, temp players, IDs and history | Full identity/membership mapping; projection is currently ordinary squad only |
| Medical | Clinical ownership, coach-safe boundaries, journal/CAS | First recommendation/date-window pilot; reconcile old journal without blind replay |
| RTP/Performance | Catalogue and clinical/readiness separation | Catalogue paging; separately establish actual GPS/load ingestion ownership |
| Schedule | Existing event IDs and consumer links | Per-event writes/date windows and change/reload compatibility |
| Exercise Library | All exercises, folders, archive and versions | Immutable references/version mapping before dependent session cutover |
| Sessions/Tacticalboard | Durable change protocol, boards and print | Per-session/block storage; preserve exact visual/marker geometry |
| Periodization | Existing day/field merge and session bridge | Migrate cycles/days after schedule/session identity contracts |
| Scouting | Decision state separate from provider dataset | Verified dataset activation, SQL filtering, pagination and import rollback |
| FSDB | Provider crosswalk and bounded profile/search API | Measure million-row search; distinguish global licensed data from private scouting notes |
| Chat | Dedicated threads/messages/receipts | Reconnect/retention/polling cost and large-thread pagination |
| IDP | Dedicated development records | Bounded player history and exact Squad/video references |
| FS Player/Analysis | Dedicated metadata, local media/tracking model | Paginate clip/report reads; durable local export and recovery for large assets |
| Leaderboard | Transactional ledger and membership checks | Measure aggregation; retire roster projection only after Squad migration |
| Gameplan | Current match preparation and player-brief boundaries | Match/team aggregates and scoped evidence reads |
| Set Pieces | Existing play/phase/drawing identities | Verify live storage mode; versioned per-play persistence and lossless migration |
| Transfer Room | Confidential team workflows | Exact per-team grants/reads/writes; separate planning records |
| Simulator | Working simulation/replay semantics | Lower-priority sequence/version storage and export/restore proof |

## Execution Order And Stop Conditions

1. **Foundation evidence:** confirm exact Live modes, data/asset backup coverage and restoration; produce canonical organization/team/player mapping without writes. System/Security owns the cross-cutting evidence; Squad/Medical owners review their boundaries before changes.
2. **Medical pilot:** map one complete recommendation contract and its plans/history; compare all legacy records and pending journal events read-only. Validate IDs, timestamps, deletion/archive semantics, private/coach fields and duplicate rules. No automatic replay or processed-status updates.
3. **Isolated shadow migration:** synthetic fixtures first, then an explicitly approved backup-bound backfill with row-level hashes/counts, idempotency journal and transactional conflict handling. Prove one organization/team at a time. No production mutation under this audit authorization.
4. **Bounded Medical read/write cutover:** keep UI contracts, allow exactly one authoritative write path, reconcile writes occurring during backfill, verify both staff accounts and rollback. Never use unsupervised independent dual writes. A post-cutover rollback must preserve new writes, not restore an old snapshot over them.
5. **Squad ownership completion:** migrate remaining profile/history/membership fields, including temporary players, with stable IDs used by Medical, IDP, Leaderboard and Sessions. Canonical crosswalk proof is a dependency of the Medical pilot; full Squad UI migration need not precede it.
6. **Coaching chain:** Exercise Library/version references, then Schedule/Session records and blocks, then Periodization. Sessions work already in source should be reused, not replaced. Preserve every exercise, training date, board marker and print result.
7. **Scouting parallel design, separate release:** benchmark/replace the large scan, validate source dataset activation and cursor/sort stability. Recruitment notes/lists/Shadow XI have their own ownership and migration, separate from imports.
8. **Retain and measure dedicated-table modules:** Chat, IDP, FS Player, Leaderboard, FSDB and RTP need query/recovery evidence, not another generic app-state migration. Finish lower-volume task/plan/sequence migrations only when justified.

Stop for ambiguous ownership, incomplete backups, unmatched IDs/fields, unexplained count/hash differences, privacy regression, newer concurrent writes, or any failed required check. No direct production edits, flag flips, checkpoint edits, replay, automatic database reset or deployment is included here. The user authorizes each release explicitly in its owning chat.

## Measurable Acceptance Plan (Not Yet Run)

Proposed baseline workload, to refine with actual usage:

- Start with 1 million synthetic recommendation/history rows spread across multiple organizations and teams, plus a hot-team distribution. Separately test 1 million Scouting season rows; do not use real clinical records for load tests.
- Step from 10 to 50 to 100 concurrent authenticated virtual users. Separate read-heavy usage from simultaneous writes to different players and the same recommendation. Record actual read/write rates; concurrency alone is not a workload specification.
- Measure cold/warm reads, first page, later pages, selected-day summaries, saves and reconnects. Provisional service targets: bounded read p95 <= 300 ms, p99 <= 1 s and save acknowledgement p95 <= 1 s in the test region. These are proposed targets, not measured promises or mandatory budget changes.
- Record transferred bytes, database rows scanned, query plans, connection saturation, lock wait, retry count, p95/p99, memory and cost per workload. Measure browser-visible load separately with network/CPU constraints.
- Integrity invariants: no acknowledged change silently disappears on reload; idempotent retry creates no duplicate; stale same-record write conflicts/merges explicitly; independent-player writes do not share one aggregate row lock; pending state is never falsely marked saved.
- Security invariants: cross-org/team reads/writes/exports denied; coach responses contain no private clinical fields; caches never cross principal boundaries; imports cannot alter existing player identity silently.
- Failure matrix: 401/session expiry, 403, double 409, network loss, quota, tab close/reload, two tabs, two accounts, overlapping saves, queue lag, database error, backfill interruption and rollback with intervening writes.
- Define business RPO/RTO separately and demonstrate isolated Postgres + asset restore. A recent backup pointer is not evidence of a successful whole-platform restore.

Do not add microservices, sharding, extra caches or a new hosting provider before workload evidence justifies them. Start with correct data boundaries, bounded queries and measured Postgres indexes.

## Repeatable Inventory Check

`npm run platform:scale:audit` (or append `-- --json`) is offline and read-only. It verifies that all registered modules, module directories and protected keys have reviewed ownership, source evidence and a next action. It fails when a new boundary is missing, a key changes owner, or an evidence file is removed.

`qa/platform-data-scale-inventory.api.spec.mjs` runs in the existing API-contract suite. Passing it is not a permission, performance or migration certification. It cannot detect semantic drift inside an unchanged evidence file; that still requires review.

## Read-Only Query Recipes

Run only against the explicitly identified environment. These return metadata, never content. Schema absence is evidence, not an instruction to create anything.

```sql
select state_key, count(*) as rows,
       sum(octet_length(value)) as payload_bytes, max(revision) as revision
from public.platform_app_state_records
group by state_key order by payload_bytes desc;

select module_id, phase, reads_from_database, writes_to_database,
       app_state_fallback_enabled, updated_at
from public.platform_module_migration_checkpoints order by module_id;

select processing_status, count(*) as events, min(created_at), max(created_at)
from public.medical_state_sync_events group by processing_status;

select relname, n_live_tup as estimated_rows,
       pg_total_relation_size(relid) as total_bytes
from pg_stat_user_tables where schemaname = 'public'
order by total_bytes desc limit 45;
```

## Validation Record

The owning task runs the inventory and central data-safety API contracts using canonical Playwright configuration, plus syntax, security, storage, release rules, architecture budgets and diff checks. The first sandboxed test launch was blocked by a local listen permission; rerunning the unchanged canonical configuration with the required permission succeeded. This was a harness startup issue, not a suppressed failing assertion.

See the terminal task report for final counts. No million-row benchmark, full browser suite, production write, database migration or restore test is claimed by this document.

## Primary References

- PostgreSQL JSON document design and whole-row update locks: https://www.postgresql.org/docs/current/datatype-json.html#JSON-DOC-DESIGN
- Supabase query plans and workload-aligned indexes: https://supabase.com/docs/guides/database/query-optimization
- Existing ownership: `docs/CODEX_TEAM_ROSTER.md`, `docs/MODULE_CONTRACTS.md`, `src/core/data-safety-contracts.cjs`.
