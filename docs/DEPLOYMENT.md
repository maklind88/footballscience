# Deployment

Football Science is deployed to Vercel and aliased to `footballscience.xyz`.

## Deploy

From `/Users/maklind/Documents/New project`:

### Automated Safe Flow

For normal Codex-driven releases, use the project release automation:

```bash
npm run release:auto -- --stage-all --commit "fix: concise message" --push --deploy
```

If unrelated local changes exist, stage only the intended files first and omit `--stage-all`:

```bash
git add <intended-files>
npm run release:auto -- --commit "fix: concise message" --push --deploy
```

The script runs QA before pushing, pushes the current branch, runs the release gate, deploys to Vercel production, and runs postdeploy verification. It stops before deployment if the working tree is dirty or any check fails.

### Manual Flow

Use the manual flow only when you need direct control over a release step:

```bash
npm run release:gate
```

`release:gate` runs the release preflight, the production safety gate, and then the full QA deploy gate. It blocks normal releases when:

- the working tree has uncommitted changes
- the branch is behind its upstream
- local commits have not been pushed to GitHub
- the release is not running from `main`
- the `staging` branch does not contain the exact same code tree as the production candidate
- staging and production URLs or Supabase refs are missing or point to the same backend
- authenticated staging/live QA credentials are missing

Emergency overrides exist for hotfixes only:

```bash
RELEASE_ALLOW_DIRTY=1 RELEASE_ALLOW_UNPUSHED=1 RELEASE_ACK_EMERGENCY=1 npm run release:gate
```

Only deploy after the gate passes:

```bash
npx --yes vercel@53.2.0 deploy --prod --yes
```

Copy the deployment URL returned by Vercel.

After Vercel reports `READY`, run:

```bash
npm run release:postdeploy
```

This verifies the live domain, `app.js`, `/api/client-config`, and that `/api/app-state-backup` plus `/api/app-state-backup-status` are not anonymously accessible.

## CI Gate

GitHub Actions runs `npm run qa` on pushes to `main` and pull requests through `.github/workflows/qa.yml`.

The same workflow also runs:

- `npm run release:preflight`
- `npm run security:audit`

`npm run qa` also runs `npm run qa:supabase`, a static migration safety gate that checks ordering, destructive SQL, RLS, default grants, and `security definer` guardrails for every file in `supabase/migrations`.

CodeQL runs through `.github/workflows/codeql.yml`, and Dependabot is configured in `.github/dependabot.yml` for npm and GitHub Actions updates.

Production deploys are CI-driven through `.github/workflows/production-deploy.yml`. The workflow starts after the `QA` workflow succeeds on `main`, requires the staging and production safety configuration, verifies staging smoke, deploys through Vercel CLI, runs `npm run release:postdeploy`, and then runs authenticated live QA. Manual dispatch uses the same gates.

Production deploys must fail closed when required secrets or staging isolation are missing. Do not fall back to an ungated production deploy path.

Automatic Vercel Git production builds are blocked by `vercel.json` through `scripts/vercel-ignore-build.mjs`. Preview/staging builds continue, but production must go through the gated GitHub workflow or an explicitly acknowledged emergency path.

Required GitHub repository secrets for CI deploy:

```bash
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
LIVE_QA_USERNAME
LIVE_QA_PASSWORD
STAGING_QA_USERNAME
STAGING_QA_PASSWORD
```

Required GitHub repository variables:

```bash
LIVE_QA_BASE_URL  # defaults to https://footballscience.xyz
STAGING_QA_BASE_URL
SUPABASE_PROJECT_REF
STAGING_SUPABASE_PROJECT_REF
```

Remote Supabase migration verification lives in `.github/workflows/supabase-migrations.yml`. It runs automatically when migration files are pushed to `main`, and it can be started manually from GitHub Actions. Required secure configuration:

If the remote Supabase credentials are not configured yet, the workflow still runs the local migration safety gate and then exits successfully with a clear notice that remote verification was skipped.

```bash
SUPABASE_ACCESS_TOKEN  # GitHub secret
SUPABASE_DB_PASSWORD   # GitHub secret
SUPABASE_PROJECT_REF   # GitHub repository variable
```

The remote gate runs:

```bash
npm run qa:supabase
npm run qa:supabase:remote
```

`qa:supabase:remote` links the CI runner to the target Supabase project, lists local vs remote migrations, runs linked database linting, and runs `supabase db push --dry-run`. Do not put these values in source files.

Authenticated live smoke requires a dedicated test account and these CI/local environment variables:

```bash
LIVE_QA_USERNAME
LIVE_QA_PASSWORD
LIVE_QA_BASE_URL
```

`LIVE_QA_BASE_URL` defaults to `https://footballscience.xyz`.

Production monitoring runs through `.github/workflows/production-smoke.yml` under the GitHub Actions name `Production Monitor`. It runs every six hours and can also be started manually. The monitor runs `npm run release:monitor`, which verifies the live domain/API, checks that the latest app-state backup pointer matches a real Supabase Storage backup, verifies sanitized restore-readiness metadata for every protected module key, and then runs authenticated live smoke. It fails clearly if the live QA or cron secrets are missing.

The release process is protected by `npm run release:rules`. This rule check is part of `npm run qa` and fails if the staging deploy, production deploy, production monitor, rollback workflow, or Vercel production-build blocker are removed or weakened.

## Rollback

Use rollback only when live production is broken and the safest action is to restore a known-good Vercel deployment.

Preferred rollback path:

1. Open GitHub Actions.
2. Start `Production Rollback`.
3. Paste the known-good Vercel deployment URL or deployment id.
4. Type `ROLLBACK` in the confirmation field.
5. Wait for rollback, postdeploy verification, and authenticated live smoke to pass.

The rollback workflow uses:

```bash
npx --yes vercel@53.2.0 rollback <deployment-url-or-id> --yes --timeout=5m
npm run release:postdeploy
npm run qa:live:required
```

If a rollback follows a data migration, restore data only after code rollback is verified and only from a known-good Supabase backup/snapshot. Code rollback first; data restore second.

## Alias To Domain

```bash
npx vercel alias set <deployment-url>.vercel.app footballscience.xyz
```

## Verify

Use a cache-busting URL:

```bash
curl -I "https://footballscience.xyz?verify=YYYYMMDD-HHMM"
```

```bash
curl https://footballscience.xyz/api/client-config
```
should now also return:

```json
{"ok":true,"url":"...","anonKey":"...","hasServiceRoleKey":true}
```

`hasServiceRoleKey` must be `true` for user creation, role lookup, and password reset to work.
If it is `false`, add `SUPABASE_SERVICE_ROLE_KEY` in Vercel and redeploy.

To compare live JavaScript with local:

```bash
curl --http1.1 -L "https://footballscience.xyz/app.js?verify=YYYYMMDD-HHMM" -o /private/tmp/live_app.js -w "%{http_code} %{size_download}\n"
shasum -a 256 /private/tmp/live_app.js app.js
```

If hashes match but the browser still shows old behavior, the cause is probably browser cache or localStorage data. Session Planner currently uses `football-session-planner-v3`.

The backup endpoint must be protected anonymously:

```bash
curl -i https://footballscience.xyz/api/app-state-backup
curl -i https://footballscience.xyz/api/app-state-backup-status
```

Expected without auth:

```json
{"ok":false,"reason":"Admin sign-in or Vercel cron secret required."}
```

## Daily App-State Backups

`vercel.json` schedules a daily production cron:

```json
{
  "path": "/api/app-state-backup",
  "schedule": "0 8 * * *"
}
```

Required production environment variable:

```bash
CRON_SECRET
```

When the cron runs, `/api/app-state-backup` writes timestamped Supabase Storage objects under `backups/app-state/` and updates `backups/app-state/latest.json`.

`/api/app-state-backup-status` is read-only and returns only metadata about the latest pointer and backup object. Vercel rewrites it to `/api/app-state-backup?mode=status`, so the check does not add another serverless function. Production monitor calls it with `CRON_SECRET` and fails if the backup is stale, missing, or does not match the pointer hash.

## Current Hosting Notes

- Domain: `footballscience.xyz`
- Vercel project name has been `footballscience`.
- Previous deployment/alias flow worked with Vercel CLI.

## Supabase central setup (för inloggning från alla datorer)

### 1) Lägg in miljövariabler i Vercel (obligatoriskt)

**Viktigt:** `postgresql://...`-strängen som står under *Connection string* används för SQL-klienter (psql) och går inte i frontend/JS-API:t.

Din app läser **bara** dessa variabler:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

I Vercel-projektet `footballscience`, lägg till dessa miljövariabler för **Production**, **Preview** och **Development**:

```bash
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Värden:
- `SUPABASE_URL` = `https://<DITT_SUPABASE_PROJECT_REF>.supabase.co`
- `SUPABASE_ANON_KEY` = `anon`-nyckeln från Supabase → **Settings → API** → **Project URL** och **anon public**
- `SUPABASE_SERVICE_ROLE_KEY` = `service_role`-nyckeln från samma vy

`SUPABASE_SERVICE_ROLE_KEY` behövs för admin-funktioner (`admin-users`, användaruppslag för username-login, skicka lösenord osv.). Om den saknas kommer inloggning med användarnamn ofta att missa.

### 2) Lägg in rätt URL:er i Supabase

I Supabase → **Authentication** → **URL Configuration**:
- **Site URL**: `https://footballscience.xyz`
- **Redirect URLs**:
  - `https://footballscience.xyz`
  - `https://footballscience.xyz/*`
  - `https://footballscience-one.vercel.app`
  - `https://footballscience-one.vercel.app/*`

(Lägg gärna även `https://footballscience-one.vercel.app` under redirect om du använder preview/test-länkar också.)

### 3) Verifiera från server-sidan

```bash
curl https://footballscience.xyz/api/client-config
```

Skall svara:

```json
{"ok":true,"url":"...","anonKey":"..."}
```

Om du fortfarande får `Missing SUPABASE_URL or SUPABASE_ANON_KEY` är miljövariablerna inte rätt inlagda eller så har deployment inte uppdaterats.

### 4) Ny deployment efter ändring

Varje ändring i kod måste deployas:

```bash
npx vercel --prod --yes
```

### 5) Testa inloggning från annan dator

1. Öppna exakt samma URL som kollegan använder.
2. Logga in med `Email or Username` + lösenord (säg helst e-post först om de inte får första gången).
3. Om det fortfarande misslyckas, testa att öppna `/api/client-config` i samma webbläsare och se att det svarar `ok:true`.
