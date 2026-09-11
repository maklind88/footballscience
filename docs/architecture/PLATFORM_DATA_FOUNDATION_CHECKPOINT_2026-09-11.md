# Data Foundation Checkpoint

Owner: System / Security / Release. Affected data owners: Squad, Medical; later Exercise Library, Schedule, Sessions and Periodization. No other task has been activated.
Source baseline: `d7e263ec594af4c48f59553ed5087bd12a7d60fe`. Production observations: 2026-09-11, latest crosswalk snapshot at 13:39:18 UTC.

## Decision

Do not start a data migration or switch Medical reads. The existing data is still in the current app-state layer; the incomplete target crosswalk is a migration prerequisite failure, not evidence that these records have been lost.

This step adds a repeatable read-only SQL inspection and pure evidence assessor, with negative tests. No runtime, API, auth, write path, schema, checkpoint flag, event status, release or production data changes.

## Identity Evidence

One active legacy organization/club/team chain and one explicit Platform-to-Squad team link were found. The 20 active profiles and 20 active memberships have no orphan club/organization or mismatched team scope in the inspected joins. Two users without an exact team-level membership have organization-level admin memberships; the initial strict team-only check must not classify them as missing users.

The Squad team's nullable club reference is not the same contract as Platform's club reference. The checked projection RPC requires explicit matching organization/team IDs plus the tenant link; the read-only audit follows that contract, not an invented requirement that every legacy club field already be populated. Full future membership/history migration still needs its own validation.

| Source collection | Entries | Distinct player IDs | Entries with one current target player | No current target player |
| --- | ---: | ---: | ---: | ---: |
| Squad players | 45 | 45 | 29 | 16 |
| Medical players, including archive | 49 | 49 | 29 | 20 |
| Medical recommendations/history records | 4,136 | 43 | 4,011 | 125 |
| Medical injury plans | 11 | 8 | 10 | 1 |

No missing/duplicate item IDs or ambiguous matching target IDs were observed in these collections. Every Medical record/plan references a player present in Medical's own source roster. Every mapped current target player has one active target-team membership. None of these counts establishes clinical payload equality or complete migration.

The 16 Squad players outside the current projection comprise 11 academy, four trialist and one guest players. Medical's 20 additionally include four archived players. Current projection code intentionally selects ordinary squad players only. Do not expand that projection indiscriminately: Leaderboard and other consumers rely on its current selection semantics.

83 Medical records and one plan reference players absent from the current Squad source roster, but present in Medical's source roster. Preserve their historical identities rather than deleting them or matching names. One academy player has a different countsInSquad flag between the two sources; it is not an instruction to rewrite either module's business rules.

The 4,037 pending Medical sync events from the earlier audit have NOT been replayed, marked processed, deleted or proven reconciled. They are a separate journal-to-source comparison, not equivalent to the 125 unmapped records.

## Recovery Evidence

Existing GitHub Production Monitor run [34593428083](https://github.com/maklind88/footballscience/actions/runs/34593428083) completed successfully on the source baseline at 11:21 UTC. Its logs show:

- App-state backup at 08:00 UTC: freshness passed at 200 minutes old, 18 entries.
- Restore readiness: 24 protected keys accounted for, 18 present entries.
- Restore drill: 18 entries parsed across 15 modules, **no writes**.
- Backup endpoint protection and staging/live isolation passed; six authenticated live checks passed.

These are historical observed results, not a new live test performed by this task. The workflow file is `production-smoke.yml`, despite its display name Production Monitor. Local backup-status and Supabase Management API credentials were unavailable; no secret was exported or operational workflow started to bypass this.

| Recovery surface | What is demonstrated | Still required before migration |
| --- | --- | --- |
| App-state document backup | Existing monitor parsed/validated latest backup | Isolated restore and equality against captured source revisions |
| Identity tables | Snapshot/hash/rollback-plan code has contract coverage | Actual scoped pre-write snapshot and isolated recovery proof |
| Dedicated tables and Medical journal | Present in Postgres; no full restore performed | Verify actual managed backup/PITR mode, retention and restore point; restore relationships/RLS/functions |
| Storage assets | Metadata: 159 app-state objects, one Chat attachment, four profile images, zero RTP media objects | Verify independently recoverable object bytes and access policies |
| Device-local FS Player media | Separate from central DB backup | Verify export/import and device-loss recovery with its owner |

The app-state bucket contains 132 app-state backup objects and zero objects under the current `backups/platform-identity/` prefix. This does not prove there is no identity backup elsewhere. Object metadata/counts alone do not prove bytes can be restored.

Supabase database backups do not include Storage object bytes: [official backup documentation](https://supabase.com/docs/guides/platform/backups). Do not treat a successful Postgres restore as proof that attachments/images or device-local files are recovered.

## Repeatable Check

1. Run `scripts/sql/platform-identity-foundation-audit.sql` through the approved read-only database connection for the explicitly selected environment. It is one SELECT statement/consistent snapshot, not a migration. Schema absence or malformed JSON must be investigated, not replaced with an empty success.
2. Review the aggregate `evidence` output. It contains source revisions/hashes and counts, no names or recommendation contents.
3. Independently re-read the two current source revisions/hashes before comparing with `assessIdentityFoundation(evidence, { expectedSources, now })` in `scripts/lib/platform-identity-foundation-audit.mjs`. Do not use old evidence as its own current-source comparison.
4. Any new/unmapped player, duplicate ID, ambiguous mapping, missing collection, changed source or stale evidence blocks a complete crosswalk claim. The default freshness window is one hour for this audit, not a production SLA or migration lock.
5. A complete crosswalk still returns `migrationAuthorized: false` and `recoveryVerified: false`. This utility is not connected to deployment and cannot approve writes. Re-read mapping/identity data and validate transactional preconditions at the eventual migration boundary; a local evidence check cannot prevent later changes.

The SQL's explicit server-side legacy markers select only the existing legacy source owner. They are not a universal default for new teams or an authorization mechanism. New teams must never inherit this global source or be matched through display names. The present query is a scoped legacy audit, not certification of every future tenant.

## Continuous Creation Is Required

The user explicitly requires ongoing creation of teams, players, exercises, training sessions, schedules and periodization. This is not a one-off conversion of today's fixed dataset. Counts above are observations, never product limits, migration filters or expected permanent totals.

| New or changed entity | Required future data contract |
| --- | --- |
| Organization/team | Server-established tenant/membership, isolated empty domain data, no legacy/global fallback for another tenant |
| Player | Stable player identity plus team membership/history; transfers and temporary/archive states do not rewrite prior recommendations |
| Medical record/plan | Stable record ID, correct player/team/time scope, idempotent versioned write; clinical/coach projection remains explicit |
| Exercise | Stable identity and version references; editing a library item must preserve the existing saved-session semantics |
| Session/schedule event | Stable linked IDs, per-record revision, selected-date reads; retry must not duplicate or lose a new event |
| Periodization cycle/day | Versioned cycle/day relationships; new cycles/dates do not require hardcoded calendar or roster changes |

Acceptance before cutover must include create, update, archive/delete and retry while a backfill is running; two users and two tabs; a new team; a transferred/temporary player; a new exercise/session/schedule/cycle; and fresh reads after commit. Existing UI and business rules remain the contract unless separately approved.

Take a consistent baseline, track subsequent accepted changes with durable per-domain versions/checkpoints, and reconcile through a defined cutover watermark. Keep exactly one authoritative write path; do not run independent old/new writes and assume they agree. A stale migration snapshot must not overwrite newer content. Retry/restart is idempotent and must preserve deletions, archives and newer generations. Implementation of that protocol remains subject to owner review and staging evidence.

## Offline Compatibility Is A Migration Prerequisite

User requirement added 2026-09-11: the platform is planned to support offline work. Every domain migration must preserve that possibility, including records created after a device disconnects. This section records requirements, not a completed offline implementation or an approval to cache all data.

Existing source building blocks: `src/modules/session-planner/session-save-store.mjs` provides scoped IndexedDB journal records outside rotating snapshots; `session-save-client.mjs` retains immutable changes pending matching receipts; `session-save-protocol.mjs` defines change IDs, merge rules and deletion tombstones. Video Analysis has its own scoped correction outbox. These are domain contracts to preserve and review, not evidence of platform-wide offline readiness or a reason to replace them with a generic queue.

The earlier `docs/MOBILE_APP_SHELL.md` is not the complete desktop/offline specification. Current `footballscience-sw.js` handles push/notification lifecycle, not fetch caching; an installable shell is not proof of cold-start offline operation. Shared accepted state remains server-authoritative; an unsynced local draft is separate, retained user work, not a second independently writable server source of truth.

### Existing Desktop Plan, Not A New Competing Architecture

On the user's direction, the task **FS Desktop APP** (`01a05596-d845-7491-98a4-8b8d2e65352c`) was read for context only. GitHub [PR #201](https://github.com/maklind88/footballscience/pull/201) was verified open/draft/unmerged on 2026-09-11, head `df4af02f85226cbe11553a307605c68b3cd0c86f`, branch `codex/fs-desktop-offline-local-integration`. These are draft/local implementation contracts, not deployed capability. No message or operational instruction was sent to that task; its branch/files were not changed.

Pinned source documents, read from that branch without merging it:

- [Offline capability matrix](https://github.com/maklind88/footballscience/blob/df4af02f85226cbe11553a307605c68b3cd0c86f/docs/desktop-offline/OFFLINE_CAPABILITY_MATRIX.md).
- [Session Planner vertical slice](https://github.com/maklind88/footballscience/blob/df4af02f85226cbe11553a307605c68b3cd0c86f/docs/desktop-offline/SESSION_PLANNER_VERTICAL_SLICE.md).
- [Synchronization boundary](https://github.com/maklind88/footballscience/blob/df4af02f85226cbe11553a307605c68b3cd0c86f/docs/desktop-offline/SYNC_BOUNDARY_RECOMMENDATION.md).
- [Data sensitivity](https://github.com/maklind88/footballscience/blob/df4af02f85226cbe11553a307605c68b3cd0c86f/docs/desktop-offline/DATA_SENSITIVITY_MATRIX.md) and [native SessionAuthority](https://github.com/maklind88/footballscience/blob/df4af02f85226cbe11553a307605c68b3cd0c86f/docs/desktop-offline/SESSION_AUTHORITY_SECURITY.md).

Preserve that direction: Tauri/native desktop, a bounded SQLite projection and atomic entity/outbox transaction, durable receipts, typed bridge commands, a single native credential owner, signed/compatible frontend generations and guarded FS API synchronization. Do not mandate browser IndexedDB as the native store or build another desktop sync engine here. The web's existing Sessions journal is a separate client implementation whose semantics must remain compatible. Native desktop evidence does not certify iPad/browser offline behavior.

The initial desktop slice is selected Session Planner content; its synthetic prototype supports only `session.rename` v1 and `block.duration.set` v1. Library editing is later; Schedule/Periodization/minimal Squad identities are initially read-only. **Medical/RTP, IDP, Chat bodies, Scouting dossiers, Transfer and admin data are online-only initially.** Medical database scaling does not authorize offline clinical caching. Minimum player references downloaded for Sessions must not carry embedded Medical summaries or other excluded content.

The recommended public sync boundary is a guarded FS API, with server-derived scope and a private transactional domain/idempotency routine, not desktop-to-table writes. Prototype SQL/adapters are not deployed; full real-account/native-backend integration must not be inferred from synthetic test success. The draft's 24-hour offline lease is a prototype value, not an approved production retention/access policy.

Before connecting real data, reconcile web `session-date-change-v1`, desktop typed operations and proposed relational session IDs/revisions/receipts. Both clients must affect the SAME authoritative domain state. A successful operation in isolated prototype/shadow tables while web app-state remains unchanged is not production sync. Pending operations, deduplication and acknowledgement retention must survive the eventual storage cutover. System owns this shared server/data compatibility review; Desktop and Sessions retain their respective client/domain implementations. No implementation in those modules begins under this documentation task.

### Required Compatibility Checks

- **Durable drafts before success:** persist supported offline edits transactionally before reporting local success. Distinguish local/pending, syncing, server-confirmed and conflict states. Quota, failed storage, eviction and device loss must not be disguised as successful central saves. Preserve/export unsynced work through an approved recovery path; browser storage is not an unlimited backup.
- **Stable identity and dependencies:** new entities need stable IDs before network acknowledgement where offline creation is supported. Queue parent/child references explicitly, for example player -> recommendation or exercise version -> session block. Reconnect must not rename existing identities, duplicate a create or silently attach content to a different team. Creating organizations/memberships or assigning permissions still requires server authorization; an offline draft cannot grant access.
- **Scoped operations, one server write path:** retain operation ID, entity ID, actor/organization/team scope, protocol version, base revision and payload for the supported domain command. Use the domain's guarded API for both immediate and delayed writes. Validate current authorization on reconnect; account/team changes must never adopt another principal's queue. Loss of access preserves work only through a reviewed secure recovery policy, not a permission bypass.
- **Explicit conflicts and deletion history:** retry the same operation idempotently. Clear only its matching receipt/generation. Merge only where domain rules prove it safe; otherwise retain both versions for review. Do not use device clocks or blanket last-write-wins to override clinical/coaching data. Tombstone/history retention must cover the supported offline interval or require explicit stale-client reconciliation so deleted data cannot reappear.
- **Bounded data and privacy:** define a user/team/date-window working set, not a whole-platform or million-record download. Record last-sync age and unavailable data. Approve Medical offline fields, device controls, retention and access-expiry policy before caching clinical content. First login, revoked permissions and never-downloaded records cannot be verified from a disconnected server; offline scope and any freshness limits need explicit product/security decisions.
- **Cold start and upgrades:** design app-shell caching separately from authenticated domain storage. Do not indiscriminately cache API/auth responses. A release, IndexedDB upgrade, service-worker refresh or migration rollback must preserve pending operations and reconcile their schema version. Returning old clients need a compatible adapter or a non-destructive upgrade/review path; do not retire a legacy write contract while its supported offline clients can still return. Background sync is an optimization, not the only recovery trigger.
- **Cutover with disconnected devices:** a database-only snapshot does not contain offline drafts. Capture/reconcile a consistent server baseline while accepting later versioned operations, including delayed pre-cutover operations. Restore/rollback must reconcile surviving local queues against restored server state without losing acknowledged newer data or falsely accepting obsolete receipts. Identify maximum supported offline duration and acknowledgement/history retention before cutover, not afterwards.

Required future regression matrix: disconnect before/after server commit and receipt; close/reopen offline with pending edits; two devices editing the same entity; create a linked player/exercise/session offline then reconnect; delete/archive against a stale device; account/team switch; permission revoke; quota/eviction; old-client return after schema migration; and backup restore with an outstanding local queue. Run on desktop and iPad target environments. These new offline acceptance cases have NOT been executed by the current evidence-only checkpoint.

## Next Ordered Actions

1. Complete a read-only historical/temporary-player crosswalk proposal. Use existing IDs and explicit membership provenance; never auto-match names or add archived players to the active playing squad. System owns the shared mapping proof, Squad/Medical own their source semantics.
2. Verify managed DB backup configuration and prepare an isolated restore drill covering the journal, identities, domain tables and relevant assets. Reuse the existing snapshot/hash tools. Do not restore into production or overwrite shared staging.
3. Before implementing the pilot, reconcile it with PR #201's working-set, privacy, native-session and command/receipt contracts. Medical remains online-only initially; selected Session Planner offline support is a separate sequence from Medical database scaling. Resolve supported disconnected duration and web/native compatibility without activating other tasks.
4. Only after those prerequisites pass, compare the Medical journal and complete source payloads read-only, then build the synthetic shadow migration with ongoing-create/edit/delete and disconnected-client recovery tests.
5. No real backfill/cutover occurs before backup-bound approval and Safe Lane evidence. The user must explicitly authorize deploy in this task.

This checkpoint is preparation. It does not complete the platform modernization or prove million-record performance.

## Validation Record

- Exact committed SQL text executed read-only on production; source revisions/hashes independently re-read afterwards. The assessor reported four incomplete collections, not a green migration certificate.
- Canonical local Playwright API-contract run: 54/54 passed, including 14 new foundation cases, existing identity snapshot/command contracts, inventory and data-safety contracts. All write/restore scenarios in these tests use fixtures/mocks, not production.
- `npm run check`, `platform:scale:audit`, `security:platform`, `storage:guard`, `release:rules`, `architecture:budgets` and diff checks passed. Existing size warnings remain; no budgets were increased.
- Dynamic count tests include a million as a numeric aggregate only. They are not million-row database/load tests.
- Full platform restore, live identity mutation, Medical replay, full browser regression and performance load testing were not run.
