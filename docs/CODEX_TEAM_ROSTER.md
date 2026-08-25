# Codex Team Roster

Football Science uses Codex chats as a coordinated product and engineering team.

The user may speak directly with specialist chats or ask the Project Lead chat for routing/advice. Each specialist chat must be able to stand on its own for its module/task, including release when the work is ready and safe.

## Operating Model

- One chat owns one module or responsibility area.
- There is no permanent central deploy owner. The specialist chat that owns the module/task owns its own release end to end.
- Only one production-edge release may run at a time. Specialist chats must self-check active staging deploy, production deploy, rollback, and local release processes before starting Vercel-facing deploy work.
- Specialist chats should not work freely across the platform.
- Free exploration is allowed for strategy and analysis, but code changes require clear ownership.
- Every chat must read `AGENTS.md`, `docs/AI_HANDOFF.md`, `docs/CURRENT_OPERATING_PLAN.md`, `docs/LIVE_FIRST_WORKFLOW.md`, and `docs/DEPLOYMENT.md` before doing work.
- System/security/backend/data/sync/Supabase/refactor work must also read `docs/SECURITY_CONTROL_PLANE.md` and `docs/PLATFORM_SCALE_PROGRAM.md`.
- If a chat sees unrelated local changes, another module owner, failed checks, Safe Lane risk, or another active release, it must stop and report in Swedish.
- Product-intent release ownership applies only when the current chat owns the task, the worktree contains only intended changes, no other production-edge release is active, checks pass, and production verification can be completed.

## Project Lead

Primary user-facing coordinator.

Responsibilities:

- Receive product wishes from the user.
- Decide which specialist chat owns the work.
- Send precise implementation instructions to specialist chats.
- Track module ownership and collision risk.
- Ask the user fewer technical questions and make safe engineering decisions from project context.
- Keep the user informed in plain Swedish.
- Advise on release order only when the user asks or when there is an active collision/blocker.

Hard rules:

- The Project Lead coordinates and delegates by default.
- The Project Lead must not directly implement, fix, commit, push, deploy, or production-verify specialist module work while an active specialist chat owns that module.
- If the user asks the Project Lead to fix or make a specialist module live, the Project Lead should route the task to the responsible specialist chat. The specialist chat then owns release and should not wait for central deploy approval once safety conditions pass.
- The Project Lead may edit governance/process docs for coordination clarity.
- The Project Lead may take operational ownership only when the user explicitly transfers ownership or an urgent incident requires it.
- If the Project Lead bypasses this delegation model, record it as a process incident and notify the affected specialist team.

## System / Security / Release

Owns production safety and platform control for its own platform/security tasks. It is a guardrail, not the default deploy bottleneck for every specialist release.

Responsibilities:

- Release rules, deploy discipline, rollback readiness, and incident response patterns.
- Security control plane.
- Auth, permissions, tenant isolation, Supabase/API safety.
- Central sync, app-state, backups, restore, migrations.
- QA/release gates, rollback, incident readiness.
- Platform Scale Program governance.

Must not start broad refactor, Phase 2, risky backend/data work, or another team's release without a clear task.

## Sessions / Tacticalboard / Exercise Library

Owns:

- Session Planner.
- Tacticalboard.
- Player Board.
- Exercise Library.
- Session-related renderers/state/actions.

Hard rules:

- Preserve every existing exercise built by the user.
- Never reset, seed over, hard-delete, or replace saved exercise data unless the user explicitly requests that exact destructive action.
- Prefer archive/soft-delete, append/merge migrations, and backup-aware changes.

## Profile / Account / Admin Auth

Owns:

- Profile.
- Account menu.
- Settings and logout.
- Admin user/account flows.
- User role/status management UI.
- Supabase-backed profile/account behavior.

Hard rules:

- Profile image uploads use Supabase Storage URLs, never inline `data:image/...` in auth metadata.
- Admin self-protection must remain server-side.
- Account/auth work is Safe Lane unless it is only visual polish.

## Home / Dashboard

Owns:

- Home workspace.
- Staff room/dashboard surface.
- Personal To-Do and delegated task UI.
- First-login/news popup behavior when scoped to Home.

Hard rules:

- Avoid fake dashboard content.
- Keep Home visually quiet, operational, and premium.
- Do not own global chat state unless explicitly assigned.

## Schedule / Periodization

Owns:

- Schedule calendar.
- Periodization views.
- Day/week/month planning surfaces.
- Schedule/Periodization bridge into Sessions.

Hard rules:

- Preserve saved schedule and periodization data.
- Admin edit/view-only behavior must remain intact.

## Scouting / Football Science DB

Owns:

- Scouting workspace.
- Shadow XI, lists, reports, filters, player profiles.
- Football Science DB and player identity/provider foundations.
- Scouting imports and server-first scouting rollout.

Hard rules:

- Do not ship global player data as frontend blobs.
- Preserve `football-scouting-v1` until server-first paths are proven.
- Import/provider files must stay reviewed and should not leak local data.

## Medical Team

Owns:

- Medical Team availability workflow.
- Coach-safe medical views.
- Governance panel and medical handover UI.
- Medical-to-Session availability bridge.

Hard rules:

- Protect private medical details.
- Coach/read-only payloads must stay sanitized.
- Medical writes/audit/governance are Safe Lane.

## Game Simulator

Owns:

- Game Simulator tutorial/explanation surface.
- Fullscreen simulator experience.
- Simulator controls/runtime when explicitly assigned.

Hard rules:

- Simulator/autopilot extraction is Phase 2-style work and needs explicit approval.
- Stop simulation when leaving the workspace.

## Platform Shell / Design System

Owns:

- Navigation shell.
- Shared module loading.
- Shared design system patterns.
- Global layout and platform chrome.

Hard rules:

- Do not grow `app.js` or global CSS without need.
- Repeated UI patterns should move into module files or dedicated stylesheets.

## Analysis / Gameplan

Owns:

- Analysis Room direction.
- Gameplan/match-week planning.
- Staff/player brief workflows.
- Matchday preparation surfaces.

Hard rules:

- Do not mix recruitment scouting into Analysis Room.
- Player Brief audience/security must remain player-safe.

## Standard Specialist Chat Startup

Every specialist chat should start by reporting:

1. Documents read.
2. Branch and git status.
3. Whether HEAD matches `origin/main`.
4. Owned module/responsibility.
5. What it will not touch.
6. Relevant checks for its module.
7. Whether the current task requires a live release, and if so which lane it will use.

## Standard Report Back

After work, every chat reports:

- Files changed.
- What changed.
- Why it changed.
- Checks/tests run.
- Whether work is local, committed, pushed, deployed, and/or production-verified.
- Risks or follow-up recommendations.
