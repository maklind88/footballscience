# Chat API Contract

This document defines the standalone chat module foundation. The current UI can keep its existing bottom-right experience while the platform migrates chat writes from generic app-state sync to this dedicated API.

## Endpoint

- `GET /api/chat`
- `POST /api/chat`

Both endpoints require a signed-in Supabase actor with one of these staff roles:

- `admin`
- `coach`
- `analyst`
- `performance`
- `medical`

`guest` is intentionally excluded.

## Storage compatibility

The API preserves the existing app-state key:

- `football-dashboard-chat-v1`

This keeps current data compatible while moving mutation rules into a dedicated chat contract.

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
- `clearThread`

## Permission model

- Staff can read accessible team threads.
- Staff can send messages.
- Authors can edit their own messages.
- Authors and admins can delete messages.
- Admins and coaches can pin messages and set priority.
- Admins can clear a thread.
- DM/group access is restricted to participants when participants are defined.
- DM/group threads without participants are hidden from non-admin users.

## Safety controls

- Message text is capped at `1600` characters.
- Rate limits are enforced per actor and action.
- Destructive actions are soft-deletes.
- Audit entries are stored in the chat state during the app-state compatibility phase.
- Audit entries mark destructive and admin actions explicitly.
- Audit entries redact message body text and store metadata such as thread id, message id, text length, mention count, and priority.
- Retention is explicit: active messages `365` days, soft-deleted messages `30` days, audit `730` days, and `5000` messages per thread.

## Next migration step

Wire the bottom-right chat UI to `createChatApiClient()` from `src/modules/chat/chat-api-client.mjs` for writes first, then move reads after browser QA confirms parity with the current experience.

## Database target

The canonical long-term schema is now a Supabase migration:

- `supabase/migrations/20260507130000_chat_module_multitenant.sql`

The older `docs/CHAT_DATABASE_SCHEMA.sql` remains as a readable reference, but the migration is the source of truth for the multi-tenant chat model.

Writes should move to database-backed `/api/chat` routes before generic app-state writes are disabled.

## Database mode flag

`/api/chat` remains app-state compatible by default.

Set this server environment variable to route chat through the database adapter:

- `CHAT_STORAGE_MODE=database`

Database mode expects the Supabase migration to be applied first. Do not enable it before database-backed QA has passed for the active environment.
