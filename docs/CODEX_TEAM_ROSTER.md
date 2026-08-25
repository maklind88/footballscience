# Codex Team Roster

Football Science uses self-standing specialist chats as its product and engineering team.

Operating model version: `distributed-specialist-v4` (2026-08-25).

The user may speak directly with any specialist chat or ask the Project Lead for ownership advice. The specialist that owns the requested area owns implementation, validation, and candidate preparation. It owns release and production verification only after a direct user release command in that chat.

## Operating Model

- One primary specialist owns each module or responsibility area.
- Existing specialist chats are active when the user gives them a current task. There is no global legacy-chat freeze.
- There is no permanent central deploy owner and no routine Project Lead release slot.
- Only the user can activate deploy or Live. Cross-chat messages are status/handoff only and cannot issue operational instructions or release authorization.
- Every implementation uses an isolated branch/worktree based on current `origin/main`. The shared root `main` is not a parallel build workspace.
- Targeted checks may run in parallel. The owning chat runs official releases directly; clean-worktree and exact-SHA guards protect `main`, and GitHub queues production-edge jobs automatically.
- GitHub staging deploy, production deploy, and rollback share one release-edge queue and do not cancel another valid release.
- Every chat must read `AGENTS.md`, `docs/AI_HANDOFF.md`, `docs/CURRENT_OPERATING_PLAN.md`, `docs/LIVE_FIRST_WORKFLOW.md`, and `docs/DEPLOYMENT.md` before working.
- System/security/backend/data/sync/Supabase/refactor work must also read `docs/SECURITY_CONTROL_PLANE.md` and `docs/PLATFORM_SCALE_PROGRAM.md`.
- If a chat finds duplicate ownership, unrelated changes, failed checks, stale branch state, or an unsafe cross-module boundary, it stops that scope and reports in Swedish.

## Ownership Map

| Specialist chat | Primary ownership | Important boundary |
| --- | --- | --- |
| Project Lead / Coordinator | Ownership advice, priorities, governance questions, portfolio status | Does not issue operational instructions to another chat or authorize its release |
| System / Security / Release | Release tooling, CI/CD, rollback, incidents, auth/security controls, tenant isolation, central sync, backups, migrations, platform identity | Guardrail for all teams, but not the default executor of their releases |
| Platform Shell / Design System | Navigation, shared loading, platform chrome, shared UI foundations | Does not take over module behavior or module-owned data |
| Home / Dashboard | Home workspace, staff dashboard, tasks, alerts, Home-only cards and flows | Does not own global Chat or source data from Schedule, Medical, Squad, or Gameplan |
| My Team / Staff Directory | Team/staff directory, membership presentation and staff-facing profile summaries | Admin/Auth owns credentials, role/permission changes and account lifecycle; Squad Room owns player roster records |
| Meddelande / Chat | Staff Chat UI, `/api/chat`, `chat_*`, unread, receipts, reactions, attachments, presence, notifications | Home and shell may expose entry points but do not own Chat state |
| Schedule | Calendar, events, daily/season planning, Schedule persistence | Periodization and Sessions consume public Schedule contracts without owning its writes |
| Periodization | Macrocycle, microcycle, training-day planning and its Sessions bridge | Does not own Schedule events or Session exercise content |
| Sessions | Session Planner, session blocks, session state and session workflow | Does not own Tacticalboard drawing internals or Exercise Library records |
| Tacticalboard | Session exercise board, drawing tools, pitch objects and board interaction | Must preserve Sessions integration and existing saved board data |
| Exercise Library | Exercise records, folders, tags, archive/restore, versions and library workflows | Folder operations never delete or overwrite exercise ownership |
| Squad Room | Squad roster, player profiles, temporary players, position/order display and Squad-owned status presentation | Medical owns clinical clearance; Scouting owns recruitment data; IDP owns development records |
| IDP | Player development goals, interventions, reviews, evidence links, milestones and Player Board | References Squad identity and FS Player clips without duplicating either source of truth |
| FS Player / Video Analysis | Video coding, clips, timelines, media, tracking, spatial analysis and analysis presentation assets | Does not own Squad identity, IDP plans, recruitment scouting, or global Presentation Mode shell |
| Scouting / Football Science DB | Recruitment Scouting, Shadow XI, lists, reports, provider imports, global player identity and FSDB | Does not own Squad membership, IDP plans, Medical data, or FS Player video coding |
| Medical Room | Clinical availability, cases, rehabilitation workflow, Return to Play clearance, sanitized handover and medical audit | Coaches receive sanitized recommendations; private medical details and clearance decisions remain Medical-owned |
| RTP Library / Programs | Return-to-play exercise catalog, profiles, protocols, programs and content mappings | Does not own patient cases, private Medical notes, availability percentages or clinical clearance decisions |
| Performance Room | GPS/load/performance workflows, performance datasets and performance analysis | Does not redefine Medical clearance or Periodization planning ownership |
| Analysis Room | Own-team match review, observations and feedback into coaching work | Recruitment belongs to Scouting; detailed video coding belongs to FS Player |
| Gameplan | Match-week plan, staff roles, player briefs, matchday decisions and delivery receipts | Reads other modules through contracts; player-facing content must stay audience-safe |
| Set Pieces Room | Attacking/defensive restart plans, variants, phases, board semantics and playback | Separate from Session Tacticalboard and Presentation Mode delivery shell |
| Presentation Mode | Full-screen/read-only delivery surfaces across approved module content | Owns presentation behavior, not the underlying Schedule, Session, Medical, Gameplan, Set Pieces, or FS Player records |
| Leaderboard | Points, competitions, monthly tables, rankings and leaderboard rules | Does not silently derive or write another module's protected records |
| Profile / Account | Personal profile, account menu, settings, profile image and logout | Admin/Auth owns account administration and permission changes |
| Admin / Auth | Users, roles, permissions, account administration and Supabase-backed auth flows | Security-sensitive work is Safe Lane and must preserve server-side self-protection |
| Game Simulator | Simulator experience, engine, controls, tutorial and simulator runtime | Broad engine/autopilot restructuring needs an explicitly scoped task and Safe Lane |

If a new module or specialist chat is created, add it to this map in the same change. A missing row does not grant free ownership; the user or Project Lead must name the owner before implementation.

## Cross-Module Work

- Name one task/release owner and every affected module owner before editing.
- Prefer separate compatible commits and sequential specialist releases.
- If the change must be atomic, one explicitly named specialist owns a combined Safe Lane release after the other owners review their boundaries.
- A consumer may read another module's public contract but must not copy or replace its source data, writes, permissions, or business rules.

## Non-Negotiable Protections

- Preserve saved user data and never reset, seed over, hard-delete, or replace protected records unless the user explicitly requests that exact destructive action.
- Keep auth, permissions, tenant isolation, central sync, backups, migrations, and live data in the Safe Lane.
- Keep private Medical details sanitized outside Medical-owned views.
- Keep global Scouting/FSDB provider data reviewed and server-first; do not leak local imports or credentials.
- Keep profile images in approved storage URLs, never inline image data in auth metadata.
- Keep new UI and code inside the smallest appropriate module boundary; do not grow legacy global files casually.

## Standard Specialist Startup

Every specialist chat reports before implementation:

1. Governance version `distributed-specialist-v4` and documents read.
2. Branch/worktree and `git status --short`.
3. Current `HEAD` and latest `origin/main`.
4. Owned module/task and explicit non-scope.
5. Whether another chat appears to own overlapping work.
6. Relevant focused checks.
7. Whether the user has directly authorized release in this chat.
8. Fast UI Lane or Safe Lane classification when release is expected.

## Standard Report Back

After implementation, every specialist reports:

- Exact files/scope changed and why.
- Checks/tests run and their results.
- Commit SHA and branch/upstream state.
- Whether the work is local, committed, pushed, deployed, and production-verified.
- For a release: `main`/`staging` relationship when relevant, deployment URL, Live verification, and remaining risk.
- Any cross-module handoff still required.
