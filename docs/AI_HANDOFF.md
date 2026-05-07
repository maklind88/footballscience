# AI Handoff

Read this file first when starting a new thread on Football Science.

## Product

Football Science is a premium coaching platform for daily team operations. The user wants it to become the base of his coaching career: schedule, periodization, session planning, tactical board, team/admin management, IDP, analysis, identity, and game simulator.

Design should feel clean, Apple/Mac-like, calm, professional, and modular. Avoid unnecessary explanations in the UI. Empty data should usually render as empty space, not placeholder text.

## User Preferences

- Communicate with the user in Swedish.
- Keep UI labels mostly in English football terms unless the user asks otherwise.
- Do not say something is done unless it has been checked.
- The user strongly dislikes needing to ask again if something works locally but not for them.
- Work one module at a time, but keep architecture future-proof.
- Prefer implementation over long theory when the request is clear.

## Current Codebase

- Root: `/Users/maklind/Documents/New project`
- Main files: `index.html`, `app.js`, `styles.css`
- Static prototype, heavy client-side JavaScript.
- Data persistence is centralized through `/api/app-state`, which syncs the current app state keys to the private Supabase Storage bucket `footballscience-app-state`; localStorage remains the browser cache/autosave layer.
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
  - `football-medical-team-v1`

## Current Navigation Order

Top nav should be:

1. Schedule
2. Periodization
3. Sessions
4. IDP
5. Analysis Room
6. My Team
7. Medical Team
8. Identity
9. Game Simulator

Profile should be reachable from the account menu on the right, not as a main nav item. Football Science title should act as Home.

## Most Active Area

The most active area right now is Session Planner and Tacticalboard.

Recent requirements:

- Medical Team now has a dense availability command-board build with NC Courage 2026 roster profiles, smaller official roster images, Daily Medical Huddle, coach-safe handover feed with copy action, roster-level bulk recommendations, player popup recommendations, player Medical Profile summary, Availability Plans for multi-week/month restrictions, 0/10/25/50/75/100 participation steps, RTP phases, review alerts, clearance checklist/load gates, coach-safe comments, backdated logs, comments, and actual participation logging.
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
- Phase/Sub-Phase should allow multi-select with check marks.
- Tacticalboard should start empty for new exercises.
- Tacticalboard needs better drawing tools, thinner line widths, live line preview, 3-point curve, multi-select/box select and group move, delete all with confirmation.
- Goals should rotate when selected using a handle, not external buttons.
- Add 11v11 goal, dashed line, coach marker `C`, and better cones.

## Verification Habit

Before final response after code changes:

- Run `node --check app.js` when `app.js` changes.
- Localhost/127.0.0.1 has a dev-auth fallback in `index.html` that auto-authenticates a local admin user (`mak`) without Supabase so browser testing can run against isolated localhost localStorage. This must stay local-only and never replace production Supabase auth.
- Check relevant UI flows in browser when possible.
- Deploy automatically after every code/design change unless the user explicitly says not to deploy.
- If deploying, verify live `app.js` hash or visible behavior on `footballscience.xyz`.

## Deployment Note

The live site previously showed old Session Planner because browser localStorage kept old data. The session planner storage key was bumped to `football-session-planner-v3`. If live and local differ, verify both deployed assets and browser site data.
