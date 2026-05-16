# Codex Project Rules

These rules apply to every Codex chat working in this repository.

## Current Deploy Agreement

This section overrides any older release wording below.

- Deploy only when the user explicitly says `Deploy`, `Deploy fast`, `Deploy safe`, or the standalone codeword `Live`.
- `Deploy` and `Deploy fast` mean the fast everyday path: `npm run deploy`, unless the change is risky.
- `Deploy safe` means the full safe path: `npm run deploy:safe`.
- `Live` means the full sync-to-production flow below: make branch information, `main`, GitHub, production deploy, and postdeploy verification agree.
- Do not ask the user which deploy path to use when the intent is clear.
- Do not auto-deploy just because work is finished.
- Fast deploy is for normal UI/UX/content/CSS/frontend polish and narrow low-risk fixes.
- Safe deploy is for auth/login, permissions, app-state/data, Supabase/API, backup/restore, migrations, security, or broad multi-module changes.
- If deploy would include unrelated or unfinished work from another chat, stop and explain the coordination issue in plain Swedish.
- Live QA login is allowed when credentials are available in the current chat or environment, but never write passwords, tokens, or secrets into source files or docs.

## Live Codeword

When the user writes `Live` as a standalone command, run the full update flow that makes branch information, `main`, GitHub, and production agree.

Only treat `Live` as this codeword when it is the user's standalone command, not when the word appears inside ordinary product discussion such as "jag tittar på live".

The expected flow is:

1. Check `git status --short` and confirm only relevant changes are present.
2. Run the appropriate validation for the touched area.
3. Commit relevant uncommitted changes if any exist.
4. Push the current branch.
5. Merge or fast-forward the current branch changes into `main`.
6. Push `main`.
7. Deploy live with the correct deploy path for the risk level.
8. Run production verification.
9. Report commit, push, deployment URL, verification result, and whether branch information is clean/up to date.

If the current branch contains unrelated or unfinished work from another chat, stop and explain the coordination issue in plain Swedish before merging or deploying.

## Live-First Product Ownership

- The user is the product owner and describes the desired live outcome. Codex owns the technical path: implementation, QA, GitHub, release safety, deploy, and production verification.
- Treat `https://footballscience.xyz` as the product truth the user evaluates. Local files, branches, previews, and staging are engineering tools, not things the user should need to reason about.
- Do not ask the user to choose technical implementation details when a safe engineering decision can be made from project context.
- Do not ask "which deploy path should I use?" when the user's wording maps to the Current Deploy Agreement.
- If release is blocked, explain the blocker and the safest next action in plain Swedish.
- If the user gives a technical instruction that would weaken safety, interpret the underlying product goal and choose the safer path.
- If the user says another chat owns a module, do not touch that module here unless the user explicitly redirects ownership.
- Multiple Codex chats are allowed only when they own different modules or responsibilities. Use branches or worktrees to isolate parallel work, and never deploy a bundle that accidentally includes another chat's unfinished changes.
- When live behavior matters, verify live before assuming local state is enough.

## Stability First

- Start by checking `git status --short` and identify unrelated local changes.
- Never revert or stage unrelated user changes unless the user explicitly asks.
- Keep edits scoped to the user's request and the existing project patterns.
- If any check fails, stop before push or deploy and report the failure.

## Easy File Access

- In every Codex chat for this repository, keep `index.html` easy for the user to find. When reporting completed work or giving status, include a clickable reference to `/Users/maklind/Documents/New project/index.html` even if the file was not edited, unless the answer is only a tiny one-line confirmation.

## Required Release Order

Use this order for finished work. Only push/deploy when the user asks for deploy or when the task specifically requires GitHub publication.

1. Inspect local state: `git status --short`.
2. Implement the change.
3. Run validation:
   - `npm run check`
   - targeted Playwright/API tests for the touched area
   - prefer `npm run qa:api` for API/data contract coverage instead of typing the full Playwright command
   - `npm run release:ship -- --mode fast` for routine deploy readiness
   - `npm run release:gate` when you need the full preflight + safety + deploy QA gate before release work
   - `npm run qa:browser` for UI flows when the touched area needs browser proof
   - `npx playwright test --config=qa/playwright.config.mjs --project=api-contracts` for API/data changes
4. Stage only intended files.
5. Commit with a clear message.
6. For `Deploy` / `Deploy fast`, run `npm run deploy`.
7. For `Deploy safe`, run `npm run deploy:safe`.
8. Verify production: `npm run release:postdeploy`.
9. Report the commit, push, deployment URL, and verification result.

For the current fast local deploy flow, prefer:

```bash
npm run deploy
```

For the full safe deploy flow, prefer:

```bash
npm run deploy:safe
```

## Deployment Safety

- Do not deploy from a dirty working tree.
- Use `npm run deploy` for routine fast production releases.
- Use `npm run deploy:safe` for risky production releases that need full QA/staging.
- Do not use emergency overrides unless the user explicitly confirms an urgent hotfix.
- Do not put secrets in source files. Vercel/GitHub/Supabase secrets stay in their respective dashboards.
- After deployment, verify the live domain and protected backup endpoint through `npm run release:postdeploy`.
- For recurring live health monitoring or manual postdeploy follow-up, use `npm run release:monitor`; it runs postdeploy verification, backup freshness/readiness checks, restore drill, and authenticated live smoke.
