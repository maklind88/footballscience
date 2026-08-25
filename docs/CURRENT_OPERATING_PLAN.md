# Current Operating Plan

This is the current project operating decision for Football Science.

Operating model version: `distributed-specialist-v2` (2026-08-24).

## Primary Coordination Rule

The user may speak directly with specialist chats or ask the Project Lead chat for routing/advice. Each specialist chat owns its module/task end to end when work is assigned or when the user speaks directly to that module.

Specialist chats should not start new work without a scoped assignment from the Project Lead or an explicit user request routed to their module.

There is no standing central deploy owner. The specialist chat that owns the module/task owns commit, push, deploy, and production verification when the product intent calls for a live result and the safety conditions pass.

## Project Lead Delegation Rule

The Project Lead chat is the user's coordination layer.

- The Project Lead should translate user intent into specialist-team assignments.
- The Project Lead should not directly implement, fix, commit, push, deploy, or production-verify specialist module work while a responsible specialist team exists.
- For release work, the Project Lead should not become the default bottleneck. The responsible specialist chat owns release gates and deployment for its own task unless the user explicitly transfers operational release ownership to the Project Lead.
- If the user asks the Project Lead to do module work, the Project Lead should send a scoped task to the right specialist team, wait for their report, and then summarize status back to the user.
- Direct Project Lead edits are limited to coordination/governance documents unless the user explicitly asks the Project Lead to take operational ownership.
- If the Project Lead performs specialist work directly by mistake, it must be treated as a process incident and reported to the affected specialist team.

## Highest Priority

1. Keep every specialist self-standing for implementation, QA, Git, release, and Live verification in its owned area.
2. Keep parallel work isolated by branch/worktree and protect source-of-truth boundaries between modules.
3. Serialize every full release automatically through the shared release lock and GitHub release-edge queue.
4. Keep the Project Lead optional for routing/advice, never as the default deploy bottleneck.
5. Keep the ownership map and startup prompts current as modules and specialist chats evolve.

## Second Priority

Scouting / Football Science DB is the next major product track, but only after the team structure and release flow are stable.

System / Security / Release should remain a continuous guardrail while product teams build, but it should not be the default release executor for other specialist teams.

## Chat Activation Rule

There is no global freeze on existing specialist chats.

- A specialist chat becomes active when the user gives it a current task in its owned area.
- A dormant or older chat must fetch latest `origin/main`, reread the mandatory governance documents, confirm `distributed-specialist-v2`, and create or reuse an isolated branch/worktree before changing code.
- Two chats must not implement the same module/task at the same time. If duplicate ownership appears, the newest explicit user assignment decides the active owner; the other chat reports handoff/status and stops editing that scope.
- A chat is archived or frozen only when the user explicitly says so or when it has been replaced by a named successor.

## User Interaction Rule

The user may speak directly with any specialist chat.

When the user speaks with the Project Lead, the Project Lead sends scoped tasks to specialist teams and reports outcomes back to the user in Swedish. When the user speaks directly with a specialist chat, that specialist chat owns the work and any safe live release.

## Release Rule

Specialist chats self-release their own finished work when:

- they own the module/task
- the worktree contains only intended changes
- the official command has acquired the shared Football Science release lock
- the correct Fast UI Lane or Safe Lane checks pass
- production verification can be completed

If another release owns the lock, the new release waits automatically with visible owner/status information. It must not start duplicate full QA. The specialist must stop and report only if the branch is stale after waiting, ownership is unclear, unrelated local changes exist, validation fails, or the lock cannot be proven safe.

GitHub Staging Deploy, Production Deploy, and Production Rollback use one shared release-edge queue and must not cancel another valid release.

## Cross-Module Rule

Cross-module tasks must name one task/release owner and all affected module owners before implementation. Prefer compatible module-owned commits released sequentially. If the behavior must ship atomically, the named owner runs one combined Safe Lane release after the other owners review their boundaries.

## Local Change Rule

Unrelated local changes must be investigated before deploy.

Do not deploy while ownership is unclear for dirty worktree files.

## Speed Rule

Move quickly for UI and visual polish.

Be strict for:

- auth
- permissions
- data
- Supabase/API
- central sync
- backups/restore
- migrations
- security
- release
