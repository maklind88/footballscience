# Platform Scale Program

This program tracks the long-term work needed to make Football Science safe to grow from a live coaching platform into a multi-tenant product that can support very large usage.

## Operating Rule

Do not rewrite the platform in one large move. Build a server-owned spine beside the current app, then migrate one module at a time with app-state fallback, tests, audit, and rollback intact.

Current isolated branch/worktree:

- Branch: `codex/platform-scale-foundation-clean`
- Worktree: `/Users/maklind/Documents/New project-scale-foundation-clean`
- Original working tree has unrelated Scouting changes and must not be used for platform foundation deploys until coordinated.

## Program Status

| Stream | Status | Current Contract | Next Build Step | Release Risk |
| --- | --- | --- | --- | --- |
| Multi-tenant auth/users/org/team | Tenant bootstrap API started | `public.platform_*` identity migration + `/api/platform-identity` + `/api/platform-tenant-bootstrap` | Backfill existing tenants and memberships through explicit admin operations | Safe deploy only |
| App-state module migrations | Tracked | `platform_module_migration_checkpoints` | Promote Chat to server-first with app-state fallback compare | Safe deploy only |
| `app.js` module extraction | Started before program | Module loader + existing lazy Scouting/Game Simulator boundaries | Extract one module boundary per release, no UI behavior change first | Safe deploy for broad moves |
| Chat server-first | Schema exists, app-state fallback still active | `chat_*` tables and `/api/chat` | Make chat API primary for reads/writes, retain compatibility cache | Safe deploy only |
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
- Production deploy happens only after explicit `Deploy`, `Deploy fast`, `Deploy safe`, or the standalone `Live` sync-to-production codeword.

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

## Next Phase: Controlled Backfill

Use the bootstrap endpoint behind explicit admin operations to seed production/staging tenant rows. After that, promote one module at a time into shadow reads with app-state fallback comparison still active.
