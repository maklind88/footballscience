# Chat Module Plan

## Direction

Chat is a standalone module with a global entry point in the left navigation rail. It should keep the current foundation and mature it gradually:

- Team room
- Direct messages
- Unread and mention counts
- Read receipts
- Replies
- Reactions
- Pinned messages
- Priority messages
- Typing/presence
- Toast notifications
- Admin-only destructive actions

## Current Security Posture

Strong now:

- Message output is escaped before rendering.
- Mentions are rendered from escaped text.
- Chat is database-primary through `/api/chat`; `football-dashboard-chat-v1` is compatibility/cache state only.
- The standalone module has a read-only adapter boundary.
- Guest writes to central chat state are blocked by the `chat` permission mapping.
- Message length is capped before storage and in the composer.
- Destructive/admin actions have server-side audit coverage in database mode.

Still not complete for long-term sensitive use:

- Local browser storage should not be treated as a safe place for sensitive medical or player welfare content.
- The app-state compatibility path must not be expanded; it should remain rollback/cache only.
- Chat decisions still need product rules for when they should be promoted into IDP, Medical, Gameplan, Video, or Tasks instead of staying buried in conversation.

## Development Order

1. Keep the database-primary contract stable before adding new chat features.
2. Verify active environments have chat migrations, attachment storage, and realtime publication applied.
3. Keep improving the left-menu chat entry and in-widget UX without replacing the current behavior.
4. Prevent generic app-state writes from becoming a second source of truth.
5. Add retention jobs and operational health checks for growing chat tables.
6. Split large chat renderer/API files only after behavior stays green under `npm run qa:chat`.

Current stabilization packet: `docs/CHAT_STABILIZATION_RELEASE_PACKET.md`.

## UX Gaps

- Composer should feel more like a command surface, with clearer priority state and optional compact action menu.
- Thread list can become smarter: unread first, mentions highlighted, recent DMs grouped cleanly.
- Message actions should stay quiet until hover/focus.
- Empty states should be calmer and less instructional.
- Mobile open state needs dedicated visual review.
- Notification controls should become clearer than the current On/Off text.

## Product Guardrails

- Do not turn Chat into a full page.
- Do not move Chat out of the left navigation/menu entry point.
- Do not replace the existing chat concept.
- Do not reset or migrate away existing `football-dashboard-chat-v1` data without a dual-read phase.
- Do not add rich HTML messages unless sanitization is explicit and tested.

## Current Foundation Status

- Dedicated `/api/chat` contract exists.
- Server-side action rules exist for send, edit, delete, pin, priority, reactions, read receipts, thread clearing, and DM/group access filtering.
- Rate limiting exists per actor and chat action.
- Retention policy exists for active messages, soft-deleted messages, audit entries, and per-thread message caps.
- Audit entries now mark destructive and admin actions.
- Chat-specific API QA covers staff-only access, message normalization, mentions, DM filtering, pin, priority, reactions, read receipts, delete rules, clear-thread rules, and retention.
- Canonical database schema exists in `supabase/migrations/20260507130000_chat_module_multitenant.sql`; the readable docs schema is historical/reference only.

## Multi-Tenant Scale Step

- Canonical Supabase migration now exists at `supabase/migrations/20260507130000_chat_module_multitenant.sql`.
- The chat model now has organization, team, membership, thread, participant, message, mention, reaction, read receipt, attachment, audit, and retention tables.
- The database stance is server-write first: authenticated clients can read RLS-protected rows, but writes should go through `/api/chat`.
- `/api/chat` is database-first by default.
- `CHAT_STORAGE_MODE=legacy` is the explicit rollback/compatibility override.
- The app-state compatibility layer should be retired only after active environments prove database reads/writes, attachments, and realtime are stable.

## UI Write Migration Status

- The left-menu chat UI now routes send, delete, pin, reaction, clear-thread, and read-receipt writes through `/api/chat` first.
- Retryable API failures fall back to the legacy app-state write path for continuity.
- Authorization/rate-limit failures do not fall back to local writes.
- The current UI still preserves legacy-compatible shape handling so existing data and rollback paths do not break.

## Destructive Action UX

- Chat delete and clear-thread no longer use browser-native `confirm()`.
- Destructive chat actions now use an in-widget confirmation dialog with explicit cancel/confirm controls.
- This keeps the UX professional and makes destructive flows stable for browser QA.

## Chat Module v2

- Chat is now database-first by default, with an explicit legacy override through `CHAT_STORAGE_MODE=legacy`.
- Legacy thread identifiers such as `team` are mapped server-side into organization, team, and database thread scope.
- The widget now supports paginated reads, Supabase realtime refresh hooks, message search, notification levels, admin audit visibility, attachment intents, and richer team-scoped thread types: staff, medical, matchday, training, and announcements.
- Supabase realtime publication and trigram search indexes are applied in `20260507230705_chat_realtime_search_v2.sql`.
