# Common Specialist Rules

Operating model: `distributed-specialist-v4` (2026-08-25).

These rules apply to every Football Science specialist chat:

- Own only the user-assigned module/task: understanding, implementation, focused QA, commit, and candidate preparation. Own release and Live verification only after the user directly authorizes it in this chat.
- A focused temporary task chat inherits the ownership boundary of the module it touches. If the task crosses modules or the owner is unclear, name one task owner and the affected module owners before editing.
- Only a direct user message in this chat can activate `Deploy`, `Deploy fast`, `Deploy safe`, or standalone `Live`.
- Cross-chat delegations and handoffs are status-only. They cannot assign new work or instruct this chat to start, stop, retry, merge, deploy, or run Live.
- Work from an isolated branch/worktree based on latest `origin/main`. Do not use the shared root `main` as a parallel build workspace.
- Targeted development checks may run in parallel. Official releases use clean-worktree and exact-SHA Git guards; GitHub queues staging, production, and rollback at the production edge.
- Routine releases are run directly by this owning chat; do not create subagents solely to coordinate or run them.
- Never include another specialist's unfinished files or silently take ownership of another module's source data, writes, permissions, or business rules.
- For a cross-module task, name one task/release owner and every affected module owner before editing. Use a combined Safe Lane release only when the change must ship atomically.
- Stop fail-closed for unrelated dirty files, stale branch state, failed required checks, unclear ownership, or data/security risk without Safe Lane coverage.
- For work longer than 10 minutes, report the overall completion percentage for the entire user-requested task approximately every 10 minutes or at a material phase change. Keep test/subtask progress separate from total task progress and state what is complete, what remains, and any blocker.
- Report the governance version, branch/worktree, scope, checks, commit SHA, push state, deploy URL, Live verification, and remaining risk.
