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
- Server backups: `/api/app-state-backup` writes timestamped Supabase Storage backups under `backups/app-state/`; `/api/app-state-backup-status` rewrites to the same backup function and verifies the latest pointer/object hash without exposing backup data.
- Restore readiness: backup status returns a sanitized manifest for every Data Safety key, so monitors can prove each protected module has restore metadata without exposing saved entries.
- Restore drill: `/api/app-state-backup?mode=restore-drill` performs a read-only server-side parse of the latest backup entries, verifies manifest hashes/byte counts, and reports only metadata. It never writes restored state and never exposes raw entries.
- Browser storage: fast local cache, autosave surface, and emergency export/import source.
- Data Safety Contract: `src/core/data-safety-contracts.cjs` is the shared registry for module key, scope, merge policy, required fields, revision behavior, audit, and snapshot requirements.
- Data Safety manifest: tracks protected local writes and pending central sync. Local storage is cache-only, never the production source of truth.
- IndexedDB snapshots: local safety net for recent browser-side state.
- Localhost/dev auth: local-only mode for development and QA; it must not call `/api/client-config`.
- Local/live isolation: production env files such as `.vercel/.env.production.local` must not live in the local workspace. `npm run verify:local-isolation` fails QA if local env points at the live Supabase/Postgres backend.
- Security control plane: `src/core/permission-matrix.cjs`, `api/_lib/platform-security.js`, and `public.platform_permission_matrix` define one backend-owned permission model for every module. UI may hide actions, but backend/API/RLS must enforce them.
- Structured incident events: guarded API routes emit `footballscience-api-security-event-v1` logs for rate limits, permission denials, auth failures, API failures, and request latency.

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
- Platform security control-plane checks through `npm run security:platform`.
- API contract tests for client config and app-state auth behavior.
- Data Safety contract tests for central pipeline, organization scope, revision metadata, stale-write rejection, and protected key coverage.
- Permission Matrix tests for backend read/write/delete/export/restore rules and guarded API route coverage.
- Database guard tests for module migrations that add row versions, soft deletes, hard-delete blocking, and restore history.
- Browser two-tab revision smoke in `qa/central-state-revision.smoke.spec.mjs`.
- Browser smoke tests for Schedule, Periodization, Session Planner, and Medical Team refresh persistence.

For deploy-specific full QA shorthand:

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

Production Monitor runs `npm run release:backup`, `npm run release:restore-readiness`, and `npm run release:restore-drill` as part of `npm run release:monitor`. The checks fail if the latest pointer is missing, stale, does not match the backup object's content hash, lacks restore metadata for any protected Data Safety key, or cannot parse every present backup entry without writing data.

## Release Routine

Use the current deploy agreement:

- `Deploy` and `Deploy fast` use `npm run deploy` unless the change is risky.
- `Deploy safe` uses `npm run deploy:safe`.
- Do not auto-deploy when work is merely finished.
- Stop before deploy if the release would include unrelated or unfinished work from another chat.

Fast routine:

1. Inspect `git status --short`.
2. Run focused validation for the touched area.
3. Commit intended files only.
4. Run `npm run deploy`.
5. Verify production through `npm run release:postdeploy` and visible live behavior.

Safe routine for auth, app-state/data, Supabase/API, backup/restore, migrations, security, or broad multi-module changes:

1. Commit the release candidate and push it to the `staging` branch when staging proof is required.
2. Let the Staging Deploy workflow run QA and authenticated staging smoke against an isolated staging backend.
3. Move the verified change to `main`.
4. Run `npm run deploy:safe`.
5. For changes under `supabase/migrations`, run `npm run qa:supabase:remote` with secure Supabase credentials or confirm the GitHub Actions Supabase migration workflow passed.
6. Run `npm run release:postdeploy`.
7. Start the manual Production Smoke GitHub Action when a release touches auth, app-state, Schedule, or chat.
8. Open a cache-busting live URL and verify the changed behavior.
9. If live looks old, compare deployed `app.js` hash and check browser site data before assuming deployment failed.

Normal releases should not deploy from a dirty or unpushed working tree. `RELEASE_ALLOW_DIRTY=1` and `RELEASE_ALLOW_UNPUSHED=1` are emergency-only hotfix overrides and must be paired with `RELEASE_ACK_EMERGENCY=1`.

Security automation now includes:

- GitHub QA workflow with release preflight and `npm audit --audit-level=high`.
- CodeQL static analysis.
- Dependabot for npm and GitHub Actions.
- Staging Deploy and Staging Smoke workflows with separate `STAGING_*` secrets and Supabase-ref isolation checks.
- Manual-only Production Deploy workflow, dispatched by `npm run deploy:safe` or by an intentional GitHub workflow dispatch, so successful `main` QA does not automatically publish live.
- Production safety gate that fails closed if staging/live are not isolated or the staging branch does not match the production candidate.
- Release rules verification through `npm run release:rules` so future edits cannot silently remove staging, production monitor, rollback, live smoke, or the Vercel production-build blocker.
- Platform security verification through `npm run security:platform` so future routes, modules, and database tables cannot silently bypass tenant scope, the permission matrix, rate limits, or security observability.
- Postdeploy verifies the live `/app.js` SHA-256 hash against the release checkout so stale Vercel/browser assets cannot pass as a successful deploy.
- Scheduled Production Monitor every six hours. It runs postdeploy checks and authenticated live smoke against `footballscience.xyz`.
- Production Incident Alert workflow opens or updates a GitHub issue when `main` QA, Supabase migrations, production deploy, production monitor, or rollback fails.
- Restore-readiness monitoring verifies that latest app-state backup metadata covers every protected module key while keeping raw backup entries private.
- Restore-drill monitoring verifies the latest backup can be parsed module-by-module without exposing entries or writing restored data.
- Manual Production Rollback workflow. It requires the exact deployment URL/id plus `ROLLBACK`, then verifies postdeploy and live smoke after rollback.
- Vercel Git production builds are ignored by default so production uses project deploy commands or the safe GitHub workflow instead of an automatic push-to-live path.
- Central app-state content safety that rejects executable user content and prototype-pollution keys before module data is stored.
- Production smoke workflow for live domain/API verification.
- Vercel security headers in `vercel.json`.

## Next Hardening

- Run a full isolated restore: restore a verified backup into a disposable staging environment, refresh, verify Schedule/Periodization/Sessions/Medical, then destroy it.
- Put the project under a visible git workflow if this folder is not already inside one.
- Keep `docs/PLATFORM_EVOLUTION_PLAN.md`, `docs/MODULE_CONTRACTS.md`, and `qa/platform-safety-contracts.api.spec.mjs` in sync before modular refactors.
