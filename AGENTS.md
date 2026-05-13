# Codex Project Rules

These rules apply to every Codex chat working in this repository.

## Current Deploy Agreement

This section overrides any older release wording below.

- Deploy only when the user explicitly says `Deploy`, `Deploy fast`, or `Deploy safe`.
- `Deploy` and `Deploy fast` mean the fast everyday path: `npm run deploy`, unless the change is risky.
- `Deploy safe` means the full safe path: `npm run deploy:safe`.
- Do not ask the user which deploy path to use when the intent is clear.
- Do not auto-deploy just because work is finished.
- Fast deploy is for normal UI/UX/content/CSS/frontend polish and narrow low-risk fixes.
- Safe deploy is for auth/login, permissions, app-state/data, Supabase/API, backup/restore, migrations, security, or broad multi-module changes.
- If deploy would include unrelated or unfinished work from another chat, stop and explain the coordination issue in plain Swedish.
- Live QA login is allowed when credentials are available in the current chat or environment, but never write passwords, tokens, or secrets into source files or docs.

## Live-First Product Ownership

- The user is the product owner and describes the desired live outcome. Codex owns the technical path: implementation, QA, GitHub, release safety, deploy, and production verification.
- Treat `https://footballscience.xyz` as the product truth the user evaluates. Local files, branches, previews, and staging are engineering tools, not things the user should need to reason about.
- Do not ask the user to choose technical implementation details when a safe engineering decision can be made from project context.
- Do not ask "do you want me to run safe release/deploy?" after completed work that should be live. Run the safe release path automatically when gates allow. If release is blocked, explain the blocker and the safest next action in plain Swedish.
- If the user gives a technical instruction that would weaken safety, interpret the underlying product goal and choose the safer path.
- If the user says another chat owns a module, do not touch that module here unless the user explicitly redirects ownership.
- Multiple Codex chats are allowed only when they own different modules or responsibilities. Use branches or worktrees to isolate parallel work, and never deploy a bundle that accidentally includes another chat's unfinished changes.
- When live behavior matters, verify live before assuming local state is enough.

## Stability First

- Start by checking `git status --short` and identify unrelated local changes.
- Never revert or stage unrelated user changes unless the user explicitly asks.
- Keep edits scoped to the user's request and the existing project patterns.
- If any check fails, stop before push or deploy and report the failure.

## Required Release Order

Use this order for finished work that should leave the machine:

1. Inspect local state: `git status --short`.
2. Implement the change.
3. Run validation:
   - `npm run check`
   - targeted Playwright/API tests for the touched area
   - `npm run qa:browser` for UI flows
   - `npx playwright test --config=qa/playwright.config.mjs --project=api-contracts` for API/data changes
4. Stage only intended files.
5. Commit with a clear message.
6. Run the deploy gate before pushing when possible: `RELEASE_ALLOW_UNPUSHED=1 npm run release:gate`.
7. Push the branch.
8. Re-run preflight after push: `npm run release:preflight`.
9. Deploy only after the gate and push are green: `npx --yes vercel@53.2.0 deploy --prod --yes`.
10. Verify production: `npm run release:postdeploy`.
11. Report the commit, push, deployment URL, and verification result.

For the automated local flow, prefer:

```bash
npm run release:auto -- --stage-all --commit "type: concise message" --push --deploy
```

If there are unrelated local changes, do not use `--stage-all`; stage the intended files manually, then run:

```bash
npm run release:auto -- --commit "type: concise message" --push --deploy
```

## Deployment Safety

- Do not deploy from a dirty working tree.
- Prefer the GitHub `Production Deploy` workflow for normal production releases after `QA` passes on `main`.
- Do not use emergency overrides unless the user explicitly confirms an urgent hotfix.
- Do not put secrets in source files. Vercel/GitHub/Supabase secrets stay in their respective dashboards.
- After deployment, verify the live domain and protected backup endpoint through `npm run release:postdeploy`.
