# Modules

## Platform Shell

Top navigation is icon-based. Desired order:

1. Schedule
2. Periodization
3. Sessions
4. IDP
5. Analysis Room
6. My Team
7. Set Pieces
8. Game Simulator

The right account menu owns Profile, Settings, and Logout. The main title `Football Science` should route to Home.

Scale direction:

- The shell owns shared resource loading through `src/core/platform-module-loader.mjs` so CSS, scripts, and dynamic modules are deduplicated.
- Global chat styling is no longer a render-blocking HTML stylesheet; the shell loads it after the app starts and reuses the same promise.
- Heavy workspace code should load on activation or navigation intent. Game Simulator controllers/runtime now go through the shell loader, and top navigation hover/focus preloads the simulator controllers before the click.
- Home-only dashboard rendering should stay scoped to Home. Other workspaces should not re-render Home cards during normal workspace switches.
- Next extraction target: keep moving Sessions, IDP, and Medical state/renderers behind the same loader pattern so `app.js` can shrink in physical chunks. Session Planner already owns autosave, block/form rendering, tactical visual rendering, player board rendering, and print rendering in `src/modules/session-planner`.

## Profile / Account Menu

Purpose: personal profile, account identity, settings entry point, and logout.

Current direction:

- Profile is accessed from the top-right account menu, not the main navigation.
- Profile shows profile image, name, email, role, title, department, and team/club.
- Saved profile changes must update the profile page and the top-right account menu without a refresh.
- Profile image should appear consistently in Profile, account menu, and user-facing places that show the current user.
- Account menu should contain Profile, Settings, and Logout, open/close cleanly, and layer above every workspace.
- Logout must complete immediately in the UI and return the user to sign-in without needing a manual refresh.
- Production account/user data should be Supabase-first, with local browser state only used as cache or local development fallback.

## Home

First screen after login. Title should be `Football Science Coaching Platform`. Keep it clean. It should become the platform dashboard later.

Current direction:

- Welcome the logged-in user by first name.
- Keep Home as a clean staff workspace, not a marketing page.
- Show delegated tasks, personal work, and follow-up without fake default content.
- Staff can delegate tasks from Home.
- Each user can add personal To-Do items directly from Home; the same list is also available on Profile.
- Home should feel like a clean coaching workspace: welcome card first, Staff Room pinned high on the right, and Coach To-Do plus Player/Team Alerts as the main work surface.
- The previous Today Command Center card is intentionally hidden for now; avoid bringing it back until the workflow is clearer.
- Schedule is the source for whether training is planned; Session Planner only adds the exercise blocks.
- Chat is its own standalone module with a global left navigation/menu entry point. Home should not own chat state, unread state, or destructive chat actions.
- First-login tutorial appears as a popup and lets the user choose whether to show it next login.
- If the user chooses not to show the tutorial again, it should stay hidden for that user.
- Release/news popups can appear when `dashboardNewsVersion` changes.

## Schedule

Purpose: season calendar and overview.

Current behavior:

- Month and Overview modes.
- Overview supports 3, 6, 9, and 12 months.
- Events have color by type.
- Admin can edit. Non-admin should view only.
- Native copy/paste should work for day/event workflows where possible.
- Selected day should remain accessible when scrolling long overview ranges.

## Periodization

Purpose: shared coach board for macrocycle, microcycle, and training day planning.

Important behavior:

- State normalization, stale-tab merge helpers, rendering, workspace controller bindings, and Session Planner overlay bridge live in `src/modules/periodization`.
- `app.js` remains the integration shell until the module moves to database-primary storage.
- Month view starts from first Monday in the month and ends on final Sunday of the last week.
- Week view should be visually clean and symmetrical.
- Day card priority order:
  - Day schedule
  - Pre-Training Video
  - Match Phase(s) and Sub Phase(s)
  - Physical Load
  - Pitch Size
- Empty data should not show placeholder text.
- OFF days should be grey and clearly show `OFF`.
- Load should be visual, gauge/barometer style.
- Pitch size should be a green pitch icon with highlighted area:
  - SSG: small-sided area from left goal.
  - MSG: medium/9v9-style area.
  - BSG: full pitch.
- Clicking a day opens a centered overlay for view/edit.
- Edit pencil should look aligned and polished.

## Sessions

Purpose: build training sessions quickly and professionally.

Important behavior:

- A session belongs to one date only.
- Date strip should show roughly one week, scroll smoothly, and include Today.
- Arrows should scroll the strip, not change selected day.
- Left panel shows the session blocks and a compact periodization card for the selected day.
- Periodization card opens the full day overlay when clicked.
- Main panel edits the selected block/exercise.
- Right panel is for Exercise Image / Tacticalboard / Library access.
- Textareas should auto-grow.
- Long text must not break cards; clamp or wrap cleanly in lists.
- Minutes stays as a compact field. Time and Intensity were removed from the block header.
- Match Day tag appears under Training Session title as `(Match Day -1)` style when present.
- Autosave status belongs to Session Planner only and is governed by `src/modules/session-planner/session-planner-autosave.mjs`; block/form rendering is governed by `src/modules/session-planner/session-planner-renderer.mjs`; tactical pitch, visual preview, and tacticalboard markup are governed by `src/modules/session-planner/session-planner-visual-renderer.mjs`; Player Board markup is governed by `src/modules/session-planner/session-planner-player-board-renderer.mjs`; print sheet markup is governed by `src/modules/session-planner/session-planner-print-renderer.mjs`. Other modules should use explicit save flows and central sync without showing Session autosave UI.

## Exercise Library

Purpose: scalable library of reusable exercises.

Required direction:

- Exercise Library state normalization, archive/folder normalization, version snapshots, and storage constants live in `src/modules/exercise-library`.
- Exercise Library overlay rendering now lives in `src/modules/exercise-library/exercise-library-renderer.mjs`.
- Exercise Library save/edit/archive/restore/folder actions now live in `src/modules/exercise-library/exercise-library-actions.mjs`.
- Protected write calls still run through `app.js` until the next smaller extraction pass.
- Existing saved exercises are protected data. Development must not remove, reset, overwrite with seed data, or hard-delete user-built library exercises unless the user explicitly asks for that destructive action.
- Open from Library button or plus menu.
- Save current exercise into library.
- Archive library exercises with confirmation, and restore them from Archive.
- Filter/sort by Phase and Sub-Phase.
- Phase/Sub-Phase multi-select with check marks.
- Show a compact one-exercise-per-row library overview with essential metadata and Use/View/Edit actions.
- View opens a read-only detail popup for the full exercise content.
- Duplicate and edit active library exercises without silently overwriting existing or archived entries.
- Exercise edit mode opens as a nested popup in the library modal with explicit Save changes, Save as copy, and Cancel actions; save/cancel returns to the row overview and Save as copy creates a new exercise variant while preserving the original.
- Keep lightweight version snapshots for library edits/replacements/duplicates.
- Organize exercises with folders/collections stored separately from exercise records.
- Support All Exercises, Team, Mine, and concrete folder views.
- Coaches can create Team or Personal folders and drag active exercises into folders.
- Coaches can rename folders, change folder visibility, restore archived folders, and remove an exercise from a folder without deleting the exercise record.
- Archiving a folder must never archive or delete the exercises inside it.
- Exercises can carry tags for search/scan, and the library supports sort modes for updated, created, title, and phase.
- Library should become large without feeling messy.
- Library exercises carry metadata such as `createdAt`, `updatedAt`, `archivedAt`, `source`, and user ids when available.

## Tacticalboard

Purpose: draw training exercise images inside Session Planner.

Required direction:

- Tacticalboard rendering lives in `src/modules/session-planner/session-planner-visual-renderer.mjs`; Player Board rendering lives in `src/modules/session-planner/session-planner-player-board-renderer.mjs`; print sheet rendering lives in `src/modules/session-planner/session-planner-print-renderer.mjs`; click handling, save flow, undo/redo, and print runtime glue remain in `app.js` until later extraction passes.
- New exercise starts with a clean pitch only.
- Pitch aspect ratio should feel realistic and large enough to work on.
- Board should not reload when adding objects.
- Drawing should start exactly at pointer.
- Lines should preview while drawing.
- Line width slider should actually control stroke width from thin to thicker.
- Drawing cursor should feel like normal pointer, not crosshair.
- Selected objects should show a hand/grab cursor.
- Add and support:
  - Blue player
  - Red player
  - Neutral player
  - Ball
  - Coach `C`
  - Cone
  - Better cone visuals
  - Goal
  - 11v11 Goal
  - Dummy
  - Pole
  - Gate
  - Zone
  - Circle
  - Dashed Line
  - Arrow, Pass, Run, Line, Curve, Free, Text, Erase
- Goals should rotate via selected-object handle, not separate external rotate buttons.
- Curve should use three points so it can be shaped.
- Box select and multi-select should allow moving many objects together.
- Delete selected, undo last, and delete all with confirmation.

## Game Simulator

Purpose: tactical match simulator.

Current direction:

- Main nav click should open an advanced explanation/tutorial page.
- Pressing Enter after the tutorial should open the simulator directly in fullscreen mode.
- The non-fullscreen simulator view is too cluttered and should not be the primary experience.
- Fullscreen button contrast must work in dark mode.
- Simulator should stop/pause when leaving the workspace.

## Admin / My Team

Admin/My Team is the management surface for users, roles, club/team scope, email, password reset/change, and page permissions.

Current direction:

- Platform Admin owns the full platform: club/team structure, role access matrix, central audit, and all users.
- Club Admin is scoped to one club. They can view/manage users in that club, create teams inside that club, and assign team/admin staff roles below platform admin.
- Team Admin is scoped to one team. They can view/manage users in that team and assign staff roles, but they cannot change platform structure, club scope, role access, or central audit.
- Users carry `clubId`, `clubName`, `teamId`, `teamName`, role, email, title, department, and profile image metadata.
- The local prototype stores club/team structure in `football-platform-structure-v1`; long-term this should move to database-backed clubs, teams, and memberships.
- Supabase-backed admin actions should enforce the same scope server-side, not only in the UI.

Future state:

- Database-backed organizations/clubs, teams, memberships, and audit logs.
- Role-based permissions per module with clear platform-only controls.
- Club/team switching if a future user belongs to multiple scopes.

## Analysis Room

Purpose: own-team performance review.

Current direction:

- Analysis Room is for the team's own performances, match reviews, and feedback into training.
- It should not become opposition scouting or recruitment analysis.
- Keep it as a polished placeholder until the workflow is defined.
- Placeholder text: `Skunks Work building this` with a premium skunk visual.

## Scouting

Purpose: recruitment targets, watchlists, scouting notes, reports, and later opposition scouting.

Current direction:

- Scouting is a first-class module with workspace id `scouting`.
- Current state key is `football-scouting-v1`, protected by the central app-state/data-safety contract.
- The live surface now starts with Shadow XI, Database, Lists, Reports, and Opposition tabs.
- `scouting-import-data.js` is generated from `/Users/maklind/Desktop/Womens Football (Stats).xlsx` and lazy-loaded only when Scouting opens. The same generator writes `scouting-import-nwsl-profile-data.js`, a compact NWSL projection used by Squad/IDP profile spiders.
- The imported database contains player-season rows, league/season/position filters, Wyscout-style numeric metrics, percentile highlighting, player profiles, spider charts, favorites, named lists, and Shadow XI slot assignment.
- No fake scouting records should be seeded; imported data must come from the real Excel/Wyscout source.
- Platform Admin, Club Admin, Team Admin, Coach, Scout, and Analyst can view and edit.
- Long-term data should move into `scouting_players`, `scouting_player_metrics`, `scouting_lists`, `scouting_shadow_xi`, and `scouting_reports`.

## Gameplan

Purpose: match-week alignment for the staff, with one clear match plan, owner-specific responsibilities, and a separate Player Brief that can be shared only with selected squad players.

Current direction:

- Gameplan is a first-class module with workspace id `gameplan`.
- Current state key is `football-gameplan-v1`, protected by central app-state, data safety, backup, and permission contracts.
- Gameplans are created from Schedule matches so match metadata stays connected to the season calendar.
- The visible workflow is intentionally compact: `Plan`, `Staff`, `Player Brief`, and `Matchday`.
- `Plan` opens in a read-first Match Command briefing, with a separate Edit mode for objective, non-negotiables, key opponent threat, main advantage, starting XI, bench, linked evidence sources, week-focus principles, mini-game player assignments, and top three decision triggers.
- Week-focus principles are synced from the preparation window in Periodization and Session Planner, then remain editable so staff can add/remove text without losing automation.
- `Staff` owns a role-specific lens for my responsibilities, analyst evidence/clips linked from Analysis Room, Scouting, or match media, keeper brief, and player-safe delivery status, plus the staff meeting agenda, locked decisions, and plan approval.
- `Matchday` combines coach mode, halftime message, observations, checklist, and after-action notes.
- Player Brief is intentionally separate from staff responsibilities. It contains only player-facing headline, message, team focus, position-group focus, phase notes, assigned mini-game focus, player-specific individual focus, selected audience, and publish timestamp.
- Each selected player gets an individual `player-brief` portal URL. Production links are signed through `/api/gameplan-player-brief`, expire, render only player-facing brief content, block players not in the audience, and record opened/acknowledged receipts back into `football-gameplan-v1`.
- Platform Admin, Club Admin, Team Admin, Coach, Scout, and Analyst can edit; Performance and Medical can view staff-safe preparation context.
- Long-term data should move into `gameplan_match_plans`, `gameplan_staff_roles`, `gameplan_player_briefs`, `gameplan_scenarios`, `gameplan_evidence`, and `gameplan_observations`.

## Squad

The old Player Profiles workspace is now `Squad` in product language. Keep the first screen focused on the squad list, player-profile modal, and compact add-player flow. IDP content can return later inside the player profile when it has a clear workflow.

Current direction:

- Squad List stays at the top.
- Search, role-group filter, and add-player button live in one command bar.
- Clicking a player opens the player profile in a modal.
- Adding a real squad player from the platform must create a linked Medical roster slot immediately. That slot uses the Squad profile id as `profileId`, keeps Medical as the clearance owner, and makes the player available to Session Planner as `not set` until Medical logs availability.
- Temporary players can be added as academy call-ups, trialists, or guest training players. They live in Squad and sync a lightweight planning slot across modules, while `countsInSquad=false` keeps them out of first-team totals, depth, and role balance.
- Temporary players can carry a `temporaryFrom`/`temporaryTo` training window. Session Planner sees them inside that window immediately for planning; they do not need Medical clearance before staff can place them into a training session.
- Squad, Medical, and Session Planner self-heal module placements on read: if a player exists in Squad but the linked Medical slot is missing, the slot is recreated without touching existing Medical logs or plans.
- Heavy sections below the list stay hidden until needed.
- Long-term data moves from `football-player-profiles-v1` to the multi-tenant `squad_*` schema.

## IDP

IDP is the Player Development System, not a form or document module. It owns current focus, evidence links, lightweight reviews, next actions, milestones, and staff accountability while referencing Squad players and Video Analysis clips.

Current direction:

- Build as `src/modules/idp`, backed by guarded `/api/idp` routes and `idp_*` database tables.
- Keep browser state as UI cache only; IDP records are database-primary.
- IDP Player Board and individual exercises belong to IDP through `idp_development_interventions`; they must not reuse Session Planner session/block state or become team-session data.
- Clip Bank is automatic from Video Analysis player tags, but Evidence is curated by a coach.
- Do not duplicate player identity from Squad or clip metadata from Video Analysis.
- MVP must stay daily-coach-first: dashboard, player view, current focus, clip bank, mark evidence, short note, review date, next action, and timeline.
- Excluded for now: player login, AI-generated plans, PDF exports, ratings, gamification, advanced analytics, full Medical/Performance integration, and complex scheduling.

## Set Pieces Room

Set Pieces Room replaces the former Team Identity placeholder. It owns reusable attacking and defensive restart plans, opponent responses, variants, phases, structured board elements, semantic movement drawings and timeline playback.

Direction:

- Keep the module independent from Session Planner tacticalboard state and saved exercises.
- Use Squad profiles as read-only player identity references; own players display unique initials and opponents display numbers.
- Store the board as structured, editable data instead of flattened images.
- Preserve timing, opponent movement, second-ball/rest-defence phases and variant branches in the domain model.
- Use protected central app-state as the current compatibility path until a reviewed server-first table migration is ready.

## Medical Team

Purpose: daily module for medical staff to recommend how much each player should participate in upcoming training days and to keep a player-specific medical availability log.

Direction:

- First build is an Availability Control overview for the whole squad.
- Each player profile can store number, name, position, and image URL so the same player base can later feed Squad and IDP work.
- The default player base is seeded from the official NC Courage 2026 roster page with names, position groups, roster images, and source URLs; shirt numbers remain editable/importable.
- The overview should stay efficient: dense squad cards, small player images, command-board summary, and player popup for recommendations/log/profile.
- Daily Medical Huddle shows what changed since yesterday, who is managed today, open recommendations, review pressure, and coach-approved handover notes.
- Medical staff can select multiple roster cards and apply the same dated recommendation, RTP phase, internal note, and optional coach-safe note in one bulk update.
- Coach-Safe Handover gives coaches a clean feed of managed players and explicitly approved notes, with a copy action for staff communication.
- The player popup includes a Medical Profile summary with current status, RTP phase, active plan, review date, 7-day average, log count, clearance sign-offs, and load gate pass count.
- Medical staff can log dated recommendations with fixed participation steps: 0%, 10%, 25%, 50%, 75%, 100%.
- RTP phases are now explicit: Medical restriction, Rehab, Modified team, Full training, Match available.
- Availability Plans can auto-apply a restriction across days/weeks/months for longer injuries, with injury/reason, body area, status, participation, RTP phase, review date, clinical note, and coach-safe note.
- Review alerts flag players needing medical review within the next 7 days.
- Full training/match availability is protected by a clearance checklist: doctor, physio, performance, plus load gates for strength, GPS/load, pain response, wellness, and psychological readiness.
- Each log entry stores status, recommended participation, actual participation when known, and a free-text comment.
- Logs can be backdated and remain visible on each player.
- Coaches see only availability, participation, and comments explicitly approved to share; detailed medical notes remain in the medical view.
- The server filters `football-medical-team-v1` for coach/read-only roles before data reaches the browser: internal notes, diagnosis/body-area fields, review dates, clearance gates, actual participation, and created-by values are stripped from coach-safe payloads.
- Medical Room shows a Security Layer panel that states whether the current user is in full private medical mode or coach-safe mode, and medical writes plus coach-safe handover copies are logged without storing note text in the audit details.
- Medical Room now has a private Governance panel for medical/admin roles: retention months, consent requirement, policy owner, incident contact, last reviewed date, and review cadence. This policy object is excluded from coach-safe server payloads.
- A Supabase database/RLS foundation is staged in `supabase/migrations/20260507230628_medical_module_multitenant.sql`: `medical_*` tables for governance, consent, cases, recommendations, availability plans, clearance, load gates, review tasks, and audit events. The rollout is server-write first; direct authenticated access only exposes coach-safe availability columns/views.
- Session Planner has a medical availability strip for the selected training date so coaches can see who is 0/10/25/50/75% while planning, with a selected-block gate summary and Player Board warnings for below-limit, 0%, and not-set players.
- Medical information still needs formal production/legal sign-off before storing real regulated medical records and before switching the live UI from app-state to `medical_*` database tables.
