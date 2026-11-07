# Session Planner Local Vertical Slice

Date: 2026-08-31

Status: implemented locally with synthetic identity and synthetic football data. The packaged Candidate A UI can rename the selected session and change a block duration offline through the typed native bridge. No real FS account, deployed endpoint or Supabase row is connected.

## Scope

The slice contains one explicitly selected session and only:

- session ID, title, scheduled date and revision;
- ordered blocks with type, title and duration;
- stable player references used by those blocks;
- referenced exercises used by those blocks;
- partition, tenant, organization and team context.

Explicitly excluded are the approximately 3.10 MB canonical Session Planner document as a mutable unit, video/blob data, medical data, credentials, authenticated API responses, signed URLs and unrelated sessions.

## Representation mapping

| Concern | Current online product truth | Local read model | Future operation/backend contract |
| --- | --- | --- | --- |
| Aggregate | `football-session-planner-v3` app-state JSON remains production-primary | `session_projection`, one selected row per partition | Selected-session snapshot plus server revision/cursor |
| Session metadata | Date-keyed session fields in the canonical app-state value | Stable session ID, title, date, revision, tenant/org/team ownership | `CreateSession`, `UpdateSessionMetadata` |
| Blocks | Session block objects with legacy IDs and field metadata | `session_blocks`, ordered and linked to the session | `AddSessionBlock`, `UpdateSessionBlock`, `RemoveSessionBlock` |
| Players | References embedded in relevant planner/board content | `player_references` plus `session_block_players` | `AssignPlayerToBlock` / explicit removal |
| Exercises | Referenced exercise/library content | `exercise_references` plus `session_block_exercises` | Explicit exercise assignment/snapshot refresh |
| Conflict basis | Current app-state revision and field-aware merge behavior | Per-session local revision and operation base revision | Server-owned row/aggregate revision; typed conflict response |
| History/audit | Vercel API appends Session Planner history/audit | Local durable operation and acknowledgement records | Server operation ledger plus existing product audit/history |

The local schema is a bounded projection of the existing Session Planner aggregate, not a new competing canonical model. The local IDs and future typed online rows must be reconciled with the existing deterministic conversion code before real data is imported.

## SQLite schema v3

The prototype uses SQLite with foreign keys, WAL, `synchronous=FULL`, strict tables and `trusted_schema=OFF`.

- `session_projection`
- `session_blocks`
- `player_references`
- `exercise_references`
- `session_block_players`
- `session_block_exercises`
- `session_outbox`
- `operation_quarantine`
- `operation_receipts`
- `local_meta`

The v1→v2 local migration adds explicit `team_id` to outbox envelopes, and v3 records the current local compatibility level after the authorization-quarantine hardening. These are local prototype migrations only and are unrelated to Supabase migrations.

## Versioned operations

Implemented test operations:

| Type | Version | Entity/payload | Validation |
| --- | ---: | --- | --- |
| `session.rename` | 1 | Stable session ID and bounded title | UUID, active partition/org, exact base revision, title 1–120 chars |
| `block.duration.set` | 1 | Stable block ID and duration | UUID, selected session membership, duration 1–240, exact base revision |

The public product vocabulary should evolve toward the explicit domain operations above rather than whole-document replacement. The prototype operations are deliberately small; they do not claim the complete final Session Planner command set.

## Outbox envelope

Every locally applied operation persists:

- immutable operation ID;
- operation type and schema version;
- client instance ID;
- user/actor ID;
- partition, tenant, organization and team context;
- stable session/entity ID;
- base and resulting revisions;
- typed request payload and its SHA-256 binding;
- local creation time, pending/sending state, attempt count and last-attempt time.

Projection mutation and outbox insertion occur in one `IMMEDIATE` SQLite transaction. A server acknowledgement is inserted into `operation_receipts` in the same transaction that removes the outbox item. An operation ID reused with different content is rejected.

## Recovery evidence

Rust contract tests prove:

- projection and outbox survive database close/reopen;
- a stale revision rolls back both projection and outbox;
- an acknowledgement receipt exists before outbox removal commits;
- a simulated server accepts an operation, the client loses the response, SQLite closes/reopens, the server returns `already-applied`, and the client durably records that acknowledgement before removal;
- an unauthorized partition is rejected and its local outbox item is preserved;
- no `refresh_token` column exists anywhere in the SQLite schema.

The signed UI uses `SessionPlannerOfflineController` to construct only the two versioned envelopes above. Focused tests prove title/duration validation, exact base-revision advancement, local-pending presentation, stale-revision conflict presentation, revoked presentation and rejection of invalid values before the bridge. A bounded native `session.sync-status` command returns only state and counts; it does not expose payloads, SQL or generic outbox access. The packaged macOS app boots this writable asset set successfully, while operation persistence/restart/reconnect/lost-response behavior remains verified at the native and local integration layers rather than by physical UI clicking.
