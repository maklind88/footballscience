# AI Handoff

Read this file first when starting a new thread on Football Science.

Also read `AGENTS.md` and `docs/LIVE_FIRST_WORKFLOW.md`. Read `docs/PLATFORM_SCALE_PROGRAM.md` when working on multi-tenant identity, app-state migrations, `app.js` extraction, Chat server-first, or Scouting server-first. The durable working model is live-first: the user describes the desired product outcome on `https://footballscience.xyz`, and Codex owns the technical implementation path, QA, GitHub, deploy discipline, and production verification.

## Product

Football Science is a premium coaching platform for daily team operations. The user wants it to become the base of his coaching career: schedule, periodization, session planning, tactical board, team/admin management, IDP, analysis, identity, and game simulator.

Design should feel clean, Apple/Mac-like, calm, professional, and modular. Avoid unnecessary explanations in the UI. Empty data should usually render as empty space, not placeholder text.

## User Preferences

- Communicate with the user in Swedish.
- The user is not expected to know how to build the platform. Treat their messages as product wishes and live observations, not technical implementation instructions.
- Live is the product truth. If the user is looking at `footballscience.xyz`, verify live behavior before assuming local state is enough.
- Ask fewer technical questions. Decide implementation details yourself unless there is a real product, data-loss, security, or release-risk ambiguity.
- Keep UI labels mostly in English football terms unless the user asks otherwise.
- Do not say something is done unless it has been checked.
- The user strongly dislikes needing to ask again if something works locally but not for them.
- Work one module at a time, but keep architecture future-proof.
- Prefer implementation over long theory when the request is clear.
- Parallel chats are allowed only by separated module ownership. Do not touch Team Chat in a non-chat thread when the user says chat is handled elsewhere.

## Current Codebase

- Root: `/Users/maklind/Documents/New project`
- Main files: `index.html`, `app.js`, `styles.css`
- Static prototype, heavy client-side JavaScript.
- Data persistence is centralized through `/api/app-state`, which syncs the current app state keys to the private Supabase Storage bucket `footballscience-app-state`; localStorage remains the browser cache/autosave layer.
- Shared data safety lives in `src/core/data-safety-contracts.cjs` and is re-exported through `src/core/data-safety-contracts.mjs`. `/api/app-state` and `/api/app-state-backup` read protected keys from this registry, so new modules must add a contract before they can be centrally saved or backed up. `/api/app-state-backup-status` rewrites into the existing backup function and verifies latest backup pointer/object metadata for monitor checks without exposing saved backup entries.
- `npm run storage:guard` verifies every app-level Football Science storage key is either covered by the Data Safety Contract, explicitly dedicated to a server API cache such as chat, or documented as local-only UI state. Add new keys there deliberately; do not introduce hidden production data in localStorage.
- Central state entries are server-stamped with `moduleId`, `organizationId`, `revision`, `updatedAt`, `updatedBy`, `savePipeline`, `sourceOfTruth`, `localPersistence`, and `mergePolicy`. Browser sync sends `baseRevision` from the latest central metadata; versioned stale writes are rejected unless the module has an explicit merge strategy that preserves newer central data. A 409 conflict is not retried blindly; the browser clears the pending flag and hydrates central state back into cache.
- A data-safety layer now protects all `football-*` storage plus platform users/session:
  - autosave status in the account menu
  - manual JSON export/import
  - IndexedDB snapshots for browser-local backup history
  - legacy key migration for known bumped storage keys
  - persistent storage request when the browser supports it
- Central sync uses an explicit allowlist for current app keys. Retired keys such as `football-session-planner-v1/v2`, old workspace hub versions, and old `mak-coaching-platform-*` auth prototype keys should not be read from or written back to central state.
- Important storage keys in `app.js`:
  - `football-periodization-v2`
  - `football-schedule-v1`
  - `football-session-planner-v3`
  - `football-medical-team-v1`
  - `football-player-profiles-v1`
  - `football-scouting-v1`

## Platform Scale Program

The scale modernization is tracked in `docs/PLATFORM_SCALE_PROGRAM.md`.

Current scale-foundation branch/worktree:

- Branch: `codex/platform-scale-foundation`
- Worktree: `/Users/maklind/Documents/New project-scale-foundation`

The first foundation adds canonical `platform_*` tenant identity tables and migration checkpoints while keeping the existing app-state/module paths active. Do not treat the database foundation as production-primary until the relevant server API, adapter, QA, and fallback comparison are green.

## Current Navigation Order

Top nav should be:

1. Schedule
2. Periodization
3. Sessions
4. IDP
5. Scouting
6. Analysis Room
7. My Team
8. Medical Team
9. Identity
10. Game Simulator

Profile should be reachable from the account menu on the right, not as a main nav item. Football Science title should act as Home.

## Active Profile / Account Scope

The Profile + Account Menu thread is reserved for profile, account menu, account settings, logout, and account/user-management flows. Do not mix chat, Home dashboard, Session Planner, or other module work into that thread unless the user explicitly redirects it.

Profile/account expectations:

- Profile is opened from the account menu in the top-right.
- Profile shows profile image, first/last name, email, role, title, department, and team/club.
- Profile image and updated name/team must sync back to the top-right account menu.
- Profile images are uploaded through `/api/profile-image` to the public Supabase Storage bucket `footballscience-profile-images`; auth metadata stores only the short public URL. Never store `data:image/...` strings in Supabase Auth metadata because that can bloat JWTs and trigger request-header errors.
- Account menu contains Profile, Settings, and Logout.
- The menu opens/closes reliably and stays above other UI.
- Admin/account flows should stay central-first through Supabase where production auth/user data is involved.
- Admin role/status on the current admin's own account is protected server-side so an admin cannot accidentally pause themselves or remove their own admin role from the Admin UI.
- Admin/Auth now has a scoped management direction: Platform Admin owns global structure, role access, and audit; Club Admin manages only their club and can create teams in that club; Team Admin manages only their team and cannot affect platform structure. Users carry `clubId`, `clubName`, `teamId`, and `teamName`; the local structure prototype lives in `football-platform-structure-v1` until clubs/teams/memberships move into the database.

## Most Active Area

The most active area right now is Session Planner and Tacticalboard.

Recent requirements:

- Medical Team now has a dense availability command-board build with NC Courage 2026 roster profiles, smaller official roster images, Daily Medical Huddle, coach-safe handover feed with copy action, roster-level bulk recommendations, player popup recommendations, player Medical Profile summary, Availability Plans for multi-week/month restrictions, 0/10/25/50/75/100 participation steps, RTP phases, review alerts, clearance checklist/load gates, coach-safe comments, backdated logs, comments, and actual participation logging.
- Medical Team has a first security/governance layer: `/api/app-state` returns a server-sanitized coach-safe version of `football-medical-team-v1` to coach/read-only roles, while admin/medical/performance keep full private fields. Client reads also sanitize coach view from stale local cache. Medical writes and coach-safe handover copy events go to the audit log with counts only, not clinical note text. Medical/admin roles have a private Governance panel for retention months, consent required, policy owner, incident contact, last reviewed date, and review cadence; this policy object is excluded from coach payloads.
- Medical Team now has a staged Supabase RLS foundation in `supabase/migrations/20260507230628_medical_module_multitenant.sql`. It creates `medical_*` tables for governance, consents, cases, availability recommendations/plans, clearance sign-offs, load gates, review tasks, and audit events. The current UI still uses app-state; the migration is server-write first and exposes only coach-safe availability columns/views to authenticated clients.
- Schedule now has a staged Supabase RLS foundation in `supabase/migrations/20260509230500_schedule_module_database_v1.sql` plus `api/_lib/schedule-database.js`. The current UI still uses `football-schedule-v1` through app-state; the database path is feature-flagged, server-write first, row-version protected, soft-delete only, and includes sync inbox, versions, and audit tables.
- Scouting now has a first real recruitment workspace: Shadow XI, lazy-loaded Excel/Wyscout database via `scouting-import-data.js`, filters by league/season/position/minutes/age/metric percentile, profile spider charts, favorites, named lists, and Shadow XI slot assignment. Regenerate the import with `scripts/generate-scouting-import.py` when `/Users/maklind/Desktop/Womens Football (Stats).xlsx` changes.
- Session Planner now reads Medical Team availability for the selected date and shows a compact left-panel availability summary without player names, plus the selected block medical gate so coaches see how many players match the block, sit below the block, are out, or are not set.
- Session Planner `Players / Player Board` shows a larger white pitch preview with no explanatory copy and opens a popup under Tacticalboard. The popup uses a large fixed white pitch that fills the remaining screen space inside the modal without internal scrolling; players are draggable rectangular initial chips that can be placed freely, close together, stacked, or overlapped. Player chips must not nudge on hover or tiny pointer movement; drag begins only after a clear movement threshold. The selected-player toolbar lives in the popup top bar, not on top of the pitch: drag a selection rectangle on the board to select multiple players, move selected players as a group, and apply/reset chip colours for selected players together. Duplicate initials expand with an extra first/last-name letter. Double-clicking a player chip opens a player profile popup with medical availability, planned participation and actual participation for the selected training date. It shows players explicitly set by Medical Team who are available for the selected block load or higher: 0% hidden, 10%+ on block 1, 25%+ on block 2, 50%+ on block 3, and 75%+ on block 4 and later. Players with no medical entry are shown as not set, not assumed to be 100%. Player Board also surfaces block warnings for below-limit, 0%, and not-set players.
- Session Planner date strip should show about one week, scroll smoothly, and arrows should scroll dates only, not change selected day.
- A session belongs to one date only.
- Blocks/exercises should be reorderable.
- Deleting exercises/blocks should ask for confirmation.
- Exercise Library must support save, archive/restore, filtering by Phase/Sub-Phase, and become scalable.
- Non-negotiable Exercise Library rule: future development and migrations must preserve every exercise already built by the user. Never replace, reset, seed over, or hard-delete existing library exercises unless the user explicitly asks for that exact destructive action. Prefer append/merge migrations, backup before writes, and Archive/soft delete over permanent removal.
- Exercise Library saves now use verified local writes, a backup mirror, and local snapshot recovery so saved/uploaded exercise content is not silently reported as saved if browser storage fails.
- Exercise Library now has Active/Archive views. The former Delete action archives exercises with `archivedAt` metadata instead of removing them; archived exercises can be restored and are hidden from normal use until restored.
- Exercise Library now has Phase/Sub-Phase multi-select filters with check marks and direct exercise cards instead of a separate preview panel. Cards expose Use, Duplicate, Edit, folder removal, Archive/Restore where allowed, and lightweight version metadata. Edit opens as a nested popup inside the library modal with explicit Save changes, Save as copy, and Cancel so variants can be created without touching the original exercise.
- Exercise Library folders are stored separately from exercises in `football-session-exercise-library-folders-v1` with `football-session-exercise-library-folders-backup-v1`. Folder membership must never be treated as exercise ownership: archiving/removing a folder must leave exercises available from All Exercises and Archive.
- Exercise Library now has folder views for All Exercises, Team, Mine, and concrete folders. `Team Exercises` is the default team folder. Coaches can create Team/Personal folders and drag active exercises into concrete folder cards.
- Exercise Library folders can be renamed, switched between Team/Personal visibility, archived/restored, and have individual exercises removed from folder membership without changing the exercise record. Exercises now support tags, tag search, and sort modes for recently updated, newest created, title, and phase.
- Tacticalboard should start empty for new exercises.
- Tacticalboard needs better drawing tools, thinner line widths, live line preview, 3-point curve, multi-select/box select and group move, delete all with confirmation.
- Goals should rotate when selected using a handle, not external buttons.
- Add 11v11 goal, dashed line, coach marker `C`, and better cones.

## Verification Habit

Before final response after code changes:

- Run `node --check app.js` when `app.js` changes.
- Localhost/127.0.0.1 has a dev-auth fallback in `index.html` that auto-authenticates a local admin user (`mak`) without Supabase so browser testing can run against isolated localhost localStorage. This must stay local-only and never replace production Supabase auth.
- Check relevant UI flows in browser when possible.
- Do not deploy automatically just because code/design work is finished.
- Deploy only when the user explicitly says `Deploy`, `Deploy fast`, or `Deploy safe`.
- Use `npm run deploy` for routine fast releases unless the change is risky.
- Use `npm run deploy:safe` for auth/login, permissions, app-state/data, Supabase/API, backup/restore, migrations, security, or broad multi-module changes.
- If deploying, verify live `app.js` hash or visible behavior on `footballscience.xyz`.

## Deployment Note

The live site previously showed old Session Planner because browser localStorage kept old data. The session planner storage key was bumped to `football-session-planner-v3`. If live and local differ, verify both deployed assets and browser site data.
