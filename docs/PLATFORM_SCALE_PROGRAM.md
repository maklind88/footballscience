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
| Multi-tenant auth/users/org/team | Scope API started | `public.platform_*` identity migration + `/api/platform-identity` | Add admin-only tenant bootstrap/write APIs after read scope is proven | Safe deploy only |
| App-state module migrations | Tracked | `platform_module_migration_checkpoints` | Promote Chat to server-first with app-state fallback compare | Safe deploy only |
| `app.js` module extraction | Started before program | Module loader + existing lazy Scouting/Game Simulator boundaries | Extract one module boundary per release, no UI behavior change first | Safe deploy for broad moves |
| Chat server-first | Schema exists, app-state fallback still active | `chat_*` tables and `/api/chat` | Make chat API primary for reads/writes, retain compatibility cache | Safe deploy only |
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
- Production deploy happens only after explicit `Deploy`, `Deploy fast`, or `Deploy safe`.

## Migration Order

1. Platform Identity: canonical organizations, clubs, teams, memberships, profiles, tenant links, and migration checkpoints.
2. Chat: server-first messages, threads, receipts, reactions, attachments, pagination, and realtime-safe RLS.
3. Scouting: server-first player database search, profile hydration, import publishing, lists, reports, and Shadow XI state.
4. Home Tasks: database-backed personal/delegated tasks.
5. Schedule: promote staged `schedule_events` after shadow/dual-write verification.
6. Exercise Library: preserve every existing exercise; migrate folders and versions before sessions.
7. Sessions: migrate sessions and blocks after library safety is proven.
8. Squad/Medical/Periodization/Game Simulator: migrate after identity and module-specific restore drills are proven.

## Current Phase: Platform Identity Foundation

Added in this branch:

- `supabase/migrations/20260515045748_platform_identity_foundation.sql`
- `qa/platform-identity-schema.api.spec.mjs`
- `api/platform-identity.js`
- `api/_lib/platform-identity.js`
- `qa/platform-identity-api.api.spec.mjs`
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

The current app still uses the existing live paths. This foundation is intentionally inert: `/api/platform-identity` only returns the signed-in actor's server-owned scope and migration fallback status. It does not change UI routing, app-state ownership, or module read/write paths.

## Next Phase: Tenant Bootstrap API

Build admin-only write/bootstrap endpoints after the read-only actor scope endpoint is proven:

- create/link organization, club, team rows
- link existing `chat_*` and `squad_*` tenants through `platform_tenant_links`
- backfill `platform_memberships` from existing server-owned records
- keep app-state fallback mapping active until each module passes shadow/dual-read checks

Write authorization must not trust `user_metadata`. Authorization must come from server-owned membership rows and/or server-owned `app_metadata` bootstrap role.
