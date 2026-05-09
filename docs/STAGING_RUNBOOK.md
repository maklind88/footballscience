# Staging Runbook

Staging must be isolated from production. It may use the same codebase and Vercel project, but it must not use the production Supabase project, production test account, or production domain as its data target.

## Contract

- Production: `main` branch, `footballscience.xyz`, production Supabase project.
- Staging: `staging` branch or manual staging workflow, Vercel Preview deployment, separate staging Supabase project.
- Localhost: local dev auth and browser cache only. It must not point at live Supabase/Postgres.

The guardrail is:

```bash
npm run verify:staging-env
npm run verify:local-isolation
```

`verify:staging-env` fails when staging points at the production host or when `STAGING_SUPABASE_PROJECT_REF` equals `SUPABASE_PROJECT_REF`.

## Required GitHub Values

Repository variables:

```text
STAGING_SUPABASE_PROJECT_REF
STAGING_QA_BASE_URL
```

Repository secrets:

```text
STAGING_QA_USERNAME
STAGING_QA_PASSWORD
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

Optional but recommended for remote migration verification:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_PASSWORD
```

## Vercel Preview Environment

Create branch-scoped Preview variables for the `staging` branch only:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_PROJECT_REF
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

These values must point at the staging Supabase project, not production.

## Release Flow

1. Merge or push a release candidate to `staging`.
2. GitHub runs local QA.
3. If staging secrets are present, GitHub deploys a Vercel Preview.
4. GitHub runs authenticated staging smoke against the preview URL or `STAGING_QA_BASE_URL`.
5. Only after staging passes should the change move to `main`.

## Commands

```bash
npm run qa
npm run qa:staging
npm run qa:staging:required
```

`qa:staging` skips when credentials are missing. `qa:staging:required` fails loudly when staging is not fully configured.
