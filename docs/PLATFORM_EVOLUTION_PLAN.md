# Platform Evolution Plan

This plan is the long-term safety rail for growing Football Science without breaking what already works.

## Principle

Do not rebuild the platform in one big-bang rewrite. Evolve it by adding a modular core beside the current app, then move one module at a time only after tests, backup checks, and rollback paths are in place.

## Non-Negotiables

- Protected coaching data must not be deleted, reset, seeded over, or silently overwritten.
- Current Supabase Storage app-state remains the production source of truth until a module has a verified database replacement.
- New Postgres tables must be additive first. Do not remove the current storage path during early migrations.
- Any table exposed through Supabase APIs must have RLS enabled and policies reviewed before production use.
- Authorization data belongs in `app_metadata` or server-side tables, not user-editable metadata.
- Every production release must pass local QA and basic live verification.
- Every data migration needs a rollback story and a restore drill path.

## Stages

### Stage 1: Safety Rails

- Keep current behavior unchanged.
- Add architecture contracts to QA.
- Document module ownership, protected storage keys, rollback rules, and the migration order.
- Add live QA credentials before relying on production smoke as a release gate.

### Stage 2: Modular Core

- Create a small core layer for modules, storage adapters, permissions, events, and UI lifecycle.
- Start with read-only wrappers around the existing functions.
- Extract one low-risk module at a time without changing the visible UI.
- Keep the first modular core files inert until tests prove that each extracted module preserves existing behavior.

Current inert skeleton:

- `src/core/platform-contracts.mjs`
- `src/core/module-registry.mjs`
- `src/core/permissions.mjs`
- `src/core/events.mjs`
- `src/core/storage-adapters.mjs`
- `src/modules/manifest.mjs`
- `src/modules/home/tasks.mjs`
- `src/modules/home/tasks-adapter.mjs`
- `src/modules/home/chat.mjs`
- `src/modules/home/chat-adapter.mjs`
- `src/modules/schedule/events.mjs`
- `src/modules/schedule/schedule-adapter.mjs`

These files are not loaded by `index.html` yet. They exist so future refactors have a safe destination and a tested contract before product logic moves.

First adapter boundary:

- Home Tasks has a read-only adapter for the existing `football-dashboard-tasks-v1` payload.
- It can normalize current task records and calculate the same Work Queue buckets as the current dashboard.
- Writes remain blocked until a later migration explicitly enables them.
- Chat has a standalone read-only adapter for the existing `football-dashboard-chat-v1` payload.
- It can normalize current messages, direct-message thread ids, unread counts, mentions, reactions, and thread lists without loading in the current UI.
- Chat writes, read receipts, and destructive actions remain blocked until migration is explicitly enabled.
- Schedule has a read-only adapter for the existing `football-schedule-v1` payload.
- It can normalize current calendar state, select day/month events, identify main events, and locate training-session events.
- Schedule writes and event removal remain blocked until migration is explicitly enabled.
- Schedule also has a staged server adapter and Supabase migration for `schedule_events`, sync inbox, versions, and audit logs. It remains feature-flagged so the current app-state path stays the production source of truth until dual-read / dual-write verification is green.

### Stage 3: Data Adapter Layer

- Each module reads and writes through a stable adapter.
- The first adapter keeps using current `/api/app-state`.
- A database adapter can then be introduced module by module.
- During migration, use dual-read / dual-write only where needed and compare results before switching reads.
- Database adapters start in shadow/dual-write mode, never as the first live source. They must reject stale writes with row-version checks and preserve the old `/api/app-state` recovery path until rollback drills are proven.

### Stage 4: Database Model

Move from global JSON objects toward relational tables:

- organizations
- teams
- profiles
- memberships
- schedule_events
- sessions
- session_blocks
- exercises
- periodization_days
- medical_availability
- tasks
- chat_threads
- chat_messages
- audit_events

Every tenant-owned table should include `organization_id`. Team-specific records should also include `team_id`.

### Stage 5: Scale and Operations

- Add staging and production separation.
- Add load tests for auth, schedule, session planner, chat, and app-state APIs.
- Add monitoring for auth errors, function latency, failed writes, backup freshness, and frontend exceptions.
- Add restore drills and point-in-time recovery when data volume or business risk justifies it.

## Migration Order

1. Home Tasks
2. Team Chat
3. Schedule
4. Exercise Library
5. Session Planner
6. Periodization
7. Medical Team
8. Game Simulator

This order starts with smaller, separable modules before moving the deepest planning data.

## Release Rule

For each stage:

1. Add tests first or in the same commit.
2. Keep old data paths active.
3. Deploy only when requested, using the current fast/safe deploy agreement.
4. Require QA to pass before any production deploy.
5. Verify production endpoints.
6. Keep rollback simple: revert code first, restore data only if a migration actually changed production data.
