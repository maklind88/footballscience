# Desktop Synchronization Boundary Recommendation

Date: 2026-08-31

Status: recommendation only. No endpoint, RPC, migration, grant, environment variable, remote schema object, or production integration was created.

## Repository evidence

The current product boundary is server-led:

- `api/app-state.js` authenticates the bearer token with `getCurrentActor`, applies request guards/rate limits, filters reads, validates module permissions and tenant scope, performs conflict checks, writes audit/history records, and returns authoritative revisions.
- `api/session-history.js` uses the same authenticated Vercel-handler pattern for Session Planner history and restore.
- `api/_lib/session-planner-database.js` reads typed Session Planner rows through a server-held Supabase service-role credential when the feature mode permits it.
- the unapplied Session Planner migration revokes authenticated DML and grants authenticated users only tenant-filtered reads; service-role writes remain server-side.
- the reconciliation proves that the four proposed `session_planner_*` relations are absent in both production and staging, so they cannot be treated as a current backend contract.

This means a desktop client that writes directly to tables would bypass or duplicate important existing server behavior.

## Compared options

| Requirement | Authenticated Vercel sync endpoint | Narrow Supabase RPC called by desktop | New trusted server/edge boundary |
| --- | --- | --- | --- |
| Authentication | Reuses current `getCurrentActor` bearer verification | Supabase Auth token reaches PostgREST/RPC directly | Must build and own a new verifier |
| Tenant validation | Reuses permission matrix and server-side actor/scope resolution | Must be encoded completely in RPC and grants | Must be reimplemented |
| Idempotency | Versioned operation endpoint can require immutable operation IDs and return durable acknowledgements | Strong transactional ledger is possible inside Postgres | Possible, but new persistence and ownership are needed |
| Revision/conflict rules | Can preserve current product semantics and translate to a transactional DB routine | Close to rows, but exposes database contract directly to desktop | Must define a second contract |
| Transaction handling | Handler should invoke one narrow transactional database function after reconciliation | Best raw transaction locality | Depends on new service implementation |
| Operation-version compatibility | Explicit HTTP request/response versions independent of table shape | Function signature becomes a public client compatibility surface | Explicit, but entirely new |
| Observability | Existing Vercel request IDs, rate limits, structured security logs and audit paths | Database logs are useful but product/API context is thinner | New logging, alerts and runbooks required |
| Deployment model | Fits the current repository and deployment rail | Couples desktop compatibility to Supabase schema rollout | Adds another service and release rail |
| Maintainability | One public product boundary; DB details remain private | Fewer hops, but more direct schema/auth coupling | Highest new operational cost |

## Recommendation

Use a narrowly scoped authenticated Vercel handler as the **public desktop synchronization boundary**. After the migration baseline is trusted, that handler should call one private, transactional Postgres function or equivalent server-only routine to apply a bounded operation batch and its idempotency ledger atomically.

The resulting boundary is deliberately layered:

1. Desktop submits a versioned operation envelope to one FS API route.
2. The route derives actor, organization and team from the authenticated server context; it does not trust client identity fields.
3. The route validates sync protocol, operation versions, payload limits, permission, lease/session state and rate limits.
4. One database transaction validates the base revision, records or recognizes the immutable operation ID, applies allowed domain changes, advances the authoritative revision and creates an acknowledgement.
5. The route returns `accepted`, `already-applied`, `conflict`, `auth-required`, `compatibility-blocked`, or a retryable failure with a server request ID.
6. Desktop durably stores `accepted`/`already-applied` before removing the local outbox item.

Do not expose a generic table gateway, SQL command, arbitrary JSON overwrite, direct service-role key, or unrestricted RPC to the desktop shell.

## Synthetic contract implemented locally

The Rust test double enforces the intended properties without network or remote data:

- sync protocol and operation version checks;
- actor, organization, team and partition authorization;
- explicit operation allowlist;
- base and resulting revision validation;
- immutable operation-ID/content binding;
- `accepted` followed by deterministic `already-applied` replay behavior;
- durable local receipt before atomic outbox removal;
- accepted-but-unrecorded acknowledgement recovery after closing and reopening SQLite.

This is behavioral evidence, not a real backend implementation.

## Required future server contract

The smallest real contract should support:

- `GET` selected-session snapshot/change cursor scoped by server-derived tenant/team;
- `POST` bounded operation batch with `syncProtocolVersion`, per-operation `operationId`, `operationType`, `operationVersion`, entity ID, base revision and typed payload;
- per-operation authoritative acknowledgement and revision;
- idempotency retention long enough to survive offline retries and device restart;
- archive/tombstone semantics rather than hard delete;
- conflict response containing the minimum current server version needed for a safe rebase;
- audit/request correlation without logging tokens or private payload bodies.

## Preconditions before implementation

1. Review and accept the logical migration ledger in `MIGRATION_RECONCILIATION.md`.
2. Decide which currently unapplied Session Planner domain migration will become the reviewed starting point; do not apply it as-is by implication.
3. Design the private idempotency/revision transaction and cross-tenant/replay tests.
4. Define authentication/session revocation behavior and implement real secure credential adapters.
5. Implement locally or in an explicitly authorized non-production environment before any production change.

Direct desktop-to-Supabase RPC remains a possible later optimization only if it can preserve the same server-derived authorization, observability, version isolation and transactional behavior without broadening client grants. A separate new server is not justified by the current repository.
