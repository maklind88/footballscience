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
5. A complete crosswalk still returns `migrationAuthorized: false` and `recoveryVerified: false`. This utility is not connected to deployment and cannot approve writes. Re-read mapping/identity data and validate transactional preconditions at the eventual migration boundary; an offline check cannot prevent later changes.

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

## Next Ordered Actions

1. Complete a read-only historical/temporary-player crosswalk proposal. Use existing IDs and explicit membership provenance; never auto-match names or add archived players to the active playing squad. System owns the shared mapping proof, Squad/Medical own their source semantics.
2. Verify managed DB backup configuration and prepare an isolated restore drill covering the journal, identities, domain tables and relevant assets. Reuse the existing snapshot/hash tools. Do not restore into production or overwrite shared staging.
3. Only after those prerequisites pass, compare the Medical journal and complete source payloads read-only, then build the synthetic shadow migration with ongoing-create/edit/delete tests.
4. No real backfill/cutover occurs before backup-bound approval and Safe Lane evidence. The user must explicitly authorize deploy in this task.

This checkpoint is preparation. It does not complete the platform modernization or prove million-record performance.

## Validation Record

- Exact committed SQL text executed read-only on production; source revisions/hashes independently re-read afterwards. The assessor reported four incomplete collections, not a green migration certificate.
- Canonical local Playwright API-contract run: 54/54 passed, including 14 new foundation cases, existing identity snapshot/command contracts, inventory and data-safety contracts. All write/restore scenarios in these tests use fixtures/mocks, not production.
- `npm run check`, `platform:scale:audit`, `security:platform`, `storage:guard`, `release:rules`, `architecture:budgets` and diff checks passed. Existing size warnings remain; no budgets were increased.
- Dynamic count tests include a million as a numeric aggregate only. They are not million-row database/load tests.
- Full platform restore, live identity mutation, Medical replay, full browser regression and performance load testing were not run.
