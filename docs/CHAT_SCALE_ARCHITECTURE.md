# Chat Scale Architecture

The chat module is being treated as a standalone communication platform inside Football Science. It must support many organizations, clubs, teams, staff relationships, and eventually very large user counts.

## Architecture stance

- Chat is multi-tenant by default.
- Every chat row belongs to an organization.
- Team chat belongs to a team.
- DM and group chat use explicit participants.
- Writes go through `/api/chat` so action rules, audit, rate limits, retention, and abuse controls stay centralized.
- Database RLS protects reads and future realtime subscriptions.
- Generic app-state sync is only a compatibility bridge and should not be the long-term chat storage model.

## Tenant model

Core scope fields:

- `organization_id`
- `team_id`
- `thread_id`
- `user_id`

Relationship fields:

- membership role
- membership status
- relationship type
- participant role
- notification level

This lets one person be a coach in one team, analyst in another, and excluded from a third.

## Database layer

Canonical migration:

- `supabase/migrations/20260507130000_chat_module_multitenant.sql`

Main tables:

- `chat_organizations`
- `chat_teams`
- `chat_team_memberships`
- `chat_threads`
- `chat_thread_participants`
- `chat_messages`
- `chat_message_mentions`
- `chat_reactions`
- `chat_read_receipts`
- `chat_attachments`
- `chat_audit_events`
- `chat_retention_policies`

## Security model

- Deny by default.
- Staff-only baseline: `admin`, `coach`, `analyst`, `performance`, `medical`.
- Guest and player roles are not chat staff roles unless a future product decision explicitly grants scoped access.
- Authorization role must come from Supabase `app_metadata`, not user-editable metadata.
- Team membership controls team chat.
- Explicit participants control DM and group chat.
- Admin-only read access to audit.
- Client-side direct writes are not granted in the migration; writes should go through server API.

## Realtime model

Realtime should be thread-scoped.

Recommended subscriptions:

- `chat_threads` for the active team list
- `chat_messages` for the currently open thread only
- `chat_reactions` for the currently open thread only
- `chat_read_receipts` batched/debounced

Avoid:

- global chat subscriptions
- subscribing to every thread for every user
- storing typing indicators as durable database rows

## Scale rules

- Use cursor pagination for messages.
- Never load a full thread into memory.
- Store `last_message_at`, `last_message_id`, and `message_count` on threads.
- Batch read receipts.
- Use idempotency via `client_message_id`.
- Keep message bodies capped at `1600` chars.
- Use object storage for attachments.
- Keep file scanning/processing outside the request path.
- Move rate limits to Redis/Upstash before high traffic.
- Use retention jobs so old chat rows do not grow forever.

## Migration sequence

1. Apply the multi-tenant chat migration in Supabase.
2. Build database-backed `/api/chat` write paths.
3. Keep app-state bridge read-compatible during rollout.
4. Move UI writes to database-backed API.
5. Add browser QA for team chat, DM, mentions, reactions, read receipts, pin/delete, and mobile.
6. Enable thread-scoped realtime reads.
7. Disable generic app-state writes for `football-dashboard-chat-v1`.
8. Add retention jobs and operational dashboards.

## Current implementation switch

The database adapter exists behind:

- `CHAT_STORAGE_MODE=database`

Keep this disabled until the migration has been applied in the target Supabase project and database-mode QA has passed.
