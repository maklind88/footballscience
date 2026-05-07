# Module Contracts

Every module should eventually be extracted behind a stable contract. This file defines the contract before extraction so refactors stay boring and safe.

## Contract Template

Each module owns:

- `id`: stable module id used by routes, permissions, and tests.
- `purpose`: what user workflow it supports.
- `data`: storage keys now and future database tables later.
- `permissions`: view and edit role expectations.
- `events`: cross-module signals it emits or consumes.
- `qa`: smoke tests that must remain green.
- `migration`: how it moves from current app-state to future tables.

## Platform Shell

- `id`: `platform-shell`
- `purpose`: navigation, account menu, active workspace, data safety surface.
- `data`: `football-workspace-hub-v3`
- `permissions`: visible to signed-in users; admin surfaces require admin.
- `events`: workspace open, profile open, sign out, data safety status.
- `qa`: localhost boots through dev auth and keeps Supabase config off the local path.
- `migration`: keep shell state small and cache-friendly; do not mix product records into shell state.

## Home

- `id`: `home`
- `purpose`: staff workspace for personal tasks, delegated work, alerts, tutorial/news, and team chat entry points.
- `data`: `football-dashboard-tasks-v1`, `football-dashboard-chat-v1`, `football-dashboard-notification-seen-v1`, `football-dashboard-tutorial-prefs-v1`, `football-dashboard-news-seen-v1`
- `permissions`: signed-in staff can manage their own tasks and participate in chat; admin can clear/delete broader records where allowed.
- `events`: task created, task completed, message sent, message read, profile opened.
- `qa`: dashboard data remains protected by app-state and backups.
- `migration`: tasks and chat should move before deeper planning modules. Home Tasks now has an inert read-only adapter boundary in `src/modules/home/tasks-adapter.mjs`; Home Chat has the same read-only boundary in `src/modules/home/chat-adapter.mjs`. Both must stay read-only until migration is explicit.

## Team Chat

- `id`: `chat`
- `purpose`: staff room and direct colleague messaging.
- `data`: `football-dashboard-chat-v1`
- `permissions`: signed-in staff can send/read; admin-only destructive actions stay explicit.
- `events`: message sent, message read, reaction changed, direct thread opened.
- `qa`: chat storage remains protected by app-state and backups.
- `migration`: move to `chat_threads`, `chat_messages`, `chat_read_receipts`, and `chat_reactions` after Home task contracts are stable. The inert Home Chat adapter must keep matching the legacy widget payload until a verified database adapter can be dual-read.

## Exercise Library

- `id`: `exercise-library`
- `purpose`: reusable exercise catalog shared with the Session Planner.
- `data`: `football-session-exercise-library-v1`, `football-session-exercise-library-backup-v1`
- `permissions`: admin/coach edit; planning roles view.
- `events`: exercise saved, exercise archived, exercise restored.
- `qa`: existing library entries must stay protected and restorable.
- `migration`: migrate before Session Planner blocks where possible; use soft archive and versioning instead of hard deletes.

## Schedule

- `id`: `schedule`
- `purpose`: season calendar and event source for planned training/matches/off days.
- `data`: `football-schedule-v1`
- `permissions`: admin/coach edit; broader staff view according to workspace access.
- `events`: date selected, event created, event updated, event removed.
- `qa`: schedule edits persist after refresh.
- `migration`: move to `schedule_events` with `organization_id`, `team_id`, date, type, title, notes, and audit fields.

## Periodization

- `id`: `periodization`
- `purpose`: shared macrocycle, microcycle, and training day planning board.
- `data`: `football-periodization-v2`
- `permissions`: admin/coach/performance edit; other planning roles view as configured.
- `events`: day updated, selected date changed, periodization opened from sessions.
- `qa`: periodization day notes persist after refresh.
- `migration`: move to `periodization_days` after schedule and session foundations are stable.

## Sessions

- `id`: `session-planner`
- `purpose`: build, edit, print, and review training sessions for one date at a time.
- `data`: `football-session-planner-v3`, `football-session-exercise-library-v1`, `football-session-exercise-library-backup-v1`
- `permissions`: admin/coach edit; analyst/performance/medical view where configured.
- `events`: block updated, exercise saved, exercise archived, tactical image changed, medical availability read.
- `qa`: session planner block edits persist after refresh.
- `migration`: migrate exercise library before session blocks if possible; preserve library entries with soft archive, never destructive seed overwrite.

## Medical Team

- `id`: `medical-team`
- `purpose`: player availability, participation guidance, injury plans, and coach-safe summaries.
- `data`: `football-medical-team-v1`, `football-player-profiles-v1`
- `permissions`: medical/performance/admin edit medical details; coaches see coach-safe fields.
- `events`: availability updated, player selected, coach-safe note changed, session planner reads selected-date availability.
- `qa`: medical recommendation edits persist after refresh.
- `migration`: split private medical details from coach-safe availability before scaling.

## Player Profiles

- `id`: `player-profiles`
- `purpose`: roster identity, player profile data, and profile-linked planning context.
- `data`: `football-player-profiles-v1`
- `permissions`: admin/coach edit; medical/performance access to relevant fields.
- `events`: player updated, profile image changed, roster imported.
- `qa`: protected by central state and backup contracts.
- `migration`: move to `profiles` plus player-specific domain tables.

## Game Simulator

- `id`: `game-simulator`
- `purpose`: tactical sequence creation, sequence library, and replay.
- `data`: `football-simulator-sequence-v1`, `football-simulator-sequence-library-v2`
- `permissions`: admin/coach/analyst edit; performance view as configured.
- `events`: sequence saved, sequence loaded, library item archived/restored.
- `qa`: protected by central state and backup contracts.
- `migration`: move large sequence payloads last, after export/import and restore drills are proven.
