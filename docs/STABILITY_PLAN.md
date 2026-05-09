# Stability Plan

This is the working rule for Football Science: training content must not disappear when the browser refreshes, when the app deploys, or when another machine opens the site.

## Protected Content

Treat these as protected product data:

- Schedule
- Session Planner and Exercise Library
- Periodization
- Medical Team
- Squad
- Home tasks and staff chat
- Game Simulator sequences and sequence library

## Storage Model

- Production source of truth: Supabase-backed central app state through `/api/app-state`.
- Server backups: `/api/app-state-backup` writes timestamped Supabase Storage backups under `backups/app-state/`.
- Browser storage: fast local cache, autosave surface, and emergency export/import source.
- Data Safety Contract: `src/core/data-safety-contracts.cjs` is the shared registry for module key, scope, merge policy, required fields, revision behavior, audit, and snapshot requirements.
- Data Safety manifest: tracks protected local writes and pending central sync. Local storage is cache-only, never the production source of truth.
- IndexedDB snapshots: local safety net for recent browser-side state.
- Localhost/dev auth: local-only mode for development and QA; it must not call `/api/client-config`.
- Local/live isolation: production env files such as `.vercel/.env.production.local` must not live in the local workspace. `npm run verify:local-isolation` fails QA if local env points at the live Supabase/Postgres backend.

The app must never treat a missing or incomplete sync response as permission to overwrite local protected data with an empty value.
Versioned module writes carry their latest known `baseRevision` from the client. If central state is newer, `/api/app-state` rejects the stale write unless the module contract has an explicit merge strategy that preserves newer data. Writes or deletes with no base revision are rejected once central data exists. The browser write queue clears stale-conflict retries and hydrates the central version back into cache.

For database-backed modules, the same rule moves down into Postgres: mutable rows must carry a `row_version`, writes use compare-and-swap, deletes become soft deletes, and history tables capture enough before/after state for restore drills. Squad now has the first staged guard migration for this pattern.

## QA Gate

Before deployment, run:

```bash
npm run qa
```

This runs:

- `npm run verify:local-isolation`
- `npm run check`
- Static Supabase migration safety checks through `npm run qa:supabase`.
- API contract tests for client config and app-state auth behavior.
- Data Safety contract tests for central pipeline, organization scope, revision metadata, stale-write rejection, and protected key coverage.
- Database guard tests for module migrations that add row versions, soft deletes, hard-delete blocking, and restore history.
- Browser two-tab revision smoke in `qa/central-state-revision.smoke.spec.mjs`.
- Browser smoke tests for Schedule, Periodization, Session Planner, and Medical Team refresh persistence.

For deploy-specific shorthand:

```bash
npm run qa:deploy
```

Optional production smoke:

```bash
LIVE_QA_USERNAME="..." LIVE_QA_PASSWORD="..." npm run qa:live
```

Use only a dedicated test account for this. It creates a test Schedule record, verifies refresh persistence on the live domain, then attempts cleanup.

## Server Backups

Production has a daily Vercel Cron job:

```json
{ "path": "/api/app-state-backup", "schedule": "0 8 * * *" }
```

The endpoint requires one of these:

- `Authorization: Bearer $CRON_SECRET` for Vercel Cron.
- A signed-in admin bearer token for manual runs.

The backup endpoint writes:

- A timestamped full backup: `backups/app-state/YYYY-MM-DD/<timestamp>-<hash>.json`
- A latest pointer: `backups/app-state/latest.json`

## Release Routine

1. Commit the release candidate and push it to the `staging` branch.
2. Let the Staging Deploy workflow run QA and authenticated staging smoke against an isolated staging backend.
3. Move the verified change to `main`.
4. Run `npm run release:gate`. The gate requires `main`, a clean tree, staging/live Supabase isolation, and an `origin/staging` tree that matches the production candidate.
5. For changes under `supabase/migrations`, run `npm run qa:supabase:remote` with secure Supabase credentials or confirm the GitHub Actions Supabase migration workflow passed.
6. Deploy to Vercel only after the gate passes.
7. Run `npm run release:postdeploy`.
8. Start the manual Production Smoke GitHub Action when a release touches auth, app-state, Schedule, or chat.
9. Open a cache-busting live URL and verify the changed behavior.
10. If live looks old, compare deployed `app.js` hash and check browser site data before assuming deployment failed.

Normal releases should not deploy from a dirty or unpushed working tree. `RELEASE_ALLOW_DIRTY=1` and `RELEASE_ALLOW_UNPUSHED=1` are emergency-only hotfix overrides and must be paired with `RELEASE_ACK_EMERGENCY=1`.

Security automation now includes:

- GitHub QA workflow with release preflight and `npm audit --audit-level=high`.
- CodeQL static analysis.
- Dependabot for npm and GitHub Actions.
- Staging Deploy and Staging Smoke workflows with separate `STAGING_*` secrets and Supabase-ref isolation checks.
- Production safety gate that fails closed if staging/live are not isolated or the staging branch does not match the production candidate.
- Release rules verification through `npm run release:rules` so future edits cannot silently remove staging, production monitor, rollback, live smoke, or the Vercel production-build blocker.
- Scheduled Production Monitor every six hours. It runs postdeploy checks and authenticated live smoke against `footballscience.xyz`.
- Manual Production Rollback workflow. It requires the exact deployment URL/id plus `ROLLBACK`, then verifies postdeploy and live smoke after rollback.
- Vercel Git production builds are ignored by default so production uses the gated GitHub workflow instead of an automatic push-to-live path.
- Central app-state content safety that rejects executable user content and prototype-pollution keys before module data is stored.
- Production smoke workflow for live domain/API verification.
- Vercel security headers in `vercel.json`.

## Next Hardening

- Add automated verification that the latest Supabase backup object exists after cron runs.
- Run a restore drill: export, restore, refresh, verify Schedule/Periodization/Sessions/Medical.
- Put the project under a visible git workflow if this folder is not already inside one.
- Keep `docs/PLATFORM_EVOLUTION_PLAN.md`, `docs/MODULE_CONTRACTS.md`, and `qa/platform-safety-contracts.api.spec.mjs` in sync before modular refactors.
