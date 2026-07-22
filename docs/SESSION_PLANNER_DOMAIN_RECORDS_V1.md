# Session Planner Domain Records v1

## Status

Planned, additive, and disabled by default. Pure shadow comparison, content-free backfill planning, private snapshot integrity, and rollback projection verification are implemented but are not wired into user-facing reads or writes.

- Existing source of truth: `football-session-planner-v3` through `/api/app-state`.
- Target pilot tables: `session_planner_sessions` and `session_planner_blocks`.
- Current migration checkpoint: `planned`.
- Database reads: disabled unless both shadow mode and an exact organization/team canary scope are configured.
- Database writes: disabled.
- App-state fallback: required.

This foundation must not change Session Planner UI, autosave, navigation, permissions, or saved content.

## Current State

Session Planner already has a modular frontend and focused contract coverage. Its shared state is still persisted as one JSON document containing every session and block. Browser-local persistence is cache-only, but the compatibility document is large enough to exceed common `localStorage` limits when combined with other modules.

Production-safe read-only inspection on 22 July 2026 found:

- 46 session dates at source revision 300.
- 156 active blocks.
- Largest block payload approximately 31 KB.
- 95th percentile block payload approximately 22 KB.
- Full compatibility document approximately 1.9 MB.
- 64 deletion tombstones and no invalid selected-block references.
- Source hash matched the persisted database hash.

The same inspection found that the production Platform Identity tables currently contain no organization, club, team, or membership rows. This is an intentional fail-closed migration blocker: domain records must not be backfilled until a canonical organization and team have been created and verified through the Platform Identity Safe Lane.

The incident fixed in `f66be1de` made central hydration survive a full browser cache. Domain records remove the underlying megadocument dependency instead of relying on that fallback forever.

## Risks

- Losing or reordering blocks during transformation.
- Treating local UI context such as `selectedDate` as shared team data.
- Cross-tenant reads or writes.
- Two sources of truth drifting during migration.
- Old browser tabs overwriting newer records.
- Payloads growing back into unbounded documents.
- Compatibility tombstones or reduction guards being dropped before they are translated into archived domain records.
- Removing compatibility data before rollback is proven.

## Recommended Solution

Use a modular monolith with module-owned, bounded records:

- One session record per organization, team, date, and slot.
- One block record per session block.
- Flexible block content remains JSONB so existing tactical and board fields are preserved.
- Block JSON is capped at 256 KB, more than eight times the largest observed block; larger media belongs in object storage.
- Query-critical identity, tenant, order, revision, and audit fields remain typed columns.
- Local UI fields remain browser-local.
- Server APIs own writes and enforce permissions, revisions, idempotency, audit, and tenant scope.
- Realtime signals may invalidate a record later, but the signal must never become the data source.

Database reads are gated by both values below. A mode without an exact scope pair performs no read:

```bash
SESSION_PLANNER_DATABASE_MODE=shadow
SESSION_PLANNER_DATABASE_SCOPES=<organization-uuid>:<team-uuid>
```

Multiple canary scopes are comma-separated. Wildcards are intentionally unsupported. Every returned session and block must match the requested tenant, supported schema version, positive row revision, unique identity/order, and stored content hash before comparison can run.

## Alternatives Rejected

### Keep enlarging the compatibility document

This preserves implementation simplicity but repeats the browser quota, slow hydration, and broad-write risks.

### Fully normalize every Session Planner field now

This provides strong relational constraints but creates an unnecessarily large migration and makes evolving tactical payloads expensive.

### Build a generic platform document store

This is flexible but risks creating another central monolith without clear domain ownership.

### Introduce microservices or event sourcing

Both add operational complexity without solving the current ownership and payload-boundary problem.

## Data Contract

### Shared domain data

- Session identity, date, title, theme, selected block identity.
- Block identity, ordering, complete block payload, and schema version.
- Tenant scope, revision, hashes, timestamps, and audit actor.

### Local-only UI data

- Selected date.
- Open panel/modal state.
- Scroll position.
- Temporary selection state.

### Migration-only compatibility metadata

- App-state revision and hash.
- Shadow comparison result.
- Backfill run status and counts.
- Rollback readiness.

## Migration Plan

1. **Planned:** Add inert schema, pure transformer, read-only adapter, contracts, and migration checkpoint.
2. **Dry-run:** Read the existing app-state document and produce an in-memory migration report. No database writes.
3. **Identity prerequisite:** Verify one canonical organization/team and its memberships. Never infer tenant ownership from labels or legacy browser IDs.
4. **Backfill:** The read-only planner now translates deletion tombstones into archive actions, emits deterministic create/update/restore actions with expected revisions, and blocks unexplained active records. It has no apply path; app-state remains primary.
5. **Shadow:** Read both sources server-side and compare canonical hashes. The comparison contract is now implemented, scope-gated, content-free, and fail-closed; runtime invocation remains disabled until backfill data exists. Return app-state only.
6. **Database read canary:** Enable database reads for a controlled tenant with immediate app-state fallback.
7. **Transactional write:** Write domain records with expected row revisions and compatibility projection in one controlled server operation.
8. **Database primary:** Promote only after repeated multi-user, reload, restore, and tenant-isolation proof.
9. **Compatibility retirement:** Keep the last verified app-state snapshot until rollback and retention requirements are satisfied.

Do not keep two independent client write pipelines. Any temporary compatibility write must be performed by one server-owned transaction or command boundary.

The dry-run command is intentionally read-only and has no apply mode:

```bash
npm run session-planner:domain:dry-run -- --json
```

It resolves exactly one active team, reads only the compatibility record, verifies the source hash, performs a golden-master round trip, checks payload budgets, counts tombstones, and prints no coaching content.

## Rollback

- Feature mode defaults to `off`.
- `planned` and `shadow` modes cannot change user-facing reads.
- App-state remains untouched during dry-run and backfill.
- A read canary falls back to the exact app-state value on any mismatch or database error.
- Shadow reports contain only scope identifiers, counts, hashes, status, and reason codes; coaching content is never emitted.
- A private migration snapshot is integrity hashed before any future apply. Its public summary contains counts and hashes only.
- Rollback planning accepts only the exact baseline snapshot and backfill plan, requires expected post-backfill revisions/hashes, restores pre-existing rows, archives rows created by the backfill, and blocks concurrent drift or unknown rows.
- Pure rollback projection verification proves the generated actions reconstruct the baseline projection without changing a database. This is contract evidence, not a substitute for the required staging apply/rollback/reapply drill.
- Database-primary promotion requires a known-good compatibility snapshot and restore drill.
- Code rollback happens before any data restoration.

## Validation Plan

Every checkpoint must prove:

- Golden-master round trip preserves all shared session and block fields.
- Local UI fields do not enter shared records.
- Duplicate or missing block identities fail loudly.
- Cross-tenant records cannot be composed or read.
- Records remain below enforced payload budgets.
- Block ordering is stable.
- Old revisions cannot overwrite new revisions.
- Two users see the same saved session after reload.
- App-state remains readable throughout migration.
- Backup and restore include the compatibility state until final retirement.

Required gates before any database-facing release:

```bash
npm run check
npm run qa:contracts
npm run qa:supabase
npm run security:platform
npm run qa
```

Production activation requires the Safe Lane, staging comparison, authenticated multi-user smoke, and explicit production verification.

The identity prerequisite now includes a separate integrity-checked snapshot and rollback contract. Session Planner backfill remains blocked until the identity operation has passed that complete staging drill; adding identity tables or a successful dry-run alone is not sufficient.
