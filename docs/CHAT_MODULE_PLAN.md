# Chat Module Plan

## Direction

Chat is a standalone module with a global bottom-right experience. It should keep the current foundation and mature it gradually:

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
- Chat storage is in the protected central state allowlist.
- The standalone module has a read-only adapter boundary.
- Guest writes to central chat state are blocked by the `chat` permission mapping.
- Message length is capped before storage and in the composer.

Still not complete for long-term sensitive use:

- Chat writes still sync the whole legacy payload instead of individual server-side message operations.
- Admin destructive actions are still UI-level actions over the legacy payload.
- There is no per-message audit trail for delete, clear, pin, or reaction changes yet.
- Local browser storage should not be treated as a safe place for sensitive medical or player welfare content.

## Development Order

1. Stabilize the standalone module boundary.
2. Keep improving the bottom-right UX without replacing the current behavior.
3. Add chat-specific server APIs for send, read receipt, reaction, pin, delete, and clear.
4. Add audit logging for destructive actions and permission-sensitive changes.
5. Move from `football-dashboard-chat-v1` payload sync to future tables:
   `chat_threads`, `chat_messages`, `chat_read_receipts`, `chat_reactions`.
6. Add focused browser QA for chat open, send, DM switch, read receipt, mention, pin, delete, and mobile layout.

## UX Gaps

- Composer should feel more like a command surface, with clearer priority state and optional compact action menu.
- Thread list can become smarter: unread first, mentions highlighted, recent DMs grouped cleanly.
- Message actions should stay quiet until hover/focus.
- Empty states should be calmer and less instructional.
- Mobile open state needs dedicated visual review.
- Notification controls should become clearer than the current On/Off text.

## Product Guardrails

- Do not turn Chat into a full page.
- Do not remove the bottom-right placement.
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
- Migration-ready table schema exists in `docs/CHAT_DATABASE_SCHEMA.sql`.

## Not Yet Switched

- The current bottom-right UI has not been fully moved from legacy app-state persistence to `/api/chat`.
- The next safe step is write-first UI migration: send, delete, pin, priority, reactions, and read receipts should call `/api/chat`, while reads can stay compatible until parity is confirmed.
- After write migration passes QA, generic app-state writes for `football-dashboard-chat-v1` should be blocked so chat no longer syncs as a full payload.

## Multi-Tenant Scale Step

- Canonical Supabase migration now exists at `supabase/migrations/20260507130000_chat_module_multitenant.sql`.
- The chat model now has organization, team, membership, thread, participant, message, mention, reaction, read receipt, attachment, audit, and retention tables.
- The database stance is server-write first: authenticated clients can read RLS-protected rows, but writes should go through `/api/chat`.
- The next implementation step is database-backed `/api/chat` writes with app-state read compatibility during rollout.
- The current app-state compatibility layer should be removed only after UI writes and QA have moved to the database-backed API.
- Database adapter is feature-flagged behind `CHAT_STORAGE_MODE=database`.

## UI Write Migration Status

- Bottom-right chat UI now routes send, delete, pin, reaction, clear-thread, and read-receipt writes through `/api/chat` first.
- Retryable API failures fall back to the legacy app-state write path for continuity.
- Authorization/rate-limit failures do not fall back to local writes.
- The current UI still reads from the legacy-compatible local/app-state shape until database-mode read parity is implemented.

## Destructive Action UX

- Chat delete and clear-thread no longer use browser-native `confirm()`.
- Destructive chat actions now use an in-widget confirmation dialog with explicit cancel/confirm controls.
- This keeps the UX professional and makes destructive flows stable for browser QA.

## Chat Module v2

- Chat is now database-first by default, with an explicit legacy override through `CHAT_STORAGE_MODE=legacy`.
- Legacy thread identifiers such as `team` are mapped server-side into organization, team, and database thread scope.
- The widget now supports paginated reads, Supabase realtime refresh hooks, message search, notification levels, admin audit visibility, attachment intents, and richer team-scoped thread types: staff, medical, matchday, training, and announcements.
- Supabase realtime publication and trigram search indexes are applied in `20260507230705_chat_realtime_search_v2.sql`.
