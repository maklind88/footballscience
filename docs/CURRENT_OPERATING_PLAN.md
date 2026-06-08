# Current Operating Plan

This is the current project operating decision for Football Science.

## Primary Coordination Rule

The user speaks primarily with the Project Lead chat. The Project Lead routes work to the correct specialist team, tracks ownership, and protects release coordination.

Specialist chats should not start new work without a scoped assignment from the Project Lead or an explicit user request routed to their module.

## Project Lead Delegation Rule

The Project Lead chat is the user's coordination layer.

- The Project Lead should translate user intent into specialist-team assignments.
- The Project Lead should not directly implement, fix, commit, push, deploy, or production-verify specialist module work while a responsible specialist team exists.
- For release work, the Project Lead should coordinate with System / Security / Release and let that team own release gates and deployment unless the user explicitly transfers operational release ownership to the Project Lead.
- If the user asks the Project Lead to do module work, the Project Lead should send a scoped task to the right specialist team, wait for their report, and then summarize status back to the user.
- Direct Project Lead edits are limited to coordination/governance documents unless the user explicitly asks the Project Lead to take operational ownership.
- If the Project Lead performs specialist work directly by mistake, it must be treated as a process incident and reported to the affected specialist team plus System / Security / Release.

## Highest Priority

1. Stabilize the working model.
2. Freeze legacy chats so they only provide handoff/status.
3. Investigate and assign ownership for unrelated local changes before any more deploys.
4. Establish Project Lead plus specialist teams as the durable operating model.
5. After coordination is stable, make Sessions / Tacticalboard / Exercise Library the first major product track.

## Second Priority

Scouting / Football Science DB is the next major product track, but only after the team structure and release flow are stable.

System / Security / Release should remain a continuous guardrail while product teams build.

## Legacy Chat Rule

Legacy chats are frozen.

They may only report handoff/status:

- module/responsibility
- branch
- git status
- changed or unfinished files
- local/committed/pushed/deployed/live-verified state
- collision risk
- recommended next step

They must not start new work, refactor, deploy, or touch other modules.

## User Interaction Rule

The user speaks with the Project Lead chat.

The Project Lead sends scoped tasks to specialist teams and reports outcomes back to the user in Swedish.

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
