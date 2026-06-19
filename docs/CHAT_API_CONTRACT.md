# Chat API Contract

This document defines the standalone chat module foundation. Chat is database-primary through `/api/chat`; the old app-state key is preserved only as a compatibility/cache bridge for existing UI and data-safety contracts.

## Endpoint

- `GET /api/chat`
- `POST /api/chat`

Both endpoints require a signed-in Supabase actor with one of these staff roles:

- `admin`
- `club-admin`
- `team-admin`
- `coach`
- `scout`
- `analyst`
- `performance`
- `medical`

`guest` is intentionally excluded.

## Storage compatibility

The API preserves the existing app-state key as compatibility state:

- `football-dashboard-chat-v1`

This key must not become the canonical write path again. Canonical chat records live in the `chat_*` database tables through `/api/chat`. Generic app-state writes are a legacy compatibility concern only.

## Supported actions

- `createThread`
- `sendMessage`
- `editMessage`
- `deleteMessage`
- `setMessagePinned`
- `setMessagePriority`
- `addReaction`
- `removeReaction`
- `markThreadRead`
- `setThreadSettings`
- `setThreadParticipants`
- `clearThread`
- `archiveThread`
- `createAttachmentIntent`
- `uploadAttachmentObject`

## Permission model

- Staff can read accessible team threads.
- Staff can send messages.
- Authors can edit their own messages.
- Authors and admins can delete messages.
- Admins, club admins, team admins, and coaches can pin messages, set priority, and manage shared thread identity where allowed.
- Admins can clear a thread.
- Managers can manage non-team thread participants where allowed.
- DM/group access is restricted to participants when participants are defined.
- DM/group threads without participants are hidden from non-admin users.

## Safety controls

- Message text is capped at `1600` characters.
- Rate limits are enforced per actor and action.
- Destructive actions are soft-deletes.
- Audit entries are stored in `chat_audit_events` in database mode.
- Audit entries mark destructive and admin actions explicitly.
- Audit entries redact message body text and store metadata such as thread id, message id, text length, mention count, and priority.
- Retention is explicit: active messages `365` days, soft-deleted messages `30` days, audit `730` days, and `5000` messages per thread.

## Current migration status

- `/api/chat` routes to the database adapter by default.
- `CHAT_STORAGE_MODE=legacy` is the explicit rollback/compatibility override.
- The left-menu chat widget routes core writes through `/api/chat`.
- The legacy app-state shape remains supported as a compatibility cache and data-safety bridge.

## Database target

The canonical schema is the Supabase migration:

- `supabase/migrations/20260507130000_chat_module_multitenant.sql`
- `supabase/migrations/20260507230705_chat_realtime_search_v2.sql`
- `supabase/migrations/20260507234337_chat_storage_attachments_v1.sql`

The older `docs/CHAT_DATABASE_SCHEMA.sql` remains as a readable reference, but the migration is the source of truth for the multi-tenant chat model.

## Database mode flag

`/api/chat` is database-first by default.

Use this server environment variable only for explicit legacy rollback:

- `CHAT_STORAGE_MODE=legacy`

Database mode expects the Supabase migrations to be applied in the active environment. Before adding new chat features, verify the target environment has the migrations, attachment bucket policy, and realtime publication expected by the current code.
