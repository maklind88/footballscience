# Session Planner Foundation Review for the Desktop Slice

Date: 2026-08-31

Status: local design and disposable integration evidence only. Nothing in this review authorizes applying either SQL file to staging or production.

## Baseline decision

The reconciled logical ledger remains the controlling source of truth:

- the repository contains 60 SQL files;
- production has 49 history rows;
- staging has 48 history rows;
- the count difference is explained in `MIGRATION_RECONCILIATION.md` and is not a request to copy, rename, replay, or repair remote history;
- `20260722202605_session_planner_domain_records_v1.sql` is local-only and absent from both remote environments;
- the existing `football-session-planner-v3` app-state record remains canonical.

The desktop work therefore does **not** add anything to `supabase/migrations`. Its transaction is an additive draft at `supabase/drafts/20260831160000_desktop_session_sync_v1.sql`, exercised only against a disposable synthetic Postgres catalog.

## Reviewed foundation elements that are reused

The local prototype reuses these bounded contracts from the unapplied foundation:

| Foundation contract | Desktop use |
| --- | --- |
| Organization/team/session identity | Every operation is scoped by server-derived actor, organization and team. |
| `session_planner_sessions.row_version` | Base revision is checked under a row lock and the authoritative revision advances once. |
| `session_planner_blocks` parent scope | A block update must match session, organization, team and non-archived state. |
| Archive rather than hard delete | The first slice exposes no delete operation; a private tombstone shape is reserved for later archive synchronization. |
| Tenant membership and active-team checks | The private routine repeats active role/scope checks before locating a record. |
| Server-led writes | Desktop receives no table DML grant and no Supabase service-role credential. |
| Audit/version intent | The operation ledger records actor, request ID, immutable operation content, result and acknowledgement. Existing foundation triggers remain the future record-version source. |
| App-state fallback | The disposable tests assert that `football-session-planner-v3` is unchanged after typed operations. |

## Component-by-component classification

| Migration component | Classification for the first slice | Assessment |
| --- | --- | --- |
| Inert/additive intent and canonical app-state wording | Reusable as written | This remains the controlling compatibility policy. |
| `pgcrypto` creation | Unrelated to the first bounded vertical slice | The draft uses UUID generation in disposable Postgres; a future clean replay must establish where that function is owned instead of assuming extension state. |
| `session_planner_sessions` identity, tenant, archive and revision columns | Requires additive correction | The structural intent is reused, but the local operation protocol is narrower and the foundation must be replayed/reviewed with the existing app-state conversion plan before rollout. |
| Broad session `content` JSON and 300-character title | Unrelated to the first bounded vertical slice | The first protocol supports only a 120-character typed rename and does not expose unrestricted JSON replacement. |
| `session_planner_blocks` parent scope, order, archive and revision columns | Requires additive correction | The first protocol uses only one bounded duration field; full payload/hash/conversion semantics remain future work. |
| `session_planner_record_versions` | Requires additive correction | The audit shape is useful, but future server writes must propagate the authenticated request correlation ID and prove trigger interaction with the operation ledger. |
| `session_planner_migration_runs` | Unrelated to the first bounded vertical slice | No backfill, conversion, verification or rollback run is performed in this phase. |
| Scope-validation triggers | Requires additive correction | Tenant invariants are reusable, but function ownership, qualified references, safe search path and compatibility with the private routine need clean-replay proof. |
| Row-version touch triggers | Requires additive correction | Revision advancement is reusable; a clean test must prove that explicit sync revision writes and trigger behavior advance exactly once. |
| Record-version triggers | Requires additive correction | They must correlate the operation/request ID and avoid duplicating or losing audit semantics. |
| Hard-delete prevention triggers | Reusable as written | The first slice has no delete command and retains archive/tombstone semantics. |
| `can_read_session_planner_scope` SECURITY DEFINER function | Requires additive correction | The role logic is useful, but its owner, execute grants and search path require the same least-privilege review as the new private routines. |
| Authenticated read-only RLS policies | Unrelated to the first bounded vertical slice | Desktop reads go through the authenticated handler/private routine during this gate. Direct client table access is not added. |
| Broad `service_role` table DML grants as a desktop write mechanism | Unsafe | They may serve existing web architecture, but the desktop handler must not become a generic service-role data gateway. The draft grants only exact routines to a dedicated executor. |
| Module checkpoint in `planned` phase with fallback enabled | Reusable as written | It accurately preserves app-state primacy and makes no cutover claim. |
| Automatic application of the full absent migration | Unsafe | Neither remote history contains it; applying it is outside this phase and would violate the reconciled-ledger gate. |

Nothing is classified as wholly superseded at this stage. The draft operation ledger supplements the foundation rather than replacing its future domain/audit model. Individual broad desktop write paths are superseded by the private executor boundary, while existing web behavior remains untouched.

## Intentionally not replayed or activated

The disposable catalog is not a clean replay claim for the unapplied migration. It contains only the minimum synthetic relations needed to exercise the contract. The following foundation behavior is deliberately excluded from this phase:

- `session_planner_record_versions` and its production audit history;
- `session_planner_migration_runs`, backfill, shadow-read, verification and rollback jobs;
- conversion of any `football-session-planner-v3` payload;
- authenticated direct table reads or RLS policy rollout;
- module migration checkpoint changes;
- Realtime publication changes;
- remote grants, role membership, secrets or connection configuration;
- session/block create, reorder, archive, restore or delete commands;
- attachments, media, medical information and unrestricted session JSON.

## Deliberate local deviations

The synthetic base catalog is narrower than the unapplied foundation and must not be mistaken for final DDL:

- session titles are limited to 120 characters by the desktop protocol, while the foundation permits 300;
- only `session.rename` and `block.duration.set` operation version 1 are allowed;
- only the selected session slice and two synthetic blocks exist;
- the local draft has a private idempotency ledger with 180-day expiry metadata; no purge job is authorized here;
- a dedicated `NOLOGIN` executor role is the only role granted function execution in the disposable database;
- `anon`, `authenticated`, `service_role` and `public` have no direct execute grant on the draft routine.

The Vercel handler can use that minimum role only through a future server-owned, non-public database connection arrangement. A desktop key, browser key, direct RPC grant, or general service-role gateway is not an acceptable substitute.

## Transaction and conflict semantics verified locally

The draft routine provides one atomic path for the first vertical slice:

1. validate protocol, operation, payload bounds and immutable identifiers;
2. serialize duplicate operation IDs with an advisory transaction lock;
3. return the original acknowledgement for an exact replay;
4. reject operation-ID reuse with changed content;
5. validate active actor membership and tenant/team scope;
6. lock the selected session and compare its base revision;
7. return a typed conflict without mutation when revisions differ;
8. apply one allowlisted mutation and advance the authoritative revision;
9. record the operation and acknowledgement in the same transaction;
10. return only the bounded result required by the desktop client.

Disposable Postgres tests cover exact replay, changed-content reuse, cross-tenant denial, revoked membership, conflict, block scope, minimum-role grants and unchanged canonical app-state. The combined SQLite/handler/Postgres E2E additionally covers two offline edits, process restart, a lost first acknowledgement, deterministic resend, durable receipt-before-removal and empty outbox after convergence.

## Gate before any remote database action

Before the draft can become a real migration, a separate directly authorized Safe Lane phase must:

1. accept the logical ledger and the intended rollout status of the unapplied foundation;
2. replay the accepted ordered baseline in a clean isolated Postgres/Supabase environment;
3. review the complete foundation DDL, triggers, RLS, grants and function owners together with the sync draft;
4. choose and provision the server-only minimum-role connection without exposing it to desktop or browser code;
5. define operation-ledger retention/purge and tombstone retention;
6. prove app-state shadow parity, rollback and backup/restore behavior;
7. run authenticated tenant, revocation, concurrency and audit tests in an explicitly authorized non-production environment;
8. create a new additive migration rather than editing applied history.

Until those items are complete, this work is implementation evidence, not a deployable schema package.
