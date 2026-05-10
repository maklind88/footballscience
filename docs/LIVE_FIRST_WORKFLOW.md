# Live-First Workflow

This is the operating model for building Football Science with a non-technical product owner.

## Core Rule

The user owns the desired product outcome. Codex owns the technical path.

The user should describe what they want to see, feel, or be able to do on the live platform. Codex should translate that into implementation, safety checks, GitHub, QA, deploy, and verification.

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
- Commit and push intended files only.
- Deploy only after the release gates are green and no parallel work would be accidentally included.
- Verify production after deployment and report what changed in user-facing terms.

## When Codex Should Stop

Codex should stop and explain the blocker when:

- The change risks live data loss.
- A production deploy would include unrelated parallel work.
- Required QA or release gates fail.
- Live credentials or environment separation are missing for a high-risk release.
- The user asks for something that conflicts with privacy, security, or existing protected data rules.

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

## Release Discipline

- Live changes must be treated as production releases, even for small UI tweaks.
- GitHub is the durable record.
- Staging should prove the same tree before production when the release includes risky or data-related work.
- Do not deploy from a dirty working tree.
- Do not weaken tests or gates to make a deploy easier.
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
