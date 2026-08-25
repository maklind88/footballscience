# Platform Scale Program

This program tracks the long-term work needed to make Football Science safe to grow from a live coaching platform into a multi-tenant product that can support very large usage.

## Operating Rule

Do not rewrite the platform in one large move. Build a server-owned spine beside the current app, then migrate one module at a time with app-state fallback, tests, audit, and rollback intact.

Current coordination rule:

- Keep `main` synced with GitHub before starting platform foundation work.
- Start broad platform/security work from a fresh `codex/` branch or clean worktree based on `origin/main`.
- Do not mix local Scouting/import work into platform foundation releases.
- Local/provider import files belong outside Git or under ignored `data/`; commit only reviewed scripts, migrations, tests, and app code.

## Program Status

| Stream | Status | Current Contract | Next Build Step | Release Risk |
| --- | --- | --- | --- | --- |
| Multi-tenant auth/users/org/team | Backfill runner started | `public.platform_*` identity migration + `/api/platform-identity` + `/api/platform-tenant-bootstrap` + `npm run platform:identity:backfill` | Run controlled dry-run backfill, review output, then apply with explicit confirmation | Safe deploy only |
| App-state module migrations | Tracked | `platform_module_migration_checkpoints` | Keep Chat compatibility cache bounded, then promote the next high-risk app-state module through staged dual-read/dual-write checks | Safe deploy only |
| `app.js` module extraction | Started before program | Module loader + existing lazy Scouting/Game Simulator boundaries | Extract one module boundary per release, no UI behavior change first | Safe deploy for broad moves |
| Chat server-first | Database-first default, compatibility cache still active | `chat_*` tables and `/api/chat` | Verify active environment migrations, attachment storage, realtime, and retention jobs; block new generic app-state writes | Safe deploy only |
| Football Science DB | Foundation started | `fsdb_*` global player identity tables and `/api/football-science-db` | Import Reep identity data, then connect roster/stat providers without frontend blobs | Safe deploy only |
| Scouting server-first | Schema/API foundation exists, client still heavy | `scouting_*` tables and `/api/scouting` | Server-side search/filter/profile pages before loading client blobs | Safe deploy only |

## Non-Negotiable Definition Of Done

Each phase is only complete when all of these are true:

- Existing live behavior is preserved unless the user asked for a product change.
- No protected app-state key is removed, reset, seeded over, or overwritten.
- New tables are additive and include `organization_id`; team-scoped rows include `team_id`.
- Public tables have RLS, default access revoked from `anon` and `authenticated`, and direct authenticated writes blocked unless explicitly reviewed.
- Writes use server APIs or private functions with row/version conflict protection.
- Destructive user-facing actions are soft-delete/archive first.
- Audit or history tables capture enough metadata for rollback/restore analysis.
- Permission matrix and docs are updated in the same phase.
- Focused API/contract tests pass before release.
- `npm run qa:supabase`, `npm run security:platform`, and `npm run check` pass before any deploy touching auth/data/API.
- The responsible platform specialist owns a Safe Lane release when the user's product intent requires Live and the Release Ownership Agreement is satisfied. Explicit deploy codewords remain optional convenience commands.

## Migration Order

1. Platform Identity: canonical organizations, clubs, teams, memberships, profiles, tenant links, and migration checkpoints.
2. Chat: server-first messages, threads, receipts, reactions, attachments, pagination, and realtime-safe RLS.
3. Football Science DB: global player identity, source links, team/competition/roster/stat foundations with server-side search and cursor pagination.
4. Scouting: server-first player database search, profile hydration, import publishing, lists, reports, and Shadow XI state.
5. Home Tasks: database-backed personal/delegated tasks.
6. Schedule: promote staged `schedule_events` after shadow/dual-write verification.
7. Exercise Library: preserve every existing exercise; migrate folders and versions before sessions.
8. Sessions: migrate sessions and blocks after library safety is proven.
9. Squad/Medical/Periodization/Game Simulator: migrate after identity and module-specific restore drills are proven.

## Current Phase: Platform Identity Foundation

Added in this branch:

- `supabase/migrations/20260515045748_platform_identity_foundation.sql`
- `qa/platform-identity-schema.api.spec.mjs`
- `api/platform-identity.js`
- `api/_lib/platform-identity.js`
- `qa/platform-identity-api.api.spec.mjs`
- `api/platform-tenant-bootstrap.js`
- `api/_lib/platform-tenant-bootstrap.js`
- `qa/platform-tenant-bootstrap.api.spec.mjs`
- `platform-identity` module contract in core platform/readiness/permission metadata

The migration creates:

- `platform_organizations`
- `platform_clubs`
- `platform_teams`
- `platform_user_profiles`
- `platform_memberships`
- `platform_tenant_links`
- `platform_module_migration_checkpoints`
- `platform_membership_events`

The current app still uses the existing live paths. This foundation is intentionally inert for UI behavior: `/api/platform-identity` only returns the signed-in actor's server-owned scope and migration fallback status, while `/api/platform-tenant-bootstrap` is admin-only and creates or reuses canonical tenant/profile/membership/link rows. Neither endpoint changes UI routing, app-state ownership, or module read/write paths.

## Tenant Bootstrap API

The bootstrap endpoint is server-first and conservative:

- create/link organization, club, team rows
- link existing `chat_*` and `squad_*` tenants through `platform_tenant_links`
- backfill `platform_user_profiles` and `platform_memberships` for existing Auth users
- support dry-run planning without writes
- refuse automatic relinking when a module record already belongs to another tenant
- keep app-state fallback mapping active until each module passes shadow/dual-read checks

Write authorization must not trust `user_metadata`. Authorization must come from server-owned membership rows and/or server-owned `app_metadata` bootstrap role.

## Backfill Runner v1

`npm run platform:identity:backfill` is the controlled operational entry point for seeding canonical Platform Identity rows from existing Supabase Auth users.

Rules:

- Dry-run is the default.
- Writes require `--apply --confirm=BACKFILL_PLATFORM_IDENTITY`, the exact dry-run `--expected-plan-sha256`, and its `--expected-user-count`.
- A real `--actor-id` is required so created/updated rows have an audit actor.
- Roles are derived only from server-owned `app_metadata`, never editable `user_metadata`.
- Profile display fields may read `user_metadata`, but authorization does not.
- The runner calls the shared tenant bootstrap pipeline for every user instead of writing directly to tables.
- Dry-run output is PII-free and includes a deterministic plan hash; apply recomputes the plan and stops before all writes if the hash or user count changed.
- It does not change UI routing, app-state ownership, module reads, or module writes.

Typical dry-run:

```bash
npm run platform:identity:backfill -- --actor-id <admin-user-uuid> --organization-name "Football Science" --team-name "First Team"
```

Apply only after dry-run review:

```bash
npm run platform:identity:backfill -- --apply --confirm=BACKFILL_PLATFORM_IDENTITY --expected-plan-sha256 <reviewed-sha256> --expected-user-count <reviewed-count> --actor-id <admin-user-uuid> --organization-name "Football Science" --team-name "First Team"
```

GitHub operational access is split into `platform-staging` and `platform-production` Environments. The initial `Platform Identity Backfill Dry Run` workflow is manual, concurrency-locked, PII-free, and intentionally has no apply path. A write workflow must not be added until pre-write snapshots, post-write coverage, and rollback verification are green in staging.

### Snapshot and rollback checkpoint

`npm run platform:identity:snapshot` adds the next fail-closed operations boundary without changing runtime behavior:

- Default mode is read-only and prints only counts and integrity hashes.
- Snapshot capture requires `--capture`, `--confirm=CAPTURE_PLATFORM_IDENTITY_SNAPSHOT`, the reviewed plan SHA-256, and its exact user count.
- The snapshot contains only the scoped `platform_*` rows affected by the reviewed plan.
- Captures are stored under `backups/platform-identity/` in the existing private app-state bucket and are re-read immediately to verify the SHA-256.
- Rollback planning restores existing rows, soft-archives rows created by the backfill, and blocks tenant-scope drift, missing baseline rows, or unknown new rows.
- No rollback executor or identity apply workflow is enabled yet. Those remain blocked until staging proves apply, audit, rollback, baseline verification, and reapply in sequence.

## Next Phase: Controlled Backfill

Use the backfill runner behind explicit admin operations to seed production/staging tenant rows. After that, promote one module at a time into shadow reads with app-state fallback comparison still active.
