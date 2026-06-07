# Module Contracts

Every module should eventually be extracted behind a stable contract. This file defines the contract before extraction so refactors stay boring and safe.

The coded extraction standard lives in `src/core/module-standard.mjs`, with the operating guide in `docs/MODULE_STANDARD.md` and the guard test in `qa/module-standard.api.spec.mjs`.

## Contract Template

Each module owns:

- `id`: stable module id used by routes, permissions, and tests.
- `purpose`: what user workflow it supports.
- `data`: storage keys now and future database tables later.
- `permissions`: view and edit role expectations.
- `permissionMatrix`: backend-owned `read`, `write`, `delete`, `export`, `restore`, `admin`, and `observe` rules in `src/core/permission-matrix.cjs`.
- `events`: cross-module signals it emits or consumes.
- `qa`: smoke tests that must remain green.
- `migration`: how it moves from current app-state to future tables.
- `dataSafety`: central save contract: `key`, `scope`, `mergePolicy`, `requiredFields`, and server-owned `revision`.

## Data Safety Contract

Every protected module key must also exist in `src/core/data-safety-contracts.cjs`.

Non-negotiable rules:

- Modules save through the central pipeline at `/api/app-state`; browser storage is cache only.
- Modules expose protected API work only through routes registered in the Permission Matrix and guarded by `api/_lib/platform-security.js`.
- Every saved entry is stamped server-side with `updatedAt`, `updatedBy`, `revision`, and `organizationId`.
- Stale versioned writes are rejected unless the module has an explicit server merge policy.
- The server owns merge behavior. Current protected merges include Session Planner field timestamps, Squad player record timestamps, and append/preserve behavior for library-style data.
- Audit entries and snapshots are part of the contract, with sensitive values summarized/redacted rather than blindly storing clinical or secret text.
- A module is not considered safe until `qa/data-safety-contracts.api.spec.mjs` passes for its storage keys.
- A module is not considered secure until `npm run security:platform` proves API guard coverage, permission matrix coverage, tenant scope, RLS, and observability.

## Permission Matrix Contract

The central permission model lives in `src/core/permission-matrix.cjs` and is seeded into `public.platform_permission_matrix`.

Rules:

- UI can only mirror permissions; backend routes and RLS policies are the source of truth.
- Every public `api/*.js` route must be registered in `apiRouteSecurity` with module id, method-to-action mapping, rate limits, and enforcement mode.
- Every tenant-owned database row needs `organization_id`; team-scoped records need `team_id`.
- Security events use `platform_security_events` and structured API logs so incident monitoring can detect spikes in 401/403/429/500 and slow saves.

## Platform Shell

- `id`: `platform-shell`
- `purpose`: navigation, account menu, active workspace, data safety surface.
- `data`: `football-workspace-hub-v3`, `football-platform-structure-v1`
- `permissions`: visible to signed-in users; platform controls require Platform Admin, while Club Admin and Team Admin are scoped to their own club/team surfaces.
- `events`: workspace open, profile open, sign out, data safety status.
- `qa`: localhost boots through dev auth and keeps Supabase config off the local path.
- `migration`: keep shell state small and cache-friendly; move clubs, teams, and memberships from `football-platform-structure-v1` into database tables before multi-club production use.

## Platform Readiness

- `id`: `platform-readiness`
- `purpose`: admin-only health map for GitHub, Vercel, Supabase, staging, release, module ownership, data safety, design system, and observability readiness.
- `data`: no user content; generated from contracts, environment presence checks, package scripts, and release signals.
- `permissions`: Platform Admin only.
- `events`: readiness viewed, readiness refreshed.
- `qa`: `qa/platform-readiness.api.spec.mjs` and `npm run platform:readiness` must prove the readiness contract remains wired.
- `migration`: keep as a core contract/dashboard first; if history is needed later, write snapshots to `platform_release_checks` and `platform_observability_signals` with organization scope and no secret values.

### Platform Health Operating Model

The platform hardening order is now code-owned in `src/core/platform-readiness-contracts.mjs` and can be checked with `npm run platform:health`.

Current long-term priorities:

- Keep the performance ratchet green while extracting `app.js`, `styles.css`, and `index.html` into smaller module-owned surfaces.
- Use Platform Health as the source for a future admin dashboard covering release, staging, backup, API, egress, module, QA, and performance health.
- Move high-risk modules to database-primary storage through staged, audited, tenant-scoped migrations.
- Treat Scouting as a high-priority speed and pagination surface because it is data-heavy and click-sensitive.
- Harden staging into a real mirror before risky Live releases.
- Feed incident signals for deploys, egress, API errors, auth/permission spikes, saves, backups, and restore readiness into the health surface.

Database-primary migration priority: Schedule, Squad, Scouting, Medical Team, Exercise Library, Sessions, Periodization, Gameplan, Transfer Room, and Game Simulator. Chat is tracked as an already database-backed module and should remain under its dedicated ownership path.

## Platform Appearance

- `id`: `platform-appearance`
- `purpose`: Platform Admin-owned visual governance for safe Home layout, density, tone, and section labels so same-type UI changes apply consistently without one-off edits.
- `data`: `football-platform-appearance-v1`
- `permissions`: Platform Admin only for read/write/delete/export/restore/admin/observe; UI can expose controls only after backend permission checks allow the actor.
- `events`: appearance published, appearance reset to defaults, Home layout rerendered.
- `qa`: `qa/platform-appearance-governance.api.spec.mjs` and `qa/home-dashboard-renderer.api.spec.mjs` must prove same-type rules are sanitized, centrally saved, and applied by the Home renderer.
- `migration`: keep as a central app-state contract first. If appearance history or multi-surface theming grows, move revisions into `platform_appearance_versions` with organization scope and audit snapshots.
- `dataSafety`: saved through `/api/app-state` only; localStorage is cache. Server sanitizes text and enum values, stamps revision metadata, blocks non-admin writes, and records audit summaries.

## Platform Identity

- `id`: `platform-identity`
- `purpose`: canonical multi-tenant identity spine for organizations, clubs, teams, users, memberships, tenant links, and module migration checkpoints.
- `data`: no browser storage key; database tables are `platform_organizations`, `platform_clubs`, `platform_teams`, `platform_user_profiles`, `platform_memberships`, `platform_tenant_links`, `platform_module_migration_checkpoints`, and `platform_membership_events`.
- `api`: `/api/platform-identity` returns the signed-in actor's server-owned platform profile, memberships, manageable scopes, and app-state fallback checkpoints. `/api/platform-tenant-bootstrap` is admin-only and idempotently creates/reuses canonical organization, club, team, profile, membership, and tenant-link rows without changing UI/app-state paths. `npm run platform:identity:backfill` is the dry-run-first operational runner for seeding existing Auth users through the same bootstrap pipeline.
- `permissions`: signed-in users can read their own active tenant scope; Platform Admin manages global structure, Club Admin manages their club scope, Team Admin manages their team scope. Writes must go through guarded server APIs/service-role paths.
- `permissionMatrix`: `platform-identity` must remain present in `src/core/permission-matrix.cjs` and `public.platform_permission_matrix`.
- `events`: tenant created, membership changed, scope changed.
- `qa`: `qa/platform-identity-schema.api.spec.mjs` locks RLS, app-metadata authorization, server-write-first access, soft-delete, membership events, and migration checkpoints. `qa/platform-identity-api.api.spec.mjs` locks the read-only Actor Scope API and prevents user metadata from becoming an authorization source. `qa/platform-tenant-bootstrap.api.spec.mjs` locks the admin-only bootstrap path, dry-run behavior, write ordering, and tenant-link conflict protection. `qa/platform-identity-backfill.api.spec.mjs` locks dry-run by default, explicit apply confirmation, and role derivation from server-owned `app_metadata`.
- `migration`: current `football-platform-structure-v1`, chat tenant tables, and squad tenant tables remain active until each module is linked through `platform_tenant_links` and proven through shadow/dual-read checks.
- `dataSafety`: the identity foundation is database-owned and does not add a browser storage key. App-state modules continue using their Data Safety Contracts until database-primary migration is explicit.

## Home

- `id`: `home`
- `purpose`: staff workspace for personal tasks, delegated work, alerts, tutorial/news, and daily operational entry points.
- `data`: `football-dashboard-tasks-v1`, `football-dashboard-notification-seen-v1`, `football-dashboard-tutorial-prefs-v1`, `football-dashboard-news-seen-v1`
- `permissions`: signed-in staff can manage their own tasks and participate in chat; admin can clear/delete broader records where allowed.
- `events`: task created, task completed, profile opened.
- `qa`: dashboard data remains protected by app-state and backups.
- `migration`: tasks should move before deeper planning modules. Home Tasks now has an inert read-only adapter boundary in `src/modules/home/tasks-adapter.mjs`; it must stay read-only until migration is explicit.

## Team Chat

- `id`: `chat`
- `purpose`: staff room and direct colleague messaging.
- `data`: `football-dashboard-chat-v1`
- `permissions`: signed-in staff can send/read; guest access is excluded; admin-only destructive actions stay explicit.
- `events`: message sent, message read, reaction changed, direct thread opened.
- `qa`: chat storage remains protected by app-state and backups.
- `migration`: move to `chat_threads`, `chat_messages`, `chat_read_receipts`, and `chat_reactions` after the standalone chat module boundary is stable. The inert Chat adapter must keep matching the legacy widget payload until a verified database adapter can be dual-read.

## Exercise Library

- `id`: `exercise-library`
- `purpose`: reusable exercise catalog shared with the Session Planner.
- `data`: `football-session-exercise-library-v1`, `football-session-exercise-library-backup-v1`, `football-session-exercise-library-folders-v1`, `football-session-exercise-library-folders-backup-v1`
- `permissions`: platform/club/team admin and coach edit; planning roles view.
- `events`: exercise saved, exercise archived, exercise restored, folder created, exercise assigned to folder.
- `qa`: existing library entries must stay protected and restorable; folder changes must never delete exercise records.
- `migration`: migrate before Session Planner blocks where possible; use soft archive, folder membership tables, and versioning instead of hard deletes.

## Schedule

- `id`: `schedule`
- `purpose`: season calendar and event source for planned training/matches/off days.
- `data`: `football-schedule-v1`
- `permissions`: platform/club/team admin and coach edit; broader staff view according to workspace access.
- `events`: date selected, event created, event updated, event removed.
- `qa`: schedule edits persist after refresh; `qa/schedule-module-contract.api.spec.mjs` locks the extracted state/actions/renderer boundary.
- `migration`: current app-state remains active while the database foundation is staged in `schedule_events`, `schedule_event_versions`, `schedule_state_sync_events`, and `schedule_audit_events`. Schedule now owns state, actions, controller wiring, and rendering in `src/modules/schedule`, while `app.js` remains the integration shell for storage and cross-module Session/Periodization callbacks. Writes stay server-owned, row-version checked, RLS protected, and blocked from direct authenticated client writes until migration is explicit.

## Gameplan

- `id`: `gameplan`
- `purpose`: compact, read-first match command room for staff alignment, starting XI/bench selection, week-focus principles synced from Periodization/Session Planner, player-assigned mini-game focus, role-specific staff views, top decision triggers, evidence chips linked to Analysis Room/Scouting/match media sources, matchday observations, checklist readiness, post-match learning, and a separate Player Brief for selected squad players.
- `data`: `football-gameplan-v1`
- `api`: `/api/gameplan-player-brief` signs expiring Player Brief links for staff and serves public, token-gated player payloads without staff/opponent-plan fields.
- `permissions`: platform/club/team admin, coach, scout, and analyst edit; performance and medical can read staff-safe preparation context.
- `events`: gameplan updated, player brief published.
- `qa`: protected by central state, Data Safety Contracts, permission matrix, Supabase permission seed, signed-link API contracts, and browser proof that Player Brief publishing does not leak staff responsibility text. `qa/gameplan-player-brief-api.api.spec.mjs` verifies token signing, expiry, sanitization, audience gates, individual Player Brief payloads, player-scoped mini-game focus, receipt mutation, linked evidence-source fields, lineup/bench normalization, week-focus principles, and elite workflow state normalization. `qa/gameplan-player-brief.smoke.spec.mjs` verifies the read-first Plan mode, Edit toggle, lineup/bench editing, Periodization/Session Planner week-focus sync, assigned mini-game focus in the player portal, linked evidence source panel, Staff role lens, selected-player portal access, blocked non-audience access, and read receipts.
- `migration`: move later into `gameplan_match_plans`, `gameplan_staff_roles`, `gameplan_player_briefs`, `gameplan_scenarios`, `gameplan_evidence`, and `gameplan_observations` with team scope, revision checks, soft archive, and explicit audience membership.

## Periodization

- `id`: `periodization`
- `purpose`: shared macrocycle, microcycle, and training day planning board.
- `data`: `football-periodization-v2`
- `permissions`: platform/club/team admin, coach, and performance edit; other planning roles view as configured.
- `events`: day updated, selected date changed, periodization opened from sessions.
- `qa`: periodization day notes persist after refresh; `qa/periodization-module-contract.api.spec.mjs` locks the extracted state, renderer, controller bindings, Session Planner bridge, and merge boundary.
- `migration`: current app-state remains active while state normalization, stale-tab merge helpers, rendering, workspace controller bindings, and the Session Planner overlay bridge live in `src/modules/periodization`. Move to `periodization_days` after schedule and session foundations are stable; `app.js` remains the integration shell.

## Sessions

- `id`: `session-planner`
- `purpose`: build, edit, print, and review training sessions for one date at a time.
- `data`: `football-session-planner-v3`, `football-session-exercise-library-v1`, `football-session-exercise-library-backup-v1`, `football-session-exercise-library-folders-v1`, `football-session-exercise-library-folders-backup-v1`
- `permissions`: platform/club/team admin and coach edit; analyst/performance/medical view where configured.
- `events`: block updated, exercise saved, exercise archived, tactical image changed, medical availability read.
- `qa`: session planner block edits persist after refresh.
- `migration`: migrate exercise library before session blocks if possible; preserve library entries with soft archive, never destructive seed overwrite.

## Medical Team

- `id`: `medical-team`
- `purpose`: player availability, participation guidance, injury plans, and coach-safe summaries.
- `data`: `football-medical-team-v1`, `football-player-profiles-v1`
- `permissions`: medical/performance/platform/club/team admin edit medical details; coaches see coach-safe fields.
- `events`: availability updated, player selected, coach-safe note changed, session planner reads selected-date availability.
- `qa`: medical recommendation edits persist after refresh.
- `migration`: current app-state remains active while the database foundation is staged in `medical_*` tables. Clinical writes are server-owned; direct authenticated reads are limited to coach-safe availability columns/views, with private governance, consent, cases, internal notes, sign-offs, load gates, review tasks, and audit events protected by RLS for medical/performance/admin service workflows.

## Squad

- `id`: `player-profiles`
- `purpose`: roster identity, team/season squad context, player profile data, and profile-linked planning context.
- `data`: `football-player-profiles-v1`
- `permissions`: platform/club/team admin, coach, and scout edit; medical/performance access to relevant fields.
- `events`: player updated, profile image changed, roster imported.
- `qa`: protected by central state and backup contracts.
- `migration`: move through the read-only Squad adapter first, then dual-read / dual-write into `squad_organizations`, `squad_clubs`, `squad_teams`, `squad_seasons`, `squad_players`, `squad_roster_memberships`, and supporting `squad_*` history/import/media tables. Preserve `football-player-profiles-v1` until database reads, backups, and rollback drills are verified.

## Scouting

- `id`: `scouting`
- `purpose`: Shadow XI planning, player database scouting, favorites/lists, reports, and opposition scouting.
- `data`: `football-scouting-v1`
- `permissions`: platform/club/team admin, coach, scout, and analyst view/edit; platform admin owns module administration.
- `import`: `scouting-import-data.js` is generated from the real Wyscout Excel source and lazy-loaded by Scouting.
- `events`: scouting favorite toggled, scouting list updated, Shadow XI slot assigned, scouting report created.
- `qa`: protected by central state, permission matrix, and migration contracts.
- `migration`: move through app-state first, then dual-read / dual-write into `scouting_players`, `scouting_player_metrics`, `scouting_lists`, `scouting_shadow_xi`, and `scouting_reports`.

## Football Science DB

- `id`: `football-science-db`
- `purpose`: global player identity, source links, rosters, teams, competitions, and season stat foundations for both women's and men's football.
- `data`: server-first Supabase tables with `fsdb_*` prefix; no browser storage key.
- `permissions`: staff roles can read through the guarded API; import/write is limited to platform/club/team admin, scout, and analyst roles; destructive actions are admin-only and schema-protected against hard deletes.
- `source direction`: start with open identity/crosswalk data such as Reep, then connect licensed/API/provider and user-owned imports for current rosters and performance data.
- `api`: `/api/football-science-db` owns status, paginated player search, player profile hydration, and chunked server imports.
- `qa`: `qa/football-science-db-schema.api.spec.mjs` and `qa/football-science-db-api.api.spec.mjs` protect RLS, grants, scale indexes, max page size, cursor pagination, and importer normalization.
- `migration`: Scouting should consume this server-first database instead of shipping huge player blobs to the browser. Keep the existing Scouting app-state/import paths active until the FSDB read path is proven live.

## Game Simulator

- `id`: `game-simulator`
- `purpose`: tactical sequence creation, sequence library, and replay.
- `data`: `football-simulator-sequence-v1`, `football-simulator-sequence-library-v2`
- `permissions`: platform/club/team admin, coach, scout, and analyst edit; performance view as configured.
- `events`: sequence saved, sequence loaded, library item archived/restored.
- `qa`: protected by central state and backup contracts.
- `migration`: move large sequence payloads last, after export/import and restore drills are proven.
