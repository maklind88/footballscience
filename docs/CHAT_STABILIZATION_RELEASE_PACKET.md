# Chat Stabilization Release Packet

Status: 2026-06-19. Pre-release stabilization packet, captured before the explicit live release request on 2026-06-19. This packet did not perform a deploy, push, production change, migration, schema write, or data write.

## Purpose

This packet captures the current operational truth for Chat before any new chat feature work or production release. It exists to prevent the platform from drifting back into double source of truth, unsafe staging assumptions, or broad migrations during live working hours.

## Current Decision

Chat is database-primary through `/api/chat`.

The legacy app-state key remains compatibility/cache state only:

- `football-dashboard-chat-v1`

That key must not become the canonical write path again. New chat behavior should target the dedicated `/api/chat` contract and the `chat_*` database tables unless an explicit rollback is active through `CHAT_STORAGE_MODE=legacy`.

## Environment Map

| Surface | Vercel / Domain | Supabase target | Verified signal |
| --- | --- | --- | --- |
| Production | `footballscience.xyz` | `Football Science NCC`, ref `bustidorxevacosqhkcz` | `api/client-config` points to production Supabase. |
| Staging | `staging.footballscience.xyz` | `Football Science Staging`, ref `pokrksgempkuraueglpu` | `api/client-config` points to staging Supabase. |
| Local preview env | `.vercel/.env.preview.local` | Staging Supabase | `CHAT_STORAGE_MODE` is absent, so code defaults database-first. |

Direct Vercel environment verification for production `CHAT_STORAGE_MODE` was not available through the current tool surface. The code default is database-first and production database activity confirms the database path is active, but the exact production env flag still needs direct Vercel env verification before a release window.

## Read-Only Verification Summary

### Production

Production chat foundation looks healthy from read-only checks:

- All expected `chat_*` tables exist.
- RLS is enabled on all checked `chat_*` tables.
- Direct public writes for chat tables were not exposed to `anon` or `authenticated`.
- Realtime publication includes the expected chat tables.
- `footballscience-chat-attachments` exists and is private.
- Storage policies exist for chat attachment read and upload.
- `app_private.is_chat_staff` is `SECURITY DEFINER` and includes `club-admin`, `team-admin`, and `scout`.
- `chat_threads_type_check` includes the richer thread taxonomy.
- Production has chat threads, messages, and attachments, so the database path is not theoretical.

### Staging

Staging has the core chat foundation, but it is not a full production-equivalent chat QA target yet:

- All expected `chat_*` tables exist.
- RLS is enabled on all checked `chat_*` tables.
- Direct public writes were verified absent for critical chat tables.
- Realtime publication includes expected chat tables.
- `footballscience-chat-attachments` exists and is private.
- Storage policies exist for chat attachment read and upload.
- `app_private.is_chat_staff` is `SECURITY DEFINER`, but does not include `club-admin`, `team-admin`, or `scout`.
- Staging migration history stops much earlier than production and is missing later platform, scouting, identity, video, and IDP migrations.
- Staging currently has no chat threads, messages, or attachments.

Some staging metadata reads were intermittently slow or failed through the connector. Treat that as a verification limitation, not proof of data corruption.

## Go / No-Go

Go:

- Preserve the current docs/contracts that make Chat database-primary.
- Run local and read-only verification.
- Continue UI-only chat polish that does not change persisted contracts.
- Prepare a Safe Lane staging reconciliation plan.

No-go:

- No production Supabase migrations during live working hours.
- No production deploy that includes schema, data ownership, auth, permission, central sync, or backup behavior unless the full Safe Lane is complete.
- UI/runtime chat releases can proceed only when release ownership is explicit, the intended changes are isolated, validation passes, and production verification is performed.
- No new chat feature depending on `club-admin`, `team-admin`, or `scout` staging behavior until staging role drift is resolved.
- No broad migration push to staging without reviewing non-chat blast radius.
- No expansion of the app-state compatibility path.

## Top Risks

| Priority | Risk | Why it matters | Recommended response |
| --- | --- | --- | --- |
| Critical | Staging role drift | Staging cannot reliably prove real chat permissions for club admin, team admin, or scout behavior. | Reconcile staging roles in a Safe Lane window before role-sensitive QA. |
| Critical | Broad migration chain mismatch | Production has many later migrations that are not chat-only. Applying all of them blindly can touch Schedule, Security Control Plane, Scouting, Identity, Video, and IDP. | Compare migration dependencies first. Apply only an intentional, reviewed bundle. |
| High | Unverified production `CHAT_STORAGE_MODE` env | Code defaults to database-first, but release confidence should not depend on inference. | Verify Vercel env directly before any chat release window. |
| High | Double source of truth pressure | Legacy app-state fallback exists for compatibility and can become a silent fork if expanded. | Keep app-state read/write compatibility narrow and treat database as canonical. |
| High | Chat content hidden from product workflows | Coaching decisions can get buried in conversation instead of IDP, Medical, Gameplan, Video, or Tasks. | Add promotion rules before adding more chat volume. |
| Medium | Attachment policy complexity | Private bucket plus object policies must stay aligned with chat permissions. | Keep storage checks in every chat release packet. |
| Medium | Staging data absence | Empty staging is good for clean tests but poor for realistic performance, retention, and UX QA. | Seed controlled non-sensitive staging chat data after permissions are fixed. |
| Medium | Large runtime surfaces | Chat renderer/API paths are mature but still risk accumulating behavior. | Extract only after `npm run qa:chat` stays green. |

## Stabilization Plan

1. Freeze the current chat decision locally: database-primary, app-state compatibility only.
2. Do not deploy schema, auth, permission, data ownership, central sync, backup, or migration changes while the live product is being used by the team.
3. During a Safe Lane maintenance window, compare staging migration history against production and local migrations.
4. Before applying `20260511210558_add_scout_role_access.sql` or any targeted role fix, verify its prerequisites in staging, especially platform permission/security objects it may depend on.
5. Prefer normal migration tooling over ad-hoc SQL patches unless this becomes an emergency repair.
6. After staging reconciliation, rerun chat checks and read-only database checks.
7. Only after staging is trustworthy should new role-sensitive chat features or production release work continue.

## Validation Commands

Local commands already used for the current chat contract state:

```bash
git diff --check
npx playwright test --config=qa/playwright.config.mjs --project=api-contracts qa/module-standard.api.spec.mjs qa/modular-core.api.spec.mjs qa/platform-readiness.api.spec.mjs
npm run qa:chat
npm run platform:readiness
npm run check
```

Remote Supabase CLI verification was blocked locally by missing shell credentials:

```bash
npm run qa:supabase:remote
```

That command requires the relevant Supabase token, database password, and project ref in the shell environment.

## Read-Only SQL Checks For The Maintenance Window

Migration history:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Chat table and RLS coverage:

```sql
select
  count(*) as chat_tables,
  count(*) filter (where c.relrowsecurity) as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname like 'chat_%';
```

Critical direct write exposure:

```sql
select
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'INSERT') as anon_insert,
  has_table_privilege('anon', format('public.%I', table_name), 'UPDATE') as anon_update,
  has_table_privilege('anon', format('public.%I', table_name), 'DELETE') as anon_delete,
  has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') as authenticated_delete
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'chat_threads',
    'chat_messages',
    'chat_attachments',
    'chat_audit_events'
  )
order by table_name;
```

Realtime publication:

```sql
select count(*) as chat_realtime_tables
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
  and tablename like 'chat_%';
```

Storage bucket and policy:

```sql
select id, public
from storage.buckets
where id = 'footballscience-chat-attachments';

select policyname, cmd
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname ilike '%chat%';
```

Staff function definition:

```sql
select pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'app_private'
  and p.proname = 'is_chat_staff';
```

## What Not To Touch Yet

- Production deploy rails.
- Production Supabase schema or migration state.
- `/api/chat` runtime behavior.
- `api/_lib/chat-database.js`.
- Chat attachment bucket policy.
- Generic app-state compatibility write paths.
- Existing production chat rows.
- Any broad migration chain that includes non-chat modules unless it is a planned Safe Lane release.

## Suggested Next Move

Schedule a Safe Lane staging reconciliation window. The first action should be a migration dependency review, not a database write.

Decision point for that window:

- If staging is meant to be a production-like QA environment, bring it forward through a reviewed migration bundle.
- If staging is intentionally light, document that limitation and create a separate production-like verification environment before role-sensitive chat work.

My recommendation: make staging production-like for platform contracts and permissions. Chat is now central enough that a partial staging environment will create false confidence.
