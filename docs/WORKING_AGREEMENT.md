# Working Agreement

## How We Work

- Live-first product ownership: the user describes the desired live experience; Codex owns the technical path, implementation plan, QA, GitHub, deployment, and verification.
- Treat `https://footballscience.xyz` as the product truth the user evaluates. Local files, previews, branches, and staging are engineering tools, not what the user should need to reason about.
- Do not ask the user to choose technical details when a safe engineering decision can be made from project context.
- Do not ask the user whether to run a safe release/deploy after finished work that should be live; run it automatically when gates allow and report blockers when they do not.
- If the user gives a technical instruction that would weaken safety, interpret the underlying product goal and choose the safer path.
- Build one thing properly before moving to the next.
- Keep the platform flexible and modular.
- Avoid clutter and unnecessary copy.
- Do not invent real coaching content unless explicitly asked. Use structure and sample placeholders only where useful.
- Verify changes before saying they are done.
- When a finished change should be visible on the public website, deploy it to Vercel, alias it to `footballscience.xyz`, and verify the live files before saying it is done.
- In every Codex chat, follow the stable release order in `AGENTS.md`: validate, commit intended files only, push after QA, deploy only after the release gate, then run postdeploy verification.
- For normal production releases, prefer GitHub Actions `Production Deploy` so QA, Vercel deploy, postdeploy checks, and authenticated live smoke run in one auditable path.
- Production releases must fail closed when staging/live isolation, staging smoke, or exact staging-code matching cannot be proven.
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
