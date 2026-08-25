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

## Required Leaderboard staging smoke

Run this only after the Leaderboard migration has been applied to the isolated staging Supabase project:

```bash
npm run qa:staging:leaderboard:required
```

Required repository variables:

```text
STAGING_QA_BASE_URL
STAGING_SUPABASE_PROJECT_REF
SUPABASE_PROJECT_REF
LEADERBOARD_STAGING_QA_TEAM_ID
```

Use a staging coach/admin account with active membership for that exact Platform team. Prefer these dedicated repository secrets:

```text
LEADERBOARD_STAGING_QA_USERNAME
LEADERBOARD_STAGING_QA_PASSWORD
```

When the generic staging account already has Leaderboard write access, the runner accepts this existing pair instead:

```text
STAGING_QA_USERNAME
STAGING_QA_PASSWORD
```

The smoke fails closed if isolation, credentials, manager role, active team, server roster, or an eligible player is missing. It creates one run-unique current-month point award, proves idempotent retry and the read model, then reverses it. No rows are deleted; staging keeps only the clearly named reversed event, reversal transaction, and append-only audit trail.

Run only one mutable Leaderboard staging smoke at a time for a target team (the dedicated config uses one worker). Each run owns one anchored UTC timestamp plus 80-bit random run id, repeated exactly in its QA title and note. Before writing, the smoke reverses only active positive award events whose title/note carry that same canonical id, whose read scope and event team match the configured team, and whose run and event are at least 30 minutes old. Fresh runs, mismatched/lookalike markers, reversed events, and ordinary coach events are never swept. This bounded stale-run recovery covers a previous worker/process kill while avoiding another active run. Use a dedicated staging account/team when CI jobs could otherwise overlap.

The runner forwards only the minimum public QA configuration and the selected QA credential pair to Playwright. Database URLs/passwords, Supabase service-role/access tokens, production credentials, Vercel tokens, and unknown environment keys are excluded. The dedicated config disables trace, video, screenshots, and HAR capture. Authenticated API probes and cleanup use a redacting native-fetch boundary so bearer headers are never passed to Playwright request logging.
