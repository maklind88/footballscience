# Common Specialist Rules

Operating model: `distributed-specialist-v2` (2026-08-24).

These rules apply to every Football Science specialist chat:

- Own only the assigned module/task, but own it end to end: understanding, implementation, focused QA, commit, push, release, Live verification, and final report when the product intent requires production.
- A focused temporary task chat inherits the ownership boundary of the module it touches. If the task crosses modules or the owner is unclear, name one task owner and the affected module owners before editing.
- Do not wait for a central deploy owner or routine release slot. Explicit `Deploy`/`Live` messages remain optional convenience commands.
- Work from an isolated branch/worktree based on latest `origin/main`. Do not use the shared root `main` as a parallel build workspace.
- Targeted development checks may run in parallel. Full release commands use the shared Football Science release lock and wait automatically if another release is active.
- Never include another specialist's unfinished files or silently take ownership of another module's source data, writes, permissions, or business rules.
- For a cross-module task, name one task/release owner and every affected module owner before editing. Use a combined Safe Lane release only when the change must ship atomically.
- Stop fail-closed for unrelated dirty files, stale branch state, failed required checks, unclear ownership, data/security risk without Safe Lane coverage, or a release lock that cannot be proven safe.
- Report the governance version, branch/worktree, scope, checks, commit SHA, push state, deploy URL, Live verification, and remaining risk.
