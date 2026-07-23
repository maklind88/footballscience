# Session Planner Domain Records v1

## Status

Planned, additive, and disabled by default. Pure shadow comparison, a scope-gated GET-only operational shadow check, a GET-only operational backfill review, content-free backfill planning, private snapshot integrity, audit-context hardening, rollback projection verification, a guarded staging-only drill candidate, an authenticated two-user app-state canary with interruption recovery, a local read-only evidence reviewer, and an integrity-bound staging read-promotion gateway are implemented but are not wired into user-facing reads or writes.

- Existing source of truth: `football-session-planner-v3` through `/api/app-state`.
- Target pilot tables: `session_planner_sessions` and `session_planner_blocks`.
- Current migration checkpoint: `planned`.
- Database reads: disabled unless both shadow mode and an exact organization/team canary scope are configured.
- Application database writes: disabled. The staging drill is a separate operator-only candidate and cannot target production.
- App-state fallback: required.

This foundation must not change Session Planner UI, autosave, navigation, permissions, or saved content.

## Evidence checkpoint

| Requirement | Current evidence | Status |
| --- | --- | --- |
| Golden-master preservation and local UI exclusion | `qa/session-planner-domain-records.api.spec.mjs` | Contract proven |
| Exact module ownership of bounded tables | `src/core/platform-contracts.mjs`, `qa/session-planner-domain-schema.api.spec.mjs` | Contract proven |
| Tenant scope, RLS, revision, audit, archive, and payload limits | `qa/session-planner-domain-schema.api.spec.mjs`, `qa/session-planner-postgres-drill.api.spec.mjs` | Contract and local PostgreSQL proven |
| Read-only backfill review | `qa/session-planner-backfill-review.api.spec.mjs` | Contract proven |
| Scope-gated, content-free shadow comparison | `qa/session-planner-shadow.api.spec.mjs`, `qa/session-planner-shadow-check.api.spec.mjs` | Contract proven; real staging comparison pending |
| Repeated shadow-evidence gate | `qa/session-planner-shadow-evidence.api.spec.mjs` | Contract proven; three real staging reports pending |
| Hash-bound promotion evidence review | `qa/session-planner-promotion-evidence.api.spec.mjs` | Contract proven; real reports and manual review pending |
| Staging read promotion and exact fallback | `qa/session-planner-read-promotion.api.spec.mjs`, `qa/session-planner-read-gateway.api.spec.mjs` | Contract proven; deliberately not wired into `/api/app-state` |
| Atomic stale-write rejection and transaction rollback | `qa/session-planner-postgres-drill.api.spec.mjs` | Local PostgreSQL proven |
| Integrity-bound recovery and rollback | `qa/session-planner-migration-safety.api.spec.mjs`, `qa/session-planner-staging-recovery.api.spec.mjs` | Contract proven; real staging drill pending |
| Platform Identity prerequisite | Platform Identity snapshot/capture/rollback contracts | Real staging proof pending |
| Multi-user reload and unchanged user behavior | Existing central-state/browser regression plus `qa/session-planner-staging-canary.api.spec.mjs` and `qa/session-planner-staging-canary-recovery.api.spec.mjs` | Contract proven; real staging canary pending |
| Production promotion | Safe Lane, staging isolation, repeated shadow equality, rollback readiness, and explicit production verification | Blocked until all pending staging evidence is green |

Contract or local PostgreSQL evidence must never be reported as proof that a real
staging or production operation succeeded. Pending rows above remain release
blockers even when the repository test suite is green.

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

Only `planned` and `shadow` are accepted modes in this checkpoint. A value such as `database` deliberately resolves to `off`; database-primary reads cannot be enabled by configuration until the separate canary gateway, immediate app-state fallback, and promotion contract exist, pass real staging proof, receive explicit approval, and are deliberately wired.

The separate read gateway now exists as inert candidate code. It is disabled by
default and is deliberately not imported by `/api/app-state`. Even in its only
accepted `staging-canary` mode it requires all of the following before attempting
a database read:

- Exact staging Supabase URL/project ref and a different canonical production ref.
- Exact organization/team allowlist.
- An active Platform Identity membership that covers the same team.
- The exact current app-state revision and raw value hash.
- A reviewed, integrity-bound promotion receipt that expires within 24 hours,
  identifies its reviewer, and binds the exact identity, shadow, migration,
  canary, app-state, gateway, and fallback-contract hashes.
- Platform Identity rollback proof, repeated shadow equality, apply/rollback/reapply
  proof, authenticated two-user reload/stale-write proof, and compatibility
  snapshot/restore proof.

Any missing, stale, altered, cross-tenant, unavailable, or mismatching evidence
returns the exact existing app-state bytes. The gateway has no write, backfill,
promotion, or automatic activation capability.

`npm run session-planner:promotion:review` is a local review-only command. It
reads four bounded content-free JSON reports plus fixed repository source and
contract files. It has no network, database credential, write, feature-flag,
deploy, or activation capability. Its output is a sealed content-free receipt,
not permission to change runtime configuration.

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
5. **Shadow:** Read both sources server-side and compare canonical hashes. The comparison contract and operator check are implemented, scope-gated, content-free, and fail-closed; automatic runtime invocation remains disabled until backfill data exists. Return app-state only.
6. **Database read canary:** The inert staging-only promotion/read gateway contract is implemented. Runtime wiring remains blocked until real staging evidence is complete and reviewed. When eventually connected, it can select domain records only for the exact promoted tenant and otherwise returns the exact app-state bytes.
7. **Transactional write:** Write domain records with expected row revisions and compatibility projection in one controlled server operation.
   An inert, server-only atomic RPC contract is now prepared for the staging drill. It locks the exact app-state source checkpoint, serializes by team, validates actor/tenant/revisions, writes the migration ledger, and rolls the entire call back on any exception. Client roles have no execute grant and application runtime has no call site.
8. **Database primary:** Promote only after repeated multi-user, reload, restore, and tenant-isolation proof.
9. **Compatibility retirement:** Keep the last verified app-state snapshot until rollback and retention requirements are satisfied.

Do not keep two independent client write pipelines. Any temporary compatibility write must be performed by one server-owned transaction or command boundary.

The dry-run command is intentionally read-only and has no apply mode:

```bash
npm run session-planner:domain:dry-run -- --json
```

It resolves exactly one active team, reads only the compatibility record, verifies the source hash, performs a golden-master round trip, checks payload budgets, counts tombstones, and prints no coaching content.

After that checkpoint has been reviewed, the operational planner can read the scoped target records and create a private in-memory snapshot plus a content-free action report:

```bash
npm run session-planner:backfill:plan -- \
  --target staging \
  --expected-project-ref <supabase-project-ref> \
  --organization-id <organization-uuid> \
  --team-id <team-uuid> \
  --expected-source-revision <revision> \
  --expected-source-hash <sha256> \
  --json
```

The command fails before tenant or target reads if the configured Supabase project does not match the explicitly reviewed project ref. It performs GET requests only, includes active and archived rows in the private snapshot, prints no coaching payloads, and has no apply option. The audit hardening migration records the authenticated or server-supplied actor and bounded request correlation when a future server-owned write transaction is introduced; it does not enable that write path.

After a staging backfill, run the separate read-only shadow check repeatedly against the exact reviewed source checkpoint. It requires both the `shadow` mode flag and the exact tenant allowlist, keeps app-state as the user-facing source, and exits non-zero on any mismatch, pending action, blocker, project mismatch, or disabled scope:

```bash
SESSION_PLANNER_DATABASE_MODE=shadow \
SESSION_PLANNER_DATABASE_SCOPES=<organization-uuid>:<team-uuid> \
npm run session-planner:shadow:check -- \
  --target staging \
  --expected-project-ref <staging-supabase-project-ref> \
  --organization-id <organization-uuid> \
  --team-id <team-uuid> \
  --expected-source-revision <revision> \
  --expected-source-hash <sha256> \
  --json
```

The report contains only counts, reason codes, scope identifiers, and integrity hashes. A match never promotes database reads by itself; `promotionBlocked` remains true until the full canary gate is reviewed.

Store at least three content-free shadow reports from the exact same staging
project, tenant, source revision, and source hash in one local JSON array. The
reports must have distinct timestamps, span at least ten minutes by default,
remain fresh, and prove identical converged snapshots. Then evaluate them with:

```bash
npm run session-planner:shadow:evidence -- \
  --reports-file <content-free-shadow-reports.json> \
  --target staging \
  --expected-project-ref <staging-supabase-project-ref> \
  --organization-id <organization-uuid> \
  --team-id <team-uuid> \
  --expected-source-revision <revision> \
  --expected-source-hash <sha256> \
  --json
```

This command reads only the local report file. It has no network, database,
feature-flag, or write capability. Passing the repeated-evidence gate only
marks the evidence ready for manual review. It always returns
`promotionBlocked: true` and `automaticPromotion: false`; Platform Identity
staging proof, the staging apply/rollback/reapply drill, authenticated
multi-user canary, and Safe Lane review remain mandatory.

A separate private migration-bundle contract now binds the exact snapshot hash, plan hash, project ref, tenant scope, source checkpoint, actor, request id, record projections, and expected revisions for both backfill and rollback. The private bundle contains the records needed by a future atomic staging transaction, but its public summary contains only hashes and counts. Execution remains explicitly disabled and no executor or database write path is exported.

The staging drill command is dry-run by default. It builds the reviewed initial bundle and prints a content-free summary without invoking the atomic RPC:

```bash
npm run session-planner:staging:drill -- \
  --target staging \
  --expected-project-ref <staging-supabase-project-ref> \
  --canonical-production-project-ref <production-supabase-project-ref> \
  --organization-id <organization-uuid> \
  --team-id <team-uuid> \
  --actor-id <operator-user-uuid> \
  --expected-source-revision <revision> \
  --expected-source-hash <sha256> \
  --bundle-created-at <reviewed-iso-timestamp> \
  --request-id <unique-request-id> \
  --json
```

A write drill additionally requires `--apply`, the exact confirmation `--confirm=RUN_SESSION_PLANNER_STAGING_DRILL`, and `--expected-bundle-sha256 <reviewed-sha256>` from the dry-run. It refuses a target named production, refuses equal staging/production project refs, and the underlying review verifies that the configured Supabase URL resolves to the expected staging ref before any tenant or data read. Before the first domain write, the drill stores an integrity-bound recovery package containing the exact baseline snapshot, backfill plan, and initial bundle in the existing private backup bucket, rereads it, verifies its integrity hash, and prints a content-free receipt; an existing identical object can be safely reused. The full drill then applies the bundle, proves the source projection, rolls back to the baseline projection, reapplies, and proves idempotency again. All public output remains content-free.

The database independently authorizes the attributed actor before executing any bundle. The actor must be active and either a platform admin or an active organization, club, or team administrator whose membership covers the exact target team. Merely existing in `auth.users` is not sufficient, and normal coaching roles cannot run the migration operator path.

The RPC itself currently accepts only bundles whose target is exactly `staging`. Production execution requires a later, explicit database migration after the staging rollback proof and promotion review; changing an environment variable or operator argument cannot enable it.

If the process is interrupted after the first apply, use the separate recovery command in dry-run mode with the exact private path and package hash from the receipt:

```bash
npm run session-planner:staging:recover -- \
  --target staging \
  --expected-project-ref <staging-supabase-project-ref> \
  --canonical-production-project-ref <production-supabase-project-ref> \
  --organization-id <organization-uuid> \
  --team-id <team-uuid> \
  --actor-id <operator-user-uuid> \
  --recovery-path <private-object-path> \
  --expected-recovery-sha256 <recovery-package-sha256> \
  --bundle-created-at <reviewed-iso-timestamp> \
  --request-id <unique-request-id> \
  --json
```

Recovery returns a content-free rollback bundle hash. Applying it additionally requires `--apply`, `--confirm=RECOVER_SESSION_PLANNER_STAGING_ROLLBACK`, and `--expected-rollback-bundle-sha256 <reviewed-sha256>`. It writes nothing when the active baseline projection is already restored. It only rolls back the exact, revision-matched first apply described by the recovery package; concurrent or otherwise unrecognized state fails closed for audit instead of being guessed at.

Do not run the write drill until Platform Identity has passed its own staging snapshot/rollback drill, the complete migration chain has compiled on staging, the staging database has been isolated from production, and System/Security holds the current release slot. The committed atomic SQL remains candidate code until that real database proof exists.

### Authenticated multi-user canary

The compatibility source needs a separate real staging proof before domain-record
promotion. The two-user canary authenticates two distinct staging accounts, forces
fresh reads that bypass distributed snapshots, proves both users share the exact
reviewed source revision and hash, and prepares a private recovery package. Dry-run
performs no app-state or storage write:

```bash
STAGING_QA_USERNAME=<primary-account> \
STAGING_QA_PASSWORD=<primary-password> \
STAGING_QA_PEER_USERNAME=<peer-account> \
STAGING_QA_PEER_PASSWORD=<peer-password> \
npm run session-planner:staging:canary -- \
  --target staging \
  --app-origin https://staging.footballscience.xyz \
  --expected-project-ref <staging-supabase-project-ref> \
  --canonical-production-project-ref <production-supabase-project-ref> \
  --expected-source-revision <revision> \
  --expected-source-hash <sha256> \
  --created-at <reviewed-iso-timestamp> \
  --request-id <unique-request-id> \
  --json
```

Write execution additionally requires `--apply`,
`--confirm=RUN_SESSION_PLANNER_STAGING_CANARY`, and
`--expected-recovery-sha256 <reviewed-sha256>` from the dry-run. Before the first
write, the command stores and rereads an integrity-bound recovery package in the
private backup bucket. It then writes a reserved non-visual canary marker, proves
the peer receives it through an immediate fresh read, proves the peer's stale
checkpoint is rejected with `409`, removes only the reviewed marker, and verifies
both users see the restored state.

The cleanup preserves concurrent colleague content. If a network response is lost
after the server persisted the marker, recovery rereads the server and removes that
exact marker. If another user changed content in the meantime, that content is kept;
an unknown or altered marker fails closed. Public output includes only hashes,
revisions, status, and the private recovery receipt, never coaching content,
credentials, tokens, or user identities.

If the process is terminated before automatic cleanup completes, inspect the exact
private receipt in dry-run mode:

```bash
STAGING_QA_USERNAME=<original-primary-account> \
STAGING_QA_PASSWORD=<primary-password> \
npm run session-planner:staging:canary:recover -- \
  --target staging \
  --app-origin https://staging.footballscience.xyz \
  --expected-project-ref <staging-supabase-project-ref> \
  --canonical-production-project-ref <production-supabase-project-ref> \
  --recovery-path <private-object-path> \
  --expected-recovery-sha256 <recovery-package-sha256> \
  --json
```

Recovery writes additionally require `--apply` and
`--confirm=RECOVER_SESSION_PLANNER_STAGING_CANARY`. The command requires the
original staging actor, validates the app, database project, production separation,
private object path, and package hash, and writes nothing when the reviewed marker
is already absent. These commands must not be executed against real staging until
Platform Identity proof is complete and the team holds the current release slot.

### Staging operator workflows

The operator commands are exposed through four manual GitHub Actions workflows:

- `Session Planner Staging Drill`
- `Session Planner Staging Recovery`
- `Session Planner Staging Multi-User Canary`
- `Session Planner Staging Canary Recovery`

Both workflows use the protected `platform-staging` GitHub Environment, share the
`session-planner-migration-staging` concurrency lock, read elevated Supabase access
only from environment secrets, require the canonical repository `main` ref, and
cannot select a production environment. Dry-run is the default. Write execution
requires the exact command confirmation plus the reviewed bundle hash from the
matching dry-run. The workflows retain no coaching content and upload no artifacts;
only content-free hashes, counts, and recovery receipts are written to the GitHub
job summary.

These workflows are operational rails, not promotion. They must not be dispatched
until Platform Identity staging proof is complete and System/Security holds the
current release slot.

## Rollback

- Feature mode defaults to `off`.
- `planned` and `shadow` modes cannot change user-facing reads.
- App-state remains untouched during dry-run and backfill.
- A read canary falls back to the exact app-state value on any mismatch or database error.
- The read-canary promotion receipt is bound to the exact staging project, tenant,
  source revision/hash, reviewer, every evidence report hash, compatibility source
  hashes, and a maximum 24-hour review window; changing any of them disables domain
  reads before the database is contacted.
- The read gateway is not currently imported by `/api/app-state`, so adding its
  candidate code cannot change production reads.
- Shadow reports contain only scope identifiers, counts, hashes, status, and reason codes; coaching content is never emitted.
- A private migration snapshot is integrity hashed before any future apply. Its public summary contains counts and hashes only.
- Every migration snapshot is bound to the actual Supabase project ref, explicit tenant scope, exact app-state revision, and exact app-state hash.
- Rollback planning accepts only the exact baseline snapshot and backfill plan, requires expected post-backfill revisions/hashes, restores pre-existing rows, archives rows created by the backfill, and blocks concurrent drift or unknown rows.
- Pure rollback projection verification proves the generated actions reconstruct the baseline projection without changing a database. This is contract evidence, not a substitute for the required staging apply/rollback/reapply drill.
- Active projection hashes deliberately ignore row revisions and archived migration remnants while still detecting any functional record drift. This lets the drill prove rollback and reapply semantics without pretending audit revisions rewind.
- Backfill and rollback bundles reject semantic tampering even if an attacker recomputes the outer bundle hash, because every command is revalidated against its record projection, action type, tenant, and expected version transition.
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
- A stale, expired, rehashed-but-weakened, cross-project, or cross-tenant promotion
  receipt cannot enable the read gateway.
- Database timeout, integrity failure, or semantic mismatch returns the exact
  compatibility value rather than a partial domain projection.
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

The atomic RPC migration is candidate code until it has compiled against the complete staging migration chain and passed the apply/verify/rollback/verify/reapply drill. Static SQL contracts are not sufficient evidence for activation.

The identity prerequisite now includes a separate integrity-checked snapshot and rollback contract. Session Planner backfill remains blocked until the identity operation has passed that complete staging drill; adding identity tables or a successful dry-run alone is not sufficient.
