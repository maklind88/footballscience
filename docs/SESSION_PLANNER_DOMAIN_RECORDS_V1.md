# Session Planner Domain Records v1

## Status

Planned, additive, and disabled by default.

- Existing source of truth: `football-session-planner-v3` through `/api/app-state`.
- Target pilot tables: `session_planner_sessions` and `session_planner_blocks`.
- Current migration checkpoint: `planned`.
- Database reads: disabled.
- Database writes: disabled.
- App-state fallback: required.

This foundation must not change Session Planner UI, autosave, navigation, permissions, or saved content.

## Current State

Session Planner already has a modular frontend and focused contract coverage. Its shared state is still persisted as one JSON document containing every session and block. Browser-local persistence is cache-only, but the compatibility document is large enough to exceed common `localStorage` limits when combined with other modules.

Production-safe read-only inspection on 22 July 2026 found:

- 45 session dates.
- 157 blocks.
- Largest block payload approximately 31 KB.
- 95th percentile block payload approximately 22 KB.
- Full compatibility document approximately 1.9 MB.

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
3. **Backfill:** Translate deletion tombstones into archived rows and copy active records idempotently while app-state remains primary.
4. **Shadow:** Read both sources server-side and compare canonical hashes. Return app-state only.
5. **Database read canary:** Enable database reads for a controlled tenant with immediate app-state fallback.
6. **Transactional write:** Write domain records with expected row revisions and compatibility projection in one controlled server operation.
7. **Database primary:** Promote only after repeated multi-user, reload, restore, and tenant-isolation proof.
8. **Compatibility retirement:** Keep the last verified app-state snapshot until rollback and retention requirements are satisfied.

Do not keep two independent client write pipelines. Any temporary compatibility write must be performed by one server-owned transaction or command boundary.

## Rollback

- Feature mode defaults to `off`.
- `planned` and `shadow` modes cannot change user-facing reads.
- App-state remains untouched during dry-run and backfill.
- A read canary falls back to the exact app-state value on any mismatch or database error.
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
