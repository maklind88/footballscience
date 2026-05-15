# Working Agreement

## Current Deploy Agreement

This section overrides any older release wording below.

- Deploy only when the user explicitly says `Deploy`, `Deploy fast`, `Deploy safe`, or the standalone codeword `Live`.
- `Deploy` and `Deploy fast` use `npm run deploy` unless the change is risky.
- `Deploy safe` uses `npm run deploy:safe`.
- `Live` is the short sync-to-production codeword: commit/push intended work, align the branch/main/GitHub state when safe, deploy with the correct fast/safe path, run postdeploy verification, and report the release status.
- Treat `Live` as this codeword only when it is a standalone command, not when it appears inside ordinary discussion.
- Do not ask the user which deploy path to use when the intent is clear.
- Do not auto-deploy just because work is finished.
- Use fast deploy for normal UI/UX/content/CSS/frontend polish and narrow low-risk fixes.
- Use safe deploy for auth/login, permissions, app-state/data, Supabase/API, backup/restore, migrations, security, or broad multi-module changes.
- Stop before deploy if the release would include unrelated or unfinished work from another chat.

## How We Work

- Live-first product ownership: the user describes the desired live experience; Codex owns the technical path, implementation plan, QA, GitHub, deployment, and verification.
- Treat `https://footballscience.xyz` as the product truth the user evaluates. Local files, previews, branches, and staging are engineering tools, not what the user should need to reason about.
- Do not ask the user to choose technical details when a safe engineering decision can be made from project context.
- Do not ask the user which deploy path to use when the user's wording maps to the Current Deploy Agreement.
- Do not auto-deploy just because work is finished.
- If the user gives a technical instruction that would weaken safety, interpret the underlying product goal and choose the safer path.
- Build one thing properly before moving to the next.
- Keep the platform flexible and modular.
- Avoid clutter and unnecessary copy.
- Do not invent real coaching content unless explicitly asked. Use structure and sample placeholders only where useful.
- Verify changes before saying they are done.
- When the user asks for deploy, deploy it to Vercel, alias it to `footballscience.xyz`, and verify the live files before saying it is done.
- In every Codex chat, follow the current deploy policy in `AGENTS.md`: `Deploy` uses `npm run deploy`, `Deploy safe` uses `npm run deploy:safe`, and standalone `Live` runs the full sync-to-production flow.
- Fast deploy is the everyday release path. Safe deploy is reserved for auth/login, permissions, app-state/data, Supabase/API, backup/restore, migrations, security, or broad multi-module changes.
- Production monitoring must stay automated. The scheduled `Production Monitor` workflow should keep postdeploy and authenticated live smoke running even on days with no feature work.
- Rollbacks must use the `Production Rollback` workflow, require explicit `ROLLBACK` confirmation, and pass postdeploy/live smoke before the rollback is considered complete.
- `npm run release:rules` is part of QA and protects the release train itself. Do not weaken it to make a deploy easier.
- If work becomes slow because context is huge, start a new thread and read `docs/AI_HANDOFF.md`.
- For the full non-technical product-owner workflow, read `docs/LIVE_FIRST_WORKFLOW.md`.

## Parallel Chats

- Multiple chats are allowed only when they own different modules or responsibilities.
- Good split: one chat for Team Chat, one for Session Planner/Tacticalboard, one for Profile/Account, one for platform/backend safety.
- Avoid two chats editing or deploying the same module at the same time.
- If parallel work exists, use branches or worktrees and do not deploy a bundle that accidentally includes another chat's unfinished changes.
- If production deploy would include unrelated work, stop and explain the coordination needed instead of forcing the deploy.

## What Good Looks Like

- The UI is clean enough that coaches understand it without explanation.
- Admin tools are powerful but not visually noisy.
- Every module can grow without turning the code into chaos.
- The user can test locally and see the same thing that was claimed.
- Future Codex sessions can continue from docs, not memory.

## When To Update Docs

Update these docs when:

- Navigation changes.
- A module changes behavior.
- Storage keys change.
- Deployment process changes.
- A new major decision is made.
- The user gives a durable preference.
