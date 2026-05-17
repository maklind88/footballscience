# Next Steps

## Highest Priority

- Use the live-first workflow in `AGENTS.md` and `docs/LIVE_FIRST_WORKFLOW.md`: the user describes the desired live outcome, Codex handles implementation, QA, GitHub, deployment discipline, and production verification.
- Use `docs/PLATFORM_SCALE_PROGRAM.md` for the long-running scale program: multi-tenant identity, app-state migrations, `app.js` extraction, Chat server-first, and Scouting server-first.
- Keep parallel Codex chats separated by module ownership so unfinished work does not leak into production releases.
- Keep improving Session Planner and Tacticalboard.
- Keep Profile, Account Menu, admin user accounts, and Supabase-backed user data stable before expanding account features.
- Keep updating this docs folder after meaningful product decisions.
- Treat data safety as a product requirement: keep backup/export/restore working for Schedule, Periodization, Sessions, Medical, users, and simulator data.
- Verify live `footballscience.xyz` after deployment, especially if localStorage can make old data appear.

## Profile / Accounts

- Audit Profile save so name, title, department, team, and profile image update both the profile workspace and top-right account menu.
- Keep Profile reachable only through the account menu.
- Keep Profile / Settings / Logout visually clean and reliable.
- Confirm Logout signs out immediately without requiring refresh.
- Keep admin account creation, updates, password actions, and role changes Supabase-first.
- Add focused QA coverage for profile update propagation, profile image propagation, and logout behavior.
- Keep profile image uploads out of auth JWT metadata: images go to Supabase Storage and auth metadata stores only the public image URL.
- Keep self-admin role/status protected and keep paused accounts from entering the app.

## Home Dashboard

- Keep Home visually quiet and operational.
- Avoid fake dashboard content; render empty space until tasks/chat exist.
- Expand delegated task workflow later with due dates, priorities, and notifications.
- Keep personal To-Do editable on Home and mirrored on Profile.
- Update `dashboardNewsVersion` when a future release should trigger the news popup.

## Session Planner

- Treat existing Exercise Library entries as protected data: all future migrations should append/merge and keep backups, not reset or remove saved exercises.
- Continue hardening Exercise Library around protected data, backup recovery, and long-term migrations.
- Expand Exercise Library version history later with restore-from-version if needed.
- Improve large-library ergonomics next: saved views, bulk folder actions, tag filters, and import/export validation.
- Keep folder membership as non-destructive metadata; deleting/archiving a folder must not delete exercises.
- Allow drag/reorder of blocks so Block 2 can become Block 1.
- Keep date strip smooth: one-week visible range, arrows scroll only, Today jumps to today.
- Make plus button open useful choices: add from library, create new exercise, duplicate current exercise, upload exercise.
- Ensure long custom text never breaks the left list layout.
- Keep periodization card compact and clickable, without redundant labels.

## Tacticalboard

- Make line width slider control all draw tools properly.
- Use normal pointer cursor for drawing, hand/grab cursor for draggable selected objects.
- Add live drawing preview for lines/arrows/runs/passes.
- Implement three-point curve drawing.
- Add box select, multi-select, and group move.
- Add delete all drawings with confirmation.
- Add 11v11 goal, dashed line, coach marker, and better cone visuals.
- Make selected goals rotate with an on-object handle.
- Keep new exercise boards empty except for pitch lines.
- Keep pitch large, close to left menu, and proportionally realistic.

## Periodization

- Keep week view visually quiet and symmetrical.
- Keep popup centered.
- Today should jump to the actual day.
- Admin should edit; other users should view.
- Import/update more real planning data from provided documents without breaking structure.

## Schedule

- Keep selected day visible/sticky when scrolling long overview ranges.
- Keep overview colors clear and add small color legend per month.
- Admin edit only; non-admin view only.

## Scouting

- Scouting now has a first real pass: Shadow XI, lazy-loaded Excel/Wyscout database, filters, percentile highlights, player profile spider charts, favorites, named lists, and Shadow XI assignment.
- Next pass: add editable scout notes, contract fields, valuation/availability fields, report creation, list management actions, and opposition scouting workflows.
- Preserve `football-scouting-v1` through central app-state, backup, export, and restore.
- Move long-term data into `scouting_players`, `scouting_player_metrics`, `scouting_lists`, `scouting_shadow_xi`, and `scouting_reports` only through an additive, dual-read rollout.
- Football Science DB is the new global player foundation. Keep it server-first through `fsdb_*` tables and `/api/football-science-db`; do not ship global player data as a frontend JS blob. First source import is Reep identity/crosswalk data, then provider/user-owned roster and performance imports.

## Gameplan

- First foundation is in place: Schedule-created gameplans, staff responsibilities, tactical/opponent plan, checklist, selected-player Player Brief publishing, signed Player Brief links, token-gated player portal payloads, and opened/acknowledged receipts.
- Next pass: add match meeting agenda export, reminder/notification flow for unread player briefs, link-expiry controls, and tighter links from Analysis Room/Scouting into opponent-plan fields.
- Preserve `football-gameplan-v1` through central app-state, backup, export, restore, permission matrix, and the Supabase permission seed.
- Move long-term data into `gameplan_match_plans`, `gameplan_staff_roles`, and `gameplan_player_briefs` only after app-state fallback and player-brief audience checks are proven.

## Game Simulator

- Create polished tutorial/explanation screen before simulator.
- Enter opens fullscreen simulator.
- Improve fullscreen button contrast.
- Hide the old cluttered non-fullscreen simulator view as the primary route.

## Admin

- Keep hardening the multi-scope admin model: Platform Admin, Club Admin, and Team Admin.
- Move `football-platform-structure-v1` into database-backed clubs, teams, memberships, and audit tables.
- Add focused QA for scoped admin behavior: club admin cannot affect other clubs, team admin cannot affect other teams, and only platform admin can change role access or view central audit.
- Keep user management Supabase-first: edit email, reset/change password, remove users, role assignment, and club/team metadata.

## Medical Team

- Add real roster import from the club website once names, numbers and images are provided.
- Connect Medical Team recommendations to Sessions so coaches can see training participation status while planning.
- Add deeper injury/rehab/return-to-play fields only after deciding the medical workflow and permissions.
- Keep coaches focused on clear participation recommendations while medical details stay permission-aware.

## Future Backend

- Continue the Platform Scale Program from `codex/platform-scale-foundation`: canonical `platform_*` identity first, then one module at a time with app-state fallback.
- Replace localStorage/app-state compatibility paths with real database storage only after shadow/dual-read/dual-write verification is green for the specific module.
- Move the data-safety layer from browser-local protection to real server persistence with version history/backups.
- Add real file/image uploads for Tacticalboard and exercises.
- Prepare codebase for eventual mobile app wrapper.
