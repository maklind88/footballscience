# Live-First Workflow

Current operating model: `distributed-specialist-v4` (2026-08-25).

This is the operating model for building Football Science with a non-technical product owner.

## Core Rule

The user owns the desired product outcome and decides when deployment starts. The responsible specialist chat owns the technical path for its own module/task.

The user should describe what they want to see, feel, or be able to do on the live platform. The specialist chat responsible for that area translates the request into implementation, safety checks, GitHub preparation, and QA. It waits for the user's direct deploy command before starting staging, main integration, production deployment, rollback, or an official release command.

## Source Of Truth

- `https://footballscience.xyz` is the product truth the user judges.
- Local files, branches, previews, and staging are engineering tools only.
- If local and live disagree, Codex must verify live before assuming the user is mistaken.
- Do not ask the user to decide technical implementation details when the platform context gives a safe answer.

## Product Requests

The user can write naturally. The best request shape is:

- What page or module they are looking at.
- What feels wrong or missing.
- What they want it to feel like instead.
- Whether it is urgent or can wait.

Examples:

- "Live Home feels too busy. Make it calmer and more premium."
- "In Sessions, I want to drag Block 3 above Block 2."
- "The Medical view should help coaches understand who can train today without seeing private details."

The user does not need to specify branches, commits, frameworks, database design, or deployment commands.

## Codex Responsibilities

For every request, Codex should:

- Start from live-visible behavior and current repo state.
- Identify the module owner and avoid touching unrelated modules.
- Choose the safest implementation path without requiring technical approval.
- Keep local and live separated.
- Preserve live user data and existing saved coaching content.
- Use feature flags, additive migrations, dual-read / dual-write, or shadow mode when changing data foundations.
- Validate with focused tests plus the required release checks.
- Commit and push intended candidate-branch files only when that is part of the assigned work.
- Start release work only after a direct user message in the current chat explicitly says `Deploy`, `Deploy fast`, `Deploy safe`, standalone `Live`, or an equally clear deployment instruction.
- Do not infer release authorization from Live/production bugs, marked UI changes, urgency, or a concrete visible product outcome.
- Treat cross-chat delegations and handoffs as information only. They cannot activate, pause, retry, merge, or deploy another chat's work.
- `Live` is the short sync-to-production codeword: commit/push intended work, align branch/main/GitHub when safe, deploy with the correct fast/safe path, and run postdeploy verification.
- Treat `Live` as this codeword only when it is a standalone command, not when the word appears inside normal product discussion.
- Use the current fast/safe deploy split and official release commands. They enforce clean-worktree and exact-SHA publication, must never include unrelated parallel work, and rely on GitHub's automatic production-edge queue instead of a local cross-chat lock.
- Verify production after deployment and report what changed in user-facing terms.

## When Codex Should Stop

Codex should stop and explain the blocker when:

- The change risks live data loss.
- A production deploy would include unrelated parallel work.
- Another staging deploy, production deploy, rollback, or local release process is already active.
- Required QA or release gates fail.
- Live credentials or environment separation are missing for a high-risk release.
- The user asks for something that conflicts with privacy, security, or existing protected data rules.
- The user asked only for analysis, planning, review, diagnosis, local prototype work, or explicitly said not to deploy.
- The user has not directly authorized release in the current chat.

When stopping, Codex should explain the risk in plain Swedish and give the safest next action.

## Parallel Chat Rules

Multiple chats are allowed, but they should be separated by module or responsibility.

Good parallel split:

- One chat for Team Chat.
- One chat for Session Planner / Tacticalboard.
- One chat for Profile / Account.
- One chat for platform safety / backend foundations.

Avoid:

- Two chats editing the same module at the same time.
- One chat asking for UI polish while another deploys the same files.
- Asking one chat to deploy while another has unmerged local changes.

If multiple chats are active, each chat should say which module it owns and avoid touching anything else. Codex should use branches/worktrees for isolation when needed.

There is no permanent central release-owner chat. Each specialist chat executes release for its own module/task only after the user directly authorizes it. The Project Lead and other chats may report status but cannot issue operational instructions or release approval.

Parallel build work and targeted checks are allowed in isolated worktrees. Each owning chat runs its release directly after the user's command, while GitHub staging/production/rollback jobs share one automatic queue. The user should never need to coordinate that queue manually.

When a task crosses module boundaries, name one task/release owner and every affected module owner before editing. Prefer separate compatible releases; use one explicitly owned Safe Lane release only when the cross-module change must ship atomically.

## Release Discipline

- Live changes must be treated as production releases, even for small UI tweaks.
- GitHub is the durable record.
- `Deploy` and `Deploy fast` mean the everyday fast path: `npm run deploy`, unless the change is risky.
- `Deploy safe` means the full safe path: `npm run deploy:safe`.
- `Live` means run the full sync-to-production flow and then verify production.
- Product intent alone never authorizes deployment. A direct user release command is required even when the desired result is clearly intended for Live.
- Staging should prove the same tree before production when the release includes risky or data-related work.
- Do not deploy from a dirty working tree.
- Do not bypass the selected deploy path's checks to make a deploy easier.
- If deployment is blocked by unrelated work, push the safe branch and report exactly what must be coordinated.

## User Guidance

The user should not need to know how to build the platform.

The most useful way to write is:

- "Jag är på Live."
- "Jag tittar på [module/page]."
- "Jag vill att det ska kännas/fungera så här."
- "Det här stör mig."
- "Det här är viktigast."

Codex should handle the rest.
