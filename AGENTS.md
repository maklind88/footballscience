# Codex Project Rules

These rules apply to every Codex chat working in this repository.

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
