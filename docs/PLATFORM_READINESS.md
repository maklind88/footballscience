# Platform Readiness

Platform Readiness is the operating contract for building Football Science without making Live fragile.

The product owner describes the desired Live result. The technical workflow must keep the platform safe through a shared map, isolated staging, verified secrets, module contracts, design consistency, and production observability.

## Readiness Dashboard

Platform Admins can open Admin and see the Platform Readiness panel. It reads from `/api/platform-readiness`, which is protected by the central API guard and the Permission Matrix.

The dashboard shows:

- Platform identity: canonical organizations, clubs, teams, memberships, tenant links, and migration checkpoints.
- Workspace hygiene: local changes must be intentional before release.
- Platform map: current modules, implementation stage, data ownership, future tables, and API routes.
- Staging mirror: separate staging host, staging QA login, and staging Supabase project.
- Accounts and secrets: Vercel, Supabase, live QA, cron/backup secrets, and release tokens.
- Module standard: permissions, Data Safety Contract, tenant scope, tests, and migration direction.
- Design system: shared light/dark/auto, components, spacing, loading, empty, and error states.
- Observability: deploy failures, API failures, slow routes, failed saves, backup/restore health, auth/permission spikes, and frontend performance.

The dashboard never exposes secret values. It reports only whether a required variable is present or missing.

## Required External Setup

Production release should have these configured outside source code:

- GitHub Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `LIVE_QA_USERNAME`, `LIVE_QA_PASSWORD`, `CRON_SECRET`
- GitHub Variables: `LIVE_QA_BASE_URL`, `SUPABASE_PROJECT_REF`
- Vercel Production Environment: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Supabase migration secrets: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`

Staging should be a separate mirror:

- GitHub Variables: `STAGING_QA_BASE_URL`, `STAGING_SUPABASE_PROJECT_REF`, optional `STAGING_BRANCH_ALIAS`
- GitHub Secrets: `STAGING_QA_USERNAME`, `STAGING_QA_PASSWORD`
- Vercel Preview Environment: staging Supabase URL/anon/service-role values pointing at the staging project, not production

## Module Standard

Every new module must include:

- Stable module id in `src/core/platform-contracts.mjs`
- Data ownership and future tables in the platform map
- Data Safety Contract for every protected storage key
- Permission Matrix rules for read/write/delete/export/restore/admin/observe
- API route registration in `apiRouteSecurity` before protected route work
- Tenant scope using `organizationId` and, when applicable, `teamId`
- Automated contract test in `qa/*`
- Design states for loading, empty, error, and disabled access
- Migration path from legacy app-state to server-owned persistence

## Verification

Run:

```bash
npm run platform:readiness
npm run qa:contracts
npm run check
```

`npm run qa` includes the readiness contract so future changes cannot quietly remove the map, API, observability signals, or module standards.
